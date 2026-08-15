<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

import { fetchShipmentList, shipmentKeys } from "../api.ts";

const { data, isPending, isError, error } = useQuery({
  queryKey: shipmentKeys.list(),
  queryFn: fetchShipmentList,
});

const items = computed(() => data.value?.items ?? []);
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
