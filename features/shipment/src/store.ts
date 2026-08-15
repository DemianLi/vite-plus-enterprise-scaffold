import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * 切片內的 Pinia store。
 *
 * store id 用 "shipment/" 命名空間前綴，且定義在切片內部 ——
 * **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現，兩個切片就會開始共用狀態，邊界當場失效。
 */
export const useShipmentFilterStore = defineStore("shipment/filter", () => {
  const page = ref(1);

  function setPage(next: number): void {
    page.value = next;
  }

  return { page, setPage };
});
