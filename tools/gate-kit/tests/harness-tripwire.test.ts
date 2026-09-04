import { readFileSync } from "node:fs";
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
