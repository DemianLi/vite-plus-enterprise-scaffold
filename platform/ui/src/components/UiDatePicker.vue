<script setup lang="ts">
import {
  DatePickerCalendar,
  DatePickerCell,
  DatePickerCellTrigger,
  DatePickerContent,
  DatePickerField,
  DatePickerGrid,
  DatePickerGridBody,
  DatePickerGridHead,
  DatePickerGridRow,
  DatePickerHeadCell,
  DatePickerHeader,
  DatePickerHeading,
  DatePickerInput,
  DatePickerNext,
  DatePickerPrev,
  DatePickerRoot,
  DatePickerTrigger,
} from "reka-ui";
import { inject } from "vue";
import type { DateValue } from "@internationalized/date";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiDatePickerSlot } from "../theme.ts";

/**
 * 日期選擇器。
 *
 * ── 為什麼不是 `<input type="date">` ──────────────────────────────
 *
 * 原生的那個**日曆面板是作業系統畫的**，CSS 完全碰不到 —— 各案換不掉它，
 * 而「快速換配色與元件樣式」那條承諾對這一格就不成立。而且各家瀏覽器的呈現
 * 差很多（Safari 與 Firefox 的日曆長得完全不一樣）。同一條理由見 `UiSelect`。
 *
 * 代價比其他元件大：日期還有**曆法、時區、地區格式**三個問題，而它們每一個
 * 自己寫都會錯。
 *
 * ── ⚠️ 這是本 repo 第一個宣告 `@internationalized/date` 的地方 ────────
 *
 * **但它不是一筆新的供應鏈範圍。** 那個套件從第一天就在樹裡 ——
 * `reka-ui` 自己相依它（連同 `@internationalized/number`）。這裡做的只是把
 * 「本來就在用」寫成明的：`platform/ui` 要直接 import `DateValue`
 * 才接得出型別，而 pnpm 的嚴格解析不允許用沒宣告的相依。
 *
 * ⚠️ 版本跟著 `reka-ui` 的範圍（`^3`）。釘死一個 exact 版本會在 reka-ui 升版時
 * 產生**第二份**副本 —— 那正是 D15 記過的 `lightningcss` 兩個版本的形狀。
 *
 * ⚠️ v1 這條線上**沒有** `tools/exit-drill` 與 `tools/supply-chain`
 *（它們在 `main`），所以這裡沒有清單要跟著更新。在 `main` 上加這一筆時
 * 要回頭看 D15 記的那四件事。
 *
 * ── ⚠️ `data-slot` 與 `aria-invalid` 掛在 field 上，**不是 Root 上** ──
 *
 * `DatePickerRoot` 是**非渲染的 provider**，掛在它身上的屬性會被安靜丟掉。
 * 實測第一版把 `data-slot` 放在 Root，產出裡完全找不到它 —— ⚠️ 而
 * `theme-verify` 的靜態掃描讀的是**原始碼**，所以它看得到那個字串、
 * 閘門全綠，只有真的渲染出來才發現不見了。
 *
 * ── 分段順序由 locale 決定，那正是自己寫一定會錯的一格 ────────────
 *
 * 年／月／日的排列在不同地區是相反的（`MM/DD/YYYY` vs `DD/MM/YYYY`），
 * 而 reka-ui 的 `segments` 已經照 `locale` 排好。自己拼的話症狀是
 * 「某些地區的使用者把生日打反」—— 而在開發者自己的機器上永遠正常。
 *
 * ── 值的型別是 `DateValue`，不是 `Date` ──────────────────────────
 *
 * 這是**刻意的**，而且是這個元件最容易被「簡化」掉的一格。
 *
 * JS 的 `Date` 是一個**時間點**（UTC 毫秒），而使用者在日曆上點的是一個
 * **日曆日**。兩者在跨時區時不相等：台北時間 8/19 00:30 存成 `Date` 再用
 * UTC 讀出來是 **8/18** —— 那就是「生日差一天」這個經典 bug。
 *
 * `CalendarDate` 沒有時間也沒有時區，它就是「2026 年 8 月 19 日」。
 * 送去後端時用 `value.toString()` 得到 `"2026-08-19"`（ISO 日期，不是時間戳）。
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
 */

const value = defineModel<DateValue | undefined>({ default: undefined });

withDefaults(
  defineProps<{
    /**
     * 分段順序與星期名稱的地區。預設 `"zh-TW"`。
     *
     * ⚠️ **這個 prop 是 review 逼出來的，而它逼出的是一句不實的檔頭。**
     * 上面寫著「日期還有曆法、時區、地區格式三個問題」——而不開這個 prop 的話
     * 第三個根本沒解：reka-ui 的預設是 `en-US`，實測產出是 `8/19/2026`，
     * 而且**各案換不掉**。一個對外賣「快速換配色與元件樣式」的設計系統，
     * 在日期欄位上把地區格式寫死，是同一種「寫了但不成立」。
     *
     * ⚠️ 預設值刻意是 `"zh-TW"` 而不是跟著瀏覽器：**跟著瀏覽器會讓同一份
     * 資料在不同人的畫面上長不一樣**，而政府案的表單截圖是要附在公文裡的。
     * 要跟著使用者的話明確傳 `navigator.language`。
     *
     * ⚠️ 刻意**沒有**開 `minValue`／`maxValue`／`isDateUnavailable`。
     * 那三個是「這個欄位的規則」，而規則屬於表單不屬於設計系統 ——
     * 真的需要時再開是一筆 minor（新增選填 prop）。
     *
     * ⚠️ **不合法的 locale 會丟例外**（`Invalid language tag: zh-TWW`），
     * 而那個例外沒有地方接 —— 整片畫面會白掉。實測過。這裡刻意不 try／catch：
     * 吞掉之後的症狀是「日期格式莫名其妙變成美式」，比白掉難查得多。
     */
    locale?: string;

    /**
     * 這一格驗證失敗。
     *
     * ⚠️ **這個 prop 是 review 逼出來的，而它逼出的是三條死掉的 class。**
     * `field` 槽從第一版就寫著 `aria-invalid:border-danger` 那三條，
     * 但**沒有任何路徑把 `aria-invalid` 放到那個 `<div>` 上**：
     * `DatePickerRoot` 是一個不渲染元素的 provider，使用端的 fallthrough
     * 屬性落在它身上就消失了（實測：field 的 `<div>` 上找不到 `aria-invalid`）。
     *
     * 也就是三條**寫了但永遠無效**的 class —— 與 A 批在 `UiSwitch` 抓到的
     * 死 `peer` 是同一個形狀，兩個批次各一次。
     *
     * `UiInput`／`UiTextarea` 不需要這個 prop，因為它們是單根元件、
     * `aria-invalid` 走 fallthrough 就到位了。這一支的結構不允許，所以要明說。
     */
    invalid?: boolean;
  }>(),
  {
    // ⚠️ 預設值寫在 `withDefaults` 而不是模板的 `?? "zh-TW"`：C76 的 review
    // 才剛把 `UiBadge` 從那個寫法改過來。`locale` 沒有 union 所以契約測試
    // 今天不會檢查它 —— 但下一個人抄的是離他最近的那一個。
    locale: "zh-TW",
    invalid: false,
  },
);

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

const theme = inject(UI_THEME, NO_OVERRIDE);
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
</script>

<template>
  <DatePickerRoot v-model="value" :locale="locale">
    <DatePickerField
      v-slot="{ segments }"
      data-slot="date-picker"
      :aria-invalid="invalid || undefined"
      :class="parts.field"
    >
      <DatePickerInput
        v-for="item in segments"
        :key="item.part"
        :part="item.part"
        :class="parts.segment"
      >
        {{ item.value }}
      </DatePickerInput>
      <DatePickerTrigger :class="parts.trigger">
        <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
          <path
            d="M4 1.5v2M12 1.5v2M2 6h12M3 3h10a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </DatePickerTrigger>
    </DatePickerField>

    <DatePickerContent :class="parts.content" :side-offset="4">
      <DatePickerCalendar v-slot="{ weekDays, grid }">
        <DatePickerHeader class="mb-2 flex items-center justify-between">
          <DatePickerPrev :class="parts.nav">
            <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
              <path
                d="M10 3L5 8l5 5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </DatePickerPrev>
          <DatePickerHeading :class="parts.heading" />
          <DatePickerNext :class="parts.nav">
            <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
              <path
                d="M6 3l5 5-5 5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </DatePickerNext>
        </DatePickerHeader>

        <DatePickerGrid v-for="month in grid" :key="month.value.toString()" class="w-full">
          <DatePickerGridHead>
            <DatePickerGridRow>
              <DatePickerHeadCell v-for="day in weekDays" :key="day" :class="parts.headCell">
                {{ day }}
              </DatePickerHeadCell>
            </DatePickerGridRow>
          </DatePickerGridHead>
          <DatePickerGridBody>
            <DatePickerGridRow v-for="(week, index) in month.rows" :key="`week-${index}`">
              <DatePickerCell v-for="cell in week" :key="cell.toString()" :date="cell">
                <DatePickerCellTrigger :day="cell" :month="month.value" :class="parts.day" />
              </DatePickerCell>
            </DatePickerGridRow>
          </DatePickerGridBody>
        </DatePickerGrid>
      </DatePickerCalendar>
    </DatePickerContent>
  </DatePickerRoot>
</template>
