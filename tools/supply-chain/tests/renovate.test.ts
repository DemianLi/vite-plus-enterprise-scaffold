import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 升級提案設定與 catalog 的一致性（D16 迭代軸）。
 *
 * ── 這支測試防的是一種「設定看起來很對，而它什麼都沒匹配到」 ──────────
 *
 * Renovate 的 `matchPackageNames` 打錯一個字，不會有任何錯誤：那條規則
 * 只是靜靜地匹配不到任何東西。於是綁死的一組相依被拆成三個各自壞掉的 PR，
 * 而**設定檔看起來完全正常**。
 *
 * 這與 `--reporter=basic` 那次是同一個形狀：失敗的樣子和成功的樣子一模一樣。
 *
 * ── 為什麼特別針對驅動層那一組 ──────────────────────────────────────
 *
 * `pnpm-workspace.yaml` 的註解寫得很清楚：`vitest` 必須與 `vite-plus` 內部
 * 釘死的版本**完全一致**，否則 node_modules 會出現兩份 vitest，測試會以
 * 難以診斷的方式失敗。而 `vite` 是 npm alias 指向 `@voidzero-dev/vite-plus-core`。
 *
 * 三個一起升才是對的。分開升，每一個 PR 都是壞的，而且壞法各不相同。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

interface PackageRule {
  readonly groupName?: string;
  readonly matchPackageNames?: readonly string[];
  readonly matchDepNames?: readonly string[];
  readonly enabled?: boolean;
  readonly automerge?: boolean;
}

interface RenovateConfig {
  readonly extends?: readonly string[];
  readonly automerge?: boolean;
  readonly minimumReleaseAge?: string;
  readonly packageRules?: readonly PackageRule[];
}

const config = JSON.parse(readFileSync(join(ROOT, "renovate.json"), "utf8")) as RenovateConfig;
const workspace = readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8");

/** catalog: 區塊裡的相依名稱。只取那一段，避免掃到 overrides 與 allowBuilds。 */
function catalogEntries(): readonly string[] {
  const section = workspace.split(/^catalog:$/m)[1];
  if (section === undefined) throw new Error("pnpm-workspace.yaml 找不到 catalog: 區塊");

  const names: string[] = [];
  for (const line of section.split("\n")) {
    if (/^\S/.test(line) && line.trim() !== "") break; // 下一個頂層鍵，catalog 結束
    const match = /^\s{2}"?([^"\s:]+)"?:\s*\S/.exec(line);
    if (match?.[1] !== undefined) names.push(match[1]);
  }
  return names;
}

function ruleByGroup(groupName: string): PackageRule {
  const rule = config.packageRules?.find((candidate) => candidate.groupName === groupName);
  if (rule === undefined) throw new Error(`renovate.json 找不到分組：${groupName}`);
  return rule;
}

describe("catalog 解析", () => {
  it("撈得到 catalog 裡的相依", () => {
    const names = catalogEntries();
    expect(names.length).toBeGreaterThan(10);
    expect(names).toContain("vite-plus");
    expect(names).toContain("vitest");
  });

  it("★ 不會撈到 catalog 之外的鍵", () => {
    // overrides: 底下也有 vite，allowBuilds: 底下有 vue-demi。
    // 撈過頭的話，下面「每個 matchDepName 都要在 catalog 裡」那條會失去意義。
    expect(catalogEntries()).not.toContain("vue-demi");
  });
});

describe("驅動層那一組（D2）", () => {
  const rule = ruleByGroup("vite-plus 驅動層（D2）");

  it("vite-plus、vite、vitest 三個都在同一組", () => {
    for (const name of ["vite-plus", "vite", "vitest"]) {
      expect(rule.matchPackageNames, `${name} 不在驅動層分組裡`).toContain(name);
    }
  });

  it("npm alias 的真實套件名也要列，否則解析後就匹配不到", () => {
    // catalog 寫的是 vite: npm:@voidzero-dev/vite-plus-core@0.2.9。
    // Renovate 比對的是解析後的 packageName。
    expect(rule.matchPackageNames).toContain("@voidzero-dev/vite-plus-core");
    expect(workspace).toContain("npm:@voidzero-dev/vite-plus-core@");
  });

  it("★ 分組裡的每個 depName 都真的存在於 catalog —— 打錯字會靜靜地匹配不到", () => {
    const names = catalogEntries();
    for (const dep of rule.matchDepNames ?? []) {
      expect(names, `renovate.json 的 ${dep} 不在 catalog 裡`).toContain(dep);
    }
  });

  it("vitest 在 catalog 裡是精確版本，不是範圍", () => {
    // 這是分組成立的前提：它必須與 vite-plus 內部鎖的版本完全一致。
    // 一旦有人改成 ^4.1.10，分組就變成裝飾品。
    expect(workspace).toMatch(/^ {2}vitest: \d+\.\d+\.\d+$/m);
  });
});

describe("不自動合併", () => {
  it("頂層 automerge 是 false", () => {
    expect(config.automerge).toBe(false);
  });

  it("★ 沒有任何 packageRule 偷偷打開 automerge", () => {
    // 頂層寫 false、某一組寫 true，是最容易溜過 code review 的寫法。
    for (const rule of config.packageRules ?? []) {
      expect(rule.automerge, `${rule.groupName ?? "（無名分組）"} 打開了 automerge`).not.toBe(true);
    }
  });

  it("新版本要等幾天才提案 —— 防的是發佈當下就被掉包的那種", () => {
    expect(config.minimumReleaseAge).toBeTruthy();
  });
});
