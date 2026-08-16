#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanRepo } from "./scan.ts";
import { checkSlice, maskingProblems, parsePersonalData, type SliceMasking } from "./masking.ts";

/**
 * 個資的兩條現行義務，兩條在此之前都是零覆蓋。
 *
 * 用法：
 *   node tools/pii-check/src/cli.ts             §11 II ⑥ 測試環境不得用真個資
 *   node tools/pii-check/src/cli.ts --masking   §11 II ⑨ 畫面上的個資必須隱碼
 *   node tools/pii-check/src/cli.ts --root DIR  掃另一個目錄（反向測試用）
 *
 * 偵測範圍與它的邊界寫在 `src/detect.ts` 與 `src/masking.ts` 的檔頭。
 * 簡短版：⑥ **抓得到有校驗碼的識別碼，抓不到姓名**；
 * ⑨ 這裡只是靜態層，執行期那一層是切片自己的元件測試。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** 不進去的目錄。掃 node_modules 會把全世界的測試資料一起掃進來。 */
const SKIP = new Set(["node_modules", ".git", "dist", ".scan", "coverage", ".vite-plus"]);

/** 只看文字檔。二進位檔的位元組隨機通過 Luhn 的機率不低，而那是純誤報。 */
const TEXT = /\.(ts|tsx|js|mjs|cjs|vue|json|md|ya?ml|css|html|txt)$/;

function listFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listFiles(full));
    } else if (TEXT.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

function parseRoot(argv: readonly string[]): string {
  const at = argv.indexOf("--root");
  if (at === -1) return ROOT;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("--root 後面要接一個目錄");
    process.exit(1);
  }
  return resolve(value);
}

/** 每個切片的 `.vue` 檔案，key 是 repo 相對路徑（訊息要指得出是哪一個檔）。 */
function templatesOf(root: string, slice: string): Map<string, string> {
  const directory = join(root, "features", slice, "src");
  const templates = new Map<string, string>();
  for (const path of listFiles(directory)) {
    if (!path.endsWith(".vue")) continue;
    templates.set(relative(root, path), readFileSync(path, "utf8"));
  }
  return templates;
}

function runMasking(root: string): number {
  const slices = readdirSync(join(root, "features")).filter((entry) =>
    statSync(join(root, "features", entry)).isDirectory(),
  );

  const results: SliceMasking[] = [];
  const undeclared: string[] = [];

  for (const slice of slices) {
    const index = join(root, "features", slice, "src/index.ts");
    const declared = parsePersonalData(readFileSync(index, "utf8"));
    if (declared === null) {
      undeclared.push(relative(root, index));
      continue;
    }
    results.push(checkSlice(slice, declared, templatesOf(root, slice)));
  }

  const problems = [
    ...undeclared.map((file) => ({
      kind: "not-declared" as const,
      detail:
        `${file} 讀不到字面的 personalData 陣列。\n` +
        "      它是必填的：`personalData: []` 是一個答案，沒寫則代表沒有人想過這件事。\n" +
        "      而且必須是字面陣列 —— 算出來的宣告，review 看不出這個切片碰了哪些個資。",
    })),
    ...maskingProblems(results),
  ];

  const fields = results.reduce((total, result) => total + result.declared.length, 0);
  const templates = results.reduce((total, result) => total + result.templatesExamined, 0);

  if (problems.length === 0) {
    console.log(
      "✓ 宣告為個資的欄位在畫面上都走了隱碼\n" +
        `  ${results.length} 個切片、${fields} 個宣告欄位、${templates} 個模板。\n` +
        "  ⚠️ 這是靜態層：它證明原始碼裡寫了 mask，不證明渲染結果真的被遮住。\n" +
        "     後者由切片自己的元件測試證明（features/*/tests）。",
    );
    return 0;
  }

  console.error(`✗ §11 II ⑨ 檢查未通過：${problems.length} 項\n`);
  for (const problem of problems) console.error(`  [${problem.kind}] ${problem.detail}`);
  return 1;
}

function runScan(root: string): number {
  const files = listFiles(root).map((path) => relative(root, path));
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

const ROOT_ARG = parseRoot(process.argv.slice(2));
if (process.argv.slice(2).includes("--masking")) {
  process.exit(runMasking(ROOT_ARG));
}
process.exit(runScan(ROOT_ARG));
