import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTableRowSlot } from "../theme.ts";

/** 一列（`<tr>`），React 版（C236）。為什麼沒有 hover，見 `UiTableRow.vue`。 */
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
  row: "transition-colors",
};
