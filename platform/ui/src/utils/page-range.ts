/** 頁碼清單裡的省略號。 */
export const ELLIPSIS = "ellipsis";

/**
 * 「1 … 4 5 6 … 20」的那條清單（C236）。
 *
 * ⚠️ **不要自己重新設計這支。** 「1 … 4 5 6 … 20」看起來是十行 for 迴圈，實際上邊界很多：
 * 前三頁與後三頁不該出現省略號、`siblingCount` 要對稱、頁數少時要全部列出。
 * 每一個邊界寫錯的症狀都是「某幾頁的時候排版怪怪的」—— **回報率極低**。
 *
 * Base UI 沒有分頁基元，shadcn 的 Base UI 那一版也只給版型、不算頁碼。所以這支是
 * reka-ui `Pagination/utils.ts` 的 `getRange` 在 `showEdges: true` 那一支的**逐行移植**
 * （`siblingCount` 預設 2），不是重新設計。
 *
 * 守它的是 `tests/page-range.test.ts` 的固定期望值：總頁數 1–20 × 每一個目前頁，
 * 211 組答案是 reka 退場前由 reka 算出來凍結的（C243，Q98）。改這支之前，先想清楚
 * 是不是真的要偏離 reka 的答案 —— 要的話先改表。
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
