<script setup lang="ts">
import { inject } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiInputSlot } from "../theme.ts";

/**
 * 單行輸入框。
 *
 * ── 這個檔案是「從 shadcn-vue 抄一個元件進來」的第一個實例 ─────────────
 *
 * 來源：`unovue/shadcn-vue` 的 `apps/v4/registry/bases/reka/ui/input/Input.vue`
 * 加上 `registry/styles/style-vega.css` 的 `.cn-input`（vega ＝ 官方說的
 * 「classic shadcn/ui look」）。**兩份都要**，因為它的元件檔裡沒有樣式 ——
 * cva 表與 class 屬性裡只有語意 class 名，utility 住在 preset CSS。
 *
 * 抄進來要改的四樣，每一樣都是實際踩到的：
 *
 *   1. `useVModel`（@vueuse/core）→ 原生 `defineModel`。少一個相依，
 *      而每個相依都是一筆 SCA 範圍與鏡像清單。
 *   2. `cn(…, props.class)` → 拿掉。Vue 對單根元件會自動合併 fallthrough 的
 *      `class`，多宣告一個 `class` prop 只是讓 api-surface 多記一格。
 *   3. 它的代幣詞彙 → 我們的語意代幣（下面逐條對照）。
 *   4. `dark:` 變體 → 拿掉。本 repo 還沒有深色模式，留著會是**寫了但無效**
 *      的 class —— 而那正是 theme-verify 在防的那種「看起來有做」。
 *
 * ── 代幣對照 ⚠️ **這張表是人工核對的，沒有閘門在守** ─────────────────
 *
 * 這裡原本寫著「漏翻的會被 tools/theme-verify 當場擋下」。**那句話是假的**，
 * 實測過：把 `border-line` 改回上游的 `border-input`，theme-verify 仍然
 * 全綠（「0 處原始顏色、0 處懸空引用」）。未翻譯的上游代幣既不是原始色、
 * 也不是懸空引用 —— 它是一個「合法但不是我們的」名字，而 palette.ts 現有的
 * 兩類違規都認不得它。那道檢查是 issue #57，還沒做。
 *
 * 所以抄下一個元件的人：**這張表要自己逐條核**，漏一條那一格顏色就永遠
 * 換不掉，而且不會有任何紅燈。
 *
 *   border-input                → border-line
 *   focus-visible:border-ring   → focus-visible:border-focus
 *   ring-ring/50                → ring-focus/50
 *   aria-invalid:*-destructive  → aria-invalid:*-danger
 *   placeholder:text-muted-fg   → placeholder:text-fg-muted
 *   file:text-foreground        → file:text-fg
 *   rounded-md                  → rounded-control
 *   border                      → border-control
 *
 * ⚠️ 高度用 `h-10` 而不是上游的 `h-9`：本 repo 的 `UiButton` md 是 `h-10`，
 * 而表單裡輸入框與按鈕並排時差 4px 是看得出來的。上游那兩個數字本來就
 * 不對齊（它的 button default 是 h-8），所以這裡照我們自己的尺規。
 *
 * ── 為什麼 aria-invalid 的樣式要留著 ────────────────────────────────
 *
 * 那是上游帶來的、成本為零的無障礙行為：表單驗證失敗時輸入框自己會變色，
 * 而 `aria-invalid` 同時是螢幕閱讀器讀得到的狀態。自己寫的話多半會寫成
 * 一個 `:class="{ error: hasError }"`，畫面對了、輔具讀不到。
 */

/** 內容。上游用 `useVModel`，這裡用原生的 —— 少一個相依。 */
const model = defineModel<string | number>({ default: "" });

/**
 * ⚠️ 只有一個槽，名字取自上游的 `data-slot="input"`。
 *
 * 刻意**不**做 size 這條軸：上游的 Input 沒有 size prop，而我們沒有第二個
 * 尺寸的需求。真的需要時再加是一筆 minor（新增 union 成員），
 * 現在先做一個「大概會用到」的 size 是 D16 說的那種過度設計。
 */
const DEFAULT_PARTS: Readonly<Record<UiInputSlot, string>> = {
  input: cn(
    "h-10 w-full min-w-0 rounded-control border-control border-line bg-transparent px-3 py-1",
    "text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
    "placeholder:text-fg-muted",
    "focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50",
    "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
  ),
};

// ⚠️ 上面 DEFAULT_PARTS 的 cn() 是**每個實例跑一次**（`<script setup>` 的
// 本體就是 `setup()`），不是每個 module 一次，也不是每次 render。
// 量過了，那樣是對的 —— 理由與數字在 utils/cn.ts 的檔頭與 C75。
const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiInputSlot, string>> = {
  input: theme.UiInput?.input ?? DEFAULT_PARTS.input,
};
</script>

<template>
  <input v-model="model" data-slot="input" :class="parts.input" />
</template>
