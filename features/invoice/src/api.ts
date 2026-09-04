import { http } from "@org/http-client";

import type {
  InvoiceGateway,
  InvoiceListQuery,
  InvoiceListResponse,
  QueryInvoiceInput,
} from "./ports.ts";

/**
 * 本切片的資料存取層 —— `ports.ts` 那個介面的**真實作**。
 *
 * 切片被禁止直接 import axios/fetch —— 一律走 @org/http-client，
 * CSRF 標頭與錯誤處理才會全 repo 一致，稽核時才證明得出來（D8）。
 */

export function fetchInvoiceList(query: InvoiceListQuery = {}): Promise<InvoiceListResponse> {
  const search = query.page === undefined ? "" : `?page=${String(query.page)}`;
  return http.get<InvoiceListResponse>(`/invoice${search}`);
}

/**
 * 送進 usecase 的正式 gateway。
 *
 * ⚠️ 它必須是**畫面真的在用的那一個** —— composable 拿的就是它。
 * 規格跑的是同一份 usecase，只是換一個 gateway 進去；
 * 兩邊各走各的路的話，規格全綠而畫面壞掉，沒有閘門看得見。
 */
export const invoiceGateway: InvoiceGateway = {
  list: fetchInvoiceList,
};

// 型別的公開出口留在這裡，使用端不必知道 ports.ts 的存在。
export type {
  InvoiceItem,
  InvoiceListQuery,
  InvoiceListResponse,
  QueryInvoiceInput,
} from "./ports.ts";

/**
 * TanStack Query 的 key 命名空間。
 * 第一段固定是切片名，兩個切片的快取因此不可能互相污染。
 */
export const invoiceKeys = {
  all: ["invoice"] as const,
  // ⚠️ 參數是 usecase 的輸入而不是 gateway 的查詢 —— 少了業務條件那一半，
  // 篩選變了 queryKey 卻沒變，畫面停在舊資料上而且不報錯。
  list: (query: QueryInvoiceInput) => ["invoice", "list", query] as const,
  detail: (id: string) => ["invoice", "detail", id] as const,
} as const;
