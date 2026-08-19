import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * 合併 Tailwind class，後者覆蓋前者。
 *
 * ── 為什麼需要 twMerge 而不是字串串接 ──────────────────────────────
 *
 * Tailwind 的 class 之間沒有優先順序概念，`"p-2 p-4"` 的結果取決於
 * **產生的 CSS 裡誰排在後面**，不是誰寫在後面。於是「元件預設 p-2、
 * 使用端傳 p-4 想覆蓋」這件事會**看情況成功或失敗** —— 而且失敗時沒有錯誤，
 * 只是間距不對。
 *
 * `twMerge` 認得 Tailwind 的類別族，同族只留最後一個。這不是便利工具，
 * 它是「使用端能不能覆蓋元件樣式」這條契約成立的前提。
 *
 * ── 為什麼不裝 class-variance-authority ────────────────────────────
 *
 * 變體用純物件查表就夠（見 Button.vue）。少一個相依就是少一筆 SCA 範圍、
 * 少一筆鏡像清單、少一次 --capture —— 與 D2 當初不裝 YAML parser 的同一條理由。
 *
 * ── 它的成本：2026-08-19 量過，決定不動（C75）─────────────────────
 *
 * `tailwind-merge` 3.6.0 內建 LRU 快取，`cacheSize` 預設 **500**，
 * **鍵是併好的整條 class 字串**。所以成本的計量單位是**相異字串數**，
 * 不是實例數 —— 一張表格 500 個 cell 用同一個元件，共用**一格**快取。
 *
 *   快取命中（第二次以後）        0.14 – 0.21 µs
 *   快取未命中（真的合併一次）    65 – 224 µs　⚠️ 這 3.4 倍的差距不是雜訊，
 *                                 是 class 字串長度（141 vs 503 字元）
 *   一個元件實例掛載本身          約 2.8 µs　⚠️ **SSR 的數字**，用戶端帶
 *                                 真 DOM 會更貴 —— 分母變大，cn() 佔比更小
 *
 * 相異字串的**值域上界**是 10／500（Dialog 1、Input 1、Button 4 variant ×
 * 2 size）。⚠️ 是上界不是現況：Button 那 8 格只有在一個畫面真的用滿四種
 * variant 才都存在。加元件時把它乘上那個元件的 variant × size 值域，
 * 各案 provide 一份 theme 覆寫再多一組 —— **這就是下面「接近 500」的量法**。
 *
 * ⚠️ **`<script setup>` 的本體是 `setup()`，每個實例跑一次，不是每次 render。**
 * `computed()` 有快取，依賴沒變就不重算。實測掛載後觸發 10 次重繪，
 * 這兩種形狀都是 0 次 —— 而**直接寫在 render 裡**（沒有 `computed` 包）
 * 是 10 次。目前三個元件都不是那個形狀。
 *
 * ── ⚠️ 要在切片裡用 `cn()` 的話先讀這裡 ───────────────────────────
 *
 * `cn` 是 `@org/ui` 的公開 export，而 D15 的檢查擋的是切片直接 import
 * `reka-ui`／`clsx`／`tailwind-merge` —— 從 `@org/ui` 拿 `cn` 是**放行的**
 * （實測 conformance 全綠）。所以下面這條沒有閘門在守，只有這段話：
 *
 *   **不要在 render function 或 `v-for` 的本體裡呼叫 `cn()`。**
 *   放在 `<script setup>` 的本體、或包一層 `computed()`。
 *
 * 不為它加靜態檢查是因為認不準：`computed(() => cn(…))` 與
 * `() => h("div", { class: cn(…) })` 在原始碼層長得很像，而認不準的規則
 * 第一天就會被加例外，例外永遠不會拿掉（C41）。
 *
 * ── 什麼時候要重量 ─────────────────────────────────────────────────
 *
 * 1. **相異字串數接近 500** —— LRU 開始驅逐之後每次未命中是 65 – 224 µs，
 *    不是 0.2 µs。每加一個元件就把這個數字乘上它的 variant × size 值域，
 *    而各案 provide 一份 theme 覆寫會再多一組。
 * 2. **有人把 `cn()` 寫進真的每次 render 都跑的位置**（見上一段）。
 *
 * 重量的方法（C75 第五節的教訓，照著做才對得起來）：
 *   - 取**最小值**不取中位數。微量測的雜訊是單邊的 —— 沒有東西會讓程式
 *     跑得比它真正需要的還快。實測一次 GC 停頓就把中位數拉到「提到 module
 *     層之後反而慢 62%」那種不可能的數字。
 *   - 對照組要**交錯**跑，不要各量各的。分段量會把 JIT 與 GC 的漂移整包
 *     算到後面那一組頭上（第一版就是這樣量出「慢的比快的快 15%」）。
 *   - 兩支獨立的量測（單獨量 `cn()`／放進真的掛載裡量增量）**對得上**
 *     才可以寫下來。
 */
/**
 * ⚠️ **本 repo 的自訂代幣要登記，否則 `twMerge` 會把它們分錯族。**
 *
 * `twMerge` 認得的是 **Tailwind 出廠的**類別族。`border-control` 這種名字
 * 它只能猜，而它猜錯 —— `border-<名字>` 看起來像顏色，所以它把
 * `border-control`（寬度）歸進 `border-color`，於是
 *
 *   cn("border-control border-line")  →  "border-line"
 *
 * **寬度那一格被丟掉了。** 而 Tailwind 的 preflight 是 `border: 0 solid`，
 * 所以少了寬度 utility ＝ **邊框寬度 0 ＝ 完全看不見**。
 *
 * 2026-08-19 的 review 實測發現這件事**已經上線了**：`UiButton` 的
 * `secondary`（**預設**那個 variant）、`UiInput`、以及當時剛寫好的
 * `UiCheckbox`，三個的邊框全都是 0。畫面上是一塊白底、沒有框，
 * 而**沒有任何閘門說話** —— `theme-verify` 驗的是 CSS 產物與懸空引用，
 * 而這一格的 CSS 完全正確，是**執行期被丟掉的**。
 *
 * 那正是這個檔案上面那段（「看情況成功或失敗，而且失敗時沒有錯誤」）
 * 描述的形狀，發生在它自己身上。
 *
 * 四個分錯族的（都實測過）：
 *
 *   border-control                 被當成顏色 → 與 border-line 互斥
 *   font-control / font-heading    被當成字族 → 吃掉 font-sans
 *   rounded-control / -surface     不被認得   → 與 rounded-lg 兩個都留
 *   shadow-overlay                 不被認得   → 與 shadow-xs 兩個都留
 *
 * 前兩個是**少東西**（安靜壞掉），後兩個是**多東西**（CSS 順序決定，
 * 也就是 `twMerge` 存在的理由本身失效）。
 *
 * ⚠️ 這份清單是手寫的，所以 `tests/cn.test.ts` 從 `styles/index.css`
 * 推導代幣名反過來驗它 —— **加一個代幣卻忘了登記會紅**。手寫清單本身
 * 不是問題，沒有東西在守它才是（C71）。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "border-w": [{ border: ["control"] }],
      "font-weight": [{ font: ["control", "heading"] }],
      rounded: [{ rounded: ["control", "surface"] }],
      shadow: [{ shadow: ["overlay"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
