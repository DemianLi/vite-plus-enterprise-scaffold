import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSkeletonSlot } from "../theme.ts";

/**
 * 載入中的佔位方塊，React 版（C236）。為什麼 `aria-hidden`、為什麼要
 * `motion-reduce:animate-none`，見 `UiSkeleton.vue` 的檔頭（`tests/a11y.test.ts` 兩版都守）。
 *
 * ⚠️ **與 Vue 版的一個差別：多了 `className`。** Vue 版零公開面，尺寸靠 fallthrough 疊上
 * `class`；React 沒有 fallthrough，而骨架的尺寸每個使用點都不一樣，所以這一格非開不可。
 * 它走 `cn()`（tailwind-merge），於是 `rounded-full` 這種與預設衝突的 class **會贏** ——
 * Vue 版檔頭「兩個都在、誰贏看 CSS 順序」那句警告對這一版不成立。要換預設表裡的
 * 任何一條，仍然走 `UiThemeOverride` 的 `UiSkeleton.skeleton`。
 */
export function UiSkeleton({ className }: { className?: string }): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiSkeletonSlot, string>> = {
    skeleton: theme.UiSkeleton?.skeleton ?? DEFAULT_PARTS.skeleton,
  };

  return <div data-slot="skeleton" aria-hidden="true" className={cn(parts.skeleton, className)} />;
}

const DEFAULT_PARTS: Readonly<Record<UiSkeletonSlot, string>> = {
  skeleton: "animate-pulse motion-reduce:animate-none rounded-control bg-surface-hover",
};
