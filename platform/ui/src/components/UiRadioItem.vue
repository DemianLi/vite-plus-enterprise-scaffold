<script setup lang="ts">
import { Label, RadioGroupIndicator, RadioGroupItem } from "reka-ui";
import { inject, useId, type VNode } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiRadioItemSlot } from "../theme.ts";

/**
 * 單選群組裡的一項。必須放在 `UiRadioGroup` 裡面。
 *
 * ⚠️ 放在外面不會報錯，只會**點了沒反應**（inject 不到上下文）。
 * 與 `UiTabsPanel` 那一條同一種：值與上下文都是執行期的，靜態檢查抓不到。
 *
 * ── 標籤的關聯自己接，理由是 C76 那次的教訓 ──────────────────────
 *
 * `useId()` ＋ `for`／`id`。少了它的症狀是**點文字不會選、輔具讀不到名字，
 * 而畫面完全正常** —— C76 的 review 在 `UiCheckbox` 上實測過一次，
 * 所以這裡從第一版就接上，不等 review。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守（見 UiBadge、#57）────────
 *
 *   border-primary / text-primary   → border-line / text-accent
 *   fill-primary（indicator 圓點）  → bg-accent（改用 div，少一個 svg）
 *   focus-visible:ring-ring/50      → focus-visible:ring-focus/50
 */

defineProps<{
  /** 這一項的值，對應 `UiRadioGroup` 的 `v-model`。 */
  value: string;
  /** 標籤文字。⚠️ 選填，給了 slot 就用不到它（同 `UiCheckbox`）。 */
  label?: string;
}>();

/** 標籤位置的內容。給的話取代 `label` 純文字。 */
defineSlots<{
  default(): VNode[];
}>();

/**
 * ⚠️ **`label` 與 slot 兩個都不給，這一項就沒有名字** —— 畫面上是一個沒有
 * 文字的圓點，螢幕閱讀器報「未命名的單選鈕」。與 `UiCheckbox` 同一條：
 * slot 有沒有內容是執行期才知道的，沒有閘門守得住，所以寫在這裡。
 */

const itemId = useId();

const DEFAULT_PARTS: Readonly<Record<UiRadioItemSlot, string>> = {
  item: cn(
    "peer inline-flex size-4 shrink-0 items-center justify-center",
    "rounded-full border-control border-line bg-surface",
    "transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "data-[state=checked]:border-accent",
  ),
  indicator: "block size-2 rounded-full bg-accent",
  label: "text-sm text-fg peer-disabled:opacity-50",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiRadioItemSlot, string>> = {
  item: theme.UiRadioItem?.item ?? DEFAULT_PARTS.item,
  indicator: theme.UiRadioItem?.indicator ?? DEFAULT_PARTS.indicator,
  label: theme.UiRadioItem?.label ?? DEFAULT_PARTS.label,
};
</script>

<template>
  <div class="flex items-center gap-2">
    <RadioGroupItem :id="itemId" :value="value" data-slot="radio-item" :class="parts.item">
      <RadioGroupIndicator :class="parts.indicator" />
    </RadioGroupItem>
    <Label :for="itemId" :class="parts.label">
      <slot>{{ label }}</slot>
    </Label>
  </div>
</template>
