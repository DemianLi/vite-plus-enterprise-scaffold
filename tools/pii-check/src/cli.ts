#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/** 這支認得的旗標。**只有這些** —— 見 `parseRoot` 的說明。 */
const KNOWN_FLAGS = new Set(["--root"]);

function parseRoot(argv: readonly string[]): string {
  /**
   * ⚠️ 不認得的旗標要當場紅，不能忽略。
   *
   * C52 拿掉 `--masking` 之後，`tier2-security.yml` 裡那個步驟被留了下來。
   * 當時這裡只找 `--root`，其餘一律無視 —— 於是那一步安靜地把 ⑥ 又掃了
   * 一次、回傳 0，而 CI 上顯示的是一個叫「個資：畫面上必須隱碼」的綠燈。
   *
   * **一個檢查不存在，比一個檢查失敗糟得多**：失敗會有人修，
   * 而這種綠燈會被當成證據拿去給稽核看。
   */
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    if (KNOWN_FLAGS.has(argument)) continue;
    console.error(
      `✗ 不認得的旗標：${argument}\n` +
        `  這支只吃 ${[...KNOWN_FLAGS].join("、")}。\n` +
        "  會紅是刻意的：被拿掉的旗標留在 CI 裡而被靜靜忽略時，\n" +
        "  那一步會頂著它原本的名字回傳綠燈 —— 而那個名字說的是謊。",
    );
    process.exit(1);
  }

  const at = argv.indexOf("--root");
  if (at === -1) return ROOT;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("--root 後面要接一個目錄");
    process.exit(1);
  }
  return resolve(value);
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

process.exit(runScan(parseRoot(process.argv.slice(2))));
