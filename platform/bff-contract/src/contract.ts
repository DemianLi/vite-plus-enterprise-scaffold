/**
 * BFF 契約：D8 對「同源中間層」的**可執行規格**（R6）。
 *
 * ── 這個 package 為什麼存在 ──────────────────────────────────────────
 *
 * D8 選了 BFF + httpOnly cookie，但腳手架本身沒有 BFF —— 那一層是組織既有的
 * gateway（Kong／nginx＋auth service／APISIX／自建）。R6 因此一直卡在
 * 「你們到底有沒有那一層」這個**組織問題**上，而組織問題無法用程式碼回答。
 *
 * 可以用程式碼回答的是**另一個問題**：那一層必須做到什麼，才算滿足 D8。
 *
 * 所以這裡不寫實作，寫規格 —— 而且是可以跑的規格：
 *
 *   有 gateway  → `BFF_ORIGIN=https://gw.internal vp run -F @org/bff-contract test`
 *                 全綠 ＝ R6 關閉，不需要任何新程式碼
 *   沒有 gateway → 這份規格就是那個 BFF 的驗收條件，
 *                 `@org/bff-mock` 是已經通過它的參考實作
 *
 * 兩條路徑共用同一套斷言。這正是 C17 的教訓：規格寫在文件裡，半年後與實作
 * 各說各話，而且沒有人會發現。
 *
 * ── 哪些是硬性的、哪些可以換 ────────────────────────────────────────
 *
 * **硬性**：`XSRF-TOKEN` / `X-XSRF-TOKEN` 這兩個名字。`@org/http-client` 直接
 * 從本檔匯入它們 —— 前端與中間層對不上，每個非 GET 請求都會 403，而且是上線
 * 當天才發現。名字定義在這裡、由雙方 import，是唯一不會漂移的做法。
 *
 * **可換**：session cookie 的**名字**（各家 gateway 有自己的慣例，用
 * `BFF_SESSION_COOKIE` 覆寫）、以及各端點路徑（用下面的 env 覆寫）。
 * 不可換的是 session cookie 的**屬性**與 CSRF 的語意。
 */

/** 同源路徑前綴。BFF 必須與 SPA 同源，否則 SameSite 形同虛設（D8）。 */
export const API_PREFIX = "/api";

/**
 * CSRF double-submit 的 cookie 與標頭名稱。
 *
 * ⚠️ **`@org/http-client` 從這裡匯入這兩個常數。** 改名等於同時改前端與契約，
 * 兩邊不可能對不上 —— 這是刻意的設計，不是為了少寫兩行。
 */
export const CSRF_COOKIE = "XSRF-TOKEN";
export const CSRF_HEADER = "X-XSRF-TOKEN";

/** 不需要 CSRF 標頭的方法。與 http-client 共用同一份定義。 */
export const SAFE_METHODS: readonly string[] = ["GET", "HEAD", "OPTIONS"];

/** session cookie 的預設名稱。各家 gateway 慣例不同，可用 env 覆寫。 */
export const DEFAULT_SESSION_COOKIE = "org_session";

/**
 * session cookie **必須**具備的屬性。
 *
 * - `HttpOnly`：D8 的全部意義。少了它，XSS 就偷得走 session，
 *   前面所有的 CSP 與掃描都只是在拖延時間
 * - `Secure`：明文通道上的 session cookie 等於沒有 session。
 *   localhost 被瀏覽器視為 trustworthy origin，因此本機開發不受影響
 *
 * 這裡只列**無值的旗標**。`Path` 有值，由 SESSION_COOKIE_REQUIRED_PATH 單獨比對。
 */
export const SESSION_COOKIE_REQUIRED_ATTRIBUTES = ["HttpOnly", "Secure"] as const;

/**
 * session cookie 的 `Path`。
 *
 * 限縮成 `/admin` 之類的值會讓登出**漏掉**其他路徑下的同名 cookie ——
 * 使用者看到「已登出」，而一份仍然有效的憑證還躺在瀏覽器裡。
 */
export const SESSION_COOKIE_REQUIRED_PATH = "/";

/**
 * `SameSite` 可接受的值。
 *
 * `Strict` 最安全但會讓「從外部連結點進來時顯示為未登入」，多數團隊撐不過一週。
 * `Lax` 擋得住所有跨站的非安全方法請求，是實務上的正確預設。
 * `None` 直接判定不合格 —— 那等於關掉 SameSite。
 */
export const SESSION_COOKIE_ALLOWED_SAMESITE = ["Lax", "Strict"] as const;

/**
 * CSRF cookie **不得**具備的屬性。
 *
 * 這支 cookie 必須是**可讀**的 —— double-submit 的原理就是「前端讀得到、
 * 跨站的攻擊者讀不到」。有人出於直覺給它加上 HttpOnly，前端就再也讀不到值，
 * 所有寫入請求全部失敗。這條斷言存在的唯一理由就是攔下這個直覺。
 */
export const CSRF_COOKIE_FORBIDDEN_ATTRIBUTES = ["HttpOnly"] as const;

/** 契約要求的端點。路徑可換，語意不可換。 */
export interface BffEndpoints {
  /** POST：建立 session。真實環境是 OIDC 流程的終點，不是帳密表單。 */
  readonly login: string;
  /** DELETE：登出。必須清除**伺服器端** session，不只是讓 cookie 過期。 */
  readonly logout: string;
  /** GET：查詢目前 session。未登入須回 401。 */
  readonly session: string;
  /** 任一需要登入的端點，用來驗證 401 與 CSRF。 */
  readonly probe: string;
  /** 任一「已登入但權限不足」的端點，用來驗證 403 與 401 確實分開。 */
  readonly adminProbe: string;
}

export const DEFAULT_ENDPOINTS: BffEndpoints = {
  login: `${API_PREFIX}/session`,
  logout: `${API_PREFIX}/session`,
  session: `${API_PREFIX}/session`,
  probe: `${API_PREFIX}/ping`,
  adminProbe: `${API_PREFIX}/admin/ping`,
};

/**
 * 從環境變數解析端點設定，讓同一套測試能指向組織既有的 gateway。
 *
 * 這是 R6 的關鍵：驗收既有 gateway 時，改的是 env，不是測試程式碼。
 * 一旦要改測試才能過，那份測試就不再是契約，而是實作的鏡子。
 */
export function endpointsFromEnv(env: Record<string, string | undefined>): BffEndpoints {
  return {
    login: env["BFF_LOGIN_PATH"] ?? DEFAULT_ENDPOINTS.login,
    logout: env["BFF_LOGOUT_PATH"] ?? DEFAULT_ENDPOINTS.logout,
    session: env["BFF_SESSION_PATH"] ?? DEFAULT_ENDPOINTS.session,
    probe: env["BFF_PROBE_PATH"] ?? DEFAULT_ENDPOINTS.probe,
    adminProbe: env["BFF_ADMIN_PROBE_PATH"] ?? DEFAULT_ENDPOINTS.adminProbe,
  };
}

export interface CookieAttributes {
  readonly [name: string]: string;
}

export interface ParsedSetCookie {
  readonly name: string;
  readonly value: string;
  /** 屬性名一律小寫，無值的旗標（HttpOnly／Secure）值為空字串。 */
  readonly attributes: CookieAttributes;
}

/**
 * 解析單一 `Set-Cookie` 標頭。
 *
 * 刻意用 `split` 而非正則：cookie 屬性的文法有夠多角落案例，而任何足以涵蓋
 * 它們的正則都會長成 Tier 2 的 `security/detect-unsafe-regex` 會擋下的形狀
 *（實測過兩次，見 tools/codemods 的紀錄）。字串切割沒有回溯問題。
 */
export function parseSetCookie(raw: string): ParsedSetCookie {
  const parts = raw.split(";");
  const [pair = "", ...rest] = parts;
  const eq = pair.indexOf("=");
  const attributes: Record<string, string> = {};

  for (const part of rest) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const attrEq = trimmed.indexOf("=");
    if (attrEq === -1) {
      attributes[trimmed.toLowerCase()] = "";
    } else {
      attributes[trimmed.slice(0, attrEq).toLowerCase()] = trimmed.slice(attrEq + 1);
    }
  }

  return {
    name: eq === -1 ? pair.trim() : pair.slice(0, eq).trim(),
    value: eq === -1 ? "" : pair.slice(eq + 1),
    attributes,
  };
}

/** 從一組 `Set-Cookie` 標頭中找出指定名稱的那一筆。 */
export function findSetCookie(
  headers: readonly string[],
  name: string,
): ParsedSetCookie | undefined {
  for (const header of headers) {
    const parsed = parseSetCookie(header);
    if (parsed.name === name) return parsed;
  }
  return undefined;
}

/**
 * 判斷這筆 `Set-Cookie` 是否為「清除」語意。
 *
 * 登出時檢查的是這個，而不是「有沒有回傳 Set-Cookie」—— 有些實作會在登出時
 * 重發一份**有效**的 cookie，看起來有動作，實際上 session 還活著。
 */
export function isCleared(cookie: ParsedSetCookie): boolean {
  const maxAge = cookie.attributes["max-age"];
  if (maxAge !== undefined && Number(maxAge) <= 0) return true;

  const expires = cookie.attributes["expires"];
  if (expires !== undefined) {
    const at = Date.parse(expires);
    if (!Number.isNaN(at) && at <= Date.now()) return true;
  }

  return cookie.value === "";
}

/**
 * 契約條目。測試檔逐條對應，`describeContract()` 產生給人看的清單。
 *
 * 為什麼要有這份陣列：拿去問組織「你們的 gateway 做得到嗎」時，對方要的是
 * 一張可以逐條回答的表，不是一份測試原始碼。兩者同源才不會漂移。
 */
export const CONTRACT_ITEMS: readonly { readonly id: string; readonly requirement: string }[] = [
  { id: "same-origin", requirement: `BFF 掛在與 SPA 同源的 ${API_PREFIX} 路徑前綴下` },
  {
    id: "401-unauthenticated",
    requirement: "未帶有效 session 時回 401（不是 302、不是 200 空內容）",
  },
  { id: "403-forbidden", requirement: "已登入但權限不足時回 403，與 401 明確分開" },
  { id: "session-cookie-httponly", requirement: "session cookie 具備 HttpOnly + Secure" },
  { id: "session-cookie-samesite", requirement: "session cookie 的 SameSite 為 Lax 或 Strict" },
  {
    id: "session-cookie-path",
    requirement: `session cookie 的 Path 為 ${SESSION_COOKIE_REQUIRED_PATH}（否則登出會漏掉其他路徑）`,
  },
  {
    id: "csrf-cookie-readable",
    requirement: `${CSRF_COOKIE} cookie **不得** HttpOnly（前端必須讀得到）`,
  },
  { id: "csrf-required", requirement: `非安全方法缺少 ${CSRF_HEADER} 時回 403` },
  { id: "csrf-mismatch", requirement: `${CSRF_HEADER} 與 cookie 不符時回 403` },
  { id: "csrf-accepted", requirement: `${CSRF_HEADER} 與 cookie 相符時放行` },
  { id: "logout-server-side", requirement: "登出後，舊 session cookie 立即失效（伺服器端已刪除）" },
  { id: "security-headers", requirement: "回應帶 @org/security-headers 定義的安全標頭" },
  {
    id: "csp-on-document",
    requirement: "HTML 文件回應帶 CSP 標頭（靜態即可，見 R6 的 nonce 結論）",
  },
];

export function describeContract(): string {
  return CONTRACT_ITEMS.map((item) => `  [${item.id}] ${item.requirement}`).join("\n");
}
