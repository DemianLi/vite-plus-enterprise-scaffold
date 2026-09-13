import { describe, it, expect } from "vitest";
import { registerFeatures } from "@org/slice-kit";

import { features } from "../src/features.ts";
import { menuLinks, toRouteObject } from "../src/router.ts";

/**
 * Composition root 的煙霧測試。
 *
 * 這支測試的價值不在於驗證 registerFeatures 本身（那有自己的單元測試），
 * 而在於：**任何一個切片違反契約，都會在這裡而不是在使用者面前爆炸**。
 *
 * 光是 import features.ts 就會觸發每個切片的 defineFeature 命名空間驗證；
 * 再跑一次 registerFeatures 則會抓出跨切片的撞名。
 * 換句話說，這是全系統唯一「所有切片同時在場」的地方。
 *
 * ⚠️ 「選單項目指到的路由存在」**刻意不在這裡**。`defineFeature` 逼路由 name 與選單
 * routeName 都帶自己切片的前綴（`define-feature.ts:60`、`:98`），所以「在聯集裡」
 * 與「在自己那片裡」是同一件事 —— 而逐片那三份還多守「這片有沒有被註冊進來」。
 * 聚合層問不出逐片問不出來的事，就不在聚合層問（C197 §二）。
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
});

/**
 * 切片路由 → react-router（C240，Q89）。
 *
 * react-router 沒有具名路由：選單的 `routeName` 在 `menuLinks` 換成路徑，
 * 契約的 `name` 在 `toRouteObject` 放進 `id`。兩處換錯的樣子都是「畫面照常、
 * 點了沒反應」，不會有錯誤訊息。
 */
describe("切片路由接到 react-router", () => {
  const registered = registerFeatures(features);

  it("每個選單項目都換得出它那條路由的完整路徑", () => {
    const byName = new Map(registered.routes.map((route) => [route.name, route.path]));
    const links = menuLinks(registered);

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.path).toBe(byName.get(link.routeName));
  });

  it("巢狀路由的相對 path 接在父層後面", () => {
    const nested = registerFeatures([
      {
        name: "demo",
        routes: [
          {
            path: "/demo",
            component: () => Promise.resolve({ default: () => null }),
            children: [
              {
                path: "detail",
                name: "demo/detail",
                component: () => Promise.resolve({ default: () => null }),
              },
            ],
          },
        ],
        permissions: [],
        i18n: {},
        menu: [{ labelKey: "demo.detail", routeName: "demo/detail" }],
      },
    ]);
    expect(menuLinks(nested).map((link) => link.path)).toEqual(["/demo/detail"]);
  });

  it("🔴 選單指向不存在的路由 → 啟動時就丟，不是渲染一個點了沒反應的連結", () => {
    const broken = { ...registered, menu: [{ labelKey: "x.title", routeName: "x/missing" }] };
    expect(() => menuLinks(broken)).toThrow(/x\/missing/);
  });

  it("路由的 name 成為 react-router 的 id，畫面照樣懶載入", async () => {
    const [first] = registered.routes;
    if (first === undefined) throw new Error("沒有任何路由可驗");
    const converted = toRouteObject(first);

    expect(converted.id).toBe(first.name);
    expect(converted.path).toBe(first.path);
    expect(typeof converted.lazy).toBe("function");
    const lazy = converted.lazy as () => Promise<{ Component?: unknown }>;
    expect((await lazy()).Component).toBe((await first.component()).default);
  });
});
