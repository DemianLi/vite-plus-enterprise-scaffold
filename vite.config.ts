import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";

/**
 * Tier 1（品質快軌）設定 — D5 / D10。
 *
 * 本檔只放「對錯與風格」規則。安全規則一律不放這裡，走 eslint.config.js（Tier 2）。
 * 兩邊規則集刻意零重疊：oxlint 管對錯與風格，ESLint 只管安全與邊界。
 * 沒有交集就沒有內戰，也就不會有人學會忽略 lint。
 */
export default defineConfig({
  // 本機模板註冊（D9）。D3 選了單一 org monorepo 之後，`vp create` 的意思
  // 就從「開新 repo」變成「在 monorepo 內長出一個新切片」。
  //
  //     vp create slice --directory=features/<name> -- \
  //       --slice=<name> --title=<顯示名> --team=@org/<team>
  //
  // ⚠️ 選項必須用 `--opt=value` 形式：bingo 的 CLI 把 `--opt value` 當布林旗標。
  create: {
    templates: [
      {
        name: "slice",
        description: "產生一個符合契約的 vertical slice",
        template: "./tools/slice-gen",
      },
    ],
  },
  plugins: [vue()],

  fmt: {},

  lint: {
    plugins: ["import", "typescript", "unicorn", "oxc", "vue", "promise"],

    rules: {
      // D11 — CSP 無 unsafe-eval 的前提：執行期不得有任何 eval 語意。
      "no-eval": "error",
      "no-implied-eval": "error",
      // 循環依賴會讓切片邊界在執行期失效，且使 SAST 的資料流分析失準。
      "import/no-cycle": "error",
    },

    overrides: [
      {
        // ── SAST 規則的 fixture ────────────────────────────────────
        // `.semgrep/rules.ts` 裡的程式碼是**故意寫壞的**，用來證明
        // semgrep 的規則真的會命中（見該檔案的檔頭）。它不進任何建置。
        //
        // ⚠️ 加這條之前，oxlint 的 no-implied-eval 與 ESLint 的
        // no-unsanitized/property 各自獨立地抓到了它 —— 那正好確認
        // 這份 fixture 是真的壞程式碼，不是一個假想的壞例子。
        // ⚠️ 規則名要帶 plugin 前綴。不帶的話它從 error 降成 warning
        // 而不是關掉 —— 看起來像生效了，其實只是換一種顏色。
        files: [".semgrep/**"],
        rules: {
          "no-eval": "off",
          "no-implied-eval": "off",
          // ⚠️ 只有這一條有 typescript/ 版本；寫 `typescript/no-eval` 會讓
          // 整個 lint 設定建不起來（Rule not found），連掃都不會開始。
          "typescript/no-implied-eval": "off",
        },
      },
      {
        // ── D4 邊界防護第 2 層 ─────────────────────────────────────
        // 第 1 層（manifest）與第 3 層（相對路徑逃逸）在 tools/conformance，
        // 跑 Tier 2、繞不過。這一層跑本機，讓最常見的違規在編輯器裡當場現形。
        files: ["features/*/**"],
        rules: {
          // 擋裸模組名的跨切片 import，以及繞過 @org/http-client 的行為（D8）。
          "no-restricted-imports": [
            "error",
            {
              patterns: ["@org/feature-*", "**/features/*", "axios", "ky", "got", "superagent"],
            },
          ],

          // ⚠️ 這裡**刻意不用** import/no-relative-parent-imports。
          //
          // 初版用了它來擋「相對路徑逃逸 package 根目錄」，實測後發現它太鈍：
          // 它擋掉的是**所有** `../`，包含 src/views/OrderList.vue 匯入同一個
          // package 內的 `../api.ts` —— 那是完全合法的內部結構。
          // 開著它等於強迫每個切片變成扁平目錄，DX 代價高到大家會去關掉它，
          // 那才是真正的破口。
          //
          // 真正需要的是「解析後是否仍在 package 根目錄內」，這需要路徑解析而非
          // 語法比對。已改為在 tools/conformance 精確實作（見該檔的
          // checkRelativeEscapes）。取捨：失去編輯器即時回饋，換得零偽陽性。
        },
      },
    ],

    options: {
      typeAware: true,
      typeCheck: true,
    },
  },

  run: {
    // D10 — Tier 1 的主要提速手段。vp 沒有 changed-since 過濾器，
    // affected 偵測若要做，見 tools/conformance/README.md 的 git diff 方案。
    cache: true,
  },
});
