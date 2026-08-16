#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
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
  SLICE_DESIGN_SYSTEM_IMPORTS,
  DESIGN_SYSTEM_PACKAGE,
  usesDesignSystem,
  CSP_INCOMPATIBLE_MODULES,
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

/**
 * 掃描的根目錄。預設是本 repo，`--root <dir>` 可以指到別處。
 *
 * ── 這個參數不是為了彈性，是為了讓這支工具能被反向測試 ──────────────
 *
 * 「該紅的時候會不會紅」只能靠**真的弄壞一個切片**來證明。
 * 在寫死 ROOT 的版本下，那意味著就地竄改 `features/order` 再還原 ——
 * 能動，但跑到一半被中斷 repo 就壞著，而且是安靜地壞。
 *
 * 有了 `--root`，反向測試可以把切片複製到暫存目錄再破壞副本：
 * 中斷了最多留一個 temp 目錄，原始碼一個位元組都沒動過。
 *
 * 這是**為了可測試性去改正式工具的介面**，值得說清楚代價：
 * 多一個參數、多一條解析路徑。換到的是這支 Tier 2 閘門
 * 第一次有辦法證明自己有牙齒 —— 在那之前它只證明過「現況是綠的」。
 *
 * ⚠️ 刻意**不做**環境變數版本。env 會被繼承到子行程，
 * 一個沒清乾淨的 `CONFORMANCE_ROOT` 會讓 CI 安靜地掃錯目錄然後回報通過。
 * 明確的旗標做不到這件事。
 */
function parseRoot(argv: readonly string[]): string {
  const at = argv.indexOf("--root");
  if (at === -1) return resolve(fileURLToPath(import.meta.url), "../../../..");

  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("--root 後面要接一個目錄");
    process.exit(1);
  }
  return resolve(value);
}

const ROOT = parseRoot(process.argv.slice(2));
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
/**
 * 抽出一段 import 敘述的**匯入子句**（`import` 與 `from` 之間那一段）。
 *
 * 第一版掃的是整份檔案有沒有出現那個識別字，結果**在定義這條規則的檔案上誤報**——
 * `slice-kit/src/contract.ts` 把禁用名稱當資料列著，於是閘門指控契約本身違規。
 *
 * 那不是「加個例外把契約檔跳過」就好：那種修法會讓規則對任何「剛好提到這個名字」
 * 的檔案繼續誤報，而一道會亂叫的閘門會被加上 skip，然後永遠不會拿掉。
 * 正確的修法是只看**真的 import 敘述**。
 */
function importClauseBefore(source: string, specifierIndex: number): string | null {
  const head = source.lastIndexOf("import", specifierIndex);
  if (head === -1) return null;
  const from = source.indexOf("from", head);
  if (from === -1 || from > specifierIndex) return null;
  return source.slice(head + "import".length, from);
}

/** 匯入子句裡有沒有這個具名匯入。用字串比對，不用動態正則（Tier 2 會擋）。 */
function clauseImports(clause: string, name: string): boolean {
  const isWordChar = (char: string | undefined): boolean =>
    char !== undefined && /[A-Za-z0-9_$]/.test(char);

  let at = clause.indexOf(name);
  while (at !== -1) {
    if (!isWordChar(clause[at - 1]) && !isWordChar(clause[at + name.length])) return true;
    at = clause.indexOf(name, at + 1);
  }
  return false;
}

/**
 * D15：切片不得自己長出一套設計系統。
 *
 * 擋的是 import 而不是「有沒有 components 目錄」—— 切片當然需要自己的呈現元件，
 * 擋掉目錄只會逼大家把元件塞進 views/，規則變成純粹的騷擾。
 * 真正要防的是繞過 `@org/ui` 自己拼基元：D4 禁止切片互依，
 * 所以第二個團隊會再拼一次，兩套永遠不會收斂。
 */
function checkDesignSystemBoundary(slicePath: string, slice: string): void {
  for (const file of collectSourceFiles(slicePath)) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined || match.index === undefined) continue;
      // 借型別不算耦合，理由同 store 的規則。
      if (isTypeOnlyImportAt(source, match.index)) continue;

      const banned = SLICE_DESIGN_SYSTEM_IMPORTS.find((name) => specifier === name);
      if (banned === undefined) continue;

      fail(
        slice,
        "繞過設計系統",
        `${relative(slicePath, file)} 直接 import 了 "${banned}"`,
        `一律走 @org/ui（D15）。要的元件那裡沒有，就把它加進 platform/ui ——` +
          "那個 package 有 CODEOWNERS 與 api-surface 閘門，切片沒有。" +
          "在切片裡自己拼一套，第二個團隊會再拼一次，而兩套永遠不會收斂",
      );
    }
  }
}

/**
 * D15 的另一半：切片有沒有**真的用**設計系統。
 *
 * `checkDesignSystemBoundary` 擋的是「繞過 `@org/ui` 自己拼基元」。
 * 這條擋的是更常見、也更安靜的那一種：**根本沒用**。
 *
 * 沒有這條的話，一個全用裸 `<h1>`／`<table>`／自己寫的 `<style scoped>`
 * 的切片會全綠通過 —— 而那正是 D15 想避免的「每個團隊各長一套」，
 * 它不是靠有人偷偷 import reka-ui 發生的，是靠沒有人 import 任何東西發生的。
 *
 * 判準住在契約裡（`usesDesignSystem`），與產生器的測試共用同一份實作。
 */
function checkDesignSystemAdoption(slicePath: string, slice: string): void {
  const files = collectSourceFiles(slicePath);

  // 掃不到檔案就當失敗。空清單會讓 `.some()` 回傳 false，
  // 訊息會變成「這個切片沒用設計系統」—— 指著完全錯誤的方向。
  if (files.length === 0) {
    fail(
      slice,
      "設計系統採用",
      "掃不到任何原始碼檔案",
      "這通常表示目錄結構與 SOURCE_EXTENSIONS 對不上，而不是切片真的沒有程式碼",
    );
    return;
  }

  if (files.some((file) => usesDesignSystem(readFileSync(file, "utf8")))) return;

  fail(
    slice,
    "設計系統採用",
    `整個切片沒有任何一處使用 ${DESIGN_SYSTEM_PACKAGE}`,
    `畫面元件一律從 ${DESIGN_SYSTEM_PACKAGE} 取用（D15）。` +
      "自己刻一套不會違反任何一條規則，但兩個團隊各刻一次之後就永遠不會收斂 ——" +
      "而且兩邊各自看起來都是對的。" +
      `真的有切片不該用設計系統（純後台工具頁之類），那是契約要改，不是這一片開個旗標`,
  );
}

/**
 * D15：全 repo 禁止 CSP 不相容的模組。
 *
 * 目前只有一條：reka-ui 的 Splitter 會在拖曳時注入 <style> 元素，
 * 被 style-src 'self' 擋掉。症狀是「游標沒變」這種沒有人會聯想到 CSP 的小毛病。
 *
 * 這條掃**整個 repo**（含 platform/），不是只掃切片 —— 因為 platform/ui 才是
 * 最可能不小心用到它的地方。
 */
function checkCspIncompatibleImports(dir: string, label: string): void {
  for (const file of collectSourceFiles(dir)) {
    const contents = readFileSync(file, "utf8");

    for (const match of contents.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined || match.index === undefined) continue;

      const rule = CSP_INCOMPATIBLE_MODULES.find((entry) => entry.specifier === specifier);
      if (rule === undefined) continue;

      const clause = importClauseBefore(contents, match.index);
      if (clause === null) continue;

      for (const name of rule.names) {
        if (!clauseImports(clause, name)) continue;

        fail(
          label,
          "CSP 不相容的元件",
          `${relative(ROOT, file)} 匯入了 ${name}`,
          `${rule.reason}。改用不需要它的版面，或把這條規則的改動當成` +
            "「要不要為了它引入 per-request nonce」那場討論的入口" +
            "（見 slice-kit 契約的 CSP_INCOMPATIBLE_MODULES）",
        );
      }
    }
  }
}

/**
 * 幽靈依賴：**程式碼 import 了某個套件，而這個 package 的 `package.json` 沒宣告它**。
 *
 * ── 為什麼本機與 CI 都看不出來 ──────────────────────────────────────
 *
 * pnpm 的嚴格 `node_modules` 通常會擋，但有三條繞過路徑：workspace 根目錄的
 * 提升、`vite.config.ts` 的 alias、以及被別的套件間接帶進來的相依。
 * 三條都只在**這台機器的安裝結果**下成立，而檢查讀的是宣告，不是安裝結果。
 *
 * 症狀因此是最難回推的那種：本機綠、CI 綠，**乾淨重建時才爆**。
 * 而「乾淨重建」在這個腳手架有三個發生地點，其中第三個寫在契約裡：
 * 退出演練、單獨發佈、以及**機關端依原始碼重建 —— 那是驗收現場**。
 *
 * ── 掃的範圍：`features`／`platform`／`apps`，且**不含 `tests/`** ──────
 *
 * 兩個排除都是先乾跑量出來的，不是憑感覺畫的：
 *
 *   - **`tools/*` 不掃**：產生器與 codemod 的本職就是**把程式碼當資料拿著**
 *     （`slice-gen` 的模板、`codemods` 的 fixture、`conformance` 自己的反向
 *     測試）。乾跑在 `tools/` 底下噴出 20 幾條，全部是偽陽性。而且它們是
 *     開發期工具，不隨產物交付 —— 掃它們是拿誤報換零收益。
 *   - **`tests/` 不掃**：同一個理由的小號。測試檔會用樣板字串**組出**一段
 *     假的原始碼餵給被測物，那些 `import ... from "pinia"` 是資料不是相依。
 *
 * ⚠️ 代價要說清楚：**測試檔裡的幽靈依賴這條規則看不到。** 那是刻意的取捨，
 * 而它可以接受的理由是失敗方向不同 —— 測試少一個相依會**當場跑不起來**，
 * 不會安靜地混到驗收那天。真正致命的是 `src/` 那一半，而那一半守住了。
 *
 * 一道會誤報的閘門第一天就會被加上例外，然後例外永遠不會拿掉（見 C41）。
 * 寧可範圍窄而準，也不要寬而吵。
 */
const BLOCK_COMMENT = /\/\*[^]*?\*\//g;
const LINE_COMMENT = /^[ \t]*\/\/.*$/gm;

/**
 * 剝掉註解再掃。
 *
 * 不剝的話這條規則會**在定義規則的那份檔案上誤報**：`slice-kit/src/contract.ts`
 * 的 JSDoc 裡有 `import { useQuery } from "@tanstack/vue-query";` 當範例
 * （那正是它在解釋哪些 import 該被擋）。乾跑時它是第一個亮起來的。
 *
 * 與 `importClauseBefore` 是同一個坑的第二次 —— 差別只在這次乾跑先撞到，
 * 而不是等閘門上線之後被人回報。
 */
function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

/** npm 套件名的單一段（scope 或 name）。刻意單層量詞，理由見契約的 C19 註解。 */
const PACKAGE_NAME_SEGMENT = /^[a-z0-9._-]+$/;

function isPackageName(name: string): boolean {
  if (!name.startsWith("@")) return PACKAGE_NAME_SEGMENT.test(name);
  const slash = name.indexOf("/");
  if (slash === -1) return false;
  return (
    PACKAGE_NAME_SEGMENT.test(name.slice(1, slash)) &&
    PACKAGE_NAME_SEGMENT.test(name.slice(slash + 1))
  );
}

const BUILTIN_MODULES = new Set(builtinModules);

/**
 * import 指定字串 → 要在 `package.json` 裡找的套件名。不是套件的回 `null`。
 *
 * `@org/slice-kit/contract` 要收斂成 `@org/slice-kit`：**子路徑匯入的是同一個
 * 套件**，不收斂的話這條規則會對每一個合法的子路徑匯入亂叫。
 *
 * ⚠️ 含冒號的一律放行（`node:fs`、`virtual:*`、`data:`、`http:`）。
 * 內建模組**兩種寫法都要放行** —— 只擋 `node:` 前綴的話，一個裸寫的
 * `import { join } from "path"` 會被報成幽靈依賴，而那是完全合法的。
 */
function packageOfSpecifier(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.includes(":")) return null;

  const slash = specifier.indexOf("/");
  const name = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : slash === -1
      ? specifier
      : specifier.slice(0, slash);

  if (BUILTIN_MODULES.has(name)) return null;
  if (!isPackageName(name)) return null;
  return name;
}

const TESTS_SEGMENT = `${sep}tests${sep}`;

function checkPhantomDependencies(packageDir: string, label: string): void {
  const pkgPath = join(packageDir, "package.json");
  if (!existsSync(pkgPath)) return;

  const pkg = readJson(pkgPath);
  const declared = new Set<string>([
    ...Object.keys((pkg["dependencies"] as Record<string, string> | undefined) ?? {}),
    ...Object.keys((pkg["devDependencies"] as Record<string, string> | undefined) ?? {}),
    ...Object.keys((pkg["peerDependencies"] as Record<string, string> | undefined) ?? {}),
  ]);

  // 自我參照（`@org/ui` 內部匯入 `@org/ui/xxx`）不是幽靈依賴。
  const own = pkg["name"];
  if (typeof own === "string") declared.add(own);

  // ⚠️ 這裡**刻意不把 workspace 根目錄的 package.json 併進來**。
  // 根目錄的宣告正是「提升」這條繞過路徑的來源 —— 併進來的話，
  // 這條規則會對它最該抓的那一種情況回報綠燈。
  const reported = new Set<string>();

  for (const file of collectSourceFiles(packageDir)) {
    if (file.includes(TESTS_SEGMENT)) continue;
    const source = stripComments(readFileSync(file, "utf8"));

    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const name = packageOfSpecifier(match[1] ?? "");
      if (name === null || declared.has(name) || reported.has(name)) continue;
      reported.add(name);

      fail(
        label,
        "幽靈依賴",
        `${relative(ROOT, file)} 匯入了 "${name}"，但 ${relative(ROOT, pkgPath)} 沒有宣告它`,
        `把 "${name}" 加進該 package.json 的 dependencies 或 devDependencies。` +
          "現在能跑是靠 workspace 根目錄的提升或間接相依 —— " +
          "那在乾淨重建（退出演練、單獨發佈、機關端依原始碼重建）時不成立",
      );
    }
  }
}

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

  // ── D15：不得繞過設計系統自己拼一套 ─────────────────────────────────
  checkDesignSystemBoundary(slicePath, slice);

  // ── D15：也不得「根本不用」──────────────────────────────────────────
  checkDesignSystemAdoption(slicePath, slice);

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

// D15：CSP 不相容的元件掃**整個 repo**，不是只掃切片 ——
// platform/ui 才是最可能不小心用到 reka-ui Splitter 的地方。
for (const layer of ["features", "platform", "apps"]) {
  const dir = join(ROOT, layer);
  if (existsSync(dir)) checkCspIncompatibleImports(dir, layer);
}

// 幽靈依賴：**逐 package** 檢查，不是逐層 —— 因為比對的對象是
// 「這個 package 自己的 package.json」，而每一層底下有很多個。
for (const layer of ["features", "platform", "apps"]) {
  const dir = join(ROOT, layer);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir)) {
    const packageDir = join(dir, entry);
    if (!statSync(packageDir).isDirectory()) continue;
    checkPhantomDependencies(packageDir, `${layer}/${entry}`);
  }
}

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
