import { create } from "zustand";

import type { Order } from "./api.ts";

/**
 * 切片內的 store（D13 / D14）。
 *
 * store 定義在切片內部 —— **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現 stores/ 目錄，兩個切片就會開始共用狀態，邊界當場失效。
 *
 * ⚠️ 沒有 store id，那不是漏掉：Pinia 的 id 在全域登記，兩片同名會互相覆蓋，
 * 所以原本規定要帶切片前綴；zustand 的 store 就是這個模組裡的一個變數，
 * 撞不到名 —— 那條規則失去了對象，C239 Q77 拿掉它。
 *
 * ── 這裡只放「客戶端才是權威」的東西（D14）─────────────────────────────
 *
 * 判準：*這份資料如果和伺服器不一致，誰是錯的？*
 *
 *   伺服器是權威（`Order[]` 本身）            → `hooks/useOrderList.ts`
 *   客戶端是權威（篩選條件、選取的 id）       → 這裡
 *   兩者都不是（「選取的那幾筆 Order 物件」）  → 哪裡都不放，render 時從列表推導
 *
 * 一句話：**存 id，不存 entity。**
 * 把 join 出來的結果存進 store，等於做了第二份快取 —— 它與 TanStack Query 那份的
 * 失效時機不同，而且**不會有任何測試變紅**。
 *
 * 一致性檢查會擋下 value import `./api.ts` 與 `@tanstack/react-query`。
 * 上面那行 `import type` 是**允許的** —— 借型別在 `verbatimModuleSyntax` 下
 * 會被完全抹除，沒有執行期效果，不構成耦合。
 */
interface OrderFilterState {
  readonly status: Order["status"] | undefined;
  readonly page: number;
  /**
   * 使用者點開了哪一筆。**存 id，不存 Order 物件**（D14）。
   *
   * 存物件的話就是做了第二份快取：它與 TanStack Query 那份的失效時機不同，
   * 於是「列表已經重新整理、但對話框裡還是舊金額」——
   * 而且不會有任何測試變紅。要顯示的那筆從列表推導。
   */
  readonly selectedId: string | null;
  select(id: string | null): void;
  setStatus(next: Order["status"] | undefined): void;
}

export const useOrderFilterStore = create<OrderFilterState>()((set) => ({
  status: undefined,
  page: 1,
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  // 換條件時回到第一頁，否則會停在不存在的分頁。
  setStatus: (next) => set({ status: next, page: 1 }),
}));
