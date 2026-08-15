import type { RouteRecordRaw } from "vue-router";
import type { Feature, FeatureMenuItem } from "./define-feature.ts";

export interface RegisteredFeatures {
  readonly routes: readonly RouteRecordRaw[];
  readonly messages: Readonly<Record<string, Record<string, unknown>>>;
  readonly menu: readonly FeatureMenuItem[];
  readonly permissions: readonly string[];
  readonly names: readonly string[];
}

/**
 * apps/ 的 composition root（D4）。
 *
 * 這是**唯一**知道系統裡有哪些切片的地方。切片本身彼此不可見 ——
 * 這正是 features/* 禁止互相依賴那條規則想保住的性質。
 */
export function registerFeatures(features: readonly Feature[]): RegisteredFeatures {
  const seen = new Set<string>();
  for (const feature of features) {
    if (seen.has(feature.name)) {
      throw new Error(`[feature-kit] 切片名重複註冊："${feature.name}"`);
    }
    seen.add(feature.name);
  }

  const routes: RouteRecordRaw[] = [];
  const messages: Record<string, Record<string, unknown>> = {};
  const menu: FeatureMenuItem[] = [];
  const permissions = new Set<string>();

  for (const feature of features) {
    routes.push(...feature.routes);
    menu.push(...feature.menu);
    for (const permission of feature.permissions) permissions.add(permission);

    for (const [locale, localeMessages] of Object.entries(feature.i18n)) {
      // defineFeature 已驗過每個切片的 i18n 只有自己的命名空間，
      // 所以這裡的合併不可能覆蓋到別片的翻譯。
      messages[locale] = { ...messages[locale], ...localeMessages };
    }
  }

  menu.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));

  return {
    routes,
    messages,
    menu,
    permissions: [...permissions].sort(),
    names: features.map((f) => f.name),
  };
}
