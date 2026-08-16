import type { RouteRecordRaw } from "vue-router";

import { isValidSliceDir } from "./contract.ts";

/**
 * 切片對外的**唯一**公開契約（D7）。
 *
 * 新增一個切片 ＝ 在 apps/<app>/src/features.ts 加一行 import 與一個陣列項目。
 * 全靜態 import：SAST 追得到進入點、bundler tree-shake 得掉、CODEOWNERS 管得住。
 *
 * 刻意**不**使用 import.meta.glob 自動掛載 —— 動態 glob 會讓 Sonar/Checkmarx
 * 的資料流分析在切片進入點斷掉，且 tree-shaking 失效（D7）。
 */

export interface FeatureMenuItem {
  /** 顯示用的 i18n key，必須落在本切片的命名空間下。 */
  readonly labelKey: string;
  /** 對應的路由 name，必須落在本切片的命名空間下。 */
  readonly routeName: string;
  readonly icon?: string;
  readonly order?: number;
  /** 看得到這個選項所需的權限碼。空陣列代表不限制。 */
  readonly permissions?: readonly string[];
}

export interface Feature {
  /** 切片名。同時是路由、store、i18n、權限碼的命名空間前綴。 */
  readonly name: string;
  readonly routes: readonly RouteRecordRaw[];
  /** 本切片使用到的權限碼，全部必須以 `<name>:` 開頭。 */
  readonly permissions: readonly string[];
  /** 本切片的翻譯。頂層 key 為 locale，其下必須只有 `<name>` 一個 key。 */
  readonly i18n: Readonly<Record<string, Record<string, unknown>>>;
  readonly menu: readonly FeatureMenuItem[];
}

class FeatureContractError extends Error {
  constructor(featureName: string, message: string) {
    super(`[feature:${featureName}] ${message}`);
    this.name = "FeatureContractError";
  }
}

/**
 * 命名空間隔離是切片不互相踩踏的**唯一**保證。
 *
 * 型別擋得住結構，擋不住「路由叫 /list、store 叫 useListStore」這種
 * 兩個團隊撞名的情況。所以這裡在執行期把命名空間驗到底 ——
 * dev 模式當場拋錯，讓違規在寫的當下就被發現，而不是兩個切片同時載入時才炸。
 */
function assertNamespaced(feature: Feature): void {
  const { name } = feature;

  if (!isValidSliceDir(name)) {
    throw new FeatureContractError(name, `切片名必須是 kebab-case，收到 "${name}"`);
  }

  const walkRoutes = (routes: readonly RouteRecordRaw[], depth = 0): void => {
    for (const route of routes) {
      if (typeof route.name === "string" && !route.name.startsWith(`${name}/`)) {
        throw new FeatureContractError(
          name,
          `路由 name "${route.name}" 未落在命名空間下，應為 "${name}/${route.name}"`,
        );
      }
      // 只驗最外層路徑；巢狀路由的 path 相對於父層，不該再加前綴。
      if (depth === 0 && route.path.startsWith("/") && !route.path.startsWith(`/${name}`)) {
        throw new FeatureContractError(name, `頂層路由 path "${route.path}" 未落在 /${name} 之下`);
      }
      if (route.children) walkRoutes(route.children, depth + 1);
    }
  };
  walkRoutes(feature.routes);

  for (const permission of feature.permissions) {
    if (!permission.startsWith(`${name}:`)) {
      throw new FeatureContractError(
        name,
        `權限碼 "${permission}" 未落在命名空間下，應為 "${name}:${permission}"`,
      );
    }
  }

  for (const [locale, messages] of Object.entries(feature.i18n)) {
    const keys = Object.keys(messages);
    if (keys.length !== 1 || keys[0] !== name) {
      throw new FeatureContractError(
        name,
        `i18n["${locale}"] 的頂層 key 必須恰好是 "${name}"，收到 [${keys.join(", ")}]`,
      );
    }
  }

  for (const item of feature.menu) {
    if (!item.labelKey.startsWith(`${name}.`)) {
      throw new FeatureContractError(name, `選單 labelKey "${item.labelKey}" 未落在命名空間下`);
    }
    if (!item.routeName.startsWith(`${name}/`)) {
      throw new FeatureContractError(name, `選單 routeName "${item.routeName}" 未落在命名空間下`);
    }
  }
}

export function defineFeature(feature: Feature): Feature {
  // production bundle 不需要這段 —— 違規在 dev 與 CI 就會被攔下，
  // 帶進 production 只是增加 bundle 體積與啟動成本。
  if (import.meta.env.DEV) {
    assertNamespaced(feature);
  }
  return feature;
}
