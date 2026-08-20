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

/** 注入的路由處理器拿得到的東西。刻意不透出 node 的 req／res —— 見 `BffMockRoute`。 */
export interface BffMockRequest {
  /** 路徑參數。`/api/customer/:id` 命中 `/api/customer/C-1001` 時是 `{ id: "C-1001" }`。 */
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  /** 已解析的 JSON body。沒有 body 或不是 JSON 時是 `undefined`。 */
  readonly body: unknown;
  /** 這個 session 持有的權限碼（含 `extraPermissions` 追加的）。 */
  readonly permissions: readonly string[];
}

/** 處理器的回應。`body` 省略時只回狀態碼（預設 204），這樣才寫得出「取消成功、沒有內容」。 */
export interface BffMockReply {
  readonly status?: number;
  readonly body?: unknown;
}

/**
 * 一條由**應用端**宣告的資料端點。
 *
 * ── 為什麼需要這個 ──────────────────────────────────────────────────
 *
 * v1 的採用演練（#95）撞到的阻斷級問題：加一片新切片之後沒有資料端點，
 * 而唯一能補的位置在 `platform/` —— 一個採用團隊不准改的地方。
 * 於是「照文件做完，畫面還是錯誤分支」。
 *
 * ── 刻意不透出 node 的 req／res ────────────────────────────────────
 *
 * 透出去的話，寫路由的人可以自己 `res.writeHead()`，於是可以繞過下面
 * 那道 401／CSRF 的順序 —— 而那正是這個 mock 存在的全部理由。
 * 收斂成 `MockRequest → MockReply` 之後，繞不過去是型別層面的事實，
 * 不是一句「請不要這樣做」。
 *
 * ── 型別怎麼拿 ──────────────────────────────────────────────────────
 *
 * 用 `satisfies readonly BffMockRoute[]` 宣告路由陣列，行內處理器的參數
 * 型別會自己推導出來（範例見 `apps/console/bff-routes.ts`）。要寫成具名
 * 函式的話，`BffMockRequest`／`BffMockReply` 也匯出了 —— 它們本來就出現在
 * 這個介面的公開簽章裡，不匯出的話消費端沒有名字可以稱呼它們
 *（`tools/api-surface` 有一道閘門就是在守這件事）。
 */
export interface BffMockRoute {
  /** 預設 `GET`。 */
  readonly method?: string;
  /** 支援 `:name` 參數段。段數必須完全相同 —— 這裡沒有萬用字元。 */
  readonly path: string;
  readonly handle: (request: BffMockRequest) => BffMockReply | Promise<BffMockReply>;
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
  /**
   * 應用端自己的資料端點（見 `BffMockRoute`）。
   *
   * 比對順序是**契約端點 → 401 閘門 → 這裡 → 示範資料 → 404**：
   * 契約那幾條蓋不掉，示範資料蓋得掉。
   */
  readonly routes?: readonly BffMockRoute[];
  /**
   * 追加到 mock session 的權限碼。**追加，不是取代。**
   *
   * 取代的話，採用團隊加一片切片就得把示範切片的權限碼重列一次，
   * 而漏列的症狀是示範切片安靜地壞掉 —— 沒有東西會說話。
   */
  readonly extraPermissions?: readonly string[];
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

/** 示範用的訂單。刻意涵蓋三種狀態，讓篩選與狀態顯示都有東西可看。 */
const DEMO_ORDERS = [
  { id: "ORD-1001", customerName: "林佳蓉", totalCents: 128_000, status: "pending" },
  { id: "ORD-1002", customerName: "陳彥廷", totalCents: 45_500, status: "shipped" },
  { id: "ORD-1003", customerName: "Aya Nakamura", totalCents: 302_000, status: "pending" },
  { id: "ORD-1004", customerName: "黃詩涵", totalCents: 8_900, status: "cancelled" },
] as const;

/**
 * 示範用的出貨單。
 *
 * 補這一份的理由與 `DEMO_ORDERS` 不完全一樣：D15 把設計系統落到
 * `features/shipment` 之後，那個切片的 `UiButton`／`UiDialog` 在跑起來的
 * 應用裡**根本到不了** —— `/api/shipment` 不存在，畫面永遠停在 isError 分支。
 *
 * 閘門會綠、測試會過、chunk 帳目也是真的，但第二個參考切片的 D15 採用
 * 是**看不到的**。那正是 C39 在訂單那邊抓到的同一件事，只是換一個切片。
 */
const DEMO_SHIPMENTS = [{ id: "SHP-2001" }, { id: "SHP-2002" }, { id: "SHP-2003" }] as const;

function csrfCookieValue(token: string): string {
  // 刻意**不加** HttpOnly：double-submit 的前提就是前端讀得到這支。
  // 偷到它沒有用 —— 真正的 session 仍是 HttpOnly。
  return `${CSRF_COOKIE}=${token}; Secure; SameSite=Lax; Path=/`;
}

function clearedCookie(name: string): string {
  return `${name}=; Max-Age=0; Path=/`;
}

interface RouteMatch {
  readonly route: BffMockRoute;
  readonly params: Readonly<Record<string, string>>;
}

/**
 * 逐段比對，段數必須相同。
 *
 * 刻意不用正則：路徑樣式是使用者提供的字串，把它編進正則等於讓
 * 應用端的一個手誤變成這支行程的 ReDoS（C19 擋的就是這一類）。
 * 逐段比對還有一個好處 —— `/api/customer` 不會意外命中 `/api/customer/C-1`。
 */
function matchPath(pattern: string, path: string): Readonly<Record<string, string>> | undefined {
  const expected = pattern.split("/");
  const actual = path.split("/");
  if (expected.length !== actual.length) return undefined;

  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    const value = actual[index] ?? "";
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = decodeURIComponent(value);
      continue;
    }
    if (segment !== value) return undefined;
  }
  return params;
}

/** 先宣告的先贏。兩條樣式都命中時，順序是應用端寫在陣列裡的順序。 */
function matchRoute(
  routes: readonly BffMockRoute[],
  method: string,
  path: string,
): RouteMatch | undefined {
  for (const route of routes) {
    if ((route.method ?? "GET").toUpperCase() !== method) continue;
    const params = matchPath(route.path, path);
    if (params !== undefined) return { route, params };
  }
  return undefined;
}

/**
 * 讀完 body 並試著當 JSON 解析。解析不了就是 `undefined`，不丟例外 ——
 * 這個 mock 不是在驗使用者的 payload，那是真正的 gateway 的事。
 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function serveRoute(
  matched: RouteMatch,
  req: IncomingMessage,
  res: ServerResponse,
  permissions: readonly string[],
): Promise<void> {
  try {
    const reply = await matched.route.handle({
      params: matched.params,
      query: new URLSearchParams((req.url ?? "").split("?")[1] ?? ""),
      body: await readJsonBody(req),
      permissions,
    });

    // body 省略 ＝ 只回狀態碼。`json(res, 204, null)` 會送出字串 "null"，
    // 而 204 依規範不得有 body —— 那種回應在瀏覽器端的症狀很難查。
    if (reply.body === undefined) {
      res.writeHead(reply.status ?? 204).end();
      return;
    }
    json(res, reply.status ?? 200, reply.body);
  } catch (error) {
    // ⚠️ 不要讓它安靜地變成 404。路由寫錯與處理器炸掉是兩種不同的問題，
    // 而 404 會把人送去查一個沒有錯的路徑。
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[bff-mock] ${matched.route.path} 的處理器丟出例外：${reason}`);
    json(res, 500, {
      error: "route_handler_failed",
      route: `${(matched.route.method ?? "GET").toUpperCase()} ${matched.route.path}`,
      reason,
    });
  }
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
  const routes = options.routes ?? [];
  // 去重但保留順序：重複的權限碼在回應裡出現兩次，會讓「照著印出來的清單
  // 去對」的人以為自己看錯了。
  const permissions = [...new Set([...MOCK_PERMISSIONS, ...(options.extraPermissions ?? [])])];

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
      sessions.set(sid, { user: "dev@example.internal", csrfToken, permissions });
      res.setHeader("Set-Cookie", [
        sessionCookieValue(sessionCookie, sid),
        csrfCookieValue(csrfToken),
      ]);
      json(res, 200, { user: "dev@example.internal", permissions });
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

    // ── 應用端注入的資料端點（options.routes）────────────────────────
    //
    // 位置是這一段唯一重要的事，而且兩邊都有理由：
    //
    //   **在 401 閘門之後** —— 放到前面的話，這道接縫同時是一條
    //   「不用登入就拿得到資料」的路。這個 mock 存在的全部理由是證明
    //   D8 那條路徑（登入 → 帶 cookie → 被 CSRF 擋 → 補標頭 → 通過）
    //   走得通；開一條繞過它的路，等於把它自己推翻。
    //
    //   **在契約端點之後** —— session／CSRF／401／403 是 @org/bff-contract
    //   在驗的東西。蓋得掉的話，一份「通過契約」的參考實作可以被一行
    //   設定改成不通過，而契約測試不會知道。
    //
    // 示範資料則刻意在**後面**：那幾條不是契約，覆寫它們是合理的需求
    //（例如各案想換掉訂單的假資料）。
    const matched = matchRoute(routes, method, path);
    if (matched !== undefined) {
      void serveRoute(matched, req, res, session.permissions);
      return;
    }

    // ── 示範資料 ──────────────────────────────────────────────────
    //
    // **這不是契約的一部分。** @org/bff-contract 的 13 條講的是 session、
    // CSRF、401／403 —— 那些是 D8 要求真正的 gateway 必須做到的事。
    //
    // 這一段存在的理由不同：少了它，腳手架的示範應用**永遠停在 loading**，
    // 於是沒有人能在本機看到自己寫的畫面長什麼樣，也沒辦法用真實 CSP
    // 驗證對話框這類只有互動時才會出現的東西（D15 的 CSP 驗收就卡在這裡）。
    //
    // 正式的 gateway 當然不會有這一段。它在這裡是為了讓「跑起來能看見東西」
    // 成立 —— 一個看不見東西的腳手架，第一天就會被人繞過。
    if (path === "/api/orders" && method === "GET") {
      const query = new URLSearchParams((req.url ?? "").split("?")[1] ?? "");
      const status = query.get("status");
      const filtered =
        status === null ? DEMO_ORDERS : DEMO_ORDERS.filter((o) => o.status === status);
      json(res, 200, { items: filtered, total: filtered.length });
      return;
    }

    // 同上，也不是契約的一部分。少了它，features/shipment 的對話框在跑起來的
    // 應用裡永遠打不開 —— 而那正是 D15 在第二個切片上唯一看得見的證據。
    if (path === "/api/shipment" && method === "GET") {
      json(res, 200, { items: DEMO_SHIPMENTS, total: DEMO_SHIPMENTS.length });
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
