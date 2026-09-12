import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTabsPanelSlot } from "../theme.ts";

/**
 * 一個分頁的內容，React 版（C236）。必須放在 `UiTabs` 裡，`value` 要對得上
 * `items[].value` —— 對不上是一片空白而不報錯，見 `UiTabsPanel.vue` 的檔頭。
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
