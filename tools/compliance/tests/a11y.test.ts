import { describe, expect, it } from "vitest";

import { GATES } from "../src/map.ts";
import {
  ACCESSIBILITY_STANDARD,
  CRITERIA,
  preFilterRules,
  verifyCriteria,
  type Criterion,
} from "../src/a11y.ts";
import { renderAccessibility } from "../src/a11y-render.ts";

/**
 * 無障礙分工表的反向測試。
 *
 * ⚠️ **這張表最可能長出來的謊是樂觀方向的**：宣稱開發期擋得掉某一格，
 * 而其實沒有任何閘門在守。交到機關手上的文件因此高估自己，
 * 然後那一格在人工檢測時才被打回來。所以下面兩條矛盾檢查是重點，
 * 不是附帶的健全性檢查。
 */

const KNOWN = new Set(GATES.map((gate) => gate.id));

function criterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    id: "1.1.1",
    name: "非文字內容",
    level: "A",
    acceptance: ["freego"],
    preFilter: "none",
    gates: [],
    note: "測試用",
    ...overrides,
  };
}

describe("對照組：真實的表對真實的 GATES", () => {
  it("★ 現況零問題 —— 否則下面每一條「該紅」都沒有意義", () => {
    expect(verifyCriteria(CRITERIA, KNOWN)).toEqual([]);
  });

  it("★ 每一條都有查證過的等級與編號", () => {
    expect(CRITERIA.length).toBeGreaterThan(0);
    for (const c of CRITERIA) {
      expect(c.id).toMatch(/^\d+\.\d+\.\d+$/);
      expect(["A", "AA", "AAA"]).toContain(c.level);
      expect(c.acceptance.length).toBeGreaterThan(0);
    }
  });

  /**
   * ⚠️ 版本寫成欄位而不是註解，是為了讓「標案指定舊版」變成看得見的不符。
   * 這條釘住它非空 —— 空字串會讓產出的文件看起來像沒有對照任何規範。
   */
  it("★ 規範版本是一個具名的、非空的欄位", () => {
    expect(ACCESSIBILITY_STANDARD).not.toBe("");
    expect(ACCESSIBILITY_STANDARD).toContain("110.07");
  });
});

describe("verifyCriteria：樂觀方向（危險的那一邊）", () => {
  it("🔴 宣稱開發期擋得掉，卻沒列任何閘門 → 紅", () => {
    const problems = verifyCriteria([criterion({ preFilter: "full", gates: [] })], KNOWN);
    expect(problems.map((p) => p.kind)).toContain("覆蓋沒有來源");
  });

  it("🔴 宣稱由某道閘門守，而那個閘門不存在 → 紅", () => {
    const problems = verifyCriteria(
      [criterion({ preFilter: "partial", gates: ["不存在的閘門"] })],
      KNOWN,
    );
    expect(problems.map((p) => p.kind)).toContain("閘門不存在");
  });
});

describe("verifyCriteria：悲觀方向（假的洞）", () => {
  it("🔴 宣稱擋不掉，卻列了閘門 → 也要紅", () => {
    const problems = verifyCriteria(
      [criterion({ preFilter: "none", gates: ["a11y-lint"] })],
      KNOWN,
    );
    expect(problems.map((p) => p.kind)).toContain("覆蓋與閘門矛盾");
  });

  it("🔴 空表 → 紅（空表會全綠）", () => {
    expect(verifyCriteria([], KNOWN).map((p) => p.kind)).toContain("空表");
  });
});

describe("前置過濾器的規則清單是推導的，不是抄的", () => {
  /**
   * ⚠️ 這一條守的是「有人把清單複製一份貼進來」。複製一份的症狀是：
   * 升級 `eslint-plugin-vuejs-accessibility` 之後新規則不會出現在交付文件裡，
   * 而文件仍然宣稱自己列的是閘門實際檢查的東西。
   */
  it("★ 全部帶 vuejs-accessibility/ 前綴，而且數量與設定一致", () => {
    const rules = preFilterRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule.startsWith("vuejs-accessibility/")).toBe(true);
    // 排序過 = 產出穩定，不會因為物件鍵順序改變而讓 baseline 漂移。
    expect([...rules].sort()).toEqual(rules);
  });
});

describe("產出的文件", () => {
  const markdown = renderAccessibility({ criteria: CRITERIA, rules: preFilterRules() });

  it("★ 明說自己不是完整清單 —— 否則會被讀成「AA 只有四條」", () => {
    expect(markdown).toContain("不是 AA 的完整清單");
  });

  it("★ 明說驗收沒有一段在 CI 裡", () => {
    expect(markdown).toContain("沒有一段在 CI 裡");
  });

  /**
   * ⚠️ 這一條看起來像在測文案，其實測的是**這份文件的用途**：
   * 它要能被拿去回答「哪幾格得靠人工或委外」。少了那個結論，
   * 它就退化成一張看不出該做什麼的表。
   */
  it("★ 擋不掉的那幾格要指名由驗收端的哪一段承接", () => {
    for (const c of CRITERIA) {
      if (c.preFilter !== "none") continue;
      expect(markdown).toContain(c.id);
      expect(c.acceptance.length).toBeGreaterThan(0);
    }
  });

  it("🔴 規則清單是空的 → 產出的文件會宣稱「共 0 條」，那要看得出來", () => {
    expect(renderAccessibility({ criteria: CRITERIA, rules: [] })).toContain("共 0 條");
  });
});
