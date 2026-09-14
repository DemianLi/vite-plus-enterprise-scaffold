import { Tabs } from "@base-ui/react/tabs";
import { useState, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiTabsSlot } from "../theme.ts";

/**
 * 分頁。與 `UiTabsPanel` 是**一組兩個檔案**的元件。
 *
 * ── 為什麼要有一個多檔案的元件 ────────────────────────────────────
 *
 * 這一組是第一個 Root ＋ Item：**兩個檔案、兩格具名槽、兩個 export**。
 *
 * ⚠️ 兩個檔案**不共用**一格覆寫。共用的話，各案想只換 panel 的內距就得
 * 連 trigger 的樣式一起抄過來（覆寫的語意是**整條替換**，見 theme.ts）。
 *
 * ── 為什麼 trigger 用 `items` 陣列而不是子元件 ────────────────────
 *
 * shadcn 的做法是 `<TabsList><TabsTrigger value="a">…` —— 使用端自己
 * 排列。那需要**第三個與第四個**檔案，而它們兩個都只是一層薄包裝。
 *
 * 這裡把 list 與 trigger 收進 Root，使用端只寫 `items` 與一組 panel。
 * 代價是**trigger 裡放不了任意內容**（只有文字）。真的需要圖示時再開
 * `UiTabsTrigger` 是一筆 minor（新增 export）；反過來把兩個檔案收掉是 major。
 *
 * ── `value` 是 `string` 而不是一個 union ─────────────────────────
 *
 * 分頁的值是**各案自己定的**（`"orders"`／`"shipments"`），寫成 union 就得讓
 * `platform/` 知道每個案子有哪些分頁。這與 `UiButton` 的 variant 剛好相反 ——
 * 那個的值域是設計系統定的，所以它必須是 union（少一個成員要紅）。
 *
 * ⚠️ `items[].value` 要與 `UiTabsPanel` 的 `value` 對上。對不上不會有錯誤，只會是
 * **一個永遠不顯示的 panel** —— 元件守不住這個（值是執行期的）。
 *
 * ── ⚠️ 代幣對照是人工核對的（見 UiBadge 的說明）──────────────────────
 *
 *   bg-muted / text-muted-foreground        → bg-surface-hover / text-fg-muted
 *   data-[state=active]:bg-background       → data-active:bg-surface
 *   data-[state=active]:text-foreground      → data-active:text-fg
 *   focus-visible:ring-ring/50               → focus-visible:ring-focus/50
 *   rounded-lg / rounded-md                  → rounded-surface / rounded-control
 *
 * 作用中分頁的 variant 是 Base UI 的 `data-active`，不是 reka 的 `data-state="active"`。
 */
export function UiTabs({
  items,
  value,
  onValueChange,
  children,
}: {
  items: readonly { value: string; label: string }[];
  value?: string;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}): ReactNode {
  // 沒給值（或給空字串）時選第一個分頁。⚠️ 這是 review 補的：少了它，空字串對不到任何
  // `items[].value`，實測兩個 trigger 都是 `aria-selected="false"`、panel 是 `hidden` ——
  // 使用端看到一排按鈕配一片空白，而不會報任何錯。沒受控時自己記著選到哪。
  const [own, setOwn] = useState("");
  const chosen = value ?? own;
  const current = chosen === "" ? (items[0]?.value ?? "") : chosen;
  const select = (next: string): void => {
    setOwn(next);
    onValueChange?.(next);
  };

  const theme = useUiTheme();
  const parts: Readonly<Record<UiTabsSlot, string>> = {
    list: theme.UiTabs?.list ?? DEFAULT_PARTS.list,
    trigger: theme.UiTabs?.trigger ?? DEFAULT_PARTS.trigger,
  };

  return (
    <Tabs.Root data-slot="tabs" value={current} onValueChange={(next) => select(String(next))}>
      <Tabs.List className={parts.list}>
        {items.map((item) => (
          <Tabs.Tab key={item.value} value={item.value} className={parts.trigger}>
            {item.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiTabsSlot, string>> = {
  list: "inline-flex items-center gap-1 rounded-surface bg-surface-hover p-1",
  trigger: cn(
    "inline-flex items-center rounded-control px-3 py-1 text-sm font-control",
    "text-fg-muted transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-active:bg-surface data-active:text-fg",
  ),
};
