import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTextareaSlot } from "../theme.ts";

/**
 * 多行輸入框，React 版（C236）。為什麼樣式與 `UiInput` 刻意重複而不共用，見
 * `UiTextarea.vue` 的檔頭；列出來的 props 為什麼是這幾個，見 `UiInput.tsx`。
 */
export function UiTextarea({
  value,
  onValueChange,
  id,
  name,
  placeholder,
  disabled = false,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiTextareaSlot, string>> = {
    textarea: theme.UiTextarea?.textarea ?? DEFAULT_PARTS.textarea,
  };

  return (
    <textarea
      data-slot="textarea"
      id={id}
      name={name}
      placeholder={placeholder}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      className={parts.textarea}
    />
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTextareaSlot, string>> = {
  textarea: cn(
    "min-h-20 w-full min-w-0 field-sizing-content resize-y",
    "rounded-control border-control border-line bg-transparent px-3 py-2",
    "text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
    "placeholder:text-fg-muted",
    "focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50",
    "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  ),
};
