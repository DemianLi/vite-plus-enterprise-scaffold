import type { InvoiceGateway, InvoiceItem } from "../../src/ports.ts";

/**
 * 規格用的假資料來源。
 *
 * ⚠️ 它實作的是 **usecase 真的在用的那個介面** —— 不是「測試專用的另一條路」。
 * 換掉的只有資料從哪裡來，跑起來的業務規則與畫面上跑的是同一份。
 */
export function createInMemoryInvoiceGateway(items: readonly InvoiceItem[]): InvoiceGateway {
  return {
    list: () => Promise.resolve({ items, total: items.length }),
  };
}
