<script setup lang="ts">
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui";
import { inject } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiSelectSlot } from "../theme.ts";

/**
 * 下拉選單。
 *
 * ── 為什麼不是 `<select>` ─────────────────────────────────────────
 *
 * 原生 `<select>` 的**選項清單是作業系統畫的**，CSS 碰不到。也就是各案
 * 換不掉它 —— 而「快速換配色與元件樣式」那條承諾對這一格會不成立。
 * 這與 `UiCheckbox` 不用原生的是同一條理由，只是更嚴重：勾勾是一個圖示，
 * 選項清單是整個面板。
 *
 * 代價是鍵盤導航、`aria-activedescendant`、輸入首字跳選、以及點外面關閉
 * 全部變成自己的責任 —— reka-ui 把這些做完了。
 *
 * ⚠️ 這是本 repo 第二個用 Portal 的元件（第一個是 `UiDialog`）。
 * Portal 會把面板掛到 `<body>` 底下，所以**外層的 `overflow: hidden`
 * 不會裁到它** —— 那正是自己寫下拉最常撞的那面牆。
 *
 * ── 為什麼用 `items` 陣列而不是 Root ＋ Item ──────────────────────
 *
 * 判準與 `UiRadioGroup` 那一條相同（那裡選了兩個檔案）：**項目的內容是不是
 * 任意的**。下拉的選項是一行字 —— 放連結或輸入框在一個 listbox 裡不但少見，
 * 而且會壞掉鍵盤導航。所以這裡收成陣列，與 `UiTabs` 同一邊。
 *
 * 真的需要圖示選項時再開 `UiSelectItem` 是一筆 minor（新增 export）。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守（見 UiBadge、#57）────────
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
 * 選項變成深色底配深色字。這是 #57 那條判準說的「名字剛好一樣但意思不同」
 * 的實例 —— 而那道檢查**認不出它**（`accent` 在我們的 `@theme` 裡有宣告，
 * 所以減法之後它不在清單裡）。只有人讀得出來。
 */

const selected = defineModel<string>({ default: "" });

defineProps<{
  /** 選項清單，順序就是顯示順序。 */
  items: readonly { value: string; label: string }[];
  /** 沒有選取時顯示的字。 */
  placeholder?: string;
  /** 對應 `UiLabel` 的 `for`。 */
  id: string;
}>();

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
    "z-50 min-w-(--reka-select-trigger-width) overflow-hidden",
    "rounded-control border-control border-line bg-surface shadow-overlay",
  ),
  item: cn(
    "relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-3",
    "text-sm text-fg outline-none select-none",
    "focus:bg-surface-hover",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ),
  indicator: "absolute right-3 flex items-center text-accent",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiSelectSlot, string>> = {
  trigger: theme.UiSelect?.trigger ?? DEFAULT_PARTS.trigger,
  content: theme.UiSelect?.content ?? DEFAULT_PARTS.content,
  item: theme.UiSelect?.item ?? DEFAULT_PARTS.item,
  indicator: theme.UiSelect?.indicator ?? DEFAULT_PARTS.indicator,
};
</script>

<template>
  <SelectRoot v-model="selected">
    <SelectTrigger :id="id" data-slot="select" :class="parts.trigger">
      <SelectValue :placeholder="placeholder ?? ''" />
      <!-- 箭頭是內嵌 SVG 而不是圖示套件：少一個相依就是少一筆 SCA 範圍。
           aria-hidden 因為 SelectTrigger 自己就有 role 與名字。 -->
      <svg viewBox="0 0 16 16" class="size-4 text-fg-muted" aria-hidden="true">
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent :class="parts.content" position="popper" :side-offset="4">
        <SelectViewport class="p-1">
          <SelectItem
            v-for="item in items"
            :key="item.value"
            :value="item.value"
            :class="parts.item"
          >
            <SelectItemText>{{ item.label }}</SelectItemText>
            <SelectItemIndicator :class="parts.indicator">
              <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
                <path
                  d="M3.5 8.5l3 3 6-7"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
