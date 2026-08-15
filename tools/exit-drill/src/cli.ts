#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function run(command: string, args: readonly string[], cwd: string): boolean {
  const result = spawnSync(command, [...args], { cwd, stdio: "inherit" });
  return result.status === 0;
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
      if (!/\.(ts|js|mjs)$/.test(relative)) continue;
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

  writeFileSync(
    join(workdir, "vite.config.mjs"),
    `import { defineConfig } from "vite";\n` +
      `import vue from "@vitejs/plugin-vue";\n\n` +
      `// 這份設定是退出演練自動產生的：上游 Vite、上游 plugin-vue，零 vite-plus。\n` +
      `export default defineConfig({\n` +
      `  root: "app",\n` +
      `  plugins: [vue()],\n` +
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
        dependencies: {
          vue: UPSTREAM.vue,
          "vue-router": dependency("vue-router"),
          pinia: dependency("pinia"),
          "vue-i18n": dependency("vue-i18n"),
          "@tanstack/vue-query": dependency("@tanstack/vue-query"),
        },
        devDependencies: {
          // ⚠️ 這裡是**上游的 vite**，不是 catalog 裡被 alias 成
          // @voidzero-dev/vite-plus-core 的那個。整場演練的重點就在這一行。
          vite: UPSTREAM.vite,
          "@vitejs/plugin-vue": UPSTREAM["@vitejs/plugin-vue"],
          vitest: UPSTREAM.vitest,
        },
      },
      null,
      2,
    )}\n`,
  );

  // 3. 用 npm 安裝 —— 在專案目錄之外，devEngines 不適用（C8）
  const installed = run("npm", ["install", "--no-audit", "--no-fund", "--silent"], workdir);
  const steps: [string, boolean][] = [["npm install", installed]];

  if (installed) {
    // @org/tsconfig 必須跟著過去，否則所有 `extends: "@org/tsconfig/*.json"` 解析失敗。
    //
    // 這**不會**弱化本演練的論證：那個 package 是四份純 JSON，唯一與工具鏈沾邊的是
    // `types: ["vite/client"]`，而上游 vite 同樣提供該型別。第一次跑演練時它就是
    // 第一個絆倒的東西 —— 而那正是演練的用途：把「理論上可以退出」變成實際的步驟清單。
    cpSync(join(ROOT, "platform/tsconfig"), join(workdir, "node_modules/@org/tsconfig"), {
      recursive: true,
      filter,
    });

    steps.push(["vite build", run("npx", ["vite", "build"], workdir)]);
    steps.push(["vitest run", run("npx", ["vitest", "run"], workdir)]);
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
