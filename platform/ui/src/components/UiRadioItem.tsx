import { Radio } from "@base-ui/react/radio";
import { useId, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiRadioItemSlot } from "../theme.ts";

/**
 * 單選群組裡的一項，React 版（C236）。必須放在 `UiRadioGroup` 裡；`label` 與 `children`
 * 都不給就沒有名字 —— 見 `UiRadioItem.vue` 的檔頭。
 *
 * 標籤的接法與預設表的三個 variant 翻譯，與 `UiCheckbox.tsx` 檔頭是同一件事：Base UI 的
 * Radio 也是 span ＋ 隱藏的 input，`id` 落在 input 上。
 */
export function UiRadioItem({
  value,
  label,
  children,
}: {
  value: string;
  label?: string;
  children?: ReactNode;
}): ReactNode {
  const itemId = useId();
  const theme = useUiTheme();
  const parts: Readonly<Record<UiRadioItemSlot, string>> = {
    item: theme.UiRadioItem?.item ?? DEFAULT_PARTS.item,
    indicator: theme.UiRadioItem?.indicator ?? DEFAULT_PARTS.indicator,
    label: theme.UiRadioItem?.label ?? DEFAULT_PARTS.label,
  };

  return (
    <div className="flex items-center gap-2">
      <Radio.Root id={itemId} value={value} data-slot="radio-item" className={parts.item}>
        <Radio.Indicator className={parts.indicator} />
      </Radio.Root>
      {/* select-none 在預設表外面：行為不是樣式，理由見 UiLabel.tsx。 */}
      <label htmlFor={itemId} className={cn("select-none", parts.label)}>
        {children ?? label}
      </label>
    </div>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiRadioItemSlot, string>> = {
  item: cn(
    "peer inline-flex size-4 shrink-0 items-center justify-center",
    "rounded-full border-control border-line bg-surface",
    "transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-disabled:cursor-not-allowed data-disabled:opacity-50",
    "data-checked:border-accent",
  ),
  indicator: "block size-2 rounded-full bg-accent",
  label: "text-sm text-fg peer-data-disabled:opacity-50",
};
