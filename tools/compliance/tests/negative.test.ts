import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot, runCli, sandbox } from "@org/gate-kit/testing";

import { CONTROLS, GATES, type Control, type Gate } from "../src/map.ts";
import { conventionalNegativeTest, verifyMap } from "../src/verify.ts";

/**
 * 法遵對照表的**反向測試**。
 *
 * ── 這支比其他反向測試更需要存在 ────────────────────────────────────
 *
 * 這張表的用途是回答稽核的「你怎麼知道這個檢查真的有在檢查」。
 * 一張自己都沒被檢查過的對照表，等於用一個沒有根據的斷言去擔保另外十個 ——
 * 而它印出來的樣子和真的一模一樣。
 *
 * ── 兩個方向都要驗，而且**低估**那一邊更容易被忽略 ──────────────────
 *
 *   高估：宣告有反向測試但檔案不存在 → 表上寫「已證明」而實際沒有。危險。
 *   低估：補了測試卻沒更新映射       → 表上永遠掛著一個假的洞。
 *
 * 第二個看起來無害，所以第一版很容易只寫第一個。但假的洞會讓真的洞失去
 * 意義：一旦有人習慣「那幾格本來就是紅的」，這張表就沒有人在讀了。
 */

const ROOT = repoRoot();
const CLI = "tools/compliance/src/cli.ts";

function makeSandbox(): string {
  return sandbox({ prefix: "compliance-negative-" }).root;
}

interface Result {
  readonly red: boolean;
  readonly output: string;
}

/**
 * ⚠️ 這幾條測試的耗時是**牆鐘時間，不是邏輯複雜度**。
 *
 * 每一條都 spawn 一個 node 行程，而那個行程會把輸出交給 `vp fmt` 排版 ——
 * formatter 才是權威（與 api-surface 同一課）。於是耗時隨 repo 大小成長，
 * 與這幾條測試驗的東西完全無關。
 *
 * 實測：本機約 1.2 秒／條。加進 platform/pii 與 tools/pii-check 之後，
 * CI 的冷啟動 runner 上跨過了 vitest 預設的 5 秒，於是對照組那一條
 * **在本機全綠的情況下於 CI 逾時** —— 而訊息是「Test timed out」，
 * 看起來像測試壞了，不像 repo 變大了。
 *
 * 提高上限而不是拆掉這幾條：它們驗的是「手改 COMPLIANCE.md 會被抓到」，
 * 那件事只有真的跑一次 CLI 才驗得到。
 */
const CLI_TIMEOUT_MS = 30_000;

function run(args: readonly string[]): Result {
  const result = runCli(CLI, args);
  return { red: result.status !== 0, output: result.output };
}

/** 一組乾淨的最小映射，用來把每個破壞隔離開來。 */
const GATE: Gate = {
  id: "demo",
  kind: "gate",
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

/** 預設什麼檔案都不存在 —— 每個案例只把自己需要的那幾個打開。 */
const nothingExists = (): boolean => false;

describe("verifyMap：高估方向（危險的那一邊）", () => {
  it("宣告有反向測試但檔案不存在 → 報錯", () => {
    const errors = verifyMap(
      [{ ...GATE, negativeTest: "tools/demo/tests/negative.test.ts" }],
      [CONTROL],
      nothingExists,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("宣告有反向測試");
    // 訊息必須點出方向，否則讀的人不知道哪一種漂移比較急。
    expect(errors[0]).toContain("危險的方向");
  });

  it("宣告的證據檔不存在 → 報錯", () => {
    const errors = verifyMap(
      [{ ...GATE, evidence: "tools/demo/evidence.json" }],
      [CONTROL],
      nothingExists,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("證據檔不存在");
  });
});

describe("verifyMap：低估方向（假的洞）", () => {
  it("宣告未證明、但慣例路徑存在 → 報錯", () => {
    const errors = verifyMap(
      [GATE],
      [CONTROL],
      (path) => path === conventionalNegativeTest("demo"),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("假的洞");
  });

  it("★ 宣告未證明、慣例路徑也不存在 → 不得報錯", () => {
    // 這是絕大多數閘門現在的狀態。誤報這一種，整張表第一天就會被關掉。
    expect(verifyMap([GATE], [CONTROL], nothingExists)).toHaveLength(0);
  });
});

describe("verifyMap：映射自己寫錯", () => {
  it("條號引用不存在的閘門 id → 報錯", () => {
    const errors = verifyMap([GATE], [{ ...CONTROL, gates: ["typo"] }], nothingExists);

    expect(errors.some((error) => error.includes("不存在的閘門 id"))).toBe(true);
  });

  it("閘門 id 重複 → 報錯", () => {
    const errors = verifyMap([GATE, GATE], [CONTROL], nothingExists);

    expect(errors.some((error) => error.includes("id 重複"))).toBe(true);
  });

  it("★ 沒有引用任何閘門的條號不算違規", () => {
    // §11 II ①②④⑧ 就是這種：責任在後端或營運，不是前端的洞。
    expect(verifyMap([GATE], [{ ...CONTROL, gates: [] }], nothingExists)).toHaveLength(0);
  });
});

describe("對照組：真實映射對真實檔案系統", () => {
  /**
   * ⚠️ 這一條必須過，否則上面每一條都沒有意義 ——
   * 假的 `exists` 能讓判定看起來對，但無法證明真的映射沒寫錯路徑。
   */
  it("repo 現況零錯誤", () => {
    const errors = verifyMap(GATES, CONTROLS, (path) => existsSync(join(ROOT, path)));
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  it("映射真的有內容（空陣列也會零錯誤，那是假綠燈）", () => {
    expect(GATES.length).toBeGreaterThan(0);
    expect(CONTROLS.length).toBeGreaterThan(0);
  });
});

describe(
  "CLI：手改 COMPLIANCE.md 會被抓到",
  () => {
    /**
     * 破壞的是**暫存目錄裡的副本**，走 `--file`。
     * repo 的 COMPLIANCE.md 一個位元組都不會被動到。
     */
    function generateInto(dir: string): string {
      const path = join(dir, "COMPLIANCE.md");
      const result = run(["--update", "--file", path]);
      expect(result.red, result.output).toBe(false);
      return path;
    }

    it("★ 剛產出來的檔案通過驗證（對照組）", () => {
      const path = generateInto(makeSandbox());
      const result = run(["--file", path]);

      expect(result.red, result.output).toBe(false);
      expect(result.output).toContain("一致");
    });

    it("把「比較難看的那一格」改成「已證明」 → 紅", () => {
      const path = generateInto(makeSandbox());
      const before = readFileSync(path, "utf8");

      // 這正是最可能發生的手改：某一格看起來不好看，就改掉它。
      //
      // ⚠️ 刻意**不寫死**「❌ 未證明」。第一版寫死了，然後在補完 §16 的
      // 那天整張表不再有任何一格是「未證明」—— 於是這條測試因為
      // 「找不到要破壞的東西」而紅，而訊息看起來像閘門壞了。
      //
      // 一條會因為 repo 變好而失敗的測試，下一個人只會把它刪掉。
      // 改成從輸出裡挑一個「比已證明差」的標記，兩種都沒有才是真的該紅。
      const worse = ["❌ 未證明", "◐ 部分"].find((mark) => before.includes(mark));
      expect(worse, "表上沒有任何一格低於「已證明」—— 這條測試失去了破壞對象").toBeDefined();

      writeFileSync(path, before.replace(worse as string, "✅ 已證明"));

      const result = run(["--file", path]);
      expect(result.red, `仍然綠燈 —— 這張表擋不住手改\n${result.output}`).toBe(true);
      expect(result.output).toContain("高估");
    });

    it("檔案不存在 → 紅，而且要說怎麼產", () => {
      const result = run(["--file", join(makeSandbox(), "nope.md")]);

      expect(result.red).toBe(true);
      expect(result.output).toContain("--update");
    });

    // 「--file 後面沒接東西 → 紅」曾經有一條。它紅的來源是 `parseFlags`（由
    // `gate-kit/tests/flags.test.ts` 守）；`cli.ts` 的 `parseFile` 裡還有第二道同樣的
    // 檢查，但 `parseFlags` 先跑，那一道在正常路徑上到不了（C178 §五）。
  },
  CLI_TIMEOUT_MS,
);

describe(
  "repo 本身沒有被動到",
  () => {
    it("跑完之後 COMPLIANCE.md 仍與映射一致", () => {
      const path = generateAndBreak();
      expect(existsSync(path)).toBe(false);

      const result = run([]);
      expect(result.red, result.output).toBe(false);
    });

    function generateAndBreak(): string {
      const dir = makeSandbox();
      const path = join(dir, "COMPLIANCE.md");
      run(["--update", "--file", path]);
      writeFileSync(path, "壞掉的內容");
      rmSync(dir, { recursive: true, force: true });
      return path;
    }
  },
  CLI_TIMEOUT_MS,
);
