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

  i18n: {
    "zh-TW": {
      shipment: {
        title: "出貨管理",
        empty: "目前沒有資料",
      },
    },
    en: {
      shipment: {
        title: "Shipment",
        empty: "No data",
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
