import { describe, expect, it } from "vitest";

import a11yConfig from "@org/eslint-config/a11y";

import { GATES } from "../src/map.ts";
import {
  ACCESSIBILITY_STANDARD,
  CRITERIA,
  preFilterRules,
  scopedOverrides,
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

describe("範圍覆寫：全域清單之後的區塊要進交付文件", () => {
  const render = (config: readonly unknown[] = a11yConfig) =>
    renderAccessibility({
      criteria: CRITERIA,
      rules: preFilterRules(config),
      overrides: scopedOverrides(config),
    });

  const isScoped = (entry: unknown): entry is { files: string[]; rules: Record<string, unknown> } =>
    typeof entry === "object" && entry !== null && "files" in entry && "rules" in entry;

  /** 真設定裡 `platform/ui` 那個豁免區塊：三顆變異都從它長出來，找不到就不要量。 */
  const exemption = (() => {
    const found = a11yConfig
      .slice(a11yConfig.findIndex((e) => typeof e === "object" && e !== null && "rules" in e) + 1)
      .find(isScoped);
    if (found === undefined) throw new Error("真設定裡沒有範圍覆寫區塊 —— 這組測試的前提沒了");
    return found;
  })();
  const withExemptionReplaced = (block: unknown) =>
    a11yConfig.map((e) => (e === exemption ? block : e));

  it("★ 每一列覆寫的規則都在全域清單裡 —— 覆寫一條沒開的規則是死碼", () => {
    const all = new Set(preFilterRules());
    const overrides = scopedOverrides();
    expect(overrides.length).toBeGreaterThan(0);
    for (const o of overrides) {
      expect(all.has(o.rule)).toBe(true);
      expect(o.files.length).toBeGreaterThan(0);
    }
  });

  it("★ 交付文件印出每一列的規則名與 files glob 字面", () => {
    const markdown = render();
    for (const o of scopedOverrides()) {
      expect(markdown).toContain(`\`${o.rule}\``);
      for (const glob of o.files) expect(markdown).toContain(glob);
    }
  });

  /**
   * ⚠️ 下面三顆變異是 #297 改前閘門零紅的那三顆（加新區塊／擴 files／加第二條 off）。
   * 用參數注入而不改真樹的 `a11y.js`：C186 §二 之後測試不准改寫真樹的交付文件，
   * 而閘門那一頭的「產出變了 → baseline 紅」由 C186 的沙盒測試守。
   *
   * ⚠️ **三顆都不用 `not.toBe(render())` 判，而那不是寫法偏好。** 注入值一旦與真值
   * 相同（有人真的把豁免擴成全樹的 .vue、真的多關一條），那顆變異就變成 no-op ——
   * 測試會紅，而訊息是兩串**看起來一樣**的字串 `not to be`，指不出真設定改了什麼。
   * 實測過：把 `a11y.js:160` 的 files 改成全樹的 .vue，M2 紅在
   * `expected '# 無障礙…' not to be '# 無障礙…'`。所以每一顆先用一句具名的
   * 前置斷言問「真設定是不是已經長成注入的樣子」，再對注入結果與真設定的產出
   * 各驗一次 —— 紅的時候說得出是哪一邊變了。
   */
  it("🔴 M1：多一個 apps/** 的 off 區塊 → 交付文件變了", () => {
    const files = "apps/**/*.vue";
    expect(
      render(),
      `真設定已經有 ${files} 的覆寫 —— 注入值與真值相同，這顆變異量不到任何事`,
    ).not.toContain(files);

    const mutated = render([
      ...a11yConfig,
      { files: [files], rules: { "vuejs-accessibility/no-autofocus": "off" } },
    ]);
    expect(mutated).toContain(files);
    expect(mutated).toContain("no-autofocus");
  });

  it("🔴 M2：豁免的 files 擴成 **/*.vue → 交付文件變了", () => {
    const widened = "**/*.vue";
    expect(
      exemption.files,
      `真設定的豁免 files 已經是 ${widened} —— 注入值與真值相同，這顆變異變成 no-op`,
    ).not.toContain(widened);

    const mutated = render(withExemptionReplaced({ ...exemption, files: [widened] }));
    expect(mutated).toContain(`\`${widened}\``);
    expect(render(), "真設定的產出本來就印著這個 glob —— 上面那條沒有量到注入").not.toContain(
      `\`${widened}\``,
    );
  });

  it("🔴 M3：豁免區塊多關一條 → 交付文件變了", () => {
    const rule = "vuejs-accessibility/label-has-for";
    // ⚠️ glob 取自真設定，不寫死：寫死的話「別人把豁免的 files 改寬了」也會讓
    // 這一顆紅，而它要問的是「多關一條會不會進交付文件」。那一格的字面由
    // 上面「交付文件印出每一列的規則名與 files glob 字面」那條守。
    const row = `label-has-for\` | \`${exemption.files[0] ?? ""}`;
    expect(
      Object.keys(exemption.rules),
      `真設定的豁免已經關了 ${rule} —— 注入值與真值相同，這顆變異變成 no-op`,
    ).not.toContain(rule);

    const mutated = render(
      withExemptionReplaced({ ...exemption, rules: { ...exemption.rules, [rule]: "off" } }),
    );
    expect(mutated).toContain(row);
    expect(render(), "真設定的產出本來就有這一列 —— 上面那條沒有量到注入").not.toContain(row);
  });

  it("★ 對照：真設定 render 兩次逐位相同 —— 上面三顆拿 render() 當真值才有意義", () => {
    expect(render()).toBe(render());
  });

  it("🔴 第二個 rules 區塊沒有 files → 拒絕產出", () => {
    expect(() => scopedOverrides([{ rules: { a: "error" } }, { rules: { a: "off" } }])).toThrow(
      "沒有 files",
    );
  });

  it("🔴 沒有任何覆寫 → 文件要明說，不是把那一節省掉", () => {
    expect(
      renderAccessibility({ criteria: CRITERIA, rules: preFilterRules(), overrides: [] }),
    ).toContain("沒有範圍覆寫");
  });
});

describe("產出的文件", () => {
  const markdown = renderAccessibility({
    criteria: CRITERIA,
    rules: preFilterRules(),
    overrides: scopedOverrides(),
  });

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
    expect(renderAccessibility({ criteria: CRITERIA, rules: [], overrides: [] })).toContain(
      "共 0 條",
    );
  });
});
