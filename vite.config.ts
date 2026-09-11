import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";

import { scaffoldLint, scaffoldOverrides } from "./vite.scaffold.ts";

/**
 * Tier 1（品質快軌）設定 — D5 / D10。
 *
 * 本檔只放「對錯與風格」規則，以及**複雜度**（C119 —— 它問的是「程式碼有沒有
 * 纏成一團」，同樣不是安全）。安全規則一律不放這裡，走 eslint.config.js（Tier 2）。
 * 兩邊規則集刻意零重疊：oxlint 管對錯、風格與複雜度，ESLint 只管安全與邊界。
 * 沒有交集就沒有內戰，也就不會有人學會忽略 lint。
 *
 * ⚠️ **這一支是團隊的，`vite.scaffold.ts` 是腳手架的**（C219，實作 C215 §六）。
 * 腳手架的外掛、規則、選項與它自己那幾格門檻都在那一支，這裡 spread 進來；團隊要加的
 * 規則、override 與業務碼的門檻寫在這裡。升級時上游改的是那一支，合併不會撞到這裡。
 */
export default defineConfig({
  // 本機模板註冊（D9）。D3 選了單一 org monorepo 之後，`vp create` 的意思
  // 就從「開新 repo」變成「在 monorepo 內長出一個新切片」。
  //
  //     vp create slice --directory=features/<name> -- \
  //       --slice=<name> --title=<顯示名> --team=@org/<team>
  //
  // ⚠️ 選項必須用 `--opt=value` 形式：bingo 的 CLI 把 `--opt value` 當布林旗標。
  // ⚠️ 它留在本檔、沒有搬進 `vite.scaffold.ts`：`vp create vite:generator` 會直接
  // 改寫這一段的文字（vite-plus 的 create 文件），搬走之後它會在這裡另起一份（C219）。
  create: {
    templates: [
      {
        name: "slice",
        description: "產生一個符合契約的 vertical slice",
        template: "./tools/slice-gen",
      },
    ],
  },
  // ⚠️ vite 的 plugin 留在本檔：退出演練的 plugin 帳目只讀退出面設定檔的文字
  // （`tools/exit-drill/src/plugins.ts`），搬走的 plugin 在演練裡等於不存在（C219）。
  plugins: [vue()],

  fmt: {},

  lint: {
    ...scaffoldLint,

    rules: {
      ...scaffoldLint.rules,

      // ── 業務碼的複雜度門檻：這幾個數字是**你們的**（C219，C215 §十）─────
      //
      // 它們是給 fork 的**起始值**：逐格等於 C219 之前管整棵樹的那一組，而**刻意不入
      // 棘輪** —— `threshold-check` 只量 `vite.scaffold.ts`，不會叫人把這裡降到上游
      // 示範碼的最大值（那組讀數記在 C219 §四）。理由是 C215 §一 判準一：腳手架不規定
      // 團隊怎麼寫程式。上游自己的 `apps/`、`features/` 也吃這一組，同樣沒有「降」的棘輪。
      //
      // ⚠️ 腳手架自己的碼（`tools/`、`platform/`）不吃這幾個數字 —— `vite.scaffold.ts`
      // 的 override 排在最後、蓋過它們。所以收緊這裡不會紅在你們改不了的地方。
      // ⚠️ AGENTS.md 規則二照樣適用：為了讓一次 CI 變綠而調鬆，不是一個決定。
      "max-lines-per-function": ["error", { max: 185 }],
      "max-depth": ["error", { max: 5 }],
      "max-params": ["error", { max: 6 }],
      complexity: ["error", { max: 39 }],
      "vue/max-props": ["error", { maxProps: 5 }],
    },

    overrides: [
      {
        // ── 業務碼的測試碼是另一組數字（C119）─────────────────────────
        // 分開設的理由寫在 `vite.scaffold.ts` 那一條「腳手架自己的測試碼」。
        // ⚠️ files 寫錯的症狀是**測試碼安靜地套用產品碼門檻**，不是報錯 ——
        // oxlint 對 glob 沒中一樣 exit 0。
        files: ["**/tests/**", "**/*.test.*", "**/*.spec.*", "**/fixtures/**"],
        rules: {
          "max-lines-per-function": ["error", { max: 455 }],
          "max-depth": ["error", { max: 3 }],
          "max-params": ["error", { max: 4 }],
          complexity: ["error", { max: 15 }],
          "vue/max-props": ["error", { maxProps: 2 }],
        },
      },

      // ⚠️ **這一行必須是最後一項**。oxlint 的 override 後者蓋前者：腳手架的碼要吃
      // 腳手架的數字，團隊在上面加的 override 才不會蓋到 `tools/`、`platform/`（C219 §二）。
      ...scaffoldOverrides,
    ],
  },

  run: {
    // D10 — Tier 1 的主要提速手段。vp 沒有 changed-since 過濾器，
    // affected 偵測若要做，見 tools/conformance/README.md 的 git diff 方案。
    cache: true,

    tasks: {
      // ⚠️ **它必須是 task 而不是 script，理由只有快取一件事**（C171 §九）。
      //
      // 上面那個 `cache: true` 同時打開 script 快取，而 `&&` 串起來的每一段會被
      // 拆成各自快取的子任務。這一支報的是「距上一個 tag 幾支」——
      // 它的輸入是 git 的 ref，**不是檔案**，自動資料追蹤看不到，於是第一趟之後
      // 永遠 cache hit。實測：`vpr ready` 印「5 支」而真值是 **8**。
      //
      // ⚠️ 一個凍住的數字與一個正確的數字在輸出上一模一樣，而這支**沒有紅燈**
      // 可以掉 —— 所以這一行是它能不能成立的前提，不是效能調校。
      //
      // ⚠️ 也實測過「讓 CLI 去讀 `.git` 底下的 ref 檔，把它們宣告成輸入」——
      // **無效**：提交之後仍然 cache hit。追蹤不看 `.git`。
      "release-distance": {
        command: "node tools/release-distance/src/cli.ts",
        cache: false,
      },
    },
  },
});
