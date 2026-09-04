import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach } from "vitest";

import { repoRoot } from "./root.ts";

export { repoRoot };

/**
 * 閘門測試的 harness：沙盒、跑 CLI、repo 根。**只給測試 import**（C168）。
 *
 * 收攏之前，`tools/*\/tests` 底下有 11 份沙盒建構、8 份 spawn 包裝、17 處手抄的
 * repo 根、三派互相矛盾的清理方式。它們沒有一份是錯的 —— 問題是「臨時目錄要不要
 * `git init`、要不要清、用 `git ls-files` 還是 `readdirSync`」這種政策，改一次得改
 * 十一處。這支檔案決定的只有**怎麼建樹、怎麼跑**；**什麼算對**仍然留在各支測試裡，
 * C43 起「每一道閘門附一支反向測試」的原則一條不動。
 *
 * ⚠️ 這支檔案在被 import 的當下就向 vitest 註冊 `afterEach`／`afterAll`。
 * 從非測試碼 import 它會在 vitest 之外呼叫那兩個 hook 而炸掉 —— 那是對的：
 * 產品碼沒有理由碰這裡。
 */

export interface SandboxOptions {
  /** 相對沙盒根的路徑 → 內容。中間目錄自動建。 */
  readonly files?: Readonly<Record<string, string>>;
  /**
   * 從真樹複製進來的路徑（相對 repo 根，落在沙盒的同一相對位置）。
   *
   * ⚠️ **只複製版控裡的檔**（`git ls-files`）。沙盒是 fixture，不該隨你工作區的
   * 狀態變：`.vitest-results.json`、coverage 產物、改到一半的檔都不進來；
   * `node_modules` 那座 symlink 農場也因此自然被排除，不用再寫 filter。
   * 指到的路徑底下一個版控檔都沒有時**丟例外** —— 空沙盒與「複製成功」長得一樣。
   */
  readonly copy?: readonly string[];
  /** `git init` ＋ `git add -A`。要 commit 或更多，走 `sandbox.git(...)`。 */
  readonly git?: boolean;
  /**
   * 沙盒建在哪個目錄底下。預設 `os.tmpdir()`。
   *
   * 唯一已知要改它的是 `tools/vue-typecheck/tests/negative.test.ts`：tsconfig 的
   * `extends` 要從沙盒解析得到 `@org/tsconfig`，所以沙盒必須住在 repo 裡面。
   * 那段理由寫在它自己檔頭，這裡只留入口。
   */
  readonly within?: string;
  /** 臨時目錄名的前綴，留給清理失敗時認屍用。 */
  readonly prefix?: string;
  /**
   * 活多久。`"each"`（預設）在每個 `it` 之後清掉；`"all"` 在整個檔案跑完之後。
   * 在 `beforeAll` 裡建、給整個檔案共用的沙盒要用 `"all"`，否則第二個 `it` 開始
   * 讀的是一個已經不存在的目錄。
   */
  readonly lifetime?: "each" | "all";
}

/** 三個函式都不碰 `this`，所以 `const { root, git } = sandbox(...)` 是安全的。 */
export interface Sandbox {
  readonly root: string;
  /** 讀沙盒裡的檔（相對沙盒根，UTF-8）。 */
  readonly read: (path: string) => string;
  /** 寫或覆寫沙盒裡的檔，中間目錄自動建。反向測試竄改 fixture 用。 */
  readonly write: (path: string, content: string) => void;
  /** 在沙盒根跑 `git`，回 stdout；非零退出丟例外。 */
  readonly git: (args: readonly string[]) => string;
}

export interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** `stdout` 接 `stderr`。閘門的訊息兩邊都可能出現，斷言措辭時看這一格。 */
  readonly output: string;
}

const perTest: string[] = [];
const perFile: string[] = [];

function removeAll(dirs: string[]): void {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

afterEach(() => removeAll(perTest));
afterAll(() => removeAll(perFile));

export function sandbox(options: SandboxOptions = {}): Sandbox {
  const root = mkdtempSync(join(options.within ?? tmpdir(), options.prefix ?? "gate-kit-sandbox-"));
  (options.lifetime === "all" ? perFile : perTest).push(root);

  const box: Sandbox = {
    root,
    read: (path) => readFileSync(join(root, path), "utf8"),
    write: (path, content) => writeFile(root, path, content),
    git: (args) => git(root, args),
  };

  for (const path of options.copy ?? []) copyTracked(path, root);
  for (const [path, content] of Object.entries(options.files ?? {})) box.write(path, content);
  if (options.git === true) {
    box.git(["init", "--quiet"]);
    box.git(["add", "-A"]);
  }
  return box;
}

function writeFile(root: string, path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} 在 ${cwd} 失敗：${result.stderr}`);
  }
  return result.stdout;
}

function copyTracked(path: string, root: string): void {
  const listed = git(repoRoot(), ["ls-files", "-z", "--", path]);
  const files = listed.split("\0").filter((entry) => entry.length > 0);
  if (files.length === 0) {
    throw new Error(`copy: ${path} 底下沒有任何版控裡的檔 —— 空沙盒與複製成功長得一樣`);
  }
  for (const file of files) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(repoRoot(), file), target);
  }
}

/**
 * 用 `node` 跑一支 CLI。`cli` 可以是相對 repo 根的路徑或絕對路徑。
 *
 * ⚠️ 旗標全部由呼叫端明寫，這裡**不補 `--root`**：C126 之後八支 CLI 一律拒絕不認得
 * 的旗標，一個「貼心」補上的旗標會讓不吃它的那支變紅，而紅的原因看起來像別的事。
 *
 * `cwd` 固定是 repo 根 —— 閘門對「現在在哪裡」的假設全部以此為準，
 * 沙盒要走 `--root`，不走 `cwd`。
 */
export function runCli(cli: string, args: readonly string[] = []): CliResult {
  const result = spawnSync("node", [resolve(repoRoot(), cli), ...args], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { status: result.status, stdout, stderr, output: `${stdout}${stderr}` };
}
