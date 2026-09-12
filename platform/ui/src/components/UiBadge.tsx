import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiBadgeSlot } from "../theme.ts";

/**
 * 狀態標籤的 React 版（C236）。為什麼叫 `tone` 不叫 `variant`、代幣怎麼翻，
 * 見 `UiBadge.vue` 的檔頭。shadcn 那一版用 cva（Q59 不裝），這裡照 Vue 版是純物件查表。
 */
export function UiBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "danger";
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiBadgeSlot, string>> = {
    badge: theme.UiBadge?.badge ?? DEFAULT_PARTS.badge,
    neutral: theme.UiBadge?.neutral ?? DEFAULT_PARTS.neutral,
    accent: theme.UiBadge?.accent ?? DEFAULT_PARTS.accent,
    danger: theme.UiBadge?.danger ?? DEFAULT_PARTS.danger,
  };

  return (
    <span data-slot="badge" className={cn(parts.badge, parts[tone])}>
      {children}
    </span>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiBadgeSlot, string>> = {
  badge: "inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-xs font-control",
  neutral: "border-control border-line bg-surface-hover text-fg",
  accent: "bg-accent text-on-accent",
  danger: "bg-danger text-on-danger",
};
