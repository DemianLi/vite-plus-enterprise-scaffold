import { http } from "@org/http-client";

/**
 * 本切片的資料存取層。
 *
 * 切片被禁止直接 import axios/fetch（vite.config.ts 的 no-restricted-imports
 * 與一致性檢查各擋一次）—— 一律走 @org/http-client，CSRF 標頭與錯誤處理才會
 * 全 repo 一致，稽核時才證明得出來。
 */

export interface Order {
  readonly id: string;
  readonly customerName: string;
  readonly totalCents: number;
  readonly status: "pending" | "shipped" | "cancelled";
  readonly placedAt: string;
}

export interface OrderListQuery {
  readonly status?: Order["status"];
  readonly page?: number;
}

export interface OrderListResponse {
  readonly items: readonly Order[];
  readonly total: number;
}

function toSearchParams(query: OrderListQuery): string {
  const params = new URLSearchParams();
  if (query.status !== undefined) params.set("status", query.status);
  if (query.page !== undefined) params.set("page", String(query.page));
  const serialised = params.toString();
  return serialised === "" ? "" : `?${serialised}`;
}

export function fetchOrders(query: OrderListQuery = {}): Promise<OrderListResponse> {
  return http.get<OrderListResponse>(`/orders${toSearchParams(query)}`);
}

export function cancelOrder(id: string): Promise<void> {
  return http.post<void>(`/orders/${encodeURIComponent(id)}/cancel`);
}

/**
 * TanStack Query 的 key 命名空間（D13）。
 *
 * 第一段固定是切片名，所以兩個切片的快取永遠不可能互相污染 ——
 * 這是 query key 天然適合垂直切片的原因。
 */
export const orderKeys = {
  all: ["order"] as const,
  list: (query: OrderListQuery) => ["order", "list", query] as const,
  detail: (id: string) => ["order", "detail", id] as const,
} as const;
