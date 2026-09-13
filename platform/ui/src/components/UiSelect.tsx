import { Select } from "@base-ui/react/select";
import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSelectSlot } from "../theme.ts";

/**
 * 下拉選單。
 *
 * ── 為什麼不是 `<select>` ─────────────────────────────────────────
 *
 * 原生 `<select>` 的**選項清單是作業系統畫的**，CSS 碰不到。也就是各案
 * 換不掉它 —— 而「快速換配色與元件樣式」那條承諾對這一格會不成立。
 * 這與 `UiCheckbox` 不用原生的是同一條理由，只是更嚴重：勾勾是一個圖示，
 * 選項清單是整個面板。代價是鍵盤導航、`aria-activedescendant`、輸入首字跳選、
 * 以及點外面關閉全部變成自己的責任 —— 基元把這些做完了。
 *
 * Portal 把面板掛到 `<body>` 底下，所以**外層的 `overflow: hidden` 不會裁到它** ——
 * 那正是自己寫下拉最常撞的那面牆。
 *
 * ── 為什麼用 `items` 陣列而不是 Root ＋ Item ──────────────────────
 *
 * 判準與 `UiRadioGroup` 那一條相同（那裡選了兩個檔案）：**項目的內容是不是
 * 任意的**。下拉的選項是一行字 —— 放連結或輸入框在一個 listbox 裡不但少見，
 * 而且會壞掉鍵盤導航。所以這裡收成陣列，與 `UiTabs` 同一邊。
 * 真的需要圖示選項時再開 `UiSelectItem` 是一筆 minor（新增 export）。
 *
 * 箭頭是內嵌 SVG（少一個圖示套件就是少一筆 SCA 範圍），帶 `aria-hidden` ——
 * 觸發鈕自己就有 role 與可及名稱，箭頭再被唸一次只是噪音。
 *
 * ── ⚠️ 代幣對照是人工核對的（見 UiBadge）────────────────────────────
 *
 *   border-input                     → border-line
 *   bg-popover / text-popover-fg     → bg-surface / text-fg
 *   focus:bg-accent（項目 hover）    → focus:bg-surface-hover
 *   text-muted-foreground            → text-fg-muted
 *   ring-ring/50                     → ring-focus/50
 *   rounded-md                       → rounded-control
 *   shadow-md                        → shadow-overlay
 *
 * ⚠️ `focus:bg-accent` 那一條**不能直譯**：上游的 `accent` 是「淺色強調底」，
 * 本 repo 的 `--color-accent` 是**品牌主色**（深色）。直譯會讓 hover 的
 * 選項變成深色底配深色字。這是「名字剛好一樣但意思不同」的實例 ——
 * `accent` 在我們的 `@theme` 裡有宣告，所以看起來完全合法。只有人讀得出來。
 *
 * ── 名字與接線：明列的 prop 落在觸發鈕上 ─────────────────────────────
 *
 * 這個元件沒有內建標籤，名字只能來自 `<UiLabel htmlFor>` ＋ 同一個 `id`、或 `aria-label`；
 * 兩個都不給就是一個沒有名字的 combobox。在瀏覽器裡量到過這一格斷掉的樣子：
 * 畫面上看得到標籤，而 `<label for>` **指向一個不存在的元素**，滑鼠使用者完全看不出來。
 *
 * 所以 `UiField` 交出的三格（`id`／`aria-describedby`／`aria-invalid`）與 `aria-label` 明列在
 * 下面，全部交給 `Select.Trigger`。實測 Base UI 把 `id` 留在觸發鈕（`role="combobox"` 的
 * `<button>`，可被標籤），隱藏的表單 `<input>` 另取 `…-hidden-input` —— 所以
 * `<label for>` 指到的是使用者操作的那一顆。
 *
 * `placeholder` 必填：選填時未選取的觸發器會變成一個只有箭頭的空框 ——
 * 套著淡色文字的樣式卻什麼都沒顯示，使用者看不出那是一個選單。
 *
 * ── 對 Base UI 量過的 ─────────────────────────────────────────────
 *
 * - 值：對外用空字串表示「沒選」，Base UI 用 `null`，在這裡互轉。
 *   ⚠️ 拿掉 `"" → null` 那一半，行為不變：Base UI 對不在 `items` 裡的值也顯示
 *   placeholder。留著是因為 `null` 才是它文件上的「沒選」，不靠那個巧合；而沒有任何選項
 *   能合法地以 `""` 為值，所以找不到分得出兩者的輸入。
 * - `alignItemWithTrigger={false}`：Base UI 預設把選中項對齊觸發器，面板會蓋住它。
 * - 面板寬度的變數是 Base UI 的 `--anchor-width`。
 * - `Positioner` 上的 `z-50` 不在預設表裡：定位的是 `Positioner`，`z-index` 寫在 `Popup`
 *   上沒有效果（reka 會把 content 的 `z-index` 抄到外層定位元素，Base UI 不會）。
 */
export function UiSelect({
  value,
  onValueChange,
  items,
  placeholder,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  items: readonly { value: string; label: string }[];
  placeholder: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiSelectSlot, string>> = {
    trigger: theme.UiSelect?.trigger ?? DEFAULT_PARTS.trigger,
    content: theme.UiSelect?.content ?? DEFAULT_PARTS.content,
    item: theme.UiSelect?.item ?? DEFAULT_PARTS.item,
    indicator: theme.UiSelect?.indicator ?? DEFAULT_PARTS.indicator,
    chevron: theme.UiSelect?.chevron ?? DEFAULT_PARTS.chevron,
  };

  return (
    <Select.Root
      items={items}
      value={value === undefined ? undefined : value === "" ? null : value}
      onValueChange={(next) => onValueChange?.(next ?? "")}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        data-slot="select"
        className={parts.trigger}
      >
        <Select.Value placeholder={placeholder} />
        <svg viewBox="0 0 16 16" className={parts.chevron} aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false} sideOffset={4} className="z-50">
          <Select.Popup data-slot="select-content" className={parts.content}>
            <Select.List className="p-1">
              {items.map((item) => (
                <Select.Item key={item.value} value={item.value} className={parts.item}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator className={parts.indicator}>
                    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiSelectSlot, string>> = {
  trigger: cn(
    "inline-flex h-10 w-full items-center justify-between gap-2",
    "rounded-control border-control border-line bg-transparent px-3 py-1",
    "text-sm shadow-xs transition-[color,box-shadow] outline-none",
    "data-[placeholder]:text-fg-muted",
    "focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50",
    "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ),
  content: cn(
    "z-50 min-w-(--anchor-width) overflow-hidden",
    "rounded-control border-control border-line bg-surface shadow-overlay",
  ),
  item: cn(
    "relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-3",
    "text-sm text-fg outline-none select-none",
    "focus:bg-surface-hover",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ),
  indicator: "absolute right-3 flex items-center text-accent",
  // ⚠️ 這一格是 review 補的：第一版把 `text-fg-muted` 寫死在 `<svg>` 上，於是各案換得掉
  // 觸發器、**換不掉箭頭**（元素自己的 class 贏）。與 `UiBadge` 上抓到的是同一個形狀。
  chevron: "size-4 text-fg-muted",
};
