// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { maskName } from "@org/pii";

/**
 * 宣告為個資的欄位，渲染出來真的看不到完整值。
 *
 * ── 這裡最容易寫錯的一條 ────────────────────────────────────────────
 *
 * 直覺會寫成「斷言隱碼後的字串有出現」。那條會過，而且**在沒有隱碼時也會過**：
 * 「林○○」與「林佳蓉」可以同時出現在畫面上（例如列表遮了、明細沒遮）。
 *
 * 真正該斷言的是**完整值在整份 HTML 裡不存在**。
 *
 * ── `maskName()` 本身不在這裡驗（C196）──────────────────────────────
 *
 * 這裡曾經有一個 describe「隱碼函式本身」：中文留首字、西方姓名分段、不得含原字、
 * 空字串，四條逐條是 `platform/pii/tests/mask.test.ts` 那組的嚴格子集 ——
 * 同一個變異兩邊同時紅，而只讓那邊紅的變異存在（`keepHead` 的 `<=` → `<`）。
 * 其中「不得含原字」那條抄過來時輸入換成了「王曉明」、期望仍是「佳」，
 * 對任何實作恆真。切片的接縫只有下面那一條：**宣告為個資的欄位，渲染出來
 * 看不到完整值**；函式對不對歸 `platform/pii`。
 */

/** 刻意不用示範資料裡的名字：測試不該依賴另一個檔案的內容。 */
const FULL_NAME = "王曉明";
const LATIN_NAME = "Aya Nakamura";

/**
 * 用一個只做呈現的替身元件，而不是掛整個 `OrderList.tsx`。
 *
 * `OrderList.tsx` 要 QueryClient 與 i18n 兩個 Provider 才掛得起來，而那兩個東西
 * 一個都不影響「姓名有沒有被遮住」。掛整個畫面只會讓這支測試因為與個資無關的
 * 理由而壞掉 —— 然後有人把它跳過。
 *
 * ⚠️ 代價要說清楚：這樣就**不是**在測 `OrderList.tsx` 本身 ——
 * 它只涵蓋這個替身元件。`OrderList.tsx` 有沒有繼續呼叫 `maskName()`，靠 review。
 */
function OrderRow({ customerName }: { readonly customerName: string }) {
  return createElement("td", null, maskName(customerName));
}

/** `<td>` 要放在表格裡：直接掛在 `<div>` 底下，React 會為巢狀不合法而報錯。 */
function renderRow(customerName: string): HTMLElement {
  const row = createElement("tr", null, createElement(OrderRow, { customerName }));
  return render(createElement("table", null, createElement("tbody", null, row))).container;
}

describe("渲染結果裡找不到完整姓名", () => {
  it("🔴 完整姓名不得出現在 HTML 的任何地方", () => {
    expect(renderRow(FULL_NAME).innerHTML, "完整姓名被渲染出去了").not.toContain(FULL_NAME);
  });

  it("★ 而且畫面不是空的 —— 對照組", () => {
    // 少了這條，「什麼都沒渲染」會被讀成「遮得很好」。
    // 這是 C33 的規矩在元件測試上的樣子。
    const text = renderRow(FULL_NAME).textContent ?? "";
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("王");
  });

  it("西方姓名同樣不得完整出現", () => {
    const html = renderRow(LATIN_NAME).innerHTML;
    expect(html).not.toContain(LATIN_NAME);
    expect(html).not.toContain("Nakamura");
  });
});
