<script setup lang="ts">
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiTableRowSlot } from "../theme.ts";

/** 一列（`<tr>`）。 */

/** 放 `UiTableHeadCell` 或 `UiTableCell`。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiTableRowSlot, string>> = {
  row: "transition-colors hover:bg-surface-hover",
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
