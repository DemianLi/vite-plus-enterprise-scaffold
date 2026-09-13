import { useQuery } from "@tanstack/react-query";

import { invoiceGateway, invoiceKeys, type InvoiceItem, type QueryInvoiceInput } from "../api.ts";
import { queryInvoice } from "../usecases/query-invoice.ts";

/**
 * 本切片的取數邏輯。
 *
 * **元件只負責呈現，有狀態的邏輯住在這裡。** views/ 不得直接 import
 * `@tanstack/react-query` 或 `../api.ts`。
 *
 * 靠 React hook 的兩條規則成立：只在元件頂層呼叫；queryKey 由輸入算出來 ——
 * 寫成固定的 key 的話，條件變了不會重新取數，畫面停在舊資料上而且不報錯。
 */
export interface UseInvoiceListResult {
  readonly items: readonly InvoiceItem[];
  readonly total: number;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
}

/** 後備值用同一個陣列：每次 render 給一個新的 `[]`，依賴它的 memo 會每次都重算。 */
const NO_ITEMS: readonly InvoiceItem[] = [];

export function useInvoiceList(query: QueryInvoiceInput = {}): UseInvoiceListResult {
  const { data, isPending, isError, error } = useQuery({
    queryKey: invoiceKeys.list(query),
    // ⚠️ 呼叫的是 **usecase**，不是 api.ts —— 業務規則只有一份。直接叫
    // fetchInvoiceList 的話，畫面跑的東西繞過了業務規則，兩邊會是兩條路。
    queryFn: () => queryInvoice(invoiceGateway, query),
  });

  return {
    items: data?.items ?? NO_ITEMS,
    total: data?.total ?? 0,
    isPending,
    isError,
    error,
  };
}
