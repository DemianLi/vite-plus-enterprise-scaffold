#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_FILES,
  BANNED_DIRECT_DEPENDENCIES,
  ALLOWED_VERSION_PROTOCOLS,
  REQUIRE_CODEOWNERS_ENTRY,
  SOURCE_EXTENSIONS,
  IMPORT_SPECIFIER_PATTERN,
  isValidSliceDir,
  slicePackageName,
  COMPOSABLES_DIR,
  VIEWS_DIR,
  VIEW_FORBIDDEN_IMPORTS,
  VIEW_FORBIDDEN_LOCAL_MODULES,
  isValidComposableFile,
  composableFunctionName,
  STORE_FILE,
  STORE_FORBIDDEN_IMPORTS,
  STORE_FORBIDDEN_LOCAL_MODULES,
  isTypeOnlyImportAt,
} from "@org/slice-kit/contract";

/**
 * 一致性檢查 —— D4 邊界防護第 1 層，以及 D9 的防漂移機制。
 *
 * 為什麼需要這支：產生器只決定**起點**。第一天大家從同一個模板出發，三個月後
 * A 團隊的切片沒寫測試、B 團隊把 API 呼叫寫進元件、C 團隊偷偷加了跨切片依賴。
 * 產生器對這些一無所知，因為它只在建立那一刻跑過一次。
 *
 * 這支在 CI 每次都跑（Tier 2，不可繞過），驗的項目與產生器產出的內容
 * 讀同一份 contract.ts —— 兩者互為定義，不會各說各話。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const FEATURES_DIR = join(ROOT, "features");

interface Violation {
  readonly slice: string;
  readonly rule: string;
  readonly detail: string;
  readonly fix: string;
}

const violations: Violation[] = [];

function fail(slice: string, rule: string, detail: string, fix: string): void {
  violations.push({ slice, rule, detail, fix });
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function hasTestFile(dir: string): boolean {
  const testsDir = join(dir, "tests");
  if (!existsSync(testsDir)) return false;
  const walk = (current: string): boolean => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        if (walk(full)) return true;
      } else if (entry.endsWith(".test.ts")) {
        return true;
      }
    }
    return false;
  };
  return walk(testsDir);
}

/**
 * D4 邊界防護第 3 層：擋相對路徑逃逸 package 根目錄。
 *
 * 為什麼在這裡而不是用 lint 規則：oxlint 的 `import/no-relative-parent-imports`
 * 擋掉的是**所有** `../`，包含 `src/views/X.vue` 匯入同一個 package 內的
 * `../api.ts` —— 那完全合法。開著它等於強迫切片變成扁平目錄，
 * DX 代價高到大家會把它關掉，反而製造真正的破口。
 *
 * 需要判斷的是「解析後是否仍在 package 根目錄內」，那要路徑解析而非語法比對。
 * 這裡做精確版本：零偽陽性，代價是失去編輯器即時回饋（Tier 2 才會亮）。
 */
// 副檔名與 import 樣式來自契約，與 tools/slice-gen 的測試共用同一份定義 ——
// 各持一份副本的話，產生器改了目錄結構就會安靜地產出過不了這裡的切片。

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, found);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

function checkRelativeEscapes(slicePath: string, slice: string): void {
  const boundary = slicePath + sep;

  for (const file of collectSourceFiles(slicePath)) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined || !specifier.startsWith(".")) continue;

      const resolved = resolve(dirname(file), specifier);
      if (resolved === slicePath || resolved.startsWith(boundary)) continue;

      fail(
        slice,
        "相對路徑逃逸",
        `${relative(slicePath, file)} 匯入了 "${specifier}"，解析後落在切片外` +
          `（${relative(ROOT, resolved)}）`,
        "相對路徑不得離開切片根目錄（D4 第 3 層）。跨切片請走 apps/ 層組裝，" +
          "共用邏輯請抽到 platform/ 並以套件名 import",
      );
    }
  }
}

/**
 * D14：切片**內部**的分層 —— 元件只呈現，有狀態的邏輯住在 composable 裡。
 *
 * 這個 repo 原本把「切片之間」守得極嚴，對「切片之內」什麼都沒說：
 * `REQUIRED_FILES` 驗完四個檔案就結束，api / store / routes / views 那套結構
 * 只存在於產生器的模板裡。誰手寫一個切片、或改了產生器，慣例就消失而閘門全綠。
 *
 * 兩條規則，一條是命名、一條才是真正有牙齒的：
 *
 *   1. `src/composables/` 底下的檔案必須叫 `useXxx.ts` 且匯出同名函式
 *   2. **`src/views/` 底下不得直接 import 資料層** —— 禁的是位置，不是相依
 *
 * 第 2 條為什麼是「禁 import」而不是「禁元件裡出現 useQuery」：
 * 前者是可精確判定的靜態事實，後者要語意分析。同一個取捨見 D4 第 3 層。
 */
function checkSliceLayering(slicePath: string, slice: string): void {
  const composablesDir = join(slicePath, COMPOSABLES_DIR);

  if (existsSync(composablesDir)) {
    for (const entry of readdirSync(composablesDir)) {
      if (statSync(join(composablesDir, entry)).isDirectory()) continue;

      if (!isValidComposableFile(entry)) {
        fail(
          slice,
          "composable 命名",
          `${COMPOSABLES_DIR}/${entry} 不符合 useXxx.ts`,
          "Vue 官方慣例：composable 以 use 開頭、駝峰命名。" +
            "命名一致，編輯器與 code review 才看得出哪些函式必須在 setup 期間同步呼叫",
        );
        continue;
      }

      // 檔名叫 useOrderList.ts 卻匯出別的名字，等於這條慣例只做了一半 ——
      // import 端看到的仍是任意名稱，而那才是讀程式碼的人實際會看到的東西。
      const expected = composableFunctionName(entry);
      const source = readFileSync(join(composablesDir, entry), "utf8");
      if (
        !source.includes(`export function ${expected}`) &&
        !source.includes(`export const ${expected}`)
      ) {
        fail(
          slice,
          "composable 命名",
          `${COMPOSABLES_DIR}/${entry} 沒有匯出同名的 ${expected}`,
          `讓檔名與匯出的函式名一致（export function ${expected}）`,
        );
      }
    }
  }

  // ── Pinia 只放「客戶端才是權威」的東西 ────────────────────────────────
  //
  // 判準：這份資料如果和伺服器不一致，誰是錯的？
  // 客戶端是權威（篩選條件、選取的 id）→ Pinia；伺服器是權威 → TanStack Query。
  // 「選取的那幾筆 Order 物件」兩者都不是，它是 join 出來的，存下來就是第二份快取。
  //
  // 禁 value import、放行 `import type` —— 見契約中 STORE_FORBIDDEN_IMPORTS 的說明。
  const storePath = join(slicePath, STORE_FILE);
  if (existsSync(storePath)) {
    const source = readFileSync(storePath, "utf8");

    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined || match.index === undefined) continue;
      // 借型別不算耦合：`import type` 在 verbatimModuleSyntax 下會被完全抹除。
      if (isTypeOnlyImportAt(source, match.index)) continue;

      const forbidden = STORE_FORBIDDEN_IMPORTS.find((banned) => specifier === banned);
      if (forbidden !== undefined) {
        fail(
          slice,
          "store 存了伺服器狀態",
          `${STORE_FILE} value import 了 "${forbidden}"`,
          "Pinia 只放客戶端才是權威的東西（意圖、選取的 id）。伺服器狀態走 " +
            `${COMPOSABLES_DIR}/use<Xxx>.ts（D14）。存進 store 等於做了第二份快取，` +
            "它與 TanStack Query 那份的失效時機不同，而且不會有任何測試變紅",
        );
      }

      if (!specifier.startsWith(".")) continue;
      const resolved = resolve(dirname(storePath), specifier);
      const localModule = relative(join(slicePath, "src"), resolved).replace(
        /\.(ts|tsx|js|mjs)$/,
        "",
      );
      if ((STORE_FORBIDDEN_LOCAL_MODULES as readonly string[]).includes(localModule)) {
        fail(
          slice,
          "store 存了伺服器狀態",
          `${STORE_FILE} value import 了資料存取模組 "${specifier}"`,
          `只借型別的話請寫成 \`import type\`（那完全允許）。真的要取數請放到 ${COMPOSABLES_DIR}/`,
        );
      }
    }
  }

  const viewsDir = join(slicePath, VIEWS_DIR);
  if (!existsSync(viewsDir)) return;

  for (const file of collectSourceFiles(viewsDir)) {
    const source = readFileSync(file, "utf8");
    const where = relative(slicePath, file);

    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined) continue;

      const forbiddenPackage = VIEW_FORBIDDEN_IMPORTS.find((banned) => specifier === banned);
      if (forbiddenPackage !== undefined) {
        fail(
          slice,
          "元件直接取數",
          `${where} 直接 import "${forbiddenPackage}"`,
          `把取數搬進 ${COMPOSABLES_DIR}/use<Xxx>.ts，元件只留呈現（D14）。` +
            "同一段查詢一旦被第二個元件需要，複製出去的 queryKey 會慢慢漂移，" +
            "而快取失效時機從此對不起來 —— 不會有任何測試變紅",
        );
      }

      // 相對路徑指向本切片的 api 模組（../api.ts、./api.ts、../../src/api.ts…）。
      if (!specifier.startsWith(".")) continue;
      const resolved = resolve(dirname(file), specifier);
      const localModule = relative(join(slicePath, "src"), resolved).replace(
        /\.(ts|tsx|js|mjs)$/,
        "",
      );
      if ((VIEW_FORBIDDEN_LOCAL_MODULES as readonly string[]).includes(localModule)) {
        fail(
          slice,
          "元件直接取數",
          `${where} 直接 import 了資料存取模組 "${specifier}"`,
          `資料層只准被 ${COMPOSABLES_DIR}/ 使用。元件從 composable 拿已經整理好的 ref（D14）`,
        );
      }
    }
  }
}

function loadCodeowners(): string {
  for (const candidate of ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]) {
    const path = join(ROOT, candidate);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return "";
}

function checkSlice(dir: string, codeowners: string, sliceNames: ReadonlySet<string>): void {
  const slicePath = join(FEATURES_DIR, dir);
  const slice = `features/${dir}`;

  // ── 命名 ────────────────────────────────────────────────────────────
  if (!isValidSliceDir(dir)) {
    fail(slice, "命名", `目錄名 "${dir}" 不是 kebab-case`, "改成小寫加連字號，例如 order-history");
  }

  // ── 必要檔案 ────────────────────────────────────────────────────────
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(slicePath, file))) {
      fail(
        slice,
        "必要檔案",
        `缺少 ${file}`,
        `建立 ${slice}/${file}，或用 vp create @org:slice 重新產生`,
      );
    }
  }

  const pkgPath = join(slicePath, "package.json");
  if (!existsSync(pkgPath)) return;

  const pkg = readJson(pkgPath);

  // ── 套件命名 ────────────────────────────────────────────────────────
  const expectedName = slicePackageName(dir);
  if (pkg["name"] !== expectedName) {
    fail(
      slice,
      "套件命名",
      `package.json 的 name 是 "${String(pkg["name"])}"，應為 "${expectedName}"`,
      `把 name 改成 "${expectedName}"，否則 --filter 與 CODEOWNERS 對不上`,
    );
  }

  // ── 測試 ────────────────────────────────────────────────────────────
  if (!hasTestFile(slicePath)) {
    fail(
      slice,
      "測試",
      "找不到任何 tests/**/*.test.ts",
      "沒有測試的切片＝沒有人能安全重構的切片。至少為主要流程補一支測試",
    );
  }

  // ── D4 硬規則：切片禁止互相依賴 ──────────────────────────────────────
  // 展開 undefined 在物件字面值裡是 no-op，因此不需要 `?? {}` 後備值。
  const allDeps: Record<string, string> = {
    ...(pkg["dependencies"] as Record<string, string> | undefined),
    ...(pkg["devDependencies"] as Record<string, string> | undefined),
    ...(pkg["peerDependencies"] as Record<string, string> | undefined),
  };

  for (const [depName, depVersion] of Object.entries(allDeps)) {
    if (depName === expectedName) continue;

    // 以 features/ 目錄的**實際內容**判定，而非用正則猜測套件名是不是切片。
    // 正則會有偽陽性（platform/ 裡剛好同前綴的套件會被誤判），目錄清單不會。
    if (sliceNames.has(depName)) {
      fail(
        slice,
        "跨切片依賴",
        `依賴了另一個切片 "${depName}"`,
        "切片之間禁止互相依賴（D4）。改走兩條合法路徑之一：" +
          "往上到 apps/ 層組裝，或往下把共用契約抽到 platform/",
      );
    }

    if ((BANNED_DIRECT_DEPENDENCIES as readonly string[]).includes(depName)) {
      fail(
        slice,
        "HTTP 客戶端",
        `直接依賴 "${depName}"`,
        "一律走 @org/http-client（D8）。直接用會讓 CSRF 標頭與錯誤處理每片各做一套，" +
          "稽核時無從證明一致性",
      );
    }

    // ── D6：版本必須走 catalog ────────────────────────────────────────
    const usesAllowedProtocol = ALLOWED_VERSION_PROTOCOLS.some((p) => depVersion.startsWith(p));
    if (!usesAllowedProtocol) {
      fail(
        slice,
        "版本治理",
        `"${depName}": "${depVersion}" 寫死了版本`,
        "改用 catalog:（D6）。共用 lockfile 下，寫死版本會讓 CVE 同步升級出現漏網",
      );
    }
  }

  // ── D4 第 3 層：相對路徑逃逸 ─────────────────────────────────────────
  checkRelativeEscapes(slicePath, slice);

  // ── D14：切片內部分層（元件只呈現）──────────────────────────────────
  checkSliceLayering(slicePath, slice);

  // ── D12：必須有 owner ───────────────────────────────────────────────
  if (REQUIRE_CODEOWNERS_ENTRY && !codeowners.includes(`/features/${dir}/`)) {
    fail(
      slice,
      "擁有權",
      "CODEOWNERS 沒有對應條目",
      `在 CODEOWNERS 加入 "/features/${dir}/ @your-team"。沒有 owner 的切片＝沒人負責的切片`,
    );
  }
}

// ── 執行 ──────────────────────────────────────────────────────────────
if (!existsSync(FEATURES_DIR)) {
  console.error(`找不到 features/ 目錄（預期在 ${relative(process.cwd(), FEATURES_DIR)}）`);
  process.exit(1);
}

const codeowners = loadCodeowners();
const slices = readdirSync(FEATURES_DIR).filter((entry) =>
  statSync(join(FEATURES_DIR, entry)).isDirectory(),
);

// 先建立「哪些套件名確實是切片」的事實名單，再逐片檢查。
const sliceNames = new Set(slices.map(slicePackageName));

for (const dir of slices) checkSlice(dir, codeowners, sliceNames);

if (violations.length === 0) {
  console.log(`✓ 一致性檢查通過（${slices.length} 個切片）`);
  process.exit(0);
}

console.error(`\n✗ 一致性檢查未通過：${violations.length} 項違規\n`);

const grouped = new Map<string, Violation[]>();
for (const v of violations) {
  const list = grouped.get(v.slice) ?? [];
  list.push(v);
  grouped.set(v.slice, list);
}

for (const [slice, items] of grouped) {
  console.error(`  ${slice}`);
  for (const item of items) {
    console.error(`    ✗ [${item.rule}] ${item.detail}`);
    console.error(`      → ${item.fix}`);
  }
  console.error("");
}

process.exit(1);
