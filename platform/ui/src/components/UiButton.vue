<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../utils/cn.ts";

/**
 * 按鈕。
 *
 * ── 這個檔案就是 shadcn 模型的示範 ──────────────────────────────────
 *
 * 樣式與行為都在這裡，**沒有上游可以問**。要改圓角、改 focus ring、
 * 改 disabled 的表現，就是改這個檔案 —— 不是覆寫別人的 CSS、不是等上游發版。
 * 這正是 D15 選這條路而不是 element-plus 的原因。
 *
 * 代價是：這個檔案的品質就是產品的品質，沒有人幫你把關。所以它歸
 * `platform/` 治理（CODEOWNERS ＋ api-surface 破壞性變更閘門）。
 *
 * ── 為什麼變體是純物件而不是 cva ────────────────────────────────────
 *
 * `class-variance-authority` 在這個規模只是把查表包一層。少一個相依
 * ＝ 少一筆 SCA 範圍、少一筆鏡像清單、少一次 `--capture`。
 */

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  {
    variant: "secondary",
    size: "md",
    // 預設 "button" 而不是瀏覽器預設的 "submit"：在表單裡放一個沒寫 type 的
    // 按鈕會意外送出表單，而那個 bug 每個團隊都會踩一次。
    type: "button",
    disabled: false,
  },
);

const VARIANTS: Readonly<Record<Variant, string>> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
  danger: "bg-danger-500 text-white hover:brightness-95",
  ghost: "text-gray-700 hover:bg-gray-100",
};

const SIZES: Readonly<Record<Size, string>> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

const classes = computed(() =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-(--radius-control) font-medium",
    // focus-visible 而不是 focus：滑鼠點擊不該出現焦點環，鍵盤操作必須出現。
    // 用 focus 會讓設計師要求拿掉它，然後鍵盤使用者就看不到自己在哪裡了。
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[props.variant],
    SIZES[props.size],
  ),
);
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
