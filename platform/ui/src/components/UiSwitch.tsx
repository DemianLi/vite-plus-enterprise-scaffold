import { Switch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSwitchSlot } from "../theme.ts";

/**
 * 開關，React 版（C236）。它與核取方塊的語意差別、為什麼沒有內建標籤，見 `UiSwitch.vue`。
 *
 * ⚠️ Vue 版的 `id`／`aria-label` 走 fallthrough；React 沒有，所以明列。名字只能從外面來：
 * `<UiLabel htmlFor>` ＋ 同一個 `id`，或 `aria-label`。`id` 落在 Base UI 的隱藏 input 上，
 * 名字接回 `role="switch"` 那個 span 的路徑同 `UiCheckbox.tsx` 檔頭。
 *
 * 預設表與 Vue 版差在 variant：`data-[state=checked|unchecked]:` → `data-checked:`／
 * `data-unchecked:`、`disabled:` → `data-disabled:`（span 沒有 `:disabled`）。
 */
export function UiSwitch({
  checked,
  onCheckedChange,
  id,
  "aria-label": ariaLabel,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  "aria-label"?: string;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiSwitchSlot, string>> = {
    root: theme.UiSwitch?.root ?? DEFAULT_PARTS.root,
    thumb: theme.UiSwitch?.thumb ?? DEFAULT_PARTS.thumb,
  };

  return (
    <Switch.Root
      id={id}
      aria-label={ariaLabel}
      checked={checked}
      onCheckedChange={onCheckedChange}
      data-slot="switch"
      className={parts.root}
    >
      <Switch.Thumb className={parts.thumb} />
    </Switch.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiSwitchSlot, string>> = {
  root: cn(
    "inline-flex h-6 w-11 shrink-0 items-center rounded-full",
    "border-control border-transparent transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-disabled:cursor-not-allowed data-disabled:opacity-50",
    "data-checked:bg-accent data-unchecked:bg-surface-hover",
  ),
  thumb: cn(
    "pointer-events-none block size-5 rounded-full bg-surface shadow",
    "transition-transform",
    "data-checked:translate-x-5 data-unchecked:translate-x-0.5",
  ),
};
