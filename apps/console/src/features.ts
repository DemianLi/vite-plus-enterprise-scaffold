import type { Feature } from "@org/slice-kit";

import invoice from "@org/feature-invoice";
import order from "@org/feature-order";
import shipment from "@org/feature-shipment";

/**
 * ★ 全系統**唯一**知道有哪些切片的檔案（D7）。
 *
 * 新增一個切片 ＝ 加一行 import、加一個陣列項目。就這樣。
 * 不需要改 router/index.ts、store/index.ts、i18n/index.ts、permissions.ts ——
 * 那種設計會讓四個團隊同時開發變成四份 merge conflict。
 *
 * 全部是靜態 import：SAST 追得到進入點、bundler tree-shake 得掉、
 * CODEOWNERS 也管得住這個檔案的變更。
 *
 * 刻意**不**用 import.meta.glob 自動掃描 —— 動態 glob 會讓 Sonar/Checkmarx
 * 在切片進入點斷掉資料流分析，而那正是 D1 最嚴組合下最不能出現的事。
 */
export const features: readonly Feature[] = [invoice, order, shipment];
