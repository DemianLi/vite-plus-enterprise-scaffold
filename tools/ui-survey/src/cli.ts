#!/usr/bin/env node
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 授權判定的單一事實來源在 tools/supply-chain —— 它同時被閘門用來看**實際安裝的**
// 相依（D16 / C45）。這裡不再自己留一份，兩份清單一定會漂。
import { licenseNeedsReview } from "@org/supply-chain/health";

import { CANDIDATES, SCA_BASELINE, SCA_SCENARIOS } from "./candidates.ts";
import { assessCsp, VERDICT_LABEL, type CspProbe } from "./csp.ts";

/**
 * UI／樣式選型的市調工具（HANDOFF #14 → D15）。
 *
 * ── 為什麼這是一支工具而不是一份文件 ────────────────────────────────
 *
 * 選型的理由半年後會被問第二次（「為什麼不用 PrimeVue？」），而那時候
 * 一份靜態文件只能被相信，不能被重驗。這支工具讓每個數字都能重新推導 ——
 * 與 `vpr sca-dossier`／`vpr mirror-manifest` 同一個原則：
 * **給外部團隊看的數字一律由機器算。**
 *
 * 而且這些數字**會過期**：授權會變（PrimeVue 就在 2026-06-28 變了）、
 * 專案會停止維護、供應鏈成本會隨版本改變。重新評估時重跑，不要重讀。
 *
 * ── 兩個子命令 ──────────────────────────────────────────────────────
 *
 *   --csp       下載 tarball，找執行期 <style> 注入（本 repo 的決勝軸）
 *   --sca       lockfile-only 解析，算出各方案的供應鏈增量
 *
 * ⚠️ **全部需要公網**，而且刻意**不進 gate**：這是決策期的工具，不是閘門。
 * 把它排進 CI 只會讓 CI 在 registry 抖動時變紅，而它守不住任何東西。
 */

const NPM_REGISTRY = "https://registry.npmjs.org";

function fetchJson(url: string): unknown {
  const result = spawnSync("curl", ["-sSL", "--fail", url], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (result.status !== 0) throw new Error(`取不到 ${url}：${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function registryUrl(name: string): string {
  return `${NPM_REGISTRY}/${name.replace("/", "%2F")}`;
}

function collect(dir: string, test: (path: string) => boolean, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, test, found);
    else if (test(full)) found.push(full);
  }
  return found;
}

const SCRIPT_EXTENSIONS = [".js", ".mjs", ".cjs"];
const STYLE_INJECTION = /createElement\(['"]style['"]\)/;

function probePackage(name: string, tarball: string): CspProbe {
  const work = mkdtempSync(join(tmpdir(), "ui-survey-"));
  try {
    const archive = join(work, "pkg.tgz");
    if (spawnSync("curl", ["-sSL", "--fail", tarball, "-o", archive]).status !== 0) {
      throw new Error(`下載失敗：${tarball}`);
    }
    if (spawnSync("tar", ["xzf", archive, "-C", work]).status !== 0) {
      throw new Error("解壓失敗");
    }

    const root = join(work, "package");
    const relative = (path: string): string => path.slice(root.length + 1);

    const css = collect(root, (p) => p.endsWith(".css"));
    const scripts = collect(root, (p) => SCRIPT_EXTENSIONS.some((ext) => p.endsWith(ext)));

    const injectionSites: string[] = [];
    let nonceMentions = 0;
    for (const script of scripts) {
      // 大檔案（min bundle）也要讀，但別把整個 tarball 讀進記憶體兩次。
      if (statSync(script).size > 32 << 20) continue;
      const source = readFileSync(script, "utf8");
      if (STYLE_INJECTION.test(source)) injectionSites.push(relative(script));
      if (source.includes("nonce")) nonceMentions += 1;
    }

    return { name, staticCssFiles: css.length, injectionSites, nonceMentions };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function runCsp(): number {
  console.log("\n── CSP 相容性（本 repo 是 style-src 'self'，無 nonce）──\n");

  for (const candidate of CANDIDATES) {
    if (candidate.eliminated !== undefined) continue;

    let probe: CspProbe;
    try {
      const doc = fetchJson(registryUrl(candidate.name)) as {
        "dist-tags": Record<string, string>;
        versions: Record<string, { dist: { tarball: string } }>;
      };
      const version = candidate.version ?? doc["dist-tags"]["latest"];
      if (version === undefined) throw new Error("找不到 latest");
      const tarball = doc.versions[version]?.dist.tarball;
      if (tarball === undefined) throw new Error(`找不到 ${version} 的 tarball`);
      probe = probePackage(`${candidate.name}@${version}`, tarball);
    } catch (error) {
      console.log(`  ${candidate.name.padEnd(18)} 探測失敗：${(error as Error).message}`);
      continue;
    }

    const assessment = assessCsp(probe);
    console.log(`  ${probe.name.padEnd(24)} ${VERDICT_LABEL[assessment.verdict]}`);
    console.log(
      `      靜態 CSS ${probe.staticCssFiles} 檔｜注入 ${probe.injectionSites.length} 處｜` +
        `提及 nonce 的檔案 ${probe.nonceMentions}`,
    );
    console.log(`      ${assessment.reason}`);
  }

  console.log(
    "\n  ⚠️ 這個探測掃的是**已發佈的 dist**，證明「有這個能力」，不證明「執行期會發生」。\n" +
      "  tree-shaking 可能移除它，沒 import 的元件不會執行。\n" +
      "  **選定之後必須開瀏覽器套上 @org/security-headers 的真實政策再驗一次。**\n",
  );
  return 0;
}

// ── --sca ─────────────────────────────────────────────────────────────

interface LockEntry {
  readonly version?: string;
  readonly license?: string;
  readonly cpu?: unknown;
  readonly os?: unknown;
  readonly libc?: unknown;
}

/** 只解析、不下載。要的是完整遞移樹，而不是 registry 的 dependencies 欄位。 */
function resolveTree(specs: readonly string[]): Map<string, LockEntry> {
  const work = mkdtempSync(join(tmpdir(), "ui-sca-"));
  try {
    writeFileSync(
      join(work, "package.json"),
      `${JSON.stringify({ name: "m", private: true, version: "0.0.0" })}\n`,
    );
    const install = spawnSync(
      "npm",
      ["install", "--package-lock-only", "--no-audit", "--no-fund", "--legacy-peer-deps", ...specs],
      { cwd: work, encoding: "utf8" },
    );
    if (install.status !== 0) throw new Error(`解析失敗：${install.stderr.slice(0, 400)}`);

    const lock = JSON.parse(readFileSync(join(work, "package-lock.json"), "utf8")) as {
      packages?: Record<string, LockEntry>;
    };

    const tree = new Map<string, LockEntry>();
    for (const [path, entry] of Object.entries(lock.packages ?? {})) {
      if (!path.startsWith("node_modules/")) continue;
      const name = path.replace(/^.*node_modules\//, "");
      tree.set(`${name}@${entry.version ?? "?"}`, entry);
    }
    return tree;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** 與 tools/supply-chain 的 isNative 同判準：宣告 cpu／os／libc 任一者即為平台原生。 */
function isNative(entry: LockEntry): boolean {
  return entry.cpu !== undefined || entry.os !== undefined || entry.libc !== undefined;
}

function runSca(): number {
  console.log("\n── 供應鏈增量（基線含 vite-plus）──\n");
  console.log(`  基線：${SCA_BASELINE.join("  ")}`);

  const baseline = resolveTree(SCA_BASELINE);
  console.log(`  基線樹 ${baseline.size} 個套件\n`);

  for (const scenario of SCA_SCENARIOS) {
    let tree;
    try {
      tree = resolveTree([...SCA_BASELINE, ...scenario.add]);
    } catch (error) {
      console.log(`  ${scenario.label.padEnd(28)} 解析失敗：${(error as Error).message}`);
      continue;
    }

    const added = [...tree].filter(([id]) => !baseline.has(id));
    const native = added.filter(([, entry]) => isNative(entry));

    const licenses = new Map<string, number>();
    for (const [, entry] of added) {
      const license = entry.license ?? "（無宣告）";
      licenses.set(license, (licenses.get(license) ?? 0) + 1);
    }
    const flagged = [...licenses].filter(([license]) => licenseNeedsReview(license));

    console.log(
      `  ${scenario.label.padEnd(28)} +${String(added.length).padStart(3)} 套件` +
        `  +${String(native.length).padStart(2)} 原生` +
        `  授權旗標：${flagged.length > 0 ? flagged.map(([l, n]) => `${l}×${n}`).join("、") : "無"}`,
    );
  }

  console.log(
    "\n  ⚠️ 基線**必須含 vite-plus**。少了它，npm 為了滿足 @tailwindcss/vite 的 peer\n" +
      "  會把上游 vite 一起裝進來，@rolldown/binding 的 14 個原生二進位被算成「新增」——\n" +
      "  而那些本 repo 早就有。第一版就是這樣多算成 +96／49 原生（正確是 +61／23）。\n",
  );
  return 0;
}

// ──────────────────────────────────────────────────────────────────────

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--csp")) return runCsp();
  if (args.includes("--sca")) return runSca();

  console.log(
    "用法（全部需要公網，刻意不進 gate）：\n" +
      "  node tools/ui-survey/src/cli.ts --csp        執行期 <style> 注入探測\n" +
      "  node tools/ui-survey/src/cli.ts --sca        供應鏈增量\n\n" +
      "調查結論見 UI-SURVEY.md，決策見 DECISIONS.md 的 D15。\n" +
      "這些數字會過期（授權會變、專案會停更）—— 重新評估時重跑，不要重讀。\n",
  );
  return 0;
}

process.exit(main());
