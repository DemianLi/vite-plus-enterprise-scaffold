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
 * 變體用純物件查表就夠（見 UiButton.tsx）。少一個相依就是少一筆 SCA 範圍、
 * 少一筆鏡像清單。
 *
 * ── 它的成本：2026-08-19 量過，決定不動 ─────────────────────────
 *
 * `tailwind-merge` 3.6.0 內建 LRU 快取，`cacheSize` 預設 **500**，
 * **鍵是併好的整條 class 字串**。所以成本的計量單位是**相異字串數**，
 * 不是實例數 —— 一張表格 500 個 cell 用同一個元件，共用**一格**快取。
 *
 *   快取命中（第二次以後）        0.14 – 0.21 µs
 *   快取未命中（真的合併一次）    65 – 224 µs  ⚠️ 這 3.4 倍的差距不是雜訊，
 *                                 是 class 字串長度（141 vs 503 字元）
 *   一個元件實例掛載本身          約 2.8 µs  ⚠️ **SSR 的數字**，用戶端帶
 *                                 真 DOM 會更貴 —— 分母變大，cn() 佔比更小
 *
 * 相異字串的**值域上界**是 10／500（Dialog 1、Input 1、Button 4 variant ×
 * 2 size）。⚠️ 是上界不是現況：Button 那 8 格只有在一個畫面真的用滿四種
 * variant 才都存在。加元件時把它乘上那個元件的 variant × size 值域，
 * 各案 provide 一份 theme 覆寫再多一組 —— **這就是下面「接近 500」的量法**。
 *
 * ⚠️ **React 的元件本體就是 render，所以 `cn()` 每次 render 都跑。** 上面那組
 * 數字因此以「每次 render 的每一個呼叫」計，而命中的那一格才是常態。
 * 2026-09-13 在 tailwind-merge 3.6.0 上重量單獨呼叫：命中一次最小 0.07 µs
 * （只跑 `clsx` 的對照組 0.014 µs）。**沒有量掛載增量**，所以「不必包
 * `useMemo`」是推論 —— 依賴比對與命中查表是同一個量級。
 * （Vue 版的論證建立在 `setup()` 每個實例只跑一次上，換成 React 就不成立。）
 *
 * ── ⚠️ 要在切片裡用 `cn()` 的話先讀這裡 ───────────────────────────
 *
 * `cn` 是 `@org/ui` 的公開 export，切片不得直接 import 的是
 * `clsx`／`tailwind-merge` 這些底層 —— 從 `@org/ui` 拿 `cn` 是**放行的**。
 * 所以下面這條只有這段話在守：
 *
 *   **不要把隨資料變的值拼進 `cn()` 的輸入**（例如每一列的寬度或狀態字串）。
 *   成本的單位是相異字串數，一張表格就能把 500 格快取填滿。
 *
 * 不為它加靜態檢查是因為認不準：輸入會不會隨資料變，原始碼層看不出來，
 * 而認不準的規則第一天就會被加例外，例外永遠不會拿掉。
 *
 * ── 什麼時候要重量 ─────────────────────────────────────────────────
 *
 * 1. **相異字串數接近 500** —— LRU 開始驅逐之後每次未命中是 65 – 224 µs，
 *    不是 0.07 µs。每加一個元件就把這個數字乘上它的 variant × size 值域，
 *    而各案傳一份 theme 覆寫會再多一組。
 * 2. **有人把隨資料變的值拼進 `cn()` 的輸入**（見上一段）。
 *
 * 重量的方法（照著做才對得起來）：
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
 * 而**沒有任何東西報錯** —— 這一格的 CSS 完全正確，是**執行期被丟掉的**。
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
 * ⚠️ 這份清單是手寫的：**`styles/index.css` 每加一個自訂代幣，這裡就要跟著登記**，
 * 漏了就是上面的症狀。
 */
/**
 * ⚠️ **方向性的子族也要登記，否則上面那個 bug 原封不動地復發。**
 *
 * `twMerge` 把 `border-width` 拆成十一個族（`border-w` 加十個方向），
 * 圓角拆成十五個。第一版只登記了不帶方向的那一個，於是
 *
 *   cn("border-b-control border-line")  →  "border-line"
 *
 * **完全一樣的症狀，只差一個 `-b-`。** 而它當場就咬到了：`UiTableHead` 的
 * 預設是 `border-b-control border-line`，所以表頭根本沒有下邊框。
 *
 * ⚠️ 核對這份清單時，方向性寫法要一起組進去問 —— 只問基本形式的話，
 * 一半的情況看起來被守住了，其實沒有。
 */
const BORDER_WIDTH_GROUPS = [
  "border-w",
  "border-w-x",
  "border-w-y",
  "border-w-s",
  "border-w-e",
  "border-w-bs",
  "border-w-be",
  "border-w-t",
  "border-w-r",
  "border-w-b",
  "border-w-l",
] as const;

/** `border-w-b` → `border-b`，也就是 utility 的實際前綴。`border-w` → `border`。 */
const BORDER_PREFIX: Readonly<Record<string, string>> = Object.fromEntries(
  BORDER_WIDTH_GROUPS.map((id) => [id, id === "border-w" ? "border" : `border-${id.slice(9)}`]),
);

const ROUNDED_GROUPS = [
  "rounded",
  "rounded-s",
  "rounded-e",
  "rounded-t",
  "rounded-r",
  "rounded-b",
  "rounded-l",
  "rounded-ss",
  "rounded-se",
  "rounded-ee",
  "rounded-es",
  "rounded-tl",
  "rounded-tr",
  "rounded-br",
  "rounded-bl",
] as const;

const classGroups: Record<string, unknown[]> = {
  "font-weight": [{ font: ["control", "heading"] }],
  shadow: [{ shadow: ["overlay"] }],
};
for (const id of BORDER_WIDTH_GROUPS) {
  classGroups[id] = [{ [BORDER_PREFIX[id] as string]: ["control"] }];
}
for (const id of ROUNDED_GROUPS) {
  classGroups[id] = [{ [id]: ["control", "surface"] }];
}

const twMerge = extendTailwindMerge({ extend: { classGroups } });

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
