/**
 * 本切片與外界之間的**介面**（TESTING.md 層 3）。
 *
 * 這個檔案零相依、純型別 —— 它同時被兩邊 import：
 *
 *   1. src/usecases/  — 業務規則，只認得這裡的介面
 *   2. src/api.ts     — 真實作，走 @org/http-client
 *
 * 分開的理由只有一個：**驗收規格要打得到業務規則，而且不能打到網路。**
 * 規格餵一個 in-memory 的 gateway 進去（見 tests/support/），
 * 跑起來的是同一份 usecase —— 不是「測試專用的另一條路」。
 */

export interface InvoiceItem {
  readonly id: string;
  // TODO: 補上這個切片實際的欄位
}

export interface InvoiceListQuery {
  readonly page?: number;
}

export interface InvoiceListResponse {
  readonly items: readonly InvoiceItem[];
  readonly total: number;
}

/**
 * 送進 usecase 的輸入。
 *
 * ⚠️ 它與 `InvoiceListQuery` **刻意不是同一個型別**：後者是傳給資料來源的
 * 東西，前者還包含由業務規則自己處理的條件（範本裡是 `keyword`）。
 * 合成一個的話，gateway 會收到一個它根本不看的欄位 —— 而下一個人會以為
 * 伺服器有在篩。
 */
export interface QueryInvoiceInput extends InvoiceListQuery {
  readonly keyword?: string;
}

/**
 * 資料來源的介面。**usecase 只認得它，不認得 HTTP。**
 *
 * ⚠️ 換掉資料來源（改走 GraphQL、改走另一個 BFF）時，動的是 api.ts 的實作，
 * usecase 與規格一個字都不用改 —— 那正是這個介面存在的理由。
 */
export interface InvoiceGateway {
  list(query: InvoiceListQuery): Promise<InvoiceListResponse>;
}
