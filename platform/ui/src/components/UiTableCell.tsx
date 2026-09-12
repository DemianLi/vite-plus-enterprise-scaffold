import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTableCellSlot } from "../theme.ts";

/** 表身的一格（`<td>`），React 版（C236）。`numeric` 為什麼是一個 prop，見 `UiTableCell.vue`。 */
export function UiTableCell({
  numeric = false,
  children,
}: {
  numeric?: boolean;
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiTableCellSlot, string>> = {
    cell: theme.UiTableCell?.cell ?? DEFAULT_PARTS.cell,
    numeric: theme.UiTableCell?.numeric ?? DEFAULT_PARTS.numeric,
  };

  return (
    <td data-slot="table-cell" className={cn(parts.cell, numeric ? parts.numeric : "")}>
      {children}
    </td>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTableCellSlot, string>> = {
  cell: "px-3 py-2 text-fg align-middle",
  numeric: "text-right tabular-nums",
};
