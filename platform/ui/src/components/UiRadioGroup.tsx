import { RadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiRadioGroupSlot } from "../theme.ts";

/**
 * 單選群組，React 版（C236），與 `UiRadioItem` 一組兩支。為什麼不收成 `items` 陣列、
 * 為什麼沒有橫向 orientation，見 `UiRadioGroup.vue` 的檔頭。
 *
 * 不給 `value` 就是非受控、一開始沒有選中（同 Vue 版 `defineModel` 預設空字串）。
 */
export function UiRadioGroup({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiRadioGroupSlot, string>> = {
    group: theme.UiRadioGroup?.group ?? DEFAULT_PARTS.group,
  };

  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange?.(String(next))}
      data-slot="radio-group"
      className={parts.group}
    >
      {children}
    </RadioGroup>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiRadioGroupSlot, string>> = {
  group: "flex flex-col gap-2",
};
