import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FRESHNESS_DAYS,
  judgeFreshness,
  type Evidence,
  type FreshnessInput,
  type FreshnessVerdict,
} from "../src/freshness.ts";
import { fingerprintOf } from "../src/tree-fingerprint.ts";

/**
 * 靜態模式最後那張判斷表（`src/freshness.ts` 檔頭）。
 *
 * C183 之前這張表住在 `cli.ts` 裡，`--require-fresh` 讀三處、沒有一條測試碰得到：
 * 三處逐一無視是三個零紅（C183 §六）。下面那張 `it.each` 表就是判斷表本身 ——
 * 無視 `requireFresh` 的變異會讓表裡**恰好三列**翻紅，數字對得上「三處」。
 */

const ROOT = join(import.meta.dirname, "../../..");
const DAY = 86_400_000;
const NOW = Date.parse("2026-09-05T00:00:00Z");

const CURRENT = fingerprintOf([
  { path: "apps/console/src/main.ts", sha256: "aaa" },
  { path: "platform/ui/src/index.ts", sha256: "bbb" },
]);

/** 一份通過前面每一關的證據：昨天跑的、pass、指紋相符、有測試數。 */
const FRESH: Evidence = {
  lastRun: new Date(NOW - DAY).toISOString(),
  result: "pass",
  replaced: {},
  upstream: {},
  exitSurface: [],
  durationSeconds: 1,
  tests: 548,
  testFiles: 10,
  expectedFailures: 0,
  treeHash: CURRENT.hash,
  treeFiles: CURRENT.files,
  note: "",
};

const CONSISTENT = [{ path: "README.md", source: "上游 Vitest **548 個測試全過**" }];

function judge(overrides: Partial<FreshnessInput>): FreshnessVerdict {
  return judgeFreshness({
    evidence: FRESH,
    now: NOW,
    current: () => CURRENT,
    documents: () => CONSISTENT,
    requireFresh: false,
    ...overrides,
  });
}

function worst(verdict: FreshnessVerdict): "log" | "warn" | "error" {
  const levels = verdict.lines.map((line) => line.level);
  return levels.includes("error") ? "error" : levels.includes("warn") ? "warn" : "log";
}

/** 七個狀態；每個狀態兩個旗標值，共十四列。 */
const STATES: readonly {
  state: string;
  input: Partial<FreshnessInput>;
  off: [0 | 1, "log" | "warn" | "error"];
  on: [0 | 1, "log" | "warn" | "error"];
}[] = [
  { state: "沒有證據", input: { evidence: null }, off: [0, "warn"], on: [1, "warn"] },
  {
    state: "最後一次是失敗的",
    input: { evidence: { ...FRESH, result: "fail" } },
    off: [1, "error"],
    on: [1, "error"],
  },
  {
    state: `超過 ${FRESHNESS_DAYS} 天`,
    input: {
      evidence: { ...FRESH, lastRun: new Date(NOW - (FRESHNESS_DAYS + 1) * DAY).toISOString() },
    },
    off: [0, "warn"],
    on: [1, "error"],
  },
  {
    state: "指紋涵蓋 0 個檔案",
    input: { current: () => fingerprintOf([]) },
    off: [1, "error"],
    on: [1, "error"],
  },
  {
    state: "舊格式沒記指紋（unrecorded）",
    input: { evidence: { ...FRESH, treeHash: undefined, treeFiles: undefined } },
    off: [0, "warn"],
    on: [1, "error"],
  },
  {
    state: "指紋對不上（drift）",
    input: { evidence: { ...FRESH, treeHash: "not-today" } },
    off: [0, "warn"],
    on: [0, "warn"],
  },
  { state: "全部相符", input: {}, off: [0, "log"], on: [0, "log"] },
];

describe("judgeFreshness —— 判斷表", () => {
  it.each(STATES)("$state，不帶 --require-fresh", ({ input, off }) => {
    const verdict = judge({ ...input, requireFresh: false });
    expect([verdict.code, worst(verdict)]).toEqual(off);
  });

  it.each(STATES)("$state，帶 --require-fresh", ({ input, on }) => {
    const verdict = judge({ ...input, requireFresh: true });
    expect([verdict.code, worst(verdict)]).toEqual(on);
  });

  it("★ 旗標只翻三列：沒有證據、過期、舊格式 —— drift 連 --require-fresh 都不 fail（C149 §二）", () => {
    const flipped = STATES.filter(({ off, on }) => off[0] !== on[0]).map(({ state }) => state);
    expect(flipped).toEqual([
      "沒有證據",
      `超過 ${FRESHNESS_DAYS} 天`,
      "舊格式沒記指紋（unrecorded）",
    ]);
  });
});

describe("judgeFreshness —— 順序與下半張表", () => {
  it("★ 又失敗又過期又 drift：印的是「失敗」，兩個旗標值都是 1", () => {
    const evidence: Evidence = {
      ...FRESH,
      result: "fail",
      lastRun: new Date(NOW - 400 * DAY).toISOString(),
      treeHash: "not-today",
    };
    for (const requireFresh of [false, true]) {
      const verdict = judge({ evidence, requireFresh });
      expect(verdict.code).toBe(1);
      expect(verdict.lines.map((line) => line.text).join("\n")).toContain("失敗的");
      expect(verdict.lines.map((line) => line.text).join("\n")).not.toContain("過期");
    }
  });

  it("指紋與文件只在前兩關過了之後才算 —— 沒有證據時一次都不叫", () => {
    let called = 0;
    const count =
      <T>(value: T) =>
      (): T => {
        called += 1;
        return value;
      };
    judge({ evidence: null, current: count(CURRENT), documents: count(CONSISTENT) });
    judge({ evidence: { ...FRESH, result: "fail" }, current: count(CURRENT) });
    expect(called).toBe(0);
  });

  it("沒有 tests 欄位的舊證據：文件比對跳過，warn，仍是 0", () => {
    const verdict = judge({ evidence: { ...FRESH, tests: 0 } });
    expect(verdict.code).toBe(0);
    expect(worst(verdict)).toBe("warn");
  });

  it("🔴 文件引用的數字對不上 → 1，訊息要給出證據值", () => {
    const verdict = judge({
      documents: () => [{ path: "README.md", source: "上游 Vitest **541 個測試全過**" }],
    });
    expect(verdict.code).toBe(1);
    expect(verdict.lines.map((line) => line.text).join("\n")).toContain("548");
  });
});

describe("120 天這個數字", () => {
  it("★ 剛好 120 天仍算新鮮 —— 「上限」是含的；121 天才過期", () => {
    // 改前變異 `>` → `>=` 零紅（C183 §六 A2）：表裡的兩列離邊界各一天以上。
    const at = new Date(NOW - FRESHNESS_DAYS * DAY).toISOString();
    expect(judge({ evidence: { ...FRESH, lastRun: at }, requireFresh: true }).code).toBe(0);
    const past = new Date(NOW - (FRESHNESS_DAYS + 1) * DAY).toISOString();
    expect(judge({ evidence: { ...FRESH, lastRun: past }, requireFresh: true }).code).toBe(1);
  });

  it("README 寫的上限與 FRESHNESS_DAYS 一致", () => {
    const readme = readFileSync(join(ROOT, "tools/exit-drill/README.md"), "utf8");
    const cited = [...readme.matchAll(/上限 (\d+) 天/g)].map((match) => Number(match[1]));
    expect(cited.length, "README 沒有寫上限 —— 這條測試等於沒在看").toBeGreaterThan(0);
    expect(cited).toEqual(cited.map(() => FRESHNESS_DAYS));
  });
});
