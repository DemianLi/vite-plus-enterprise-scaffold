import { describe, it, expect } from "vitest";

import { defineFeature, registerFeatures } from "../src/index.ts";
import type { Feature } from "../src/index.ts";
import {
  IMPORT_SPECIFIER_PATTERN,
  composableFunctionName,
  isTypeOnlyImportAt,
  isValidComposableFile,
} from "../src/contract.ts";

/**
 * D7 契約的執行期驗證。
 *
 * 型別擋得住結構，擋不住「兩個切片的路由都叫 /list」這種撞名 ——
 * 那要到兩片同時載入才會炸，而且錯誤訊息會完全看不出是誰的錯。
 * 這裡把命名空間驗到底，讓違規在寫的當下就現形。
 */

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    name: "order",
    routes: [{ path: "/order", name: "order/list", component: {} }],
    permissions: ["order:read"],
    i18n: { "zh-TW": { order: { title: "訂單" } } },
    menu: [{ labelKey: "order.title", routeName: "order/list" }],
    // §11 II ⑨ 的宣告是必填的。它在這裡出現，本身就是那條規則的證據：
    // 少了它就是型別錯誤，而不是一個靜靜通過的預設值。
    personalData: [],
    ...overrides,
  };
}

describe("defineFeature 的命名空間驗證", () => {
  it("放行完全合規的切片", () => {
    expect(() => defineFeature(makeFeature())).not.toThrow();
  });

  it("擋下未加命名空間的路由 name", () => {
    expect(() =>
      defineFeature(makeFeature({ routes: [{ path: "/order", name: "list", component: {} }] })),
    ).toThrow(/路由 name/);
  });

  it("擋下落在其他切片路徑下的頂層路由", () => {
    expect(() =>
      defineFeature(
        makeFeature({ routes: [{ path: "/billing", name: "order/list", component: {} }] }),
      ),
    ).toThrow(/未落在 \/order 之下/);
  });

  it("允許巢狀路由使用相對 path（相對於父層，不該再加前綴）", () => {
    expect(() =>
      defineFeature(
        makeFeature({
          routes: [
            {
              path: "/order",
              name: "order/list",
              component: {},
              children: [{ path: "detail/:id", name: "order/detail", component: {} }],
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("擋下未加命名空間的權限碼", () => {
    expect(() => defineFeature(makeFeature({ permissions: ["read"] }))).toThrow(/權限碼/);
  });

  it("擋下洩漏到其他切片命名空間的 i18n", () => {
    expect(() =>
      defineFeature(makeFeature({ i18n: { "zh-TW": { order: {}, common: {} } } })),
    ).toThrow(/頂層 key/);
  });

  it("擋下未加命名空間的選單項目", () => {
    expect(() =>
      defineFeature(makeFeature({ menu: [{ labelKey: "title", routeName: "order/list" }] })),
    ).toThrow(/labelKey/);
  });

  it("擋下非 kebab-case 的切片名", () => {
    expect(() =>
      defineFeature(
        makeFeature({ name: "OrderHistory", routes: [], menu: [], permissions: [], i18n: {} }),
      ),
    ).toThrow(/kebab-case/);
  });
});

describe("registerFeatures 組裝", () => {
  const order = defineFeature(makeFeature());
  const billing = defineFeature({
    name: "billing",
    routes: [{ path: "/billing", name: "billing/list", component: {} }],
    permissions: ["billing:read"],
    i18n: { "zh-TW": { billing: { title: "帳務" } } },
    menu: [{ labelKey: "billing.title", routeName: "billing/list", order: 5 }],
    personalData: [],
  });

  it("合併多個切片的路由", () => {
    expect(registerFeatures([order, billing]).routes).toHaveLength(2);
  });

  it("合併 i18n 時不會互相覆蓋（每片只帶自己的命名空間）", () => {
    const messages = registerFeatures([order, billing]).messages;
    expect(Object.keys(messages["zh-TW"] ?? {}).sort()).toEqual(["billing", "order"]);
  });

  it("選單依 order 排序，未指定者排在最後", () => {
    expect(registerFeatures([order, billing]).menu.map((m) => m.routeName)).toEqual([
      "billing/list",
      "order/list",
    ]);
  });

  it("權限碼去重並排序", () => {
    expect(registerFeatures([order, billing]).permissions).toEqual(["billing:read", "order:read"]);
  });

  it("擋下重複註冊同一個切片名", () => {
    expect(() => registerFeatures([order, order])).toThrow(/重複註冊/);
  });
});

/**
 * D14 的命名規則。這些函式同時被一致性檢查與產生器的測試使用 ——
 * 契約裡的每個判定都該有測試，否則「單一事實來源」只是位置上的，不是行為上的。
 */
describe("composable 命名（D14）", () => {
  it("接受 Vue 官方慣例的形狀", () => {
    expect(isValidComposableFile("useOrderList.ts")).toBe(true);
    expect(isValidComposableFile("useOrder.ts")).toBe(true);
    expect(isValidComposableFile("useOrderListV2.ts")).toBe(true);
  });

  it("擋掉不是 composable 的東西", () => {
    // 這些放進 composables/ 通常代表作者其實想放的是工具函式或型別，
    // 而混在一起之後，「哪些必須在 setup 期間同步呼叫」就看不出來了。
    expect(isValidComposableFile("orderHelpers.ts")).toBe(false);
    expect(isValidComposableFile("use.ts")).toBe(false);
    expect(isValidComposableFile("uselessThing.ts")).toBe(false); // use 後面必須接大寫
    expect(isValidComposableFile("useOrderList.vue")).toBe(false);
    expect(isValidComposableFile("use-order-list.ts")).toBe(false);
  });

  it("由檔名推出應該匯出的函式名", () => {
    expect(composableFunctionName("useOrderList.ts")).toBe("useOrderList");
  });
});

/**
 * `isTypeOnlyImportAt` 是 D14 下半段唯一會誤傷人的地方。
 *
 * 誤擋 `import type` 的話，規則第一天就會被加例外 —— 而加過一次例外的規則，
 * 半年後就不再是規則。所以偽陽性的測試比「該紅會紅」的測試更重要。
 */
describe("type-only import 判定（D14）", () => {
  function firstSpecifierIndex(source: string): number {
    // 用 matchAll 而不是 `new RegExp(PATTERN.source, "g")` —— 後者被 Tier 2 的
    // `security/detect-non-literal-regexp` 擋下（實測，第 4 次有新程式碼撞上自己的
    // 安全閘門，見 C19）。原本複製一份是為了避開共用 g-flag 正則的 lastIndex 狀態，
    // 而 matchAll 本來就在內部複製，不會改動原 regex 的 lastIndex —— 更安全也更短。
    const [match] = [...source.matchAll(IMPORT_SPECIFIER_PATTERN)];
    if (match?.index === undefined) throw new Error("測試素材裡沒有 import");
    return match.index;
  }

  const typeOnly = [
    'import type { Order } from "./api.ts";',
    'import type {\n  Order,\n  OrderQuery,\n} from "./api.ts";',
    'export type { Order } from "./api.ts";',
  ];

  it.each(typeOnly)("認得 type-only import：%s", (source) => {
    expect(isTypeOnlyImportAt(source, firstSpecifierIndex(source))).toBe(true);
  });

  const valueImports = [
    'import { fetchOrders } from "./api.ts";',
    'import {\n  fetchOrders,\n} from "./api.ts";',
    'import { defineStore } from "pinia";',
    // verbatimModuleSyntax 之下這句仍會產出 `import "./api.ts"` —— 模組真的被載入，
    // 所以算成 value import 是正確的，不是偽陽性。
    'import { type Order } from "./api.ts";',
  ];

  it.each(valueImports)("認得 value import：%s", (source) => {
    expect(isTypeOnlyImportAt(source, firstSpecifierIndex(source))).toBe(false);
  });

  it("前面有其他 import 時，判定的是自己那一句", () => {
    const source = 'import { defineStore } from "pinia";\nimport type { Order } from "./api.ts";\n';
    const second = source.lastIndexOf('from "./api.ts"');
    expect(isTypeOnlyImportAt(source, second)).toBe(true);
  });

  it("動態 import 一律算執行期", () => {
    const source = 'const mod = await import("./api.ts");';
    expect(isTypeOnlyImportAt(source, firstSpecifierIndex(source))).toBe(false);
  });
});
