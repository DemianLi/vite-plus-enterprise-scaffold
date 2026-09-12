import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTableSlot } from "../theme.ts";

/**
 * 資料表的 React 版（C236），與 `UiTableHead`／`UiTableBody`／`UiTableRow`／
 * `UiTableHeadCell`／`UiTableCell` 一組六支。為什麼是原生 `<table>`、為什麼六個檔案、
 * 外層捲動容器為什麼不是裝飾，見 `UiTable.vue` 的檔頭。
 */
export function UiTable({ children }: { children?: ReactNode }): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiTableSlot, string>> = {
    scroller: theme.UiTable?.scroller ?? DEFAULT_PARTS.scroller,
    table: theme.UiTable?.table ?? DEFAULT_PARTS.table,
  };

  return (
    <div data-slot="table" className={parts.scroller}>
      <table className={parts.table}>{children}</table>
    </div>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTableSlot, string>> = {
  scroller: "w-full overflow-x-auto",
  table: "w-full border-collapse text-sm",
};
