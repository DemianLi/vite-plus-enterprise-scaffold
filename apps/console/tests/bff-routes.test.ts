import { describe, it, expect } from "vitest";
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
});
