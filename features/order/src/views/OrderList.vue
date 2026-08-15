<script setup lang="ts">
import { UiButton } from "@org/ui";
import { useOrderList } from "../composables/useOrderList.ts";
import { useOrderFilterStore } from "../store.ts";

/**
 * 這個元件**只負責呈現**（D14）。
 *
 * 取數、快取 key、後備值全在 `useOrderList` 裡 —— 元件不得直接 import
 * `@tanstack/vue-query` 或本切片的 `api.ts`，這條由一致性檢查強制。
 *
 * 注意傳給 composable 的是 **getter 而不是 `filter.query` 的當下值**：
 * 傳值會讓篩選條件變動後查詢不重跑，畫面停在舊資料上且不報錯。
 */
const filter = useOrderFilterStore();
const { orders, isPending, isError, error } = useOrderList(() => filter.query);

const currency = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
});
</script>

<template>
  <section class="order-list">
    <header class="flex items-center justify-between gap-4">
      <h1 class="text-xl font-semibold text-gray-900">{{ $t("order.title") }}</h1>
      <UiButton variant="primary" size="sm">{{ $t("order.title") }}</UiButton>
    </header>

    <p v-if="isPending">…</p>

    <!--
      錯誤訊息一律以文字插值輸出，絕不使用 v-html。
      伺服器回傳的錯誤內容可能含使用者輸入，v-html 會讓它變成 XSS 入口。
      這條由 Tier 2 的 vue/no-v-html 強制（oxlint 沒有該規則）。
    -->
    <p v-else-if="isError" role="alert">{{ error?.message }}</p>

    <p v-else-if="orders.length === 0">{{ $t("order.empty") }}</p>

    <table v-else>
      <thead>
        <tr>
          <th>#</th>
          <th>Customer</th>
          <th>Total</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td>{{ order.id }}</td>
          <td>{{ order.customerName }}</td>
          <td>{{ currency.format(order.totalCents / 100) }}</td>
          <td>{{ $t(`order.status.${order.status}`) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.order-list table {
  border-collapse: collapse;
  width: 100%;
}

.order-list th,
.order-list td {
  border-bottom: 1px solid #ddd;
  padding: 0.5rem 0.75rem;
  text-align: left;
}
</style>
