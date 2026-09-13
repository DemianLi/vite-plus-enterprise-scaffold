import { defineConfig, loadEnv } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { assertNoUndeclaredEnv } from "@org/config";
import { assertStaticCspCompatible, securityHeaders } from "@org/security-headers";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // ── 機密外洩的編譯期檢查 ────────────────────────────────────────────
  // VITE_ 前綴的值會被編譯進 bundle 明文。這行讓「有人在 .env 加了
  // VITE_API_SECRET」直接變成建置失敗，而不是上線後被 gitleaks 掃出來。
  assertNoUndeclaredEnv(env);

  // ── dev proxy 的 BFF 目標 ───────────────────────────────────────────
  //
  // 兩邊都要讀。`.env.example` 教的是在 `.env` 寫 `BFF_ORIGIN`，而 `.env`
  // 的值只會進到上面那個 `env` —— 只讀 `process.env` 的話，
  // 照文件設定的人**什麼都不會發生，也不會有錯誤訊息**。
  //
  // 順序不能反：真的環境變數是 CI 與「臨時指去別的 gateway」用的，
  // `.env` 是躺在磁碟上的預設值。
  //
  // 刻意用 `||` 而不是 `??`：`BFF_ORIGIN=` 這種空值要當成沒設，
  // 否則 proxy target 會變成空字串 —— dev server 照常啟動，
  // 而每一個 /api 請求都失敗。
  const bffOrigin = process.env["BFF_ORIGIN"] || env["BFF_ORIGIN"] || "http://localhost:8080";

  return {
    plugins: [
      react(),

      // Tailwind v4。它會改變建置產物：拿掉的話建置照樣成功，產出的是一個
      // 完全沒有樣式的應用。
      tailwindcss(),

      // 在 dev 就套用安全標頭（report-only）。
      //
      // CSP violation 在 production 才發現，代價是回滾；在 staging 發現，
      // 代價是一輪部署；在寫的當下發現，代價是十秒鐘。
      //
      // production 的標頭由 gateway／BFF 下發，用的是同一份政策
      //（@org/security-headers 是唯一定義）。目前**不需要** nonce ——
      // 建置產物零個 inline script，靜態標頭就夠，見下面的 assertStaticCspCompatible。
      securityHeaders({ reportUri: "/api/csp-report" }),

      // 守住「靜態 CSP 標頭就夠」這個前提。
      //
      // 只要建置產物出現任何 inline script，CSP 就需要 per-request nonce，
      // 而那代表組織端必須有一個會**改寫 HTML 內容**的中間層 ——
      // nginx 的靜態檔案服務、CDN、S3+CloudFront 全都做不到。
      // 換句話說，這個外掛守的不是一條 lint，是部署的成本級距。
      assertStaticCspCompatible(),
    ],

    build: {
      // ── sourcemap 產生但不部署 ──────────────────────────────────
      // 'hidden' 會產出 .map 卻不寫 sourceMappingURL 註解。
      // 部署流程只上傳 .map 到錯誤追蹤系統，不放上 web server ——
      // 掃描器與滲透測試撿不到原始碼，on-call 卻救得回線上錯誤。
      sourcemap: "hidden",
    },

    server: {
      proxy: {
        // ── dev 必須鏡像 production 的來源配置 ────────────────────
        // BFF 一定要與 SPA 同源（走 /api 路徑前綴），否則 SameSite cookie
        // 形同虛設。dev 若用不同 origin，會出現「本機好好的、上線就掛」——
        // 而且掛的是認證，最難查。
        //
        // 另一端是本機的 BFF（開發時用 mock）。沒有東西在聽的話，
        // 「登入 → 帶 cookie → 被 CSRF 擋 → 補標頭 → 通過」這整條路徑在本機一次都走不到。
        "/api": {
          target: bffOrigin,
          changeOrigin: false,
        },
      },
    },
  };
});
