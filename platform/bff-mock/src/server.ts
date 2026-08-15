import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { buildSecurityHeaders } from "@org/security-headers";
import {
  API_PREFIX,
  CSRF_COOKIE,
  CSRF_HEADER,
  DEFAULT_ENDPOINTS,
  DEFAULT_SESSION_COOKIE,
  SAFE_METHODS,
} from "@org/bff-contract";

/**
 * 通過 `@org/bff-contract` 的參考實作（R6）。
 *
 * ── 這是什麼、不是什麼 ──────────────────────────────────────────────
 *
 * **是**：讓 `vp dev` 從第一天就能完成一次真正的登入 → 帶 cookie → 被 CSRF
 * 擋下 → 補上標頭 → 通過的完整往返。在此之前，dev proxy 指向 localhost:8080
 * 而那裡什麼都沒有，D8 的整條路徑從來沒有在本機被走過一次。
 *
 * **是**：契約的可執行證明。`@org/bff-contract` 的測試在沒有 `BFF_ORIGIN` 時
 * 就跑它，所以「這份契約是可實現的」每次 CI 都被驗證一次。
 *
 * **不是**：認證伺服器。這裡沒有 OIDC、沒有 token 交換、沒有使用者目錄、
 * 沒有 session 持久化（重啟即失憶）。`POST /api/session` 接受任何請求並直接
 * 發 session —— 真實環境那裡是 OIDC 授權碼流程的終點。
 *
 * ── 為什麼刻意停在這裡 ──────────────────────────────────────────────
 *
 * 腳手架裡一個「看起來很完整」的認證服務，會被複製到 production。
 * 這不是假設 —— 那正是各種 demo auth server 最後的下場。
 * 所以這裡把界線畫得很難越過：預設拒絕在 NODE_ENV=production 啟動，
 * 而 token 取得那一段連介面都不提供，逼使用者必須去接真正的 IdP。
 *
 * 同樣的取捨在 tools/codemods/README.md 也出現過：機制保證的是
 *「被看見」，不是「正確」。這裡保證的是「路徑走得通」，不是「可以上線」。
 */

/** 這個 mock 給的權限。刻意**不含** admin —— 契約要驗 403 與 401 確實分開。 */
const MOCK_PERMISSIONS = ["order:read", "shipment:read"] as const;

interface Session {
  readonly user: string;
  readonly csrfToken: string;
  readonly permissions: readonly string[];
}

export interface BffMockOptions {
  /** session cookie 名稱。契約不綁名字，只綁屬性。 */
  readonly sessionCookie?: string;
  /**
   * 是否允許在 NODE_ENV=production 啟動。預設 false。
   *
   * 這個選項存在的意義不是提供後門，是讓「有人真的想這樣做」變成一個
   * 必須寫在原始碼裡、會出現在 code review 的動作。
   */
  readonly allowInProduction?: boolean;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function readCookies(req: IncomingMessage): Map<string, string> {
  const jar = new Map<string, string>();
  const header = req.headers.cookie;
  if (header === undefined) return jar;

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    jar.set(trimmed.slice(0, eq), decodeURIComponent(trimmed.slice(eq + 1)));
  }
  return jar;
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * cookie 屬性在這裡集中產生，因為契約驗的就是這串字。
 *
 * `Secure` 在 http://localhost 下**不會**失效：瀏覽器把 localhost 視為
 * trustworthy origin。省略它才是問題 —— 那會讓本機與正式環境的 cookie 行為
 * 出現一個假的差異，而且是往寬鬆的方向差。
 */
function sessionCookieValue(name: string, sid: string): string {
  return `${name}=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

function csrfCookieValue(token: string): string {
  // 刻意**不加** HttpOnly：double-submit 的前提就是前端讀得到這支。
  // 偷到它沒有用 —— 真正的 session 仍是 HttpOnly。
  return `${CSRF_COOKIE}=${token}; Secure; SameSite=Lax; Path=/`;
}

function clearedCookie(name: string): string {
  return `${name}=; Max-Age=0; Path=/`;
}

export function createBffMock(options: BffMockOptions = {}) {
  if (process.env["NODE_ENV"] === "production" && options.allowInProduction !== true) {
    throw new Error(
      "\n[@org/bff-mock] 拒絕在 NODE_ENV=production 啟動。\n\n" +
        "  這是開發用的參考實作，沒有 OIDC、沒有使用者目錄、session 存在記憶體裡（重啟即失憶）。\n" +
        "  production 的中間層請用組織既有的 gateway，並用 @org/bff-contract 的測試驗收它：\n\n" +
        "    BFF_ORIGIN=https://gateway.internal vp run -F @org/bff-contract test\n",
    );
  }

  const sessionCookie = options.sessionCookie ?? DEFAULT_SESSION_COOKIE;
  const sessions = new Map<string, Session>();

  // 與 dev server 中介層同一份政策（@org/security-headers 是唯一定義）。
  // report-only：mock 是開發用的，enforce 只會讓人第一件事就是把它關掉。
  const securityHeaders = buildSecurityHeaders({
    reportOnly: true,
    reportUri: `${API_PREFIX}/csp-report`,
  });

  const server = createServer((req, res) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      // dev 走 http，HSTS 在此無意義且會污染 localhost 的瀏覽器狀態。
      if (name === "Strict-Transport-Security") continue;
      res.setHeader(name, value);
    }

    const method = (req.method ?? "GET").toUpperCase();
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    const cookies = readCookies(req);
    const session = sessions.get(cookies.get(sessionCookie) ?? "");

    // ── 文件回應：讓契約能驗「靜態 CSP 標頭就夠」──────────────────
    if (path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><title>bff-mock</title><div id=app></div>");
      return;
    }

    // ── CSP violation 收集點 ──────────────────────────────────────
    // apps/console 的 dev 設定把 reportUri 指到 /api/csp-report，
    // 而 /api/* 會被 proxy 到這裡。開發時的 violation 因此看得見。
    if (path.endsWith("/csp-report") && method === "POST") {
      console.warn("[bff-mock] 收到 CSP violation 回報");
      res.writeHead(204).end();
      return;
    }

    // ── CSRF：非安全方法的全域閘門 ────────────────────────────────
    //
    // 登入是例外，因為在拿到 session 之前不可能有 CSRF token。
    // ⚠️ 真實的 BFF 應該在**發送登入頁時**就先給一支 pre-session CSRF token
    //（login CSRF 是真實存在的攻擊：把受害者登入成攻擊者的帳號）。
    // 這裡不做，是因為那需要一個真正的登入頁流程，而那已經越過本 mock 的界線。
    const isLogin = path === DEFAULT_ENDPOINTS.login && method === "POST";
    if (!SAFE_METHODS.includes(method) && !isLogin) {
      const supplied = headerValue(req, CSRF_HEADER);
      if (session === undefined) {
        json(res, 401, { error: "unauthenticated" });
        return;
      }
      if (supplied === undefined || supplied !== session.csrfToken) {
        json(res, 403, { error: "csrf_failed", hint: `缺少或不符的 ${CSRF_HEADER}` });
        return;
      }
    }

    // ── 登入 ──────────────────────────────────────────────────────
    if (path === DEFAULT_ENDPOINTS.login && method === "POST") {
      const sid = randomUUID();
      const csrfToken = randomUUID();
      sessions.set(sid, { user: "dev@example.internal", csrfToken, permissions: MOCK_PERMISSIONS });
      res.setHeader("Set-Cookie", [
        sessionCookieValue(sessionCookie, sid),
        csrfCookieValue(csrfToken),
      ]);
      json(res, 200, { user: "dev@example.internal", permissions: MOCK_PERMISSIONS });
      return;
    }

    // ── 登出 ──────────────────────────────────────────────────────
    //
    // 關鍵在 sessions.delete：**伺服器端**必須失效。只清 cookie 的實作
    // 在契約裡會被抓到 —— 因為測試會拿舊 cookie 再打一次。
    if (path === DEFAULT_ENDPOINTS.logout && method === "DELETE") {
      for (const [sid] of sessions) {
        if (sid === cookies.get(sessionCookie)) sessions.delete(sid);
      }
      res.setHeader("Set-Cookie", [clearedCookie(sessionCookie), clearedCookie(CSRF_COOKIE)]);
      res.writeHead(204).end();
      return;
    }

    // ── 以下皆需登入 ──────────────────────────────────────────────
    if (session === undefined) {
      json(res, 401, { error: "unauthenticated" });
      return;
    }

    if (path === DEFAULT_ENDPOINTS.session && method === "GET") {
      json(res, 200, { authenticated: true, user: session.user, permissions: session.permissions });
      return;
    }

    if (path === DEFAULT_ENDPOINTS.adminProbe) {
      if (!session.permissions.includes("admin")) {
        json(res, 403, { error: "forbidden", required: "admin" });
        return;
      }
      json(res, 200, { pong: true, scope: "admin" });
      return;
    }

    if (path === DEFAULT_ENDPOINTS.probe) {
      json(res, 200, { pong: true, method });
      return;
    }

    json(res, 404, { error: "not_found", path });
  });

  return server;
}

export interface RunningBffMock {
  readonly origin: string;
  close(): Promise<void>;
}

/** 啟動並回傳實際 origin。傳 0 讓 OS 配 port（測試用，避免撞埠）。 */
export async function startBffMock(port = 8080, options?: BffMockOptions): Promise<RunningBffMock> {
  const server = createBffMock(options);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("[@org/bff-mock] 無法取得監聽位址");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}
