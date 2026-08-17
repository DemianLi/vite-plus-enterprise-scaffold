<script setup lang="ts">
import { inject } from "vue";
import type { RegisteredFeatures } from "@org/slice-kit";

const registered = inject<RegisteredFeatures>("features");
</script>

<template>
  <div class="shell">
    <!--
      略過導覽（WCAG 2.4.1 的常見做法）。平時是 sr-only，拿到焦點才現形。
      沒有它的話，鍵盤使用者每換一頁都要先 Tab 過整條側邊欄才碰得到內容 ——
      而側邊欄的長度會隨切片數成長，所以這件事只會愈來愈糟。

      ⚠️ 這一段與下面的 aria-label **無障礙靜態閘門一個都看不到**
      （見 platform/eslint-config/src/a11y.js）：那 23 條規則比對的是原生元素
      與屬性，「這個頁面缺一個略過導覽的連結」不是任何一個元素的屬性問題。
    -->
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-surface focus:text-fg focus:px-4 focus:py-2"
    >
      {{ $t("shell.skipToContent") }}
    </a>

    <!--
      aria-label 而不是不寫：一個頁面出現第二個 <nav> 的那天（頁尾、麵包屑），
      輔具的地標清單上會是兩個都叫「navigation」的項目，而那時沒有人會想到
      要回來改這裡。字串走 i18n，理由見 main.ts 的 SHELL_MESSAGES。
    -->
    <nav :aria-label="$t('shell.nav')">
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

    <!--
      tabindex="-1" 是必要的，不是裝飾：少了它，`#main` 只會捲動畫面，
      焦點仍留在略過連結上 —— 於是下一次 Tab 又回到導覽的第一項，
      整個略過連結等於沒有作用。這個行為在 Chrome 與 Safari 上都會發生。
    -->
    <main id="main" tabindex="-1">
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
