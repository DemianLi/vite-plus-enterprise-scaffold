import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import {
  buildsItself,
  catalogReferences,
  GITIGNORE,
  importsRelatively,
  references,
  rewriteManifest,
  rewriteNpmrc,
  rewriteRootManifest,
  rewriteTsconfigInclude,
  rewriteWorkspaceYaml,
  TEST_FILE,
  testOnlyDependencies,
  VITE_CONFIG,
  withoutTestSourceExclusions,
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

/** devDep 那條邊算不算被引用：程式碼、樣式，加上設定檔（`tsconfig.json` 以 `extends` 引用 `@org/tsconfig`）。 */
const REFERENCE_FILE = /\.(?:[cm]?[jt]sx?|css|json)$/;

/** 要被 import 才會生效的程式模組。`.d.ts` 不算 —— 它由 tsconfig 的 `include` 生效。 */
const MODULE = /\.[cm]?[jt]sx?$/;
const DECLARATION = /\.d\.[cm]?ts$/;

export interface Plan {
  readonly members: readonly Member[];
  readonly exported: readonly Member[];
  /** 相對 repo 根、出門的檔（不含各成員的 `package.json`，那個另外改寫）。 */
  readonly files: readonly string[];
  /** `files` 裡內容要改寫的那幾支：路徑 → 出門的內容。其餘原樣複製。 */
  readonly rewritten: ReadonlyMap<string, string>;
  /**
   * 出門的成員底下、不是測試卻不出門的檔：只剩測試在讀的設定、沒有出門的碼引用的子路徑、
   * 沒有出門的檔引用的程式模組。
   */
  readonly withheld: readonly string[];
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

/**
 * 成員底下的這支檔出不出門。測試不出門；成員自己的 `package.json` 另外改寫；
 * 自己不建置的成員，`vite.config.*` 只剩測試在讀，也不出門。
 * 巢狀的 `package.json`（例如 fixture 裡的）已經被 `TEST_FILE` 擋掉。
 */
function shippable(member: Member, file: string): boolean {
  if (!under(member.dir, file) || TEST_FILE.test(file) || basename(file) === "package.json") {
    return false;
  }
  return !(VITE_CONFIG.test(file.slice(member.dir.length + 1)) && !buildsItself(member.manifest));
}

/** `exports` 指到的檔（相對 repo 根）。條件式 exports 的每一個字串值都算。 */
function exportTargets(member: Member): Set<string> {
  const targets = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") targets.add(`${member.dir}/${value.replace(/^\.\//, "")}`);
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(visit);
  };
  visit(member.manifest["exports"]);
  return targets;
}

/**
 * `exports` 裡除了 `.` 之外、沒有任何出門的碼引用的子路徑 —— 以「包名／子路徑」引用、或同一個
 * package 裡以相對路徑 import，都算引用。它指的那支檔不出門，manifest 的那一條也拿掉（C250）。
 * ⚠️ 今天命中的是 `@org/slice-kit/contract`：引用它的只有切片不出門的設定與 `tools/`。
 */
export function unusedSubpaths(
  member: Member,
  shipped: readonly string[],
  read: (file: string) => string,
): (readonly [string, string])[] {
  const map = member.manifest["exports"];
  if (typeof map !== "object" || map === null) return [];
  const unused: (readonly [string, string])[] = [];
  for (const [subpath, target] of Object.entries(map as Record<string, unknown>)) {
    if (subpath === "." || typeof target !== "string") continue;
    const file = `${member.dir}/${target.replace(/^\.\//, "")}`;
    // ⚠️ 設定檔也算：`@org/tsconfig/lib.json` 只以 `extends` 被 `tsconfig.json` 引用 —— 第一版只看
    // 程式碼檔，把 `platform/tsconfig` 的四支全判成沒人用，演練當場建不起來。
    const others = shipped.filter((other) => other !== file && REFERENCE_FILE.test(other));
    const source = others.map(read).join("\n");
    const own = others
      .filter((other) => under(member.dir, other))
      .map(read)
      .join("\n");
    const specifier = `${member.manifest.name}/${subpath.replace(/^\.\//, "")}`;
    if (!references(source, specifier) && !importsRelatively(own, file)) {
      unused.push([subpath, file]);
    }
  }
  return unused;
}

/**
 * 成員底下出門的程式模組裡，沒有任何其他出門的檔引用、也不是 `exports` 目標或建置設定的那幾支
 *（C251，Q123）。引用照 `unusedSubpaths` 的算法，外加 `index.html` 以路徑載入的入口。
 * ⚠️ 今天命中的是 `apps/console/bff-routes.ts`：只有不出門的 `platform/bff-mock` 以 env 動態載入它。
 */
export function unreferencedModules(
  member: Member,
  shipped: readonly string[],
  read: (file: string) => string,
): string[] {
  const targets = exportTargets(member);
  return shipped.filter((file) => {
    if (!under(member.dir, file) || !MODULE.test(file) || DECLARATION.test(file)) return false;
    if (targets.has(file) || VITE_CONFIG.test(file.slice(member.dir.length + 1))) return false;
    const source = shipped
      .filter((other) => other !== file)
      .map(read)
      .join("\n");
    const specifier = `${member.manifest.name}/${file.slice(member.dir.length + 1)}`;
    return !importsRelatively(source, file) && !references(source, specifier);
  });
}

/** 沒出門的 workspace package 還寫在 devDep 裡的話，機關端 `pnpm install` 會找不到它。 */
export function unexportedWorkspaceDevDependencies(
  member: Member,
  members: readonly Member[],
  exported: readonly Member[],
): string[] {
  const workspace = new Set(members.map((other) => other.manifest.name));
  const shipped = new Set(exported.map((other) => other.manifest.name));
  return Object.keys(member.manifest.devDependencies ?? {}).filter(
    (dependency) => workspace.has(dependency) && !shipped.has(dependency),
  );
}

/** 出門的 manifest 要拿掉的 devDependencies：只有測試用到的，加上沒出門的 workspace package。 */
export function devDependenciesToRemove(
  member: Member,
  members: readonly Member[],
  exported: readonly Member[],
  testOnly: readonly string[],
): string[] {
  return [
    ...new Set([...testOnly, ...unexportedWorkspaceDevDependencies(member, members, exported)]),
  ];
}

/** 出門的檔裡內容要改寫的：`tsconfig*.json` 的 `include`、樣式檔排除測試的 `@source not`。 */
function rewrittenContents(
  files: readonly string[],
  read: (file: string) => string,
): Map<string, string> {
  const shipped = new Set(files);
  const present = (base: string, entry: string): boolean => {
    const prefix = entry
      .replace(/[*?{[].*$/, "")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");
    const path = prefix === "" ? base : `${base}/${prefix}`;
    return shipped.has(path) || files.some((file) => under(path, file));
  };
  const rewritten = new Map<string, string>();
  for (const file of files) {
    const original = read(file);
    let content = original;
    if (/^tsconfig[^/]*\.json$/.test(basename(file))) {
      content = rewriteTsconfigInclude(original, (entry) => present(dirname(file), entry));
    } else if (file.endsWith(".css")) {
      content = withoutTestSourceExclusions(original);
    }
    if (content !== original) rewritten.set(file, content);
  }
  return rewritten;
}

export function plan(root: string): Plan {
  const tracked = trackedFiles(root);
  const members = workspaceMembers(root, tracked);
  const cache = new Map<string, string>();
  const read = (file: string): string => {
    const cached = cache.get(file);
    if (cached !== undefined) return cached;
    const content = readFileSync(join(root, file), "utf8");
    cache.set(file, content);
    return content;
  };

  const sources = new Map<string, string>();
  const shippedSource = (member: Member): string => {
    const cached = sources.get(member.dir);
    if (cached !== undefined) return cached;
    const source = concat(
      root,
      tracked.filter((file) => shippable(member, file) && REFERENCE_FILE.test(file)),
    );
    sources.set(member.dir, source);
    return source;
  };
  const exported = closure(members, (member, dependency) =>
    references(shippedSource(member), dependency),
  );
  const dirs = exported.map((member) => member.dir);

  const candidates = tracked.filter((file) => exported.some((member) => shippable(member, file)));
  const withheldExports = new Map<string, readonly string[]>();
  const withheldFiles = new Set<string>();
  for (const member of exported) {
    const unused = unusedSubpaths(member, candidates, read);
    withheldExports.set(
      member.dir,
      unused.map(([subpath]) => subpath),
    );
    for (const [, file] of unused) withheldFiles.add(file);
  }
  let files = candidates.filter((file) => !withheldFiles.has(file));
  // 拿掉一支之後，只被它引用的那幾支也跟著沒人引用 —— 做到不再變為止。
  for (;;) {
    const unreferenced = new Set(
      exported.flatMap((member) => unreferencedModules(member, files, read)),
    );
    if (unreferenced.size === 0) break;
    files = files.filter((file) => !unreferenced.has(file));
  }
  const shippedFiles = new Set(files);
  const withheld = tracked.filter(
    (file) =>
      dirs.some((dir) => under(dir, file)) &&
      !TEST_FILE.test(file) &&
      basename(file) !== "package.json" &&
      !shippedFiles.has(file),
  );

  const manifests = new Map<string, Manifest>();
  const dropped = new Map<string, readonly string[]>();
  for (const member of exported) {
    const code = tracked.filter((file) => under(member.dir, file) && CODE_FILE.test(file));
    // 不出門的碼（測試、只剩測試在讀的設定）算在測試那一側。
    const testOnly = testOnlyDependencies(
      member.manifest,
      concat(
        root,
        code.filter((file) => shippedFiles.has(file)),
      ),
      concat(
        root,
        code.filter((file) => !shippedFiles.has(file)),
      ),
    );
    const removed = devDependenciesToRemove(member, members, exported, testOnly);
    dropped.set(member.dir, removed);
    manifests.set(
      member.dir,
      rewriteManifest(member.manifest, removed, withheldExports.get(member.dir) ?? []),
    );
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
    rewritten: rewrittenContents(files, read),
    withheld,
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
    const content = planned.rewritten.get(file);
    if (content !== undefined) {
      put(file, content);
      continue;
    }
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
