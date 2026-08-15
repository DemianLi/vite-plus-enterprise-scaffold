import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * 切片內的 Pinia store。
 *
 * store id 用 "shipment/" 命名空間前綴，且定義在切片內部 ——
 * **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現，兩個切片就會開始共用狀態，邊界當場失效。
 */
export const useShipmentFilterStore = defineStore("shipment/filter", () => {
  const page = ref(1);

  /**
   * 被選取的那一筆 —— 只存 id（D14）。
   *
   * 這裡刻意**不放** ShipmentItem 物件。放了就是第二份快取：
   * 列表重新整理之後對話框裡還是舊資料，而且不會有任何測試變紅。
   * 要那筆物件的時候，在元件裡用 computed 從列表推導（見 views/）。
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
