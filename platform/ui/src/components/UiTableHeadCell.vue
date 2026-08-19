<script setup lang="ts">
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiTableHeadCellSlot } from "../theme.ts";

/**
 * 表頭的一格（`<th>`）。
 *
 * ── `scope="col"` 是這個元件存在的主要理由 ──────────────────────
 *
 * 螢幕閱讀器唸一個儲存格時會先唸它所屬的欄標題，而**那條關聯來自 `scope`**。
 * 少了它，使用者聽到的是一串沒有欄名的值。
 *
 * 自己寫 `<th>` 的人有一半會忘記它，而**畫面上完全看不出差別** ——
 * 那正是把它包成元件的理由：預設值就是對的。
 *
 * ⚠️ 沒有閘門在守「有沒有用這個元件」。切片大可以自己寫 `<th>`，
 * 而 `conformance` 的 D15 檢查擋的是 import 不是標籤。
 */

defineProps<{
  /**
   * 這一格是欄標題（`col`）還是列標題（`row`）。
   *
   * `row` 用在第一欄就是識別碼的表格（訂單編號、身分證字號）——
   * 那時每一列的第一格是那一列的標題。
   */
  scope?: "col" | "row";
}>();

/** 標題內容。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiTableHeadCellSlot, string>> = {
  cell: "px-3 py-2 text-left text-xs font-control text-fg-muted whitespace-nowrap",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiTableHeadCellSlot, string>> = {
  cell: theme.UiTableHeadCell?.cell ?? DEFAULT_PARTS.cell,
};
</script>

<template>
  <th data-slot="table-head-cell" :scope="scope ?? 'col'" :class="parts.cell">
    <slot />
  </th>
</template>
