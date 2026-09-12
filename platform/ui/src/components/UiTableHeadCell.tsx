import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTableHeadCellSlot } from "../theme.ts";

/**
 * 表頭的一格（`<th>`），React 版（C236）。`scope` 是這支存在的主要理由，見
 * `UiTableHeadCell.vue`；預設值寫在解構參數裡，契約的「預設值必須是 union 成員」讀的是那裡。
 */
export function UiTableHeadCell({
  scope = "col",
  children,
}: {
  scope?: "col" | "row";
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiTableHeadCellSlot, string>> = {
    cell: theme.UiTableHeadCell?.cell ?? DEFAULT_PARTS.cell,
  };

  return (
    <th data-slot="table-head-cell" scope={scope} className={parts.cell}>
      {children}
    </th>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTableHeadCellSlot, string>> = {
  cell: "px-3 py-2 text-left text-xs font-control text-fg-muted whitespace-nowrap",
};
