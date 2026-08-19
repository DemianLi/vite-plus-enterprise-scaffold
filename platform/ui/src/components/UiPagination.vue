<script setup lang="ts">
import {
  PaginationEllipsis,
  PaginationList,
  PaginationListItem,
  PaginationNext,
  PaginationPrev,
  PaginationRoot,
} from "reka-ui";
import { inject } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiPaginationSlot } from "../theme.ts";

/**
 * 分頁。表格的必然配套。
 *
 * ── 為什麼不自己算頁碼 ────────────────────────────────────────
 *
 * 「1 … 4 5 6 … 20」這個省略邏輯看起來是十行 for 迴圈，實際上邊界很多：
 * 前三頁與後三頁不該出現省略號、`siblingCount` 要對稱、只有一頁時整條要消失。
 * 每一個邊界寫錯的症狀都是「某幾頁的時候排版怪怪的」——**回報率極低**。
 *
 * reka-ui 的 `PaginationList` 直接送出 `page` 與 `ellipsis` 兩種項目。
 *
 * ── ⚠️ 頁碼是 1-based，而 API 多半是 0-based ──────────────────
 *
 * `v-model` 出來的第一頁是 `1`。送去後端如果是 `offset` 或 0-based 的 `page`，
 * **要自己減一** —— 這一格沒有閘門，而錯了的症狀是「永遠少一頁」或
 * 「第一頁看到第二頁的資料」。刻意不在這裡幫忙轉：轉了之後
 * `v-model` 的值與畫面上顯示的數字就不一樣，那更難查。
 *
 * ── ⚠️ `show-edges` 不是選配的 ────────────────────────────────────
 *
 * reka-ui 的預設是 `false`，而那個預設讓這個元件**有一半是壞的**：
 * 清單只剩當前頁附近那幾個，**沒有第一頁也沒有最後一頁**，而且因為沒有
 * 邊緣就**永遠不會出現省略號** —— 下面那個 `PaginationEllipsis` 與它的
 * `ellipsis` 槽整組是死的。
 *
 * 實測（10 頁、當前第 5 頁）：修之前渲染出來是 `3 4 5 6 7`，
 * 使用者要回第一頁得連按四次上一頁。
 */

const page = defineModel<number>({ default: 1 });

defineProps<{
  /** 資料總筆數。 */
  total: number;
  /** 每頁幾筆。 */
  perPage: number;
}>();

const DEFAULT_PARTS: Readonly<Record<UiPaginationSlot, string>> = {
  list: "flex items-center gap-1",
  item: cn(
    "inline-flex size-8 items-center justify-center rounded-control text-sm tabular-nums",
    "text-fg transition-colors outline-none",
    "hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-[selected]:bg-accent data-[selected]:text-on-accent",
    "disabled:pointer-events-none disabled:opacity-50",
  ),
  nav: cn(
    "inline-flex size-8 items-center justify-center rounded-control text-fg-muted",
    "transition-colors outline-none",
    "hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-focus/50",
    "disabled:pointer-events-none disabled:opacity-50",
  ),
  ellipsis: "inline-flex size-8 items-center justify-center text-sm text-fg-muted",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiPaginationSlot, string>> = {
  list: theme.UiPagination?.list ?? DEFAULT_PARTS.list,
  item: theme.UiPagination?.item ?? DEFAULT_PARTS.item,
  nav: theme.UiPagination?.nav ?? DEFAULT_PARTS.nav,
  ellipsis: theme.UiPagination?.ellipsis ?? DEFAULT_PARTS.ellipsis,
};
</script>

<template>
  <PaginationRoot
    v-model:page="page"
    data-slot="pagination"
    :total="total"
    :items-per-page="perPage"
    show-edges
  >
    <PaginationList v-slot="{ items }" :class="parts.list">
      <PaginationPrev :class="parts.nav">
        <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
          <path
            d="M10 3L5 8l5 5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </PaginationPrev>
      <template v-for="(item, index) in items">
        <PaginationListItem
          v-if="item.type === 'page'"
          :key="`page-${item.value}`"
          :value="item.value"
          :class="parts.item"
        >
          {{ item.value }}
        </PaginationListItem>
        <PaginationEllipsis v-else :key="`gap-${index}`" :class="parts.ellipsis">
          …
        </PaginationEllipsis>
      </template>
      <PaginationNext :class="parts.nav">
        <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
          <path
            d="M6 3l5 5-5 5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </PaginationNext>
    </PaginationList>
  </PaginationRoot>
</template>
