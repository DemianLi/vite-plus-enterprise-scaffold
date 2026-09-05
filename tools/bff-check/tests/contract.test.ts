import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startBffMock, type RunningBffMock } from "@org/bff-mock";
import { BASE_DIRECTIVES } from "@org/security-headers";
import {
  API_PREFIX,
  CONTRACT_ITEMS,
  CSRF_COOKIE,
  CSRF_COOKIE_FORBIDDEN_ATTRIBUTES,
  CSRF_HEADER,
  DEFAULT_SESSION_COOKIE,
  SESSION_COOKIE_ALLOWED_SAMESITE,
  SESSION_COOKIE_REQUIRED_ATTRIBUTES,
  SESSION_COOKIE_REQUIRED_PATH,
  endpointsFromEnv,
  findSetCookie,
  isCleared,
} from "@org/bff-contract";

/**
 * D8 同源中間層的驗收測試（R6）。
 *
 * ── 兩種跑法，同一套斷言 ────────────────────────────────────────────
 *
 * 1. 不設任何 env → 對 `@org/bff-mock` 跑。CI 每次執行，證明這份契約是**可實現**的
 *   （一份沒有任何實作通過的規格，通常是一份寫錯的規格）
 *
 * 2. 設 `BFF_ORIGIN` → 對組織既有的 gateway 跑。全綠 ＝ R6 關閉，不需要新程式碼
 *
 *        BFF_ORIGIN=https://gateway.internal \
 *        BFF_SESSION_COOKIE=<你們的 cookie 名> \
 *        BFF_SESSION_VALUE=<從瀏覽器複製的一組有效 session> \
 *        BFF_CSRF_VALUE=<同一組的 XSRF-TOKEN> \
 *        vp run -F @org/bff-contract test
 *
 * ── 對真實 gateway 的誠實限制 ───────────────────────────────────────
 *
 * `POST /api/session` 在真實環境是 OIDC 授權碼流程的終點，**無法**用一支測試
 * 自動走完（那需要 IdP 的登入頁與使用者互動）。所以驗收既有 gateway 時：
 *
 *   - 行為面（401／403／CSRF／登出失效）用 `BFF_SESSION_VALUE` 帶一組真實 session 跑
 *   - 屬性面（HttpOnly／Secure／SameSite）用 `BFF_SET_COOKIE_FILE` 指向一個文字檔，
 *     裡面貼上 gateway 登入時實際回的 `Set-Cookie` 標頭（每行一條）
 *
 * 把限制寫成兩個 env，比假裝測試能自動化整條 OIDC 流程要誠實得多 ——
 * 後者的結果是那份測試永遠是紅的，然後被人加上 skip。
 */

const env = process.env;
const externalOrigin = env["BFF_ORIGIN"];
const endpoints = endpointsFromEnv(env);
const sessionCookieName = env["BFF_SESSION_COOKIE"] ?? DEFAULT_SESSION_COOKIE;
const suppliedSession = env["BFF_SESSION_VALUE"];
const suppliedCsrf = env["BFF_CSRF_VALUE"];
const setCookieFixture = env["BFF_SET_COOKIE_FILE"];

let origin = "";
let mock: RunningBffMock | undefined;

beforeAll(async () => {
  if (externalOrigin !== undefined) {
    origin = externalOrigin.replace(/\/+$/, "");
    return;
  }
  // port 0：讓 OS 配一個，避免與開發者本機正在跑的 mock 撞埠。
  mock = await startBffMock(0);
  origin = mock.origin;
});

afterAll(async () => {
  await mock?.close();
});

interface Jar {
  session?: string;
  csrf?: string;
}

function call(path: string, init: RequestInit = {}, jar?: Jar): Promise<Response> {
  const headers = new Headers(init.headers);

  if (jar !== undefined) {
    const parts: string[] = [];
    if (jar.session !== undefined) parts.push(`${sessionCookieName}=${jar.session}`);
    if (jar.csrf !== undefined) parts.push(`${CSRF_COOKIE}=${jar.csrf}`);
    if (parts.length > 0) headers.set("Cookie", parts.join("; "));
  }

  // redirect: manual —— 契約要求未登入回 401 而非 302。
  // 讓 fetch 自動跟隨轉址會把「回了 302 登入頁」偽裝成 200，測試就白做了。
  return fetch(`${origin}${path}`, { ...init, headers, redirect: "manual" });
}

/** 取得一組可用的 session。真實 gateway 用 env 帶入，mock 則實際登入一次。 */
async function authenticate(): Promise<Jar> {
  if (suppliedSession !== undefined) {
    return { session: suppliedSession, csrf: suppliedCsrf };
  }

  const response = await call(endpoints.login, { method: "POST" });
  const cookies = response.headers.getSetCookie();
  return {
    session: findSetCookie(cookies, sessionCookieName)?.value,
    csrf: findSetCookie(cookies, CSRF_COOKIE)?.value,
  };
}

/** 登入時實際回的 `Set-Cookie` 標頭。真實 gateway 由 BFF_SET_COOKIE_FILE 提供。 */
async function loginSetCookies(): Promise<string[]> {
  if (setCookieFixture !== undefined) {
    return readFileSync(setCookieFixture, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  // 用 BFF_SESSION_VALUE 驗收真實 gateway 時，登入是走 OIDC 的，這裡打
  // POST 過去只會拿到一個看不懂的錯誤。與其讓人去猜，不如直接說要設哪個 env。
  if (suppliedSession !== undefined) {
    throw new Error(
      "\n[bff-contract] 已設定 BFF_SESSION_VALUE（行為面驗收），但缺少 BFF_SET_COOKIE_FILE。\n\n" +
        "  cookie 屬性（HttpOnly／Secure／SameSite／Path）無法從既有 session 反推，\n" +
        "  而真實 gateway 的登入是 OIDC 流程，測試自動走不完。\n\n" +
        "  請把 gateway 登入時實際回的 Set-Cookie 標頭貼進一個文字檔（每行一條），\n" +
        "  再指過去：BFF_SET_COOKIE_FILE=./gateway-set-cookie.txt\n",
    );
  }

  const response = await call(endpoints.login, { method: "POST" });
  return response.headers.getSetCookie();
}

// 每條測試登記自己對應的契約條目；最後一條驗證沒有條目失去測試。
// 註冊發生在 collect 階段（早於任何測試執行），所以這個集合在跑最後一條時
// 一定已經完整 —— 這是 vitest 的執行順序保證，不是巧合。
const covered = new Set<string>();

function contract(id: string, title: string, fn: () => Promise<void>): void {
  covered.add(id);
  it(`[${id}] ${title}`, fn);
}

describe("BFF 契約（D8 / R6）", () => {
  contract("same-origin", `所有端點都在同源的 ${API_PREFIX} 前綴下`, async () => {
    // 這條不打網路：它驗的是契約自身的定義沒有被改成跨源。
    // 跨源的 BFF 會讓 SameSite cookie 完全失效，那是 D8 的地基。
    for (const path of Object.values(endpoints)) {
      expect(path.startsWith("/"), `${path} 必須是同源路徑，不得為完整 URL`).toBe(true);
    }
  });

  contract("401-unauthenticated", "未帶 session 時回 401（不是 302、不是 200）", async () => {
    const response = await call(endpoints.probe);
    expect(response.status).toBe(401);
  });

  contract("403-forbidden", "已登入但權限不足時回 403，與 401 分開", async () => {
    const jar = await authenticate();
    const response = await call(endpoints.adminProbe, {}, jar);
    expect(response.status).toBe(403);
  });

  contract("session-cookie-httponly", "session cookie 具備 HttpOnly + Secure", async () => {
    const cookie = findSetCookie(await loginSetCookies(), sessionCookieName);
    expect(cookie, `登入回應沒有 ${sessionCookieName} cookie`).toBeDefined();

    for (const attribute of SESSION_COOKIE_REQUIRED_ATTRIBUTES) {
      expect(
        Object.keys(cookie?.attributes ?? {}),
        `${sessionCookieName} 缺少 ${attribute}`,
      ).toContain(attribute.toLowerCase());
    }
  });

  contract("session-cookie-samesite", "session cookie 的 SameSite 為 Lax 或 Strict", async () => {
    const cookie = findSetCookie(await loginSetCookies(), sessionCookieName);
    const sameSite = cookie?.attributes["samesite"];
    expect(SESSION_COOKIE_ALLOWED_SAMESITE as readonly string[]).toContain(sameSite);
  });

  contract(
    "session-cookie-path",
    `session cookie 的 Path 為 ${SESSION_COOKIE_REQUIRED_PATH}`,
    async () => {
      // 限縮 Path 會讓登出漏掉其他路徑下的同名 cookie —— 使用者看到「已登出」，
      // 而一份仍然有效的憑證還躺在瀏覽器裡。
      const cookie = findSetCookie(await loginSetCookies(), sessionCookieName);
      expect(cookie?.attributes["path"]).toBe(SESSION_COOKIE_REQUIRED_PATH);
    },
  );

  contract("csrf-cookie-readable", `${CSRF_COOKIE} 不得為 HttpOnly`, async () => {
    const cookie = findSetCookie(await loginSetCookies(), CSRF_COOKIE);
    expect(cookie, `登入回應沒有 ${CSRF_COOKIE} cookie`).toBeDefined();

    for (const forbidden of CSRF_COOKIE_FORBIDDEN_ATTRIBUTES) {
      // 這支必須讀得到，否則 http-client 送不出任何寫入請求。
      expect(Object.keys(cookie?.attributes ?? {})).not.toContain(forbidden.toLowerCase());
    }
  });

  contract("csrf-required", `非安全方法缺少 ${CSRF_HEADER} 時回 403`, async () => {
    const jar = await authenticate();
    const response = await call(endpoints.probe, { method: "POST" }, jar);
    expect(response.status).toBe(403);
  });

  contract("csrf-mismatch", `${CSRF_HEADER} 與 cookie 不符時回 403`, async () => {
    const jar = await authenticate();
    const response = await call(
      endpoints.probe,
      { method: "POST", headers: { [CSRF_HEADER]: "not-the-real-token" } },
      jar,
    );
    expect(response.status).toBe(403);
  });

  contract("csrf-accepted", `${CSRF_HEADER} 與 cookie 相符時放行`, async () => {
    const jar = await authenticate();
    expect(jar.csrf, "沒有拿到 CSRF token，後面的斷言會失去意義").toBeDefined();

    const response = await call(
      endpoints.probe,
      { method: "POST", headers: { [CSRF_HEADER]: jar.csrf ?? "" } },
      jar,
    );
    expect(response.status).toBe(200);
  });

  contract("logout-server-side", "登出後舊 session 立即失效（伺服器端已刪除）", async () => {
    const jar = await authenticate();

    const logout = await call(
      endpoints.logout,
      { method: "DELETE", headers: { [CSRF_HEADER]: jar.csrf ?? "" } },
      jar,
    );
    expect(logout.status).toBeLessThan(300);

    // 只清 cookie 的實作會在這裡被抓到 —— 我們刻意**再送一次舊 cookie**。
    // 瀏覽器會乖乖忘記，攻擊者不會。
    const replay = await call(endpoints.probe, {}, jar);
    expect(replay.status, "舊 session cookie 重放後仍然有效：伺服器端沒有真的刪除").toBe(401);

    const cleared = findSetCookie(logout.headers.getSetCookie(), sessionCookieName);
    if (cleared !== undefined) {
      expect(isCleared(cleared), "登出回應重發了一份仍然有效的 session cookie").toBe(true);
    }
  });

  contract("security-headers", "回應帶 @org/security-headers 定義的標頭", async () => {
    const response = await call(endpoints.probe);

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  contract("csp-on-document", "HTML 文件回應帶 CSP，且涵蓋全部基礎指令", async () => {
    const response = await call("/");
    const csp =
      response.headers.get("Content-Security-Policy") ??
      response.headers.get("Content-Security-Policy-Report-Only");

    expect(csp, "文件回應沒有 CSP 標頭").not.toBeNull();

    // 逐條比對，而不是整串字串相等：report-only 階段與 nonce 會讓字串不同。
    // 這裡守的是「伺服器送出的與政策定義的一致」—— 期望與政策同源是刻意的，
    // 政策本身不得縮水由 @org/security-headers 自己的測試守。
    for (const directive of Object.keys(BASE_DIRECTIVES)) {
      expect(csp ?? "", `CSP 缺少 ${directive}`).toContain(directive);
    }
  });

  it("契約條目全部有對應測試", () => {
    const declared = CONTRACT_ITEMS.map((item) => item.id).sort();
    expect([...covered].sort()).toEqual(declared);
  });

  /**
   * 文件裡的條目數必須跟程式碼一致。
   *
   * 加入這一條的理由很具體：`session-cookie-path` 加進契約之後，
   * `README.md` 與 `DECISIONS.md` 兩處仍寫著「12 條契約條目」，
   * 而正確答案是 13。手改一次數字治不好這個 —— 上一次也是手改的。
   *
   * 這是 C17／C24／C25／C27 的同型錯誤：**人抄下來的數字沒有人再推導一次**。
   * 對付它的辦法只有一個：讓機器去數。
   */
  it("bff-contract 的 README 條目表與 CONTRACT_ITEMS 同步", () => {
    const readme = readFileSync(
      new URL("../../../platform/bff-contract/README.md", import.meta.url),
      "utf8",
    );
    for (const item of CONTRACT_ITEMS) {
      expect(readme, `README 少了 ${item.id} 這一列`).toContain(`\`${item.id}\``);
    }
    // 反向：README 不得列出程式碼裡不存在的條目（刪了條目卻忘了刪文件）。
    const ids = new Set(CONTRACT_ITEMS.map((item) => item.id));
    const listed = [...readme.matchAll(/^\| `([a-z0-9-]+)`\s*\|/gm)].map((match) => match[1] ?? "");
    expect(
      listed.filter((id) => !ids.has(id)),
      "README 列了不存在的契約條目",
    ).toEqual([]);
    expect(listed).toHaveLength(CONTRACT_ITEMS.length);
  });
});
