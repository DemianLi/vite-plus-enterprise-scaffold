<script setup lang="ts">
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiTableHeadSlot } from "../theme.ts";

/**
 * 表頭（`<thead>`）。放 `UiTableRow` ＋ `UiTableHeadCell`。
 *
 * ⚠️ 名字是 `UiTableHead` 而不是上游的 `TableHeader`：上游用 `TableHeader`
 * 指 `<thead>`、`TableHead` 指 `<th>`，而那兩個名字差一個字母、指的是不同層級。
 * 這裡改成 `UiTableHead`（`<thead>`）與 `UiTableHeadCell`（`<th>`）——
 * **抄上游的詞彙是對的，抄上游的手滑不是。**
 */

/** 放 `UiTableRow`。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiTableHeadSlot, string>> = {
  head: "border-b-control border-line",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiTableHeadSlot, string>> = {
  head: theme.UiTableHead?.head ?? DEFAULT_PARTS.head,
};
</script>

<template>
  <thead data-slot="table-head" :class="parts.head">
    <slot />
  </thead>
</template>
