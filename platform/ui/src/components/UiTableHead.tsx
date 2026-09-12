import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTableHeadSlot } from "../theme.ts";

/** 表頭（`<thead>`），React 版（C236）。為什麼不叫上游的 `TableHeader`，見 `UiTableHead.vue`。 */
export function UiTableHead({ children }: { children?: ReactNode }): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiTableHeadSlot, string>> = {
    head: theme.UiTableHead?.head ?? DEFAULT_PARTS.head,
  };

  return (
    <thead data-slot="table-head" className={parts.head}>
      {children}
    </thead>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTableHeadSlot, string>> = {
  head: "border-b-control border-line",
};
