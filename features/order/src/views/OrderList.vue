<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

import { fetchOrders, orderKeys } from "../api.ts";
import { useOrderFilterStore } from "../store.ts";

const filter = useOrderFilterStore();

const { data, isPending, isError, error } = useQuery({
  queryKey: computed(() => orderKeys.list(filter.query)),
  queryFn: () => fetchOrders(filter.query),
});

const orders = computed(() => data.value?.items ?? []);

const currency = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
});
</script>

<template>
  <section class="order-list">
    <h1>{{ $t("order.title") }}</h1>

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
