/**
 * 「靜態 CSP 標頭就夠」這個前提的守門人（D11 / R6）。
 *
 * ── 為什麼這件事值得一個檢查 ────────────────────────────────────────
 *
 * R6 原本的問法是「組織有沒有能設 cookie 的同源中間層」。但 CSP 這半邊還有
 * 一個更貴的隱藏需求：**只要建置產物裡有任何 inline script，CSP 就需要 nonce**，
 * 而 nonce 是 per-request 的，代表必須有東西**逐次請求改寫 index.html**。
 *
 * 那是一道很硬的門檻：nginx 的 static file server 做不到、CDN 做不到、
 * S3＋CloudFront 做不到。「我們有 gateway」的團隊，十有八九指的是能加標頭、
 * 能轉發、能設 cookie 的東西 —— 不是能改寫 HTML 內容的東西。
 *
 * 實測本專案的 `dist/index.html`：**零個 inline script**（Vue 3 + Vite 的
 * 產物只有 `<script type="module" src>` 與 `<link rel=stylesheet>`）。
 * 所以 nonce 不需要，CSP 可以是一行靜態回應標頭，任何反向代理都設得出來。
 *
 * 但那是一個**會靜默消失的性質**：有人貼一段分析工具的 inline snippet、
 * 有人加一個注入 inline script 的 plugin，這個前提就沒了 ——
 * 而症狀不是建置失敗，是上線後 CSP 把自家的 script 擋掉，或者更糟：
 * 有人為了讓它動，把 `'unsafe-inline'` 加進 script-src，整份 CSP 當場歸零。
 *
 * 所以這裡把它變成建置期的硬性失敗。發現的成本從「滲透測試開單」降到十秒鐘。
 */

/** 一筆違規。`escalation` 說明它讓組織端的要求貴了多少 —— 那才是重點。 */
export interface StaticCspViolation {
  readonly kind: string;
  readonly excerpt: string;
  readonly reason: string;
}

// 全部刻意寫成單層量詞的字面 regex。
// 巢狀量詞會被 Tier 2 的 security/detect-unsafe-regex 擋下，而那條規則是對的
//（本專案已經因此改過三次程式碼，見 DECISIONS.md 的 C19）。
const SCRIPT_TAG = /<script\b([^>]*)>/gi;
const HAS_SRC = /\bsrc\s*=/i;
const STYLE_TAG = /<style\b/gi;
const EVENT_HANDLER_ATTRIBUTE = /\son[a-z]+\s*=/gi;
const JAVASCRIPT_URL = /["'(\s]javascript:/gi;

function excerpt(text: string, at: number): string {
  return text.slice(Math.max(0, at - 20), at + 60).replace(/\s+/g, " ");
}

/**
 * 掃描 HTML，回傳所有會逼出 nonce（或逼出 `'unsafe-inline'`）的東西。
 *
 * 不解析 DOM 是刻意的：這支要在建置流程裡跑，不該為了一個守門檢查引入
 * 一個 HTML parser 相依（D2 的同一條理由）。詞法比對在這裡夠用 ——
 * 我們找的是「有沒有」，不是「在哪個節點下」。
 */
export function findStaticCspViolations(html: string): StaticCspViolation[] {
  const violations: StaticCspViolation[] = [];

  for (const match of html.matchAll(SCRIPT_TAG)) {
    const attributes = match[1] ?? "";
    if (HAS_SRC.test(attributes)) continue;
    violations.push({
      kind: "inline-script",
      excerpt: excerpt(html, match.index),
      reason:
        "inline <script> 需要 script-src 的 nonce 或 hash。" +
        "nonce 是 per-request 的，代表必須有東西逐次請求改寫這份 HTML —— " +
        "靜態檔案伺服器與 CDN 都做不到。",
    });
  }

  for (const match of html.matchAll(STYLE_TAG)) {
    violations.push({
      kind: "inline-style-block",
      excerpt: excerpt(html, match.index),
      reason:
        "policy 的 style-src 是 'self'，inline <style> 區塊會被擋掉。" +
        "（注意：Vue 的 :style 產生的是 style **屬性**，由 style-src-attr 管，不受此限。）",
    });
  }

  for (const match of html.matchAll(EVENT_HANDLER_ATTRIBUTE)) {
    violations.push({
      kind: "inline-event-handler",
      excerpt: excerpt(html, match.index),
      reason:
        "onclick 這類屬性需要 'unsafe-hashes'，而它在 FORBIDDEN_VALUES 裡。" +
        "改用 addEventListener 或框架的事件繫結。",
    });
  }

  for (const match of html.matchAll(JAVASCRIPT_URL)) {
    violations.push({
      kind: "javascript-url",
      excerpt: excerpt(html, match.index),
      reason: "javascript: URL 等同 inline script，且是 XSS 最老的入口之一。",
    });
  }

  return violations;
}

export function formatStaticCspViolations(
  fileName: string,
  violations: readonly StaticCspViolation[],
): string {
  const lines = violations.map(
    (violation) => `  ✗ [${violation.kind}] …${violation.excerpt}…\n      ${violation.reason}`,
  );

  return (
    `\n[@org/security-headers] ${fileName} 破壞了「靜態 CSP 就夠」的前提：\n\n` +
    `${lines.join("\n\n")}\n\n` +
    "  這不只是一條 lint。它改變的是**組織端要準備什麼**：\n\n" +
    "    修掉之前：CSP 是一行靜態回應標頭 —— nginx / CDN / gateway 都設得出來\n" +
    "    修掉之後：需要 per-request nonce，也就是需要一個會改寫 HTML 內容的中間層\n" +
    "              （靜態檔案伺服器與 CDN 做不到，見 DECISIONS.md 的 R6）\n\n" +
    "  所以請優先改掉這段 inline 內容，而不是放寬 CSP。\n" +
    "  真的無法避免時，改的是 @org/security-headers 的 policy 與部署架構，\n" +
    "  兩者都會出現在 code review —— 這正是本檢查存在的目的。\n"
  );
}

// Vite 的 Plugin 型別由 `vite` 提供，但本 package 刻意不依賴 vite ——
// 它同時要被 BFF（Node，無 Vite）消費。用結構型別描述所需的最小介面即可。
//
// export 的理由同 vite-plugin.ts 的 DevServerLike：它出現在公開簽章裡，
// tools/api-surface 追蹤不到沒有 export 的名字。
export interface OutputAssetLike {
  readonly type?: string;
  readonly fileName?: string;
  readonly source?: unknown;
}

/**
 * 建置期外掛。掛在 `writeBundle`，因此涵蓋所有實際寫出的 HTML，
 * 包含由其他 plugin 產生的那些。
 */
export function assertStaticCspCompatible(): {
  name: string;
  apply: "build";
  writeBundle(options: unknown, bundle: Record<string, OutputAssetLike>): void;
} {
  return {
    name: "@org/security-headers:static-csp",
    apply: "build",

    writeBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset") continue;
        if (asset.fileName === undefined || !asset.fileName.endsWith(".html")) continue;

        const source =
          typeof asset.source === "string"
            ? asset.source
            : new TextDecoder().decode(asset.source as Uint8Array);

        const violations = findStaticCspViolations(source);
        if (violations.length > 0) {
          throw new Error(formatStaticCspViolations(asset.fileName, violations));
        }
      }
    },
  };
}
