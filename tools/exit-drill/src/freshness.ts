import { checkDocumentedCounts, type DocumentSource } from "./counts.ts";
import { compareFingerprint, type Fingerprint } from "./tree-fingerprint.ts";

/**
 * 證據新不新鮮 —— 靜態模式最後那張判斷表（C183）。
 *
 * ── 為什麼是純函式 ─────────────────────────────────────────────────
 *
 * 這張表原本住在 `cli.ts` 的 `checkFreshness()` 裡：讀檔、`Date.now()`、`git ls-files`
 * 算指紋、`console.*`、`--require-fresh` 讀三處，全部混在一起，於是沒有一條本機測試
 * 測得到它 —— C180 §六 M7 把三處一起無視是零紅，C183 §六 逐一無視也是三個零。
 * 這支 CLI 沒有 `--root`，spawn 它只能跑真樹，而真樹的證據是新鮮的。
 *
 * 所以讀進來的東西全由呼叫端給（證據、時鐘、指紋、文件），這裡只回答「結束碼是幾、
 * 要印哪幾行」。印與離開留給 `cli.ts`。
 *
 * ── 順序有意義 ─────────────────────────────────────────────────────
 *
 * 失敗檢查在過期之前、過期在指紋之前：又失敗又過期的證據印的是「失敗」那句，
 * 因為那才是要修的東西。`tests/freshness.test.ts` 守著這個順序。
 */

export const FRESHNESS_DAYS = 120;

export interface Evidence {
  readonly lastRun: string;
  readonly result: "pass" | "fail";
  readonly replaced: Record<string, string>;
  readonly upstream: Record<string, string>;
  readonly exitSurface: readonly string[];
  readonly durationSeconds: number;
  /** 演練跑過的測試數。文件裡引用的那個數字，唯一的來源就是這裡（見 checkDocumentedCounts）。 */
  readonly tests: number;
  readonly testFiles: number;
  /**
   * 登記在 `EXPECTED_FAILURES` 裡、這次如期失敗的條數（C148 §五）。
   *
   * ⚠️ 與 `tests` 分開記，因為它們是兩種主張：`tests` 是「退到上游之後照樣
   * 通過的條數」，這一個是「因為演練換掉了它要問的東西而必然失敗的條數」。
   * 合成一個數字的話，帳目膨脹起來不會有人看得出來。
   */
  readonly expectedFailures: number;
  /**
   * 演練涵蓋範圍的內容指紋，以及進到指紋裡的檔案數（C149）。
   *
   * ⚠️ 檔案數不是說明文字，是**對照組**：0 個檔案在兩邊會算出同一個空雜湊，
   * 然後「相符」—— 見 tree-fingerprint.ts。
   */
  readonly treeHash?: string;
  readonly treeFiles?: number;
  readonly note: string;
}

export interface FreshnessInput {
  /** `evidence.json` 的內容；檔案不存在給 `null`。解析失敗是呼叫端的事。 */
  readonly evidence: Evidence | null;
  /** `Date.now()`。 */
  readonly now: number;
  /** 今天這棵樹的指紋 —— 只在證據通過前兩關之後才會被看。 */
  readonly current: () => Fingerprint;
  /** 引用演練成績的文件，已讀好內容。 */
  readonly documents: () => readonly DocumentSource[];
  /** `--require-fresh`：日期與舊格式在排程上要紅，見 README「日期那一半的兩條路」。 */
  readonly requireFresh: boolean;
}

export interface OutputLine {
  readonly level: "log" | "warn" | "error";
  readonly text: string;
}

export interface FreshnessVerdict {
  readonly code: 0 | 1;
  readonly lines: readonly OutputLine[];
}

export function judgeFreshness(input: FreshnessInput): FreshnessVerdict {
  const { evidence, requireFresh } = input;
  const lines: OutputLine[] = [];
  const stop = (code: 0 | 1): FreshnessVerdict => ({ code, lines });

  if (evidence === null) {
    lines.push({
      level: "warn",
      text: "⚠ 尚未跑過完整退出演練（R9）。執行：node tools/exit-drill/src/cli.ts --full",
    });
    return stop(requireFresh ? 1 : 0);
  }

  const ageDays = Math.floor((input.now - Date.parse(evidence.lastRun)) / 86_400_000);

  if (evidence.result !== "pass") {
    lines.push({ level: "error", text: `✗ 最後一次退出演練是失敗的（${evidence.lastRun}）` });
    return stop(1);
  }

  if (ageDays > FRESHNESS_DAYS) {
    const message =
      `⚠ 退出演練證據已過期：最後一次 ${evidence.lastRun}（${ageDays} 天前，上限 ${FRESHNESS_DAYS} 天）。\n` +
      "  過期的演練不是控制措施，只是一段曾經跑過的程式碼。";
    if (requireFresh) {
      lines.push({ level: "error", text: `✗ ${message}` });
      return stop(1);
    }
    lines.push({ level: "warn", text: message });
    return stop(0);
  }

  // ⚠️ **這一行原本只問「幾天前」，而它是肯定句。** 併線讓樹變兩倍之後，
  // 它連續 10 天印「✓ 證據有效」——「幾天前」答不出「同一棵樹嗎」（C148 §七）。
  const verdict = compareFingerprint(evidence, input.current());

  if (verdict.kind === "empty") {
    lines.push({ level: "error", text: `✗ ${verdict.message}` });
    return stop(1);
  }

  if (verdict.kind === "match") {
    lines.push({
      level: "log",
      text: `✓ 退出演練證據有效（${evidence.lastRun}，${ageDays} 天前）—— ${verdict.message}`,
    });
  } else {
    // ⚠️ **drift 刻意不 fail，連 --require-fresh 都不 fail**（C149 §二）：
    // 實測最近 60 支 main commit 有 25 支動到涵蓋路徑（42%），擋它等於把每季
    // 一次的控制措施變成每次合併的阻斷器 —— 那種閘門會先被繞過、再被忽略。
    // `unrecorded` 是舊格式的過渡狀態，那一個在排程上要紅，否則它會一直躺著。
    const line = `退出演練證據 ${evidence.lastRun}（${ageDays} 天前）：${verdict.message}`;
    if (verdict.kind === "unrecorded" && requireFresh) {
      lines.push({ level: "error", text: `✗ ${line}` });
      return stop(1);
    }
    lines.push({ level: "warn", text: `⚠ ${line}` });
  }

  // 舊的 evidence.json 沒有 tests 欄位（C36 之前產生的）。那種情況跳過比較，
  // 而不是拿 undefined 去比出一堆假紅燈 —— 下一次 --full 會自動補上。
  if (typeof evidence.tests !== "number" || evidence.tests === 0) {
    lines.push({
      level: "warn",
      text: "⚠ evidence.json 沒有測試數，文件比對跳過。下次 --full 會補上。",
    });
    return stop(0);
  }

  const documents = input.documents();
  const countErrors = checkDocumentedCounts(documents, evidence.tests);
  if (countErrors.length > 0) {
    lines.push({ level: "error", text: "\n✗ 文件引用的演練成績與證據不符\n" });
    for (const error of countErrors) lines.push({ level: "error", text: `  ✗ ${error}` });
    lines.push({
      level: "error",
      text:
        "\n  這個數字是拿去跟採購與稽核講的話，而它被抄在好幾份文件裡。\n" +
        "  每季重跑一次演練它就會變，於是那幾處同時變成錯的 ——\n" +
        "  這個 repo 在「人抄下來的數字沒有人再推導一次」上已經栽了六次。\n\n" +
        `  唯一的事實來源是 evidence.json 的 tests（目前 ${evidence.tests}）。\n` +
        "  請把上列位置改成該數字；如果是演練本身該重跑，執行 vpr exit-drill。\n",
    });
    return stop(1);
  }

  lines.push({
    level: "log",
    text: `✓ 文件引用的演練成績與證據一致（${evidence.tests} 個測試，${documents.length} 份）`,
  });
  return stop(0);
}
