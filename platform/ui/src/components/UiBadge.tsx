import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiBadgeSlot } from "../theme.ts";

/**
 * 狀態標籤。
 *
 * 來源：shadcn 的 Badge。它有五個 variant，這裡只帶四個 —— 上游的 `outline`
 * 在本 repo 是 `neutral` 已經有邊框，留著會是兩個看起來一樣的名字。
 * shadcn 那一版用 cva（本 repo 不裝），這裡是純物件查表。
 *
 * ── ⚠️ 代幣對照是人工核對的 ────────────────────────────────────────
 *
 * 這一點在 `UiInput` 上實測過：把翻好的 `border-line` 改回上游的
 * `border-input`，建置照樣成功 —— 未翻譯的上游代幣既不是原始色
 * 也不是懸空引用，沒有東西認得出它。
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
 *
 * ⚠️ `tone` 刻意寫成字面值 union、不用型別別名，理由同 `UiButton`；
 * 預設值寫在解構參數裡，契約測試的「預設值必須是 union 成員」讀的是那裡。
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
  /**
   * 版型（圓角、內距、字級）自己一格。第一版把它寫死在 `class` 上，於是各案換得掉
   * 顏色、**換不掉圓角** —— 要 pill 形狀的案子只能來改 `platform/`。契約測試擋的是
   * 「標記引用預設表」，擋不到「標記自己寫了一條」；接縫夠不夠是 review 的職責。
   */
  badge: "inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-xs font-control",
  neutral: "border-control border-line bg-surface-hover text-fg",
  accent: "bg-accent text-on-accent",
  danger: "bg-danger text-on-danger",
};
