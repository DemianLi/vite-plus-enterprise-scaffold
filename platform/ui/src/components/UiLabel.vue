<script setup lang="ts">
import { Label } from "reka-ui";
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiLabelSlot } from "../theme.ts";

/**
 * 表單欄位的標籤。
 *
 * ── 為什麼要獨立出來 ──────────────────────────────────────────────
 *
 * `UiCheckbox` 自己就有一個標籤（它把 `<Label>` 埋在裡面），而那是對的 ——
 * 核取方塊與它的文字是**一個互動單位**，分開就會有人忘了接 `for`
 *（C76 的 review 抓到的正是這件事）。
 *
 * 但 `UiInput`／`UiSelect`／`UiTextarea` 不一樣：它們的標籤在**版面上**是分開的
 *（上面一行、或左邊一欄），排版由使用端決定。埋進去就等於把版面決定寫死在
 * `platform/`。
 *
 * ⚠️ 所以 `for` 是**使用端的責任**，而這裡沒有任何閘門守得住它 ——
 * 「這個 `for` 有沒有對到一個真的存在的 `id`」是執行期的問題。
 * 少了它的症狀與 C76 那條一樣：點標籤不會聚焦、輔具讀不到欄位名字，
 * **而畫面完全正常**。
 *
 * 用 reka-ui 的 `Label` 而不是原生 `<label>`：它多做一件事 ——
 * **在標籤上按兩下不會選取文字**。那是原生 `<label>` 的老問題
 *（雙擊表單標籤會反白），而修它要 `onMousedown` 判斷 `detail > 1`。
 * 成本零、行為對，沒有理由自己寫。
 */

defineProps<{
  /** 對應欄位的 `id`。⚠️ 對不到就是沒有標籤，見檔頭。 */
  for: string;
}>();

/** 標籤內容。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiLabelSlot, string>> = {
  label: "text-sm font-control text-fg",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiLabelSlot, string>> = {
  label: theme.UiLabel?.label ?? DEFAULT_PARTS.label,
};
</script>

<template>
  <Label data-slot="label" :for="$props.for" :class="parts.label">
    <slot />
  </Label>
</template>
