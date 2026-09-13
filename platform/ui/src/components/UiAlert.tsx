import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiAlertSlot } from "../theme.ts";

/**
 * 就地顯示的提示訊息。
 *
 * ── 為什麼是 Alert 而不是 Toast ────────────────────────────────
 *
 * `Toast` 刻意不在範圍內，理由是它需要一組**全域的 `Provider` ＋
 * `Viewport` 接線**，而「掛在哪、疊在哪、同時最多幾個」是**應用外殼的決定**，
 * 不是一個元件。把那個決定放進 `platform/ui` 等於替每個案子決定它。
 *
 * Alert 是就地的：它出現在它要說明的那一段旁邊。而**那對表單錯誤其實更好** ——
 * 飄在角落的 toast 是無障礙的常見痛點（會自己消失、鍵盤到不了、
 * 螢幕閱讀器可能唸不到）。
 *
 * ── `role` 是這個元件唯一真正的技術內容 ────────────────────────
 *
 * `danger` 用 `role="alert"`（`aria-live="assertive"`）—— 打斷目前的朗讀，
 * 因為那是使用者現在必須知道的事。其餘用 `role="status"`
 * （`aria-live="polite"`）—— 等使用者停下來再唸。
 *
 * ⚠️ 全部都用 `alert` 的話，每一個「已儲存」都會打斷正在唸的東西；
 * 全部都用 `status` 的話，錯誤訊息會被排在後面。這個對應錯了，
 * 在畫面上完全看不出來。
 *
 * ── ⚠️ 代幣對照是人工核對的（見 UiBadge）────────────────────────────
 *
 *   bg-destructive/10 / text-destructive  → bg-danger/10 / text-danger
 *   bg-muted / text-muted-foreground      → bg-surface-hover / text-fg-muted
 *   border-border                         → border-line
 *   rounded-lg                            → rounded-surface
 *
 * `tone` 寫成字面值 union、不用型別別名，理由同 `UiButton`。
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
