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

  // ── dev proxy 的 BFF 目標 ───────────────────────────────────────────
  //
  // 兩邊都要讀。`.env.example` 教的是在 `.env` 寫 `BFF_ORIGIN`，而 `.env`
  // 的值只會進到上面那個 `env` —— 這一行原本只讀 `process.env`，於是
  // 照文件設定的人**什麼都不會發生，也不會有錯誤訊息**（#95 的 ②b）。
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
      vue(),

      // D15 —— Tailwind v4。
      //
      // ⚠️ 這個 plugin **會改變建置產物**。加任何會改變產物的 plugin 之前，
      // 要先確認 D2 的退出演練不會產出一份沒有它的設定、建置成功、
      // 卻交出一個完全沒有樣式的應用。
      //
      // **這一版沒有東西在守這件事** —— 它是一條要靠人記得的規矩。
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

    test: {
      coverage: {
        // ── 覆蓋率的射程（C120）────────────────────────────────────
        //
        // ⚠️ 這一格**在此之前是錯的，而錯的樣子是滿分**。這支設定檔存在，
        // 於是根層 `vite.config.ts` 的 `test` 區塊整塊不繼承，覆蓋率退回
        // v8 的預設射程 —— 只有「測試載入過的檔案」進分母。實測結果是
        // 報表寫 **100%**（`bff-routes.ts` 與 `src/features.ts` 兩支），
        // 而 `main.ts`／`App.vue`／`DevSession.vue` 連出現都沒有。
        // 校正射程之後是 **13.20%**（#130）。
        //
        // ⚠️ `bff-routes.ts` 必須逐支列出來 —— 它住在 package 根目錄不在
        // `src/`，而它有專屬測試。#130 第一版的射程漏了它，`apps/console`
        // 因此低報成 2.12%。**射程寫錯不會報錯。**
        include: ["src/**", "bff-routes.ts"],

        // ⚠️ **刻意不設門檻，而這是裁決不是遺漏**（C120 §四）。這支 app 的
        // 分母有 75% 來自 `main.ts` 與 `DevSession.vue`，兩支都是被
        // `dev-session-stripped.test.ts` **編譯**過、沒有被**執行**過 ——
        // 把線畫在一個量測產物上，一年後沒有人答得出「為什麼是這個數字」。
        // 切片那一半的門檻收在 `src/usecases/**`，而這支 app 沒有那一層。
      },
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
          target: bffOrigin,
          changeOrigin: false,
        },
      },
    },
  };
});
