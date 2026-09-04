import type { InvoiceGateway, InvoiceListResponse, QueryInvoiceInput } from "../ports.ts";

/**
 * 查詢請款單。
 *
 * ── 這一層的規則只有三條（TESTING.md 層 3）────────────────────────────
 *
 *   1. **零框架相依**：不 import vue／pinia／vue-router／vue-i18n／vue-query，
 *      也不 import 任何 .vue
 *   2. **輸入輸出都是純資料**：沒有 ref、沒有 computed、沒有生命週期
 *   3. **業務規則住這裡**，composable 只負責把它接到畫面上
 *
 * 為什麼規格不直接打 composable：規格步驟一旦要掛載 Vue、建 pinia、造
 * QueryClient，那層設施就會貴到沒有專案組願意用 —— 而**沒人用就等於不存在**。
 *
 * ⚠️ 下面這條 `keyword` 篩選是**範本**，換成這個切片真正的業務規則。
 * 換的時候連 `specs/invoice.feature` 一起換 —— 那份規格才是「什麼叫做對」
 * 的定義，這裡只是它的實作。
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
  // 這是一個業務決定（分頁器該顯示哪個數字），所以它被寫成規格的一條 ——
  // 不同意的話改規格，不要只改這一行。
  return { items, total: items.length };
}
