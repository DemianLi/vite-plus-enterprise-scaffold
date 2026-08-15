import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import tseslint from "typescript-eslint";

/**
 * Tier 2 安全閘門（D5 / D10）。
 *
 * ── 這份設定刻意只有十幾條規則 ──────────────────────────────────────────
 *
 * 規則少不是偷懶，是設計。oxlint 已經在管對錯與風格（Tier 1，跑本機、秒級）；
 * 這裡**只**管 oxlint 管不到的安全與邊界。兩邊零重疊，所以：
 *
 *   - 不會出現「oxlint 說這樣、ESLint 說那樣」的內戰
 *   - CI 跑得快，誤報少
 *   - 開發者不會學會忽略它 —— 這條紅線亮起來，就一定是真的
 *
 * 因此**不 extend 任何 recommended preset**：那些會帶進大量風格規則，
 * 與 oxlint 正面衝突，並在幾週內把這道閘門變成大家眼中的雜訊。
 *
 * 存在的首要理由：oxlint 的 847 條規則裡**沒有 `vue/no-v-html`**。
 * 那是 Vue 專案最主要的 XSS 入口，只有這一軌擋得住。
 *
 * ── ⚠️ TypeScript 版本並存（實測踩到的坑）────────────────────────────
 *
 * 工作區用 TypeScript 7（vite-plus 的 catalog 釘死 ^7.0.2），但
 * typescript-eslint 到 8.67.0 為止**明確拒絕在 TS 7 上執行**，一跑就整個中止：
 *
 *     Error: typescript-eslint does not support TS 7.0.
 *
 * 追蹤中：github.com/typescript-eslint/typescript-eslint/issues/10940
 *
 * 因應：本 package 在自己的 dependencies 釘一份 `typescript: 6.0.3`。
 * pnpm 的隔離式 node_modules 讓 typescript-eslint 的 peer 解析落在本 package
 * 範圍內，因此它拿到 TS 6，工作區其餘部分仍是 TS 7 —— 兩者互不干擾。
 *
 * 這麼做是安全的，因為本軌**只把 typescript-eslint 當語法剖析器用**，
 * 完全不使用型別資訊（下面每一條規則都是純 AST 比對）。剖析器版本落後一個
 * 大版本，只影響它能不能認得最新語法，不影響安全規則的判斷正確性。
 *
 * 解除條件：typescript-eslint 支援 TS 7 後，刪掉這行 pin 並改回 catalog:。
 */
export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.d.ts"],
  },

  // ── TypeScript / JavaScript ───────────────────────────────────────────
  {
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      security,
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      // ── XSS：DOM sink ──────────────────────────────────────────────
      // innerHTML / outerHTML / insertAdjacentHTML / document.write。
      // 這是前端 XSS 最直接的兩條路，Sonar 與 Checkmarx 也都盯這裡。
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",

      // ── 注入與程式碼執行 ────────────────────────────────────────────
      "security/detect-eval-with-expression": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-child-process": "error",

      // ── ReDoS ─────────────────────────────────────────────────────
      // 使用者可控輸入撞上災難性回溯的正規表達式 → 單一請求打掛整個 tab。
      "security/detect-unsafe-regex": "error",
      "security/detect-non-literal-regexp": "warn",

      // ── 時序攻擊 ──────────────────────────────────────────────────
      "security/detect-possible-timing-attacks": "warn",

      // ── 刻意關閉 ──────────────────────────────────────────────────
      // detect-object-injection 的誤報率極高（任何 obj[key] 都會中），
      // 開著只會逼大家滿檔案寫 eslint-disable，連帶讓真正的告警被忽略。
      // 這個面向交給 Semgrep / Sonar 的資料流分析處理，它們判得準得多。
      "security/detect-object-injection": "off",
    },
  },

  // ── Vue 單檔元件 ──────────────────────────────────────────────────────
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      vue,
      security,
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      // ★ 本軌存在的首要理由。oxlint 沒有這條規則。
      "vue/no-v-html": "error",
      "vue/no-v-text-v-html-on-component": "error",

      // tabnabbing：target="_blank" 未加 rel="noopener" 時，
      // 開啟的頁面可透過 window.opener 竄改來源分頁。
      "vue/no-template-target-blank": [
        "error",
        { allowReferrer: false, enforceDynamicLinks: "always" },
      ],

      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      "security/detect-eval-with-expression": "error",
    },
  },
];
