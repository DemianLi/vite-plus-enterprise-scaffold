import { describe, it, expect } from "vitest";

import feature from "../src/index.ts";
import { orderKeys } from "../src/api.ts";

/**
 * 切片的測試住在切片內（D4）。
 * 一致性檢查會驗證每個 features/* 至少有一支 tests/**\/*.test.ts。
 */

describe("order 切片契約", () => {
  it("所有路由 name 落在自己的命名空間下", () => {
    for (const route of feature.routes) {
      expect(route.name).toMatch(/^order\//);
    }
  });

  it("所有頂層路由 path 落在 /order 之下", () => {
    for (const route of feature.routes) {
      expect(route.path.startsWith("/order")).toBe(true);
    }
  });

  it("所有權限碼落在自己的命名空間下", () => {
    for (const permission of feature.permissions) {
      expect(permission).toMatch(/^order:/);
    }
  });

  it("每個 locale 的 i18n 頂層 key 恰好只有 order", () => {
    for (const messages of Object.values(feature.i18n)) {
      expect(Object.keys(messages)).toEqual(["order"]);
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
    expect(orderKeys.all[0]).toBe("order");
    expect(orderKeys.list({})[0]).toBe("order");
    expect(orderKeys.detail("abc")[0]).toBe("order");
  });

  it("list key 帶入查詢條件，條件改變時快取自然失效", () => {
    expect(orderKeys.list({ status: "pending" })).not.toEqual(
      orderKeys.list({ status: "shipped" }),
    );
  });
});
