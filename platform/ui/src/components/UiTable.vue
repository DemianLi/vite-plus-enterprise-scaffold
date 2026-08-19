<script setup lang="ts">
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiTableSlot } from "../theme.ts";

/**
 * 資料表。與 `UiTableHead`／`UiTableBody`／`UiTableRow`／`UiTableHeadCell`／
 * `UiTableCell` 是**一組六個檔案**。
 *
 * ── reka-ui 沒有 Table 基元，而那是對的 ─────────────────────────
 *
 * 原生 `<table>` 的語意（`<th scope>`、`<caption>`、列與欄的關聯）**就是**
 * 螢幕閱讀器讀表格的方式，沒有一項需要 JavaScript 補。用 `<div role="table">`
 * 重做一遍是常見的錯誤 —— 那要自己補 `role="row"`／`role="cell"`／
 * `aria-rowindex`，而漏一個就是輔具讀不出結構。
 *
 * 判準與 `UiTextarea` 同一條：**headless 函式庫只在原生做不到的地方才有價值。**
 *
 * ── 為什麼是六個檔案而不是 `:columns` ＋ `:rows` ──────────────────
 *
 * 判準是 C78 §3 那一條：**項目的內容是不是任意的**。表格的儲存格是這個 repo
 * 裡最任意的東西 —— 一格可能是文字、一顆 `UiBadge`、一組按鈕、一個連結。
 * 做成資料驅動就得再發明一套「每一欄的 render 函式」，那比六個薄檔案複雜，
 * 而且會把「這一欄怎麼顯示」從使用端搬進 `platform/`。
 *
 * ⚠️ 資料驅動的表格（排序、分頁、虛擬捲動）是**另一個產品**（data grid），
 * 不是版型元件。真的需要時那是一個新決策，不是把這一支長大。
 *
 * ── 外面那層 `overflow-x` 不是裝飾 ──────────────────────────────
 *
 * 表格是這個元件庫裡唯一**天生會超出容器**的東西。少了捲動容器，
 * 窄螢幕上的症狀是整個頁面橫向捲動（而不是表格自己捲），
 * 那會讓固定的側欄跟著跑掉。
 */

/** 放 `UiTableHead` 與 `UiTableBody`。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiTableSlot, string>> = {
  scroller: "w-full overflow-x-auto",
  table: "w-full border-collapse text-sm",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiTableSlot, string>> = {
  scroller: theme.UiTable?.scroller ?? DEFAULT_PARTS.scroller,
  table: theme.UiTable?.table ?? DEFAULT_PARTS.table,
};
</script>

<template>
  <div data-slot="table" :class="parts.scroller">
    <table :class="parts.table">
      <slot />
    </table>
  </div>
</template>
