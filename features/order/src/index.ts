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
        // ⚠️ loading／tableCaption／rowActions 這三個鍵只給輔具用，畫面上看不到
        //（見 OrderList.vue）。它們**必須是翻譯字串**，不能寫死在模板裡 ——
        // 一個只有中文的 aria-label 對切到英文的使用者就是一段噪音。
        loading: "載入訂單中",
        empty: "目前沒有符合條件的訂單",
        tableCaption: "訂單列表，依篩選條件顯示",
        rowActions: "操作",
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
        loading: "Loading orders",
        empty: "No orders match the current filter",
        tableCaption: "Orders matching the current filter",
        rowActions: "Actions",
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
