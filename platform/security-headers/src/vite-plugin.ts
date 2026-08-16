import { buildSecurityHeaders } from "./policy.ts";

/**
 * 在 `vite dev` 就套用安全標頭。
 *
 * 為什麼值得做：CSP violation 在 production 才發現，代價是回滾；
 * 在 staging 發現，代價是一輪部署；在**寫的當下**發現，代價是十秒鐘。
 *
 * 開發者的 console 會直接跳出 violation，而不是等到某天有人回報
 * 「圖表在正式站上不會動」。
 *
 * 預設是 report-only：dev 環境強制 enforce 只會擋住 Vite 自己的 HMR，
 * 讓大家第一件事就是把這個外掛關掉。
 */

// Vite 的 Plugin 型別由 `vite` 提供，但這個 package 刻意不依賴 vite ——
// 它同時要被 BFF（Node，無 Vite）消費。用結構型別描述所需的最小介面即可。
//
// 這兩個型別出現在 `securityHeaders` 的公開簽章裡，所以必須 export ——
// 不是為了給人用，是因為 tools/api-surface 記錄型別形狀時對具名型別只印名字，
// 而沒有 export 的名字它追蹤不到：改名一次形狀就漂一次，閘門只能判成
// 破壞性變更。理由與實測寫在 tools/api-surface/src/shape.ts。
export interface DevServerLike {
  readonly middlewares: {
    use(handler: (req: unknown, res: ResponseLike, next: () => void) => void): void;
  };
}

export interface ResponseLike {
  setHeader(name: string, value: string): void;
}

export interface SecurityHeadersPluginOptions {
  /** dev 環境預設 report-only。設 false 會擋住 Vite 的 HMR，不建議。 */
  readonly reportOnly?: boolean;
  readonly reportUri?: string;
}

export function securityHeaders(options: SecurityHeadersPluginOptions = {}): {
  name: string;
  apply: "serve";
  configureServer(server: DevServerLike): void;
} {
  const headers = buildSecurityHeaders({
    reportOnly: options.reportOnly ?? true,
    reportUri: options.reportUri,
    // dev 不注入 nonce。而且 production 目前**也不需要** nonce ——
    // 實測建置產物零個 inline script，因此 CSP 可以是一行靜態回應標頭，
    // 任何反向代理都設得出來。這個前提由 assertStaticCspCompatible()
    // 在每次建置守住（見 static-csp.ts 與 DECISIONS.md 的 R6）。
    //
    // 一旦那個檢查開始報錯，就代表需要 per-request nonce，
    // 也就是需要一個會改寫 HTML 內容的中間層 —— 那是完全不同量級的組織需求。
  });

  return {
    name: "@org/security-headers",
    apply: "serve",

    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const [name, value] of Object.entries(headers)) {
          // dev 是 http，HSTS 在此無意義且會污染 localhost 的瀏覽器狀態
          //（設過之後該 localhost port 會被強制 https，很難清）。
          if (name === "Strict-Transport-Security") continue;
          res.setHeader(name, value);
        }
        next();
      });
    },
  };
}
