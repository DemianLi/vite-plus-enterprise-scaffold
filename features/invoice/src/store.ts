import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * 切片內的 Pinia store（D13 / D14）。
 *
 * store id 用 "invoice/" 命名空間前綴，且定義在切片內部 ——
 * **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現，兩個切片就會開始共用狀態，邊界當場失效。
 *
 * ── 這裡只放「客戶端才是權威」的東西 ───────────────────────────────────
 *
 * 判準：*這份資料如果和伺服器不一致，誰是錯的？*
 *
 *   伺服器是權威（列表資料本身）  → composables/useInvoiceList.ts
 *   客戶端是權威（篩選、選取的 id）→ 這裡
 *   兩者都不是（選取的那幾筆物件）→ 哪裡都不放，用 computed 推導
 *
 * 一句話：**存 id，不存 entity。**
 * 一致性檢查會擋下 value import `./api.ts` 與 `@tanstack/vue-query`；
 * `import type` 允許（在 verbatimModuleSyntax 下會被完全抹除，無執行期效果）。
 */
export const useInvoiceFilterStore = defineStore("invoice/filter", () => {
  const page = ref(1);

  /**
   * 被選取的那一筆 —— 只存 id。
   *
   * 這裡刻意**不放** `selectedInvoiceItem` 物件。放了就是第二份快取：
   * 列表重新整理之後對話框裡還是舊資料，而且不會有任何測試變紅。
   * 要那筆物件的時候，在元件裡用 `computed` 從列表推導（見 views/）。
   */
  const selectedId = ref<string | null>(null);

  const query = computed(() => ({ page: page.value }));

  function setPage(next: number): void {
    page.value = next;
  }

  function select(id: string | null): void {
    selectedId.value = id;
  }

  return { page, selectedId, query, setPage, select };
});
