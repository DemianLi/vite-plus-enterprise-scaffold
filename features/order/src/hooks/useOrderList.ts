import { useQuery } from "@tanstack/react-query";

import { fetchOrders, orderKeys, type Order, type OrderListQuery } from "../api.ts";

/**
 * 訂單列表的取數邏輯。
 *
 * ── 為什麼這段不留在元件裡 ──────────────────────────────────────────────
 *
 * 單一元件時看不出問題，但新切片會照著示範長 —— 它示範的是什麼，團隊就長成
 * 什麼。等到同一個切片長出第二個消費者（例如首頁的「最近訂單」小卡），留在
 * 元件裡的查詢只能複製貼上，因為沒有地方放它。複製之後兩份 queryKey
 * 會慢慢漂移，快取失效的時機從此對不起來 —— 而且什麼都不會報錯。
 *
 * ── 這支靠 React hook 的兩條規則成立 ─────────────────────────────────────
 *
 * 1. **只在元件頂層呼叫** —— 它內部用了 `useQuery`。放進條件或迴圈裡，
 *    React 在執行期報錯。
 *
 * 2. **queryKey 由輸入算出來。** 每次 render 都重算，所以條件一變 key 就變、
 *    TanStack Query 就重新取數。寫成固定的 key 的話，換條件時畫面停在舊資料上
 *    而且不報錯。（Vue 版要另外用 `computed` 包 key，React 這一格是免費的。）
 */
export interface UseOrderListResult {
  readonly orders: readonly Order[];
  readonly total: number;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
}

/** 後備值用同一個陣列：每次 render 給一個新的 `[]`，依賴它的 memo 會每次都重算。 */
const NO_ORDERS: readonly Order[] = [];

export function useOrderList(query: OrderListQuery): UseOrderListResult {
  const { data, isPending, isError, error } = useQuery({
    queryKey: orderKeys.list(query),
    queryFn: () => fetchOrders(query),
  });

  return {
    // 空陣列後備值放在這裡，而不是每個元件各寫一次 `data?.items ?? []`。
    orders: data?.items ?? NO_ORDERS,
    total: data?.total ?? 0,
    isPending,
    isError,
    error,
  };
}
