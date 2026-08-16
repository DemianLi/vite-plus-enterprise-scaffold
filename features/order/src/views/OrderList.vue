<script setup lang="ts">
import { computed } from "vue";
import { UiButton, UiDialog } from "@org/ui";
import { maskName } from "@org/pii";
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

/**
 * 被選取的那一筆 —— **從列表推導，不從 store 讀**（D14）。
 *
 * store 只存 id。把 Order 物件也存進去就是第二份快取：列表重新整理之後
 * 對話框裡還是舊資料，而且不會有任何測試變紅。
 */
const selected = computed(() => orders.value.find((order) => order.id === filter.selectedId));

const isOpen = computed({
  get: () => selected.value !== undefined,
  set: (open: boolean) => {
    if (!open) filter.select(null);
  },
});

/**
 * 要公告給輔具的狀態訊息鍵，沒有的話是 `null`。
 *
 * ⚠️ 這支 computed 存在的理由是 **live region 的時序**，不是版面：
 * `aria-live` 的元素必須在文字變化**之前**就已經在 DOM 裡，瀏覽器才會朗讀。
 * 原本寫的是 `<p v-if="isPending">…</p>` —— 元素與文字同時出現，視覺上完全
 * 正確，但輔具那邊很可能一個字都沒有。回傳 `null` 時模板仍然渲染一個空的
 * `role="status"`，那個空元素就是這件事的重點。
 *
 * ⚠️ 這一類缺陷**無障礙靜態閘門看不見**（見 platform/eslint-config/src/a11y.js）。
 * 原本那行 `<p v-if="isPending">…</p>` 連同一個 U+2026 當內容，23 條規則零命中。
 */
const statusKey = computed<string | null>(() => {
  if (isPending.value) return "order.loading";
  if (orders.value.length === 0) return "order.empty";
  return null;
});

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
    </header>

    <!--
      錯誤走 role="alert"、其餘狀態走 role="status"：alert 會打斷輔具當下的
      朗讀，而「查詢失敗」屬於要立刻知道的那一類；載入中與查無資料不是。

      錯誤訊息一律以文字插值輸出，絕不使用 v-html。
      伺服器回傳的錯誤內容可能含使用者輸入，v-html 會讓它變成 XSS 入口。
      這條由 Tier 2 的 vue/no-v-html 強制（oxlint 沒有該規則）。
    -->
    <p v-if="isError" role="alert">{{ error?.message }}</p>

    <!-- 沒有狀態時這裡是一個空的 <p>，而它必須留著 —— 理由見 statusKey 的註解。 -->
    <p v-else role="status">{{ statusKey === null ? "" : $t(statusKey) }}</p>

    <table v-if="orders.length > 0">
      <!--
        caption 與最後一欄的表頭都是 sr-only：畫面上不變，但用表格模式瀏覽的
        輔具使用者才知道自己在哪張表、最後一欄是什麼。
        原本最後一欄是 `<th />` —— 一個朗讀出來是空白的表頭。
      -->
      <caption class="sr-only">
        {{
          $t("order.tableCaption")
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Customer</th>
          <th scope="col">Total</th>
          <th scope="col">Status</th>
          <th scope="col">
            <span class="sr-only">{{ $t("order.rowActions") }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td>{{ order.id }}</td>
          <!--
            客戶姓名在列表上隱碼。防的是內部人員（客服、營運）在日常作業畫面上
            看到完整個資，不是防使用者看自己的資料。
            ⚠️ 強制它的靜態閘門已移除（C52）—— 這裡是**慣例，不是機制**。
          -->
          <td>{{ maskName(order.customerName) }}</td>
          <td>{{ currency.format(order.totalCents / 100) }}</td>
          <td>{{ $t(`order.status.${order.status}`) }}</td>
          <td>
            <UiButton size="sm" @click="filter.select(order.id)">
              {{ $t("order.detail") }}
            </UiButton>
          </td>
        </tr>
      </tbody>
    </table>

    <!--
      對話框的內容由 `selected` 推導。它是 D14 那條「存 id 不存 entity」
      在畫面上的樣子：store 裡只有一個字串。
    -->
    <UiDialog
      v-model:open="isOpen"
      :title="$t('order.detail')"
      :description="$t('order.detailDescription')"
    >
      <dl v-if="selected" class="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt class="text-(--color-muted)">#</dt>
        <dd>{{ selected.id }}</dd>
        <dt class="text-(--color-muted)">Customer</dt>
        <!-- 明細也一樣。「點開就看得到完整的」等於沒有隱碼。 -->
        <dd>{{ maskName(selected.customerName) }}</dd>
        <dt class="text-(--color-muted)">Total</dt>
        <dd>{{ currency.format(selected.totalCents / 100) }}</dd>
        <dt class="text-(--color-muted)">Status</dt>
        <dd>{{ $t(`order.status.${selected.status}`) }}</dd>
      </dl>

      <template #close>
        <UiButton>{{ $t("order.close") }}</UiButton>
      </template>
    </UiDialog>
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
