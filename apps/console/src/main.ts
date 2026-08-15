import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import { createI18n } from "vue-i18n";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { registerFeatures } from "@org/slice-kit";
import { config } from "@org/config";

import App from "./App.vue";
import { features } from "./features.ts";

/**
 * Composition root（D4）。
 *
 * apps/ 是薄殼：只做路由組裝、環境設定、外掛註冊。
 * 任何業務邏輯出現在這裡，都代表某個切片的邊界劃錯了。
 */
const registered = registerFeatures(features);

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", redirect: registered.routes[0]?.path ?? "/" }, ...registered.routes],
});

// 翻譯訊息由各切片自帶、在此合併（D7）。
// defineFeature 已驗過每片的 i18n 只含自己的命名空間，所以合併不可能互相覆蓋。
const i18n = createI18n({
  legacy: false,
  locale: "zh-TW",
  fallbackLocale: "en",
  // vue-i18n 的 messages 型別是由字面值推導的巢狀結構，無法表達「切片在執行期
  // 合併而成」這件事。registerFeatures 的回傳型別已保證它是
  // Record<locale, Record<featureName, ...>>，此處的斷言只是跨過型別推導的限制。
  messages: registered.messages as Record<string, Record<string, string>>,
});

document.title = config.appTitle;

createApp(App)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .use(VueQueryPlugin)
  .provide("features", registered)
  .mount("#app");
