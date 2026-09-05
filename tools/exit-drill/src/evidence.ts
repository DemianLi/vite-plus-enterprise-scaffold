import { UPSTREAM } from "./drill-workspace.ts";
import type { Evidence } from "./freshness.ts";
import type { Fingerprint } from "./tree-fingerprint.ts";

/**
 * 把演練的結果湊成一份 `evidence.json`。
 *
 * 純函式：`cli.ts` 跑完 npm／vite／vitest 之後把看到的東西交進來，這裡決定
 * `result` 是什麼、`tests` 寫幾、缺了什麼要補一步失敗。寫檔與 `vp fmt` 留在 `cli.ts`。
 *
 * ── 為什麼要抽出來 ──────────────────────────────────────────────────
 *
 * `--full` 進不了沙盒（連網、分鐘級；`--full --root` 由 C184 拒絕），所以 C185 之前
 * 「怎麼組證據」這段邏輯沒有任何測試碰得到：`steps.every` 換成 `steps.some`、拿掉
 * 「撈不到測試數就補一步失敗」那條守衛，兩顆變異都是零紅（C185 §六）。而那條守衛
 * 擋的是這份證據最貴的假綠 —— 一份 `result: "pass"`、`tests: 0` 的證據**看起來很正常**。
 *
 * ⚠️ 「指紋在演練開始之前取」這條順序不變量這裡量不到：`fingerprint` 是傳進來的，
 * 誰先誰後由 `cli.ts` 的 `runFull` 決定，守它的仍然只有那裡的註解。
 */

export type DrillStep = readonly [name: string, ok: boolean];

export interface TestCounts {
  readonly tests: number;
  readonly testFiles: number;
}

export interface DrillOutcome {
  readonly steps: readonly DrillStep[];
  /** `parseTestCounts` 的結果；`null` 是撈不到摘要行，不是零條。 */
  readonly counts: TestCounts | null;
  readonly expectedFailures: number;
  readonly fingerprint: Fingerprint;
  readonly catalog: Readonly<Record<string, string>>;
  readonly exitSurface: readonly string[];
  /** `Date.now()` 兩次：開始與結束。時鐘由呼叫端給，這裡才測得到日期與秒數。 */
  readonly startedAt: number;
  readonly now: number;
}

export interface AssembledEvidence {
  readonly evidence: Evidence;
  /** 最終的步驟表 —— 可能比傳進來的多一列（見 `missingCounts`）。 */
  readonly steps: readonly DrillStep[];
  /**
   * 每一步都過了、卻撈不到測試數。這是唯一會讓證據在這裡被判失敗的情況：
   * 其他失敗都已經是 `steps` 裡的一列。呼叫端看到它要把實際擷取到的輸出印出來。
   */
  readonly missingCounts: boolean;
}

export const EVIDENCE_NOTE =
  "以上游 Vite/Vitest 重建 apps/console 與全部 platform、features 的測試，" +
  "設定檔由本演練重新產生，應用程式原始碼一字未改。" +
  "expectedFailures 是登記在 EXPECTED_FAILURES 裡、因為演練替換掉它們要問的" +
  "那個東西而必然失敗的條數（C148）—— 它們照跑，只是失敗被逐條對過帳。";

export function assembleEvidence(outcome: DrillOutcome): AssembledEvidence {
  // 撈不到就當成失敗的一步，而不是安靜地寫下 tests: 0。
  // 只在其餘每一步都過的時候補：其他情況 `result` 已經是 fail，多一列只是噪音。
  const missingCounts = outcome.counts === null && outcome.steps.every(([, ok]) => ok);
  const steps: readonly DrillStep[] = missingCounts
    ? [...outcome.steps, ["撈取測試數", false]]
    : outcome.steps;

  const passed = steps.every(([, ok]) => ok);

  const evidence: Evidence = {
    lastRun: new Date(outcome.now).toISOString().slice(0, 10),
    result: passed ? "pass" : "fail",
    replaced: { "vite-plus": outcome.catalog["vite-plus"] ?? "unknown" },
    upstream: UPSTREAM,
    exitSurface: outcome.exitSurface,
    durationSeconds: Math.round((outcome.now - outcome.startedAt) / 1000),
    tests: outcome.counts?.tests ?? 0,
    testFiles: outcome.counts?.testFiles ?? 0,
    expectedFailures: outcome.expectedFailures,
    treeHash: outcome.fingerprint.hash,
    treeFiles: outcome.fingerprint.files,
    note: EVIDENCE_NOTE,
  };

  return { evidence, steps, missingCounts };
}
