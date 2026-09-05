#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatReport } from "@org/conformance/report";
import { parseFlags } from "@org/gate-kit";

import { checkPromises } from "./check.ts";

/**
 * `specs/*.feature` 寫的承諾，現在還是真的嗎。
 *
 * 用法：
 *   node tools/promise-check/src/cli.ts             不成立時回傳非零
 *   node tools/promise-check/src/cli.ts --spec <p>  指定規格（可重複，測試用）
 *   node tools/promise-check/src/cli.ts --root <p>  換一個 repo 根（測試用）
 *
 * 判定與它刻意不守的東西寫在 `src/check.ts` 的檔頭，接線的分工寫在
 * `src/breakage.ts`。**這個檔案只做參數、輸出與結束碼。**
 *
 * ⚠️ 這個檔案是唯一可以讀 `process.argv`、動 `process.exitCode` 的地方，
 * 規矩與 `tools/conformance`、`tools/scope-check` 同一條（#53）：
 * 判定要能被 import 測到。
 *
 * ── 它跟 `tools/spec-report` 讀的不是同一批規格 ────────────────────
 *
 * 兩者都讀 `.feature`，但軸不同，**而且路徑不重疊**：
 *
 *   這一支      `specs/*.feature`            第一類 —— 腳手架對採用團隊的承諾
 *   spec-report `features/​*​/specs/*.feature`  第二類 —— 專案組自己的業務規格
 *
 * ⚠️ 混在一起的話，框架承諾會被算進「業務功能完成率」，而那份報表是
 * 拿去對外報進度的。這條分界由 `tests/boundary.test.ts` 守著，不靠人記得。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/**
 * 版控裡有哪些承諾規格。
 *
 * ⚠️ 事實來源是 `git ls-files`，不是 `readdirSync` —— C73 裁決過，C98 記著
 * 違反它的代價（讀磁碟會把沒進版控的東西算進來，本機綠、乾淨 clone 後紅）。
 * ⚠️ `-z` 是必要的（C112）：git 會把含非 ASCII 的路徑加引號並做八進位轉義。
 */
function trackedSpecs(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "specs/*.feature"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`[promise-check] git ls-files 失敗：${result.stderr}`);
  }
  return result.stdout.split("\0").filter((path) => path.length > 0);
}

/**
 * ⚠️ `--spec` 要能重複：一份改壞的規格必須跟一份好的一起餵，否則 `BREAKAGES`
 * 的孤兒檢查會在接線那一關先紅（`tests/negative.test.ts` 檔頭）。它是 `list`
 * kind（C181）—— 之前這裡自己掃 argv 收集，而那條路徑零測試。
 */
const PARSED = parseFlags(process.argv.slice(2), {
  root: { kind: "value", fallback: ROOT, noun: "目錄" },
  spec: { kind: "list", noun: "規格檔路徑" },
} as const);

if (!PARSED.ok) {
  process.stderr.write(`${PARSED.message}\n`);
  process.exit(1);
}

const root = resolve(PARSED.flags.root);
const specs = PARSED.flags.spec.length > 0 ? PARSED.flags.spec : trackedSpecs(root);

const { findings, runs } = checkPromises(root, specs);

if (findings.length === 0) {
  const features = [...new Set(runs.map((run) => run.scenario.feature))];
  console.log(`✓ 承諾成立（${features.length} 條承諾、${runs.length} 個場景各執行過一次）`);
  for (const feature of features) console.log(`  ${feature}`);
  console.log("  比對的是**執行結果**：每一個場景都真的建了一份切片副本、照規格弄壞、跑閘門。");
  console.log("  ⚠️ repo 的原始碼沒有被動到 —— 破壞發生在暫存目錄裡的副本上。");
} else {
  // ⚠️ 不是 process.exit(1)：macOS 上管線的 stderr 是非同步的，
  // exit 會把還沒寫完的內容截掉（#53 實測）。
  process.stderr.write(formatReport(findings, "承諾檢查"));
  process.exitCode = 1;
}
