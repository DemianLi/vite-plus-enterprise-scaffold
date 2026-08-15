import { defineFeature } from "@org/slice-kit";

import { routes } from "./routes.ts";

/**
 * 訂單切片對外的**唯一**公開契約（D7）。
 *
 * apps/console/src/features.ts 只 import 這個 default export ——
 * 新增一個切片 ＝ 改一個檔案、加一行。
 */
export default defineFeature({
  name: "order",

  routes,

  permissions: ["order:read", "order:cancel"],

  i18n: {
    "zh-TW": {
      order: {
        title: "訂單管理",
        empty: "目前沒有符合條件的訂單",
        status: { pending: "處理中", shipped: "已出貨", cancelled: "已取消" },
        cancel: "取消訂單",
        detail: "訂單明細",
        detailDescription: "這一筆訂單的完整內容。關閉後會回到列表。",
        close: "關閉",
      },
    },
    en: {
      order: {
        title: "Orders",
        empty: "No orders match the current filter",
        status: { pending: "Pending", shipped: "Shipped", cancelled: "Cancelled" },
        cancel: "Cancel order",
        detail: "Order detail",
        detailDescription: "Full contents of this order. Closing returns you to the list.",
        close: "Close",
      },
    },
  },

  menu: [
    {
      labelKey: "order.title",
      routeName: "order/list",
      order: 10,
      permissions: ["order:read"],
    },
  ],
});

export type { Order, OrderListQuery, OrderListResponse } from "./api.ts";
