import { describe, it, expect } from "vitest";
import { registerFeatures } from "@org/slice-kit";

import { features } from "../src/features.ts";

/**
 * Composition root 的煙霧測試。
 *
 * 這支測試的價值不在於驗證 registerFeatures 本身（那有自己的單元測試），
 * 而在於：**任何一個切片違反契約，都會在這裡而不是在使用者面前爆炸**。
 *
 * 光是 import features.ts 就會觸發每個切片的 defineFeature 命名空間驗證；
 * 再跑一次 registerFeatures 則會抓出跨切片的撞名。
 * 換句話說，這是全系統唯一「所有切片同時在場」的地方。
 */

describe("apps/console composition root", () => {
  it("所有已註冊的切片都通過契約驗證且無撞名", () => {
    expect(() => registerFeatures(features)).not.toThrow();
  });

  it("至少註冊了一個切片（空陣列通常代表 import 被誤刪）", () => {
    expect(features.length).toBeGreaterThan(0);
  });

  it("每個切片的路由 name 前綴唯一，跨切片不重複", () => {
    const registered = registerFeatures(features);
    const names = registered.routes.map((route) => route.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("每個切片的選單項目都指向實際存在的路由", () => {
    const registered = registerFeatures(features);
    const routeNames = new Set(registered.routes.map((route) => route.name));
    for (const item of registered.menu) {
      expect(routeNames.has(item.routeName)).toBe(true);
    }
  });
});
