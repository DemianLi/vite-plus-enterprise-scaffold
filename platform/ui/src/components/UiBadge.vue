<script setup lang="ts">
import { inject, type VNode } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiBadgeSlot } from "../theme.ts";

/**
 * 狀態標籤。
 *
 * 來源：`unovue/shadcn-vue` 的 Badge。它有五個 variant，這裡只帶四個 ——
 * 上游的 `outline` 在本 repo 是 `neutral` 已經有邊框，留著會是兩個看起來
 * 一樣的名字。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守 ─────────────────────────
 *
 * 這一點在 `UiInput` 上實測過：把翻好的 `border-line` 改回上游的
 * `border-input`，`theme-verify` **全綠** —— 未翻譯的上游代幣既不是原始色
 * 也不是懸空引用，`palette.ts` 現有的兩類違規都認不得它。那是 issue #57。
 *
 * 所以下面每一條都是逐條核過的，漏一條那一格顏色就永遠換不掉：
 *
 *   bg-primary / text-primary-foreground   → bg-accent / text-on-accent
 *   bg-secondary / text-secondary-fg       → bg-surface-hover / text-fg
 *   bg-destructive / text-destructive-fg   → bg-danger / text-on-danger
 *   border-transparent                     → 拿掉（我們用 border-control 的有無）
 *   rounded-md                             → rounded-control
 *   focus-visible:ring-ring/50             → focus-visible:ring-focus/50
 *
 * ── 為什麼 `tone` 而不是 `variant` ───────────────────────────────
 *
 * `UiVariant` 是**按鈕**的那條軸（primary／secondary／danger／ghost），
 * 而標籤沒有 ghost、也沒有「主要按鈕」的概念。共用那個型別會讓
 * `UiThemeOverride` 裡兩個元件共享一組槽名，然後有一天要幫按鈕加一個
 * variant 而標籤被迫跟著長一格。分開的代價只是多一個 union。
 */

defineProps<{
  /**
   * ⚠️ 刻意寫成字面值 union，**不用型別別名**。理由與 `UiButton` 同一條：
   * `api-surface` 記錄的是 `defineProps` 的原文，換成別名之後
   * 「union 少一個成員」這道閘門就看不見了。契約測試第 ④ 條在守這件事。
   */
  tone?: "neutral" | "accent" | "danger";
}>();

/** 標籤的內容。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiBadgeSlot, string>> = {
  neutral: "border-control border-line bg-surface-hover text-fg",
  accent: "bg-accent text-on-accent",
  danger: "bg-danger text-on-danger",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiBadgeSlot, string>> = {
  neutral: theme.UiBadge?.neutral ?? DEFAULT_PARTS.neutral,
  accent: theme.UiBadge?.accent ?? DEFAULT_PARTS.accent,
  danger: theme.UiBadge?.danger ?? DEFAULT_PARTS.danger,
};
</script>

<template>
  <span
    data-slot="badge"
    class="inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-xs font-control"
    :class="parts[tone ?? 'neutral']"
  >
    <slot />
  </span>
</template>
