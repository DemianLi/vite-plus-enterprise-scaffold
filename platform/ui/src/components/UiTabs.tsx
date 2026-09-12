import { Tabs } from "@base-ui/react/tabs";
import { useState, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTabsSlot } from "../theme.ts";

/**
 * 分頁，React 版（C236），與 `UiTabsPanel` 一組兩支。為什麼 trigger 收成 `items` 陣列、
 * `value` 為什麼是 `string` 不是 union，見 `UiTabs.vue` 的檔頭。
 *
 * 預設表與 Vue 版只差一個 variant：Base UI 的作用中分頁是 `data-active`，
 * 不是 reka 的 `data-state="active"`。
 */
export function UiTabs({
  items,
  value,
  onValueChange,
  children,
}: {
  items: readonly { value: string; label: string }[];
  value?: string;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}): ReactNode {
  // 沒給值（或給空字串）時選第一個分頁 —— 同 `UiTabs.vue` 的 `current`：少了它是一排按鈕
  // 配一片空白而不報錯。沒受控時自己記著選到哪（同 `defineModel` 沒綁時的本地狀態）。
  const [own, setOwn] = useState("");
  const chosen = value ?? own;
  const current = chosen === "" ? (items[0]?.value ?? "") : chosen;
  const select = (next: string): void => {
    setOwn(next);
    onValueChange?.(next);
  };

  const theme = useUiTheme();
  const parts: Readonly<Record<UiTabsSlot, string>> = {
    list: theme.UiTabs?.list ?? DEFAULT_PARTS.list,
    trigger: theme.UiTabs?.trigger ?? DEFAULT_PARTS.trigger,
  };

  return (
    <Tabs.Root data-slot="tabs" value={current} onValueChange={(next) => select(String(next))}>
      <Tabs.List className={parts.list}>
        {items.map((item) => (
          <Tabs.Tab key={item.value} value={item.value} className={parts.trigger}>
            {item.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTabsSlot, string>> = {
  list: "inline-flex items-center gap-1 rounded-surface bg-surface-hover p-1",
  trigger: cn(
    "inline-flex items-center rounded-control px-3 py-1 text-sm font-control",
    "text-fg-muted transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-active:bg-surface data-active:text-fg",
  ),
};
