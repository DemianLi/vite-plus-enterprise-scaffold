/**
 * CSP 與安全標頭的**單一事實來源**（D11）。
 *
 * 這份定義同時被三個地方消費：
 *
 *   1. BFF / gateway —— 產生實際下發的回應標頭（含 per-request nonce）
 *   2. `vite dev` 的中介層 —— 讓 violation 在**開發當下**就出現，而不是等到 staging
 *   3. 本 package 的測試 —— 把「不得放寬」的性質釘住
 *
 * 政策散在 nginx 設定檔、Helmet 呼叫、與文件三處的話，三者會在半年內各說各話，
 * 而且沒有人會發現 —— CSP 放寬是靜默的，症狀只有「某天被滲透測試開單」。
 */

/** 每個指令的值。空陣列代表該指令值為 `'none'` 的語意由 NONE_DIRECTIVES 表達。 */
export interface CspDirectives {
  readonly [directive: string]: readonly string[];
}

/**
 * 基礎政策。**不含** script-src 的 nonce —— 那是 per-request 的，由 buildCsp 注入。
 *
 * 每一條放寬都必須在這裡留下註解說明為什麼，否則下一個人只會看到一串字串，
 * 無從判斷哪些是必要的、哪些是當年趕上線加的。
 *
 * 加減指令要同步改 `tests/policy.test.ts` 的具名清單 —— 減的方向沒有別的東西在守，
 * 那份清單就是釘子。
 */
export const BASE_DIRECTIVES: CspDirectives = {
  "default-src": ["'self'"],

  // 無 'unsafe-eval'：畫面在建置期就編好了 —— JSX 由 Vite 編成函式呼叫，執行期沒有
  // 樣板編譯器。C240 換掉 Vue 時重量過：正式產物 `eval(`／`new Function` 0 處，
  // enforce 模式下打開對話框零違規。代價是執行期不得動態求值字串 —— 一旦有人用了，
  // 整份 CSP 就得放寬，所以那條由 oxlint 的 no-eval / no-implied-eval 擋。
  // ⚠️ dev 會多一條 report-only 的 violation：@vitejs/plugin-react 在 index.html 注入
  // Fast Refresh 的 inline script。它只存在 dev server，建置產物沒有
  // （assertStaticCspCompatible 每次建置都在守）。
  // nonce 由 buildCsp 在此之上加入。
  "script-src": ["'self'"],

  // 注意 style-src 與 style-src-attr 是**分開的兩條**。
  //
  // style-src-attr 從 D11 起一直放行 'unsafe-inline'，理由是 Vue 的 `:style` 產生 inline
  // style **屬性**。換成 React 之後那個理由沒了：React 的 `style={{…}}`、Base UI 的定位與
  // 捲動鎖定都走 CSSOM（`element.style.x = …`），CSP 不管那條路。C245 在 enforce 下把
  // 會彈出的五支（Select／DropdownMenu／DatePicker／Dialog／AlertDialog）逐一打開，
  // 收成 'none' 與原本的 'unsafe-inline' 兩邊的位置、捲動鎖定、違規逐項相同。
  //
  // ⚠️ 這一條擋的是 HTML 裡的 `style="…"` 與 `setAttribute("style", …)`。日後加進來的
  // 第三方元件若走這兩條，症狀是**樣式安靜地沒套上**（console 有一行 violation）——
  // 那時要改的是元件，要放寬就得改 UNSAFE_INLINE_ALLOWED_IN，review 看得到。
  "style-src": ["'self'"],
  "style-src-attr": ["'none'"],

  "img-src": ["'self'", "data:"],
  "font-src": ["'self'"],

  // 同源 BFF（D8）。跨源請求會讓 SameSite cookie 失效，
  // 也是資料外洩到第三方端點最常見的途徑。
  "connect-src": ["'self'"],

  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'none'"],
  "object-src": ["'none'"],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
};

/** 絕不允許出現在任何指令中的值。測試會逐一驗證。 */
export const FORBIDDEN_VALUES = ["'unsafe-eval'", "'unsafe-hashes'", "*"] as const;

/**
 * 允許使用 `'unsafe-inline'` 的指令。**C245 起是空的**。
 *
 * 這個清單存在的意義是讓「再加一條例外」變成必須修改本檔、
 * 因而必然出現在 code review 的動作 —— 而不是某人在 nginx 設定裡悄悄加一個字。
 */
export const UNSAFE_INLINE_ALLOWED_IN = [] as const;

export interface CspOptions {
  /**
   * 每次請求隨機產生的 nonce（base64）。由 BFF 注入 script 標籤與本標頭。
   * dev 模式可省略 —— Vite 的模組載入方式與 production 不同。
   */
  readonly nonce?: string;
  /** 收集 violation 的端點。report-only 階段必填，否則收不到任何回報。 */
  readonly reportUri?: string;
}

function serialise(directives: CspDirectives): string {
  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");
}

export function buildCsp(options: CspOptions = {}): string {
  const directives: Record<string, readonly string[]> = { ...BASE_DIRECTIVES };

  if (options.nonce !== undefined) {
    directives["script-src"] = [...BASE_DIRECTIVES["script-src"]!, `'nonce-${options.nonce}'`];
  }

  let policy = serialise(directives);

  if (options.reportUri !== undefined) {
    policy += `; report-uri ${options.reportUri}`;
  }

  return policy;
}

/**
 * CSP 之外的安全標頭。
 *
 * 這些沒有 CSP 那麼容易踩雷，但少了一樣就是滲透測試報告上的一條。
 */
export const OTHER_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // frame-ancestors 已涵蓋，但舊瀏覽器與部分掃描器仍會找這一條。
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export interface SecurityHeaderOptions extends CspOptions {
  /**
   * true 時使用 `Content-Security-Policy-Report-Only`。
   *
   * **上線一定要從這裡開始**，跑 1–2 週收 violation（第三方 UI 元件、字型、
   * 圖表 lib 一定會有你沒想到的），收斂後再切 enforce。
   * 直接上 enforce 通常三天後被回滾，然後 CSP 在該團隊永遠不會再被提起。
   */
  readonly reportOnly: boolean;
  /** HSTS 的 max-age 秒數。僅在 HTTPS 下有意義，預設兩年。 */
  readonly hstsMaxAge?: number;
}

export function buildSecurityHeaders(
  options: SecurityHeaderOptions,
): Readonly<Record<string, string>> {
  const cspHeader = options.reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  return {
    [cspHeader]: buildCsp(options),
    "Strict-Transport-Security": `max-age=${options.hstsMaxAge ?? 63_072_000}; includeSubDomains`,
    ...OTHER_SECURITY_HEADERS,
  };
}
