import { create } from "zustand";

/**
 * 切片內的 store（D13 / D14）。
 *
 * 定義在切片內部 —— **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現，兩個切片就會開始共用狀態，邊界當場失效。
 *
 * ⚠️ 沒有 store id：zustand 的 store 是這個模組裡的一個變數，撞不到名（C240 Q92）。
 *
 * ── 這裡只放「客戶端才是權威」的東西 ───────────────────────────────────
 *
 * 判準：*這份資料如果和伺服器不一致，誰是錯的？*
 *
 *   伺服器是權威（列表資料本身）  → hooks/useInvoiceList.ts
 *   客戶端是權威（篩選、選取的 id）→ 這裡
 *   兩者都不是（選取的那幾筆物件）→ 哪裡都不放，render 時從列表推導
 *
 * 一句話：**存 id，不存 entity。**
 * 一致性檢查會擋下 value import `./api.ts` 與 `@tanstack/react-query`；
 * `import type` 允許（在 verbatimModuleSyntax 下會被完全抹除，無執行期效果）。
 */
interface InvoiceFilterState {
  readonly page: number;
  /**
   * 被選取的那一筆 —— 只存 id。
   *
   * 這裡刻意**不放** `selectedInvoiceItem` 物件。放了就是第二份快取：
   * 列表重新整理之後對話框裡還是舊資料，而且不會有任何測試變紅。
   * 要那筆物件的時候，在元件裡從列表推導（見 views/）。
   */
  readonly selectedId: string | null;
  // 寫成屬性而不是方法：元件會把它單獨選出來傳給 onClick，方法語法在型別上帶著 `this`。
  readonly setPage: (next: number) => void;
  readonly select: (id: string | null) => void;
}

export const useInvoiceFilterStore = create<InvoiceFilterState>()((set) => ({
  page: 1,
  selectedId: null,
  setPage: (next) => set({ page: next }),
  select: (id) => set({ selectedId: id }),
}));
