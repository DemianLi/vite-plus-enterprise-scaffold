import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTableRowSlot } from "../theme.ts";

/** 一列（`<tr>`）。放 `UiTableHeadCell` 或 `UiTableCell`。 */
export function UiTableRow({ children }: { children?: ReactNode }): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiTableRowSlot, string>> = {
    row: theme.UiTableRow?.row ?? DEFAULT_PARTS.row,
  };

  return (
    <tr data-slot="table-row" className={parts.row}>
      {children}
    </tr>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTableRowSlot, string>> = {
  // ⚠️ **沒有 hover。** 第一版寫了 `hover:bg-surface-hover`，而這個元件同時用在
  // `<thead>` 與 `<tbody>` —— 於是滑鼠移到**表頭**那一列也會變色，看起來像可以點
  // （多半會被讀成「可以排序」），點下去什麼都沒發生。hover 由 `UiTableBody` 的
  // `[&>tr]:hover:…` 給，那只對表身成立。
  row: "transition-colors",
};
