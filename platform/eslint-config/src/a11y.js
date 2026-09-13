import jsxA11y from "eslint-plugin-jsx-a11y-x";
import tseslint from "typescript-eslint";

import nestedWorktrees from "./worktrees.js";

/**
 * 無障礙靜態閘門（HANDOFF 第 22 項）。
 *
 * ── 為什麼不併進本 package 的預設匯出 ───────────────────────────────
 *
 * `src/index.js` 的整份論證是「**只**管 oxlint 管不到的安全與邊界，
 * 兩邊零重疊，所以這條紅線亮起來就一定是真的」。無障礙既不是安全也不是
 * 邊界；把這一批規則塞進那個陣列，就等於把 Tier 2 的那個性質換掉 ——
 * 而那個性質正是它值得存在的原因。
 *
 * 另外 D10 給 Tier 2 的三條規則（不快取、不過濾、要有時間觸發）的理由是
 * 「安全掃描的結果會隨時間失效，即使程式碼一字未改」。**無障礙不會。**
 * 沒有新公布的 CVE 會讓一個有 alt 的 img 變成沒有 alt。所以這一軌跑在
 * Tier 1，理由寫在 `.github/workflows/tier1-quality.yml`。
 *
 * ── ⚠️ 這道閘門對本 repo 的實測結果是「零命中」，而模板是有缺陷的 ──
 *
 * 2026-08-16 把 Vue 那一軌的 23 條全開成 error 去掃本 repo 當時的 6 個 `.vue`：
 * **一條都沒命中**。同一天用人眼讀同樣那幾個檔案，讀出來的真缺陷有：
 * 表格沒有 caption、`<th />` 是空的、載入狀態沒有 live region、
 * `<nav>` 沒有可及名稱。**四個它一個都看不到。**
 *
 * 這不是外掛做得不好，是它的作用域：它比對的是**原生元素與屬性**。
 * 本 repo 的互動幾乎都包在元件裡（`UiButton`、`Link`、`Dialog.Root`），
 * 而元件對這批規則是透明的。Vue 那一軌隨 `.vue` 退場（C244，Q104），
 * 這個作用域的限制原封不動留給 `.tsx` 這一軌。
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
 * 上游沒標淘汰的全部，全部 error（C234）。
 *
 * 刻意不用外掛自己的 `flat/recommended`：那份 preset 會隨版本增減規則，
 * 而「這道閘門在守什麼」會因此變成一個要去讀上游 changelog 才答得出來的問題。
 * 從 `rules` 推導的好處是**新規則會自動進來**，而反向測試會因為 fixture 沒有
 * 涵蓋它而變紅 —— 也就是升級時一定有人看過新規則。
 *
 * 規則清單縮水時（外掛上游刪掉一條規則、或本地加 `.filter` 隱藏一條），
 * 減的方向由 `tools/compliance/ACCESSIBILITY.md` 這份 baseline 文件守。
 * `cli.ts --update` 是唯一產出出口，每次更新都會在版控的交付文件上留下 diff。
 *
 * 外掛是 `eslint-plugin-jsx-a11y-x`，上游 `eslint-plugin-jsx-a11y` 的分支（Q56，
 * 理由在 `pnpm-workspace.yaml` 的 catalog 那一列）。命名空間刻意仍叫 `jsx-a11y`：
 * 換回上游時規則 ID、fixture 與交付文件一個字都不必動。
 *
 * 上游 6.10.2 標淘汰的三條（`accessible-emoji`、`label-has-for`、`no-onchange`）
 * 這個分支已經拿掉；`meta.deprecated` 那道濾網留著，是給它之後再淘汰的規則用的 ——
 * 寫一份排除清單的話，理由同上：寫死的清單會過期。
 *
 * ⚠️ **不開淘汰規則不是調鬆門檻**：`label-has-for` 的預設要求 label **同時**包住
 * 控制項**而且**帶 `for` —— WCAG 兩種關聯方式任一種就成立，那個預設比它宣稱在守的
 * 標準更嚴（Vue 那一軌當年因此把它改成 `some`，C133 §七）；上游已經把它換成
 * `label-has-associated-control`，後者在這份清單裡。另外兩條的淘汰理由是瀏覽器與
 * 報讀軟體已經處理掉那個情況。
 *
 * ⚠️ 這一軌紅了的時候，先判「是規則比它宣稱的標準更嚴，還是畫面真的有缺陷」，
 * 不是先改選項 —— 下面三格覆寫都是那樣判過、由人裁的。
 */
const TSX_RULES = Object.fromEntries(
  Object.entries(jsxA11y.rules)
    .filter(([, rule]) => rule.meta?.deprecated !== true)
    .map(([name]) => [`jsx-a11y/${name}`, "error"]),
);

export default [
  // 這道閘門問的是「**這個 checkout** 裡的每一個 .tsx」，不是「這個目錄樹底下」——
  // 理由、實測與它為什麼不算改門檻，全部寫在 `worktrees.js`（C190）。
  nestedWorktrees,
  {
    /**
     * 建置產物與相依。
     *
     * ⚠️ 這一段是實測補的：`eslint .` 從 repo 根跑時掃到了
     * `apps/console/dist/assets/*.js`。那些檔案不會命中任何一條規則
     *（規則只掛在 `.tsx` 上），所以**它不會讓閘門變紅** —— 它只是安靜地
     * 讀進一批機器產生的檔案。這種「不會出錯所以看不出來」的浪費正是
     * 之後有人加規則時會突然爆出一堆無法處理的告警的來源。
     */
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  {
    /**
     * ⚠️ 這個 fixture 是**故意寫壞的**，而且它必須壞著 —— 反向測試靠它
     * 證明每一條規則真的會紅（見 `tests/a11y.test.ts`）。不排除的話這道
     * 閘門永遠是紅的，而紅的原因是我們自己種的。
     *
     * 與 `eslint.config.js` 排除 `.semgrep/**` 是同一個處理。排除範圍
     * 刻意只有這一個檔案，不是整個 `tests/` 目錄：一旦寫成目錄，
     * 之後任何人在 `tests/` 下加的 `.tsx` 都會安靜地不被檢查。
     *
     * ⚠️ 樣式刻意用萬用字元開頭，而不是從 repo 根算起的路徑。flat config 的
     * `ignores` 是相對於 **basePath** 比對的，而 basePath 隨呼叫端而變：
     * 閘門從 repo 根跑（`platform/eslint-config/tests/…`），反向測試從
     * 本 package 跑（`tests/…`）。寫死前綴的版本在其中一邊會安靜地失效 ——
     * 實測就是這樣紅的，而失效的方向是「fixture 沒被排除」＝閘門永遠紅。
     */
    ignores: ["**/tests/fixtures/a11y-violations.tsx"],
  },
  {
    files: ["**/*.tsx"],
    languageOptions: {
      /**
       * ⚠️ **這一格把 `src/index.js` 那個 `typescript: 6.0.3` 釘子綁上了這一軌**：
       * `.tsx` 的 JSX 與型別註記寫在同一段程式碼裡，不剖析 TS 就讀不到 JSX。
       * 只當語法剖析器用（沒有 `project`，不讀型別資訊），與 Tier 2 同一個用法；
       * 解除條件因此也相同 —— typescript-eslint 支援 TS 7 那天，兩軌一起解。
       */
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "jsx-a11y": jsxA11y },
    rules: TSX_RULES,
  },
  {
    /**
     * ⚠️ **`platform/ui` 的原生控制項基元：`control-has-associated-label` 關掉**（C236，人裁）。
     *
     * 那條規則在元件檔裡問「這個控制項有沒有名字」。而這一層的基元**刻意不自帶名字** ——
     * `UiInput`／`UiTextarea` 的 `id` 與名字由使用端給（`UiField` 的 `control`，或
     * `aria-label`），`UiField` 產一組 id 再一次綁上標籤與控制項（C84）。規則看不見
     * 那件事，看得見的只有「這裡沒有名字」。三格是明列的 prop（`UiInput.tsx` 檔頭）。
     *
     * ⚠️ **範圍刻意只有這個目錄**：切片與應用畫面裡的控制項仍然被這條規則守著，
     * 而那才是真的會漏掉標籤的地方。
     *
     * 這個區塊會被 `tools/compliance` 讀進交付文件的覆寫表；改 `files` 或加
     * 規則之後 `node tools/compliance/src/cli.ts --update`，不然閘門紅。
     */
    files: ["platform/ui/src/components/**/*.tsx"],
    rules: { "jsx-a11y/control-has-associated-label": "off" },
  },
  {
    /**
     * ⚠️ **`prefer-tag-over-role` 在這幾支關掉（C236，人裁）。** `.tsx` 那一軌第一次掃到真的
     * 元件時紅的一條 —— 照上面「先判規則是不是比標準嚴」的處理，判定是規則比較嚴：
     *
     *   `UiAlert`     要 `role="status"` 改成 `<output>`。規格上 `<output>` 是「計算或使用者
     *                 動作的結果」，而它的隱含即時播報在報讀軟體間支援不一致 —— 明寫 role
     *                 反而可靠。`danger` 那一支的 `role="alert"` 沒有對應的標籤可換。
     *   `UiSeparator` 要 `role="separator"` 改成 `<hr>`。那只是語意模式；預設的裝飾模式是
     *                 `role="none"`，照樣得用 `<div>`，而 preflight 給 `<hr>` 的上框線會讓
     *                 語意模式比裝飾模式多一條線。
     *
     *   `OrderList`   載入中／查無資料的播報區 `role="status"`，理由同 `UiAlert`（C240，Q93 人裁）。
     *
     * 兩支元件的 DOM 與 Vue 版逐字相同（C236 當時逐組比對過，凍結在
     * `platform/ui/tests/ssr-expected.json`，C243）。
     * ⚠️ **範圍刻意是檔名，不是目錄**：其他元件與切片、畫面裡的 role 照樣被這條守。
     */
    files: [
      "platform/ui/src/components/UiAlert.tsx",
      "platform/ui/src/components/UiSeparator.tsx",
      "features/order/src/views/OrderList.tsx",
    ],
    rules: { "jsx-a11y/prefer-tag-over-role": "off" },
  },
];
