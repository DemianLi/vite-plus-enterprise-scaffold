import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { registerFeatures } from "@org/slice-kit";

import { features } from "../src/features.ts";
import { routes, extraPermissions } from "../bff-routes.ts";

/**
 * 這個 app 的 dev 資料端點與它的**接線**（#95 的阻斷級 ②a）。
 *
 * ── 為什麼要有這一支 ────────────────────────────────────────────────
 *
 * `bff-routes.ts` 是被 `platform/bff-mock` 的 CLI **動態載入**的，
 * 而載入的路徑寫在根 `package.json` 的 script 裡。也就是說這個檔案
 * 沒有任何 import 指向它 —— 檔名打錯、script 改壞、檔案被搬走，
 * 三種情況的症狀都一樣：`vpr bff` 照常啟動，端點安靜地不存在。
 *
 * 所以下面那條斷言**從 `package.json` 把路徑讀出來再載入一次**，
 * 而不是比對一個寫死的字串 —— 比對字面值的話，兩邊一起改錯還是綠的。
 */

const ROOT = join(import.meta.dirname, "../../..");

/** 從 `bff` script 裡取出 `BFF_MOCK_ROUTES=` 後面那一段。 */
function wiredRoutesPath(): string {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const script = manifest.scripts["bff"] ?? "";
  const assignment = script.split(" ").find((word) => word.startsWith("BFF_MOCK_ROUTES="));
  return (assignment ?? "").slice("BFF_MOCK_ROUTES=".length);
}

/** dev 真的在用的 BFF 前綴 —— `.env.example` 是它在版控裡唯一的來源。 */
function apiBasePath(): string {
  const env = readFileSync(join(import.meta.dirname, "../.env.example"), "utf8");
  const line = env.split("\n").find((row) => row.startsWith("VITE_API_BASE_PATH="));
  return (line ?? "").slice("VITE_API_BASE_PATH=".length).trim();
}

/**
 * 每一片切片的 `api.ts` 裡 `http.get(\`/xxx…\`)` 的路徑字面前綴（查詢字串與樣板插值之前那一段）。
 * 只取 GET：寫入端點的示範由 `bff-routes.ts` 注入，上面那幾條在守。
 */
function sliceListPaths(): readonly { readonly slice: string; readonly path: string }[] {
  const base = apiBasePath();
  return features.flatMap((feature) => {
    const source = readFileSync(join(ROOT, "features", feature.name, "src/api.ts"), "utf8");
    return [...source.matchAll(/http\.get<[^>]*>\(\s*[`"'](\/[^`"'$?]+)/g)].map((match) => ({
      slice: feature.name,
      path: `${base}${match[1] ?? ""}`,
    }));
  });
}

describe("apps/console 的 dev 資料端點", () => {
  it("★ 根 package.json 的 `bff` script 真的指向這個檔案", async () => {
    const wired = wiredRoutesPath();
    expect(wired, "`bff` script 沒有設 BFF_MOCK_ROUTES —— 端點不會被載入").not.toBe("");

    // 載得起來才算數：路徑存在、而且匯出的是同一組路由。
    //
    // 動態 import 的豁免理由與 platform/bff-mock/src/cli.ts 同一條：路徑取自
    // 這個 repo 自己的 package.json，而這是一支測試。
    // eslint-disable-next-line no-unsanitized/method
    const loaded = (await import(pathToFileURL(join(ROOT, wired)).href)) as {
      routes: typeof routes;
    };
    expect(loaded.routes.map((route) => route.path)).toEqual(routes.map((route) => route.path));
  });

  it("每一條路由都有載入端要求的形狀（path 字串 ＋ handle 函式）", () => {
    // 這個檔案刻意不 import @org/bff-mock 的型別（理由見它的檔頭），
    // 所以形狀沒有編譯期檢查。CLI 會在啟動時擋，這裡讓它在測試就擋。
    for (const route of routes) {
      expect(typeof route.path).toBe("string");
      expect(route.path.startsWith("/api/")).toBe(true);
      expect(typeof route.handle).toBe("function");
    }
  });

  it("★ 追加的權限碼都真的有切片在用", () => {
    // 死掉的權限碼比缺一個更難查：mock 發得出來，但沒有任何畫面在讀它。
    const declared = new Set(registerFeatures(features).permissions);
    for (const permission of extraPermissions) {
      expect(declared.has(permission), `沒有任何切片宣告 ${permission}`).toBe(true);
    }
  });

  it("★ 取消訂單那條路由守的權限碼，仍然是 features/order 宣告的那一個", () => {
    // 切片改了權限碼而這裡沒跟上的話，症狀是本機一直 403 ——
    // 而那看起來像權限設定的問題，不像接線的問題。
    const cancel = routes.find((route) => route.path.endsWith("/cancel"));
    expect(cancel).toBeDefined();

    const reply = cancel?.handle({
      params: { id: "ORD-1001" },
      query: new URLSearchParams(),
      body: undefined,
      permissions: registerFeatures(features).permissions,
    });
    expect(reply).toEqual({ status: 204 });
  });

  it("權限不足時是 403，不是靜靜地成功", () => {
    const cancel = routes.find((route) => route.path.endsWith("/cancel"));
    const reply = cancel?.handle({
      params: { id: "ORD-1001" },
      query: new URLSearchParams(),
      body: undefined,
      permissions: ["order:read"],
    });
    expect(reply).toMatchObject({ status: 403 });
  });

  /**
   * 🔴 把 403 說的「我要這個權限」與 `extraPermissions` 補的那一個綁起來。
   *
   * ── 上面那條「追加的權限碼都真的有切片在用」守不到什麼 ──────────────
   *
   * 它跑的是 `for (const permission of extraPermissions)`。
   * **`extraPermissions` 變成 `[]` 的話，那個迴圈跑 0 次、測試通過** ——
   * 它驗的是「宣告的都有人用」，不是「該宣告的都宣告了」，而後者才是
   * 這個常數存在的理由（見 `bff-routes.ts`：少了它，取消那條路由永遠 403）。
   *
   * 所以這一條的來源不是寫死的字串，是**路由自己在 403 裡說的那個權限碼** ——
   * 兩邊一起改，它仍然對得上；只改一邊，它就紅。順帶它也守住了 403 的
   * `body`：`toMatchObject({ status: 403 })` 看不到 body 被清空。
   *
   * ⚠️ #136 的突變測試掉出來的（#145 其三）。
   */
  it("🔴 extraPermissions 補的就是 403 說它要的那一個", () => {
    const cancel = routes.find((route) => route.path.endsWith("/cancel"));
    const denied = cancel?.handle({
      params: { id: "ORD-1001" },
      query: new URLSearchParams(),
      body: undefined,
      permissions: [],
    }) as { status: number; body: { error: string; required: string } };

    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("forbidden");
    expect(typeof denied.body.required).toBe("string");
    expect(denied.body.required).not.toBe("");
    expect(extraPermissions).toContain(denied.body.required);
  });

  /**
   * ★ 切片宣告的每一個權限碼，`vpr bff` 起來的 session 都拿得到。
   *
   * 來源刻意是**跑起來的 mock**，不是抄一份 `MOCK_PERMISSIONS`：這個 app 不能
   * import `@org/bff-mock`（見 `bff-routes.ts` 檔頭），而抄字面的話兩邊一起改錯
   * 仍然綠。所以走根 `package.json` 那條 `bff` script 同一條路啟動 CLI，
   * 讀它回的 `/api/session`。缺的症狀是那片切片在本機永遠 403，沒有東西會說話 ——
   * 第三片切片加進來那天（#260）`invoice:read` 就是這樣缺了一整天（#309）。
   */
  it("★ 切片宣告的每一個權限碼，vpr bff 起來的 session 都拿得到", async () => {
    const child = spawn(process.execPath, ["platform/bff-mock/src/cli.ts"], {
      cwd: ROOT,
      env: { ...process.env, BFF_MOCK_ROUTES: wiredRoutesPath(), BFF_MOCK_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const origin = await new Promise<string>((resolve, reject) => {
        let output = "";
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          const found = /\[bff-mock\] (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
          if (found?.[1] !== undefined) resolve(found[1]);
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("exit", (code) =>
          reject(new Error(`mock 沒起來就結束了（exit ${String(code)}）\n${output}`)),
        );
      });

      const response = await fetch(`${origin}/api/session`, { method: "POST" });
      const session = (await response.json()) as { permissions: readonly string[] };
      const granted = new Set(session.permissions);

      for (const permission of registerFeatures(features).permissions) {
        expect(granted.has(permission), `切片宣告了 ${permission}，而 mock session 沒有它`).toBe(
          true,
        );
      }
    } finally {
      child.kill();
    }
  }, 20_000);

  /**
   * ★ 每一片切片的列表打的路徑，`vpr bff` 起來的 mock 都接得住。
   *
   * 規格餵的是 in-memory gateway，不碰 mock —— 所以規格全綠證明不了畫面看得見。
   * 第三片切片進樹（#260）之後 `/api/invoice` 缺了一整輪，列表停在 loading，
   * 沒有東西會紅（#311；`features/invoice/src/api.ts` 檔頭警告的正是這件事）。
   *
   * 路徑刻意**不寫字面**：抄一份 `["/api/orders", …]` 的話，第四片加進來時這裡照樣綠 ——
   * 與上一條讀 `/api/session` 不抄 `MOCK_PERMISSIONS` 同一個理由。切片的 gateway 不在
   * 它的公開契約裡（D7 只 export 一個 default），所以從 `features` 名單解析每片的
   * `api.ts`，取 `http.get` 的路徑字面前綴；前綴 `/api` 讀 `.env.example`，那是 dev 真的在用的值。
   */
  it("★ 每一片切片的列表打的路徑，vpr bff 起來的 mock 都接得住", async () => {
    const targets = sliceListPaths();
    for (const feature of features) {
      expect(
        targets.some((target) => target.slice === feature.name),
        `${feature.name} 的 api.ts 裡找不到任何 http.get —— 解析式失效了，不是切片沒在打`,
      ).toBe(true);
    }

    const child = spawn(process.execPath, ["platform/bff-mock/src/cli.ts"], {
      cwd: ROOT,
      env: { ...process.env, BFF_MOCK_ROUTES: wiredRoutesPath(), BFF_MOCK_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const origin = await new Promise<string>((resolve, reject) => {
        let output = "";
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          const found = /\[bff-mock\] (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
          if (found?.[1] !== undefined) resolve(found[1]);
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("exit", (code) =>
          reject(new Error(`mock 沒起來就結束了（exit ${String(code)}）\n${output}`)),
        );
      });

      // 資料端點在 401 閘門之後；Node 的 fetch 不帶 cookie，自己帶。
      const login = await fetch(`${origin}/api/session`, { method: "POST" });
      const cookie = (login.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");

      for (const target of targets) {
        const response = await fetch(`${origin}${target.path}`, { headers: { Cookie: cookie } });
        expect(
          response.status,
          `${target.slice} 打 ${target.path}，mock 回 ${String(response.status)} —— 這片在本機停在 loading`,
        ).toBe(200);
        const body = (await response.json()) as { items?: unknown };
        expect(Array.isArray(body.items), `${target.path} 回的不是列表`).toBe(true);
      }
    } finally {
      child.kill();
    }
  }, 20_000);
});
