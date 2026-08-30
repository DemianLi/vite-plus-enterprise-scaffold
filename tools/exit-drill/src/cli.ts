#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative as relativeTo, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { accountPlugins, DRILL_PLUGINS, DROPPED_PLUGINS, type ConfigSource } from "./plugins.ts";
import {
  accountTestDependencies,
  DRILL_TEST_DEPENDENCIES,
  DROPPED_TEST_DEPENDENCIES,
  type ManifestDevDependencies,
} from "./dependencies.ts";
import {
  checkDocumentedCounts,
  DOCUMENTS_CITING_EVIDENCE,
  parseTestCounts,
  stripAnsi,
  type DocumentSource,
} from "./counts.ts";
import { collectFailures, reconcileFailures, type VitestJsonReport } from "./expected-failures.ts";
import {
  compareFingerprint,
  fingerprintOf,
  type FileDigest,
  type Fingerprint,
} from "./tree-fingerprint.ts";
import { parseFlags } from "@org/gate-kit";

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

/**
 * ⚠️ **不認得的旗標一律紅**（C126／C133 §五）。這幾行不是驗證輸入，是**擋一種
 * 綠燈**：被拿掉的旗標留在 CI 裡而被靜靜忽略時，那一步會頂著它原本的名字回綠
 * —— C52 的 `--masking` 就是那樣活了下來（完整量測在 C125 §一）。
 *
 * ⚠️ **spec 漏掉一個真旗標，合併當天 CI 就紅** —— 「不認得就失敗」對還沒登記的
 * 真旗標一視同仁。三個來源要一起掃：根 `package.json` 的 `scripts`、
 * `.github/workflows/*.yml`（⚠️ **含排程那兩個**，它們不在 `gate`／`ready` 上，
 * `gate-kit` 的名冊測試看不見它們）、以及這支工具自己的 `tests/`。
 */
const FLAGS = parseFlags(process.argv.slice(2), {
  full: { kind: "boolean" },
  "require-fresh": { kind: "boolean" },
} as const);
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const EVIDENCE_PATH = join(ROOT, "tools/exit-drill/evidence.json");

/**
 * 退出面：**演練會重建的那幾份設定**。改動這份清單就是在改變退出成本。
 *
 * ⚠️ 它同時是 `runFull()` 拿去做外掛帳目與重產設定的來源（見本檔下半），
 * 所以這裡只放真的會被重建的設定檔 —— 靜態掃描另有一份放行判準，見下。
 */
const EXIT_SURFACE = ["vite.config.ts", "apps/console/vite.config.ts"];

/**
 * 靜態掃描時**額外**放行的檔案，逐條寫理由。
 *
 * ⚠️ 這份清單與 `EXIT_SURFACE` 分開，是因為它們回答的是不同的問題：
 * 上面那份是「演練要重建哪幾份設定」，這一份是「哪些檔案 import 了 vite-plus
 * 而**不算退出面擴大**」。混在一起的話，這裡加一筆就會讓演練去重建一支測試檔。
 */
const STATIC_ALLOWED: ReadonlyArray<readonly [string, string]> = [
  [
    "apps/console/tests/dev-session-stripped.test.ts",
    "它**用建置器去問一個關於建置器的問題**（本機 session 入口有沒有被搖掉，#95 ②c），" +
      "而搖樹是建置器的行為 —— 用另一支建置器量到的不保證是同一件事。" +
      "退出 vite-plus 時這裡改的是 import 那一行，不是應用程式：退出成本沒有變。",
  ],
];

/**
 * 切片與應用自己的 `vite.config.ts`。
 *
 * ⚠️ **用形狀判，不是寫死路徑**：`tools/slice-gen` 產出的每一片都帶一支
 * （覆蓋率門檻只能收在 package 自己的設定裡 —— C120），而「加第一片切片」
 * 正是採用指南教的第一件事。寫死路徑的話，照著指南做的團隊第一天就會撞到
 * 一道說他們「擴大了退出面」的紅燈，而他們什麼都沒做錯。
 *
 * 判準沒有放寬：規則本來就是「vite-plus 只出現在**設定檔**」。
 */
function isViteConfig(relative: string): boolean {
  return relative.endsWith("/vite.config.ts") || relative === "vite.config.ts";
}

/** 演練證據的有效期。超過就不再是「已驗證」，只是「曾經驗證過」。 */
const FRESHNESS_DAYS = 120;

// 受守的文件清單住在 counts.ts —— 與比對邏輯放在一起，測試才驗得到它（C64）。

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
  /**
   * 登記在 `EXPECTED_FAILURES` 裡、這次如期失敗的條數（C148 §五）。
   *
   * ⚠️ 與 `tests` 分開記，因為它們是兩種主張：`tests` 是「退到上游之後照樣
   * 通過的條數」，這一個是「因為演練換掉了它要問的東西而必然失敗的條數」。
   * 合成一個數字的話，帳目膨脹起來不會有人看得出來。
   */
  readonly expectedFailures: number;
  /**
   * 演練涵蓋範圍的內容指紋，以及進到指紋裡的檔案數（C149）。
   *
   * ⚠️ 檔案數不是說明文字，是**對照組**：0 個檔案在兩邊會算出同一個空雜湊，
   * 然後「相符」—— 見 tree-fingerprint.ts。
   */
  readonly treeHash?: string;
  readonly treeFiles?: number;
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
      if (surface.has(relative) || isViteConfig(relative)) continue;
      if (STATIC_ALLOWED.some(([path]) => path === relative)) continue;

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

  console.log(
    `✓ D2 退出面未擴大（設定檔 ＋ ${STATIC_ALLOWED.length} 筆具名例外，應用原始碼零依賴）`,
  );

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

  const dependencyErrors = accountTestDependencies(reachableManifests());
  if (dependencyErrors.length > 0) {
    console.error("\n✗ 退出演練的測試相依帳目對不上\n");
    for (const error of dependencyErrors) console.error(`  ✗ ${error}`);
    console.error(
      "\n  --full 的最後一步是 `vitest run`，而它跑在一個由演練**重新產生**的\n" +
        "  package.json 上。沒登記的測試相依在那裡等於不存在：測試起不來，\n" +
        "  而錯誤訊息是 ERR_MODULE_NOT_FOUND，看起來像環境壞了。\n\n" +
        "  ⚠️ 這**已經真的發生過**：happy-dom 與 @vue/test-utils 隨 masking.test.ts\n" +
        "  一起進來，演練從那一刻起就是壞的，而完整演練每季才跑一次 ——\n" +
        "  所以這道檢查留在靜態這一半，讓它在加相依的那個 PR 上就紅。\n\n" +
        "  請在 tools/exit-drill/src/dependencies.ts 裡二選一登記\n" +
        "（判準：測試跑起來需要它，而它不是被替換掉的工具鏈本身？）：\n" +
        "    · 需要 → 加進 DRILL_TEST_DEPENDENCIES，演練會真的裝它\n" +
        "    · 不需要 → 加進 DROPPED_TEST_DEPENDENCIES，並寫明由誰提供、\n" +
        "      或為什麼不裝它演練仍然成立（「用不到」不算理由）\n",
    );
    return 1;
  }

  console.log(
    `✓ 測試相依帳目相符（安裝 ${DRILL_TEST_DEPENDENCIES.length}、` +
      `明示不裝 ${DROPPED_TEST_DEPENDENCIES.length}）`,
  );
  return checkFreshness();
}

/**
 * 從 `apps/console` 走得到的每一份 manifest 的 devDependencies。
 *
 * ⚠️ 這裡的範圍必須等於**演練實際複製並跑測試的那一批**，不只是「跟
 * `runtimeDependencies` 一樣」。目前三者剛好重合（`runFull` 也已收斂到可達集合），
 * 但真正的不變式是前者：**帳目要涵蓋會被跑到的每一份 package.json**。
 *
 * 寫成「跟 runtimeDependencies 一致」的話，哪天有人放寬了複製範圍卻沒放寬帳目，
 * 同一類失敗就會回來 —— 而它上一次的樣子是 `Cannot find package 'eslint'`，
 * 因為複製的是全部套件、安裝的只有可達的那些。
 */
function reachableManifests(): readonly ManifestDevDependencies[] {
  const packages = listWorkspacePackages();
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const paths = ["apps/console/package.json"];

  for (const name of reachableWorkspacePackages(packages)) {
    const pkg = byName.get(name);
    if (pkg !== undefined) paths.push(`${pkg.dir.slice(ROOT.length + 1)}/package.json`);
  }

  const manifests: ManifestDevDependencies[] = [];
  for (const path of paths) {
    const full = join(ROOT, path);
    if (!existsSync(full)) continue;
    const parsed = JSON.parse(readFileSync(full, "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    manifests.push({ path, devDependencies: parsed.devDependencies ?? {} });
  }
  return manifests;
}

/**
 * 演練會讀到的路徑：**被量的**（應用、可達套件、tsconfig）＋ **量法**
 *（演練自己的原始碼、catalog 版本）。理由見 tree-fingerprint.ts 檔頭。
 *
 * 可達性由 `reachableWorkspacePackages` 推導，不是寫死的清單 ——
 * 與演練自己選套件用的是同一支函式，兩邊不會分岔。
 */
function coveredPaths(): readonly string[] {
  const all = listWorkspacePackages();
  const reachable = new Set(reachableWorkspacePackages(all));
  const dirs = all.filter((pkg) => reachable.has(pkg.name)).map((pkg) => relativeTo(ROOT, pkg.dir));

  return [
    ...new Set([
      "apps/console",
      "platform/tsconfig",
      "tools/exit-drill/src",
      "pnpm-workspace.yaml",
      ...dirs,
    ]),
  ];
}

/**
 * 算出今天的樹指紋。**清單走版控、內容走磁碟**（理由見 tree-fingerprint.ts）。
 *
 * ⚠️ 列舉失敗時回一個 0 個檔案的指紋，讓 `compareFingerprint` 判成 `empty`
 * 並紅掉 —— 而不是在這裡回一個「相符」。
 */
function currentFingerprint(): Fingerprint {
  const listed = spawnSync("git", ["ls-files", "-z", "--", ...coveredPaths()], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (listed.status !== 0) return fingerprintOf([]);

  const digests: FileDigest[] = [];
  for (const path of listed.stdout.split("\0")) {
    if (path === "") continue;
    const full = join(ROOT, path);
    // 版控裡有、磁碟上沒有：不算進去。檔案數會因此下降，於是判成 drift ——
    // 那正確：演練今天複製到的東西與證據那次不同。
    if (!existsSync(full)) continue;
    digests.push({ path, sha256: createHash("sha256").update(readFileSync(full)).digest("hex") });
  }

  return fingerprintOf(digests);
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

  // ⚠️ **這一行原本只問「幾天前」，而它是肯定句。** 併線讓樹變兩倍之後，
  // 它連續 10 天印「✓ 證據有效」——「幾天前」答不出「同一棵樹嗎」（C148 §七）。
  const verdict = compareFingerprint(evidence, currentFingerprint());

  if (verdict.kind === "empty") {
    console.error(`✗ ${verdict.message}`);
    return 1;
  }

  if (verdict.kind === "match") {
    console.log(`✓ 退出演練證據有效（${evidence.lastRun}，${ageDays} 天前）—— ${verdict.message}`);
  } else {
    // ⚠️ **drift 刻意不 fail，連 --require-fresh 都不 fail**（C149 §二）：
    // 實測最近 60 支 main commit 有 25 支動到涵蓋路徑（42%），擋它等於把每季
    // 一次的控制措施變成每次合併的阻斷器 —— 那種閘門會先被繞過、再被忽略。
    // `unrecorded` 是舊格式的過渡狀態，那一個在排程上要紅，否則它會一直躺著。
    const line = `退出演練證據 ${evidence.lastRun}（${ageDays} 天前）：${verdict.message}`;
    if (verdict.kind === "unrecorded" && process.argv.includes("--require-fresh")) {
      console.error(`✗ ${line}`);
      return 1;
    }
    console.warn(`⚠ ${line}`);
  }

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

/**
 * 讀 vitest 的 JSON 報表，把這次的失敗與 `EXPECTED_FAILURES` 對帳（C148 §五）。
 *
 * ⚠️ **讀不到報表一律當失敗**，與 `parseTestCounts` 撈不到摘要行的處置相同：
 * 一份「對帳過了」而其實沒有對到任何東西的證據，比沒有證據更糟 ——
 * 它看起來很正常。
 */
function reconcile(reportPath: string, workdir: string): { ok: boolean; expected: number } {
  if (!existsSync(reportPath)) {
    console.error(`\n✗ 找不到 vitest 的 JSON 報表（${reportPath}）—— 對帳沒有跑到。`);
    return { ok: false, expected: 0 };
  }

  let report: VitestJsonReport;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8")) as VitestJsonReport;
  } catch (error) {
    console.error(`\n✗ vitest 的 JSON 報表解析失敗：${String(error)}`);
    return { ok: false, expected: 0 };
  }

  const observed = collectFailures(report, workdir);
  const errors = reconcileFailures(observed);

  if (errors.length > 0) {
    console.error("\n✗ 預期失敗帳對不上\n");
    for (const error of errors) console.error(`  ✗ ${error}`);
    console.error(
      "\n  這張帳登記的是「演練把它要問的那個東西換掉了」的測試（C148 §三），\n" +
        "  住在 tools/exit-drill/src/expected-failures.ts。\n\n" +
        "  ⚠️ 新的失敗**不要**直接加進去 —— 先問它問的是應用還是腳手架。\n" +
        "     問應用的，那就是真的退出缺口，要修的是程式碼（AGENTS.md 規則二）。\n" +
        "  ⚠️ 「帳目過期」的意思是那一條已經不會失敗了：把該筆拿掉，不要留著。\n",
    );
    return { ok: false, expected: observed.length };
  }

  console.log(`    ✓ 預期失敗帳相符（${observed.length} 條如期失敗，全部有登記的替換對象）`);
  return { ok: true, expected: observed.length };
}

/**
 * 產生演練自己的 workspace 設定：建置、測試、`package.json`。
 *
 * 從 `runFull` 抽出來的理由是**尺寸**（`max-lines-per-function`），不是分層：
 * C147 剛裁過那個門檻只往下走，所以加東西的那一支要自己縮回去。
 */
function writeDrillWorkspace(
  workdir: string,
  aliases: readonly { find: string; replacement: string }[],
  packages: readonly WorkspacePackage[],
  catalog: Record<string, string>,
): void {
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

  // ⚠️ **plugin 兩份設定都要吃 —— C148 §二 的 B 類就是這一行漏掉的後果。**
  // 第一版只有上面那份建置設定拿了 `DRILL_PLUGINS`，測試這份沒有，於是
  // `platform/ui` 的三支 `.vue` 測試在演練裡是「0 test」，而 `#206` 把它
  // 解釋成「演練刻意不裝 plugin-vue」——**帳目是對的，只有一個消費端讀了它**。
  // 這正是 `plugins.ts` 檔頭寫著要防的那個失敗模式，發生在它自己身上。
  writeFileSync(
    join(workdir, "vitest.config.mjs"),
    `import { defineConfig } from "vitest/config";\n` +
      pluginImports +
      `\nexport default defineConfig({\n` +
      `  plugins: [${pluginCalls}],\n` +
      `  resolve: { alias: ${aliasLiteral} },\n` +
      `  test: { include: ["app/tests/**/*.test.ts", "packages/*/tests/**/*.test.ts"] },\n` +
      `});\n`,
  );

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
          // 測試專用的純 JS 相依。演練的最後一步是 `vitest run`，而
          // runtimeDependencies() 刻意只收 dependencies —— 那個判斷是對的
          //（devDependencies 裡裝的正是被替換掉的工具鏈），但它漏了「測試
          // 自己也有相依」這一類。帳目與理由在 dependencies.ts。
          ...Object.fromEntries(DRILL_TEST_DEPENDENCIES.map((name) => [name, dependency(name)])),
        },
      },
      null,
      2,
    )}\n`,
  );
}

function runFull(): number {
  const started = Date.now();
  // 先取指紋再動任何東西 —— 證據要說的是「這一棵樹被量過」（C149）。
  const fingerprint = currentFingerprint();
  const workdir = mkdtempSync(join(tmpdir(), "exit-drill-"));
  console.log(`退出演練工作目錄：${workdir}\n`);

  const filter = (source: string): boolean =>
    !source.includes("/node_modules") && !source.includes("/dist");

  // 1. 複製應用與各層原始碼（不含任何設定檔以外的 vite-plus 痕跡）
  cpSync(join(ROOT, "apps/console"), join(workdir, "app"), { recursive: true, filter });
  rmSync(join(workdir, "app/vite.config.ts"), { force: true });

  const allPackages = listWorkspacePackages();
  const aliases: { find: string; replacement: string }[] = [];

  /**
   * ⚠️ 只複製**從 `apps/console` 走得到的**套件，不是全部 platform／features。
   *
   * 第一版複製全部，於是有兩個集合不一致：跑測試的是全部，安裝相依的只有可達的。
   * 那個落差安靜了很久，直到 `platform/eslint-config` 有了第一支測試（v0.7.0 的
   * `a11y.test.ts`）—— 它 `import { ESLint } from "eslint"`，而演練不會裝 eslint。
   *
   * 而那一個**修不掉**：`@org/eslint-config` 的 `dependencies` 裡有
   * `typescript-eslint`（peer `typescript >=4.8.4 <6.1.0`）與自己釘死的
   * `typescript: 6.0.3`（C2）—— 它存在的理由就是 typescript-eslint 不肯跑在 TS 7 上。
   * 一個以「換上游工具鏈」為前提的演練，永遠裝不起那個 package 的相依。
   *
   * 所以它不是一個待補的洞，是**依建構就在退出保證之外**：
   * 可達性（從應用走得到）就是「屬於這個應用」的定義，而 lint 設定與 BFF mock
   * 都不是應用的一部分 —— 退出 vite-plus 之後，你的 eslint 設定不需要用上游
   * Vite 建得起來。它們的測試仍然由 `vp run -r test` 跑，只是不在這場演練裡。
   *
   * 判準因此不寫成清單，而是推導：**可達＝在保證內**。差集會被印出來（見下），
   * 這樣「哪些不在保證內」不會變成一個沒有人記得的預設值。
   */
  const reachable = new Set(reachableWorkspacePackages(allPackages));
  const packages = allPackages.filter((pkg) => reachable.has(pkg.name));
  const excluded = allPackages.filter((pkg) => !reachable.has(pkg.name)).map((pkg) => pkg.name);

  console.log(
    `演練範圍：${packages.length} 個可達套件` +
      (excluded.length === 0
        ? "（platform／features 全數在保證內）\n"
        : `；${excluded.length} 個不在退出保證內：${excluded.join("、")}\n`),
  );

  for (const pkg of packages) {
    const target = join(workdir, "packages", pkg.name.replace("@org/", ""));
    cpSync(pkg.dir, target, { recursive: true, filter });

    // ⚠️ 套件自己的 `vite.config.ts` 要拿掉，理由與上面那行對 `app/` 做的一樣：
    //   ① 它 `import { defineConfig } from "vite-plus"` —— 而這場演練的前提
    //      就是那個套件不存在，留著它 vitest 會炸在 ERR_MODULE_NOT_FOUND。
    //   ② 演練自己產生設定（見下一步），複製過來的那份本來就不會被用到。
    //
    // ⚠️ **這一行是 C120 之後才需要的**：切片從那時起各帶一支設定檔（覆蓋率
    // 門檻只收得進 package 自己的設定裡）。少了它，演練會在下一次排程壞掉，
    // 而那是三個月後 —— 與 `dependencies.ts` 檔頭記的 PR #15 完全同一個形狀。
    rmSync(join(target, "vite.config.ts"), { force: true });

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

  const catalog = catalogVersions();
  writeDrillWorkspace(workdir, aliases, packages, catalog);

  // 3. 用 npm 安裝 —— 在專案目錄之外，devEngines 不適用（C8）
  // 用 --loglevel=error 而不是 --silent：--silent 連**錯誤訊息也吞掉**，
  // 於是安裝失敗時只會看到「✗ npm install」與 0 秒，完全無從查起（實測過）。
  const installed = run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], workdir);
  const steps: [string, boolean][] = [["npm install", installed.ok]];
  let counts: { tests: number; testFiles: number } | null = null;
  let expectedFailures = 0;

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

    // JSON 報表是給對帳讀的（見 expected-failures.ts 為什麼不解析畫面輸出），
    // `default` 那份仍然留著 —— 少了它，演練壞掉時人要重跑一次才看得到發生什麼。
    const reportPath = join(workdir, "vitest-report.json");
    const tested = run(
      "npx",
      ["vitest", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${reportPath}`],
      workdir,
      true,
    );

    // ⚠️ `realpathSync`：macOS 的 `mkdtempSync` 給的是 /var/folders/…，
    // 而 vitest 報表裡的路徑是解析過的 /private/var/folders/… ——
    // 不解析的話每一筆都相對不出來，對帳會把全部失敗都當成「未登記」。
    // 失敗方向是安全的（紅），但訊息會變成一串沒人看得懂的絕對路徑。
    const reconciled = reconcile(reportPath, realpathSync(workdir));
    steps.push(["vitest run（對過預期失敗帳）", reconciled.ok]);
    expectedFailures = reconciled.expected;
    counts = parseTestCounts(tested.output);

    // 撈不到就當成失敗的一步，而不是安靜地寫下 tests: 0。
    // 一個「通過但測試數是 0」的證據比沒有證據更糟：它看起來很正常。
    if (reconciled.ok && counts === null) {
      console.error("\n✗ 對帳過了，卻撈不到測試數的摘要行 —— 可能是 reporter 格式變了。");
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
    expectedFailures,
    // ⚠️ 在**演練開始之前**算的（`fingerprint`），不是這一刻：這一刻工作目錄
    // 已經被建置與測試動過，而指紋要描述的是「被量的那棵樹」。
    treeHash: fingerprint.hash,
    treeFiles: fingerprint.files,
    note:
      "以上游 Vite/Vitest 重建 apps/console 與全部 platform、features 的測試，" +
      "設定檔由本演練重新產生，應用程式原始碼一字未改。" +
      "expectedFailures 是登記在 EXPECTED_FAILURES 裡、因為演練替換掉它們要問的" +
      "那個東西而必然失敗的條數（C148）—— 它們照跑，只是失敗被逐條對過帳。",
  };

  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  rmSync(workdir, { recursive: true, force: true });

  /**
   * 寫完立刻交給 formatter 收尾。
   *
   * `JSON.stringify(_, null, 2)` 的排版與 oxfmt 不一致，於是**每一次跑演練都會
   * 產出一個過不了 `vp check` 的檔案** —— 而下一行就印著「請一併提交」。
   *
   * 這件事在這裡特別荒謬：evidence.json 是**每季由 maintainer 手動開 PR**
   * 併回 main 的（CI 刻意不給 push main 的 token）。也就是說那個人每一季
   * 都會撞到一次「照工具說的做，然後 CI 紅」。
   *
   * ⚠️ 這是同一個教訓的**第三次**：`tools/slice-gen/src/files.ts` 寫過
   *（「那道 fmt 才是保證」），`tools/api-surface/src/cli.ts` 又寫過一次，
   * 而這裡漏了。讓 formatter 當唯一權威，不要手工去猜它的規則。
   */
  const formatted = spawnSync("vp", ["fmt", EVIDENCE_PATH], { cwd: ROOT, encoding: "utf8" });
  if (formatted.status !== 0) {
    console.error("✗ 證據已寫入，但格式化失敗 —— 直接 commit 會讓 `vp check` 變紅：");
    console.error(formatted.stderr || formatted.stdout || String(formatted.error));
    return 1;
  }

  console.log(
    `\n${passed ? "✓" : "✗"} 退出演練${passed ? "通過" : "失敗"}（${durationSeconds} 秒）`,
  );
  for (const [step, ok] of steps) console.log(`    ${ok ? "✓" : "✗"} ${step}`);
  console.log(`\n證據已寫入 tools/exit-drill/evidence.json —— 請一併提交。`);

  return passed ? 0 : 1;
}

process.exit(process.argv.includes("--full") ? runFull() : runStatic());
