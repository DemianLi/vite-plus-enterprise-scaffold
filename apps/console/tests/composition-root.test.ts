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

  /**
   * ★ `registered.names` —— 這個聚合裡**唯一沒有任何人讀**的那一格。
   *
   * 實查（#163）：整棵樹零處消費 `RegisteredFeatures.names`。所以它壞掉不會讓
   * 任何畫面出錯，也不會讓任何別的斷言變紅 —— 它只會安靜地錯著。
   *
   * ⚠️ 這條殺的是 `platform/slice-kit/src/register.ts:51` 的
   * `features.map((f) => f.name)` → `() => undefined`（Stryker mutant 1124）。
   * 那一顆在 10.0.0 那趟全樹裡**是活的**，而且是 `register.ts` 二十四顆裡唯一
   * 一顆全樹存活的。
   *
   * ⚠️ **刻意不寫成 `toEqual(features.map((f) => f.name))`** —— 那是把產品碼抄
   * 一遍當基準，產品碼怎麼壞它就跟著怎麼壞（`tripwire-must-hang-on-its-target`）。
   * 改成**從聚合的其餘三格反推**：切片契約（`defineFeature`）保證路由 name 落在
   * `<切片名>/` 底下、權限碼落在 `<切片名>:` 底下、i18n 每個 locale 的頂層 key
   * 恰好是 `<切片名>`。所以 `names` 必須正好是這三者共同的那組命名空間。
   *
   * ⚠️ **退化情形**：一個切片如果路由、權限碼、i18n 三者同時是空的，它的命名
   * 空間就反推不出來，這條會紅而產品碼沒問題。目前的契約不擋這種切片 ——
   * 真的出現時，該問的是那樣的切片為什麼要註冊，不是把這條斷言放寬。
   */
  it("★ names 描述得了聚合裡其餘三格的命名空間", () => {
    const registered = registerFeatures(features);

    const derived = new Set<string>([
      ...registered.routes.map((route) => String(route.name).split("/")[0]),
      ...registered.permissions.map((permission) => permission.split(":")[0]),
      ...Object.values(registered.messages).flatMap((locale) => Object.keys(locale)),
    ]);

    // 少了這條，三個來源同時空掉時下面那條會拿空陣列比空陣列然後報綠。
    expect(derived.size, "反推不出任何命名空間 —— 這條斷言沒有東西可比對").toBeGreaterThan(0);
    expect([...derived].sort()).toEqual([...registered.names].sort());
  });

  it("每個切片的選單項目都指向實際存在的路由", () => {
    const registered = registerFeatures(features);
    const routeNames = new Set(registered.routes.map((route) => route.name));
    for (const item of registered.menu) {
      expect(routeNames.has(item.routeName)).toBe(true);
    }
  });
});
