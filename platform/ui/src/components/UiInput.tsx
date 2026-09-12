import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiInputSlot } from "../theme.ts";

/**
 * 單行輸入框，React 版（C236）。代幣對照與「為什麼沒有 size」見 `UiInput.vue` 的檔頭；
 * 原生 `<input>`，不經 Base UI 的 `Input`（它只多了 `Field` 的接線，而接線這裡由 `UiField` 做）。
 *
 * ⚠️ **Vue 版零 prop，靠 fallthrough 收下 `id`／`aria-*`／`placeholder`……；React 沒有
 * fallthrough，所以下面逐一列出**（同 C235 對 `UiButton` 的處置）。`id` 與兩個 `aria-*`
 * 是 `UiField` 交出的 `control` 那三格，少一格接線就斷、畫面照常 ——
 * `tests/field-wiring-react.test.ts` 守著。要第二種屬性時加在這裡，`api-surface` 記成相容變更。
 *
 * 不給 `value` 就是非受控（同 Vue 版 `defineModel` 沒綁時的行為）。
 */
export function UiInput({
  value,
  onValueChange,
  id,
  name,
  type,
  placeholder,
  disabled = false,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: string | number;
  onValueChange?: (value: string) => void;
  id?: string;
  name?: string;
  type?: "text" | "email" | "password" | "search" | "tel" | "url" | "number";
  placeholder?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiInputSlot, string>> = {
    input: theme.UiInput?.input ?? DEFAULT_PARTS.input,
  };

  return (
    <input
      data-slot="input"
      id={id}
      name={name}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      className={parts.input}
    />
  );
}

const DEFAULT_PARTS: Readonly<Record<UiInputSlot, string>> = {
  input: cn(
    "h-10 w-full min-w-0 rounded-control border-control border-line bg-transparent px-3 py-1",
    "text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
    "placeholder:text-fg-muted",
    "focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50",
    "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
  ),
};
