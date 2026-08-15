import { describe, expect, it } from "vitest";

import { CONTROLS, GATES, type Control, type Gate } from "../src/map.ts";
import {
  danglingGateIds,
  gatesWithoutArticle,
  owedGaps,
  proofStatus,
  render,
  unprovenGates,
} from "../src/render.ts";

/**
 * 對照表的推導邏輯。
 *
 * 這幾條看起來瑣碎，但它們決定了那張表上每一格印什麼 ——
 * 而那張表是拿去回答稽核的。判定寫錯的方向幾乎都是**樂觀**的
 *（把部分覆蓋算成完整、把未證明算成已證明），所以每一條都配一個反面。
 */

const GATE: Gate = {
  id: "demo",
  what: "示範",
  command: "node nowhere.ts",
  evidence: null,
  negativeTest: null,
  note: "測試用",
};

const CONTROL: Control = {
  article: "§0",
  requirement: "示範",
  scope: "frontend",
  gates: ["demo"],
  coverage: "partial",
  owed: false,
  note: "測試用",
};

const PROVEN: Gate = { ...GATE, id: "proven", negativeTest: "tools/proven/tests/negative.test.ts" };

describe("proofStatus", () => {
  it("所有閘門都有反向測試 → proven", () => {
    expect(proofStatus({ ...CONTROL, gates: ["proven"] }, [PROVEN])).toBe("proven");
  });

  it("一半有 → partial", () => {
    expect(proofStatus({ ...CONTROL, gates: ["proven", "demo"] }, [PROVEN, GATE])).toBe("partial");
  });

  it("都沒有 → none", () => {
    expect(proofStatus(CONTROL, [GATE])).toBe("none");
  });

  it("沒有閘門、腳手架也不欠 → out-of-scope", () => {
    // §11 II ① 的防火牆就是這一種。標成「未證明」會讓表上多出一堆假紅叉。
    expect(proofStatus({ ...CONTROL, gates: [], owed: false }, [])).toBe("out-of-scope");
  });

  it("沒有閘門、但腳手架欠 → none（真的洞）", () => {
    expect(proofStatus({ ...CONTROL, gates: [], owed: true }, [])).toBe("none");
  });

  it("★ 引用了不存在的閘門 id 不得算成已證明", () => {
    // 打錯字時最糟的結果是「查無此閘門 → 沒有 negativeTest → 但也沒人發現」。
    // 這裡釘住它會落在 none，而 danglingGateIds 會另外把它報出來。
    expect(proofStatus({ ...CONTROL, gates: ["typo"] }, [PROVEN])).toBe("none");
  });
});

describe("owedGaps", () => {
  it("只收「欠、而且完全沒有覆蓋」的", () => {
    const controls: Control[] = [
      { ...CONTROL, article: "A", owed: true, coverage: "none" },
      { ...CONTROL, article: "B", owed: true, coverage: "partial" },
      { ...CONTROL, article: "C", owed: false, coverage: "none" },
    ];

    expect(owedGaps(controls).map((control) => control.article)).toEqual(["A"]);
  });

  it("★ 判準是 owed 而不是 scope", () => {
    // §16 的責任落在流程面，但腳手架欠它一份保存期政策 —— 用 scope 篩會漏掉。
    const control: Control = { ...CONTROL, scope: "process", owed: true, coverage: "none" };
    expect(owedGaps([control])).toHaveLength(1);
  });
});

describe("gatesWithoutArticle", () => {
  it("找出對不到任何條號的閘門", () => {
    const orphan: Gate = { ...GATE, id: "orphan" };
    expect(gatesWithoutArticle([GATE, orphan], [CONTROL]).map((gate) => gate.id)).toEqual([
      "orphan",
    ]);
  });
});

describe("danglingGateIds", () => {
  it("條號引用了不存在的 id 就報出來", () => {
    expect(danglingGateIds([GATE], [{ ...CONTROL, gates: ["demo", "typo"] }])).toEqual(["typo"]);
  });

  it("全部對得上時是空的", () => {
    expect(danglingGateIds([GATE], [CONTROL])).toEqual([]);
  });
});

describe("render", () => {
  const output = render({
    regulation: "測試規範",
    gates: GATES,
    controls: CONTROLS,
    future: [{ item: "示範項目", source: "示範法源" }],
  });

  it("每一條法規都出現在表上", () => {
    for (const control of CONTROLS) expect(output).toContain(control.article);
  });

  it("每一道閘門都出現在表上", () => {
    for (const gate of GATES) expect(output).toContain(`\`${gate.id}\``);
  });

  it("未證明的閘門在表上是顯眼的，不是空白", () => {
    expect(unprovenGates(GATES).length).toBeGreaterThan(0);
    expect(output).toContain("❌ 無");
  });

  it("儲存格裡的 | 會被跳脫，不會把欄位切開", () => {
    const nasty: Control = { ...CONTROL, requirement: "a | b" };
    const one = render({ regulation: "r", gates: [GATE], controls: [nasty], future: [] });
    expect(one).toContain("a \\| b");
  });

  it("尚未生效的部分與現行義務分開兩節", () => {
    expect(output).toContain("尚未適用");
    expect(output.indexOf("條號 → 閘門")).toBeLessThan(output.indexOf("尚未適用"));
  });

  it("★ 表頭警告不要手改 —— 少了它，第一個讀者就會去改那幾格", () => {
    expect(output).toContain("不要手改");
  });
});
