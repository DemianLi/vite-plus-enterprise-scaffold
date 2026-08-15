#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { accountPlugins, DRILL_PLUGINS, DROPPED_PLUGINS, type ConfigSource } from "./plugins.ts";
import {
  checkDocumentedCounts,
  parseTestCounts,
  stripAnsi,
  type DocumentSource,
} from "./counts.ts";

/**
 * D2 退出演練：證明應用程式原始碼不綁死在 vite-plus 上（R1 / R9）。
 *
 * ── 為什麼這支腳本是 R1 的答案 ──────────────────────────────────────
 *
 * R1 是「`vite-plus@0.2.x` 是 beta，稽核／採購會不會放行」。
 * 那不是技術問題，但技術可以改變它的**性質**：
 *
 *   沒有這支：「我們押注在一個 beta 工具鏈上，出事再說」
 *   有這支：  「我們用 beta 工具鏈，退出路徑**每季實測一次**，最後一次是 X 月 X 日，
 *              耗時 N 秒，退到上游 Vite <版本> 可建置、測試全過」
 *
 * 第二種說法採購會接受，第一種不會 —— 差別不在風險大小，在於風險是否被證明是有界的。
 * 而 D2 當初選「可替換驅動層」，賭的就是這件事；R9 說那張保單**從未被兌現測試過**，
 * 也就是說它到目前為止只是一句話。
 *
 * ── 兩種模式 ────────────────────────────────────────────────────────
 *
 *   --static（預設）不連網、幾秒鐘、跑在每次 gate 裡
 *       驗「退出面」有沒有擴大：除了設定檔以外，沒有任何原始碼 import vite-plus。
 *       這是**真的會腐化的那一半** —— 有人在切片裡 import 一個 vite-plus 的
 *       helper，退出成本就從「改兩個設定檔」變成「改四十個檔案」，而且沒人會發現。
 *
 *   --full  連網、數分鐘、每季一次
 *       真的用上游 Vite 建一次、用上游 Vitest 跑一次測試，並寫下帶日期的證據。
 *
 * ── 為什麼證據要進版控 ──────────────────────────────────────────────
 *
 * 一個沒有記錄「最後一次何時跑過」的演練不是控制措施，是一段程式碼。
 * `evidence.json` 進 git，跟 `surface.json` 一樣 —— 那份檔案就是拿給稽核看的東西。
 *
 * ⚠️ **--full 必須在專案目錄之外執行 npm**：本 repo 的 `devEngines.packageManager`
 * 會讓 npm 直接以 EBADDEVENGINES 中止（實測過，見 C8）。因此暫存目錄開在 os.tmpdir()。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const EVIDENCE_PATH = join(ROOT, "tools/exit-drill/evidence.json");

/** 退出面：允許 import vite-plus 的檔案。改動這份清單就是在改變退出成本。 */
const EXIT_SURFACE = ["vite.config.ts", "apps/console/vite.config.ts"];

/** 演練證據的有效期。超過就不再是「已驗證」，只是「曾經驗證過」。 */
const FRESHNESS_DAYS = 120;

/**
 * 會引用演練成績的文件。新增引用的地方要一併加進來 ——
 * 沒加的地方不受檢查，也就是會安靜地過期（見 `counts.ts` 的說明）。
 */
const DOCUMENTS_CITING_EVIDENCE = ["DECISIONS.md", "HANDOFF.md", "tools/exit-drill/README.md"];

const SCAN_DIRS = ["apps", "features", "platform"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".vue"];
const SKIP = new Set(["node_modules", "dist", ".git", "coverage"]);

// 上游對應版本。vitest 與 vite-plus 內建的是同一個版本號，因為 vite-plus 就是
// 打包上游的 vitest —— 這件事本身就是 D2 論證的一部分。
const UPSTREAM = {
  vite: "^8.2.1",
  vue: "^3.5.41",
  "@vitejs/plugin-vue": "^6.0.8",
  vitest: "4.1.10",
};

interface Evidence {
  readonly lastRun: string;
  readonly result: "pass" | "fail";
  readonly replaced: Record<string, string>;
  readonly upstream: Record<string, string>;
  readonly exitSurface: readonly string[];
  readonly durationSeconds: number;
  /** 演練跑過的測試數。文件裡引用的那個數字，唯一的來源就是這裡（見 checkDocumentedCounts）。 */
  readonly tests: number;
  readonly testFiles: number;
  readonly note: string;
}

function collectFiles(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, found);
    else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) found.push(full);
  }
  return found;
}

// ── 靜態檢查：退出面有沒有擴大 ────────────────────────────────────────

function runStatic(): number {
  const surface = new Set(EXIT_SURFACE);
  const leaks: string[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of collectFiles(join(ROOT, dir))) {
      const relative = file.slice(ROOT.length + 1);
      if (surface.has(relative)) continue;

      const source = readFileSync(file, "utf8");
      // 只看 import 指定字串，避免命中說明文字裡提到 vite-plus 的地方。
      if (/from\s+["']vite-plus/.test(source) || /from\s+["']@voidzero-dev\//.test(source)) {
        leaks.push(relative);
      }
    }
  }

  if (leaks.length > 0) {
    console.error("\n✗ D2 的退出面擴大了：以下檔案直接依賴 vite-plus\n");
    for (const leak of leaks) console.error(`  ✗ ${leak}`);
    console.error(
      "\n  D2 選的是「可替換的驅動層」：vite-plus 只出現在設定檔，應用程式原始碼碰不到它。\n" +
        "  一旦切片或平台套件開始 import 它，退出成本就從「改兩個設定檔」變成「改幾十個檔案」——\n" +
        "  而 R1（beta 工具鏈的可接受性）整個論證就是建立在退出成本很小這件事上。\n\n" +
        "  需要 vite-plus 的功能時：把它包在該應用的 vite.config.ts 裡，\n" +
        "  或用結構型別描述所需的最小介面（見 @org/security-headers 的做法）。\n",
    );
    return 1;
  }

  console.log(`✓ D2 退出面未擴大（${EXIT_SURFACE.length} 個設定檔，應用原始碼零依賴）`);

  const configs: ConfigSource[] = EXIT_SURFACE.filter((relative) =>
    existsSync(join(ROOT, relative)),
  ).map((relative) => ({ path: relative, source: readFileSync(join(ROOT, relative), "utf8") }));

  const pluginErrors = accountPlugins(configs);
  if (pluginErrors.length > 0) {
    console.error("\n✗ 退出演練的 plugin 帳目對不上\n");
    for (const error of pluginErrors) console.error(`  ✗ ${error}`);
    console.error(
      "\n  --full 會**重新產生**設定檔，plugin 清單寫死在 tools/exit-drill/src/plugins.ts 裡。\n" +
        "  沒登記的 plugin 在演練裡等於不存在：演練照樣建置成功、照樣寫下 pass，\n" +
        "  但產出的是一個少了那個 plugin 的應用 —— 而沒有人會發現，直到真的要退出的那天。\n\n" +
        "  請在 plugins.ts 裡二選一登記（判準：這個 plugin 會不會改變建置產物？）：\n" +
        "    · 會 → 加進 DRILL_PLUGINS，演練會真的裝它、真的註冊它\n" +
        "    · 不會 → 加進 DROPPED_PLUGINS，並寫明丟掉它為什麼不影響產物\n\n" +
        "  兩者都要走 PR —— 這一格的判斷正是退出保證的內容本身。\n",
    );
    return 1;
  }

  console.log(
    `✓ plugin 帳目相符（重現 ${DRILL_PLUGINS.length}、明示丟棄 ${DROPPED_PLUGINS.length}）`,
  );
  return checkFreshness();
}

function checkFreshness(): number {
  if (!existsSync(EVIDENCE_PATH)) {
    console.warn("⚠ 尚未跑過完整退出演練（R9）。執行：node tools/exit-drill/src/cli.ts --full");
    return process.argv.includes("--require-fresh") ? 1 : 0;
  }

  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8")) as Evidence;
  const ageDays = Math.floor((Date.now() - Date.parse(evidence.lastRun)) / 86_400_000);

  if (evidence.result !== "pass") {
    console.error(`✗ 最後一次退出演練是失敗的（${evidence.lastRun}）`);
    return 1;
  }

  if (ageDays > FRESHNESS_DAYS) {
    const message =
      `⚠ 退出演練證據已過期：最後一次 ${evidence.lastRun}（${ageDays} 天前，上限 ${FRESHNESS_DAYS} 天）。\n` +
      "  過期的演練不是控制措施，只是一段曾經跑過的程式碼。";
    if (process.argv.includes("--require-fresh")) {
      console.error(`✗ ${message}`);
      return 1;
    }
    console.warn(message);
    return 0;
  }

  console.log(`✓ 退出演練證據有效（${evidence.lastRun}，${ageDays} 天前）`);

  // 舊的 evidence.json 沒有 tests 欄位（C36 之前產生的）。那種情況跳過比較，
  // 而不是拿 undefined 去比出一堆假紅燈 —— 下一次 --full 會自動補上。
  if (typeof evidence.tests !== "number" || evidence.tests === 0) {
    console.warn("⚠ evidence.json 沒有測試數，文件比對跳過。下次 --full 會補上。");
    return 0;
  }

  const documents: DocumentSource[] = DOCUMENTS_CITING_EVIDENCE.filter((relative) =>
    existsSync(join(ROOT, relative)),
  ).map((relative) => ({ path: relative, source: readFileSync(join(ROOT, relative), "utf8") }));

  const countErrors = checkDocumentedCounts(documents, evidence.tests);
  if (countErrors.length > 0) {
    console.error("\n✗ 文件引用的演練成績與證據不符\n");
    for (const error of countErrors) console.error(`  ✗ ${error}`);
    console.error(
      "\n  這個數字是拿去跟採購與稽核講的話，而它被抄在好幾份文件裡。\n" +
        "  每季重跑一次演練它就會變，於是那幾處同時變成錯的 ——\n" +
        "  這個 repo 在「人抄下來的數字沒有人再推導一次」上已經栽了六次。\n\n" +
        `  唯一的事實來源是 evidence.json 的 tests（目前 ${evidence.tests}）。\n` +
        "  請把上列位置改成該數字；如果是演練本身該重跑，執行 vpr exit-drill。\n",
    );
    return 1;
  }

  console.log(`✓ 文件引用的演練成績與證據一致（${evidence.tests} 個測試，${documents.length} 份）`);
  return 0;
}

// ── 完整演練：真的用上游 Vite 建一次 ──────────────────────────────────

function catalogVersions(): Record<string, string> {
  // pnpm-workspace.yaml 的 catalog 區塊。不引入 YAML parser —— 這裡要的只是
  // 「key: value」的對照，而多帶一個相依就是多一筆 SCA 範圍（D2 的同一條理由）。
  const yaml = readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8");
  const versions: Record<string, string> = {};
  let inCatalog = false;

  for (const line of yaml.split("\n")) {
    if (line.startsWith("catalog:")) {
      inCatalog = true;
      continue;
    }
    if (inCatalog && line.length > 0 && !line.startsWith(" ")) break;
    if (!inCatalog) continue;

    const trimmed = line.trim();
    const colon = trimmed.indexOf(":");
    if (colon === -1 || trimmed.startsWith("#")) continue;
    const key = trimmed.slice(0, colon).replaceAll('"', "");
    const value =
      trimmed
        .slice(colon + 1)
        .split("#")[0]
        ?.trim() ?? "";
    if (key.length > 0 && value.length > 0) versions[key] = value;
  }

  return versions;
}

interface WorkspacePackage {
  readonly name: string;
  readonly dir: string;
  readonly exports: Record<string, string>;
}

function listWorkspacePackages(): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];

  for (const layer of ["platform", "features"]) {
    for (const entry of readdirSync(join(ROOT, layer), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(ROOT, layer, entry.name);
      const manifestPath = join(dir, "package.json");
      if (!existsSync(manifestPath)) continue;

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        name?: string;
        exports?: Record<string, string> | string;
      };
      if (typeof manifest.name !== "string" || manifest.exports === undefined) continue;

      packages.push({
        name: manifest.name,
        dir,
        exports:
          typeof manifest.exports === "string" ? { ".": manifest.exports } : manifest.exports,
      });
    }
  }

  return packages;
}

/**
 * 從 workspace 的真實內容推導出演練要安裝的執行期相依。
 *
 * ── 為什麼不能寫死 ──────────────────────────────────────────────────
 *
 * 第一版把 vue／vue-router／pinia／vue-i18n／@tanstack/vue-query 列死在這裡。
 * D15 讓 `@org/ui` 帶進 reka-ui、clsx、tailwind-merge 之後，演練當場炸在
 * 「Rolldown failed to resolve import "clsx"」——**寫死的清單不會通知你它過期了**。
 *
 * 與 C36 的 plugin 帳目同一個病灶：演練重建應用時，只要有一份「應該長什麼樣」
 * 的清單是人手維護的，它就會跟真實情況漂移。差別只在漂移的後果是紅燈還是綠燈。
 *
 * ── 為什麼要走圖而不是掃全部 workspace ──────────────────────────────
 *
 * 第二版改成掃所有 platform/ 與 features/ 的 dependencies，結果把
 * `@org/eslint-config` 的 typescript-eslint 也裝了進去 —— 而它宣告
 * `peer typescript >=4.8.4 <6.1.0`，對上本 repo 的 TypeScript 7，npm 直接 ERESOLVE。
 *
 * 那個 package **演練根本用不到**。正確的範圍是「從 apps/console 沿 workspace
 * 連結走得到的」：那才是被建置與被測試的東西。
 */
function reachableWorkspacePackages(packages: readonly WorkspacePackage[]): readonly string[] {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const reached = new Set<string>();
  const queue = [join(ROOT, "apps/console/package.json")];

  while (queue.length > 0) {
    const manifest = queue.pop();
    if (manifest === undefined || !existsSync(manifest)) continue;

    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // devDependencies 也要走：@org/security-headers 是 console 的 devDependency，
    // 而它有測試 —— 演練會跑那些測試。
    const links = { ...parsed.dependencies, ...parsed.devDependencies };
    for (const [name, spec] of Object.entries(links)) {
      if (!spec.startsWith("workspace:") || reached.has(name)) continue;
      const pkg = byName.get(name);
      if (pkg === undefined) continue;
      reached.add(name);
      queue.push(join(pkg.dir, "package.json"));
    }
  }

  return [...reached];
}

/**
 * 演練要安裝的執行期相依。
 *
 * 判準：**從 apps/console 走得到的 workspace 套件，其 `dependencies` 裡
 * 不是 workspace: 連結的那些。** `catalog:` 換成 catalog 的實際版本，
 * 而 UPSTREAM 有對應的一律優先 —— 整場演練要證明的就是「換成上游也跑得動」。
 */
function runtimeDependencies(
  packages: readonly WorkspacePackage[],
  catalog: Record<string, string>,
): Record<string, string> {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const manifests = [join(ROOT, "apps/console/package.json")];

  for (const name of reachableWorkspacePackages(packages)) {
    const pkg = byName.get(name);
    if (pkg !== undefined) manifests.push(join(pkg.dir, "package.json"));
  }

  const resolved: Record<string, string> = {};

  for (const manifest of manifests) {
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
      dependencies?: Record<string, string>;
    };

    for (const [name, spec] of Object.entries(parsed.dependencies ?? {})) {
      // workspace: 的內部連結由 alias 處理，不必真的安裝。
      if (spec.startsWith("workspace:")) continue;
      const version = (UPSTREAM as Record<string, string>)[name] ?? catalog[name] ?? spec;
      // catalog: 沒對應到實際版本就是 catalog 少了一筆，讓它炸而不是裝一個假的。
      if (version.startsWith("catalog:")) {
        throw new Error(`${name} 用了 catalog: 但 pnpm-workspace.yaml 的 catalog 裡沒有它`);
      }
      resolved[name] = version;
    }
  }

  return Object.fromEntries(
    Object.entries(resolved).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/** 一個目錄下所有 .css 的位元組總和。演練與本 repo 兩邊用同一把尺。 */
function totalCssBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += totalCssBytes(full);
    else if (entry.name.endsWith(".css")) total += statSync(full).size;
  }
  return total;
}

/**
 * 演練建出來的東西，跟本 repo 建出來的是不是同一個等級。
 *
 * ── 為什麼光是「建置成功」不夠 ──────────────────────────────────────
 *
 * D15 導入 Tailwind 的過程實測過三次「建置成功但產物是壞的」：
 *
 *   1. @source 沒宣告 → CSS 從 160 變成 4409 bytes，**裡面一個 utility 都沒有**
 *   2. @source 用固定相對路徑 → 演練把 package 搬走後掃不到切片，樣式少一半
 *   3. plugin 沒登記（C36）→ 演練產出完全沒有樣式的應用，exit 0
 *
 * 三次的共同點：**退出碼是 0**。而 evidence.json 會據此寫下 "pass"，
 * 然後被拿去給稽核看。
 *
 * 所以這裡拿**本 repo 自己的建置產物**當獨立比較基準 —— 這是 C33 的同一條規則：
 * 任何「掃了 N 個目標」的步驟都要對著一個獨立來源斷言 N > 0。
 *
 * 門檻用 80% 而不是相等：兩邊的 hash 命名與 chunk 切分本來就會有差異，
 * 要求相等會讓這道檢查在無關的變動上變紅，然後被人加上 skip。
 * 真正要抓的是「少了一整層」那種等級的落差。
 */
function compareArtifacts(workdir: string): { ok: boolean; note: string } {
  const reference = totalCssBytes(join(ROOT, "apps/console/dist"));
  const produced = totalCssBytes(join(workdir, "dist"));

  if (reference === 0) {
    return {
      ok: true,
      note: "本 repo 尚無建置產物可比對（先跑一次 vp run -F @org/console build）",
    };
  }

  const ratio = produced / reference;
  if (ratio >= 0.8) {
    return {
      ok: true,
      note: `CSS ${produced} / ${reference} bytes（${Math.round(ratio * 100)}%）`,
    };
  }

  return {
    ok: false,
    note:
      `演練產出的 CSS 只有 ${produced} bytes，本 repo 是 ${reference} bytes（${Math.round(ratio * 100)}%）。` +
      "有東西沒有被重現 —— 最可能是某個影響產物的 plugin 沒登記在 DRILL_PLUGINS，" +
      "或樣式的 @source 用了綁死目錄佈局的相對路徑",
  };
}

interface RunResult {
  readonly ok: boolean;
  /** stdout ＋ stderr 合併。演練要從 vitest 的摘要裡撈出測試數，見 parseTestCounts。 */
  readonly output: string;
}

/**
 * `capture` 只在需要解析輸出的那一步開啟。
 *
 * 預設 inherit，因為 `npm install` 會跑好幾分鐘 —— 擷取會讓它整段靜默，
 * 卡住時完全看不出卡在哪。擷取的代價就是失去即時輸出，所以範圍愈小愈好。
 *
 * ⚠️ 擷取時**兩條都要接**：vitest 的摘要（`Tests  N passed`）寫在 **stderr**，
 * 不是 stdout。第一版只接 stdout，於是撈不到數字 —— 而那個 bug 是被
 * 「撈不到就當失敗」那條守衛擋下來的，不是被人看出來的。
 */
function run(command: string, args: readonly string[], cwd: string, capture = false): RunResult {
  const stdio = capture ? "pipe" : "inherit";
  const result = spawnSync(command, [...args], { cwd, stdio: ["inherit", stdio, stdio] });
  if (!capture) return { ok: result.status === 0, output: "" };

  const out = result.stdout?.toString() ?? "";
  const err = result.stderr?.toString() ?? "";
  process.stdout.write(out);
  process.stderr.write(err);
  return { ok: result.status === 0, output: `${out}\n${err}` };
}

function runFull(): number {
  const started = Date.now();
  const workdir = mkdtempSync(join(tmpdir(), "exit-drill-"));
  console.log(`退出演練工作目錄：${workdir}\n`);

  const filter = (source: string): boolean =>
    !source.includes("/node_modules") && !source.includes("/dist");

  // 1. 複製應用與各層原始碼（不含任何設定檔以外的 vite-plus 痕跡）
  cpSync(join(ROOT, "apps/console"), join(workdir, "app"), { recursive: true, filter });
  rmSync(join(workdir, "app/vite.config.ts"), { force: true });

  const packages = listWorkspacePackages();
  const aliases: { find: string; replacement: string }[] = [];

  for (const pkg of packages) {
    const target = join(workdir, "packages", pkg.name.replace("@org/", ""));
    cpSync(pkg.dir, target, { recursive: true, filter });

    for (const [subpath, relative] of Object.entries(pkg.exports)) {
      // **不要過濾副檔名。** 第一版只 alias .ts/.js/.mjs，於是 @org/ui 的
      // `./styles.css` 子路徑被靜靜丟掉，演練的建置炸在
      // 「Could not load .../index.ts/styles.css」—— 一個完全看不出病因的訊息。
      //
      // export 欄位裡的每一個子路徑都可能被 import，沒有哪一種副檔名
      // 天生不需要解析。這是 C36 的同一種形狀：**演練沒有重現的東西，
      // 就是它證明不了的東西** —— 只是這次它吵了出來，不是安靜地放行。
      const find = subpath === "." ? pkg.name : `${pkg.name}${subpath.slice(1)}`;
      aliases.push({ find, replacement: join(target, relative) });
    }
  }

  // 長的排前面：alias 是「完全相符或子路徑」比對，取第一個命中的。
  // @org/slice-kit 排在 @org/slice-kit/contract 前面的話，後者會被解析成
  // .../slice-kit/src/index.ts/contract —— 錯得很安靜。
  aliases.sort((a, b) => b.find.length - a.find.length);

  // 2. 產生**不含 vite-plus** 的設定：這就是 D2 所謂「可替換的驅動層」
  const aliasLiteral = JSON.stringify(aliases, null, 2);

  // plugin 的 import 與註冊都由 DRILL_PLUGINS 推導，不是各寫一份。
  // 兩邊分開寫的話，總有一天會有人只改到其中一邊，而少一個 plugin 的建置**不會報錯**。
  const pluginImports = DRILL_PLUGINS.map((plugin) => `${plugin.importLine}\n`).join("");
  const pluginCalls = DRILL_PLUGINS.map((plugin) => `${plugin.name}()`).join(", ");

  writeFileSync(
    join(workdir, "vite.config.mjs"),
    `import { defineConfig } from "vite";\n` +
      pluginImports +
      `\n// 這份設定是退出演練自動產生的：上游 Vite、上游 plugin，零 vite-plus。\n` +
      `export default defineConfig({\n` +
      `  root: "app",\n` +
      `  plugins: [${pluginCalls}],\n` +
      `  resolve: { alias: ${aliasLiteral} },\n` +
      `  build: { outDir: "../dist", emptyOutDir: true, sourcemap: "hidden" },\n` +
      `});\n`,
  );

  writeFileSync(
    join(workdir, "vitest.config.mjs"),
    `import { defineConfig } from "vitest/config";\n\n` +
      `export default defineConfig({\n` +
      `  resolve: { alias: ${aliasLiteral} },\n` +
      `  test: { include: ["app/tests/**/*.test.ts", "packages/*/tests/**/*.test.ts"] },\n` +
      `});\n`,
  );

  const catalog = catalogVersions();
  const dependency = (name: string): string => catalog[name] ?? "latest";

  writeFileSync(
    join(workdir, "package.json"),
    `${JSON.stringify(
      {
        name: "exit-drill",
        private: true,
        type: "module",
        // 由 workspace 的真實 dependencies 推導，不是寫死的清單 ——
        // 寫死的清單不會通知你它過期了（見 runtimeDependencies 的說明）。
        dependencies: runtimeDependencies(packages, catalog),
        devDependencies: {
          // ⚠️ 這裡是**上游的 vite**，不是 catalog 裡被 alias 成
          // @voidzero-dev/vite-plus-core 的那個。整場演練的重點就在這一行。
          vite: UPSTREAM.vite,
          vitest: UPSTREAM.vitest,
          // plugin 的相依同樣由 DRILL_PLUGINS 推導：登記了卻沒裝，建置會炸得很難懂。
          // 上游有對應版本就用上游的（那是演練要證明的東西），否則退回 catalog。
          ...Object.fromEntries(
            DRILL_PLUGINS.map((plugin) => [
              plugin.module,
              (UPSTREAM as Record<string, string>)[plugin.module] ?? dependency(plugin.module),
            ]),
          ),
        },
      },
      null,
      2,
    )}\n`,
  );

  // 3. 用 npm 安裝 —— 在專案目錄之外，devEngines 不適用（C8）
  // 用 --loglevel=error 而不是 --silent：--silent 連**錯誤訊息也吞掉**，
  // 於是安裝失敗時只會看到「✗ npm install」與 0 秒，完全無從查起（實測過）。
  const installed = run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], workdir);
  const steps: [string, boolean][] = [["npm install", installed.ok]];
  let counts: { tests: number; testFiles: number } | null = null;

  if (installed.ok) {
    // @org/tsconfig 必須跟著過去，否則所有 `extends: "@org/tsconfig/*.json"` 解析失敗。
    //
    // 這**不會**弱化本演練的論證：那個 package 是四份純 JSON，唯一與工具鏈沾邊的是
    // `types: ["vite/client"]`，而上游 vite 同樣提供該型別。第一次跑演練時它就是
    // 第一個絆倒的東西 —— 而那正是演練的用途：把「理論上可以退出」變成實際的步驟清單。
    cpSync(join(ROOT, "platform/tsconfig"), join(workdir, "node_modules/@org/tsconfig"), {
      recursive: true,
      filter,
    });

    const built = run("npx", ["vite", "build"], workdir).ok;
    steps.push(["vite build", built]);

    // 建置成功不等於產物是對的。見 compareArtifacts 的說明（實測踩過三次）。
    if (built) {
      const comparison = compareArtifacts(workdir);
      steps.push(["產物與本 repo 同級", comparison.ok]);
      console.log(`    ${comparison.ok ? "✓" : "✗"} 產物比對：${comparison.note}`);
    }

    const tested = run("npx", ["vitest", "run"], workdir, true);
    steps.push(["vitest run", tested.ok]);
    counts = parseTestCounts(tested.output);

    // 撈不到就當成失敗的一步，而不是安靜地寫下 tests: 0。
    // 一個「通過但測試數是 0」的證據比沒有證據更糟：它看起來很正常。
    if (tested.ok && counts === null) {
      console.error("\n✗ vitest 通過了，卻撈不到測試數的摘要行 —— 可能是 reporter 格式變了。");
      // 把實際看到的東西印出來。只說「撈不到」而不給輸出，下一個人得重跑一次
      // 才能開始查 —— 而這一步要花幾分鐘。
      console.error(`  實際擷取到 ${tested.output.length} 個字元，尾端 600 字元：`);
      console.error(stripAnsi(tested.output).slice(-600));
      steps.push(["撈取測試數", false]);
    }
  }

  const passed = steps.every(([, ok]) => ok);
  const durationSeconds = Math.round((Date.now() - started) / 1000);

  const evidence: Evidence = {
    lastRun: new Date().toISOString().slice(0, 10),
    result: passed ? "pass" : "fail",
    replaced: { "vite-plus": catalog["vite-plus"] ?? "unknown" },
    upstream: UPSTREAM,
    exitSurface: EXIT_SURFACE,
    durationSeconds,
    tests: counts?.tests ?? 0,
    testFiles: counts?.testFiles ?? 0,
    note:
      "以上游 Vite/Vitest 重建 apps/console 與全部 platform、features 的測試，" +
      "設定檔由本演練重新產生，應用程式原始碼一字未改。",
  };

  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  rmSync(workdir, { recursive: true, force: true });

  console.log(
    `\n${passed ? "✓" : "✗"} 退出演練${passed ? "通過" : "失敗"}（${durationSeconds} 秒）`,
  );
  for (const [step, ok] of steps) console.log(`    ${ok ? "✓" : "✗"} ${step}`);
  console.log(`\n證據已寫入 tools/exit-drill/evidence.json —— 請一併提交。`);

  return passed ? 0 : 1;
}

process.exit(process.argv.includes("--full") ? runFull() : runStatic());
