import { spawnSync } from "node:child_process";

/**
 * 這支工具問 git 的那幾件事，以及**問不到時是什麼形狀**。
 *
 * ⚠️ 每一格都可能是 `undefined`，而那不是錯誤 —— 淺 checkout（`actions/checkout`
 * 預設 `fetch-depth: 1`，不帶 tag）、剛 `git init` 的沙盒、根本不是 git 工作樹，
 * 三種情況都會讓某一格空掉。**把空的當成 0 是這支工具唯一致命的錯**（C169 §四：
 * 「量不到」與「零」不是同一件事）。
 */
export interface GitFacts {
  /** 目前 HEAD 的 commit。不是 git 工作樹時是 `undefined`。 */
  readonly head?: string;
  /** 從 HEAD 往回最近的一個 tag。一個 tag 都看不到時是 `undefined`。 */
  readonly tag?: string;
  /** 那個 tag 指到的 commit。 */
  readonly tagCommit?: string;
  /** tag 到 HEAD 之間第一父鏈上的 commit 數。 */
  readonly commits?: number;
  /** tag 的 commit 在不在 HEAD 的第一父鏈上。 */
  readonly onFirstParent?: boolean;
  /** tag 的作者時間（ISO）。 */
  readonly tagDate?: string;
  /** HEAD 的作者時間（ISO）。 */
  readonly headDate?: string;
  /** git 認定的工作樹根。用來確認量的是不是呼叫端以為的那棵樹。 */
  readonly toplevel?: string;
}

function run(cwd: string, args: readonly string[]): string | undefined {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) return undefined;
  const out = result.stdout.trim();
  return out.length === 0 ? undefined : out;
}

/**
 * ⚠️ **`--first-parent` 不是裝飾**。C169 §四 實測：`v1.0.0`–`v1.14.1` 那 31 個 tag
 * 不在 `main` 的第一父鏈上（它們活在已刪的 `release/v1`），而
 * `git rev-list --count v1.14.1..v1.15.0` 在那個跨併線的窗口上回 **63**，
 * 同一個窗口人工數出來的行為變更是 **25**。兩個都對，單位不同。
 *
 * 這支報的是**第一父鏈上的 commit 數**，並且在 tag 不在那條鏈上時明講
 * （`onFirstParent`）—— 因為那正是數字會與人的直覺分岔的那個情況。
 */
export function readGit(cwd: string): GitFacts {
  const toplevel = run(cwd, ["rev-parse", "--show-toplevel"]);
  if (toplevel === undefined) return {};

  const head = run(cwd, ["rev-parse", "HEAD"]);
  const headDate = run(cwd, ["log", "-1", "--format=%aI", "HEAD"]);
  const tag = run(cwd, ["describe", "--tags", "--abbrev=0", "HEAD"]);
  if (tag === undefined) return { head, headDate, toplevel };

  const tagCommit = run(cwd, ["rev-list", "-n", "1", tag]);
  const counted = run(cwd, ["rev-list", "--count", "--first-parent", `${tag}..HEAD`]);
  const commits = counted === undefined ? undefined : Number.parseInt(counted, 10);
  const onFirstParent =
    tagCommit === undefined
      ? undefined
      : run(cwd, ["rev-list", "--first-parent", "HEAD"])?.split("\n").includes(tagCommit);

  return {
    head,
    headDate,
    tag,
    tagCommit,
    commits: Number.isNaN(commits) ? undefined : commits,
    onFirstParent,
    tagDate: run(cwd, ["log", "-1", "--format=%aI", `${tag}^{commit}`]),
    toplevel,
  };
}
