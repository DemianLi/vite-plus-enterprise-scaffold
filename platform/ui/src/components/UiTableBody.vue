<script setup lang="ts">
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiTableBodySlot } from "../theme.ts";

/** 表身（`<tbody>`）。放 `UiTableRow` ＋ `UiTableCell`。 */

/** 放 `UiTableRow`。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiTableBodySlot, string>> = {
  // 列與列之間用分隔線而不是斑馬紋：斑馬紋在只有兩三列時看起來像 bug，
  // 而且各案想換成斑馬紋只要覆寫這一格。
  //
  // ⚠️ hover 在這裡而不是 `UiTableRow` 上：那個元件同時用在 `<thead>` 與
  // `<tbody>`，寫在它身上的話**表頭也會 hover 變色**，看起來像可以點。
  body: "divide-y divide-line [&>tr]:hover:bg-surface-hover",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiTableBodySlot, string>> = {
  body: theme.UiTableBody?.body ?? DEFAULT_PARTS.body,
};
</script>

<template>
  <tbody data-slot="table-body" :class="parts.body">
    <slot />
  </tbody>
</template>
