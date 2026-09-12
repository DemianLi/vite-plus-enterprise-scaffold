import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTableBodySlot } from "../theme.ts";

/** 表身（`<tbody>`），React 版（C236）。hover 為什麼在這裡而不在列上，見 `UiTableBody.vue`。 */
export function UiTableBody({ children }: { children?: ReactNode }): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiTableBodySlot, string>> = {
    body: theme.UiTableBody?.body ?? DEFAULT_PARTS.body,
  };

  return (
    <tbody data-slot="table-body" className={parts.body}>
      {children}
    </tbody>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTableBodySlot, string>> = {
  body: "divide-y divide-line [&>tr]:hover:bg-surface-hover",
};
