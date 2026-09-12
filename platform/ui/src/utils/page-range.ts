/** 頁碼清單裡的省略號。 */
export const ELLIPSIS = "ellipsis";

/**
 * 「1 … 4 5 6 … 20」的那條清單（C236）。
 *
 * ⚠️ **`UiPagination.vue` 檔頭寫著「不要自己算頁碼」，而這裡在自己算。** 那句話的前提是
 * reka-ui 的 `PaginationList` 替它算好了；Base UI 沒有分頁基元，shadcn 的 Base UI 那一版
 * 也只給版型、不算頁碼。所以這支是 reka-ui `Pagination/utils.ts` 的 `getRange` 在
 * `showEdges: true` 那一支的**逐行移植**（Vue 版就是 `show-edges`、`siblingCount` 預設 2），
 * 不是重新設計 —— 邊界多、錯了回報率極低，那段警告講的正是這個。
 *
 * 守它的不是讀原始碼，是**差分**：`tests/react-parity.test.ts` 把 Vue 版（reka 在算）當成
 * 對照組，逐組 (總頁數, 目前頁) 比對兩版渲染出來的整條清單。
 */
export function pageRange(
  current: number,
  pageCount: number,
  siblingCount = 2,
): readonly (number | typeof ELLIPSIS)[] {
  const first = 1;
  const last = pageCount;
  const leftSibling = Math.max(current - siblingCount, first);
  const rightSibling = Math.min(current + siblingCount, last);

  // 2 × siblingCount 是左右鄰居，5 是兩個省略號 ＋ 首尾兩頁 ＋ 目前頁。
  const totalNumbers = Math.min(2 * siblingCount + 5, pageCount);
  const itemCount = totalNumbers - 2;
  const showLeft =
    leftSibling > first + 2 &&
    Math.abs(last - itemCount - first + 1) > 2 &&
    Math.abs(leftSibling - first) > 2;
  const showRight =
    rightSibling < last - 2 && Math.abs(last - itemCount) > 2 && Math.abs(last - rightSibling) > 2;

  if (!showLeft && showRight) return [...range(1, itemCount), ELLIPSIS, last];
  if (showLeft && !showRight) return [first, ELLIPSIS, ...range(last - itemCount + 1, last)];
  if (showLeft && showRight) {
    return [first, ELLIPSIS, ...range(leftSibling, rightSibling), ELLIPSIS, last];
  }
  return range(first, last);
}

function range(start: number, end: number): readonly number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => index + start);
}
