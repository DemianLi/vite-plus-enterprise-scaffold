import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from "vue";

import { fetchOrders, orderKeys, type Order, type OrderListQuery } from "../api.ts";

/**
 * 訂單列表的取數邏輯（D14）。
 *
 * ── 為什麼這段不留在元件裡 ──────────────────────────────────────────────
 *
 * 原本 `OrderList.vue` 直接寫 `useQuery({ queryKey, queryFn })`。單一元件時看不出
 * 問題，但這是**腳手架** —— 產生器會被跑上幾十次，而它示範的是什麼，
 * 團隊就長成什麼。等到同一個切片長出第二個消費者（例如首頁的「最近訂單」
 * 小卡），那段查詢只能複製貼上，因為沒有地方放它。複製之後兩份 queryKey
 * 會慢慢漂移，快取失效的時機從此對不起來 —— 而且沒有任何測試會紅。
 *
 * ── 這支照 Vue 官方 composable 的三條慣例寫 ─────────────────────────────
 *
 * 1. **輸入接受 ref／getter／純值**，一律用 `toValue()` 正規化。
 *    呼叫端因此不必先解開 `.value`，也不必為了傳純值而包一層 `ref()`。
 *
 * 2. **回傳 ref 組成的普通物件**，讓呼叫端可以解構又保住響應性。
 *    回傳 `reactive()` 的話，`const { orders } = useOrderList()` 會當場斷開連結。
 *
 * 3. **只在 setup 期間同步呼叫** —— 它內部用了 `useQuery`，而後者要拿到
 *    當前元件實例。這條由 Vue 自己在執行期報錯，不需要額外守。
 *
 * ⚠️ queryKey 用 `computed` 包起來是必要的，不是風格問題：
 * 傳入靜態值的話，篩選條件變了 TanStack Query 不會重新取數，
 * 畫面會停在舊資料上而且不報錯。
 */
export interface UseOrderListResult {
  readonly orders: ComputedRef<readonly Order[]>;
  readonly total: ComputedRef<number>;
  readonly isPending: Ref<boolean>;
  readonly isError: Ref<boolean>;
  readonly error: Ref<Error | null>;
}

export function useOrderList(query: MaybeRefOrGetter<OrderListQuery>): UseOrderListResult {
  const current = computed(() => toValue(query));

  const { data, isPending, isError, error } = useQuery({
    queryKey: computed(() => orderKeys.list(current.value)),
    queryFn: () => fetchOrders(current.value),
  });

  return {
    // 空陣列後備值放在這裡，而不是每個元件各寫一次 `data?.items ?? []`。
    orders: computed(() => data.value?.items ?? []),
    total: computed(() => data.value?.total ?? 0),
    isPending,
    isError,
    error,
  };
}
