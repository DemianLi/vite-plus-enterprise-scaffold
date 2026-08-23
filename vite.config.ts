import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";

/**
 * Tier 1（品質快軌）設定 — D5 / D10。
 *
 * 本檔只放「對錯與風格」規則，以及**複雜度**（C119 —— 它問的是「程式碼有沒有
 * 纏成一團」，同樣不是安全）。安全規則一律不放這裡，走 eslint.config.js（Tier 2）。
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

      // ── 層 1 複雜度（C119）────────────────────────────────────────
      //
      // 擋的是「agent 把自己纏進去、最後得人下場解」的程式碼。這一格屬於
      // 「對錯與風格」，因此落在本檔而不是 eslint.config.js —— 那一軌是
      // Tier 2 安全閘門，複雜度不是安全，塞進去會稀釋它的身分，而且紅燈
      // 會分不出是「有 XSS」還是「函式太長」。
      //
      // ⚠️ 這幾個數字**不是理想值，是觀測到的最大值**。定法（TESTING.md
      // 〈校準〉）是：第一次先設寬到不擋任何既有程式碼，每一次它真的擋下
      // 一件事就記一則 C 編號，收緊時附上那些 C 編號當論證。照抄外部建議
      // 值的代價 C108 已經付過 —— CI 第一天紅，而紅的原因不是程式碼變差。
      // 所以這裡取「剛好不擋」而不是「max + 一個憑空的餘裕」：任何 +N 都
      // 是沒有論證的數字，而 max 本身有 —— 它是這棵樹此刻的形狀。
      //
      // ⚠️ 行數含空行與註解（oxlint 預設，無 skipComments 選項）。這條線的
      // 註解密度遠高於一般專案，函式內的註解會直接灌進 max-lines-per-function。
      //
      // ⚠️ 認知複雜度那一格是空的，不是漏掉。oxlint 1.77 沒有這條規則
      // （`cognitive-complexity`、`sonarjs/*`、`oxc/cognitive-complexity`
      // 三種寫法都不存在，用 --print-config 逐一驗過）。唯一的來源是
      // eslint-plugin-sonarjs，而那要嘛新增一條相依到 Tier 2 安全閘門、
      // 要嘛為了一個維度另養一軌。⚠️ 下面的 complexity 是**循環**複雜度，
      // 是替代不是填滿：`slice-gen/src/files.ts` 的 buildSliceFiles 841 行、
      // 認知複雜度 0（#129 §五）—— 四個維度不互為代理。
      "max-lines-per-function": ["error", { max: 185 }],
      "max-depth": ["error", { max: 5 }],
      "max-params": ["error", { max: 6 }],
      complexity: ["error", { max: 36 }],

      // ⚠️ `<script setup>` 的 module 層在上面四條裡**一行都看不見**（只有
      // max-depth 例外，它不限函式）。platform/ui 的 24 個零函式 .vue、
      // 合計 1992 行 script，在四維分佈裡是 0 —— 表上乾淨是因為量不到，
      // 不是因為程式碼乾淨（#129 §六）。這條把「參數個數」換成 props 補回
      // 一格；區塊行數那一格 oxlint 沒有對應規則（vue/max-lines-per-block
      // 不存在），仍然空著。
      "vue/max-props": ["error", { maxProps: 5 }],
    },

    overrides: [
      {
        // ── 層 1 複雜度：測試碼是另一組數字（C119）──────────────────
        //
        // TESTING.md §六 已經承諾「兩類的門檻要分開設，而且不是同一組
        // 數字」。這裡不是為了寬鬆才分 —— 兩類的形狀差法不只一種：
        // 測試碼在巢狀深度與循環複雜度上比產品碼**乾淨得多**（89% 的
        // 測試函式 depth 0），但在函式大小上有一條產品碼沒有的長尾
        // （describe／it 的 callback，最大 455 行）。用同一組數字，
        // 會在一個維度太鬆、另一個維度把人卡死。
        //
        // ⚠️ 這一條的 files 若寫錯，症狀是**測試碼安靜地套用產品碼門檻**，
        // 而不是報錯 —— oxlint 對 glob 沒中一樣 exit 0。反向測試見 C119。
        files: ["**/tests/**", "**/*.test.*", "**/*.spec.*", "**/fixtures/**"],
        rules: {
          "max-lines-per-function": ["error", { max: 455 }],
          "max-depth": ["error", { max: 3 }],
          "max-params": ["error", { max: 4 }],
          complexity: ["error", { max: 11 }],
          "vue/max-props": ["error", { maxProps: 2 }],
        },
      },
      {
        // ── 唯一一個 per-file 放行（C119）──────────────────────────
        //
        // buildSliceFiles 841 行，佔 files.ts（858 行）的 98%，主體是一個
        // 回傳大物件的 return，值全是切片模板字串。它的認知複雜度是 0。
        //
        // ⚠️ 不把全域門檻抬到 841 的理由：那個數字是次高值（185）的 4.5 倍，
        // 抬上去等於這條規則對其餘所有產品碼形同不存在。孤立的極端值用
        // per-file 放行隔離，連續分佈用觀測 max —— 兩者都滿足「不擋任何
        // 既有程式碼」，但只有前者留下一條還在守東西的線。
        //
        // ⚠️ 這一行是**債，不是豁免**。它擋下的第一件事就是收緊的論證起點。
        files: ["tools/slice-gen/src/files.ts"],
        rules: {
          "max-lines-per-function": ["error", { max: 841 }],
        },
      },
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
