#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * `platform/` 的公開 API 表面快照與破壞性變更偵測（D12）。
 *
 * ── 為什麼需要這支 ──────────────────────────────────────────────────
 *
 * D12 寫著「breaking change 必須附 codemod」。那是一句話，不是機制 ——
 * 沒有東西會在有人刪掉一個 export 時說話。
 *
 * 而在 D3 的單一 monorepo 裡，`platform/` 就是腳手架本身：改它等於同時改動
 * 40 個切片、8 個團隊。所以「附 codemod」這條規則的真正作用不是省時間，
 * 是**讓提出 breaking change 的人自己承擔成本** —— 這會過濾掉九成不必要的 API 變動。
 *
 * 這支腳本讓那條規則有牙齒：
 *
 *   1. 匯入每個 platform package，列舉其實際公開的 export
 *   2. 與已提交的基準 `surface.json` 比對
 *   3. **新增** export → 放行（相容變更）
 *   4. **移除或改名** export → 除非基準檔的 codemods 有對應登記，否則失敗
 *
 * 用法：
 *   node tools/api-surface/src/cli.ts          # 檢查
 *   node tools/api-surface/src/cli.ts --update # 更新基準（會要求登記 codemod）
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const PLATFORM_DIR = join(ROOT, "platform");
const BASELINE_PATH = join(ROOT, "tools/api-surface/surface.json");
const CODEMODS_DIR = join(ROOT, "tools/codemods");

interface CodemodRecord {
  /** codemod 檔名（不含副檔名），對應 tools/codemods/<name>.ts */
  readonly name: string;
  /** 這個 codemod 負責遷移的、已移除的 export，格式 `<package>#<export>` */
  readonly removes: readonly string[];
  /** 一句話說明為什麼這個 breaking change 是必要的 */
  readonly reason: string;
}

interface Baseline {
  readonly surface: Record<string, readonly string[]>;
  readonly codemods: readonly CodemodRecord[];
}

function listPlatformPackages(): { name: string; dir: string }[] {
  const packages: { name: string; dir: string }[] = [];
  for (const entry of readdirSync(PLATFORM_DIR)) {
    const dir = join(PLATFORM_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; exports?: unknown };
    // 沒有 exports 的 package（例如 @org/tsconfig 只放 json）沒有 API 表面。
    if (typeof pkg.name !== "string" || pkg.exports === undefined) continue;
    packages.push({ name: pkg.name, dir });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 以**實際匯入**列舉 export，而非解析原始碼。
 *
 * 理由：正則解析 `export` 宣告會漏掉 re-export、萬用匯出、以及各種寫法變體，
 * 而漏掉就等於這支檢查在該處靜默失效 —— 比沒有檢查更糟，因為會給人安全感。
 * 直接 import 拿到的是消費端真正看得到的東西。
 *
 * **已知限制**：只涵蓋執行期的值匯出，`export type` / `export interface`
 * 不會出現在這裡。型別的破壞性變更由 tsgolint 在各消費端當場報錯攔下
 *（monorepo 的所有消費端都在同一個 repo，這一點成立）。
 */
async function readExports(entry: string): Promise<string[]> {
  // Tier 2 的 no-unsanitized/method 會標記動態 import，而它是對的 ——
  // 一般情況下動態 import 是任意程式碼執行的入口。
  //
  // 此處的豁免理由：路徑完全來自本 repo 的 platform/*/package.json 的 exports
  // 欄位，不接受任何外部輸入；且本檔是 dev-only 工具，永不進入瀏覽器 bundle。
  // eslint-disable-next-line no-unsanitized/method
  const module = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
  return Object.keys(module)
    .filter((key) => key !== "default" || module["default"] !== undefined)
    .sort();
}

async function collectSurface(): Promise<Record<string, string[]>> {
  const surface: Record<string, string[]> = {};

  for (const pkg of listPlatformPackages()) {
    const pkgJson = JSON.parse(readFileSync(join(pkg.dir, "package.json"), "utf8")) as {
      exports: Record<string, string> | string;
    };
    const entries =
      typeof pkgJson.exports === "string" ? { ".": pkgJson.exports } : pkgJson.exports;

    for (const [subpath, relative] of Object.entries(entries)) {
      // 只處理 JS/TS 進入點；.json 之類的資產沒有 API 表面。
      if (!/\.(ts|js|mjs)$/.test(relative)) continue;
      const key = subpath === "." ? pkg.name : `${pkg.name}${subpath.slice(1)}`;
      surface[key] = await readExports(join(pkg.dir, relative));
    }
  }

  return surface;
}

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) {
    return { surface: {}, codemods: [] };
  }
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

interface Removal {
  readonly module: string;
  readonly symbol: string;
}

function findRemovals(baseline: Baseline, current: Record<string, string[]>): Removal[] {
  const removals: Removal[] = [];

  for (const [module, previous] of Object.entries(baseline.surface)) {
    const now = new Set(current[module] ?? []);
    for (const symbol of previous) {
      if (!now.has(symbol)) removals.push({ module, symbol });
    }
  }

  return removals;
}

function codemodExists(name: string): boolean {
  return existsSync(join(CODEMODS_DIR, `${name}.ts`));
}

// ── 執行 ──────────────────────────────────────────────────────────────
const shouldUpdate = process.argv.includes("--update");
const baseline = loadBaseline();
const current = await collectSurface();
const removals = findRemovals(baseline, current);

const covered = new Set<string>();
for (const record of baseline.codemods) {
  for (const removed of record.removes) covered.add(removed);
}

const uncovered = removals.filter(({ module, symbol }) => !covered.has(`${module}#${symbol}`));
const missingFiles = baseline.codemods.filter((record) => !codemodExists(record.name));

if (uncovered.length > 0) {
  console.error("\n✗ platform/ 有破壞性變更，但沒有對應的 codemod（D12）\n");
  for (const { module, symbol } of uncovered) {
    console.error(`  ✗ ${module} 移除了 export "${symbol}"`);
  }
  console.error(
    "\n  在 D3 的單一 monorepo 裡，platform/ 就是腳手架本身：改它等於同時改動\n" +
      "  所有切片、所有團隊。因此 breaking change 必須附 codemod，並由提出者\n" +
      "  在同一個 PR 跑完全 repo。\n\n" +
      "  做不到 codemod 的改動，就不是 breaking change，是新 API —— 請改為\n" +
      "  新增 export、把舊的標 @deprecated 保留一個 release 週期。\n\n" +
      "  補救步驟：\n" +
      "    1. 建立 tools/codemods/<name>.ts\n" +
      "    2. 在 tools/api-surface/surface.json 的 codemods 登記它與對應的 removes\n" +
      "    3. 執行 node tools/codemods/run.ts <name> 遷移全 repo\n" +
      "    4. 執行 node tools/api-surface/src/cli.ts --update 更新基準\n",
  );
  process.exit(1);
}

if (missingFiles.length > 0) {
  console.error("\n✗ surface.json 登記了不存在的 codemod：\n");
  for (const record of missingFiles) {
    console.error(`  ✗ ${record.name} → 找不到 tools/codemods/${record.name}.ts`);
  }
  console.error("");
  process.exit(1);
}

if (shouldUpdate) {
  const next: Baseline = { surface: current, codemods: baseline.codemods };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`✓ 基準已更新（${Object.keys(current).length} 個進入點）`);
  process.exit(0);
}

// 新增的 export 是相容變更，但基準仍需更新，否則下次比對的基礎是舊的。
const additions: string[] = [];
for (const [module, symbols] of Object.entries(current)) {
  const previous = new Set(baseline.surface[module] ?? []);
  for (const symbol of symbols) {
    if (!previous.has(symbol)) additions.push(`${module}#${symbol}`);
  }
}

if (additions.length > 0) {
  console.error(`\n✗ 有 ${additions.length} 個新 export 未登記在基準中：\n`);
  for (const addition of additions) console.error(`  + ${addition}`);
  console.error(
    "\n  新增 export 是相容變更，但基準必須同步更新，否則下次比對的基礎是舊的\n" +
      "（等於這支檢查靜默失效）。執行：\n\n" +
      "    node tools/api-surface/src/cli.ts --update\n",
  );
  process.exit(1);
}

console.log(
  `✓ platform/ API 表面無破壞性變更（${Object.keys(current).length} 個進入點，` +
    `${Object.values(current).flat().length} 個 export）`,
);
