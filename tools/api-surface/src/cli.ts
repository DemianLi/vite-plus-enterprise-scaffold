#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { extractSurface, type EntryPoint } from "./shape.ts";
import {
  compareSurface,
  referenceOf,
  isRegistered,
  type Baseline,
  type Finding,
} from "./compare.ts";

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
 * 2026-08-16 起 `platform/*` 會發成內部套件給各案 fork 後升級，所以「下游」
 * 不再是一個假設：某一案在驗收期升了內部套件、編不過、而沒有遷移路徑，
 * 要接電話的是平台組自己。
 *
 * 用法：
 *   node tools/api-surface/src/cli.ts          # 檢查
 *   node tools/api-surface/src/cli.ts --update # 更新基準（會要求登記 codemod）
 *   node tools/api-surface/src/cli.ts --baseline <path>  # 對別的基準檔跑（見下）
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const PLATFORM_DIR = join(ROOT, "platform");
const CODEMODS_DIR = join(ROOT, "tools/codemods");
/**
 * 基準檔格式版本。
 *
 * ⚠️ **改變「記什麼」就要動這個數字。** 例如把某一類 export 從
 * 「一個型別字串」改成「一列成員」，比對出來會是一堆 `種類從 X 變成 Y` ——
 * 全部被判成破壞性，而它們一個都不是：`platform/` 沒有變，變的是這支工具。
 *
 * 那種紅燈沒有合法出口（沒有 codemod 可寫），所以升版號才是正解：
 * 版本對不上時 surface 整份重建，diff 一次看完。
 *
 * 版本沿革：
 *   1 → 2（2026-08-16）模組 → export 名稱清單，改成名稱 → 型別形狀
 *   2 → 3（2026-08-17）`.vue` 開始記 slot 與 emit（`[slot x]`／`[emit x]`）
 *
 * ⚠️ 第 3 版那次正是這段說明的示範：`platform/` 一個位元組都沒改（那四個
 * slot 從第一天就存在），但工具開始記它們，於是比對出來是**四筆「新增必填
 * 成員」的破壞性變更**，要求四份不存在的 codemod。升版號是唯一正確的出口。
 */
const BASELINE_VERSION = 3;

/**
 * 要比對的基準檔。`--baseline <path>` 可以指到別處。
 *
 * ── 這個參數不是為了彈性，是為了讓這道閘門能被反向測試 ──────────────
 *
 * 在它之前，`tools/api-surface` 是四道閘門裡**唯一連一條測試都沒有的**。
 * 而「該紅的時候會不會紅」只能靠真的
 * 製造一次破壞性變更來證明 —— 在寫死路徑的版本下，那意味著去改
 * `platform/*` 的原始碼再還原，跑到一半被中斷 repo 就壞著。
 *
 * 有了 `--baseline`，反向測試改成把 surface.json 複製到暫存目錄、
 * 在副本裡動手腳：**platform 的原始碼一個位元組都不用動**，
 * 而閘門走的是完全相同的比對路徑。
 *
 * ⚠️ 與 tools/conformance 的 `--root` 一樣刻意**不做環境變數版本** ——
 * env 會繼承到子行程，沒清乾淨會讓 CI 安靜地比對錯的基準然後回報通過。
 */
function parseBaselinePath(argv: readonly string[]): string {
  const at = argv.indexOf("--baseline");
  if (at === -1) return join(ROOT, "tools/api-surface/surface.json");
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("--baseline 後面要接一個檔案路徑");
    process.exit(1);
  }
  return resolve(value);
}

const BASELINE_PATH = parseBaselinePath(process.argv.slice(2));
const shouldUpdate = process.argv.includes("--update");

/**
 * `--platform <dir>` 讓反向測試能對一個 fixture 套件跑。
 *
 * ── 為什麼需要它 ────────────────────────────────────────────────────
 *
 * 有一類測試沒辦法靠改基準副本來寫：「這個重構**不該**讓形狀漂移」。
 * 改名一個私有型別、把屬性對調、interface 換成 type —— 這些必須真的動
 * 原始碼才問得出答案，而動 `platform/*` 正是既有測試明講要避開的
 *（跑到一半被中斷，repo 就安靜地壞著）。
 *
 * 所以測試改成指向 `tools/api-surface/tests/fixtures/`：一個自帶 tsconfig
 * 的小套件，被改壞了也只影響它自己。
 */
function parsePlatformDir(argv: readonly string[]): string {
  const at = argv.indexOf("--platform");
  if (at === -1) return PLATFORM_DIR;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("--platform 後面要接一個目錄路徑");
    process.exit(1);
  }
  return resolve(value);
}

const PLATFORM = parsePlatformDir(process.argv.slice(2));

function listEntryPoints(): EntryPoint[] {
  const entries: EntryPoint[] = [];
  for (const name of readdirSync(PLATFORM)) {
    const dir = join(PLATFORM, name);
    if (!statSync(dir).isDirectory()) continue;
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; exports?: unknown };
    // 沒有 exports 的 package（例如 @org/tsconfig 只放 json）沒有 API 表面。
    if (typeof pkg.name !== "string" || pkg.exports === undefined) continue;

    const config = join(dir, "tsconfig.json");
    const declared =
      typeof pkg.exports === "string"
        ? { ".": pkg.exports }
        : (pkg.exports as Record<string, string>);

    for (const [subpath, relative] of Object.entries(declared)) {
      // 只處理 JS/TS 進入點；.json、.css 之類的資產沒有 API 表面。
      if (!/\.(ts|js|mjs)$/.test(relative)) continue;
      entries.push({
        key: subpath === "." ? pkg.name : `${pkg.name}${subpath.slice(1)}`,
        config: existsSync(config) ? config : undefined,
        file: join(dir, relative),
      });
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) {
    return { version: BASELINE_VERSION, surface: {}, codemods: [] };
  }
  const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Partial<Baseline>;

  if (parsed.version !== BASELINE_VERSION) {
    if (!shouldUpdate) {
      console.error(
        `\n✗ ${BASELINE_PATH} 是第 ${parsed.version ?? 1} 版的基準檔，這支工具讀第 ${BASELINE_VERSION} 版\n\n` +
          "  第 1 版記的是「模組 → export 名稱清單」，第 2 版記的是「名稱 → 型別形狀」。\n" +
          "  把前者當後者讀，比對出來的是一堆索引鍵，不是一個判決 —— 而那種輸出\n" +
          "  無論是紅是綠都沒有意義。所以這裡直接停下來。\n\n" +
          "  重建基準：node tools/api-surface/src/cli.ts --update\n",
      );
      process.exit(1);
    }
    // `--update` 是這個訊息給的補救步驟，所以它必須真的走得通：舊格式的
    // surface 一律丟掉重建（拿它去比對本來就沒有意義），codemods 的登記留著。
    console.error(`⚠️ 舊格式的基準檔，surface 整份重建；codemods 的登記保留。\n`);
    return { version: BASELINE_VERSION, surface: {}, codemods: parsed.codemods ?? [] };
  }

  return {
    version: parsed.version,
    surface: parsed.surface ?? {},
    codemods: parsed.codemods ?? [],
  };
}

function codemodExists(name: string): boolean {
  return existsSync(join(CODEMODS_DIR, `${name}.ts`));
}

function printFindings(findings: readonly Finding[]): void {
  let current = "";
  for (const finding of findings) {
    const reference = referenceOf(finding);
    if (reference !== current) {
      console.error(`  ✗ ${reference}`);
      current = reference;
    }
    console.error(`      ${finding.detail}`);
  }
}

// ── 執行 ──────────────────────────────────────────────────────────────
const baseline = loadBaseline();
const { surface: current, privateReferences } = extractSurface(PLATFORM, listEntryPoints());

/**
 * 前置條件先擋：公開形狀裡不得出現非匯出的本地型別。
 *
 * 這一段放在比對**之前**，因為違規時比對本身就不可信：那個名字改一次，
 * 形狀就漂一次，而閘門分不出「私有型別改名」與「參數換了型別」。
 * 理由與實測數字寫在 shape.ts 的 PrivateTypeReference 上面。
 */
if (privateReferences.length > 0) {
  console.error("\n✗ 公開的 API 形狀引用了沒有 export 的型別\n");
  for (const reference of privateReferences) {
    console.error(
      `  ✗ ${reference.entry} 用到 ${reference.typeName}（宣告在 ${reference.declaredIn}）`,
    );
  }
  console.error(
    "\n  這道閘門把型別形狀記成字串，而字串裡的具名型別一律印名字 ——\n" +
      "  TypeScript 沒有任何一個 NodeBuilderFlags 會把它展開成結構（實測掃過）。\n\n" +
      "  於是一個消費端看不見的改名，會讓形狀漂移、被判成破壞性變更，\n" +
      "  然後要求一份根本不需要的 codemod。那種紅燈會被關掉。\n\n" +
      "  補救：把那個型別 export 出去（它本來就出現在你的公開簽章裡，\n" +
      "  消費端沒有名字可以稱呼它），或者把它行內展開。\n",
  );
  process.exit(1);
}

const findings = compareSurface(baseline.surface, current);
const breaking = findings.filter(
  (finding) => finding.severity === "breaking" && !isRegistered(baseline.codemods, finding),
);
const missingFiles = baseline.codemods.filter((record) => !codemodExists(record.name));

if (breaking.length > 0) {
  console.error("\n✗ platform/ 有破壞性變更，但沒有對應的 codemod（D12）\n");
  printFindings(breaking);
  console.error(
    "\n  在 D3 的單一 monorepo 裡，platform/ 就是腳手架本身：改它等於同時改動\n" +
      "  所有切片、所有團隊。而 platform/* 會發成內部套件給各案升級，\n" +
      "  所以「下游」也包含不在這個 repo 裡的人。因此 breaking change 必須附\n" +
      "  codemod，並由提出者在同一個 PR 跑完全 repo。\n\n" +
      "  做不到 codemod 的改動，就不是 breaking change，是新 API —— 請改為\n" +
      "  新增 export／新增選填成員，把舊的標 @deprecated 保留一個 release 週期。\n\n" +
      "  補救步驟：\n" +
      "    1. 建立 tools/codemods/<name>.ts\n" +
      "    2. 在 tools/api-surface/surface.json 的 codemods 登記它：\n" +
      "       移除 export 寫進 removes，形狀改變寫進 changes\n" +
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
  const next: Baseline = {
    version: BASELINE_VERSION,
    surface: current,
    codemods: baseline.codemods,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);

  /**
   * 寫完立刻交給 formatter 收尾。
   *
   * `JSON.stringify(_, null, 2)` 一律把陣列展成多行，oxfmt 則會把短陣列
   * 收成單行 —— 於是**每一次更新基準都會產出一個過不了 `vp check` 的檔案**，
   * 而修好它又會帶來二十幾行與這次改動無關的排版 diff。
   *
   * 後果不只是吵：登記破壞性變更是最需要仔細看 diff 的時刻，
   * 而那正是雜訊最多的時刻。
   *
   * 這個教訓 `tools/slice-gen/src/files.ts` 早就寫下來了（「那道 fmt 才是保證」），
   * 只是當時沒有人想到同一件事會在這裡再發生一次。
   * 讓 formatter 當唯一權威，而不是手工去猜它的規則。
   */
  const formatted = spawnSync("vp", ["fmt", BASELINE_PATH], { cwd: ROOT, encoding: "utf8" });
  if (formatted.status !== 0) {
    console.error("✗ 基準已寫入，但格式化失敗 —— 直接 commit 會讓 `vp check` 變紅：");
    console.error(formatted.stderr || formatted.stdout || String(formatted.error));
    process.exit(1);
  }

  const shapes = Object.values(current).reduce((sum, entry) => sum + Object.keys(entry).length, 0);
  console.log(`✓ 基準已更新（${Object.keys(current).length} 個進入點，${shapes} 個 export）`);
  process.exit(0);
}

// 相容變更也要更新基準，否則下次比對的基礎是舊的 —— 那等於這支檢查靜默失效。
const compatible = findings.filter((finding) => finding.severity === "compatible");
if (compatible.length > 0) {
  console.error(`\n✗ 有 ${compatible.length} 項相容變更未登記在基準中：\n`);
  printFindings(compatible);
  console.error(
    "\n  相容變更不需要 codemod，但基準必須同步更新，否則下次比對的基礎是舊的\n" +
      "（等於這支檢查靜默失效）。基準的 diff 會出現在 PR 裡，請順手看一眼。執行：\n\n" +
      "    node tools/api-surface/src/cli.ts --update\n",
  );
  process.exit(1);
}

const shapeCount = Object.values(current).reduce(
  (sum, entry) => sum + Object.keys(entry).length,
  0,
);
console.log(
  `✓ platform/ API 形狀無破壞性變更（${Object.keys(current).length} 個進入點，${shapeCount} 個 export）`,
);
