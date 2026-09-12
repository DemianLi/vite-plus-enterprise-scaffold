import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiLabelSlot } from "../theme.ts";

/**
 * 表單欄位的標籤，React 版（C236）。為什麼獨立成一支、為什麼 `htmlFor` 是使用端的責任，
 * 見 `UiLabel.vue` 的檔頭。prop 叫 `htmlFor` 不叫 `for`：後者在 JSX 裡是保留字。
 *
 * ⚠️ **「雙擊不反白」換了做法**：Vue 版靠 reka-ui `Label` 的 mousedown 處理器；Base UI
 * 沒有這個基元，而把處理器掛在 `<label>` 上會被 jsx-a11y 的
 * `no-noninteractive-element-interactions` 判紅（它不是互動，但規則分不出來）。
 * 所以改用 `select-none`（shadcn 的 Label 同一個做法）—— 代價是標籤文字整個不能選取，
 * 不只雙擊。它**刻意寫在預設表外面**：那是行為不是樣式，覆寫整條替換時不該被一起換掉。
 * `UiCheckbox`、`UiRadioItem` 的標籤同一個處置。
 */
export function UiLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiLabelSlot, string>> = {
    label: theme.UiLabel?.label ?? DEFAULT_PARTS.label,
  };

  return (
    <label data-slot="label" htmlFor={htmlFor} className={cn("select-none", parts.label)}>
      {children}
    </label>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiLabelSlot, string>> = {
  label: "text-sm font-control text-fg",
};
