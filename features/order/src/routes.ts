import type { RouteRecordRaw } from "vue-router";

/**
 * 本切片自己的路由樹，不碰任何共用 router 檔案（D7）。
 *
 * path 一律在 /order 之下、name 一律以 "order/" 開頭 ——
 * defineFeature 會在 dev 模式當場驗證，撞名不可能活到執行期。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: "/order",
    name: "order/list",
    component: () => import("./views/OrderList.vue"),
    meta: { permissions: ["order:read"] },
  },
];
