import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FEATURE, ALL_GREEN } from "./fixture.ts";

const CLI = resolve(fileURLToPath(import.meta.url), "../../src/cli.ts");
const REPO = resolve(fileURLToPath(import.meta.url), "../../../..");

function run(args: readonly string[]): { status: number; out: string } {
  const result = spawnSync("node", [CLI, ...args], { encoding: "utf8" });
  return { status: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

describe("說明文字裡的指令要是真的跑得動的", () => {
  it("--help 給的是完整可複製的兩步，不是一條會退出的半截指令", () => {
    const { status, out } = run(["--help"]);
    expect(status).toBe(0);
    expect(out).toContain("--reporter=json");
    expect(out).toContain("--outputFile=.vitest-results.json");
  });
});

describe("真的 repo（目前沒有任何切片有規格）", () => {
  const resultsPath = join(tmpdir(), `spec-report-empty-${process.pid}.json`);
  const reportPath = join(tmpdir(), `spec-report-empty-${process.pid}.md`);

  beforeAll(() => {
    writeFileSync(resultsPath, JSON.stringify({ testResults: [] }));
  });
  afterAll(() => {
    rmSync(resultsPath, { force: true });
    rmSync(reportPath, { force: true });
  });

  /**
   * ⚠️ 空不是錯誤 —— 既有兩個切片刻意沒有規格（C114 §六）。
   * 而這一條同時在驗**事實來源那條路徑走得通**：`git ls-files` 在真的 repo 上
   * 跑得起來、glob 對得上、不炸。
   */
  it("空樹 exit=0，而且說得出為什麼是空的", () => {
    const { status, out } = run(["--report", reportPath, "--root", REPO]);
    expect(status).toBe(0);
    expect(out).toContain("版控中的");
  });

  /**
   * ⚠️ 實測撞到的：`vp create slice` 產完切片、還沒 `git add`，跑這支工具會說
   * 「沒有規格」—— 而規格檔明明就在磁碟上。事實來源不換（C73／C98 裁決過，
   * 讀磁碟會讓本機綠、CI 紅），所以要改的是訊息：它必須自己說出這個出口，
   * 否則第一次用的人只會覺得工具壞了。
   */
  it("空的訊息要自己說出「還沒 git add」這個出口", () => {
    const { out } = run(["--report", reportPath, "--root", REPO]);
    expect(out).toContain("git add");
    expect(out).toContain("git ls-files");
  });
});

describe("有規格的樹", () => {
  let root: string;
  let resultsPath: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "spec-report-"));
    mkdirSync(join(root, "features/order/specs"), { recursive: true });
    writeFileSync(join(root, "features/order/specs/order.feature"), FEATURE);
    // 事實來源是 git ls-files，所以 fixture 必須真的進 index —— 不 commit 也行。
    spawnSync("git", ["init", "-q"], { cwd: root });
    spawnSync("git", ["add", "-A"], { cwd: root });

    // 結果檔住在切片自己的目錄 —— 相對路徑的 --outputFile 就會落在那裡。
    resultsPath = join(root, "features/order/.vitest-results.json");
    writeFileSync(resultsPath, JSON.stringify(ALL_GREEN));
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("產生報表，完成率算得出來，待辦不擋", () => {
    const { status, out } = run(["--root", root]);
    expect(status).toBe(0);
    expect(out).toContain("完成率 3/4");

    const report = readFileSync(join(root, "SPEC-REPORT.md"), "utf8");
    expect(report).toContain("| order | 3 | 1 | 0 | 0 | 75.0%");
  });

  it("--check 對上剛產生的報表是綠的", () => {
    run(["--root", root]);
    const { status, out } = run(["--root", root, "--check"]);
    expect(status).toBe(0);
    expect(out).toContain("與現況一致");
  });

  /**
   * ⚠️ 第一版在 `--check` 不一致時直接 return，於是場景紅了的時候，畫面上只有
   * 「報表過期了，重新產生一次」—— **紅的那幾條一個字都沒有**。那個人會照做、
   * 產出一份記著 🔴 的報表、commit，然後在下一次執行才看到真正的失敗。
   * 與「未執行的兩個成因」同一個形狀：兩個成因、相反的修法、同一句話。
   */
  it("--check 不一致時仍然印出紅的那幾條，不是只說「報表過期」", () => {
    run(["--root", root]);
    const red = structuredClone(ALL_GREEN) as {
      testResults: { assertionResults: { title: string; status: string }[] }[];
    };
    const target = red.testResults
      .flatMap((file) => file.assertionResults)
      .find((assertion) => assertion.title === "那麼 應該列出 2 筆") as { status: string };
    target.status = "failed";
    writeFileSync(resultsPath, JSON.stringify(red));

    const { status, out } = run(["--root", root, "--check"]);
    expect(status).toBe(1);
    expect(out, "紅的那一條要看得到").toContain("以關鍵字篩選[A,2]");
    expect(out, "訊息要說得出報表為什麼對不上").toContain("上面那幾條就是原因");
    writeFileSync(resultsPath, JSON.stringify(ALL_GREEN));
  });

  /**
   * ⚠️ **`--reporter=default` 不是多餘的。** 只給 `--reporter=json` 的話，
   * json reporter 會**取代**主控台輸出：一條紅測試在畫面上連名字都不會出現，
   * 只剩 `vp run: N failed` 這個數字。那會讓這條線每一次測試失敗的診斷路徑
   * 都變瞎 —— 不只是規格那一種。實測見 C115 §十一。
   */
  it("教人跑的那條指令帶著 --reporter=default，否則紅燈會變成一個數字", () => {
    const { out } = run(["--help"]);
    expect(out).toContain("--reporter=default --reporter=json");
  });

  it("報表過期時 --check 紅，而且指出重新產生的做法", () => {
    run(["--root", root]);
    writeFileSync(join(root, "SPEC-REPORT.md"), "# 被人手改過\n");
    const { status, out } = run(["--root", root, "--check"]);
    expect(status).toBe(1);
    expect(out).toContain("重新產生");
  });

  it("報表不存在時 --check 紅 —— 不會安靜地當作沒事", () => {
    rmSync(join(root, "SPEC-REPORT.md"), { force: true });
    const { status, out } = run(["--root", root, "--check"]);
    expect(status).toBe(1);
    expect(out).toContain("找不到");
  });

  /**
   * ⚠️ 未執行必須是**非零退出**。它的症狀與全綠一模一樣（測試通過、場景沒跑），
   * 所以如果它不擋，這支工具就完全看不見 C114 §二 那個失敗。
   */
  /**
   * ⚠️ 「未執行」有兩個成因，修法完全相反 —— 訊息把它們搞混，人就會被送去
   * 錯的方向（C95 修過同一種病）。第二種是 C114 §二 那個靜默失效，
   * 而它的症狀是**測試本身全綠**：叫那個人「先跑一次測試」，
   * 他會跑出一片綠然後更困惑。
   */
  it("結果檔在、場景不在 → 說的是接線斷了，不是叫人去跑測試", () => {
    writeFileSync(
      resultsPath,
      JSON.stringify({
        testResults: [
          {
            name: "features/order/tests/order.test.ts",
            assertionResults: [
              { ancestorTitles: ["order 切片契約"], title: "無關的測試", status: "passed" },
            ],
          },
        ],
      }),
    );
    const { status, out } = run(["--root", root]);
    expect(status).toBe(1);
    expect(out).toContain("測試跑了，規格沒跑");
    expect(out).toContain(".spec.ts");
    expect(out).not.toContain("跑一次測試留下結果");
    writeFileSync(resultsPath, JSON.stringify(ALL_GREEN));
  });

  it("結果檔不存在 → 全部未執行、exit=1，而且教你怎麼產生它", () => {
    rmSync(resultsPath, { force: true });
    const { status, out } = run(["--root", root]);
    expect(status).toBe(1);
    expect(out).toContain("未執行 3");
    expect(out).toContain("--outputFile=.vitest-results.json");
    writeFileSync(resultsPath, JSON.stringify(ALL_GREEN));
  });
});
