import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { repoRoot } from "@org/gate-kit/testing";

import { plan } from "../src/export.ts";
import {
  catalogReferences,
  GITIGNORE,
  rewriteManifest,
  rewriteNpmrc,
  rewriteRootManifest,
  rewriteWorkspaceYaml,
  TEST_FILE,
  testOnlyDependencies,
} from "../src/rewrite.ts";
import { scan, traceRules } from "../src/scan.ts";
import type { Manifest } from "../src/workspace.ts";

const ROOT = repoRoot();
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

describe("測試檔不出門（C231 §四.3）", () => {
  it.each([
    "platform/ui/tests/a.ts",
    "x/fixtures/y.json",
    "src/a.test.ts",
    "src/a.spec.tsx",
    "features/x/specs/a.feature",
  ])("%s 是測試", (path) => expect(TEST_FILE.test(path)).toBe(true));
  it.each(["src/contest.ts", "src/latest.tsx", "src/testing-utils.ts", "README.md"])(
    "%s 不是",
    (path) => {
      expect(TEST_FILE.test(path)).toBe(false);
    },
  );
});

describe("只有測試用到的 devDependencies", () => {
  const manifest: Manifest = {
    name: "@org/x",
    devDependencies: {
      vitest: "catalog:",
      typescript: "catalog:",
      "@vitejs/plugin-react": "catalog:",
      "happy-dom": "catalog:",
    },
  };

  it("測試 import、非測試檔沒碰的拿掉；兩邊都沒碰的（型別檢查用）留下", () => {
    const exported = 'import react from "@vitejs/plugin-react";';
    const tests = 'import { it } from "vitest";';
    expect(testOnlyDependencies(manifest, exported, tests)).toEqual(["vitest", "happy-dom"]);
  });

  it("★ 非測試檔引用了它就留下 —— 就算它在 CONFIG_REFERENCED_TEST_TOOLS 裡", () => {
    const exported = 'import { Window } from "happy-dom";';
    expect(testOnlyDependencies(manifest, exported, "")).not.toContain("happy-dom");
  });

  it("子路徑也算引用", () => {
    expect(
      testOnlyDependencies(
        { name: "x", devDependencies: { vitest: "" } },
        "",
        'from "vitest/config"',
      ),
    ).toEqual(["vitest"]);
  });

  // ⚠️ 讀真樹的斷言只挑 `platform/`：這支工具下發，它的測試在 fork 裡照跑，而 fork 可以
  // 刪掉示範切片；`platform/` 是腳手架那一半，fork 裡改不動（C220）。
  it("★ 真樹：platform/ui 拿掉 vitest，留下 tailwindcss 與 typescript —— tailwindcss 由 styles.css 引用", () => {
    const dropped = plan(ROOT).dropped.get("platform/ui") ?? [];
    expect(dropped).toContain("vitest");
    expect(dropped).not.toContain("tailwindcss");
    expect(dropped).not.toContain("typescript");
  });

  it("rewriteManifest 拿掉 test script 與那幾筆，空掉的欄位整個不留", () => {
    const rewritten = rewriteManifest(
      { name: "x", scripts: { test: "vp test" }, devDependencies: { vitest: "" } },
      ["vitest"],
    );
    expect(rewritten).toEqual({ name: "x" });
  });
});

describe("根層的檔另寫，不複製（C231 §四.4）", () => {
  it("package.json 只留 build／dev 與三筆 devDep；不帶 license 與腳手架的版號", () => {
    const rewritten = rewriteRootManifest(JSON.parse(read("package.json")) as Manifest);
    expect(Object.keys(rewritten.scripts ?? {})).toEqual(["build", "dev"]);
    expect(Object.keys(rewritten.devDependencies ?? {})).toEqual([
      "typescript",
      "vite",
      "vite-plus",
    ]);
    expect(rewritten).not.toHaveProperty("license");
    expect(rewritten).not.toHaveProperty("version");
  });

  it("根層 package.json 少了 build 就失敗，不交一份建不起來的", () => {
    expect(() => rewriteRootManifest({ name: "x", scripts: { dev: "vp dev" } })).toThrow(/build/);
  });

  it("pnpm-workspace.yaml：拿掉 tools/*、註解與沒人引用的 catalog 條目；overrides 一筆不動", () => {
    const yaml = read("pnpm-workspace.yaml");
    const rewritten = rewriteWorkspaceYaml(yaml, {
      globs: new Set(["apps/*", "features/*", "platform/*"]),
      catalog: new Set(["react", "vite"]),
    });
    expect(rewritten).not.toContain("#");
    expect(rewritten).not.toContain("tools/*");
    expect(rewritten).not.toContain("stryker");
    expect(rewritten).toMatch(/^ {2}react: /m);
    // lockfile 記著 overrides，少一筆 `--frozen-lockfile` 就裝不起來 —— 逐行比，不挑今天有的那幾筆。
    // ⚠️ 照段落切，不照空行切：原檔的 overrides 條目之間隔著註解與空行，第一版照空行切只比到了
    // 第一筆，把 overrides 整段剪掉的變異照樣綠（C248 §五 M7）。
    const overrides: string[] = [];
    let section = "";
    for (const line of yaml.split("\n")) {
      if (/^[^\s#]/.test(line)) section = line.split(":")[0] ?? "";
      else if (section === "overrides" && /^\s+[^\s#]/.test(line)) {
        overrides.push(line.replace(/\s+#.*$/, "").trimEnd());
      }
    }
    expect(overrides.length).toBeGreaterThan(1);
    for (const line of overrides) expect(rewritten).toContain(line);
  });

  it("行內註解照拿，引號裡的 # 不算", () => {
    const yaml = ["catalog:", '  a: "x#y" # 註解', "  b: 1"].join("\n");
    expect(rewriteWorkspaceYaml(yaml, { globs: new Set(), catalog: new Set(["a"]) })).toBe(
      'catalog:\n  a: "x#y"\n',
    );
  });

  it("catalog 要留的名字包含 overrides 裡寫成 catalog: 的那幾個", () => {
    expect([
      ...catalogReferences(
        [{ name: "x", dependencies: { react: "catalog:", "@org/y": "workspace:*" } }],
        'overrides:\n  vite: "catalog:"\n',
      ),
    ]).toEqual(["react", "vite"]);
  });

  it(".npmrc 只留設定行，被註解掉的 registry 換一行中性的說明（Q110）", () => {
    const rewritten = rewriteNpmrc(read(".npmrc"));
    expect(rewritten).toContain("node-linker=isolated");
    expect(rewritten).toContain("hoist=false");
    expect(rewritten).toContain("prefer-frozen-lockfile=true");
    expect(rewritten).toMatch(/^# registry=/m);
    expect(rewritten.split("\n").filter((line) => line.startsWith("#"))).toHaveLength(2);
  });

  it("★ 產生出來的根層檔案，拿同一張詞表掃是零命中 —— 那幾支是本工具自己寫的", () => {
    const planned = plan(ROOT);
    const files = Object.entries({ ...planned.rootFiles, ".gitignore": GITIGNORE }).map(
      ([path, content]) => ({ path, content }),
    );
    expect(scan(files, traceRules(planned)).byFile).toEqual([]);
  });
});
