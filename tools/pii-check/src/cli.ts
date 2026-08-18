#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseFlags, repoRoot, walk } from "@org/gate-kit";

import { scanRepo } from "./scan.ts";

/**
 * §11 II ⑥ —— 測試環境不得使用真實個人資料。
 *
 * 用法：
 *   node tools/pii-check/src/cli.ts             掃描並在有發現時回傳非零
 *   node tools/pii-check/src/cli.ts --root DIR  掃另一個目錄（反向測試用）
 *
 * 偵測範圍與它的邊界寫在 `src/detect.ts` 的檔頭 ——
 * 簡短版：**抓得到有校驗碼的識別碼，抓不到姓名。**
 *
 * ⚠️ 曾經還有一個 `--masking` 模式守 §11 II ⑨（宣告為個資的欄位必須隱碼）。
 * 已移除 —— 它要求每個新切片宣告 `personalData`、而宣告的欄位在 `.vue` 裡
 * 必須包 `maskXxx()`，那是加一個切片時最重的一道摩擦。
 * `platform/pii` 的遮罩函式仍然在、`OrderList.vue` 也仍然呼叫它 ——
 * **遮罩還在，只是沒有機制強制。**（見 DECISIONS 的 C52）
 */

/** 不進去的目錄。掃 node_modules 會把全世界的測試資料一起掃進來。 */
const SKIP = ["node_modules", ".git", "dist", ".scan", "coverage", ".vite-plus"];

/** 只看文字檔。二進位檔的位元組隨機通過 Luhn 的機率不低，而那是純誤報。 */
const TEXT = [
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".vue",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".html",
  ".txt",
];

/**
 * 這支認得的旗標。**只有這些** —— 不認得的一律紅，理由寫在
 * `@org/gate-kit` 的 `parseFlags`，那次事故就是在這支身上發生的。
 */
const SPEC = { root: { kind: "value", noun: "目錄", fallback: repoRoot() } } as const;

function runScan(root: string): number {
  const files = walk(root, { skip: SKIP, extensions: TEXT });
  const report = scanRepo(files, (path) => readFileSync(join(root, path), "utf8"));

  if (report.problems.length === 0) {
    console.log(
      `✓ 測試環境無真實個資（掃了 ${report.scanned.length} 個檔案）\n` +
        "  ⚠️ 抓得到的是有校驗碼的識別碼（身分證字號、卡號、手機）與指向真實網域的信箱。\n" +
        "     **姓名抓不到** —— 見 src/detect.ts。這條的覆蓋是部分，不是完整。",
    );
    return 0;
  }

  console.error(`✗ §11 II ⑥ 檢查未通過：${report.problems.length} 項\n`);
  for (const problem of report.problems) {
    console.error(`  [${problem.kind}] ${problem.detail}`);
  }
  console.error(
    "\n  真的是測試資料的話：改用 example.com／.test 網域，" +
      "身分證字號與卡號請用不通過校驗的假值。\n" +
      "  真的看過而確定沒問題的話：加進 src/scan.ts 的 EXEMPT（要寫完整路徑與理由）。",
  );
  return 1;
}

const parsed = parseFlags(process.argv.slice(2), SPEC);
if (!parsed.ok) {
  console.error(parsed.message);
  process.exit(1);
}
process.exit(runScan(resolve(parsed.flags.root)));
