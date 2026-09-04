import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot, runCli, sandbox } from "@org/gate-kit/testing";

import { FEATURE, ALL_GREEN } from "./fixture.ts";

const CLI = "tools/spec-report/src/cli.ts";
const REPO = repoRoot();

function run(args: readonly string[]): { status: number; out: string } {
  const result = runCli(CLI, args);
  return { status: result.status ?? -1, out: result.output };
}

describe("說明文字裡的指令要是真的跑得動的", () => {
  it("--help 給的是完整可複製的兩步，不是一條會退出的半截指令", () => {
    const { status, out } = run(["--help"]);
    expect(status).toBe(0);
    expect(out).toContain("--reporter=json");
    expect(out).toContain("--outputFile=.vitest-results.json");
  });
});

describe("真的 repo —— 事實來源那條路徑走得通", () => {
  let reportPath: string;
  beforeAll(() => {
    reportPath = join(sandbox({ prefix: "spec-report-real-", lifetime: "all" }).root, "report.md");
  });

  /**
   * ⚠️ **這一組原本斷言「真的 repo 上一個切片規格都沒有」，而那個前提在
   * `features/invoice` 進版控的那一刻死掉了**（C165）。它一直是對的，只是
   * 它對的理由是「這棵樹剛好還沒有人用過這條線」—— 不是這支工具的性質。
   *
   * 留下來的是它真正在守的東西：`git ls-files` 在真的 repo 上跑得起來、
   * glob（`features/*&#47;specs/*.feature`）對得上、路徑的中文不炸（C112）。
   *
   * ⚠️ 刻意**不驗退出碼**：那要看 `.vitest-results.json` 在不在，而那是排程
   * 的事（C87），不是這條路徑的事。驗它會讓這一條在乾淨 clone 上偽紅。
   */
  it("git ls-files 在真的 repo 上找得到版控中的規格", () => {
    const { out } = run(["--report", reportPath, "--root", REPO]);
    expect(out, "版控裡的切片規格要被找到").toContain("invoice");
  });
});

describe("空的樹 —— 空不是錯誤", () => {
  let root: string;

  beforeAll(() => {
    root = sandbox({ prefix: "spec-report-empty-", git: true, lifetime: "all" }).root;
  });

  /** ⚠️ 空不是錯誤 —— 既有兩個切片刻意沒有規格（C114 §六）。 */
  it("空樹 exit=0，而且說得出為什麼是空的", () => {
    const { status, out } = run(["--root", root]);
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
    const { out } = run(["--root", root]);
    expect(out).toContain("git add");
    expect(out).toContain("git ls-files");
  });

  /**
   * 🔴 對照：磁碟上有規格、但沒 `git add`，仍然要判空。
   * 少了這一條，事實來源被改成 `readdirSync` 上面兩條照樣綠。
   */
  it("🔴 檔案在磁碟上但沒進 index → 仍然是空的", () => {
    mkdirSync(join(root, "features/ghost/specs"), { recursive: true });
    writeFileSync(join(root, "features/ghost/specs/ghost.feature"), FEATURE);
    const { status, out } = run(["--root", root]);
    expect(status).toBe(0);
    expect(out).toContain("版控中的");
    rmSync(join(root, "features/ghost"), { recursive: true, force: true });
  });
});

describe("有規格的樹", () => {
  let root: string;
  let resultsPath: string;

  beforeAll(() => {
    // 事實來源是 git ls-files，所以 fixture 必須真的進 index —— 不 commit 也行。
    const box = sandbox({
      prefix: "spec-report-",
      files: { "features/order/specs/order.feature": FEATURE },
      git: true,
      lifetime: "all",
    });
    root = box.root;

    // 結果檔住在切片自己的目錄 —— 相對路徑的 --outputFile 就會落在那裡。
    resultsPath = join(root, "features/order/.vitest-results.json");
    writeFileSync(resultsPath, JSON.stringify(ALL_GREEN));
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

/**
 * ── 兩道閘門的互斥（C165）──────────────────────────────────────────
 *
 * `vpr ready` 第 1 步是 `vp check`（oxfmt），第 5 步是這支工具的 `--check`。
 * 報表進版控、而 oxfmt 會把它的表格補上對齊空白 —— 逐位元組比的話兩個方向
 * 都紅：排版過就說「報表過期」，重新產生就說「沒排版」。
 *
 * ⚠️ **這個缺陷從 C115 就在了，只是一直沒發作** —— 報表在第一個帶規格的
 * 切片進版控之前一列表格都沒有，兩支工具從來沒碰過同一行。
 *
 * ⚠️ 這裡的 padding 是**手工補的**，不 spawn `vp fmt`：閘門與它的測試不依賴
 * 驅動層（D2）。逐格寬度對不對由 `report.test.ts` 那組樣本負責，這裡驗的是
 * **兩半都要在** —— 比對放寬了、但寫檔還是無條件覆寫的話，下一步照樣紅。
 */
describe("報表的排版歸 oxfmt，內容歸這支工具", () => {
  let root: string;

  beforeAll(() => {
    root = sandbox({
      prefix: "spec-report-fmt-",
      files: { "features/order/specs/order.feature": FEATURE },
      git: true,
      lifetime: "all",
    }).root;
    writeFileSync(join(root, "features/order/.vitest-results.json"), JSON.stringify(ALL_GREEN));
  });

  /** 把產出的表格列補上空白，模擬 oxfmt 排版過的樣子。 */
  function pad(text: string): string {
    return text
      .split("\n")
      .map((line) => (line.startsWith("|") ? line.replaceAll(" | ", "   |   ") : line))
      .join("\n");
  }

  const report = (): string => join(root, "SPEC-REPORT.md");

  it("排版過的報表，--check 仍然綠", () => {
    run(["--root", root]);
    writeFileSync(report(), pad(readFileSync(report(), "utf8")));
    const { status, out } = run(["--root", root, "--check"]);
    expect(status, out).toBe(0);
    expect(out).toContain("與現況一致");
  });

  it("而再產生一次不會把排版洗掉 —— 內容沒變就不重寫", () => {
    run(["--root", root]);
    const padded = pad(readFileSync(report(), "utf8"));
    writeFileSync(report(), padded);
    run(["--root", root]);
    expect(readFileSync(report(), "utf8"), "重寫了 padding 就會在下一步 vp check 紅").toBe(padded);
  });

  /**
   * 🔴 對照，而且是**內容真的變了**那一種：上面兩條放寬的是空白，
   * 放寬過頭的話這一條會綠。它必須逐條盯著兩個出口 ——
   * `--check` 要紅，而且不帶 `--check` 那一趟要真的把檔案改回來。
   */
  it("🔴 對照：內容真的過期時，--check 紅、而且重新產生會覆寫", () => {
    // ⚠️ 前一條測試把檔案留成排版過的，而這支工具「內容沒變就不重寫」——
    // 直接 run 拿到的會是**那一份**，不是產生器的輸出。先刪掉再產生。
    rmSync(report(), { force: true });
    run(["--root", root]);
    const fresh = readFileSync(report(), "utf8");
    const stale = pad(fresh).replace("75.0%", "25.0%");
    expect(stale, "樣本沒改到東西的話這一條驗不到任何事").not.toBe(pad(fresh));

    writeFileSync(report(), stale);
    const { status } = run(["--root", root, "--check"]);
    expect(status, "內容過期了卻說一致").toBe(1);

    run(["--root", root]);
    expect(readFileSync(report(), "utf8")).toBe(fresh);
  });
});
