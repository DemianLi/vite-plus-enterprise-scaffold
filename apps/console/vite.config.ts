import { defineConfig, loadEnv } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { assertNoUndeclaredEnv } from "@org/config";
import { assertStaticCspCompatible, securityHeaders } from "@org/security-headers";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // ── D8：機密外洩的編譯期閘門 ────────────────────────────────────────
  // VITE_ 前綴的值會被編譯進 bundle 明文。這行讓「有人在 .env 加了
  // VITE_API_SECRET」直接變成建置失敗，而不是上線後被 gitleaks 掃出來。
  assertNoUndeclaredEnv(env);

  return {
    plugins: [
      vue(),

      // D15 —— Tailwind v4。
      //
      // ⚠️ 這個 plugin **會改變建置產物**。加任何會改變產物的 plugin 之前，
      // 要先確認 D2 的退出演練不會產出一份沒有它的設定、建置成功、
      // 卻交出一個完全沒有樣式的應用。
      //
      // **這一版沒有東西在守這件事** —— 把那份帳目自動化的 tools/exit-drill
      // 留在 main（見 CHANGELOG）。在這個腳手架裡它是一條要靠人記得的規矩。
      tailwindcss(),

      // D11 —— 在 dev 就套用安全標頭（report-only）。
      //
      // CSP violation 在 production 才發現，代價是回滾；在 staging 發現，
      // 代價是一輪部署；在寫的當下發現，代價是十秒鐘。
      //
      // production 的標頭由 gateway／BFF 下發，用的是同一份政策
      //（@org/security-headers 是唯一定義）。目前**不需要** nonce ——
      // 建置產物零個 inline script，靜態標頭就夠，見下面的 assertStaticCspCompatible。
      securityHeaders({ reportUri: "/api/csp-report" }),

      // R6 —— 守住「靜態 CSP 標頭就夠」這個前提。
      //
      // 只要建置產物出現任何 inline script，CSP 就需要 per-request nonce，
      // 而那代表組織端必須有一個會**改寫 HTML 內容**的中間層 ——
      // nginx 的靜態檔案服務、CDN、S3+CloudFront 全都做不到。
      // 換句話說，這個外掛守的不是一條 lint，是 R6 的成本級距。
      assertStaticCspCompatible(),
    ],

    build: {
      // ── D11：sourcemap 產生但不部署 ──────────────────────────────
      // 'hidden' 會產出 .map 卻不寫 sourceMappingURL 註解。
      // 部署流程只上傳 .map 到錯誤追蹤系統，不放上 web server ——
      // 掃描器與滲透測試撿不到原始碼，on-call 卻救得回線上錯誤。
      sourcemap: "hidden",
    },

    server: {
      proxy: {
        // ── D8：dev 必須鏡像 production 的來源配置 ────────────────
        // BFF 一定要與 SPA 同源（走 /api 路徑前綴），否則 SameSite cookie
        // 形同虛設。dev 若用不同 origin，會出現「本機好好的、上線就掛」——
        // 而且掛的是認證，最難查。
        //
        // 另一端預設是 @org/bff-mock（`vpr bff` 啟動）。在它存在之前，
        // 這個 proxy 指向一個沒有東西在聽的埠 —— D8 的整條路徑
        //（登入 → 帶 cookie → 被 CSRF 擋 → 補標頭 → 通過）在本機從未被走過一次。
        "/api": {
          target: process.env["BFF_ORIGIN"] ?? "http://localhost:8080",
          changeOrigin: false,
        },
      },
    },
  };
});
