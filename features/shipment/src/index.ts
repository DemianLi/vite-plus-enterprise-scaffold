import { defineFeature } from "@org/slice-kit";

import { routes } from "./routes.ts";

/**
 * 出貨管理切片對外的**唯一**公開契約（D7）。
 *
 * apps/<app>/src/features.ts 只 import 這個 default export ——
 * 新增一個切片 ＝ 改一個檔案、加一行。
 */
export default defineFeature({
  name: "shipment",

  routes,

  permissions: ["shipment:read"],

  // §11 II ⑨ —— 空陣列是一個**答案**，不是一個省略。
  // 出貨單目前只呈現單號（識別的是貨不是人）。哪天加上收件人姓名或地址，
  // 就要寫進這裡，而 tools/pii-check 會接著要求那些欄位走隱碼。
  personalData: [],
  i18n: {
    "zh-TW": {
      shipment: {
        title: "出貨管理",
        empty: "目前沒有資料",
        detail: "明細",
        detailDescription: "這一筆的完整內容",
        close: "關閉",
      },
    },
    en: {
      shipment: {
        title: "Shipment",
        empty: "No data",
        detail: "Detail",
        detailDescription: "Full contents of this record",
        close: "Close",
      },
    },
  },

  menu: [
    {
      labelKey: "shipment.title",
      routeName: "shipment/list",
      order: 100,
      permissions: ["shipment:read"],
    },
  ],
});

export type { ShipmentItem, ShipmentListResponse } from "./api.ts";
