import { Checkbox } from "@base-ui/react/checkbox";
import { useId, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiCheckboxSlot } from "../theme.ts";

/**
 * 核取方塊，React 版（C236）。為什麼不用原生的、勾勾為什麼是內嵌 SVG、`label` 與
 * `children` 都不給就沒有名字，見 `UiCheckbox.vue` 的檔頭。
 *
 * ── 標籤接到哪裡：與 reka-ui 不同，要量過 ───────────────────────────
 *
 * Base UI 的 Checkbox 是 `<span role="checkbox">` ＋ 一個隱藏的 `<input>`。`id` 落在
 * **input** 上（span 不是可標籤的元素，`<label for>` 指到它什麼都不會發生）；
 * 點標籤 → 瀏覽器點 input → 切換。span 的名字由 Base UI 的 `useAriaLabelledBy`
 * 從 input 的 `labels` 找回標籤、把它的 id 接成 `aria-labelledby`。
 * 兩件事都由 `tests/choice-react.test.ts` 在 DOM 上量。
 *
 * ── 預設表與 Vue 版差在三個 variant ──────────────────────────────────
 *
 * span 沒有 `:disabled`，而 Base UI 的狀態走 `data-*`：
 *
 *   data-[state=checked]:  → data-checked:
 *   disabled:              → data-disabled:
 *   peer-disabled:         → peer-data-disabled:
 *
 * 除此之外逐字相同，由 `tests/react-parity.test.ts` 對著這張翻譯表比對。
 */
export function UiCheckbox({
  checked,
  onCheckedChange,
  label,
  children,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  children?: ReactNode;
}): ReactNode {
  const inputId = useId();
  const theme = useUiTheme();
  const parts: Readonly<Record<UiCheckboxSlot, string>> = {
    root: theme.UiCheckbox?.root ?? DEFAULT_PARTS.root,
    indicator: theme.UiCheckbox?.indicator ?? DEFAULT_PARTS.indicator,
    label: theme.UiCheckbox?.label ?? DEFAULT_PARTS.label,
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Checkbox.Root
        id={inputId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        data-slot="checkbox"
        className={parts.root}
      >
        <Checkbox.Indicator className={parts.indicator}>
          <svg viewBox="0 0 16 16" className="size-3" aria-hidden="true">
            <path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Checkbox.Indicator>
      </Checkbox.Root>
      {/* select-none 在預設表外面：行為不是樣式，理由見 UiLabel.tsx。 */}
      <label htmlFor={inputId} className={cn("select-none", parts.label)}>
        {children ?? label}
      </label>
    </div>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiCheckboxSlot, string>> = {
  root: cn(
    "peer size-4 shrink-0 rounded-control border-control border-line bg-surface",
    "transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-disabled:cursor-not-allowed data-disabled:opacity-50",
    "data-checked:border-accent data-checked:bg-accent",
  ),
  indicator: "flex items-center justify-center text-on-accent",
  label: "text-sm text-fg peer-data-disabled:opacity-50",
};
