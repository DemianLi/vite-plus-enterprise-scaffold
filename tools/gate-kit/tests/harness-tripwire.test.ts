import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { repoRoot } from "../src/testing.ts";
import { walk } from "../src/walk.ts";

/**
 * 絆線：`tools/*\/tests` 底下的測試不得繞過 `@org/gate-kit/testing` 自己建沙盒、
 * 自己 spawn CLI（C168 §四）。
 *
 * 收攏的那一天 22 支全遷了；這條在的理由是**第 23 支**。新工具的測試從舊的那幾支
 * 抄一份 `mkdtempSync` ＋ `afterEach` 是最省事的寫法，而它會讓「臨時目錄要不要
 * `git init`、要不要清」這種政策**又**多一個分岔 —— 那正是 harness 收掉的東西。
 *
 * ⚠️ 只掃 `tools/`。harness 是為閘門 CLI 長的，`platform/ui` 那些 `mount()` 不是
 * 這個形狀。⚠️ `spawnSync("git"` 放行：沙盒裡的 git 動作有 `sandbox.git()`，但
 * 「拿 git 自己的 stderr 當期待值」那一類要原始結果，harness 不該替它決定。
 */

const PATTERNS = ["mkdtempSync(", 'spawnSync("node"', 'execFileSync("node"'] as const;

/** 本檔（它自己就含著上面那三個字串，是掃描讀得到真檔的對照）。 */
const SELF = "tools/gate-kit/tests/harness-tripwire.test.ts";

function offenders(sources: Readonly<Record<string, string>>): string[] {
  return Object.entries(sources)
    .filter(([, source]) => PATTERNS.some((pattern) => source.includes(pattern)))
    .map(([path]) => path)
    .sort();
}

function toolsTestSources(): Record<string, string> {
  const root = repoRoot();
  const tools = join(root, "tools");
  const sources: Record<string, string> = {};
  for (const relative of walk(tools, {
    skip: ["node_modules", "fixtures"],
    extensions: [".test.ts"],
  })) {
    if (!relative.includes("/tests/")) continue;
    const path = join("tools", relative);
    sources[path] = readFileSync(join(root, path), "utf8");
  }
  return sources;
}

describe("對照組：掃描本身有反應", () => {
  it.each(PATTERNS)("inline fixture 含 %s → 被點名", (pattern) => {
    expect(offenders({ "x.test.ts": `const dir = ${pattern}...);` })).toEqual(["x.test.ts"]);
  });

  it('spawnSync("git" 放行', () => {
    expect(offenders({ "x.test.ts": 'spawnSync("git", ["ls-files"])' })).toEqual([]);
  });

  it("★ 真檔也讀得到：本檔含那三個字串，掃描必須點到它", () => {
    // 少了這條，「掃到零支」與「walk 指錯目錄、一支都沒讀」長得一樣。
    expect(offenders(toolsTestSources())).toContain(SELF);
  });
});

describe("tools/*/tests 不得自建沙盒、自 spawn CLI", () => {
  it("例外名單是空的 —— 加名字之前先讀 C168 §四", () => {
    const found = offenders(toolsTestSources()).filter((path) => path !== SELF);
    expect(found, "這幾支繞過了 @org/gate-kit/testing").toEqual([]);
  });
});

/**
 * 第二條絆線（C179 §四）：**有測試檔的 package，必須有東西在跑它。**
 *
 * `tools/release-distance/tests/distance.test.ts` 在樹上活了一整天（C171 → C178），
 * 十四條一次都沒執行過 —— 它沒有 `test` script、也沒有 `test` task，而 `vp run -r test`
 * 對這種 package 靜默跳過。上面那條絆線看過它（C171 §八 說「絆線是綠的」），
 * 但它問的是「用不用 harness」，不是「有沒有在跑」。
 *
 * ⚠️ 一份從來沒跑過的測試與一份全綠的測試，在樹上長得一模一樣。
 * ⚠️ 對象在外（別人的 `package.json`／`vite.config.ts`），C154 §三 的兩軸填在 C179 §四。
 */

/**
 * `test` 定義成 task 的形狀（`run.tasks.test`），與 `scripts.test` 二擇一。
 * ⚠️ 要求 `tasks:` 在前、`command:` 緊接 —— 光找 `test: {` 會撞到 vitest 自己的
 * `test: { include… }` 設定區塊，那不是接線。
 */
const TEST_TASK = /tasks:\s*\{[\s\S]*?\btest:\s*\{\s*command:/;

function wiredBy(pkgJson: string | undefined, viteConfig: string | undefined): string[] {
  const ways: string[] = [];
  if (pkgJson !== undefined && typeof JSON.parse(pkgJson).scripts?.test === "string") {
    ways.push("scripts.test");
  }
  if (viteConfig !== undefined && TEST_TASK.test(viteConfig)) ways.push("run.tasks.test");
  return ways;
}

function packagesWithTests(): string[] {
  const dirs = new Set<string>();
  for (const path of Object.keys(toolsTestSources()))
    dirs.add(path.split("/").slice(0, 2).join("/"));
  return [...dirs].sort();
}

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

describe("對照組：接線判定本身有反應", () => {
  it("scripts.test → 有接", () => {
    expect(wiredBy('{"scripts":{"test":"vp test"}}', undefined)).toEqual(["scripts.test"]);
  });

  it("run.tasks.test → 有接（單行、多行都算）", () => {
    const oneLine = "defineConfig({ run: { tasks: { test: { command: 'vp test' } } } })";
    expect(wiredBy("{}", oneLine)).toEqual(["run.tasks.test"]);
    expect(wiredBy("{}", "run: {\n  tasks: {\n    test: {\n      command: 'vp test'")).toEqual([
      "run.tasks.test",
    ]);
  });

  it("vitest 自己的 test 區塊不算接線", () => {
    expect(wiredBy("{}", "defineConfig({ test: { include: ['**/*.test.ts'] } })")).toEqual([]);
  });

  it("兩個都沒有 → 空", () => {
    expect(wiredBy('{"scripts":{"check":"vp check"}}', "export default {};")).toEqual([]);
  });

  it("★ 真樹上抓得到那一支只靠 task 接線的 package", () => {
    const root = repoRoot();
    const dir = join(root, "tools/release-distance");
    expect(packagesWithTests()).toContain("tools/release-distance");
    expect(
      wiredBy(readIfExists(join(dir, "package.json")), readIfExists(join(dir, "vite.config.ts"))),
    ).toEqual(["run.tasks.test"]);
  });
});

describe("tools/*/tests 有測試檔的 package，vp run -r test 必須跑得到它", () => {
  it("沒有接線的 package 名單是空的", () => {
    const root = repoRoot();
    const orphans = packagesWithTests().filter(
      (dir) =>
        wiredBy(
          readIfExists(join(root, dir, "package.json")),
          readIfExists(join(root, dir, "vite.config.ts")),
        ).length === 0,
    );
    expect(orphans, "這幾個 package 的 tests/ 沒有 test script 也沒有 test task").toEqual([]);
  });
});
