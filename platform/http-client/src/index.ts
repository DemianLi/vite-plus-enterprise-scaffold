import { config } from "@org/config";
import { CSRF_COOKIE, CSRF_HEADER, SAFE_METHODS } from "@org/bff-contract";

/**
 * 唯一允許的對外請求出口（D8）。
 *
 * 設計前提：**沒有 token 存在於 JS 裡**。
 * 認證憑證是 BFF 設的 httpOnly cookie，瀏覽器自動帶上，前端程式碼碰不到也偷不走。
 * 因此本模組沒有、也不應該有任何 setToken / getToken / localStorage 的介面 ——
 * 那類 API 一旦存在，就會有人拿來存 token，D8 的保證當場失效。
 *
 * 切片被禁止直接 import axios/fetch（見 vite.config.ts 的 no-restricted-imports），
 * 否則 CSRF 標頭與錯誤處理會每片各做一套，稽核時無從證明一致性。
 */

export class HttpError extends Error {
  // 這裡刻意不用 TypeScript 的建構子參數屬性（constructor(readonly x: T)）：
  // base tsconfig 開了 erasableSyntaxOnly，那個語法無法只靠移除型別註記轉成 JS，
  // 因此被禁用。這個設定是刻意的 —— 它保證原始碼可被任何純型別抹除的工具處理
  // （Node 原生 type stripping、oxc、esbuild），不綁死在特定編譯器上。
  readonly status: number;
  readonly url: string;
  readonly body: unknown;

  constructor(status: number, url: string, body: unknown) {
    super(`HTTP ${status} ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

/** 401：session 過期或未登入。導向 BFF 的登入端點，由伺服器端處理 OIDC 流程。 */
export class UnauthenticatedError extends HttpError {
  override readonly name = "UnauthenticatedError";
}

/** 403：已登入但權限不足。與 401 分開，因為處置方式完全不同。 */
export class ForbiddenError extends HttpError {
  override readonly name = "ForbiddenError";
}

/**
 * Double-submit cookie 的 CSRF 防護。
 *
 * BFF 在登入時設一個**非** httpOnly 的 XSRF-TOKEN cookie（這支是刻意可讀的），
 * 前端把它回填到請求標頭。攻擊者的跨站請求帶得動 cookie，卻讀不到值來填標頭
 * （同源政策擋住），因此偽造請求會被伺服器端比對擋下。
 *
 * 注意：這支 cookie 可讀是設計的一部分，不是疏漏。真正的 session cookie 仍是
 * httpOnly，偷到 XSRF-TOKEN 沒有任何用處。
 *
 * ⚠️ **名稱從 `@org/bff-contract` 匯入，不在這裡定義。**
 * 前端與中間層對這兩個名字的認知一旦分歧，每個非 GET 請求都會 403，
 * 而且是上線當天才發現。名字由雙方 import 同一份定義，是唯一不會漂移的做法
 *（同一個道理見 @org/security-headers 之於 CSP）。
 */

function readCsrfToken(): string | undefined {
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === CSRF_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return undefined;
}

const SAFE_METHOD_SET = new Set(SAFE_METHODS);

export interface RequestOptions extends Omit<RequestInit, "body" | "credentials"> {
  readonly method?: string;
  readonly json?: unknown;
  readonly signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();

  // 相對於同源的 BFF 前綴。絕不接受完整 URL —— 跨源請求會讓 SameSite 失效，
  // 且是資料外洩到第三方端點最常見的途徑。
  if (/^[a-z]+:\/\//i.test(path)) {
    throw new Error(`[http-client] 不接受絕對 URL："${path}"。所有請求必須經由同源的 BFF（D8）。`);
  }

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (!SAFE_METHOD_SET.has(method)) {
    const csrf = readCsrfToken();
    if (csrf === undefined) {
      throw new Error(
        `[http-client] 缺少 ${CSRF_COOKIE} cookie，無法送出 ${method} 請求。` +
          `通常代表尚未登入，或 BFF 未正確設定 CSRF cookie。`,
      );
    }
    headers.set(CSRF_HEADER, csrf);
  }

  const url = `${config.apiBasePath}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    // 不可設定成其他值：httpOnly session cookie 靠這個帶上去。
    credentials: "include",
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });

  if (!response.ok) {
    const body = await response.text().then(
      (text) => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      },
      () => undefined,
    );

    if (response.status === 401) throw new UnauthenticatedError(401, url, body);
    if (response.status === 403) throw new ForbiddenError(403, url, body);
    throw new HttpError(response.status, url, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const http = {
  get: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, json?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: "POST", json }),
  put: <T>(path: string, json?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: "PUT", json }),
  patch: <T>(path: string, json?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: "PATCH", json }),
  delete: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: "DELETE" }),
} as const;
