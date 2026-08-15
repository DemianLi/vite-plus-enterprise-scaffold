/**
 * 市調的候選名單與判定。
 *
 * ── 為什麼名單寫在原始碼裡 ──────────────────────────────────────────
 *
 * 與 `tools/supply-chain` 的 `FAMILY_TIERS` 同一個理由：加一個候選、
 * 或把某個候選標成「已淘汰」，都是**判斷**，判斷要在 PR 上被看見。
 * 放 JSON 的話它會變成沒有人審的資料。
 *
 * ── 這份名單為什麼不是抄比較文章來的 ────────────────────────────────
 *
 * 2026-08-15 做這份調查時，搜到的四篇「2026 最佳 Vue UI 函式庫」
 * **全部把 PrimeVue 列為企業首選** —— 而 PrimeVue 已在 2026-06-28
 * 改為商業授權（需 license key、以編譯後套件發佈）。
 *
 * 排名文章比的是元件數與好不好看。這支工具比的是**這個 repo 真正的約束**：
 * 授權、CSP 相容性、供應鏈盤點成本。三者都可以由機器推導，所以就由機器推導。
 */

export interface Candidate {
  readonly name: string;
  /** 探測 CSP 行為時要下載的版本。留空表示用 dist-tags.latest。 */
  readonly version?: string;
  readonly kind: "styled" | "headless" | "css-engine" | "framework";
  /** 已知的淘汰原因。有值就不會進入 CSP 探測（省下下載）。 */
  readonly eliminated?: string;
}

export const CANDIDATES: readonly Candidate[] = [
  { name: "element-plus", kind: "styled" },
  { name: "reka-ui", kind: "headless" },
  { name: "vuetify", kind: "styled" },
  { name: "tailwindcss", kind: "css-engine" },
  { name: "unocss", kind: "css-engine" },
  {
    name: "primevue",
    kind: "styled",
    eliminated:
      "v5.0.0-rc.1（2026-06-28）起改為商業授權：需 license key、以編譯後套件發佈、" +
      "禁止還原原始碼。最後一個 MIT 穩定版是 4.5.5（2026-04-08）。" +
      "⚠️ GitHub master 的 LICENSE.md 仍是 MIT —— 那份是 v4 線的，以 tarball 內容為準。",
  },
  {
    name: "naive-ui",
    kind: "styled",
    eliminated:
      "CSS-in-JS 是核心機制（css-render）。注入點在主 bundle，且全套件零處提及 nonce，" +
      "直接撞本 repo 的 style-src 'self'。",
  },
  {
    name: "ant-design-vue",
    kind: "styled",
    eliminated:
      "12 個月零穩定版發版（最後 4.2.6，2024-11-11）。且同為 CSS-in-JS（emotion/stylis）。",
  },
  { name: "radix-vue", kind: "headless", eliminated: "已更名為 reka-ui，12 個月零發版。" },
  {
    name: "@headlessui/vue",
    kind: "headless",
    eliminated: "穩定版停在 1.7.23（2024-09-09），之後只有 insiders 預發版。",
  },
  {
    name: "@nuxt/ui",
    kind: "styled",
    eliminated: "65 個直接相依（含整套 tiptap、embla、ai），且耦合 @nuxt/kit／@nuxt/schema。",
  },
  { name: "quasar", kind: "framework", eliminated: "自帶建置系統與 CLI，與 D2 的驅動層定位衝突。" },
];

/**
 * 供應鏈增量測量的基線。
 *
 * ⚠️ **必須含 vite-plus。** 第一版沒有，於是 npm 為了滿足 `@tailwindcss/vite`
 * 的 peer 把上游 vite 也裝進來，`@rolldown/binding` 的 14 個原生二進位被算成
 * 「新增」—— 而那些本 repo 早就有。錯誤的結果是 +96 套件／49 原生，
 * 正確是 +61／23。基線錯了，整張成本表就是錯的，而它看起來一樣權威。
 */
export const SCA_BASELINE: readonly string[] = [
  "vue@^3.5.41",
  "vite@npm:@voidzero-dev/vite-plus-core@0.2.9",
  "vite-plus@0.2.9",
];

/** 要測增量的組合。標籤會直接出現在報告裡。 */
export const SCA_SCENARIOS: readonly { readonly label: string; readonly add: readonly string[] }[] =
  [
    { label: "element-plus", add: ["element-plus@^2.14.4"] },
    { label: "reka-ui（headless）", add: ["reka-ui@^2.10.3"] },
    { label: "只加 tailwind", add: ["tailwindcss@^4", "@tailwindcss/vite@^4"] },
    {
      label: "shadcn 組合（reka-ui + tailwind）",
      add: ["reka-ui@^2.10.3", "tailwindcss@^4", "@tailwindcss/vite@^4"],
    },
    { label: "vuetify", add: ["vuetify@^4.1.9"] },
  ];

/** 常見的寬鬆授權。不在這份清單上的都會被標出來給法務看，包含「沒有宣告」。 */
export const COMMON_LICENSES: readonly string[] = [
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-3-Clause",
  "BSD-2-Clause",
];
