import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/spec.ts";

/**
 * 解析層的單元測試：**讀不懂的句子一律是紅燈，不是跳過**。
 *
 * ⚠️ 這一組守的是這份設計最容易破的地方。一個打錯字的「那麼」句如果被
 * 安靜略過，規格會**看起來還在守**而實際上少了一條 —— 那與
 * `tools/spec-report` 第四態（❓ 未執行）記的是同一件事：
 * **全綠而一條都沒跑，與真的全綠長得一模一樣。**
 */

const HEAD = "# language: zh-TW\n功能: 測試用承諾\n\n";

function parse(body: string) {
  return parseSpec("specs/test.feature", `${HEAD}${body}`);
}

const OK = `  場景: 一條完整的承諾
    假設 某種破壞
    當 跑 tools/conformance
    那麼 它必須紅，訊息裡要出現 "片段"
`;

describe("讀得懂的規格", () => {
  it("三句都齊時解析成一條可執行的承諾", () => {
    const { scenarios, findings } = parse(OK);

    expect(findings).toEqual([]);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]).toMatchObject({
      given: "某種破壞",
      gate: "tools/conformance",
      expectRed: true,
      fragment: "片段",
    });
  });

  it("「必須綠」解析成期待綠燈的對照組", () => {
    const { scenarios } = parse(OK.replace("它必須紅", "它必須綠"));
    expect(scenarios[0]?.expectRed).toBe(false);
  });

  it("「假設」那一句逐字保留 —— 它是接線的鍵", () => {
    const { scenarios } = parse(
      OK.replace("某種破壞", "一片切片的 view 直接 import 了自己的資料層"),
    );
    expect(scenarios[0]?.given).toBe("一片切片的 view 直接 import 了自己的資料層");
  });
});

describe("讀不懂的規格", () => {
  const CASES = [
    {
      what: "缺「那麼」",
      body: "  場景: 缺一句\n    假設 某種破壞\n    當 跑 tools/conformance\n",
      rule: "場景形狀",
    },
    {
      what: "同型的句子有兩句（跑哪一個都是猜）",
      body: `${OK}    當 跑 tools/doc-facts\n`,
      rule: "場景形狀",
    },
    {
      what: "「當」不是「跑 <閘門>」",
      body: OK.replace("當 跑 tools/conformance", "當 檢查一下"),
      rule: "當句",
    },
    {
      what: "「那麼」沒有紅綠",
      body: OK.replace('它必須紅，訊息裡要出現 "片段"', "它應該要擋下來"),
      rule: "那麼句",
    },
    {
      // ⚠️ 這一條是整組最重要的：少了片段比對，任何一種違規都能讓
      // 任何一條承諾變綠 —— 閘門紅在別的規則上也算通過。
      what: "「那麼」少了訊息片段",
      body: OK.replace('它必須紅，訊息裡要出現 "片段"', "它必須紅"),
      rule: "那麼句",
    },
  ];

  for (const { what, body, rule } of CASES) {
    it(`${what} → [${rule}]，而且不產生任何場景`, () => {
      const { scenarios, findings } = parse(body);

      expect(findings.map((f) => f.rule)).toContain(rule);
      expect(scenarios, "讀不懂的句子不得變成一條「執行過」的承諾").toHaveLength(0);
    });
  }

  it("一個場景都沒有 → [規格不成立]", () => {
    const { findings } = parse("");
    expect(findings.map((f) => f.rule)).toContain("規格不成立");
  });

  it("整份不是 Gherkin → [規格不成立]，不是拋例外", () => {
    const { findings } = parseSpec("specs/test.feature", "這不是規格");
    expect(findings.map((f) => f.rule)).toContain("規格不成立");
  });
});
