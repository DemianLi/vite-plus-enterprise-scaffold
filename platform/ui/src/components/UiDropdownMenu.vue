<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";
import { inject } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiDropdownMenuSlot } from "../theme.ts";

/**
 * 表格每一列右邊那顆「⋯」—— 一組動作的選單。
 *
 * ── 它與 `UiSelect` 的差別是**語意**，不是外觀 ────────────────────
 *
 * 兩個都是「按一下、掉出一張清單、選一項」。差別在選完之後：
 * `UiSelect` 記住你的選擇（它是一個表單控制項，`role="combobox"`），
 * 這一個**執行一個動作**（`role="menu"`，沒有值、沒有選取狀態）。
 *
 * 所以它不是 `UiSelect` 換個樣式：輔具唸出來的東西不同，鍵盤契約也不同。
 * 同 C78 §3 的 `UiSwitch` vs `UiCheckbox`、C86 的 `alertdialog` vs `dialog`。
 *
 * ── ⚠️ `label` 為什麼必填，而且為什麼它同時是**選單**的名字 ────────
 *
 * `DropdownMenuContent` 自己把名字接到觸發器上（實測 `reka-ui@2.10.3`，
 * `src/DropdownMenu/DropdownMenuContent.vue`）：
 *
 *     :aria-labelledby="rootContext?.triggerId"
 *
 * → **觸發器沒有可及名稱的話，`role="menu"` 也一起沒有。** 而「⋯」按鈕
 *   最自然的寫法 `<button>⋯</button>` 正好就是那個樣子：螢幕閱讀器唸到的
 *   是一個叫「⋯」（或什麼都不叫）的按鈕，打開之後是一個無名的選單。
 *   畫面上完全正常。
 *
 * 所以名稱不是選填的裝飾，是這個元件能不能用的前提 —— 同 `UiSelect` 的
 * `placeholder` 與 `UiAlertDialog` 的 `confirmLabel` 必填。
 *
 * ── ⚠️ `sr-only` 那個 `<span>` 沒有具名槽，也不該有 ────────────────
 *
 * 名字是用 `<span class="sr-only">` 放進按鈕內容，**不是 `aria-label`**。
 * 兩個理由：
 *
 *   一、`aria-label` 會**蓋掉**內容。日後如果有人把觸發器改成有字的
 *       （「匯出 ▾」），`aria-label` 與看得見的字不一致就違反 WCAG 2.5.3
 *       （Label in Name）—— 語音控制的使用者說「點匯出」會點不到。
 *   二、內容式的名字**進得了 `aria-labelledby`**，而那正是選單名字的來源。
 *
 * 而它刻意**不開槽**：開了就等於讓一句 `{ UiDropdownMenu: { label: "" } }`
 * 同時把按鈕和選單變成無名，且畫面完全不變。見 `theme.ts` 那一段。
 *
 * ⚠️ 第三個理由是**壞掉的方式**，而它比前兩個重要：
 *
 *   `aria-label` 壞掉（寫錯、寫空、忘了翻譯）→ **畫面完全正常**，
 *   只有輔具使用者遇得到；
 *   `sr-only` 壞掉（class 沒編進 CSS）→ 那行字直接**顯示在按鈕上**，
 *   表格列的版型當場歪掉，第一個看到的人就會修。
 *
 * 也就是說這個選擇把「安靜的無障礙缺陷」換成了「吵鬧的版型缺陷」。
 * 這正是本 repo 對付「寫了但永遠無效」那六次用的同一招。
 *
 * ⚠️ 反過來說也要講清楚：**可及名稱本身不依賴 CSS**（它是文字內容），
 * 所以 `sr-only` 沒編出來的時候名字還在。`tests/a11y.test.ts` 產物那一條
 * 守的是**版面**，不是名字 —— 不要把它讀成無障礙的保險。
 *
 * ── 為什麼是 `items` 陣列而不是 Root ＋ Item 兩個檔 ────────────────
 *
 * 判準同 `UiSelect`／`UiRadioGroup` 那條軸（項目內容是不是任意的），
 * 而這裡多了一個上游給的理由：**首字母跳轉讀的是 `textContent`**
 * （`src/shared/useTypeahead.ts`：`item.value?.textValue ?? item.ref.textContent`）。
 * 開放任意內容 ＝ 開放「在項目前面放一個徽章或 sr-only 前綴，然後首字母
 * 跳轉安靜地對不上」。而首字母跳轉正是 C81 判它進範圍的四件事之一。
 *
 * ── ⚠️ 選一項就會關，而且沒有「執行中」狀態 ────────────────────────
 *
 * 上游的 `MenuItem` 發一個 cancelable 的 select 事件，**沒有人擋它就關**
 * （`if (itemSelectEvent.defaultPrevented) … else rootContext.onClose()`）。
 * 這裡不擋。所以「按刪除 → 送請求 → 選單裡顯示 spinner」做不到 ——
 * 需要那個的案子要的是 `UiAlertDialog` 或 `UiDialog`，不是選單。
 * 與 C86 記的「兩顆按鈕都會關掉」同一個形狀。
 *
 * ── ⚠️ 它是 modal 的（上游預設），而那有兩個看不見的後果 ────────────
 *
 * `DropdownMenuRoot` 的 `modal` 預設 `true`，於是 `MenuRootContentModal`：
 *
 *   `useHideOthers()`      → 選單以外的整頁被加上 `aria-hidden`
 *   `useBodyScrollLock()`  → 選單開著的時候頁面捲不動
 *
 * 對「⋯」這種列動作來說第二點會讓人意外（開著選單就捲不了表格），但這是
 * 上游與 Radix 的預設，改它等於讓本 repo 的鍵盤／輔具行為與所有 shadcn
 * 文件不一致。**照做並寫下來**，不偷偷改。
 *
 * ⚠️ 第一點還有一個看起來像 bug 的後果：**觸發器自己也被 `aria-hidden`
 * 蓋住了**（它在選單外面）。名稱仍然讀得到 —— `aria-labelledby` 的名稱計算
 * 本來就會進 `aria-hidden` 的子樹取字。所以不要寫一條「選單開著時觸發器
 * 不該被 aria-hidden」的測試，那條會紅，而且它紅得沒有道理。
 *
 * ── 用法 ──────────────────────────────────────────────────────────
 *
 *     <UiDropdownMenu
 *       label="訂單 #1024 的操作"
 *       :items="[
 *         { value: 'edit', label: '編輯' },
 *         { value: 'duplicate', label: '複製' },
 *         { value: 'remove', label: '刪除', variant: 'danger' },
 *       ]"
 *       @select="run"
 *     />
 *
 * ⚠️ `label` 要對得上**這一列**（「訂單 #1024 的操作」），不是「操作」——
 * 表格裡二十列全叫「操作」的話，輔具的元素清單上就是二十個一樣的名字。
 *
 * ── 能驗到哪裡 ────────────────────────────────────────────────────
 *
 * 見 `../../tests/dropdown-menu.test.ts` 的檔頭。它包在 reka-ui 的
 * `Teleport` 裡，所以 SSR 一個字都驗不到（C86 量的，`renderToString`
 * 的產出是 `<!--v-if-->`），測試走 happy-dom。
 */

/**
 * 選單開合。⚠️ 綁它是選填的 —— 觸發器自己會開關。
 *
 * ⚠️ **打開之後焦點落在哪，不由「誰打開的」決定。** 上游只在「使用者正在用
 * 鍵盤」時才把焦點送到第一個項目（`MenuContentImpl` 的 `entryFocus` 判
 * `isUsingKeyboardRef`），否則焦點停在選單容器上 —— 而那個旗標是
 * `createSharedComposable` 包出來的**整頁一個**、由頁面上**最後一次**
 * keydown／pointerdown 決定的。
 *
 * → 同樣一句 `open = true`，在使用者剛按過鍵的頁面上會聚焦第一項，
 *   在剛用滑鼠點過的頁面上不會。實測過（見測試檔頭的 E12）。
 *
 * 兩種落點的方向鍵都會動（焦點在容器上時，`↓` 一樣走到第一項），
 * 差別只在「打開的那一瞬間輔具會不會唸出第一項」。
 */
const open = defineModel<boolean>("open", { default: false });

withDefaults(
  defineProps<{
    /**
     * 觸發器的可及名稱。**必填**，理由見檔頭 —— 它同時是選單的名稱，
     * 少了它兩個都變成無名，而畫面完全正常。
     */
    label: string;
    /**
     * 動作清單，順序就是顯示順序。
     *
     * ⚠️ 型別刻意**內嵌**而不是抽成 `UiDropdownMenuItem` 匯出：契約 ④
     * 禁止 props 的 union 用型別別名（別名讓「這個 prop 收哪些值」變成
     * 要跳一層才看得到）。同 `UiSelect` 的 `items`。
     *
     * ⚠️ 模板把 `label` 同時餵給 `:text-value`，而**那一行今天沒有任何
     * 行為**（首字母跳轉的後備就是 `textContent`，而這裡的 `textContent`
     * 就是 `label`；變異驗過，拿掉它零條紅）。留著是因為它釘住的是
     * 「日後在項目裡加東西（快捷鍵提示、圖示）時，跳轉讀的仍然是這個字」。
     * 記成「現在是註解、將來是行為」，不假裝它有閘門在守。
     */
    items: readonly {
      value: string;
      label: string;
      disabled?: boolean;
      /** `danger` 會疊上紅色那一格。破壞性動作用它。 */
      variant?: "default" | "danger";
    }[];
    /**
     * 面板對齊觸發器的哪一邊。預設 `end` —— 「⋯」在表格列的右緣，
     * 從左緣展開會掉出容器。
     */
    align?: "start" | "end";
  }>(),
  {
    // 預設值寫在 `withDefaults` 而不是模板，理由見 C86：契約
    // 「預設值必須是 union 成員」讀的是這裡。
    align: "end",
  },
);

/**
 * 使用者選了一項，帶回那一項的 `value`。
 *
 * ⚠️ **收到的時候選單還開著，它在下一個 tick 才關。** 上游是
 * `emits('select', …)` → `await nextTick()` → `rootContext.onClose()`。
 *
 * → 所以在這個處理器裡同步寫 `open = true`（或重開別的東西再回來）
 *   **會被一個 tick 之後的 `onClose()` 安靜地蓋掉**。要它留著就得等過那個
 *   tick，或者根本不要從這裡改 `open`。
 *
 * ⚠️ 這一段的第一版寫的是「收到的時候選單已經關了」—— 讀原始碼推出來的，
 * 而實測相反（在處理器裡查 DOM，面板還在）。**同一個錯在 `UiAlertDialog`
 * 的 `confirm` 上也犯過一次，一起改了**（見 C88 §五之二）。
 */
const emit = defineEmits<{
  select: [value: string];
}>();

const DEFAULT_PARTS: Readonly<Record<UiDropdownMenuSlot, string>> = {
  trigger: cn(
    "inline-flex size-8 items-center justify-center rounded-control",
    "text-fg-muted transition-[color,box-shadow] outline-none",
    "hover:bg-surface-hover hover:text-fg",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-[state=open]:bg-surface-hover data-[state=open]:text-fg",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ),
  icon: "size-4",
  content: cn(
    "z-50 min-w-40 overflow-hidden p-1",
    "rounded-control border-control border-line bg-surface shadow-overlay",
  ),
  /**
   * 高亮用 `data-[highlighted]` 而不是 `focus:`。
   *
   * ⚠️ **理由不是「focus: 接不到滑鼠那條」——那句話是錯的，實測過。**
   * 上游在指標移過項目時同時做兩件事：設 `highlightedElement` **並且**
   * `item.focus()`。所以在這個元件現在的形狀下，兩種寫法**等價**
   * （量測：`pointermove` 之後 `data-highlighted` 與 `document.activeElement`
   * 落在同一個元素上）。
   *
   * 真正的理由是另外兩條：
   *   一、與上游／shadcn 的 part 名對齊，同 `theme.ts` 檔頭講槽名的那一段；
   *   二、上游把兩者分開的路徑是存在的（`MenuContentImpl` 的
   *       `onKeydownNavigation` 用 `focus: false`，給有篩選框的選單用）。
   *       這個元件沒有篩選框，所以那條路現在走不到 —— 但選對的那個字，
   *       日後長出來的時候不必回頭改。
   *
   * ⚠️ 而**這兩種寫法沒有任何測試分得出來**（變異驗過，改成 `focus:` 零條紅）。
   * 記在這裡，不假裝它有閘門。
   */
  item: cn(
    "relative flex w-full cursor-default items-center gap-2",
    "rounded-control px-3 py-1.5 text-sm text-fg outline-none select-none",
    "data-[highlighted]:bg-surface-hover",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ),
  danger: "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiDropdownMenuSlot, string>> = {
  trigger: theme.UiDropdownMenu?.trigger ?? DEFAULT_PARTS.trigger,
  icon: theme.UiDropdownMenu?.icon ?? DEFAULT_PARTS.icon,
  content: theme.UiDropdownMenu?.content ?? DEFAULT_PARTS.content,
  item: theme.UiDropdownMenu?.item ?? DEFAULT_PARTS.item,
  danger: theme.UiDropdownMenu?.danger ?? DEFAULT_PARTS.danger,
};
</script>

<template>
  <DropdownMenuRoot v-model:open="open">
    <DropdownMenuTrigger data-slot="dropdown-menu-trigger" :class="parts.trigger">
      <svg viewBox="0 0 16 16" :class="parts.icon" aria-hidden="true">
        <circle cx="3" cy="8" r="1.4" fill="currentColor" />
        <circle cx="8" cy="8" r="1.4" fill="currentColor" />
        <circle cx="13" cy="8" r="1.4" fill="currentColor" />
      </svg>
      <span class="sr-only">{{ label }}</span>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        data-slot="dropdown-menu"
        :class="parts.content"
        :align="align"
        :side-offset="4"
      >
        <DropdownMenuItem
          v-for="item in items"
          :key="item.value"
          :disabled="item.disabled"
          :text-value="item.label"
          :class="[parts.item, item.variant === 'danger' ? parts.danger : '']"
          @select="emit('select', item.value)"
        >
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
