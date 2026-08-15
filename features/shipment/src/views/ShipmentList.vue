<script setup lang="ts">
import { useShipmentList } from "../composables/useShipmentList.ts";
import { useShipmentFilterStore } from "../store.ts";

/**
 * 這個元件**只負責呈現**（D14）。取數在 composables/useShipmentList.ts。
 *
 * 注意傳的是 **getter 而不是當下值** —— 傳值會讓條件變動後查詢不重跑。
 */
const filter = useShipmentFilterStore();
const { items, isPending, isError, error } = useShipmentList(() => filter.query);
</script>

<template>
  <section>
    <h1>{{ $t("shipment.title") }}</h1>

    <p v-if="isPending">…</p>

    <!--
      錯誤訊息一律以文字插值輸出，絕不使用 v-html。
      伺服器回傳的內容可能含使用者輸入，v-html 會讓它變成 XSS 入口。
      這條由 Tier 2 的 vue/no-v-html 強制（oxlint 沒有該規則）。
    -->
    <p v-else-if="isError" role="alert">{{ error?.message }}</p>

    <p v-else-if="items.length === 0">{{ $t("shipment.empty") }}</p>

    <ul v-else>
      <li v-for="item in items" :key="item.id">{{ item.id }}</li>
    </ul>
  </section>
</template>
