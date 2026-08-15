<script setup lang="ts">
import { computed } from "vue";
import { UiButton, UiDialog } from "@org/ui";
import { useShipmentList } from "../composables/useShipmentList.ts";
import { useShipmentFilterStore } from "../store.ts";

/**
 * 這個元件**只負責呈現**（D14）。取數在 composables/useShipmentList.ts。
 *
 * 注意傳的是 **getter 而不是當下值** —— 傳值會讓條件變動後查詢不重跑。
 *
 * 畫面元件一律從 `@org/ui` 取用（D15）。一致性檢查會驗這個切片**真的用過**它：
 * 自己刻一顆按鈕不會違反任何一條規則，但第二個團隊也刻一顆之後，
 * 兩套永遠不會收斂 —— 而且兩邊各自看起來都是對的。
 */
const filter = useShipmentFilterStore();
const { items, isPending, isError, error } = useShipmentList(() => filter.query);

/**
 * 被選取的那一筆 —— **從列表推導，不從 store 讀**（D14）。
 * store 裡只有一個 id；把物件也存進去就是第二份快取。
 */
const selected = computed(() => items.value.find((item) => item.id === filter.selectedId));

const isOpen = computed({
  get: () => selected.value !== undefined,
  set: (open: boolean) => {
    if (!open) filter.select(null);
  },
});
</script>

<template>
  <section>
    <h1 class="text-xl font-semibold text-gray-900">{{ $t("shipment.title") }}</h1>

    <p v-if="isPending">…</p>

    <!--
      錯誤訊息一律以文字插值輸出，絕不使用 v-html。
      伺服器回傳的內容可能含使用者輸入，v-html 會讓它變成 XSS 入口。
      這條由 Tier 2 的 vue/no-v-html 強制（oxlint 沒有該規則）。
    -->
    <p v-else-if="isError" role="alert">{{ error?.message }}</p>

    <p v-else-if="items.length === 0">{{ $t("shipment.empty") }}</p>

    <ul v-else class="mt-4 flex flex-col gap-2">
      <li v-for="item in items" :key="item.id" class="flex items-center justify-between gap-4">
        <span>{{ item.id }}</span>
        <UiButton size="sm" @click="filter.select(item.id)">
          {{ $t("shipment.detail") }}
        </UiButton>
      </li>
    </ul>

    <!-- 對話框的內容由 `selected` 推導 —— D14 那條「存 id 不存 entity」在畫面上的樣子。 -->
    <UiDialog
      v-model:open="isOpen"
      :title="$t('shipment.detail')"
      :description="$t('shipment.detailDescription')"
    >
      <dl v-if="selected" class="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt class="text-(--color-muted)">#</dt>
        <dd>{{ selected.id }}</dd>
        <!-- TODO: 補上這個切片實際的欄位（與 api.ts 的 ShipmentItem 對齊） -->
      </dl>

      <template #close>
        <UiButton>{{ $t("shipment.close") }}</UiButton>
      </template>
    </UiDialog>
  </section>
</template>
