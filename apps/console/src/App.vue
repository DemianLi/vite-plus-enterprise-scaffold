<script setup lang="ts">
import { inject } from "vue";
import type { RegisteredFeatures } from "@org/slice-kit";

const registered = inject<RegisteredFeatures>("features");
</script>

<template>
  <div class="shell">
    <nav>
      <ul>
        <!--
          側邊欄由各切片自己宣告的 menu 組成（D7）。
          apps/ 不知道任何一個切片的內部細節，只知道它們都符合 Feature 契約。
        -->
        <li v-for="item in registered?.menu ?? []" :key="item.routeName">
          <RouterLink :to="{ name: item.routeName }">{{ $t(item.labelKey) }}</RouterLink>
        </li>
      </ul>
    </nav>

    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 12rem 1fr;
  gap: 1.5rem;
  min-height: 100vh;
}

nav ul {
  list-style: none;
  margin: 0;
  padding: 1rem;
}
</style>
