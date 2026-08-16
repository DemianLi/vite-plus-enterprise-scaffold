import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import { createI18n } from "vue-i18n";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { registerFeatures } from "@org/slice-kit";
import { config } from "@org/config";

// D15 —— 設計系統的樣式入口。必須在應用自己的樣式之前載入，
// 否則 Tailwind 的 base reset 會蓋掉元件的樣式而不是被它覆蓋。
import "@org/ui/styles.css";

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

/**
 * 外殼自己的翻譯字串。
 *
 * ⚠️ 這個命名空間**只為了無障礙而存在**：`App.vue` 上那幾個「只給輔具看的」
 * 字串（導覽區域的名稱、跳至主要內容）不屬於任何一個切片，但它們必須是
 * 翻譯字串 —— 一個寫死中文的 `aria-label` 對切到英文的使用者就是一段噪音，
 * 而且畫面上看不到，所以不會有人回報。
 */
const SHELL_MESSAGES: Readonly<Record<string, Record<string, unknown>>> = {
  "zh-TW": { shell: { nav: "主要導覽", skipToContent: "跳至主要內容" } },
  en: { shell: { nav: "Main navigation", skipToContent: "Skip to main content" } },
};

/**
 * 切片的訊息（D7 由 registerFeatures 合併）再併上外殼自己的。
 *
 * `defineFeature` 已驗過每片的 i18n 只含自己的命名空間，所以切片之間不會互相
 * 覆蓋 —— 但**它管不到外殼**。名叫 `shell` 的切片會安靜地被這裡蓋掉，
 * 症狀是「某幾個字變成 key」，而那種問題查起來要很久。所以撞名直接丟例外。
 */
function withShellMessages(
  featureMessages: Readonly<Record<string, Record<string, unknown>>>,
): Record<string, Record<string, unknown>> {
  const merged: Record<string, Record<string, unknown>> = {};

  for (const locale of new Set([...Object.keys(featureMessages), ...Object.keys(SHELL_MESSAGES)])) {
    const fromFeatures = featureMessages[locale] ?? {};
    if ("shell" in fromFeatures) {
      throw new Error(
        `有切片佔用了 "shell" 這個 i18n 命名空間（locale: ${locale}）。` +
          "那是應用外殼保留的名字；請把該切片改名，或改用切片自己的名稱當命名空間。",
      );
    }
    merged[locale] = { ...fromFeatures, ...SHELL_MESSAGES[locale] };
  }

  return merged;
}

const i18n = createI18n({
  legacy: false,
  locale: "zh-TW",
  fallbackLocale: "en",
  // vue-i18n 的 messages 型別是由字面值推導的巢狀結構，無法表達「切片在執行期
  // 合併而成」這件事。registerFeatures 的回傳型別已保證它是
  // Record<locale, Record<featureName, ...>>，此處的斷言只是跨過型別推導的限制。
  messages: withShellMessages(registered.messages) as Record<string, Record<string, string>>,
});

document.title = config.appTitle;

createApp(App)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .use(VueQueryPlugin)
  .provide("features", registered)
  .mount("#app");
