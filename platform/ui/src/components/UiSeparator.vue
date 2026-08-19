<script setup lang="ts">
import { Separator } from "reka-ui";
import { inject } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiSeparatorSlot } from "../theme.ts";

/**
 * 分隔線。
 *
 * ── 為什麼不是一個 `<hr>` 或一條 `border-t` ────────────────────
 *
 * 兩種都可以畫出線，差別在**輔具會不會唸它**。多數分隔線是純裝飾
 * （一個區塊與下一個區塊之間），唸出來只是噪音；少數是真的語意分界。
 *
 * reka-ui 的 `Separator` 用 `decorative` 決定要不要送 `role="separator"`，
 * 而**預設是裝飾**（`aria-hidden`）—— 那個預設是對的，因為裝飾的情形多得多。
 *
 * 自己寫 `<hr>` 的話永遠是語意的（`<hr>` 有隱含的 `role="separator"`），
 * 於是一個排版用的分隔線會被唸出來。
 */

defineProps<{
  /** 方向。垂直的要有明確高度（外面給），否則畫不出來。 */
  orientation?: "horizontal" | "vertical";
  /**
   * 這條線有語意（真的在分隔兩段內容），輔具要唸。
   *
   * ⚠️ 預設是 `false`（裝飾），與 reka-ui 一致 —— 排版用的分隔線多得多，
   * 而預設會唸的話每個頁面都會多出一堆「分隔線」的朗讀。
   */
  semantic?: boolean;
}>();

const DEFAULT_PARTS: Readonly<Record<UiSeparatorSlot, string>> = {
  separator:
    "shrink-0 bg-line data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiSeparatorSlot, string>> = {
  separator: theme.UiSeparator?.separator ?? DEFAULT_PARTS.separator,
};
</script>

<template>
  <Separator
    data-slot="separator"
    :orientation="orientation ?? 'horizontal'"
    :decorative="semantic !== true"
    :class="parts.separator"
  />
</template>
