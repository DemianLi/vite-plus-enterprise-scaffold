import { describe, it, expect } from "vitest";

import { defineFeature, registerFeatures } from "../src/index.ts";
import type { Feature } from "../src/index.ts";

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
