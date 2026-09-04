import { defineFeature } from "@org/slice-kit";

import { routes } from "./routes.ts";

/**
 * 請款單切片對外的**唯一**公開契約（D7）。
 *
 * apps/<app>/src/features.ts 只 import 這個 default export ——
 * 新增一個切片 ＝ 改一個檔案、加一行。
 */
export default defineFeature({
  name: "invoice",

  routes,

  permissions: ["invoice:read"],

  i18n: {
    "zh-TW": {
      invoice: {
        title: "請款單",
        empty: "目前沒有資料",
        detail: "明細",
        detailDescription: "這一筆的完整內容",
        close: "關閉",
      },
    },
    en: {
      invoice: {
        title: "Invoice",
        empty: "No data",
        detail: "Detail",
        detailDescription: "Full contents of this record",
        close: "Close",
      },
    },
  },

  menu: [
    {
      labelKey: "invoice.title",
      routeName: "invoice/list",
      order: 100,
      permissions: ["invoice:read"],
    },
  ],
});

export type { InvoiceItem, InvoiceListResponse } from "./api.ts";
