<script setup lang="ts">
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiTableRowSlot } from "../theme.ts";

/** 一列（`<tr>`）。 */

/** 放 `UiTableHeadCell` 或 `UiTableCell`。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiTableRowSlot, string>> = {
  /**
   * ⚠️ **沒有 hover。** 第一版寫了 `hover:bg-surface-hover`，而這個元件同時
   * 用在 `<thead>` 與 `<tbody>` —— 於是滑鼠移到**表頭**那一列也會變色，
   * 看起來像可以點（多半會被讀成「可以排序」），點下去什麼都沒發生。
   *
   * hover 回饋是「這一列可以互動」的視覺語彙，而那只對表身成立。
   * 現在由 `UiTableBody` 的 `[&>tr]:hover:…` 給。
   */
  row: "transition-colors",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiTableRowSlot, string>> = {
  row: theme.UiTableRow?.row ?? DEFAULT_PARTS.row,
};
</script>

<template>
  <tr data-slot="table-row" :class="parts.row">
    <slot />
  </tr>
</template>
