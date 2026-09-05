import { describe, expect, it } from "vitest";

import { UPSTREAM } from "../src/drill-workspace.ts";
import { assembleEvidence, EVIDENCE_NOTE, type DrillOutcome } from "../src/evidence.ts";
import { fingerprintOf } from "../src/tree-fingerprint.ts";

/**
 * 「怎麼組證據」（`src/evidence.ts`）。
 *
 * C185 之前這段住在 `runFull` 裡，而 `--full` 進不了沙盒：`result` 的判法與
 * 「撈不到測試數就補一步失敗」那條守衛都是零紅（§六）。後者擋的是一份
 * `pass` 且 `tests: 0` 的證據 —— 它看起來很正常，然後被拿去給稽核看。
 */

const FINGERPRINT = fingerprintOf([
  { path: "apps/console/src/main.ts", sha256: "a".repeat(64) },
  { path: "platform/ui/src/index.ts", sha256: "b".repeat(64) },
]);

const STARTED = Date.UTC(2026, 8, 6, 3, 0, 0);

function outcome(overrides: Partial<DrillOutcome> = {}): DrillOutcome {
  return {
    steps: [
      ["npm install", true],
      ["vite build", true],
      ["產物與本 repo 同級", true],
      ["vitest run（對過預期失敗帳）", true],
    ],
    counts: { tests: 540, testFiles: 19 },
    expectedFailures: 5,
    fingerprint: FINGERPRINT,
    catalog: { "vite-plus": "0.2.9" },
    exitSurface: ["vite.config.ts", "apps/console/vite.config.ts"],
    startedAt: STARTED,
    now: STARTED + 30_400,
    ...overrides,
  };
}

describe("assembleEvidence", () => {
  it("每一步都過、撈得到測試數 → pass，欄位逐一來自它該來的地方", () => {
    const { evidence, steps, missingCounts } = assembleEvidence(outcome());
    expect(missingCounts).toBe(false);
    expect(steps).toHaveLength(4);
    expect(evidence).toEqual({
      lastRun: "2026-09-06",
      result: "pass",
      replaced: { "vite-plus": "0.2.9" },
      upstream: UPSTREAM,
      exitSurface: ["vite.config.ts", "apps/console/vite.config.ts"],
      durationSeconds: 30,
      tests: 540,
      testFiles: 19,
      expectedFailures: 5,
      treeHash: FINGERPRINT.hash,
      treeFiles: 2,
      note: EVIDENCE_NOTE,
    });
  });

  it.each([0, 1, 2, 3])("★ 第 %i 步紅 → fail，其餘步驟照記", (index) => {
    const steps = outcome().steps.map(([name, ok], i) => [name, i === index ? false : ok] as const);
    const { evidence } = assembleEvidence(outcome({ steps }));
    expect(evidence.result).toBe("fail");
    expect(evidence.tests).toBe(540);
  });

  it("★ 每一步都過、卻撈不到測試數 → 補一步「撈取測試數」失敗，result 是 fail 而不是 tests: 0 的 pass", () => {
    const { evidence, steps, missingCounts } = assembleEvidence(outcome({ counts: null }));
    expect(missingCounts).toBe(true);
    expect(steps).toHaveLength(5);
    expect(steps[4]).toEqual(["撈取測試數", false]);
    expect(evidence.result).toBe("fail");
    expect(evidence.tests).toBe(0);
    expect(evidence.testFiles).toBe(0);
  });

  it("已經有一步紅了、撈不到測試數 → 不補那一步（result 本來就是 fail）", () => {
    const { steps, missingCounts } = assembleEvidence(
      outcome({ counts: null, steps: [["npm install", false]] }),
    );
    expect(missingCounts).toBe(false);
    expect(steps).toEqual([["npm install", false]]);
  });

  it("指紋原樣寫入：treeHash 與 treeFiles 都來自傳進來的那一份", () => {
    const empty = fingerprintOf([]);
    const { evidence } = assembleEvidence(outcome({ fingerprint: empty }));
    expect(evidence.treeHash).toBe(empty.hash);
    expect(evidence.treeFiles).toBe(0);
  });

  it("秒數四捨五入、日期取 UTC 那一天", () => {
    const { evidence } = assembleEvidence(outcome({ now: STARTED + 89_600 }));
    expect(evidence.durationSeconds).toBe(90);
    expect(evidence.lastRun).toBe("2026-09-06");
  });
});
