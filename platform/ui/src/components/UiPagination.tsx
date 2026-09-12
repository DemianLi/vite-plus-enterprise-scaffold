import { useState, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { ELLIPSIS, pageRange } from "../utils/page-range.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiPaginationSlot } from "../theme.ts";

/**
 * 分頁，React 版（C236）。頁碼是 1-based、為什麼一定要顯示首尾頁，見 `UiPagination.vue`。
 *
 * ⚠️ Base UI 沒有分頁基元，所以這裡的標記是**照 reka-ui 產出的 DOM 手寫的**：`<nav>` 包一層
 * `<div>`，頁碼是帶 `data-type="page"`／`aria-label="Page N"`／`aria-current` 的按鈕
 * （連 reka 的 `value` prop 穿透成 `<button value>` 那一格都照抄 —— 沒有行為，但少了它差分就不相等），
 * 上下頁是 `aria-label="Previous Page"`／`"Next Page"`、在頭尾時 `disabled`。逐字對齊的理由
 * 是遷移期間兩版要能拿同一把尺量 —— `tests/react-parity.test.ts` 逐組比對兩版的完整產出。
 * 頁碼怎麼算見 `../utils/page-range.ts`。
 *
 * ⚠️ 那幾個 `aria-label` 是英文，**照 reka-ui 的原樣**。它們是輔具唸出來的字，
 * 翻不翻是 i18n 的決定，不在這一批改：改了就與 Vue 版分岔，差分測試就量不到頁碼了。
 *
 * 不給 `page` 就是非受控、從第 1 頁起（同 Vue 版 `defineModel` 的預設）。
 */
export function UiPagination({
  page,
  onPageChange,
  total,
  perPage,
}: {
  page?: number;
  onPageChange?: (page: number) => void;
  total: number;
  perPage: number;
}): ReactNode {
  const [own, setOwn] = useState(1);
  const current = page ?? own;
  const pageCount = Math.max(1, Math.ceil(total / (perPage || 1)));
  const go = (next: number): void => {
    setOwn(next);
    onPageChange?.(next);
  };

  const theme = useUiTheme();
  const parts: Readonly<Record<UiPaginationSlot, string>> = {
    list: theme.UiPagination?.list ?? DEFAULT_PARTS.list,
    item: theme.UiPagination?.item ?? DEFAULT_PARTS.item,
    nav: theme.UiPagination?.nav ?? DEFAULT_PARTS.nav,
    ellipsis: theme.UiPagination?.ellipsis ?? DEFAULT_PARTS.ellipsis,
  };

  return (
    <nav data-slot="pagination">
      <div className={parts.list}>
        <button
          type="button"
          aria-label="Previous Page"
          disabled={current === 1}
          onClick={() => go(current - 1)}
          className={parts.nav}
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {pageRange(current, pageCount).map((item, index) =>
          item === ELLIPSIS ? (
            <div key={`gap-${index}`} data-type="ellipsis" className={parts.ellipsis}>
              …
            </div>
          ) : (
            <button
              key={`page-${item}`}
              type="button"
              data-type="page"
              value={item}
              aria-label={`Page ${item}`}
              aria-current={item === current ? "page" : undefined}
              data-selected={item === current ? "true" : undefined}
              onClick={() => go(item)}
              className={parts.item}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next Page"
          disabled={current === pageCount}
          onClick={() => go(current + 1)}
          className={parts.nav}
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path
              d="M6 3l5 5-5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </nav>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiPaginationSlot, string>> = {
  list: "flex items-center gap-1",
  item: cn(
    "inline-flex size-8 items-center justify-center rounded-control text-sm tabular-nums",
    "text-fg transition-colors outline-none",
    "hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-focus/50",
    "data-[selected]:bg-accent data-[selected]:text-on-accent",
    "disabled:pointer-events-none disabled:opacity-50",
  ),
  nav: cn(
    "inline-flex size-8 items-center justify-center rounded-control text-fg-muted",
    "transition-colors outline-none",
    "hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-focus/50",
    "disabled:pointer-events-none disabled:opacity-50",
  ),
  ellipsis: "inline-flex size-8 items-center justify-center text-sm text-fg-muted",
};
