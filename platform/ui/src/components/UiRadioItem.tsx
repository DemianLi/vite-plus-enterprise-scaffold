import { Radio } from "@base-ui/react/radio";
import { useId, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiRadioItemSlot } from "../theme.ts";

/**
 * 單選群組裡的一項。必須放在 `UiRadioGroup` 裡面。
 *
 * ⚠️ 放在外面不會報錯，只會**點了沒反應**（拿不到群組的上下文）。
 * 與 `UiTabsPanel` 那一條同一種：值與上下文都是執行期的，靜態檢查抓不到。
 *
 * ── 標籤的關聯自己接，理由是 `UiCheckbox` 那次的教訓 ──────────────
 *
 * `useId()` ＋ `htmlFor`／`id`。少了它的症狀是**點文字不會選、輔具讀不到名字，
 * 而畫面完全正常** —— review 在 `UiCheckbox` 上實測過一次，
 * 所以這裡從第一版就接上，不等 review。接法與 `UiCheckbox.tsx` 檔頭是同一件事：
 * Base UI 的 Radio 也是 span ＋ 隱藏的 input，`id` 落在 input 上。
 *
 * ⚠️ **`label` 與 `children` 兩個都不給，這一項就沒有名字** —— 畫面上是一個沒有
 * 文字的圓點，螢幕閱讀器報「未命名的單選鈕」。與 `UiCheckbox` 同一條：
 * `children` 有沒有內容是執行期才知道的，元件守不住，所以寫在這裡。
 * 給了 `children` 就用不到 `label`。
 *
 * ── ⚠️ 代幣對照是人工核對的（見 UiBadge）────────────────────────────
 *
 *   border-primary / text-primary   → border-line / text-accent
 *   fill-primary（indicator 圓點）  → bg-accent（改用 div，少一個 svg）
 *   focus-visible:ring-ring/50      → focus-visible:ring-focus/50
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
