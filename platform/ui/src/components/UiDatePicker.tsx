import { Popover } from "@base-ui/react/popover";
import { CalendarDate, getDayOfWeek } from "@internationalized/date";
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { DayPicker, type ChevronProps, type DayButtonProps } from "react-day-picker";
import { enUS, zhTW } from "react-day-picker/locale";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiDatePickerSlot } from "../theme.ts";

/**
 * 日期選擇器。
 *
 * ── 為什麼不是 `<input type="date">` ──────────────────────────────
 *
 * 原生的那個**日曆面板是作業系統畫的**，CSS 完全碰不到 —— 各案換不掉它，
 * 而「快速換配色與元件樣式」那條承諾對這一格就不成立。而且各家瀏覽器的呈現
 * 差很多（Safari 與 Firefox 的日曆長得完全不一樣）。同一條理由見 `UiSelect`。
 * 代價比其他元件大：日期還有**曆法、時區、地區格式**三個問題，而它們每一個
 * 自己寫都會錯。
 *
 * 形狀是「一顆按鈕 ＋ 日曆」，年月用下拉切換（C237 Q67）—— **不能打字**。Base UI 沒有日曆，
 * 日曆是 react-day-picker（C236 Q62）。
 *
 * ── 值的型別是 `CalendarDate`，不是 `Date` ──────────────────────────
 *
 * 這是**刻意的**，而且是這個元件最容易被「簡化」掉的一格。
 *
 * JS 的 `Date` 是一個**時間點**（UTC 毫秒），而使用者在日曆上點的是一個
 * **日曆日**。兩者在跨時區時不相等：台北時間 8/19 00:30 存成 `Date` 再用
 * UTC 讀出來是 **8/18** —— 那就是「生日差一天」這個經典 bug。
 * `CalendarDate` 沒有時間也沒有時區，它就是「2026 年 8 月 19 日」。
 * 送去後端時用 `value.toString()` 得到 `"2026-08-19"`（ISO 日期，不是時間戳）。
 *
 * ⚠️ 代價是 `@internationalized/date` 是 `platform/ui` 執行期的直接相依（C238 Q68）——
 * 它原本是跟著 reka-ui 進來的傳遞相依，reka 退場後它是自己的一筆供應鏈範圍。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守（見 UiBadge、#57）────────
 *
 *   border-input                     → border-line
 *   bg-popover / text-popover-fg     → bg-surface / text-fg
 *   text-muted-foreground            → text-fg-muted
 *   bg-primary / text-primary-fg     → bg-accent / text-on-accent
 *   ring-ring/50                     → ring-focus/50
 *   rounded-md                       → rounded-control
 *   shadow-md                        → shadow-overlay
 *
 * ⚠️ 與 `UiSelect` 同一個陷阱：上游用 `hover:bg-accent` 做「淺色 hover 底」，
 * 而本 repo 的 `--color-accent` 是**品牌主色（深色）**。這裡 hover 翻成
 * `surface-hover`，只有**選中**那一格才用 `bg-accent`。#57 的判準認不出這種
 * 「名字一樣、意思不同」，見 C78 §5。
 *
 * ── 八格的落點（C238 Q70）──────────────────────────────────────────
 *
 * 槽型別是照 reka 版的「分段輸入欄」切的，這裡沒有那個欄，所以逐格找對象：
 *
 *   field    → 整顆按鈕（`aria-invalid:*` 那三條從 reka 版起就是死的 —— `DatePickerRoot`
 *              不渲染元素、屬性落不下去（C79）—— 在這裡第一次生效）
 *   segment  → 按鈕裡的日期文字
 *   trigger  → 按鈕裡的日曆圖示
 *   content／nav／heading／headCell／day → 面板／上下月／年月下拉那一列／星期／日格
 *
 * ⚠️ `segment` 的 `focus:*` 與 `trigger` 的 `focus-visible:*` 在這裡**永遠不會觸發** ——
 * 那兩個元素不能聚焦。`tests/date-picker-react.test.ts` 的 ★ 守著這句話：哪天它不成立，
 * 那條會紅。
 *
 * ── 日格的狀態屬性照 reka 的名字蓋在按鈕上 ──────────────────────────
 *
 * react-day-picker 把 `data-selected`／`data-disabled` 放在 `<td>`，外側日叫 `data-outside`；
 * 預設表的 `day` 那格是寫給按鈕的、名字是 reka 的。自訂的 `DayButton` 照 reka 的名字重蓋一次，
 * 所以預設表與各案寫好的覆寫兩版通用，不必進翻譯表。⚠️ 例外是 `initialFocus`：它讀的是
 * react-day-picker 蓋在 `<td>` 上的 `data-selected`／`data-today`，那兩個名字改了焦點就落空
 *（C238 M17／M18 守著）。
 *
 * ── 值：本地午夜，兩個方向都是 ──────────────────────────────────────
 *
 * react-day-picker 只懂 `Date`。進去時取本地午夜、出來時讀本地的年月日；刻意**不**設它的
 * `timeZone` —— 設了之後同一個 `Date` 會被當成那個時區的時刻，「生日差一天」就回來了。
 * 用 `setFullYear` 而不是 `new Date(y, m, d)`：後者把 0–99 年解讀成 1900 年代。
 *
 * ── `locale` 是一張小表（C238 Q71）─────────────────────────────────
 *
 * 地區決定分段順序與星期名稱（`MM/DD/YYYY` vs `DD/MM/YYYY`），自己拼的症狀是「某些地區的
 * 使用者把生日打反」—— 而在開發者自己的機器上永遠正常。react-day-picker 要的是語系物件，
 * 對外收的是字串。照字串查全部語系要整批打包（約 95 個、壓縮後約 1.6MB），所以只收表裡
 * 那幾個；**表外的字串丟例外**：吞掉之後的症狀是「日期格式莫名其妙變成美式」，比整片白掉
 * 難查得多。⚠️ 型別刻意是 `string` 不是 union —— union 多一個成員會被 api-surface 判成
 * 破壞性，而加語系應該是新增。
 *
 * ⚠️ 預設值刻意是 `"zh-TW"` 而不是跟著瀏覽器：**跟著瀏覽器會讓同一份資料在不同人的畫面上
 * 長不一樣**，而政府案的表單截圖是要附在公文裡的。要跟著使用者的話明確傳 `navigator.language`。
 * 刻意**沒有**開 `minValue`／`maxValue`／不可選日：那是「這個欄位的規則」，而規則屬於表單
 * 不屬於設計系統 —— 真的需要時再開是一筆 minor（新增選填 prop）。
 *
 * ── 刻意的選擇 ───────────────────────────────────────────────────────
 *
 * - 選了就收（C238 Q73）。reka 的 `closeOnSelect` 預設 false；按鈕 ＋ 日曆的形狀下，
 *   不收的話每選一次都要再關一次。
 * - `placeholder` 必填（C238 Q72）：分段欄沒選時自己會顯示年月日佔位，按鈕沒有。
 * - 沒有 `invalid`：這裡是單一按鈕，`aria-invalid` 與 `UiSelect` 一樣走 `UiField` 的 `control`。
 * - 日期文字也掛進 `aria-describedby`：包在 `UiField` 裡時按鈕的名字是標籤，選好的日期
 *   只剩描述這條路會被念到。
 * - 年份下拉的範圍是今年前後各 100 年，並延伸到涵蓋目前的值。react-day-picker 的預設是
 *   「100 年前到今年年底」，那是出生日期的範圍，選不到明年。
 *
 * `Positioner` 上的 `z-50`，理由見 `UiSelect.tsx`。
 */
export function UiDatePicker({
  value,
  onValueChange,
  placeholder,
  locale = "zh-TW",
  id,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: CalendarDate;
  onValueChange?: (value: CalendarDate | undefined) => void;
  placeholder: string;
  locale?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiDatePickerSlot, string>> = {
    field: theme.UiDatePicker?.field ?? DEFAULT_PARTS.field,
    segment: theme.UiDatePicker?.segment ?? DEFAULT_PARTS.segment,
    trigger: theme.UiDatePicker?.trigger ?? DEFAULT_PARTS.trigger,
    content: theme.UiDatePicker?.content ?? DEFAULT_PARTS.content,
    nav: theme.UiDatePicker?.nav ?? DEFAULT_PARTS.nav,
    heading: theme.UiDatePicker?.heading ?? DEFAULT_PARTS.heading,
    headCell: theme.UiDatePicker?.headCell ?? DEFAULT_PARTS.headCell,
    day: theme.UiDatePicker?.day ?? DEFAULT_PARTS.day,
  };

  const calendar = calendarLocale(locale);
  const [open, setOpen] = useState(false);
  const textId = useId();
  const popup = useRef<HTMLDivElement>(null);

  const selected = value === undefined ? undefined : localMidnight(value);
  const thisYear = new Date().getFullYear();
  const firstYear = Math.min(thisYear - YEAR_SPAN, value?.year ?? thisYear);
  const lastYear = Math.max(thisYear + YEAR_SPAN, value?.year ?? thisYear);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={describedBy === undefined ? textId : `${textId} ${describedBy}`}
        aria-invalid={invalid}
        data-slot="date-picker"
        className={parts.field}
      >
        <span
          id={textId}
          data-placeholder={selected === undefined ? "" : undefined}
          className={parts.segment}
        >
          {selected === undefined
            ? placeholder
            : new Intl.DateTimeFormat(locale, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(selected)}
        </span>
        <span className={parts.trigger}>
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path
              d="M4 1.5v2M12 1.5v2M2 6h12M3 3h10a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} className="z-50">
          {/*
            焦點落在選中的那天，沒選時是今天（WAI-ARIA APG 的日期選擇對話框）。不用 react-day-picker
            的 `autoFocus`：jsx-a11y 的 `no-autofocus` 擋它，而 Base UI 本來就負責這一步。
          */}
          <Popover.Popup
            ref={popup}
            data-slot="date-picker-content"
            aria-label={placeholder}
            initialFocus={() =>
              popup.current?.querySelector<HTMLElement>("td[data-selected] button") ??
              popup.current?.querySelector<HTMLElement>("td[data-today] button") ??
              null
            }
            className={parts.content}
          >
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(date) => {
                onValueChange?.(date === undefined ? undefined : calendarDate(date));
                setOpen(false);
              }}
              locale={calendar}
              weekStartsOn={weekStartsOn(locale)}
              captionLayout="dropdown"
              navLayout="around"
              startMonth={localMidnight(new CalendarDate(firstYear, 1, 1))}
              endMonth={localMidnight(new CalendarDate(lastYear, 12, 1))}
              defaultMonth={selected}
              showOutsideDays
              components={{ Chevron, DayButton }}
              classNames={{
                month: "grid grid-cols-[auto_1fr_auto] items-center gap-y-2",
                month_caption: "flex justify-center",
                dropdowns: parts.heading,
                dropdown_root: cn(
                  "relative mx-0.5 inline-flex items-center rounded-control px-1",
                  "has-focus-visible:ring-3 has-focus-visible:ring-focus/50",
                ),
                dropdown: "absolute inset-0 cursor-pointer bg-surface opacity-0",
                caption_label: "inline-flex items-center gap-0.5",
                chevron: "size-4",
                button_previous: parts.nav,
                button_next: parts.nav,
                month_grid: "col-span-3 w-full border-collapse",
                weekday: parts.headCell,
                day: "p-0 text-center",
                day_button: parts.day,
                hidden: "invisible",
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const YEAR_SPAN = 100;

const CALENDAR_LOCALES = { "zh-TW": zhTW, "en-US": enUS } as const;

function calendarLocale(tag: string): (typeof CALENDAR_LOCALES)[keyof typeof CALENDAR_LOCALES] {
  if (!Object.hasOwn(CALENDAR_LOCALES, tag)) {
    throw new RangeError(
      `UiDatePicker 不支援 locale "${tag}"（支援：${Object.keys(CALENDAR_LOCALES).join("、")}）`,
    );
  }
  return CALENDAR_LOCALES[tag as keyof typeof CALENDAR_LOCALES];
}

/**
 * 一週從哪天開始，照 reka 的算法取自 CLDR（`getWeekStartsOn`，reka-ui `date/calendar.js`）。
 * react-day-picker 的語系物件自帶一個值，而 date-fns 的 zhTW 寫的是星期一 —— 台灣的月曆是星期日。
 */
function weekStartsOn(tag: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const monday = new CalendarDate(2025, 1, 6);
  return ((1 - getDayOfWeek(monday, tag) + 7) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

function localMidnight(date: CalendarDate): Date {
  const result = new Date(0);
  result.setFullYear(date.year, date.month - 1, date.day);
  result.setHours(0, 0, 0, 0);
  return result;
}

function calendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function DayButton({ day: _day, modifiers, ...props }: DayButtonProps): ReactElement {
  // 取代預設的那一支就要把它的焦點處理一起帶走：方向鍵移動時，是這個 effect 把焦點放上去。
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <button
      ref={ref}
      {...props}
      data-selected={modifiers.selected || undefined}
      data-outside-view={modifiers.outside || undefined}
      data-disabled={modifiers.disabled || undefined}
    />
  );
}

const CHEVRON_PATHS: Readonly<Record<NonNullable<ChevronProps["orientation"]>, string>> = {
  left: "M10 3L5 8l5 5",
  right: "M6 3l5 5-5 5",
  up: "M4 10l4-4 4 4",
  down: "M4 6l4 4 4-4",
};

function Chevron({ orientation = "left", className }: ChevronProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        d={CHEVRON_PATHS[orientation]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiDatePickerSlot, string>> = {
  field: cn(
    "inline-flex h-10 w-full items-center gap-1",
    "rounded-control border-control border-line bg-transparent px-3 py-1",
    "text-sm shadow-xs transition-[color,box-shadow]",
    "focus-within:border-focus focus-within:ring-3 focus-within:ring-focus/50",
    "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
  ),
  segment: cn(
    "rounded-sm px-0.5 tabular-nums outline-none",
    "focus:bg-accent focus:text-on-accent",
    "data-[placeholder]:text-fg-muted",
  ),
  trigger: cn(
    "ml-auto inline-flex items-center rounded-control p-1 text-fg-muted",
    "transition-colors outline-none",
    "hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-focus/50",
  ),
  content: cn("z-50 rounded-control border-control border-line bg-surface p-3 shadow-overlay"),
  nav: cn(
    "inline-flex size-7 items-center justify-center rounded-control text-fg-muted",
    "transition-colors outline-none",
    "hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-focus/50",
  ),
  heading: "text-sm font-control text-fg",
  headCell: "size-8 text-xs font-normal text-fg-muted",
  day: cn(
    "inline-flex size-8 items-center justify-center rounded-control text-sm tabular-nums",
    "text-fg transition-colors outline-none",
    "hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-[selected]:bg-accent data-[selected]:text-on-accent",
    "data-[outside-view]:text-fg-muted data-[outside-view]:opacity-50",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ),
};
