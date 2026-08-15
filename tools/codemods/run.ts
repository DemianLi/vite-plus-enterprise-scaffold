#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * codemod 執行器（D12）。
 *
 * ── 這支的存在理由 ──────────────────────────────────────────────────
 *
 * D12 規定：`platform/` 的 breaking change 必須附 codemod，且由提出者在同一個
 * PR 跑完全 repo。`tools/api-surface` 負責**強制**這條規則，這支負責**執行**。
 *
 * 「必須附 codemod」的真正作用不是省時間，是讓提出 breaking change 的人自己
 * 承擔成本 —— 這會過濾掉九成不必要的 API 變動。
 *
 * 用法：
 *   node tools/codemods/run.ts <name>           # 套用
 *   node tools/codemods/run.ts <name> --dry-run # 只列出會改哪些檔案
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const CODEMODS_DIR = resolve(fileURLToPath(import.meta.url), "..");

const SCAN_DIRS = ["apps", "features", "platform", "tools"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".vue"];
const SKIP = new Set(["node_modules", "dist", ".git", "coverage"]);

/**
 * codemod 的原始碼與測試**永遠**不能被 codemod 掃到。
 *
 * 這不是保守起見，是實測踩到的：第一次跑 `--dry-run`，執行器回報要修改
 * `rename-feature-kit-to-slice-kit.ts` 與它的測試 —— 因為那兩個檔案裡
 * 合法地含有舊套件名（一個是 OLD_SPECIFIER 常數，一個是測試 fixture）。
 * 真的跑下去，codemod 會把自己改成 no-op，而且測試會一起被改到全綠。
 *
 * 這是通則：codemod 檔案裡的舊識別字是**資料**，不是待遷移的用法。
 */
const CODEMOD_SOURCE_DIR = "codemods";

/**
 * codemod 的介面。
 *
 * `transform` 收到檔案內容，回傳新內容；回傳 `null` 代表這個檔案不需要改。
 *
 * ⚠️ **這是字串層級的轉換，不是 AST 轉換。** 對「改名一個 import」這類
 * 詞法上明確的遷移足夠，而那正是 platform breaking change 的絕大多數。
 * 需要理解語意的遷移（例如改變呼叫的參數結構、追蹤變數別名），
 * 請在該 codemod 自己的實作裡引入 ts-morph —— 執行器不預設任何 AST 工具，
 * 是為了不讓每個專案都被迫吞下一個大型相依（D2）。
 *
 * 無論用哪種方式，codemod 都必須是**冪等**的：跑兩次的結果要與跑一次相同。
 * 執行器不會阻止你寫出非冪等的轉換，但 CI 會在下一次執行時把差異暴露出來。
 */
export interface Codemod {
  readonly description: string;
  transform(source: string, filePath: string): string | null;
}

function collectFiles(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    if (entry === CODEMOD_SOURCE_DIR) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, found);
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

const [, , name, ...flags] = process.argv;
const dryRun = flags.includes("--dry-run");

if (name === undefined) {
  const available = existsSync(CODEMODS_DIR)
    ? readdirSync(CODEMODS_DIR)
        .filter((f) => f.endsWith(".ts") && f !== "run.ts")
        .map((f) => f.replace(/\.ts$/, ""))
    : [];
  console.error("用法：node tools/codemods/run.ts <name> [--dry-run]\n");
  console.error(
    available.length > 0 ? `可用的 codemod：${available.join(", ")}` : "目前沒有 codemod。",
  );
  process.exit(1);
}

const codemodPath = join(CODEMODS_DIR, `${name}.ts`);
if (!existsSync(codemodPath)) {
  console.error(`找不到 codemod：${relative(ROOT, codemodPath)}`);
  process.exit(1);
}

// Tier 2 的 no-unsanitized/method 會標記動態 import，而它是對的 ——
// 一般情況下動態 import 是任意程式碼執行的入口。
//
// 此處的豁免理由：路徑限定在 tools/codemods/ 之下、且上面已用 existsSync
// 確認存在，不接受任何外部輸入；且本檔是 dev-only 工具，永不進入瀏覽器 bundle。
//
// 註：disable 指令必須**單獨成行且緊貼**目標程式碼 —— 它只作用於下一行，
// 把說明寫在同一個註解區塊裡會讓指令指到註解本身而失效（實測踩過）。
// eslint-disable-next-line no-unsanitized/method
const module = (await import(pathToFileURL(codemodPath).href)) as { default?: Codemod };
const codemod = module.default;

if (codemod === undefined) {
  console.error(`${name}.ts 沒有 default export（應為 Codemod）`);
  process.exit(1);
}

console.log(`${name}：${codemod.description}\n`);

const files = SCAN_DIRS.flatMap((dir) => collectFiles(join(ROOT, dir)));
const changed: string[] = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const next = codemod.transform(source, file);
  if (next === null || next === source) continue;

  changed.push(relative(ROOT, file));
  if (!dryRun) writeFileSync(file, next);
}

if (changed.length === 0) {
  console.log(`未命中任何檔案（掃描了 ${files.length} 個）。`);
  process.exit(0);
}

console.log(`${dryRun ? "會修改" : "已修改"} ${changed.length} 個檔案：\n`);
for (const file of changed) console.log(`  ${file}`);

if (!dryRun) {
  console.log("\n接著執行：");
  console.log("  vp check --fix          # 格式化被改動的檔案");
  console.log("  vpr ready               # 確認全套仍然通過");
  console.log("  node tools/api-surface/src/cli.ts --update   # 更新 API 表面基準");
}
