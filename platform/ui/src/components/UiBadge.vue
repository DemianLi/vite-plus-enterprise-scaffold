<script setup lang="ts">
import { inject, type VNode } from "vue";
import { cn } from "../utils/cn.ts";
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

const props = withDefaults(
  defineProps<{
    /**
     * ⚠️ 刻意寫成字面值 union，**不用型別別名**。理由與 `UiButton` 同一條：
     * `api-surface` 記錄的是 `defineProps` 的原文，換成別名之後
     * 「union 少一個成員」這道閘門就看不見了。契約測試第 ④ 條在守這件事。
     */
    tone?: "neutral" | "accent" | "danger";
  }>(),
  {
    // ⚠️ 預設值一定要寫在 `withDefaults` 裡，**不能寫成模板裡的
    // `parts[tone ?? "neutral"]`**。契約測試的「預設值必須是該 prop 的 union
    // 成員之一」是讀 `withDefaults` 的 —— 寫進模板就落在那道檢查的視窗外，
    // 而打錯字的症狀是 `parts[未知鍵]` 回 `undefined`、Vue 直接丟掉那個 class：
    // 一個沒上色的標籤，沒有錯誤也沒有紅燈。實測過。
    tone: "neutral",
  },
);

/** 標籤的內容。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiBadgeSlot, string>> = {
  /**
   * 版型（圓角、內距、字級）自己一格。
   *
   * ⚠️ 第一版把這一條寫死在模板的 `class` 上，於是各案換得掉顏色、
   * **換不掉圓角** —— 一個要求 pill 形狀的案子只能來改 `platform/`。
   * 契約測試第 ⑤ 條擋的是「模板引用預設表」，擋不到「模板自己寫了一條」。
   * 「接縫夠不夠」是 review 的職責，不是靜態檢查的（同 `UiDialog`）。
   */
  badge: "inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-xs font-control",
  neutral: "border-control border-line bg-surface-hover text-fg",
  accent: "bg-accent text-on-accent",
  danger: "bg-danger text-on-danger",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiBadgeSlot, string>> = {
  badge: theme.UiBadge?.badge ?? DEFAULT_PARTS.badge,
  neutral: theme.UiBadge?.neutral ?? DEFAULT_PARTS.neutral,
  accent: theme.UiBadge?.accent ?? DEFAULT_PARTS.accent,
  danger: theme.UiBadge?.danger ?? DEFAULT_PARTS.danger,
};
</script>

<template>
  <span data-slot="badge" :class="cn(parts.badge, parts[props.tone])">
    <slot />
  </span>
</template>
