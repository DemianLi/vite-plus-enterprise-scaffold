import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiLabelSlot } from "../theme.ts";

/**
 * 表單欄位的標籤。
 *
 * ── 為什麼要獨立出來 ──────────────────────────────────────────────
 *
 * `UiCheckbox` 自己就有一個標籤（它把 `<label>` 埋在裡面），而那是對的 ——
 * 核取方塊與它的文字是**一個互動單位**，分開就會有人忘了接 `htmlFor`
 *（C76 的 review 抓到的正是這件事）。
 *
 * 但 `UiInput`／`UiSelect`／`UiTextarea` 不一樣：它們的標籤在**版面上**是分開的
 *（上面一行、或左邊一欄），排版由使用端決定。埋進去就等於把版面決定寫死在
 * `platform/`。
 *
 * ⚠️ 所以 `htmlFor` 是**使用端的責任**，而這裡沒有任何閘門守得住它 ——
 * 「這個 `htmlFor` 有沒有對到一個真的存在的 `id`」是執行期的問題。
 * 少了它的症狀與 C76 那條一樣：點標籤不會聚焦、輔具讀不到欄位名字，
 * **而畫面完全正常**。prop 叫 `htmlFor` 不叫 `for`：後者在 JSX 裡是保留字。
 *
 * ⚠️ **雙擊標籤會反白**是原生 `<label>` 的老問題。reka-ui 的 `Label` 用 mousedown
 * 處理器修（判斷 `detail > 1`）；Base UI 沒有這個基元，而把處理器掛在 `<label>` 上
 * 會被 jsx-a11y 的 `no-noninteractive-element-interactions` 判紅（它不是互動，但規則
 * 分不出來）。所以改用 `select-none`（shadcn 的 Label 同一個做法）—— 代價是標籤文字
 * 整個不能選取，不只雙擊。它**刻意寫在預設表外面**：那是行為不是樣式，覆寫整條替換時
 * 不該被一起換掉。`UiCheckbox`、`UiRadioItem` 的標籤同一個處置。
 */
export function UiLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiLabelSlot, string>> = {
    label: theme.UiLabel?.label ?? DEFAULT_PARTS.label,
  };

  return (
    <label data-slot="label" htmlFor={htmlFor} className={cn("select-none", parts.label)}>
      {children}
    </label>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiLabelSlot, string>> = {
  label: "text-sm font-control text-fg",
};
