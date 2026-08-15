import type { RouteRecordRaw } from "vue-router";

/**
 * 本切片自己的路由樹，不碰任何共用 router 檔案（D7）。
 *
 * path 一律在 /shipment 之下、name 一律以 "shipment/" 開頭 ——
 * defineFeature 會在 dev 模式當場驗證，撞名不可能活到執行期。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: "/shipment",
    name: "shipment/list",
    component: () => import("./views/ShipmentList.vue"),
    meta: { permissions: ["shipment:read"] },
  },
];
