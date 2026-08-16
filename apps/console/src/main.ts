import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import { createI18n } from "vue-i18n";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { registerFeatures } from "@org/slice-kit";
import { config } from "@org/config";
import { createUiTheme } from "@org/ui";

// 這個案子的樣式入口。它自己第一行才是 `@import "@org/ui/styles.css"` ——
// D15 的基礎版型仍然先載入（Tailwind 的 base reset 必須在元件樣式之前），
// 差別是各案的代幣覆寫現在有地方可放，不必去改 platform/ui（HANDOFF #24）。
import "./styles.css";

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

/**
 * 元件形狀的覆寫（HANDOFF #24 的第二條軸）。
 *
 * 代幣換得掉值，換不掉**組合** —— 這個案子的預設按鈕不要外框，改成淺底色。
 * 那不是任何一個代幣，它是 `VARIANTS.secondary` 那一整條字串。
 *
 * ⚠️ 類別字串必須寫在 `.ts` 或 `.vue` 裡。`platform/ui` 的 `@source` 只掃這兩種
 * 副檔名，搬進 JSON 或環境變數的話 Tailwind **掃不到、也不會報錯**，
 * 產出的 CSS 少掉這些類別而建置全綠。同樣是示範，開新案子時照需求改。
 *
 * ⚠️ **這個示範刻意保留了外框。** 第一版寫的是
 * `"bg-surface-hover text-fg hover:bg-surface-ghost-hover"` —— 拿掉
 * `border-control border-line`，用一層很淡的底色當邊界。那在**文字**對比上
 * 沒問題，但元件的**邊界**對比只有約 1.05:1，而 WCAG 1.4.11（非文字對比）
 * 要求 3:1。
 *
 * 那正是 HANDOFF #22 點名「靜態閘門看不見」的四個行為面缺口之一 ——
 * 也就是說沒有任何東西會為此變紅。而這份 app 是每個案子 fork 的起點，
 * 一個示範用的覆寫不該順便示範一個無障礙缺陷。
 */
const uiTheme = createUiTheme({
  variants: { secondary: "border-control border-accent bg-surface text-fg hover:bg-surface-hover" },
});

createApp(App)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .use(VueQueryPlugin)
  .use(uiTheme)
  .provide("features", registered)
  .mount("#app");
