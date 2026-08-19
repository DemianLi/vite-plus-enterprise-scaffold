<script setup lang="ts">
import { TabsContent } from "reka-ui";
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiTabsPanelSlot } from "../theme.ts";

/**
 * 一個分頁的內容。必須放在 `UiTabs` 裡面。
 *
 * ── 為什麼是獨立的檔案而不是 `UiTabs` 的一個 slot ─────────────────
 *
 * 因為**數量是使用端決定的**。做成 `#panel-a`／`#panel-b` 這種具名 slot
 * 的話，`UiTabs` 就得先知道有幾個分頁 —— 而 slot 名是編譯期的。
 *
 * 這是 Root ＋ Item 這個形狀存在的理由：Item 的**數量與內容**都在使用端，
 * Root 只提供上下文（reka-ui 的 `TabsRoot` 用 provide／inject 傳）。
 *
 * ⚠️ 放在 `UiTabs` 外面不會報錯，只會**什麼都不渲染** —— `TabsContent`
 * inject 不到上下文。這一條與 `UiTabs` 的 `value` 對不上是同一種：
 * 執行期才知道，沒有閘門守得住，所以寫在這裡。
 */

defineProps<{
  /** 要與 `UiTabs` 的 `items[].value` 其中一個完全相同。 */
  value: string;
}>();

/** 這個分頁的內容。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiTabsPanelSlot, string>> = {
  panel: "mt-4 outline-none focus-visible:ring-3 focus-visible:ring-focus/50",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiTabsPanelSlot, string>> = {
  panel: theme.UiTabsPanel?.panel ?? DEFAULT_PARTS.panel,
};
</script>

<template>
  <TabsContent data-slot="tabs-panel" :value="value" :class="parts.panel">
    <slot />
  </TabsContent>
</template>
