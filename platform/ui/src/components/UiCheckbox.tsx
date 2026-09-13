import { Checkbox } from "@base-ui/react/checkbox";
import { useId, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiCheckboxSlot } from "../theme.ts";

/**
 * 核取方塊。用 Base UI 的 Checkbox 基元 ＋ 原生 `<label>`。
 *
 * ── 為什麼不是 `<input type="checkbox">` ─────────────────────────
 *
 * 原生的那個**沒辦法換樣式**（勾勾是作業系統畫的），而各案換不掉勾勾的
 * 顏色就等於換不掉這個元件。慣用的解法是 `appearance-none` 加一個假勾勾，
 * 而那一步就把鍵盤操作、`aria-checked`、以及與 `<label>` 的關聯全部
 * 變成自己的責任 —— 那正是 `UiDialog` 用基元的同一條理由。
 *
 * ── ⚠️ 代幣對照是人工核對的（見 UiBadge 的說明）──────────────────────
 *
 *   border-primary / bg-primary        → border-line / bg-accent
 *   text-primary-foreground            → text-on-accent
 *   focus-visible:ring-ring/50         → focus-visible:ring-focus/50
 *   data-[state=checked]:bg-primary    → data-checked:bg-accent
 *   rounded-sm                         → rounded-control
 *
 * span 沒有 `:disabled`，而 Base UI 的狀態走 `data-*`，所以 `disabled:` 寫成
 * `data-disabled:`、`peer-disabled:` 寫成 `peer-data-disabled:`。
 *
 * ── 勾勾是內嵌 SVG 而不是圖示套件 ────────────────────────────────
 *
 * 多一個圖示套件就是多一筆 SCA 範圍、多一筆鏡像清單 —— 而換到的是一條
 * 八個字元的 path。`currentColor` 讓它跟著 `indicator` 那格代幣走，
 * 所以換配色時不必動到 SVG。
 *
 * ── 三態（indeterminate）刻意不做 ────────────────────────────────
 *
 * 基元支援它，但它要多一組受控的值，而目前沒有任何切片需要「部分選取」。
 * 真的需要時再加是一筆 minor（新增選填 prop）—— 現在先做是過度設計。
 *
 * ⚠️ **`label` 與 `children` 兩個都不給，這個方塊就沒有名字**（螢幕閱讀器會報
 * 「未命名的核取方塊」）。元件守不住 —— `children` 有沒有內容是執行期才知道的，
 * 而 `label` 必填會逼使用端為了「只想在標籤裡放一個連結」傳一個永遠不會顯示的字串
 * （第一版就是必填）。給了 `children` 就完全取代 `label`。
 *
 * ── 標籤的關聯是 review 補的，而少了它整個元件的無障礙是壞的 ──────
 *
 * 第一版的標籤沒有 `for`、也沒有包住基元，而基元沒有 `id` —— **兩者完全沒有關聯**。
 * 實測 SSR 產出：`role="checkbox"` 沒有任何 accessible name，旁邊一個沒有 `for` 的
 * `<label>`。點標籤不會切換，輔具讀不到名字。用了基元不等於接對了，而**畫面看起來
 * 完全正常**。`useId()` 在 SSR 與用戶端產生同一個值，不需要自己拼計數器。
 *
 * ── 標籤接到哪裡：與 reka-ui 不同，要量過 ───────────────────────────
 *
 * Base UI 的 Checkbox 是 `<span role="checkbox">` ＋ 一個隱藏的 `<input>`。`id` 落在
 * **input** 上（span 不是可標籤的元素，`<label for>` 指到它什麼都不會發生）；
 * 點標籤 → 瀏覽器點 input → 切換。span 的名字由 Base UI 的 `useAriaLabelledBy`
 * 從 input 的 `labels` 找回標籤、把它的 id 接成 `aria-labelledby`。
 * 兩件事都在 DOM 上量過。
 */
export function UiCheckbox({
  checked,
  onCheckedChange,
  label,
  children,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  children?: ReactNode;
}): ReactNode {
  const inputId = useId();
  const theme = useUiTheme();
  const parts: Readonly<Record<UiCheckboxSlot, string>> = {
    root: theme.UiCheckbox?.root ?? DEFAULT_PARTS.root,
    indicator: theme.UiCheckbox?.indicator ?? DEFAULT_PARTS.indicator,
    label: theme.UiCheckbox?.label ?? DEFAULT_PARTS.label,
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Checkbox.Root
        id={inputId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        data-slot="checkbox"
        className={parts.root}
      >
        <Checkbox.Indicator className={parts.indicator}>
          <svg viewBox="0 0 16 16" className="size-3" aria-hidden="true">
            <path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Checkbox.Indicator>
      </Checkbox.Root>
      {/* select-none 在預設表外面：行為不是樣式，理由見 UiLabel.tsx。 */}
      <label htmlFor={inputId} className={cn("select-none", parts.label)}>
        {children ?? label}
      </label>
    </div>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiCheckboxSlot, string>> = {
  root: cn(
    "peer size-4 shrink-0 rounded-control border-control border-line bg-surface",
    "transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-disabled:cursor-not-allowed data-disabled:opacity-50",
    "data-checked:border-accent data-checked:bg-accent",
  ),
  indicator: "flex items-center justify-center text-on-accent",
  label: "text-sm text-fg peer-data-disabled:opacity-50",
};
