import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { allViews, discoverPrograms, isFixture } from "../src/programs.ts";

/**
 * 推導層的測試。**跑在真的 repo 上，不用假目錄** —— 這一層要證明的正是
 * 「新增一個切片會不會自動被檢查到」，而假目錄回答不了那個問題。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

describe("排除規則", () => {
  it("★ 排除的是 tests/fixtures/，而且它真的排掉了東西", () => {
    const all = allViews(ROOT);
    const excluded = all.filter(isFixture);
    // 這個斷言不寫死數量 —— 寫死的話新增一個 fixture 就要改測試。
    // 它守的是「排除規則有作用」，不是「現在剛好有幾個」。
    expect(excluded.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(excluded.length);
    for (const view of excluded) expect(view).toContain("tests/fixtures/");
  });

  it("★ 只有路徑中段是 tests/fixtures 才算，名字裡有 fixture 不算", () => {
    expect(isFixture("platform/eslint-config/tests/fixtures/a11y-violations.vue")).toBe(true);
    expect(isFixture("tests/fixtures/app/src/Child.vue")).toBe(true);
    expect(isFixture("features/order/src/views/FixturesList.vue")).toBe(false);
    expect(isFixture("features/fixtures-demo/src/views/X.vue")).toBe(false);
  });
});

describe("推導出來的 program", () => {
  const programs = discoverPrograms(ROOT);

  it("★ 每一份都有 tsconfig，而且至少含一個 .vue", () => {
    expect(programs.length).toBeGreaterThan(0);
    for (const program of programs) {
      expect(program.tsconfig).toBe(`${program.dir}/tsconfig.json`);
      expect(program.views.length).toBeGreaterThan(0);
    }
  });

  it("★ 非 fixture 的 .vue 一個都不能漏 —— 漏掉的那個永遠是 0 錯誤", () => {
    const covered = new Set(programs.flatMap((program) => program.views));
    const expected = allViews(ROOT).filter((view) => !isFixture(view));
    expect([...covered].sort()).toEqual(expected);
  });

  it("★ fixture 一個都不進來 —— 進來的話閘門第一天就紅（C41）", () => {
    for (const program of programs)
      for (const view of program.views) expect(isFixture(view)).toBe(false);
  });
});
