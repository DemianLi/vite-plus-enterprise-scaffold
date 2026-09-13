import type { InvoiceGateway, InvoiceListResponse, QueryInvoiceInput } from "../ports.ts";

/**
 * 查詢請款單。
 *
 * ── 這一層的規則只有三條 ──────────────────────────────────────────────
 *
 *   1. **零框架相依**：不 import react／react-router／react-i18next／zustand／
 *      react-query，也不 import 任何 .tsx
 *   2. **輸入輸出都是純資料**：沒有 state、沒有 hook、沒有生命週期
 *   3. **業務規則住這裡**，hook 只負責把它接到畫面上
 *
 * 為什麼業務規則不寫在 hook 裡：寫進去的話，要執行它就得先掛載 React、建 store、
 * 造 QueryClient —— 業務規則被綁在畫面的設施上，換不掉也搬不走。
 *
 * ⚠️ 下面這條 `keyword` 篩選是**範本**，換成這個切片真正的業務規則。
 */
export async function queryInvoice(
  gateway: InvoiceGateway,
  input: QueryInvoiceInput = {},
): Promise<InvoiceListResponse> {
  const response = await gateway.list({ page: input.page });

  const keyword = input.keyword?.trim() ?? "";
  if (keyword === "") return response;

  const items = response.items.filter((item) => item.id.includes(keyword));

  // ⚠️ 篩選之後 total 改成**符合的筆數**，不是伺服器回的總數。
  // 這是一個業務決定（分頁器該顯示哪個數字）—— 不同意的話先確認需求，
  // 不要只改這一行。
  return { items, total: items.length };
}
