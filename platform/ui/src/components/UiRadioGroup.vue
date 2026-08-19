<script setup lang="ts">
import { RadioGroupRoot } from "reka-ui";
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiRadioGroupSlot } from "../theme.ts";

/**
 * 單選群組。與 `UiRadioItem` 是**一組兩個檔案**（第二個 Root ＋ Item，
 * 第一個是 `UiTabs`／`UiTabsPanel`）。
 *
 * ── 為什麼這一組不能像 `UiTabs` 那樣用 `items` 陣列收掉 ──────────────
 *
 * `UiTabs` 把 trigger 收進 Root，因為分頁的標籤就是一行字。
 * 單選項不是：**每一項後面常常要接說明文字、連結、或一個只在選中時出現的
 * 輸入框**（「其他，請說明 ___」）。用陣列就得再發明一套「每一項的 slot」，
 * 那比兩個檔案複雜。
 *
 * ⚠️ 兩個形狀都對，判準是**項目的內容是不是任意的**。
 * 這一條寫下來是因為下一個 Root ＋ Item 進來時要用同一個判準，
 * 而不是照抄離它最近的那一個。
 *
 * ── 為什麼沒有橫向 orientation ──────────────────────────────────
 *
 * reka-ui 支援它，這裡刻意不開：橫排單選在窄螢幕會擠成兩行而失去對齊，
 * 而版面是使用端的事 —— 外面包一個 `flex` 就是橫的。開一個 prop 等於
 * 讓 `platform/` 決定版面。
 */

const selected = defineModel<string>({ default: "" });

/** 放 `UiRadioItem`。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiRadioGroupSlot, string>> = {
  group: "flex flex-col gap-2",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiRadioGroupSlot, string>> = {
  group: theme.UiRadioGroup?.group ?? DEFAULT_PARTS.group,
};
</script>

<template>
  <RadioGroupRoot v-model="selected" data-slot="radio-group" :class="parts.group">
    <slot />
  </RadioGroupRoot>
</template>
