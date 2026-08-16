import a11y from "eslint-plugin-vuejs-accessibility";
import vueParser from "vue-eslint-parser";

/**
 * 無障礙靜態閘門（HANDOFF 第 22 項）。
 *
 * ── 為什麼不併進本 package 的預設匯出 ───────────────────────────────
 *
 * `src/index.js` 的整份論證是「**只**管 oxlint 管不到的安全與邊界，
 * 兩邊零重疊，所以這條紅線亮起來就一定是真的」。無障礙既不是安全也不是
 * 邊界；把 23 條規則塞進那個陣列，就等於把 Tier 2 的那個性質換掉 ——
 * 而那個性質正是它值得存在的原因。
 *
 * 另外 D10 給 Tier 2 的三條規則（不快取、不過濾、要有時間觸發）的理由是
 * 「安全掃描的結果會隨時間失效，即使程式碼一字未改」。**無障礙不會。**
 * 沒有新公布的 CVE 會讓一個有 alt 的 img 變成沒有 alt。所以這一軌跑在
 * Tier 1，理由寫在 `.github/workflows/tier1-quality.yml`。
 *
 * ── ⚠️ 這道閘門對本 repo 的實測結果是「零命中」，而模板是有缺陷的 ──
 *
 * 2026-08-16 把 23 條全開成 error 去掃本 repo 當時的 6 個 `.vue`：
 * **一條都沒命中**。同一天用人眼讀同樣那幾個檔案，讀出來的真缺陷有：
 * 表格沒有 caption、`<th />` 是空的、載入狀態沒有 live region、
 * `<nav>` 沒有可及名稱。**四個它一個都看不到。**
 *
 * 這不是這個 plugin 做得不好，是它的作用域：它比對的是**原生元素與屬性**。
 * 本 repo 的互動幾乎都包在元件裡（`UiButton`、`RouterLink`、`DialogRoot`），
 * 而元件對這 23 條規則是透明的 —— 實測 `<UiButton @click>` 與
 * 空的 `<RouterLink></RouterLink>` 都不會紅。
 *
 * 所以這道閘門的定位要講清楚：**它守的是靜態可查的那一半，
 * 而那一半在這個 repo 的寫法下幾乎是空的。** 綠燈不代表頁面可用。
 * 看不見的那一類具名列在 HANDOFF 第 22 項，不要靠這個綠燈取代它。
 *
 * ── 等級 ────────────────────────────────────────────────────────
 *
 * ⚠️ 這裡**刻意不寫任何 WCAG 等級**。要哪個等級、驗收怎麼判、有沒有法定
 * 強制，以 RFP 為準（HANDOFF 第 22 項與第 21 項同一個處理：契約是事實來源，
 * 不是我們的印象）。把等級寫進程式碼註解，等於用一句沒有來源的話去回答
 * 稽核會問的問題。
 */

/**
 * 23 條全開，全部 error。
 *
 * 刻意不用 plugin 自己的 `flat/recommended`：那份 preset 會隨版本增減規則，
 * 而「這道閘門在守什麼」會因此變成一個要去讀上游 changelog 才答得出來的問題。
 * 從 `rules` 推導的好處是**新規則會自動進來**，而下面那條反向測試會因為
 * fixture 沒有涵蓋它而變紅 —— 也就是升級時一定有人看過新規則。
 */
const ALL_RULES = Object.fromEntries(
  Object.keys(a11y.rules).map((name) => [`vuejs-accessibility/${name}`, "error"]),
);

export default [
  {
    /**
     * 建置產物與相依。
     *
     * ⚠️ 這一段是實測補的：`eslint .` 從 repo 根跑時掃到了
     * `apps/console/dist/assets/*.js`。那些檔案不會命中任何一條規則
     *（規則只掛在 `.vue` 上），所以**它不會讓閘門變紅** —— 它只是安靜地
     * 讀進一批機器產生的檔案。這種「不會出錯所以看不出來」的浪費正是
     * 之後有人加規則時會突然爆出一堆無法處理的告警的來源。
     */
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  {
    /**
     * ⚠️ 這個 fixture 是**故意寫壞的**，而且它必須壞著 —— 反向測試靠它
     * 證明 23 條規則真的會紅（見 `tests/a11y.test.ts`）。不排除的話這道
     * 閘門永遠是紅的，而紅的原因是我們自己種的。
     *
     * 與 `eslint.config.js` 排除 `.semgrep/**` 是同一個處理。排除範圍
     * 刻意只有這一個檔案，不是整個 `tests/` 目錄：一旦寫成目錄，
     * 之後任何人在 `tests/` 下加的 `.vue` 都會安靜地不被檢查。
     *
     * ⚠️ 樣式刻意用萬用字元開頭，而不是從 repo 根算起的路徑。flat config 的
     * `ignores` 是相對於 **basePath** 比對的，而 basePath 隨呼叫端而變：
     * 閘門從 repo 根跑（`platform/eslint-config/tests/…`），反向測試從
     * 本 package 跑（`tests/…`）。寫死前綴的版本在其中一邊會安靜地失效 ——
     * 實測就是這樣紅的，而失效的方向是「fixture 沒被排除」＝閘門永遠紅。
     */
    ignores: ["**/tests/fixtures/a11y-violations.vue"],
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        /**
         * `parser: false` ＝ 不剖析 `<script>` 區塊，只剖析 template。
         *
         * 這 23 條規則全部只看 template AST，所以腳本剖析器是純負擔 ——
         * 而**省掉它換到的東西不小**：`src/index.js` 為了 typescript-eslint
         * 不支援 TS 7，在本 package 釘了一份 `typescript: 6.0.3`。
         * 這一軌完全不碰那個釘子，所以 TS 7 的支援何時到位跟它無關。
         *
         * ⚠️ fixture 刻意留了一個 `<script setup lang="ts">` 區塊，
         * 就是為了讓這一行被實際走到。改回 `parser: tseslint.parser`
         * 之前先想清楚：那會把上面那個釘子重新綁上來。
         */
        parser: false,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: { "vuejs-accessibility": a11y },
    rules: ALL_RULES,
  },
];
