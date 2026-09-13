import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import {
  catalogReferences,
  GITIGNORE,
  rewriteManifest,
  rewriteNpmrc,
  rewriteRootManifest,
  rewriteWorkspaceYaml,
  TEST_FILE,
  testOnlyDependencies,
} from "./rewrite.ts";
import type { ScannedFile } from "./scan.ts";
import {
  closure,
  type Manifest,
  type Member,
  trackedFiles,
  workspaceGlobs,
  workspaceMembers,
} from "./workspace.ts";

// ⚠️ `.css` 要算：`platform/ui` 的 `styles.css` 以 `@import "tailwindcss"` 引用它，而第一版只看
// 程式碼檔，把它當成測試相依拿掉了 —— 建置照樣綠，因為 `apps/console` 自己也宣告了 tailwindcss。
const CODE_FILE = /\.(?:[cm]?[jt]sx?|css)$/;

export interface Plan {
  readonly members: readonly Member[];
  readonly exported: readonly Member[];
  /** 相對 repo 根、原樣複製的檔（不含各成員的 `package.json`，那個另外改寫）。 */
  readonly files: readonly string[];
  readonly manifests: ReadonlyMap<string, Manifest>;
  /** 成員目錄 → 拿掉的測試相依。 */
  readonly dropped: ReadonlyMap<string, readonly string[]>;
  readonly rootFiles: Readonly<Record<string, string>>;
  readonly toolNames: readonly string[];
  readonly docNames: readonly string[];
}

function under(dir: string, file: string): boolean {
  return file.startsWith(`${dir}/`);
}

function concat(root: string, files: readonly string[]): string {
  return files.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
}

export function plan(root: string): Plan {
  const tracked = trackedFiles(root);
  const members = workspaceMembers(root, tracked);
  const exported = closure(members);
  const dirs = exported.map((member) => member.dir);

  const files = tracked.filter(
    (file) =>
      dirs.some((dir) => under(dir, file)) &&
      !TEST_FILE.test(file) &&
      basename(file) !== "package.json",
  );
  // 巢狀的 package.json（例如 fixture 裡的）已經被 TEST_FILE 擋掉；成員自己的那一支在下面改寫。

  const manifests = new Map<string, Manifest>();
  const dropped = new Map<string, readonly string[]>();
  for (const member of exported) {
    const code = tracked.filter((file) => under(member.dir, file) && CODE_FILE.test(file));
    const testOnly = testOnlyDependencies(
      member.manifest,
      concat(
        root,
        code.filter((file) => !TEST_FILE.test(file)),
      ),
      concat(
        root,
        code.filter((file) => TEST_FILE.test(file)),
      ),
    );
    dropped.set(member.dir, testOnly);
    manifests.set(member.dir, rewriteManifest(member.manifest, testOnly));
  }

  const yaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const rootManifest = rewriteRootManifest(
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Manifest,
  );
  const globs = new Set(
    workspaceGlobs(yaml).filter((glob) => dirs.some((dir) => dir.startsWith(glob.slice(0, -1)))),
  );
  const catalog = catalogReferences([rootManifest, ...manifests.values()], yaml);

  const rootFiles = {
    "package.json": `${JSON.stringify(rootManifest, null, 2)}\n`,
    "pnpm-workspace.yaml": rewriteWorkspaceYaml(yaml, { globs, catalog }),
    ".npmrc": rewriteNpmrc(readFileSync(join(root, ".npmrc"), "utf8")),
    ".gitignore": GITIGNORE,
  };

  const shipped = new Set([...files.map((file) => basename(file)), ...Object.keys(rootFiles)]);
  return {
    members,
    exported,
    files,
    manifests,
    dropped,
    rootFiles,
    toolNames: members
      .filter((member) => under("tools", member.dir))
      .map((member) => basename(member.dir)),
    docNames: tracked.filter(
      (file) => !file.includes("/") && file.endsWith(".md") && !shipped.has(file),
    ),
  };
}

export function write(root: string, planned: Plan, out: string): void {
  const put = (path: string, content: string): void => {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), content);
  };
  for (const file of planned.files) {
    mkdirSync(dirname(join(out, file)), { recursive: true });
    copyFileSync(join(root, file), join(out, file));
  }
  for (const [dir, manifest] of planned.manifests)
    put(`${dir}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [path, content] of Object.entries(planned.rootFiles)) put(path, content);
  copyFileSync(join(root, "pnpm-lock.yaml"), join(out, "pnpm-lock.yaml"));
}

export interface Step {
  readonly name: string;
  readonly ok: boolean;
  readonly output: string;
}

export function pnpm(args: readonly string[], cwd: string, name: string): Step {
  const result = spawnSync("pnpm", [...args], { cwd, encoding: "utf8" });
  return {
    name,
    ok: result.status === 0,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

/**
 * lockfile 帶原檔、讓 pnpm 離線剪（C231 §二）。重新解析的那一趟會解到 store 沒有的版本 ——
 * 在機關端就是版本漂移；`--lockfile-only --offline` 只刪沒人要的條目，不換版本。
 */
export function pruneLockfile(out: string): Step {
  return pnpm(["install", "--lockfile-only", "--offline"], out, "lockfile 離線剪枝");
}

/** 掃描的對象：匯出目錄裡每一支檔，lockfile 除外（sha512 會湊出假的編號，而它剪不掉的是公開套件）。 */
export function readExport(out: string): ScannedFile[] {
  const found: ScannedFile[] = [];
  const visit = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") visit(join(dir, entry.name), path);
      } else if (path !== "pnpm-lock.yaml") {
        found.push({ path, content: readFileSync(join(dir, entry.name), "utf8") });
      }
    }
  };
  visit(out, "");
  return found;
}
