import { Switch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSwitchSlot } from "../theme.ts";

/**
 * 開關。
 *
 * ── 它與 `UiCheckbox` 不是同一件事，而選錯的代價是使用者按錯 ────────
 *
 * 兩者的視覺差別是慣例，**語意差別是真的**：
 *
 *   核取方塊  —— 表單的一部分，要按「送出」才生效
 *   開關      —— **立刻生效**，沒有送出這一步
 *
 * 所以「同意條款」永遠是 checkbox，「深色模式」永遠是 switch。
 * 把設定頁做成 checkbox 的話使用者會找送出鈕；把表單做成 switch 的話
 * 使用者會以為已經存檔了。這一條沒有閘門，只有這段話。
 * `role="switch"` 與 `aria-checked` 就是那個語意差別在輔具那一端的樣子。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守（見 UiBadge、#57）────────
 *
 *   data-[state=checked]:bg-primary    → data-checked:bg-accent
 *   data-[state=unchecked]:bg-input    → data-unchecked:bg-surface-hover
 *   bg-background（thumb）             → bg-surface
 *   focus-visible:ring-ring/50         → focus-visible:ring-focus/50
 *   rounded-full                       → 留著（開關就是圓的，不是代幣）
 *
 * ⚠️ `rounded-full` 刻意**不**換成 `rounded-control`：圓角在這裡不是風格
 * 選擇，是「這是一個開關」的形狀本身。真的要換的案子換整條槽。
 * `disabled:` 寫成 `data-disabled:`：Base UI 的開關是 span，沒有 `:disabled` 可選。
 *
 * ── ⚠️ 這個元件**沒有內建標籤**（`UiCheckbox` 與 `UiRadioItem` 有）──────
 *
 * 名字只能從外面來：`<UiLabel htmlFor>` ＋ 同一個 `id`，或 `aria-label`。
 * 兩個都不給的話開關是沒有名字的 —— 沒有閘門守得住，只有這句話。`id` 落在
 * Base UI 的隱藏 input 上，名字接回 `role="switch"` 那個 span 的路徑同 `UiCheckbox.tsx` 檔頭。
 * `id` 是選填而不是必填：`<UiSwitch aria-label="深色模式" />` 是完全合法、
 * 無障礙也正確的寫法，必填會讓它過不了型別檢查。
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
