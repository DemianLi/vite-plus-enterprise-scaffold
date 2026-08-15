import { defineStore } from "pinia";
import { ref, computed } from "vue";

import type { Order } from "./api.ts";

/**
 * 切片內的 Pinia store（D13 / D14）。
 *
 * store id 用 "order/" 命名空間前綴，且 store 定義在切片內部 ——
 * **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現 stores/ 目錄，兩個切片就會開始共用狀態，邊界當場失效。
 *
 * ── 這裡只放「客戶端才是權威」的東西（D14）─────────────────────────────
 *
 * 判準：*這份資料如果和伺服器不一致，誰是錯的？*
 *
 *   伺服器是權威（`Order[]` 本身）            → `composables/useOrderList.ts`
 *   客戶端是權威（篩選條件、選取的 id）       → 這裡
 *   兩者都不是（「選取的那幾筆 Order 物件」）  → 哪裡都不放，用 computed 推導
 *
 * 一句話：**存 id，不存 entity。**
 * 把 join 出來的結果存進 store，等於做了第二份快取 —— 它與 TanStack Query 那份的
 * 失效時機不同，而且**不會有任何測試變紅**。
 *
 * 一致性檢查會擋下 value import `./api.ts` 與 `@tanstack/vue-query`。
 * 下面那行 `import type` 是**允許的** —— 借型別在 `verbatimModuleSyntax` 下
 * 會被完全抹除，沒有執行期效果，不構成耦合。
 */
export const useOrderFilterStore = defineStore("order/filter", () => {
  const status = ref<Order["status"] | undefined>(undefined);
  const page = ref(1);

  /**
   * 使用者點開了哪一筆。**存 id，不存 Order 物件**（D14）。
   *
   * 存物件的話就是做了第二份快取：它與 TanStack Query 那份的失效時機不同，
   * 於是「列表已經重新整理、但對話框裡還是舊金額」——
   * 而且不會有任何測試變紅。要顯示的那筆用 computed 從列表推導。
   */
  const selectedId = ref<string | null>(null);

  const query = computed(() => ({ status: status.value, page: page.value }));

  function select(id: string | null): void {
    selectedId.value = id;
  }

  function setStatus(next: Order["status"] | undefined): void {
    status.value = next;
    page.value = 1; // 換條件時回到第一頁，否則會停在不存在的分頁。
  }

  return { status, page, query, selectedId, select, setStatus };
});
