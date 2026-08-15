/**
 * `@org/ui` —— 設計系統的唯一公開契約（D15）。
 *
 * ── 為什麼元件住在這裡而不是各切片裡 ────────────────────────────────
 *
 * shadcn 的模型是「你擁有原始碼」，所以「複製到哪」是一個必須回答的架構問題。
 * D4 已經把答案決定了：切片禁止互相依賴，所以複製進每個切片就**沒有任何
 * 機制能讓它們收斂** —— 設計系統會在第二個切片出現的那天碎片化，
 * 而且沒有人會發現，因為每一片自己看起來都是對的。
 *
 * 放在 `platform/` 換來的是既有治理：CODEOWNERS、api-surface 的破壞性變更
 * 閘門、退出演練的 alias 清單。多的是流程，不是新的架構概念。
 *
 * ── 這份 export 清單就是 API 表面 ───────────────────────────────────
 *
 * `tools/api-surface` 會盯著它。移除或改名任何一個 export 都算破壞性變更，
 * 必須登記在 `removes` 裡並附 codemod —— 因為所有切片都依賴這個 package，
 * 一個沒登記的改名會同時打斷所有團隊。
 *
 * ── 不要從這裡轉出 reka-ui ─────────────────────────────────────────
 *
 * 使用端只該看到我們包裝過的元件。直接轉出 reka-ui 的基元等於把
 * 「哪些基元可以用」這件事交給每個團隊各自決定 —— 而其中 **Splitter
 * 會在執行期注入 `<style>`，被本 repo 的 `style-src 'self'` 擋掉**。
 * 那條限制由 `tools/conformance` 強制，這裡不開後門。
 */

export { default as UiButton } from "./components/UiButton.vue";
export { default as UiDialog } from "./components/UiDialog.vue";
export { cn } from "./utils/cn.ts";
