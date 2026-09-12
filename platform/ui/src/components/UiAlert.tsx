import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiAlertSlot } from "../theme.ts";

/**
 * 就地提示的 React 版（C236）。`role` 的對應（`danger` → `alert`，其餘 → `status`）
 * 與代幣對照照 `UiAlert.vue`，理由在那支的檔頭 —— 批次 ⑤ 刪 Vue 時搬過來。
 */
export function UiAlert({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "danger";
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiAlertSlot, string>> = {
    alert: theme.UiAlert?.alert ?? DEFAULT_PARTS.alert,
    info: theme.UiAlert?.info ?? DEFAULT_PARTS.info,
    success: theme.UiAlert?.success ?? DEFAULT_PARTS.success,
    danger: theme.UiAlert?.danger ?? DEFAULT_PARTS.danger,
  };

  return (
    <div
      data-slot="alert"
      role={tone === "danger" ? "alert" : "status"}
      className={cn(parts.alert, parts[tone])}
    >
      {children}
    </div>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiAlertSlot, string>> = {
  alert: "flex gap-2 rounded-surface border-control px-3 py-2 text-sm",
  info: "border-line bg-surface-hover text-fg",
  success: "border-accent bg-accent/10 text-fg",
  danger: "border-danger bg-danger/10 text-danger",
};
