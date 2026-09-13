import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiDropdownMenuSlot } from "../theme.ts";

/**
 * 表格每一列右邊那顆「⋯」—— 一組動作的選單。
 *
 * ── 它與 `UiSelect` 的差別是**語意**，不是外觀 ────────────────────
 *
 * 兩個都是「按一下、掉出一張清單、選一項」。差別在選完之後：
 * `UiSelect` 記住你的選擇（它是一個表單控制項，`role="combobox"`），
 * 這一個**執行一個動作**（`role="menu"`，沒有值、沒有選取狀態）。
 * 所以它不是 `UiSelect` 換個樣式：輔具唸出來的東西不同，鍵盤契約也不同。
 * 同 `UiSwitch` vs `UiCheckbox`、`alertdialog` vs `dialog`。
 *
 * ── ⚠️ `label` 為什麼必填，而且為什麼它同時是**選單**的名字 ────────
 *
 * `Menu.Popup` 的 `aria-labelledby` 由 `MenuRoot` 接到觸發器的 id（量過，與 reka 相同）。
 * → **觸發器沒有可及名稱的話，`role="menu"` 也一起沒有。** 而「⋯」按鈕最自然的寫法
 *   `<button>⋯</button>` 正好就是那個樣子：螢幕閱讀器唸到的是一個叫「⋯」（或什麼都不叫）的
 *   按鈕，打開之後是一個無名的選單。畫面上完全正常。
 *
 * 所以名稱不是選填的裝飾，是這個元件能不能用的前提 —— 同 `UiSelect` 的
 * `placeholder` 與 `UiAlertDialog` 的 `confirmLabel` 必填。
 *
 * ⚠️ `label` 要對得上**這一列**（「訂單編號 1024 的操作」），不是「操作」——
 * 表格裡二十列全叫「操作」的話，輔具的元素清單上就是二十個一樣的名字。
 *
 * ── ⚠️ `sr-only` 那個 `<span>` 沒有具名槽，也不該有 ────────────────
 *
 * 名字是用 `<span className="sr-only">` 放進按鈕內容，**不是 `aria-label`**。
 * 三個理由，而**只有第一個今天就在運作**：
 *
 *   一、⭐ **它是「選單真的拿到名字了」唯一驗得到的路。**
 *       名字在內容裡，就是 DOM 裡的一段文字，可以一路追：面板的
 *       `aria-labelledby` → 指到觸發器 → 讀出那段文字 → 比對。改走
 *       `aria-label`，名字變成觸發器上的一個屬性字串，最多只能驗
 *       「那個屬性在」—— 證明不到 `role="menu"` 那一端。
 *
 *   二、**壞掉的方式**（⚠️ 只涵蓋一種壞法）：`sr-only` 沒編進 CSS 時，
 *       那行字直接**顯示在按鈕上**，表格列的版型當場歪掉，第一個看到的人
 *       就會修；`aria-label` 沒有對應的壞法。
 *       ⚠️ **但 `label` 這個字串本身寫錯、寫空、忘了翻譯，兩種寫法一樣安靜。**
 *       這條理由換到的只有「CSS 那一種壞法多一層肉眼可見的備援」。
 *
 *   三、WCAG 2.5.3（Label in Name）：日後有人把觸發器改成有字的
 *       （「匯出 ▾」），`aria-label` 會**蓋掉**內容，唸出來的與看得見的不一致，
 *       語音控制的使用者說「點匯出」會點不到。
 *       ⚠️ **今天觸發器沒有任何可見文字，所以這條理由今天沒有對象。**
 *       觸發器加上可見文字的那一天，它才開始有用。
 *
 * ⚠️ **曾經有第四個理由，而它是錯的。** 舊版寫著「內容式的名字才進得了
 * `aria-labelledby`」—— 假的：由 `aria-labelledby` 觸發的名稱遞迴會忽略被指
 * 元素自己的 `aria-labelledby`，但 `aria-label` 照用，所以換成 `aria-label`
 * 之後選單的名字**一樣解得出來**。（⚠️ **規格來源，本 repo 量不到** ——
 * page JS 沒有算可及名稱的 API。）
 *
 * 而它刻意**不開槽**：開了就等於讓一句 `{ UiDropdownMenu: { label: "" } }`
 * 同時把按鈕和選單變成無名，且畫面完全不變。見 `theme.ts` 那一段。
 *
 * ⚠️ 反過來說也要講清楚：**可及名稱本身不依賴 CSS**（它是文字內容），
 * 所以 `sr-only` 沒編出來的時候名字還在。上面第二條講的是**版面**，
 * 不是名字 —— 不要把它讀成無障礙的保險。
 *
 * ⚠️ 這個形狀（span 直接包住 `{label}`、class 只有一個 token）不要隨手改：
 * 改成 `sr-only shrink-0`、或在外面再包一層 `<span>` 之前，上面兩條理由都要重驗。
 *
 * ── 為什麼是 `items` 陣列而不是 Root ＋ Item 兩個檔 ────────────────
 *
 * 判準同 `UiSelect`／`UiRadioGroup` 那條軸（項目內容是不是任意的），
 * 而這裡多了一個理由：**首字母跳轉讀的是項目的文字**。開放任意內容 ＝ 開放「在項目前面放
 * 一個徽章或 sr-only 前綴，然後首字母跳轉安靜地對不上」。而首字母跳轉正是這個元件存在的
 * 四個理由之一。`Menu.Item` 的 `label` 釘住跳轉讀的字：今天項目的文字就是 `label`，所以它沒有
 * 行為（reka 版拿掉它行為不變；Base UI 版沒量）。留著是因為日後在項目裡加快捷鍵提示、
 * 圖示時，跳轉讀的仍然是這個字。記成「現在是註解、將來是行為」。
 *
 * `items` 的型別刻意**內嵌**而不是抽成 `UiDropdownMenuItem` 匯出：props 的 union 不用型別別名
 * （理由見 `UiButton`）。同 `UiSelect` 的 `items`。`align` 預設 `end` ——「⋯」在表格列的右緣，
 * 從左緣展開會掉出容器。
 *
 * ── ⚠️ 選一項就會關，而且沒有「執行中」狀態 ────────────────────────
 *
 * 所以「按刪除 → 送請求 → 選單裡顯示 spinner」做不到 —— 需要那個的案子要的是
 * `UiAlertDialog` 或 `UiDialog`，不是選單。與 `UiAlertDialog` 的「兩顆按鈕都會關掉」同一個形狀。
 * `onSelect` 被呼叫的那一刻選單還開著，關閉在那之後 —— 在處理器裡同步改 `open` 會被蓋掉。
 *
 * ── 對 Base UI 量過的 ─────────────────────────────────────────────
 *
 * - **到底不繞回**：Base UI 的 `loopFocus` 預設 `true`，這裡設 `false`（reka 的行為）。
 * - **disabled 的項目方向鍵停得到**：reka 跳過它，Base UI 讓它可聚焦（`aria-disabled`，
 *   點了沒反應）。沒有選項可改，照上游。
 * - **打開時焦點落點**：用鍵盤或點擊打開 → 第一項；程式設 `open` → 選單容器，不論頁面上
 *   最後一個輸入是什麼（reka 由整頁最後一次輸入事件決定，Base UI 沒有那個單例）。
 * - **modal**：上游預設 modal，照做並寫下來 —— 選單開著時頁面捲不動（對「⋯」這種列動作會讓人
 *   意外，但改它等於讓鍵盤／輔具行為與所有 shadcn 文件不一致）。選單以外**不加** `aria-hidden`：
 *   Base UI 用一層透明的內部遮罩擋指標，外面只掛一個標記屬性（`data-base-ui-inert`）。
 * - **`danger` 疊在 `item` 上走 `cn()`**：兩格都有 `data-[highlighted]:` 的底色時，
 *   twMerge 讓 `danger` 贏。
 */
export function UiDropdownMenu({
  open,
  onOpenChange,
  label,
  items,
  align = "end",
  onSelect,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label: string;
  items: readonly {
    value: string;
    label: string;
    disabled?: boolean;
    variant?: "default" | "danger";
  }[];
  align?: "start" | "end";
  onSelect?: (value: string) => void;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiDropdownMenuSlot, string>> = {
    trigger: theme.UiDropdownMenu?.trigger ?? DEFAULT_PARTS.trigger,
    icon: theme.UiDropdownMenu?.icon ?? DEFAULT_PARTS.icon,
    content: theme.UiDropdownMenu?.content ?? DEFAULT_PARTS.content,
    item: theme.UiDropdownMenu?.item ?? DEFAULT_PARTS.item,
    danger: theme.UiDropdownMenu?.danger ?? DEFAULT_PARTS.danger,
  };

  return (
    <Menu.Root open={open} onOpenChange={onOpenChange} loopFocus={false}>
      <Menu.Trigger data-slot="dropdown-menu-trigger" className={parts.trigger}>
        <svg viewBox="0 0 16 16" className={parts.icon} aria-hidden="true">
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </svg>
        <span className="sr-only">{label}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align={align} sideOffset={4} className="z-50">
          <Menu.Popup data-slot="dropdown-menu" className={parts.content}>
            {items.map((item) => (
              <Menu.Item
                key={item.value}
                disabled={item.disabled}
                label={item.label}
                className={cn(parts.item, item.variant === "danger" ? parts.danger : "")}
                onClick={() => onSelect?.(item.value)}
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiDropdownMenuSlot, string>> = {
  trigger: cn(
    "inline-flex size-8 items-center justify-center rounded-control",
    "text-fg-muted transition-[color,box-shadow] outline-none",
    "hover:bg-surface-hover hover:text-fg",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-popup-open:bg-surface-hover data-popup-open:text-fg",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ),
  icon: "size-4",
  content: cn(
    "z-50 min-w-40 overflow-hidden p-1",
    "rounded-control border-control border-line bg-surface shadow-overlay",
  ),
  // 高亮用 `data-[highlighted]` 而不是 `focus:`：與上游／shadcn 的 part 名對齊，而上游把兩者
  // 分開的路徑是存在的（有篩選框的選單，指標移動只高亮不聚焦）。這個元件沒有篩選框，所以兩種
  // 寫法今天等價 —— ⚠️ 而**沒有任何輸入分得出來**（reka 版驗過，改成 `focus:` 行為不變）。
  item: cn(
    "relative flex w-full cursor-default items-center gap-2",
    "rounded-control px-3 py-1.5 text-sm text-fg outline-none select-none",
    "data-[highlighted]:bg-surface-hover",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ),
  danger: "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger",
};
