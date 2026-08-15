import { defineStore } from "pinia";
import { ref, computed } from "vue";

import type { Order } from "./api.ts";

/**
 * 切片內的 Pinia store（D13）。
 *
 * store id 用 "order/" 命名空間前綴，且 store 定義在切片內部 ——
 * **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現 stores/ 目錄，兩個切片就會開始共用狀態，邊界當場失效。
 */
export const useOrderFilterStore = defineStore("order/filter", () => {
  const status = ref<Order["status"] | undefined>(undefined);
  const page = ref(1);

  const query = computed(() => ({ status: status.value, page: page.value }));

  function setStatus(next: Order["status"] | undefined): void {
    status.value = next;
    page.value = 1; // 換條件時回到第一頁，否則會停在不存在的分頁。
  }

  return { status, page, query, setStatus };
});
