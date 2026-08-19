<script setup lang="ts">
import { inject } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiSkeletonSlot } from "../theme.ts";

/**
 * 載入中的佔位方塊。
 *
 * ── 這是這個 repo 第一個**零公開面**的元件 ────────────────────────
 *
 * 沒有 prop、沒有 slot、沒有 emit、沒有 model。`tools/api-surface` 把它記成
 * `{ kind: "component", members: [] }`。
 *
 * ⚠️ 那在 2026-08-19 之前是**不可能的**：解析器對「沒有解析出任何公開面」
 * 無條件丟例外（「空形狀等於沒有守」）。C74 拆掉那個例外時舉的例子就是
 * `Separator`／`Skeleton` 這種純版型元件 —— 這是第一個真實案例。
 *
 * 而空清單**不等於不比對**：`compare.ts` 判的是 `members !== undefined`，
 * 所以這個元件日後長出來的第一個 prop 仍然會漂移。
 *
 * ── 尺寸為什麼不做成 prop ─────────────────────────────────────────
 *
 * 骨架的尺寸是**每個使用點都不一樣**的（一行標題、一張頭像、一整塊卡片），
 * 做成 `size` union 只會逼出 `sm`／`md`／`lg` 三個猜出來的值，然後第四種
 * 需求出現時要改 `platform/`。
 *
 * 這裡靠 Vue 的 fallthrough：單根元件會自動合併使用端傳進來的 `class`，
 * 所以 `<UiSkeleton class="h-4 w-32" />` 直接就對。多宣告一個 `class` prop
 * 只會讓 api-surface 多記一格，而那一格什麼都沒多守（同 `UiInput`）。
 *
 * ── 動畫用 `animate-pulse` 而不是自訂 keyframes ───────────────────
 *
 * 自訂 keyframes 要寫進 `styles/index.css`，而那份檔案是**代幣**的家。
 * 一個只有一個元件在用的動畫住進去，下一個人就會照做，那份檔案會變成
 * 「所有 CSS 的家」—— 而它現在能被 `theme-verify` 逐格驗，正是因為它只有代幣。
 */

const DEFAULT_PARTS: Readonly<Record<UiSkeletonSlot, string>> = {
  skeleton: "animate-pulse rounded-control bg-surface-hover",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiSkeletonSlot, string>> = {
  skeleton: theme.UiSkeleton?.skeleton ?? DEFAULT_PARTS.skeleton,
};
</script>

<template>
  <div data-slot="skeleton" :class="parts.skeleton" />
</template>
