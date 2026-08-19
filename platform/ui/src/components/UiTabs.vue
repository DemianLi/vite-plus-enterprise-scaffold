<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from "reka-ui";
import { inject, type VNode } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiTabsSlot } from "../theme.ts";

/**
 * 分頁。與 `UiTabsPanel` 是**一組兩個檔案**的元件。
 *
 * ── 為什麼要有一個多檔案的元件 ────────────────────────────────────
 *
 * 前三個元件（Button／Dialog／Input）都是單檔案，於是「一個元件 ＝ 一個
 * `.vue` ＝ `UiThemeOverride` 裡一格」這個對應從來沒有被考驗過。
 * 這一組是第一個 Root ＋ Item：**兩個檔案、兩格具名槽、兩個 export**，
 * 而契約測試是掃目錄的，所以它自己就會分別檢查這兩個。
 *
 * ⚠️ 兩個檔案**不共用**一格覆寫。共用的話，各案想只換 panel 的內距就得
 * 連 trigger 的樣式一起抄過來（覆寫的語意是**整條替換**，見 theme.ts）。
 *
 * ── 為什麼 trigger 用 `items` 陣列而不是 slot ────────────────────
 *
 * shadcn 的做法是 `<UiTabsList><UiTabsTrigger value="a">…` —— 使用端自己
 * 排列。那需要**第三個與第四個**檔案，而它們兩個都只是一層薄包裝。
 *
 * 這裡把 list 與 trigger 收進 Root，使用端只寫 `:items` 與一組 panel。
 * 代價是**trigger 裡放不了任意內容**（只有文字）。真的需要圖示時再開
 * `UiTabsTrigger` 是一筆 minor（新增 export）；反過來把兩個檔案收掉是 major。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守（見 UiBadge 的說明、#57）──
 *
 *   bg-muted / text-muted-foreground        → bg-surface-hover / text-fg-muted
 *   data-[state=active]:bg-background       → data-[state=active]:bg-surface
 *   data-[state=active]:text-foreground      → data-[state=active]:text-fg
 *   focus-visible:ring-ring/50               → focus-visible:ring-focus/50
 *   rounded-lg / rounded-md                  → rounded-surface / rounded-control
 */

/**
 * 目前選中的分頁。不具名 —— `v-model="active"` 直接可用。
 *
 * ⚠️ 型別是 `string` 而不是一個 union：分頁的值是**各案自己定的**
 * （`"orders"`／`"shipments"`），寫成 union 就得讓 `platform/` 知道每個
 * 案子有哪些分頁。這與 `UiButton` 的 variant 剛好相反 —— 那個的值域是
 * 設計系統定的，所以它必須是 union（少一個成員要紅）。
 */
const active = defineModel<string>({ default: "" });

defineProps<{
  /**
   * 分頁清單，順序就是顯示順序。`value` 要與 `UiTabsPanel` 的 `value` 對上。
   *
   * ⚠️ 對不上不會有錯誤，只會是**一個永遠不顯示的 panel** —— reka-ui 照著
   * `value` 配對，配不到就什麼都不渲染。沒有閘門守得住這個（值是執行期的），
   * 所以寫在這裡。
   */
  items: readonly { value: string; label: string }[];
}>();

/** 放 `UiTabsPanel`。 */
defineSlots<{
  default(): VNode[];
}>();

const DEFAULT_PARTS: Readonly<Record<UiTabsSlot, string>> = {
  list: "inline-flex items-center gap-1 rounded-surface bg-surface-hover p-1",
  trigger: cn(
    "inline-flex items-center rounded-control px-3 py-1 text-sm font-control",
    "text-fg-muted transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[state=active]:bg-surface data-[state=active]:text-fg",
  ),
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiTabsSlot, string>> = {
  list: theme.UiTabs?.list ?? DEFAULT_PARTS.list,
  trigger: theme.UiTabs?.trigger ?? DEFAULT_PARTS.trigger,
};
</script>

<template>
  <TabsRoot v-model="active" data-slot="tabs">
    <TabsList :class="parts.list">
      <TabsTrigger
        v-for="item in items"
        :key="item.value"
        :value="item.value"
        :class="parts.trigger"
      >
        {{ item.label }}
      </TabsTrigger>
    </TabsList>
    <slot />
  </TabsRoot>
</template>
