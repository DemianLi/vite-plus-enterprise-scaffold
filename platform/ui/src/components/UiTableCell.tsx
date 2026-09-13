import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTableCellSlot } from "../theme.ts";

/**
 * 表身的一格（`<td>`）。
 *
 * ── `numeric` 那條軸是量出來的，不是加著好看 ────────────────────
 *
 * 數字欄要**靠右對齊 ＋ 等寬數字**，兩者缺一都會讓一欄金額對不齊：
 * 靠左的話小數點散在各處；比例字型的話 `1` 比 `8` 窄，位數對不上。
 *
 * `tabular-nums` 是 OpenType 的功能，不是自己排版排得出來的。
 * 做成 prop 而不是叫使用端傳 class，是因為**這一格永遠是這兩條一起**，
 * 而分開傳就會有人只記得其中一條。
 */
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
