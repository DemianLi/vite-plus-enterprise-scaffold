import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from "vue";

import { invoiceGateway, invoiceKeys, type InvoiceItem, type QueryInvoiceInput } from "../api.ts";
import { queryInvoice } from "../usecases/query-invoice.ts";

/**
 * 本切片的取數邏輯（D14）。
 *
 * **元件只負責呈現，有狀態的邏輯住在這裡。** 一致性檢查會擋下
 * 直接在 views/ 裡 import `@tanstack/vue-query` 或 `../api.ts` 的寫法。
 *
 * 照 Vue 官方 composable 的三條慣例（vuejs.org/guide/reusability/composables）：
 *
 * 1. 輸入接受 ref／getter／純值，一律用 `toValue()` 正規化
 * 2. 回傳 ref 組成的**普通物件**（回傳 `reactive()` 的話，解構就斷開響應性）
 * 3. 只在 setup 期間同步呼叫
 *
 * ⚠️ queryKey 包 `computed` 是必要的：傳靜態值的話，條件變了不會重新取數，
 * 畫面停在舊資料上而且不報錯。
 */
export interface UseInvoiceListResult {
  readonly items: ComputedRef<readonly InvoiceItem[]>;
  readonly total: ComputedRef<number>;
  readonly isPending: Ref<boolean>;
  readonly isError: Ref<boolean>;
  readonly error: Ref<Error | null>;
}

export function useInvoiceList(
  query: MaybeRefOrGetter<QueryInvoiceInput> = {},
): UseInvoiceListResult {
  const current = computed(() => toValue(query));

  const { data, isPending, isError, error } = useQuery({
    queryKey: computed(() => invoiceKeys.list(current.value)),
    // ⚠️ 呼叫的是 **usecase**，不是 api.ts —— 業務規則只有一份，而驗收規格
    // 打的就是這一份。直接叫 fetchInvoiceList 的話，規格驗的東西與畫面
    // 跑的東西會是兩條路。
    queryFn: () => queryInvoice(invoiceGateway, current.value),
  });

  return {
    items: computed(() => data.value?.items ?? []),
    total: computed(() => data.value?.total ?? 0),
    isPending,
    isError,
    error,
  };
}
