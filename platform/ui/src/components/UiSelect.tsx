import { Select } from "@base-ui/react/select";
import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSelectSlot } from "../theme.ts";

/**
 * 下拉選單，React 版（C237）。為什麼不是原生 `<select>`、為什麼收 `items` 陣列、
 * `placeholder` 為什麼必填、代幣對照，見 `UiSelect.vue` 的檔頭。
 *
 * ── C101 在 React 版的形狀：明列的 prop 落在觸發鈕上 ────────────────────
 *
 * Vue 版關掉 `inheritAttrs`、把 `$attrs` 整包轉給觸發鈕。React 沒有 fallthrough，所以
 * `UiField` 交出的三格（`id`／`aria-describedby`／`aria-invalid`）與 `aria-label` 明列在
 * 下面，全部交給 `Select.Trigger`。實測 Base UI 把 `id` 留在觸發鈕（`role="combobox"` 的
 * `<button>`，可被標籤），隱藏的表單 `<input>` 另取 `…-hidden-input` —— 所以
 * `<label for>` 指到的是使用者操作的那一顆。`tests/field-wiring-react.test.ts` 守著。
 *
 * ── 與 reka 版不同、量過的 ───────────────────────────────────────────
 *
 * - 值：Vue 版用空字串表示「沒選」，Base UI 用 `null`。對外照 Vue 版（`""`），在這裡互轉。
 *   ⚠️ 拿掉 `"" → null` 那一半零條紅（C237 M12）：Base UI 對不在 `items` 裡的值也顯示
 *   placeholder。留著是因為 `null` 才是它文件上的「沒選」，不靠那個巧合；而沒有任何選項
 *   能合法地以 `""` 為值，所以找不到分得出兩者的輸入。
 * - `alignItemWithTrigger={false}` ＝ reka 的 `position="popper"`（Base UI 預設是把選中項
 *   對齊觸發器，面板會蓋住它）。
 * - 面板寬度的變數是 Base UI 的 `--anchor-width`（reka 是 `--reka-select-trigger-width`），
 *   這是預設表與 Vue 版唯一的差別，列在 `tests/react-parity.test.ts` 的翻譯表。
 * - `Positioner` 上的 `z-50` 不在預設表裡：reka 會把 content 算出來的 `z-index` 抄到外層
 *   定位的那個元素（`PopperContent.js`），Base UI 不會 —— 定位的是 `Positioner`，
 *   `z-index` 寫在 `Popup` 上沒有效果。
 */
export function UiSelect({
  value,
  onValueChange,
  items,
  placeholder,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  items: readonly { value: string; label: string }[];
  placeholder: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiSelectSlot, string>> = {
    trigger: theme.UiSelect?.trigger ?? DEFAULT_PARTS.trigger,
    content: theme.UiSelect?.content ?? DEFAULT_PARTS.content,
    item: theme.UiSelect?.item ?? DEFAULT_PARTS.item,
    indicator: theme.UiSelect?.indicator ?? DEFAULT_PARTS.indicator,
    chevron: theme.UiSelect?.chevron ?? DEFAULT_PARTS.chevron,
  };

  return (
    <Select.Root
      items={items}
      value={value === undefined ? undefined : value === "" ? null : value}
      onValueChange={(next) => onValueChange?.(next ?? "")}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        data-slot="select"
        className={parts.trigger}
      >
        <Select.Value placeholder={placeholder} />
        <svg viewBox="0 0 16 16" className={parts.chevron} aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false} sideOffset={4} className="z-50">
          <Select.Popup data-slot="select-content" className={parts.content}>
            <Select.List className="p-1">
              {items.map((item) => (
                <Select.Item key={item.value} value={item.value} className={parts.item}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator className={parts.indicator}>
                    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiSelectSlot, string>> = {
  trigger: cn(
    "inline-flex h-10 w-full items-center justify-between gap-2",
    "rounded-control border-control border-line bg-transparent px-3 py-1",
    "text-sm shadow-xs transition-[color,box-shadow] outline-none",
    "data-[placeholder]:text-fg-muted",
    "focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50",
    "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ),
  content: cn(
    "z-50 min-w-(--anchor-width) overflow-hidden",
    "rounded-control border-control border-line bg-surface shadow-overlay",
  ),
  item: cn(
    "relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-3",
    "text-sm text-fg outline-none select-none",
    "focus:bg-surface-hover",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ),
  indicator: "absolute right-3 flex items-center text-accent",
  chevron: "size-4 text-fg-muted",
};
