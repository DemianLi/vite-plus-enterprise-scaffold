#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFlags } from "@org/gate-kit";

import { collectInstances, type SpecFile } from "./collect.ts";
import { resolve, type VitestResults } from "./match.ts";
import { renderCli, renderReport, tally } from "./render.ts";

/**
 * 業務功能完成率 —— **驗收規格的通過率**（TESTING.md 層 3、C114）。
 *
 * ── 為什麼「完成」一定要有執行結果撐著 ──────────────────────────────
 *
 * 有一條看起來很划算的捷徑：三態的「該做了沒綠就擋」已經由 vitest 強制，
 * 所以樹是綠的時候「擋下」必定為 0，於是「完成 ＝ 全部 − 待辦」——
 * 純靠解析規格就算得出來，不需要任何執行結果。
 *
 * **不要走那條。** 這份報表會進版控、會被貼進工單與週報。從靜態資料產生的話，
 * 它對每一個沒標 `@待辦` 的場景都寫「完成」，**包括此刻正在紅的那些**，
 * 而且檔案裡沒有任何東西能分辨「跑的時候樹是綠的」與「根本沒有人查過」。
 * 那正是 `tools/doc-facts` 整支工具存在的理由，也是 C106 一句話的版本。
 *
 * 所以「完成」這一態**只從執行結果來**。讀不到某個切片的結果時，它的場景
 * 一律判「未執行」並讓這支工具回非零 —— 不是完成、也不是安靜跳過。
 *
 * ── 為什麼不自己跑 vitest ────────────────────────────────────────────
 *
 * TESTING.md 明講「不養第二套 runner」，理由不只是省事：跨套件測試在這條線上
 * 已經有排程相依（C87 用 `dependsOn` 讓開），自己 spawn 一次 vitest 就是在
 * `vpr gate` 已經跑過的地方再撞一次同一個問題。串接屬於 task 定義，不屬於這裡。
 */

const REPORT_DEFAULT = "SPEC-REPORT.md";

/** 各切片的測試結果檔。相對路徑的 `--outputFile` 會落在該 package 自己的目錄。 */
const RESULTS_FILE = ".vitest-results.json";

// ⚠️ **`--reporter=default` 不是多餘的。** 只給 `--reporter=json` 的話，
// json reporter 會**取代**主控台輸出：一條紅測試在畫面上連名字都不會出現，
// 只剩 `vp run: N failed` 這個數字（實測，C115 §十一）。
// 那會讓這條線每一次測試失敗的診斷路徑都變瞎，不只是規格那一種。
const RUN_HINT = `  vp run -r test -- --reporter=default --reporter=json --outputFile=${RESULTS_FILE}`;

const USAGE = `用法：
  node tools/spec-report/src/cli.ts [--report <path>] [--check]

先跑一次測試並留下結果：

${RUN_HINT}

  --report  <path>   報表檔位置，預設 ${REPORT_DEFAULT}
  --check            不寫檔，只比對現有報表是否與現況一致（不一致就紅）
  --results <path>   額外的結果檔（可重複）。預設讀每個切片自己的 ${RESULTS_FILE}
  --root    <path>   掃描的根目錄，預設是這個 repo（給測試用）

⚠️ 讀不到某個切片的結果時，它的場景一律判**未執行**（不是完成、也不是跳過）——
   理由寫在這支 CLI 的檔頭。`;

function repoRoot(): string {
  return resolvePath(fileURLToPath(import.meta.url), "../../../..");
}

/**
 * 樹上有哪些規格檔。
 *
 * ⚠️ 事實來源是 `git ls-files`，**不是 `readdirSync`** —— C73 裁決過，
 * 而 C98 記著違反它的代價：讀磁碟會把沒進版控的東西算進來，於是
 * 本機綠、CI 乾淨 clone 之後紅，且那種紅燈沒有合法出口。
 *
 * ⚠️ `-z` 是必要的（C112）：git 對含非 ASCII 的路徑會加引號並做八進位轉義，
 * 而規格檔的名字很可能是中文。
 */
function findSpecs(root: string): SpecFile[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "features/*/specs/*.feature"], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`[spec-report] git ls-files 失敗：${result.stderr}`);
  }

  const specs: SpecFile[] = [];
  for (const path of result.stdout.split("\0")) {
    if (path.length === 0) continue;
    const slice = path.split("/")[1];
    if (slice === undefined) continue;
    specs.push({ slice, path, text: readFileSync(resolvePath(root, path), "utf8") });
  }
  return specs;
}

/**
 * 把每個切片自己的結果檔合併成一份。
 *
 * ⚠️ **讀不到就是讀不到，不補一個空的當作沒事** —— 缺席的結果會讓那個切片的
 * 場景判成「未執行」，而那正是想要的：沒有人跑過測試的規格，不能在一份
 * 拿去對外報進度的文件裡寫「完成」。
 *
 * ⚠️ 這裡掃的是**磁碟**而不是 `git ls-files`，與 findSpecs 相反 —— 那不是疏漏：
 * 結果檔刻意不進版控（它每次跑都變），所以版控裡不會有它。
 * 事實來源用 git，暫時產物用磁碟。
 */
function readResults(
  root: string,
  specs: readonly SpecFile[],
  argv: readonly string[],
): { results: VitestResults; missing: string[] } {
  const paths = [
    ...new Set(specs.map((spec) => resolvePath(root, "features", spec.slice, RESULTS_FILE))),
  ];

  for (
    let index = argv.indexOf("--results");
    index >= 0;
    index = argv.indexOf("--results", index + 1)
  ) {
    const extra = argv[index + 1];
    if (extra !== undefined) paths.push(resolvePath(root, extra));
  }

  const merged: VitestResults["testResults"][number][] = [];
  const missing: string[] = [];
  for (const path of paths) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      missing.push(path);
      continue;
    }
    merged.push(...(JSON.parse(raw) as VitestResults).testResults);
  }

  return { results: { testResults: merged }, missing };
}

/**
 * ⚠️ **`--chec` 打錯一個字母，這支在此之前不會紅** —— 它會走「沒有 `--check`」
 * 那條分支，把報表**覆寫成當下現況**然後回 0。那道閘門於是從「報表過期就紅」
 * 變成「把報表改成永遠不過期」，而 `tier1-quality.yml` 裡那一行就是 `--check`。
 * 完整量測在 C125 §一（連 `git status` 為什麼是乾淨的都在裡面）。
 *
 * ⚠️ **`--results` 可以重複，而 `parseFlags` 只留最後一個** —— 取值仍然由
 * `readResults` 自己走 `argv`。`parseFlags` 在這裡的職責是**不認得的旗標
 * 一律失敗**，不是取值。
 */
const FLAG_SPEC = {
  check: { kind: "boolean" },
  help: { kind: "boolean" },
  report: { kind: "value", fallback: REPORT_DEFAULT, noun: "檔案路徑" },
  results: { kind: "value", noun: "檔案路徑" },
  root: { kind: "value", noun: "目錄" },
} as const;

export function main(argv: readonly string[]): number {
  const flags = parseFlags(argv, FLAG_SPEC);
  if (!flags.ok) {
    process.stderr.write(`${flags.message}\n`);
    return 1;
  }

  if (flags.flags.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const root = flags.flags.root ?? repoRoot();
  const reportPath = flags.flags.report;

  const specs = findSpecs(root);
  const { results, missing } = readResults(root, specs, argv);
  const resolved = resolve(collectInstances(specs), results);
  const content = renderReport(resolved);
  const absoluteReport = resolvePath(root, reportPath);

  // ⚠️ **狀態先印，報表檔後處理 —— 順序有意義。**
  // 第一版在 `--check` 不一致時直接 return，於是場景紅了的時候，畫面上只有
  // 「報表過期了，重新產生一次」，**紅的那幾條一個字都沒有**。那個人會照做、
  // 產出一份記著 🔴 的報表、commit，然後在下一次執行才看到真正的失敗。
  // 與 §七 同一個形狀：兩個成因、相反的修法、同一句話。
  process.stdout.write(renderCli(resolved, reportPath));

  const t = tally(resolved);
  if (t.未執行 > 0) {
    // ⚠️ **「未執行」有兩個成因，而它們的修法完全相反** —— 訊息必須分得開，
    // 否則會把人送去錯的方向（C95 修過同一種病）：
    //
    //   結果檔根本不在      → 你還沒跑測試
    //   結果檔在、場景不在  → 接線斷了（副檔名、檔名、或整個檔案 collect 失敗）
    //
    // 第二種正是 C114 §二 那個靜默失效，而它的症狀是**測試本身全綠**。
    // 叫那個人「先跑一次測試」，他會跑出一片綠然後更困惑。
    if (missing.length > 0) {
      process.stdout.write(`\n這幾個切片還沒有測試結果：\n`);
      for (const path of missing) {
        process.stdout.write(`  ${path.slice(root.length + 1)}\n`);
      }
      process.stdout.write(`\n跑一次測試留下結果，再跑一次這支工具：\n${RUN_HINT}\n`);
    } else {
      process.stdout.write(
        `\n⚠️ 結果檔在，但裡面找不到這些場景 —— **測試跑了，規格沒跑**。\n` +
          `   最常見的成因是接線檔沒有被 vitest 收集：\n` +
          `   tests/specs/ 底下的檔案必須是 \`.spec.ts\`（\`.steps.ts\` 不會被收集，\n` +
          `   而那時測試本身是全綠的 —— 見 DECISIONS.md 的 C114 §二）。\n`,
      );
    }
  }

  let staleReport = false;

  if (flags.flags.check) {
    let current: string | null = null;
    try {
      current = readFileSync(absoluteReport, "utf8");
    } catch {
      process.stderr.write(
        `\n✗ 找不到 ${reportPath}。產生它：\n    node tools/spec-report/src/cli.ts\n`,
      );
      staleReport = true;
    }
    if (current !== null && current !== content) {
      // ⚠️ 訊息要說得出**兩種**成因，因為修法不同：報表真的忘了更新，
      // 或是某個場景換了狀態（上面已經印出來了）。只講前者，讀的人會以為
      // 重新產生一次就沒事了。
      const changed = t.擋下 + t.未執行 > 0 ? "（上面那幾條就是原因）" : "";
      process.stderr.write(
        `\n✗ ${reportPath} 與現況不符${changed}。重新產生並一起 commit：\n` +
          `    node tools/spec-report/src/cli.ts\n`,
      );
      staleReport = true;
    }
    if (!staleReport) process.stdout.write(`\n✓ ${reportPath} 與現況一致\n`);
  } else {
    writeFileSync(absoluteReport, content);
  }

  // ⚠️ 待辦**不擋** —— 那是三態的定義：有定義、還沒做，是警告不是失敗。
  // 擋下與未執行才回非零，而過期的報表也算（它是一份會被拿去對外的產出物）。
  return staleReport || t.擋下 + t.未執行 > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
