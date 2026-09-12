import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiDropdownMenuSlot } from "../theme.ts";

/**
 * 表格每一列右邊那顆「⋯」，React 版（C237）。它與 `UiSelect` 的差別、`label` 為什麼必填、
 * 名字為什麼放在 `sr-only` 的 `<span>` 而不是 `aria-label`、為什麼收 `items` 陣列，
 * 見 `UiDropdownMenu.vue` 的檔頭。
 *
 * ── 那段論證在 Base UI 上仍然成立的前提，量過 ─────────────────────────
 *
 * `Menu.Popup` 的 `aria-labelledby` 由 `MenuRoot` 接到觸發器的 id —— 與 reka 相同，所以
 * 「觸發器沒有名字，選單也一起沒有」照舊，`sr-only` 那個 `<span>` 仍是唯一的名字來源。
 *
 * ── 與 reka 版不同、量過的（`tests/dropdown-menu-react.test.ts`）──────────
 *
 * - **到底不繞回**：Base UI 的 `loopFocus` 預設 `true`，這裡設 `false` 照 Vue 版的行為。
 * - **disabled 的項目方向鍵停得到**：reka 跳過它，Base UI 讓它可聚焦（`aria-disabled`，
 *   點了沒反應）。沒有選項可改，照上游。
 * - **打開時焦點落點**：用鍵盤或點擊打開 → 第一項；程式設 `open` → 選單容器，不論頁面上
 *   最後一個輸入是什麼。reka 那個「整頁單例旗標」在這裡不存在。
 * - **modal**：預設照樣鎖捲動，但選單以外**不加** `aria-hidden` —— Base UI 用一層透明的
 *   內部遮罩擋指標，外面只掛一個標記屬性（`data-base-ui-inert`）。所以 Vue 檔頭那段
 *   「觸發器自己也被 `aria-hidden` 蓋住」在這裡不發生。
 * - **`danger` 疊在 `item` 上走 `cn()`**：兩格都有 `data-[highlighted]:` 的底色時，
 *   twMerge 讓 `danger` 贏；Vue 版是兩個都留、看 CSS 順序。
 */
export function UiDropdownMenu({
  open,
  onOpenChange,
  label,
  items,
  align = "end",
  onSelect,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label: string;
  items: readonly {
    value: string;
    label: string;
    disabled?: boolean;
    variant?: "default" | "danger";
  }[];
  align?: "start" | "end";
  onSelect?: (value: string) => void;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiDropdownMenuSlot, string>> = {
    trigger: theme.UiDropdownMenu?.trigger ?? DEFAULT_PARTS.trigger,
    icon: theme.UiDropdownMenu?.icon ?? DEFAULT_PARTS.icon,
    content: theme.UiDropdownMenu?.content ?? DEFAULT_PARTS.content,
    item: theme.UiDropdownMenu?.item ?? DEFAULT_PARTS.item,
    danger: theme.UiDropdownMenu?.danger ?? DEFAULT_PARTS.danger,
  };

  return (
    <Menu.Root open={open} onOpenChange={onOpenChange} loopFocus={false}>
      <Menu.Trigger data-slot="dropdown-menu-trigger" className={parts.trigger}>
        <svg viewBox="0 0 16 16" className={parts.icon} aria-hidden="true">
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </svg>
        <span className="sr-only">{label}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align={align} sideOffset={4} className="z-50">
          <Menu.Popup data-slot="dropdown-menu" className={parts.content}>
            {items.map((item) => (
              <Menu.Item
                key={item.value}
                disabled={item.disabled}
                label={item.label}
                className={cn(parts.item, item.variant === "danger" ? parts.danger : "")}
                onClick={() => onSelect?.(item.value)}
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiDropdownMenuSlot, string>> = {
  trigger: cn(
    "inline-flex size-8 items-center justify-center rounded-control",
    "text-fg-muted transition-[color,box-shadow] outline-none",
    "hover:bg-surface-hover hover:text-fg",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-popup-open:bg-surface-hover data-popup-open:text-fg",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ),
  icon: "size-4",
  content: cn(
    "z-50 min-w-40 overflow-hidden p-1",
    "rounded-control border-control border-line bg-surface shadow-overlay",
  ),
  item: cn(
    "relative flex w-full cursor-default items-center gap-2",
    "rounded-control px-3 py-1.5 text-sm text-fg outline-none select-none",
    "data-[highlighted]:bg-surface-hover",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ),
  danger: "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger",
};
