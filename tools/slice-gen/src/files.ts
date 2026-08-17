import { slicePackageName, toPascalCase, toCamelCase, type FileTree } from "./contract-shape.ts";

export interface SliceOptions {
  /** 切片目錄名，kebab-case。同時是路由、store、i18n、權限碼的命名空間。 */
  readonly name: string;
  /** 顯示名稱，用於 i18n 與側邊欄。 */
  readonly title: string;
  /** CODEOWNERS 的負責團隊，例如 @org/team-fulfillment。 */
  readonly team: string;
}

/**
 * 產生一個符合契約的切片。
 *
 * 產出的每一項都對應 `@org/slice-kit/contract` 的一條規則 ——
 * 產生器不是「給個起點就好」，它產出的形狀就是一致性檢查會驗的形狀。
 */
export function buildSliceFiles(options: SliceOptions): FileTree {
  const { name, title, team } = options;
  const Pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  const pkgName = slicePackageName(name);

  return {
    // key 順序刻意對齊 oxfmt 的正規順序（description 在 type 之前）。
    // 產生後仍會跑一次 `vp fmt`（見 template.ts 的 scripts）—— 手工對齊
    // formatter 規則很脆弱，那道 fmt 才是保證；這裡對齊只是讓 diff 乾淨。
    "package.json":
      JSON.stringify(
        {
          name: pkgName,
          version: "0.0.0",
          private: true,
          description: title,
          type: "module",
          exports: { ".": "./src/index.ts" },
          scripts: { test: "vp test", check: "vp check" },
          // 一律 workspace: / catalog: —— 寫死版本會被一致性檢查擋下（D6）。
          dependencies: {
            "@org/http-client": "workspace:*",
            "@org/slice-kit": "workspace:*",
            // D15：畫面元件一律從 @org/ui 取用。一致性檢查會驗切片**真的用過**它 ——
            // 只是宣告依賴不算，只是不用也不行。
            "@org/ui": "workspace:*",
            "@tanstack/vue-query": "catalog:",
            pinia: "catalog:",
            vue: "catalog:",
            "vue-router": "catalog:",
          },
          devDependencies: {
            "@org/tsconfig": "workspace:*",
            typescript: "catalog:",
            vite: "catalog:",
            "vite-plus": "catalog:",
            vitest: "catalog:",
          },
        },
        null,
        2,
      ) + "\n",

    // 以字面字串輸出而非 JSON.stringify：oxfmt 會把短陣列收成單行，
    // stringify 的多行陣列每次都會被改寫，讓「產完直接 check 就過」不成立。
    "tsconfig.json": `{
  "extends": "@org/tsconfig/lib.json",
  "include": ["src", "tests"]
}
`,

    "README.md": `# ${pkgName}

${title}

**Owner**：\`${team}\`（見根目錄 \`CODEOWNERS\`）

## 邊界

這個切片**不得**依賴任何其他 \`features/*\`。三層防護會擋下：

1. \`tools/conformance\` 讀 \`package.json\`（Tier 2，繞不過的底線）
2. oxlint \`no-restricted-imports\`（Tier 1，擋裸模組名）
3. \`tools/conformance\` 精確路徑解析（Tier 2，擋相對路徑逃逸）

需要與其他切片互動時只有兩條合法路徑：往上到 \`apps/\` 層組裝，
或往下把共用契約抽到 \`platform/\`。

切片**之內**還有第四層（D14）：\`src/views/\` 與 \`src/store.ts\` 不得直接碰資料層。

## 設計系統（D15）

畫面元件一律從 \`@org/ui\` 取用。一致性檢查驗的是**兩個方向**：

| 規則                                            | 防的是什麼                                       |
| ----------------------------------------------- | ------------------------------------------------ |
| 不得直接 import \`reka-ui\`／\`clsx\`／\`tailwind-merge\` | 繞過 \`@org/ui\` 自己拼基元                        |
| 整個切片**至少一處**使用 \`@org/ui\`              | 根本不用 —— 全部自己刻，一條規則都不會 violate    |

第二條才是實際上比較常發生的那一種。要的元件 \`@org/ui\` 沒有，
就把它加進 \`platform/ui\` —— 那個 package 有 CODEOWNERS 與 api-surface 閘門，
切片沒有。

## 結構

| 檔案               | 職責                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| \`src/index.ts\`     | 對外的唯一公開契約（\`defineFeature\`）                                           |
| \`src/routes.ts\`    | 本切片的路由樹，\`/${name}\` 之下、name 以 \`${name}/\` 開頭                          |
| \`src/api.ts\`       | 資料存取。一律走 \`@org/http-client\`，禁止直接用 fetch/axios                     |
| \`src/composables/\` | \`useXxx()\` —— 取數、快取 key、後備值。**有狀態的邏輯住這裡**（D14）             |
| \`src/store.ts\`     | Pinia。只放**客戶端才是權威**的東西：篩選條件、選取的 id。**存 id 不存 entity**  |
| \`src/views/\`       | 畫面元件，**只負責呈現**。不得直接 import \`@tanstack/vue-query\` 或 \`api.ts\`     |
| \`tests/\`           | 本切片的測試。一致性檢查要求至少一支                                            |

> 「這份資料如果和伺服器不一致，誰是錯的？」
> 伺服器是權威 → \`composables/\`；客戶端是權威 → \`store.ts\`；
> 兩者都不是（例如「選取的那幾筆物件」）→ 哪裡都不放，用 \`computed\` 推導。

## 命名空間

\`defineFeature\` 會在 dev 模式驗證下列全部落在 \`${name}\` 命名空間下，違規當場拋錯：

- 路由 \`name\` → \`${name}/*\`
- 頂層路由 \`path\` → \`/${name}*\`
- 權限碼 → \`${name}:*\`
- i18n 頂層 key → 恰好只有 \`${name}\`
- TanStack Query key → 第一段為 \`${name}\`

## 開發

\`\`\`bash
vp run ${pkgName}#test
\`\`\`
`,

    src: {
      "env.d.ts": `/// <reference types="vite/client" />

// Vue 單檔元件的型別橋接：tsgolint 不認識 .vue 副檔名。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
`,

      "api.ts": `import { http } from "@org/http-client";

/**
 * 本切片的資料存取層。
 *
 * 切片被禁止直接 import axios/fetch —— 一律走 @org/http-client，
 * CSRF 標頭與錯誤處理才會全 repo 一致，稽核時才證明得出來（D8）。
 */

export interface ${Pascal}Item {
  readonly id: string;
  // TODO: 補上這個切片實際的欄位
}

export interface ${Pascal}ListResponse {
  readonly items: readonly ${Pascal}Item[];
  readonly total: number;
}

export interface ${Pascal}ListQuery {
  readonly page?: number;
}

export function fetch${Pascal}List(query: ${Pascal}ListQuery = {}): Promise<${Pascal}ListResponse> {
  const search = query.page === undefined ? "" : \`?page=\${String(query.page)}\`;
  return http.get<${Pascal}ListResponse>(\`/${name}\${search}\`);
}

/**
 * TanStack Query 的 key 命名空間。
 * 第一段固定是切片名，兩個切片的快取因此不可能互相污染。
 */
export const ${camel}Keys = {
  all: ["${name}"] as const,
  list: (query: ${Pascal}ListQuery) => ["${name}", "list", query] as const,
  detail: (id: string) => ["${name}", "detail", id] as const,
} as const;
`,

      "store.ts": `import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * 切片內的 Pinia store（D13 / D14）。
 *
 * store id 用 "${name}/" 命名空間前綴，且定義在切片內部 ——
 * **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現，兩個切片就會開始共用狀態，邊界當場失效。
 *
 * ── 這裡只放「客戶端才是權威」的東西 ───────────────────────────────────
 *
 * 判準：*這份資料如果和伺服器不一致，誰是錯的？*
 *
 *   伺服器是權威（列表資料本身）  → composables/use${Pascal}List.ts
 *   客戶端是權威（篩選、選取的 id）→ 這裡
 *   兩者都不是（選取的那幾筆物件）→ 哪裡都不放，用 computed 推導
 *
 * 一句話：**存 id，不存 entity。**
 * 一致性檢查會擋下 value import \`./api.ts\` 與 \`@tanstack/vue-query\`；
 * \`import type\` 允許（在 verbatimModuleSyntax 下會被完全抹除，無執行期效果）。
 */
export const use${Pascal}FilterStore = defineStore("${name}/filter", () => {
  const page = ref(1);

  /**
   * 被選取的那一筆 —— 只存 id。
   *
   * 這裡刻意**不放** \`selected${Pascal}Item\` 物件。放了就是第二份快取：
   * 列表重新整理之後對話框裡還是舊資料，而且不會有任何測試變紅。
   * 要那筆物件的時候，在元件裡用 \`computed\` 從列表推導（見 views/）。
   */
  const selectedId = ref<string | null>(null);

  const query = computed(() => ({ page: page.value }));

  function setPage(next: number): void {
    page.value = next;
  }

  function select(id: string | null): void {
    selectedId.value = id;
  }

  return { page, selectedId, query, setPage, select };
});
`,

      "routes.ts": `import type { RouteRecordRaw } from "vue-router";

/**
 * 本切片自己的路由樹，不碰任何共用 router 檔案（D7）。
 *
 * path 一律在 /${name} 之下、name 一律以 "${name}/" 開頭 ——
 * defineFeature 會在 dev 模式當場驗證，撞名不可能活到執行期。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: "/${name}",
    name: "${name}/list",
    component: () => import("./views/${Pascal}List.vue"),
    meta: { permissions: ["${name}:read"] },
  },
];
`,

      "index.ts": `import { defineFeature } from "@org/slice-kit";

import { routes } from "./routes.ts";

/**
 * ${title}切片對外的**唯一**公開契約（D7）。
 *
 * apps/<app>/src/features.ts 只 import 這個 default export ——
 * 新增一個切片 ＝ 改一個檔案、加一行。
 */
export default defineFeature({
  name: "${name}",

  routes,

  permissions: ["${name}:read"],

  i18n: {
    "zh-TW": {
      ${name === camel ? name : `"${name}"`}: {
        title: "${title}",
        empty: "目前沒有資料",
        detail: "明細",
        detailDescription: "這一筆的完整內容",
        close: "關閉",
      },
    },
    en: {
      ${name === camel ? name : `"${name}"`}: {
        title: "${Pascal}",
        empty: "No data",
        detail: "Detail",
        detailDescription: "Full contents of this record",
        close: "Close",
      },
    },
  },

  menu: [
    {
      labelKey: "${name}.title",
      routeName: "${name}/list",
      order: 100,
      permissions: ["${name}:read"],
    },
  ],
});

export type { ${Pascal}Item, ${Pascal}ListResponse } from "./api.ts";
`,

      composables: {
        [`use${Pascal}List.ts`]: `import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from "vue";

import { fetch${Pascal}List, ${camel}Keys, type ${Pascal}Item, type ${Pascal}ListQuery } from "../api.ts";

/**
 * 本切片的取數邏輯（D14）。
 *
 * **元件只負責呈現，有狀態的邏輯住在這裡。** 一致性檢查會擋下
 * 直接在 views/ 裡 import \`@tanstack/vue-query\` 或 \`../api.ts\` 的寫法。
 *
 * 照 Vue 官方 composable 的三條慣例（vuejs.org/guide/reusability/composables）：
 *
 * 1. 輸入接受 ref／getter／純值，一律用 \`toValue()\` 正規化
 * 2. 回傳 ref 組成的**普通物件**（回傳 \`reactive()\` 的話，解構就斷開響應性）
 * 3. 只在 setup 期間同步呼叫
 *
 * ⚠️ queryKey 包 \`computed\` 是必要的：傳靜態值的話，條件變了不會重新取數，
 * 畫面停在舊資料上而且不報錯。
 */
export interface Use${Pascal}ListResult {
  readonly items: ComputedRef<readonly ${Pascal}Item[]>;
  readonly total: ComputedRef<number>;
  readonly isPending: Ref<boolean>;
  readonly isError: Ref<boolean>;
  readonly error: Ref<Error | null>;
}

export function use${Pascal}List(
  query: MaybeRefOrGetter<${Pascal}ListQuery> = {},
): Use${Pascal}ListResult {
  const current = computed(() => toValue(query));

  const { data, isPending, isError, error } = useQuery({
    queryKey: computed(() => ${camel}Keys.list(current.value)),
    queryFn: () => fetch${Pascal}List(current.value),
  });

  return {
    items: computed(() => data.value?.items ?? []),
    total: computed(() => data.value?.total ?? 0),
    isPending,
    isError,
    error,
  };
}
`,
      },

      views: {
        [`${Pascal}List.vue`]: `<script setup lang="ts">
import { computed } from "vue";
import { UiButton, UiDialog } from "@org/ui";
import { use${Pascal}List } from "../composables/use${Pascal}List.ts";
import { use${Pascal}FilterStore } from "../store.ts";

/**
 * 這個元件**只負責呈現**（D14）。取數在 composables/use${Pascal}List.ts。
 *
 * 注意傳的是 **getter 而不是當下值** —— 傳值會讓條件變動後查詢不重跑。
 *
 * 畫面元件一律從 \`@org/ui\` 取用（D15）。一致性檢查會驗這個切片**真的用過**它：
 * 自己刻一顆按鈕不會違反任何一條規則，但第二個團隊也刻一顆之後，
 * 兩套永遠不會收斂 —— 而且兩邊各自看起來都是對的。
 */
const filter = use${Pascal}FilterStore();
const { items, isPending, isError, error } = use${Pascal}List(() => filter.query);

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
    <h1 class="text-xl font-semibold text-gray-900">{{ $t("${name}.title") }}</h1>

    <p v-if="isPending">…</p>

    <!--
      錯誤訊息一律以文字插值輸出，絕不使用 v-html。
      伺服器回傳的內容可能含使用者輸入，v-html 會讓它變成 XSS 入口。
      這條由 Tier 2 的 vue/no-v-html 強制（oxlint 沒有該規則）。
    -->
    <p v-else-if="isError" role="alert">{{ error?.message }}</p>

    <p v-else-if="items.length === 0">{{ $t("${name}.empty") }}</p>

    <ul v-else class="mt-4 flex flex-col gap-2">
      <li v-for="item in items" :key="item.id" class="flex items-center justify-between gap-4">
        <span>{{ item.id }}</span>
        <UiButton size="sm" @click="filter.select(item.id)">
          {{ $t("${name}.detail") }}
        </UiButton>
      </li>
    </ul>

    <!-- 對話框的內容由 \`selected\` 推導 —— D14 那條「存 id 不存 entity」在畫面上的樣子。 -->
    <UiDialog
      v-model:open="isOpen"
      :title="$t('${name}.detail')"
      :description="$t('${name}.detailDescription')"
    >
      <dl v-if="selected" class="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt class="text-fg-muted">#</dt>
        <dd>{{ selected.id }}</dd>
        <!-- TODO: 補上這個切片實際的欄位（與 api.ts 的 ${Pascal}Item 對齊） -->
      </dl>

      <template #close>
        <UiButton>{{ $t("${name}.close") }}</UiButton>
      </template>
    </UiDialog>
  </section>
</template>
`,
      },
    },

    tests: {
      [`${name}.test.ts`]: `import { describe, it, expect } from "vitest";

import feature from "../src/index.ts";
import { ${camel}Keys } from "../src/api.ts";

/**
 * 切片的測試住在切片內。一致性檢查要求每個 features/* 至少有一支
 * tests/**\\/*.test.ts —— 沒有測試的切片＝沒有人能安全重構的切片。
 */

describe("${name} 切片契約", () => {
  it("所有路由 name 落在自己的命名空間下", () => {
    for (const route of feature.routes) {
      expect(route.name).toMatch(/^${name}\\//);
    }
  });

  it("所有權限碼落在自己的命名空間下", () => {
    for (const permission of feature.permissions) {
      expect(permission).toMatch(/^${name}:/);
    }
  });

  it("每個 locale 的 i18n 頂層 key 恰好只有 ${name}", () => {
    for (const messages of Object.values(feature.i18n)) {
      expect(Object.keys(messages)).toEqual(["${name}"]);
    }
  });

  it("選單項目指向本切片實際存在的路由", () => {
    const routeNames = new Set(feature.routes.map((route) => route.name));
    for (const item of feature.menu) {
      expect(routeNames.has(item.routeName)).toBe(true);
    }
  });
});

describe("query key 命名空間", () => {
  it("所有 key 以切片名開頭，兩個切片的快取不可能互相污染", () => {
    expect(${camel}Keys.all[0]).toBe("${name}");
    expect(${camel}Keys.list({})[0]).toBe("${name}");
    expect(${camel}Keys.detail("x")[0]).toBe("${name}");
  });
});
`,
    },
  };
}
