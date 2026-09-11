import { describe, expect, it } from "vitest";

import { checkEffective, normalizeRule, type ScaffoldHalf } from "../src/effective.ts";

const HALF: ScaffoldHalf = {
  lint: {
    plugins: ["import", "vue"],
    rules: { "no-eval": "error", "import/no-cycle": "error" },
    options: { typeAware: true },
  },
  overrides: [
    { files: ["tools/**", "platform/**"], rules: { "max-depth": ["error", { max: 5 }] } },
    { files: [".semgrep/**"], rules: { "no-eval": "off" } },
  ],
};

const SCAFFOLD_TAIL = [
  { files: ["tools/**", "platform/**"], rules: { "max-depth": ["deny", [{ max: 5 }]] } },
  { files: [".semgrep/**"], rules: { "no-eval": "allow" } },
];

const TEAM_TESTS = { files: ["**/tests/**"], rules: { "max-depth": ["deny", [{ max: 3 }]] } };

/** `vp lint --print-config` 在一棵照規矩寫的樹上長的樣子（多出來的鍵照實保留）。 */
function printed(change: (config: Record<string, unknown>) => void = () => {}): unknown {
  const config: Record<string, unknown> = {
    plugins: ["unicorn", "import", "vue"],
    categories: {},
    rules: { "no-eval": "deny", "import/no-cycle": "deny", "max-depth": ["deny", [{ max: 5 }]] },
    options: { typeAware: true, typeCheck: true },
    overrides: [TEAM_TESTS, ...SCAFFOLD_TAIL].map((entry) => ({ ...entry, env: null })),
    ignorePatterns: [],
  };
  change(config);
  return config;
}

const PROTECTED = ["tools/a/src/a.ts", "platform/b/index.ts", "vite.scaffold.ts"];

const kinds = (config: unknown): string[] =>
  checkEffective(HALF, config, PROTECTED).map((problem) => problem.kind);

describe("原始碼寫法 → 生效設定的寫法", () => {
  it.each([
    ["error", "deny"],
    ["warn", "warn"],
    ["off", "allow"],
  ])("%s → %s", (source, printedForm) => {
    expect(normalizeRule(source)).toBe(printedForm);
  });

  it("帶選項的規則多包一層陣列", () => {
    expect(normalizeRule(["error", { max: 5 }])).toEqual(["deny", [{ max: 5 }]]);
  });
});

describe("生效設定", () => {
  it("照規矩的樹 → 綠（團隊加自己的規則與 override 是合法的）", () => {
    expect(kinds(printed())).toEqual([]);
  });

  it("🔴 根層在 spread 之後把 no-eval 關掉（C219 §六 那一格）", () => {
    const config = printed((c) => {
      c["rules"] = { ...(c["rules"] as object), "no-eval": "allow" };
    });
    expect(kinds(config)).toEqual(["腳手架的規則被蓋掉了"]);
  });

  it("🔴 拿掉腳手架的外掛", () => {
    expect(kinds(printed((c) => (c["plugins"] = ["import"])))).toEqual(["腳手架的外掛被拿掉了"]);
  });

  it("🔴 改掉腳手架的選項", () => {
    const config = printed((c) => (c["options"] = { typeAware: false, typeCheck: true }));
    expect(kinds(config)).toEqual(["腳手架的選項被改了"]);
  });

  it("🔴 團隊的 override 排到腳手架那一串後面 —— 後者蓋前者，tools/ 吃到團隊的數字", () => {
    const config = printed((c) => (c["overrides"] = [...SCAFFOLD_TAIL, TEAM_TESTS]));
    expect(kinds(config)).toEqual([
      "腳手架的 override 不在最後，或被改了",
      "腳手架的 override 不在最後，或被改了",
    ]);
  });

  it("🔴 團隊的 override 提到腳手架的基礎規則 —— 換一個位置的「蓋掉」", () => {
    const loosen = { files: ["features/**"], rules: { "no-eval": "allow" } };
    const config = printed((c) => (c["overrides"] = [loosen, ...SCAFFOLD_TAIL]));
    expect(kinds(config)).toEqual(["團隊的 override 蓋掉了腳手架的規則"]);
  });

  it("🔴 ignorePatterns 把腳手架的碼排除在 lint 之外", () => {
    const config = printed((c) => (c["ignorePatterns"] = ["dist/**", "platform"]));
    expect(checkEffective(HALF, config, PROTECTED).map((problem) => problem.detail)).toEqual([
      "ignorePatterns 的 platform 命中 platform/b/index.ts",
    ]);
  });

  it("讀不懂的形狀直接紅，不當成「沒有東西被蓋掉」", () => {
    expect(kinds({ rules: {} })).toEqual(["讀不懂生效設定"]);
  });
});
