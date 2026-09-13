import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiInputSlot } from "../theme.ts";

/**
 * 單行輸入框。原生 `<input>`，不經 Base UI 的 `Input`（它只多了 `Field` 的接線，
 * 而接線這裡由 `UiField` 做）。
 *
 * 來源是 shadcn 的 Input。抄進來改兩樣：代幣詞彙換成我們的語意代幣（下面逐條對照）；
 * `dark:` 變體拿掉 —— 本 repo 還沒有深色模式，留著會是**寫了但無效**的 class，
 * 而那正是要防的那種「看起來有做」。
 *
 * ── 代幣對照 ⚠️ **這張表是人工核對的** ──────────────────────────────
 *
 * 實測過：把 `border-line` 改回上游的 `border-input`，建置照樣成功
 * （0 處原始顏色、0 處懸空引用）。未翻譯的上游代幣既不是原始色、也不是懸空引用 ——
 * 它是一個「合法但不是我們的」名字，沒有東西認得出它。
 * 所以抄下一個元件的人：**這張表要自己逐條核**，漏一條那一格顏色就永遠換不掉，
 * 而且不會有任何紅燈。
 *
 *   border-input                → border-line
 *   focus-visible:border-ring   → focus-visible:border-focus
 *   ring-ring/50                → ring-focus/50
 *   aria-invalid:*-destructive  → aria-invalid:*-danger
 *   placeholder:text-muted-fg   → placeholder:text-fg-muted
 *   file:text-foreground        → file:text-fg
 *   rounded-md                  → rounded-control
 *   border                      → border-control
 *
 * ⚠️ 高度用 `h-10` 而不是上游的 `h-9`：本 repo 的 `UiButton` md 是 `h-10`，
 * 而表單裡輸入框與按鈕並排時差 4px 是看得出來的。上游那兩個數字本來就
 * 不對齊（它的 button default 是 h-8），所以這裡照我們自己的尺規。
 *
 * `aria-invalid` 的樣式留著：表單驗證失敗時輸入框自己會變色，而 `aria-invalid`
 * 同時是螢幕閱讀器讀得到的狀態。自己寫的話多半會寫成一個 `error` class，
 * 畫面對了、輔具讀不到。
 *
 * 刻意**不**做 size 這條軸：上游的 Input 沒有 size prop，而我們沒有第二個
 * 尺寸的需求。真的需要時再加是一筆 minor（新增 union 成員），
 * 現在先做一個「大概會用到」的 size 是過度設計。
 *
 * ⚠️ **React 沒有屬性穿透，所以收得下的屬性在下面逐一列出**（同 `UiButton` 的
 * 處置）。`id` 與兩個 `aria-*` 是 `UiField` 交出的 `control` 那三格，少一格接線就斷、
 * 畫面照常。要第二種屬性時加在這裡，那是一筆相容的新增。不給 `value` 就是非受控。
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
