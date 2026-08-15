import { describe, it, expect } from "vitest";

import feature from "../src/index.ts";
import { shipmentKeys } from "../src/api.ts";

/**
 * 切片的測試住在切片內。一致性檢查要求每個 features/* 至少有一支
 * tests/**\/*.test.ts —— 沒有測試的切片＝沒有人能安全重構的切片。
 */

describe("shipment 切片契約", () => {
  it("所有路由 name 落在自己的命名空間下", () => {
    for (const route of feature.routes) {
      expect(route.name).toMatch(/^shipment\//);
    }
  });

  it("所有權限碼落在自己的命名空間下", () => {
    for (const permission of feature.permissions) {
      expect(permission).toMatch(/^shipment:/);
    }
  });

  it("每個 locale 的 i18n 頂層 key 恰好只有 shipment", () => {
    for (const messages of Object.values(feature.i18n)) {
      expect(Object.keys(messages)).toEqual(["shipment"]);
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
    expect(shipmentKeys.all[0]).toBe("shipment");
    expect(shipmentKeys.list({})[0]).toBe("shipment");
    expect(shipmentKeys.detail("x")[0]).toBe("shipment");
  });
});
