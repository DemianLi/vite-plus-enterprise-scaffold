/**
 * `a11y.js` 的型別宣告。
 *
 * ── 為什麼是手寫的 `.d.ts` ──────────────────────────────────────────
 *
 * ESLint 的 flat config 刻意維持成 `.js`（它由 `eslint` 直接載入，
 * 不經過建置）。而 `tools/compliance` 要從它推導「前置過濾器實際檢查哪些
 * 規則」放進交付文件 —— 那是 TypeScript，需要一個形狀。
 *
 * ⚠️ **手寫的宣告會與實作漂移，所以消費端不准信任它到底。**
 * `tools/compliance/src/a11y.ts` 的 `preFilterRules()` 在找不到 `rules`
 * 時**丟例外**而不是回空陣列 —— 宣告說謊時的症狀因此是當場爆炸，
 * 不是一份少了整節內容、看起來卻很正常的交付文件。
 *
 * ⚠️ **不要為了這個檔案去改 `package.json` 的 `exports`。** TypeScript 會自己
 * 找 `a11y.js` 旁邊的同名 `.d.ts`，不需要 `types` 條件；而加上那個條件會把
 * `"./a11y"` 從字串變成物件，`tools/api-surface` 當場判成**破壞性變更**並
 * 要求一份 codemod —— 而消費端其實什麼都沒變。第一版就是這樣紅的。
 */
declare const config: readonly { readonly rules?: Record<string, unknown> }[];
export default config;
