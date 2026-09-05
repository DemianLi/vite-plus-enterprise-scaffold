import { describe, expect, it } from "vitest";

import { DRILL_TEST_DEPENDENCIES } from "../src/dependencies.ts";
import {
  drillWorkspaceFiles,
  UPSTREAM,
  type DrillAlias,
  type DrillWorkspaceFile,
} from "../src/drill-workspace.ts";
import { DRILL_PLUGINS } from "../src/plugins.ts";

/**
 * 演練重產的三份設定（`src/drill-workspace.ts`）。
 *
 * 每一條都指得到一次真的發生過的失敗，理由寫在原始碼旁邊的註解裡；這裡不做快照 ——
 * 快照在每次 plugin 帳目變動時都會過期，然後被無腦重生，等於什麼都沒守。
 *
 * C185 之前這三份字串住在 `runFull` 裡，沒有測試碰得到（§六：三顆變異零紅）。
 */

const CATALOG = { "vite-plus": "0.2.9", vite: "0.2.9", vue: "3.5.41", "happy-dom": "20.0.0" };

const ALIASES: readonly DrillAlias[] = [
  { find: "@org/slice-kit", replacement: "/w/packages/slice-kit/src/index.ts" },
  { find: "@org/slice-kit/contract", replacement: "/w/packages/slice-kit/src/contract.ts" },
  { find: "@org/ui/styles.css", replacement: "/w/packages/ui/src/styles.css" },
];

function generate(aliases: readonly DrillAlias[] = ALIASES): Record<DrillWorkspaceFile, string> {
  return drillWorkspaceFiles({ aliases, dependencies: { vue: "^3.5.41" }, catalog: CATALOG });
}

/** 設定檔裡那段 `resolve: { alias: [...] }` 是 JSON 字面值，直接解析回來比對順序。 */
function aliasesIn(source: string): readonly DrillAlias[] {
  const match = /resolve: \{ alias: (\[[\s\S]*?\n]) \}/.exec(source);
  if (match?.[1] === undefined) throw new Error(`找不到 alias 區塊：\n${source}`);
  return JSON.parse(match[1]) as DrillAlias[];
}

describe("drillWorkspaceFiles", () => {
  it.each(["vite.config.mjs", "vitest.config.mjs"] as const)(
    "★ %s 含每一個 DRILL_PLUGINS 的 import 與呼叫（C148 §二 B 類：只有一份設定拿了帳目）",
    (file) => {
      const source = generate()[file];
      expect(DRILL_PLUGINS.length).toBeGreaterThan(0);
      for (const plugin of DRILL_PLUGINS) {
        expect(source).toContain(plugin.importLine);
        expect(source).toContain(`${plugin.name}()`);
      }
    },
  );

  it("兩份設定拿到同一組 plugin，不是各自維護", () => {
    const files = generate();
    const calls = (source: string): string | undefined => /plugins: \[(.*)\]/.exec(source)?.[1];
    expect(calls(files["vite.config.mjs"])).toBeDefined();
    expect(calls(files["vite.config.mjs"])).toBe(calls(files["vitest.config.mjs"]));
  });

  it.each(["vite.config.mjs", "vitest.config.mjs"] as const)(
    "★ %s 的 alias 長的排前面 —— @org/slice-kit 先命中會把 /contract 解析成 index.ts/contract",
    (file) => {
      const finds = aliasesIn(generate()[file]).map((alias) => alias.find);
      expect(finds.indexOf("@org/slice-kit/contract")).toBeLessThan(
        finds.indexOf("@org/slice-kit"),
      );
      for (let i = 1; i < finds.length; i += 1) {
        expect(finds[i - 1]!.length).toBeGreaterThanOrEqual(finds[i]!.length);
      }
    },
  );

  it("alias 一個都不掉，副檔名不過濾（@org/ui 的 ./styles.css 曾被靜靜丟掉）", () => {
    const finds = aliasesIn(generate()["vite.config.mjs"]).map((alias) => alias.find);
    expect([...finds].sort()).toEqual(ALIASES.map((alias) => alias.find).sort());
  });

  it("傳進來的 alias 陣列不被就地改動", () => {
    const input = [...ALIASES];
    generate(input);
    expect(input).toEqual(ALIASES);
  });

  describe("package.json", () => {
    const manifest = JSON.parse(generate()["package.json"]) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    it("★ vite 與 vitest 是上游版本，不是 catalog 裡被 alias 成 vite-plus-core 的那個", () => {
      expect(manifest.devDependencies.vite).toBe(UPSTREAM.vite);
      expect(manifest.devDependencies.vitest).toBe(UPSTREAM.vitest);
      expect(manifest.devDependencies.vite).not.toBe(CATALOG.vite);
    });

    it("每一個 DRILL_PLUGINS 的套件都會被裝", () => {
      for (const plugin of DRILL_PLUGINS) {
        expect(manifest.devDependencies).toHaveProperty(plugin.module);
      }
    });

    it("每一個 DRILL_TEST_DEPENDENCIES 都會被裝，catalog 有版本就用它", () => {
      expect(DRILL_TEST_DEPENDENCIES.length).toBeGreaterThan(0);
      for (const name of DRILL_TEST_DEPENDENCIES) {
        expect(manifest.devDependencies).toHaveProperty(name);
      }
      expect(manifest.devDependencies["happy-dom"]).toBe(CATALOG["happy-dom"]);
    });

    it("dependencies 原樣帶過去 —— 推導在 cli.ts 的 runtimeDependencies", () => {
      expect(manifest.dependencies).toEqual({ vue: "^3.5.41" });
    });
  });
});
