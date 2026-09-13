import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTabsPanelSlot } from "../theme.ts";

/**
 * 一個分頁的內容。必須放在 `UiTabs` 裡面，`value` 要與 `items[].value` 其中一個完全相同。
 *
 * ── 為什麼是獨立的檔案而不是 `UiTabs` 的一個 prop ─────────────────
 *
 * 因為**數量是使用端決定的**。做成 `panelA`／`panelB` 這種具名 prop 的話，
 * `UiTabs` 就得先知道有幾個分頁。這是 Root ＋ Item 這個形狀存在的理由：
 * Item 的**數量與內容**都在使用端，Root 只提供上下文。
 *
 * ⚠️ 放在 `UiTabs` 外面、或 `value` 對不上，都不會報錯，只會**什麼都不渲染**。
 * 執行期才知道，元件守不住，所以寫在這裡。
 */
export function UiTabsPanel({
  value,
  children,
}: {
  value: string;
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiTabsPanelSlot, string>> = {
    panel: theme.UiTabsPanel?.panel ?? DEFAULT_PARTS.panel,
  };

  return (
    <Tabs.Panel data-slot="tabs-panel" value={value} className={parts.panel}>
      {children}
    </Tabs.Panel>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTabsPanelSlot, string>> = {
  panel: "mt-4 outline-none focus-visible:ring-3 focus-visible:ring-focus/50",
};
