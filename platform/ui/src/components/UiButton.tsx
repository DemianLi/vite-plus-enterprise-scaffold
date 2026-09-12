import { Button } from "@base-ui/react/button";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSize, UiVariant } from "../theme.ts";

/**
 * 按鈕的 React 版（C235）。樣式、預設值、覆寫語意逐字對齊 `UiButton.vue` ——
 * 兩版並存到批次 ⑤，`tests/component-contract.test.ts` 用同一組條文檢查兩者。
 *
 * 由 shadcn CLI（Base UI 那一套）的 Button 改寫而來：產出是素材，契約照舊（Q58）。
 * 留下的是 Base UI 的 `Button` 基元；換掉的是 cva（Q59，改回純物件查表）與
 * shadcn 的 variant 名（`default`／`destructive` → `primary`／`danger`，理由見
 * `../theme.ts`）。覆寫是**整條替換**，不經 `cn` 附加 —— 同 `theme.ts` 的說明。
 *
 * ⚠️ props 的 union 刻意寫成字面值，理由同 `UiButton.vue`：`api-surface` 記的是
 * 形狀的文字，寫成 `UiVariant` 別名之後「union 少一個成員」就看不見了。
 *
 * ⚠️ **沒有 Vue 的屬性穿透**：`UiButton.vue` 收到的 `aria-*`、`@click` 會自己落到
 * `<button>` 上，React 沒有這回事 —— 這裡收的就是下面列出的這幾個。使用端要第二種
 * 屬性時加在這裡，`api-surface` 把它記成相容變更。
 */
export function UiButton({
  variant = "secondary",
  size = "md",
  type = "button",
  disabled = false,
  onClick,
  children,
}: {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-control",
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-50",
    theme.UiButton?.[variant] ?? VARIANTS[variant],
    theme.UiButton?.[size] ?? SIZES[size],
  );

  return (
    <Button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

const VARIANTS: Readonly<Record<UiVariant, string>> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border-control border-line bg-surface text-fg hover:bg-surface-hover",
  danger: "bg-danger text-on-danger hover:bg-danger-hover",
  ghost: "text-fg-subtle hover:bg-surface-ghost-hover",
};

const SIZES: Readonly<Record<UiSize, string>> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};
