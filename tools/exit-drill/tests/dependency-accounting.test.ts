import { describe, expect, it } from "vitest";

import {
  accountTestDependencies,
  DRILL_TEST_DEPENDENCIES,
  DROPPED_TEST_DEPENDENCIES,
  type ManifestDevDependencies,
} from "../src/dependencies.ts";

/**
 * 測試相依帳目的反向測試。
 *
 * ── 這道檢查是為了一個真的發生過的失敗才存在的 ──────────────────────
 *
 * `happy-dom` 與 `@vue/test-utils` 隨 `features/order/tests/masking.test.ts`
 * 在 PR #15 進來。演練的 `runtimeDependencies()` 只收 `dependencies`，
 * 於是那兩個從來沒被安裝過 —— 而演練的最後一步正是 `vitest run`。
 *
 * 演練從那一刻起就是壞的，但完整演練**每季才跑一次**（下一次 2026-10-01），
 * 所以沒有人知道。發現它是因為別的事去手動跑了一次。
 *
 * 這裡守的是「加了測試相依卻沒登記」——不打網路、不裝任何東西，
 * 只讀 package.json，所以它跑在**每次 PR** 的靜態那一半。
 */

function manifest(devDependencies: Record<string, string>): ManifestDevDependencies {
  return { path: "features/x/package.json", devDependencies };
}

describe("測試相依帳目", () => {
  it("兩張表都登記過的，通過", () => {
    const errors = accountTestDependencies([
      manifest({ "happy-dom": "catalog:", vitest: "catalog:", "vite-plus": "catalog:" }),
    ]);
    expect(errors).toEqual([]);
  });

  it("🔴 沒登記的 devDependency → 紅", () => {
    // 這就是 happy-dom 當初的樣子：加進 package.json，沒有人想到演練也要裝它。
    const errors = accountTestDependencies([manifest({ "some-test-env": "^1.0.0" })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("some-test-env");
    expect(errors[0]).toContain("未登記");
  });

  it("workspace: 連結不算 —— 它們由 alias 處理，不必安裝", () => {
    const errors = accountTestDependencies([manifest({ "@org/tsconfig": "workspace:*" })]);
    expect(errors).toEqual([]);
  });

  it("★ 兩張表本身不得有交集", () => {
    // 帳目自相矛盾時，「這個到底裝不裝」會變成讀原始碼才答得出來的問題。
    // `accountTestDependencies` 自己也會回報交集，但那條路徑要改動模組常數
    // 才走得到 —— 與其寫一條測不到那條路徑、名字卻宣稱測到了的測試，
    // 不如直接把不變式釘在這裡。
    const carried = new Set(DRILL_TEST_DEPENDENCIES);
    const overlap = DROPPED_TEST_DEPENDENCIES.filter((entry) => carried.has(entry.name));
    expect(overlap.map((entry) => entry.name)).toEqual([]);
  });

  it("★ 每一筆「不裝」都要有理由，而且不能只寫「用不到」", () => {
    // 「演練用不到」三個月後沒有人分得出它是真的用不到，還是當時沒想到。
    for (const entry of DROPPED_TEST_DEPENDENCIES) {
      expect(entry.reason.length, `${entry.name} 的理由太短`).toBeGreaterThan(20);
      expect(entry.reason, `${entry.name} 的理由只寫了「用不到」`).not.toMatch(/^用不到/);
    }
  });

  it("★ vite-plus 必須明示不裝 —— 那是整場演練要證明的事", () => {
    // 這一筆掉了的話，某天有人「順手」把它加進 DRILL_TEST_DEPENDENCIES，
    // 演練會全綠，而它證明的東西變成零。
    const dropped = DROPPED_TEST_DEPENDENCIES.find((entry) => entry.name === "vite-plus");
    expect(dropped, "vite-plus 不在「明示不裝」表裡").toBeDefined();
    expect(DRILL_TEST_DEPENDENCIES).not.toContain("vite-plus");
  });

  it("多份 manifest 的違規各自回報，附檔案路徑", () => {
    const errors = accountTestDependencies([
      { path: "a/package.json", devDependencies: { "x-one": "^1" } },
      { path: "b/package.json", devDependencies: { "x-two": "^1" } },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("a/package.json");
    expect(errors[1]).toContain("b/package.json");
  });
});
