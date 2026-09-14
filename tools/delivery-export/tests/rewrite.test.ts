import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { repoRoot, sandbox } from "@org/gate-kit/testing";

import {
  devDependenciesToRemove,
  plan,
  unexportedWorkspaceDevDependencies,
  unreferencedModules,
  unusedSubpaths,
  write,
} from "../src/export.ts";
import {
  buildsItself,
  catalogReferences,
  GITIGNORE,
  importsRelatively,
  rewriteManifest,
  rewriteNpmrc,
  rewriteRootManifest,
  rewriteTsconfigInclude,
  rewriteWorkspaceYaml,
  TEST_FILE,
  testOnlyDependencies,
  VITE_CONFIG,
  withoutTestSourceExclusions,
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
    "apps/console/vitest.config.ts",
  ])("%s 是測試", (path) => expect(TEST_FILE.test(path)).toBe(true));
  it.each([
    "src/contest.ts",
    "src/latest.tsx",
    "src/testing-utils.ts",
    "README.md",
    "apps/console/vite.config.ts",
    "src/myvitest.config.ts",
  ])("%s 不是", (path) => {
    expect(TEST_FILE.test(path)).toBe(false);
  });
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

describe("出門的 package 裡、不是測試卻不出門的檔（C250）", () => {
  it("自己不建置的成員，vite.config 只剩測試在讀", () => {
    expect(buildsItself({ name: "x", scripts: { check: "vp check" } })).toBe(false);
    expect(buildsItself({ name: "x", scripts: { dev: "vp dev" } })).toBe(true);
    expect(VITE_CONFIG.test("vite.config.ts")).toBe(true);
    expect(VITE_CONFIG.test("src/vite.config.helper.ts")).toBe(false);
  });

  // ⚠️ 讀真樹的斷言只問 fork 裡也成立的性質：切片會被增刪，而這兩條對任何一棵樹都該成立。
  it("★ 真樹：出門的檔裡沒有「自己不建置的成員」的 vite.config", () => {
    const planned = plan(ROOT);
    for (const member of planned.exported) {
      if (buildsItself(member.manifest)) continue;
      expect(planned.files).not.toContain(`${member.dir}/vite.config.ts`);
    }
  });

  it("★ 真樹：出門的 manifest 裡，exports 的每一條都指向一支出門的檔", () => {
    const planned = plan(ROOT);
    for (const [dir, manifest] of planned.manifests) {
      const map = (manifest["exports"] ?? {}) as Record<string, string>;
      for (const target of Object.values(map)) {
        expect(planned.files).toContain(`${dir}/${target.replace(/^\.\//, "")}`);
      }
    }
  });

  const kit = {
    dir: "platform/kit",
    manifest: { name: "@org/kit", exports: { ".": "./src/index.ts", "./rules": "./src/rules.ts" } },
  };
  const tree = (files: Record<string, string>) => ({
    shipped: Object.keys(files),
    read: (file: string) => files[file] ?? "",
  });

  it("★ 沒有出門的碼引用的子路徑不出門；「.」永遠出門", () => {
    const { shipped, read } = tree({
      "platform/kit/src/index.ts": 'export { x } from "./name.ts";',
      "platform/kit/src/rules.ts": "export const RULES = [];",
      "apps/a/src/main.ts": 'import { x } from "@org/kit";',
    });
    expect(unusedSubpaths(kit, shipped, read)).toEqual([["./rules", "platform/kit/src/rules.ts"]]);
  });

  it("以包名／子路徑引用、或同一個 package 裡以相對路徑 import，都算用到", () => {
    const byName = tree({
      "platform/kit/src/rules.ts": "",
      "apps/a/src/main.ts": 'import { RULES } from "@org/kit/rules";',
    });
    expect(unusedSubpaths(kit, byName.shipped, byName.read)).toEqual([]);
    const relative = tree({
      "platform/kit/src/rules.ts": "",
      "platform/kit/src/index.ts": 'export { RULES } from "./rules.ts";',
    });
    expect(unusedSubpaths(kit, relative.shipped, relative.read)).toEqual([]);
  });

  it("★ 設定檔的 extends 也算引用 —— 第一版只看程式碼檔，把 @org/tsconfig 整包判成沒人用", () => {
    const tsconfig = {
      dir: "platform/tsconfig",
      manifest: { name: "@org/tsconfig", exports: { "./lib.json": "./lib.json" } },
    };
    const { shipped, read } = tree({
      "platform/tsconfig/lib.json": "{}",
      "features/a/tsconfig.json": '{ "extends": "@org/tsconfig/lib.json" }',
    });
    expect(unusedSubpaths(tsconfig, shipped, read)).toEqual([]);
  });

  it("★ 沒出門的 workspace package 從 devDependencies 拿掉，出門的與外部套件照留", () => {
    const x = {
      dir: "apps/x",
      manifest: {
        name: "@org/x",
        devDependencies: { "@org/mock": "workspace:*", "@org/cfg": "workspace:*", vite: "" },
      },
    };
    const cfg = { dir: "platform/cfg", manifest: { name: "@org/cfg" } };
    const mock = { dir: "platform/mock", manifest: { name: "@org/mock" } };
    expect(unexportedWorkspaceDevDependencies(x, [x, cfg, mock], [x, cfg])).toEqual(["@org/mock"]);
    // ⚠️ 單驗上面那支不夠：plan() 把它與測試相依合併的那一行，第一版沒有測試走過（C250 §五 M15）。
    expect(devDependenciesToRemove(x, [x, cfg, mock], [x, cfg], ["vite"])).toEqual([
      "vite",
      "@org/mock",
    ]);
  });

  it("相對 import 比對檔名，不比對包含它的字", () => {
    expect(importsRelatively('from "./rules.ts"', "platform/kit/src/rules.ts")).toBe(true);
    expect(importsRelatively("from '../src/rules'", "platform/kit/src/rules.ts")).toBe(true);
    expect(importsRelatively('from "./my-rules.ts"', "platform/kit/src/rules.ts")).toBe(false);
  });

  it("rewriteManifest 拿掉不出門的子路徑，其餘照留", () => {
    expect(rewriteManifest(kit.manifest, [], ["./rules"])).toMatchObject({
      exports: { ".": "./src/index.ts" },
    });
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

describe("出門的檔：內容改寫、沒人引用的模組不出門（C251）", () => {
  const exists = (path: string, files: readonly string[]): boolean =>
    files.some((file) => file === path || file.startsWith(`${path}/`));
  const includeOf = (tsconfig: string): string[] =>
    [...(/"include"\s*:\s*\[([^\]]*)\]/.exec(tsconfig)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );

  it("tsconfig 的 include：匯出樹沒有的拿掉、有的留著，註解一個字都不動", () => {
    const source = '{\n  // 給 Node 的型別\n  "include": ["src", "tests", "vite.config.ts"]\n}\n';
    expect(rewriteTsconfigInclude(source, (entry) => entry !== "tests")).toBe(
      '{\n  // 給 Node 的型別\n  "include": ["src", "vite.config.ts"]\n}\n',
    );
  });

  it("每一格都在就原樣回傳；一格都不在就失敗，不交一份什麼都不檢查的 tsconfig", () => {
    const source = '{ "include": ["src"] }';
    expect(rewriteTsconfigInclude(source, () => true)).toBe(source);
    expect(() => rewriteTsconfigInclude(source, () => false)).toThrow(/include/);
  });

  // ⚠️ 讀真樹的斷言只挑 `platform/`（理由見上面「只有測試用到的 devDependencies」那一段）。
  it("★ 真樹：出門的 platform tsconfig，include 的每一格都在匯出樹裡；platform/ui 原本那格 tests 真的被拿掉了", () => {
    const planned = plan(ROOT);
    const tsconfigs = planned.files.filter(
      (file) => file.startsWith("platform/") && basename(file) === "tsconfig.json",
    );
    expect(tsconfigs.length).toBeGreaterThan(0);
    for (const file of tsconfigs) {
      const shipped = planned.rewritten.get(file) ?? read(file);
      for (const entry of includeOf(shipped)) {
        expect(exists(`${dirname(file)}/${entry}`, planned.files), `${file} 的 ${entry}`).toBe(
          true,
        );
      }
    }
    // 對照組：上面那條迴圈在「沒有任何改寫」時也會綠，所以要看得到它真的動過一支。
    expect(includeOf(read("platform/ui/tsconfig.json"))).toContain("tests");
    expect(includeOf(planned.rewritten.get("platform/ui/tsconfig.json") ?? "")).toEqual(["src"]);
  });

  const css = [
    '@source "../**/*.{ts,tsx}";',
    "",
    "/*",
    " * 為什麼排掉那兩條",
    " */",
    '@source not "../**/tests/**";',
    '@source not "../**/*.test.ts";',
    "",
    "/*",
    " * 下一段",
    " */",
    ":root {}",
  ].join("\n");

  it("指向測試檔的 @source not 連同緊貼的那段註解拿掉；下一段註解與掃描那條照留", () => {
    expect(withoutTestSourceExclusions(css)).toBe(
      ['@source "../**/*.{ts,tsx}";', "", "/*", " * 下一段", " */", ":root {}"].join("\n"),
    );
  });

  it("那一串混了不是測試的排除：只拿測試那幾行，註解留著", () => {
    const mixed = [
      "/*",
      " * x",
      " */",
      '@source not "../**/tests/**";',
      '@source not "../legacy/**";',
    ];
    expect(withoutTestSourceExclusions(mixed.join("\n"))).toBe(
      ["/*", " * x", " */", '@source not "../legacy/**";'].join("\n"),
    );
  });

  it("★ 真樹：platform/ui 的樣式出門那份沒有 @source not，掃描那條照留", () => {
    const shipped = plan(ROOT).rewritten.get("platform/ui/src/styles/index.css");
    expect(read("platform/ui/src/styles/index.css")).toMatch(/^@source not /m);
    expect(shipped).toBeDefined();
    expect(shipped).not.toMatch(/^@source not /m);
    expect(shipped).toMatch(/^@source "[^"]+";$/m);
  });

  it("★ 沒有出門的檔引用、也不是 exports 目標的程式模組不出門；.d.ts、vite.config、index.html 載入的入口照出門", () => {
    const app = { dir: "apps/a", manifest: { name: "@org/a", scripts: { build: "vp build" } } };
    const files: Record<string, string> = {
      "apps/a/index.html": '<script type="module" src="/src/main.tsx"></script>',
      "apps/a/src/main.tsx": 'import "./app.tsx";',
      "apps/a/src/app.tsx": "",
      "apps/a/src/env.d.ts": "",
      "apps/a/vite.config.ts": "",
      "apps/a/dev-routes.ts": "export const routes = [];",
    };
    expect(unreferencedModules(app, Object.keys(files), (file) => files[file] ?? "")).toEqual([
      "apps/a/dev-routes.ts",
    ]);
  });

  it("exports 的目標照出門 —— 引用它的在 package 外", () => {
    const kit = {
      dir: "platform/kit",
      manifest: { name: "@org/kit", exports: { ".": "./src/index.ts" } },
    };
    expect(unreferencedModules(kit, ["platform/kit/src/index.ts"], () => "")).toEqual([]);
  });

  // ⚠️ 痕跡掃描的詞表沒有 `tests`、`@source not`：寫出去時漏套改寫，沒有別的東西會紅。
  it("★ 寫出去的是改寫過的那一份，不是原檔", () => {
    const planned = plan(ROOT);
    const out = sandbox({ prefix: "delivery-export-write-" });
    write(ROOT, planned, out.root);
    expect(planned.rewritten.size).toBeGreaterThan(0);
    for (const [file, content] of planned.rewritten) {
      expect(out.read(file), file).toBe(content);
    }
  });

  // 相對 import 只在同一個 package 裡有意義；全樹一起比，`bff-contract` 的 `./contract.ts`
  // 會撞上 `slice-kit` 那支同名的檔。
  it("★ 真樹：不出門的模組，沒有一支被同 package 裡出門的檔以相對路徑引用", () => {
    const planned = plan(ROOT);
    for (const file of planned.withheld.filter((path) => /\.[cm]?[jt]sx?$/.test(path))) {
      const member = planned.exported.find((candidate) => file.startsWith(`${candidate.dir}/`));
      const own = planned.files.filter((other) => other.startsWith(`${member?.dir}/`));
      expect(importsRelatively(own.map(read).join("\n"), file), file).toBe(false);
    }
  });
});
