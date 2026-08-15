import { http } from "@org/http-client";

/**
 * 本切片的資料存取層。
 *
 * 切片被禁止直接 import axios/fetch —— 一律走 @org/http-client，
 * CSRF 標頭與錯誤處理才會全 repo 一致，稽核時才證明得出來（D8）。
 */

export interface ShipmentItem {
  readonly id: string;
  // TODO: 補上這個切片實際的欄位
}

export interface ShipmentListResponse {
  readonly items: readonly ShipmentItem[];
  readonly total: number;
}

export function fetchShipmentList(): Promise<ShipmentListResponse> {
  return http.get<ShipmentListResponse>("/shipment");
}

/**
 * TanStack Query 的 key 命名空間。
 * 第一段固定是切片名，兩個切片的快取因此不可能互相污染。
 */
export const shipmentKeys = {
  all: ["shipment"] as const,
  list: () => ["shipment", "list"] as const,
  detail: (id: string) => ["shipment", "detail", id] as const,
} as const;
