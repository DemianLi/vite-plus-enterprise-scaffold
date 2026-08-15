#!/usr/bin/env node
import { createServer, request as httpRequest } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSecurityHeaders } from "@org/security-headers";

/**
 * 用**正式的 CSP（enforce，非 report-only）**服務**正式的建置產物**。
 *
 * ── 為什麼不能用 `vp dev` 驗 CSP ────────────────────────────────────
 *
 * dev 模式下 Vue 的 SFC 樣式是由 JS **在執行期注入 `<style>` 元素**的
 *（HMR 需要它）。也就是說 dev 一定會踩 `style-src 'self'` ——
 * 那些 violation **在 production 完全不存在**。
 *
 * 拿 dev 驗 CSP 只會得到一堆假警報，然後第一件事就是有人把 securityHeaders
 * 外掛關掉。`securityHeaders()` 預設 report-only 正是為了這個。
 *
 * 所以真正的驗證只有一種形狀：**production 產物 ＋ production 政策 ＋ enforce**。
 *
 * ── 為什麼是 enforce 而不是 report-only ─────────────────────────────
 *
 * report-only 只會在 console 印訊息，畫面照常運作 —— 於是「有沒有壞掉」
 * 要靠人去讀 console。enforce 會**真的擋掉**，壞掉的東西看得見。
 * 這是驗收工具，不是開發時的提示。
 *
 * ── 這支工具驗得到什麼、驗不到什麼 ──────────────────────────────────
 *
 * 驗得到：載入、渲染、以及你在瀏覽器裡實際點過的互動路徑。
 * **驗不到沒被點到的元件** —— UiDialog 的 violation 只有在對話框真的打開時
 * 才會出現。`tools/ui-survey --csp` 的靜態探測與這支是互補的，不是重複的。
 *
 * ⚠️ 需要先建置：`vp run -F @org/console build`。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const DIST = join(ROOT, "apps/console/dist");
const PORT = Number(process.env["CSP_VERIFY_PORT"] ?? 4173);
/**
 * BFF 的位置。D8 要求 BFF **與 SPA 同源**（走 /api 前綴），
 * 否則 SameSite cookie 形同虛設 —— 所以這裡代理而不是讓瀏覽器跨源打過去。
 * 跨源的話 connect-src 'self' 也會擋，而那是個假的 violation：
 * 正式環境根本不會跨源。
 */
const BFF_ORIGIN = process.env["BFF_ORIGIN"] ?? "http://localhost:8080";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// enforce，不是 report-only。理由見上面。
const HEADERS = buildSecurityHeaders({ reportOnly: false });

function resolveFile(urlPath: string): string | null {
  // 路徑穿越防護：正規化之後必須仍在 dist 內。
  // 這支工具只在本機跑，但一個「只在本機跑」的伺服器仍然是伺服器。
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(DIST, relative);
  if (!candidate.startsWith(DIST)) return null;

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  // SPA 後備：任何未命中的路徑都回 index.html，路由才走得起來。
  const fallback = join(DIST, "index.html");
  return existsSync(fallback) ? fallback : null;
}

function main(): number | null {
  if (!existsSync(DIST)) {
    console.error(
      `✗ 找不到建置產物：${DIST}\n` +
        "  先執行：./node_modules/.bin/vp run -F @org/console build\n" +
        "  這支工具刻意不自己觸發建置 —— 驗的必須是「將要部署的那一份」，\n" +
        "  而不是它順手產生的一份。",
    );
    return 1;
  }

  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url.startsWith("/api/")) {
      const target = new URL(url, BFF_ORIGIN);
      const proxied = httpRequest(
        {
          hostname: target.hostname,
          port: target.port,
          path: target.pathname + target.search,
          method: req.method,
          headers: req.headers,
        },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxied.on("error", () => {
        res.writeHead(502).end("BFF 沒有在聽。先啟動：./node_modules/.bin/vpr bff");
      });
      req.pipe(proxied);
      return;
    }

    const file = resolveFile(url.split("?")[0] ?? "/");
    if (file === null) {
      res.writeHead(404).end("not found");
      return;
    }

    for (const [name, value] of Object.entries(HEADERS)) {
      // 本機是 http，HSTS 會讓瀏覽器把這個 localhost port 記成強制 https，很難清。
      if (name === "Strict-Transport-Security") continue;
      res.setHeader(name, value);
    }
    res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });

  server.listen(PORT, () => {
    console.log(`CSP 驗證伺服器：http://localhost:${PORT}`);
    console.log("  產物：apps/console/dist");
    console.log("  政策：enforce（非 report-only），來自 @org/security-headers");
    console.log("\n  在瀏覽器 console 看 violation。**要實際點開對話框** ——");
    console.log("  沒被點到的元件不會產生 violation，而那正是最需要驗的那一個。\n");
  });

  // **不要 process.exit(0)。** 伺服器啟動成功之後這支程式要繼續活著 ——
  // 第一版寫成 process.exit(main())，於是 listen 才剛回呼就把自己殺掉，
  // 而 curl 只會得到「連線被拒」，看起來像埠沒開。
  return null;
}

const failure = main();
if (failure !== null) process.exit(failure);
