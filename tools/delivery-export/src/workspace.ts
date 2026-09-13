import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Manifest {
  readonly name: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly [field: string]: unknown;
}

export interface Member {
  /** 相對 repo 根，例如 `platform/ui`。 */
  readonly dir: string;
  readonly manifest: Manifest;
}

/**
 * 交付的是業務，業務從這兩層長出來；其餘要不要出門，全看從這裡走不走得到（C231 §四.2）。
 */
export const ENTRY_GROUPS = ["apps", "features"] as const;

/**
 * 版控裡的檔，不是磁碟上的 —— `node_modules`、`dist`、改到一半沒追蹤的檔都不該出門，
 * 而問磁碟的話每一種都要另寫一條排除。
 */
export function trackedFiles(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ls-files 在 ${root} 失敗：${result.stderr}`);
  const files = result.stdout.split("\0").filter((file) => file.length > 0);
  if (files.length === 0)
    throw new Error(`${root} 底下沒有任何版控裡的檔 —— 空樹匯出去也是「成功」`);
  return files;
}

/** `pnpm-workspace.yaml` 的 `packages:` 那幾行（`  - apps/*`）。 */
export function workspaceGlobs(yaml: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  for (const line of yaml.split("\n")) {
    if (/^\S/.test(line) && !line.startsWith("#")) inPackages = line.startsWith("packages:");
    else if (inPackages) {
      const glob = /^\s+-\s+["']?([^"'\s#]+)/.exec(line)?.[1];
      if (glob !== undefined) globs.push(glob);
    }
  }
  return globs;
}

/**
 * workspace 成員。只認 `<層>/*` 這一種 glob —— 這棵樹只用這一種，而認得更多種的
 * 解析器會把「寫了一個它其實不懂的 glob」變成安靜地少幾個成員。
 */
export function workspaceMembers(root: string, files: readonly string[]): Member[] {
  const globs = workspaceGlobs(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
  const members: Member[] = [];
  for (const glob of globs) {
    const layer = /^([\w.-]+)\/\*$/.exec(glob)?.[1];
    if (layer === undefined) throw new Error(`pnpm-workspace.yaml 的 "${glob}" 不是 <層>/* 的形狀`);
    const isManifest = (path: string): boolean => {
      const parts = path.split("/");
      return parts.length === 3 && parts[0] === layer && parts[2] === "package.json";
    };
    for (const file of files.filter(isManifest)) {
      const dir = file.slice(0, -"/package.json".length);
      members.push({
        dir,
        manifest: JSON.parse(readFileSync(join(root, file), "utf8")) as Manifest,
      });
    }
  }
  return members;
}

/**
 * 從 `ENTRY_GROUPS` 出發，沿 `dependencies`／`devDependencies` 走得到的成員。
 *
 * ⚠️ 走 `devDependencies` 是必要的：`@org/tsconfig` 只以 devDep 被引用、`@org/security-headers`
 * 是 `apps/console` 建置期 import 的 devDep —— 只走 `dependencies` 會把兩個交付物本體留在門內。
 * ⚠️ 但 devDep 那條邊要 `followsDevDependency` 點頭才走（C231 §四.2，C250）：只有測試寫進
 * devDep 的 workspace package，出門的碼一處都沒引用它，走過去就把它帶出門了。
 * 這個判斷刻意沒有預設值 —— 預設「全走」的話，漏傳就是規則安靜地關掉。
 */
export function closure(
  members: readonly Member[],
  followsDevDependency: (member: Member, dependency: string) => boolean,
  entries: readonly string[] = ENTRY_GROUPS,
): Member[] {
  const byName = new Map(members.map((member) => [member.manifest.name, member]));
  const reached = new Set<string>();
  const queue = members
    .filter((member) => entries.some((group) => member.dir.startsWith(`${group}/`)))
    .map((member) => member.manifest.name);

  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (reached.has(name)) continue;
    reached.add(name);
    const member = byName.get(name) as Member;
    for (const dep of Object.keys(member.manifest.dependencies ?? {})) {
      if (byName.has(dep)) queue.push(dep);
    }
    for (const dep of Object.keys(member.manifest.devDependencies ?? {})) {
      if (byName.has(dep) && followsDevDependency(member, dep)) queue.push(dep);
    }
  }
  return members.filter((member) => reached.has(member.manifest.name));
}
