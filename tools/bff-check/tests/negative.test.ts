import { describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startBffMock } from "@org/bff-mock";
import { buildSecurityHeaders } from "@org/security-headers";
import { CSRF_COOKIE, DEFAULT_ENDPOINTS, DEFAULT_SESSION_COOKIE } from "@org/bff-contract";

/**
 * 契約測試的**反向測試**：逐一破壞 BFF 的行為，確認 `contract.test.ts`
 * 該紅的時候會紅、而且紅在正確的那一條上。
 *
 * ── 為什麼需要這支 ──────────────────────────────────────────────────
 *
 * `contract.test.ts` 全綠只證明 mock 通過了它自己。它不證明那 15 條斷言
 * **有牙齒** —— 一條寫錯的斷言（比對了不存在的欄位、把 `expect` 寫在
 * 非同步分支裡）永遠是綠的，而且看起來和真正有效的斷言一模一樣。
 *
 * D8 的整條路徑（session、CSRF、401／403、登出失效）是這個腳手架的安全面，
 * 「假裝在驗」比「沒有驗」更糟：後者至少沒有人會相信它。
 *
 * ── 怎麼破壞：proxy，不是改原始碼 ──────────────────────────────────
 *
 * 這支測試的前身是一支會**就地竄改 `platform/bff-mock/src/server.ts`
 * 再還原**的腳本。它能動，但跑到一半被中斷的話 repo 就壞著 ——
 * 而且是安靜地壞（`git status` 有 diff，但沒有人在看）。
 *
 * 改成在真的 mock 前面架一層會改寫回應的 proxy：
 *
 *   - **一個檔案都不碰**，中斷了也只是少一個 process
 *   - 破壞的是**行為**而不是程式碼，所以不會隨 mock 的實作細節漂移
 *     （前身用字串比對去換程式碼，mock 一改寫法那條反向測試就靜靜失效了）
 *   - 走的是 `BFF_ORIGIN` —— 契約測試本來就設計成能指向任何 origin，
 *     這裡用的是同一道門，不是新開的後門
 *
 * ── 這支測試自己不能被自己跑到 ──────────────────────────────────────
 *
 * 子行程跑的是 `contract.test.ts`，而且這裡 `skipIf(BFF_ORIGIN)`：
 *
 *   1. 子行程一定帶著 `BFF_ORIGIN`，所以就算被收集到也會整組跳過（防遞迴）
 *   2. 有人拿真的 gateway 驗收時（`BFF_ORIGIN=https://gateway.internal`），
 *      這支**必須**跳過 —— 對別人的正式環境做這些事顯然不行
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const PACKAGE_DIR = resolve(HERE, "..");
const ROOT = resolve(PACKAGE_DIR, "../..");
const VITEST = resolve(ROOT, "node_modules/.bin/vitest");

/** 契約測試共 15 條。全紅代表 proxy 把整台伺服器弄壞了，不是這條 break 生效。 */
const CONTRACT_ITEM_COUNT = 15;

interface Break {
  /** 對回應裡的每一條 Set-Cookie 動手。 */
  readonly setCookie?: (cookie: string) => string;
  /** 對狀態碼動手。 */
  readonly status?: (status: number, body: string, method: string) => number;
  /** 直接吞掉某個請求，不轉給 mock。 */
  readonly swallow?: (method: string, path: string) => boolean;
  /** 拿掉 @org/security-headers 定義的所有標頭。 */
  readonly stripSecurityHeaders?: boolean;
}

interface Running {
  readonly origin: string;
  close(): Promise<void>;
}

/** 這些名字直接從政策本身推導 —— 寫死一份清單就會隨政策漂移。 */
const SECURITY_HEADER_NAMES = Object.keys(buildSecurityHeaders({ reportOnly: true })).map((name) =>
  name.toLowerCase(),
);

function startBreakingProxy(target: string, brk: Break): Promise<Running> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const method = (req.method ?? "GET").toUpperCase();
      const path = req.url ?? "/";

      if (brk.swallow?.(method, path) === true) {
        // 「登出只清 cookie，不刪伺服器端 session」的樣子：
        // 客戶端看起來成功了，而 mock 從頭到尾不知道有人登出過。
        res.writeHead(204, { "Set-Cookie": `${DEFAULT_SESSION_COOKIE}=; Max-Age=0; Path=/` }).end();
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);

      const upstream = await fetch(`${target}${path}`, {
        method,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
        body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
        redirect: "manual",
      });

      const text = await upstream.text();
      const headers: Record<string, string | string[]> = {};

      for (const [name, value] of upstream.headers) {
        if (name.toLowerCase() === "set-cookie") continue;
        if (brk.stripSecurityHeaders === true && SECURITY_HEADER_NAMES.includes(name.toLowerCase()))
          continue;
        headers[name] = value;
      }

      const cookies = upstream.headers.getSetCookie();
      if (cookies.length > 0) {
        headers["set-cookie"] = brk.setCookie === undefined ? cookies : cookies.map(brk.setCookie);
      }

      res.writeHead(brk.status?.(upstream.status, text, method) ?? upstream.status, headers);
      res.end(text);
    })();
  });

  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      done({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((closed) => server.close(() => closed())),
      });
    });
  });
}

interface SuiteResult {
  readonly passed: boolean;
  /** 紅掉的契約條目 id。 */
  readonly failed: readonly string[];
}

/**
 * 對某個 origin 跑一次契約測試。
 *
 * ⚠️ **一定要用非同步的 `spawn`，不能用 `spawnSync`。**
 *
 * mock 與 proxy 都活在**這個** process 裡。`spawnSync` 會把事件迴圈整個凍住，
 * 於是子行程打過來的每一個請求都沒有人回應 —— 兩邊互等到逾時。
 *
 * 第一版就是這樣寫的，症狀是九條測試各自卡滿 60 秒（總共 545 秒），
 * 而錯誤訊息只說「Test timed out」，完全看不出根因。
 */
async function runContractSuite(origin: string): Promise<SuiteResult> {
  // verbose reporter：每條測試各印一行，前面是 ✓ 或 ×，所以逐條屬性拿得到。
  // 預設 reporter 只印摘要，而「哪一條紅了」正是這支測試唯一在乎的事。
  const child = spawn(VITEST, ["run", "tests/contract.test.ts", "--reporter=verbose"], {
    cwd: PACKAGE_DIR,
    env: { ...process.env, BFF_ORIGIN: origin, CI: "1" },
  });

  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));

  const status = await new Promise<number | null>((done) => {
    child.on("close", (code) => done(code));
  });

  const failed = new Set<string>();
  let sawAnyItem = false;

  for (const line of output.split("\n")) {
    const id = /\[([a-z0-9-]+)\]/.exec(line)?.[1];
    if (id === undefined) continue;
    // ✓ 與 × 都要看見 —— 只找 × 的話，「子行程根本沒跑起來」與
    // 「跑了但全綠」會produce 出一模一樣的空清單。第一版就是這樣，
    // 而症狀是連對照組都紅（`--reporter=basic` 在 vitest 4 已移除）。
    if (line.includes("✓") || line.includes("×")) sawAnyItem = true;
    if (line.includes("×")) failed.add(id);
  }

  if (!sawAnyItem) {
    throw new Error(
      `[bff-negative] 子行程沒有跑出任何一條契約測試 —— 這不是「全綠」，是跑不起來。\n` +
        `exit=${String(status)}\n${output.slice(0, 2000)}`,
    );
  }

  return { passed: status === 0, failed: [...failed] };
}

/** 跑一輪：真 mock ＋ 破壞用 proxy ＋ 契約測試。 */
async function runWithBreak(brk: Break): Promise<SuiteResult> {
  const mock = await startBffMock(0);
  const proxy = await startBreakingProxy(mock.origin, brk);
  try {
    return await runContractSuite(proxy.origin);
  } finally {
    await proxy.close();
    await mock.close();
  }
}

const isChildRun = process.env["BFF_ORIGIN"] !== undefined;

describe.skipIf(isChildRun)("契約測試的反向測試（D8 / R6）", () => {
  /**
   * ⚠️ 這一條必須先過，否則下面全部沒有意義。
   *
   * 一個**沒有破壞**的 proxy 必須讓契約測試維持全綠。少了它，
   * 只要 proxy 本身寫錯（漏轉 header、body 沒轉完），下面 8 條都會「成功變紅」——
   * 而紅的原因是 proxy 壞了，不是那條 break 生效。
   */
  it("對照組：不破壞任何東西的 proxy，契約測試維持全綠", async () => {
    const result = await runWithBreak({});
    expect(result.failed).toEqual([]);
    expect(result.passed).toBe(true);
  }, 60_000);

  const BREAKS: readonly {
    readonly what: string;
    readonly expected: readonly string[];
    readonly brk: Break;
  }[] = [
    {
      what: "session cookie 拿掉 HttpOnly",
      expected: ["session-cookie-httponly"],
      brk: {
        setCookie: (cookie) =>
          cookie.startsWith(`${DEFAULT_SESSION_COOKIE}=`)
            ? cookie.replace("; HttpOnly", "")
            : cookie,
      },
    },
    {
      what: "SameSite 從 Lax 改成 None",
      expected: ["session-cookie-samesite"],
      brk: {
        setCookie: (cookie) =>
          cookie.startsWith(`${DEFAULT_SESSION_COOKIE}=`)
            ? cookie.replace("SameSite=Lax", "SameSite=None")
            : cookie,
      },
    },
    {
      what: "Path 限縮成 /admin —— 登出會漏掉其他路徑",
      expected: ["session-cookie-path"],
      brk: {
        setCookie: (cookie) =>
          cookie.startsWith(`${DEFAULT_SESSION_COOKIE}=`)
            ? cookie.replace("Path=/", "Path=/admin")
            : cookie,
      },
    },
    {
      // 這是最常見的「好意」：看到 cookie 就想加 HttpOnly。
      // 而 double-submit 的前提正是前端讀得到這一支。
      what: "CSRF cookie 加上 HttpOnly",
      expected: ["csrf-cookie-readable"],
      brk: {
        setCookie: (cookie) =>
          cookie.startsWith(`${CSRF_COOKIE}=`) ? `${cookie}; HttpOnly` : cookie,
      },
    },
    {
      what: "不檢查 CSRF 標頭（403 一律放行成 200）",
      expected: ["csrf-required", "csrf-mismatch"],
      brk: {
        status: (status, body, method) =>
          status === 403 && body.includes("csrf_failed") && method !== "GET" ? 200 : status,
      },
    },
    {
      what: "登出只清 cookie，不刪伺服器端 session",
      expected: ["logout-server-side"],
      brk: {
        swallow: (method, path) => method === "DELETE" && path === DEFAULT_ENDPOINTS.logout,
      },
    },
    {
      what: "權限不足時回 401，與未登入混為一談",
      expected: ["403-forbidden"],
      brk: {
        status: (status, body) => (status === 403 && body.includes("forbidden") ? 401 : status),
      },
    },
    {
      what: "不送安全標頭",
      expected: ["security-headers"],
      brk: { stripSecurityHeaders: true },
    },
  ];

  for (const { what, expected, brk } of BREAKS) {
    it(`${what} → 契約測試變紅（${expected.join("／")}）`, async () => {
      const result = await runWithBreak(brk);

      expect(result.passed, "契約測試仍然全綠 —— 這條契約沒有牙齒").toBe(false);

      for (const id of expected) {
        expect(
          result.failed,
          `預期 [${id}] 變紅，實際紅的是：${result.failed.join(", ")}`,
        ).toContain(id);
      }

      // 特異性：全部一起紅代表 proxy 把伺服器弄壞了，不是這條 break 生效。
      // 少了這條，一個「回傳 500」的 proxy 可以讓每一條反向測試都通過。
      expect(
        result.failed.length,
        `${result.failed.length} 條同時變紅 —— 這不是精準命中`,
      ).toBeLessThan(CONTRACT_ITEM_COUNT);
    }, 60_000);
  }
});
