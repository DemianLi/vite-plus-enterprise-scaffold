import { describe, it, expect } from "vitest";

import feature from "../src/index.ts";
import { invoiceKeys } from "../src/api.ts";

/**
 * 切片的測試住在切片內。一致性檢查要求每個 features/* 至少有一支
 * tests/**\/*.test.ts —— 沒有測試的切片＝沒有人能安全重構的切片。
 *
 * ⚠️ 這裡刻意不驗路由 name／權限碼／i18n 頂層 key 的命名空間：那些由
 * `defineFeature` 在 import 時驗，違規時上面那行 import 先炸，這支檔
 * 一條都跑不到，寫在這裡的斷言永遠不可達（C172）。所以這裡只放它不驗的事。
 */

describe("invoice 切片契約 —— defineFeature 不驗、只有這裡在守的", () => {
  it("選單項目指向本切片實際存在的路由（defineFeature 只驗前綴，不驗存在）", () => {
    const routeNames = new Set(feature.routes.map((route) => route.name));
    for (const item of feature.menu) {
      expect(routeNames.has(item.routeName)).toBe(true);
    }
  });
});

describe("query key 命名空間", () => {
  it("所有 key 以切片名開頭，兩個切片的快取不可能互相污染", () => {
    expect(invoiceKeys.all[0]).toBe("invoice");
    expect(invoiceKeys.list({})[0]).toBe("invoice");
    expect(invoiceKeys.detail("x")[0]).toBe("invoice");
  });
});

describe("命名空間斷言在 C172 刪掉的前提", () => {
  // defineFeature 只在 DEV 下驗。這一條紅的那天，這片的命名空間就沒有人在守了。
  it("import.meta.env.DEV 在這片的 vitest 底下是 true", () => {
    expect(import.meta.env.DEV).toBe(true);
  });
});
