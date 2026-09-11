import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 腳手架的章：fork 之後**不是團隊的**那一半，在樹上長什麼樣子（C220，實作 C215 §六）。
 *
 * ── 兩端做同一件事，差在嚴格度 ──────────────────────────────────────
 *
 * 上游是生產者，天天改這些檔（C215 §六），所以上游驗的是「章與樹**相等**」—— 改了腳手架
 * 的檔就重算章，章與改動進同一個 PR（C220 Q32：每支 commit 都一致，不是發版時才蓋）。
 * fork 驗的是「章裡每一行在樹上都**原樣存在**」—— 團隊加自己的 script、workflow 是合法的，
 * 改腳手架的不是。
 *
 * ⚠️ 兩端是**同一條規則的兩個訊息**，不是兩條（C220 §五）。
 *
 * ── 射程用目錄規則，不用逐檔名單 ──────────────────────────────────────
 *
 * C109 §七：要被閘門守的清單必須是活的。章本身就是那份活的名單 —— 每一支上游 commit
 * 都重算一次；這裡只寫**規則**。
 */

/** 章住在根層，**不在任何受保護的目錄裡** —— 否則每重算一次它就改到它自己。 */
export const STAMP_FILE = ".scaffold-stamp";

/**
 * 關閉的目錄：底下每一個版控檔都進章，而且 fork **多一個也紅**（C220 Q33）。
 *
 * ⚠️ 必須與 `vite.scaffold.ts` 那串 override 的 `files` 是同一個集合（C219 §六）：寬過它，
 * 差集裡的檔吃**團隊那一組**門檻 —— 團隊收緊根層，就紅在他們改不了的碼上。
 */
export const CLOSED_DIRS = ["tools/", "platform/"] as const;

/** 根層具名的 base 檔（C219）。 */
export const NAMED_FILES = ["vite.scaffold.ts"] as const;

/**
 * 逐檔進章、**目錄不關**（C220 Q36）：GitHub 規定 workflow 只能住在這一層，
 * 團隊加自己的檔是合法的；上游那幾支不准動。
 */
export const OPEN_DIRS = [".github/workflows/"] as const;

/**
 * fork 可以**往後接**、不必逐字相等的 script（C220 §三）：團隊自己的工具住在 `tools/`
 * 之外，它們的測試要接在上游那一串後面。形狀同 `gate-roster` 對這一格的比對（includes）。
 */
export const EXTENSIBLE_SCRIPTS: ReadonlySet<string> = new Set(["ready:fork"]);

/** 版控裡有、磁碟上沒有。 */
export const MISSING = "-";

export interface Stamp {
  /** 路徑 → 內容的 sha256。 */
  readonly files: ReadonlyMap<string, string>;
  /** script 名 → 內容。 */
  readonly scripts: ReadonlyMap<string, string>;
}

export interface Problem {
  readonly kind: string;
  readonly detail: string;
}

export type Side = "upstream" | "fork";

function isClosed(path: string): boolean {
  return CLOSED_DIRS.some((dir) => path.startsWith(dir));
}

export function isProtected(path: string): boolean {
  return (
    isClosed(path) ||
    OPEN_DIRS.some((dir) => path.startsWith(dir)) ||
    (NAMED_FILES as readonly string[]).includes(path)
  );
}

/**
 * 腳手架的 script（C219 Q29）：`gate`／`ready` 那一族，以及跑 `tools/` 底下工具的別名。
 * `dev`、`bff` 這種指到示範應用的，是團隊要改的。
 */
export function isScaffoldScript(key: string, value: string): boolean {
  return /^(?:gate|ready)(?::|$)/.test(key) || value.includes("tools/");
}

/**
 * ⚠️ 換行先正規化成 LF：Windows 上 `core.autocrlf` 會把工作區換成 CRLF，不正規化的話
 * 每一台 Windows 都會讀成「整個腳手架都被改過」。latin1 來回不改任何位元組。
 */
export function digest(content: Buffer): string {
  const text = content.toString("latin1").replaceAll("\r\n", "\n");
  return createHash("sha256").update(text, "latin1").digest("hex");
}

/**
 * ⚠️ 清單取自版控、內容取自磁碟 —— 理由同 `exit-drill` 的樹指紋（`tree-fingerprint.ts` 檔頭）：
 * 改了沒 `git add` 的看得到；**沒有 `git add` 的新檔看不到**（CI 上兩者相同）。
 */
export function trackedFiles(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ls-files 在 ${root} 失敗：${result.stderr}`);
  return result.stdout.split("\0").filter((path) => path.length > 0);
}

/**
 * 受保護路徑底下、還沒 `git add` 的檔（不含被忽略的）。
 *
 * ⚠️ 章的清單取自版控，所以「先重算、後 add」的新檔不會進章 —— commit 之後它變成版控檔，
 * 閘門就紅在「章裡沒有這個檔」。這支工具自己的 8 支檔就是這樣第一次紅的（C220 §三（五））。
 */
export function untrackedProtected(root: string): string[] {
  const result = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ls-files 在 ${root} 失敗：${result.stderr}`);
  return result.stdout.split("\0").filter((path) => path.length > 0 && isProtected(path));
}

export function currentStamp(root: string, tracked: readonly string[]): Stamp {
  const files = new Map<string, string>();
  for (const path of tracked) {
    if (!isProtected(path)) continue;
    const full = join(root, path);
    files.set(path, existsSync(full) ? digest(readFileSync(full)) : MISSING);
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = new Map(
    Object.entries(pkg.scripts ?? {}).filter(([key, value]) => isScaffoldScript(key, value)),
  );
  return { files, scripts };
}

const HEADER = [
  "# 腳手架的章（C220）。上游由 `vpr scaffold-stamp-update` 重算，不要手改。",
  "# fork 端每一次 `vpr gate` 都驗：下面每一行在 fork 的樹上都要原樣存在。",
  "# 一行一個檔、一行一條 script，照字典序 —— 兩支 PR 改到不同的檔，合併不會撞在同一行。",
];

function sorted<V>(map: ReadonlyMap<string, V>): [string, V][] {
  return [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function formatStamp(stamp: Stamp): string {
  const lines = [
    ...HEADER,
    ...sorted(stamp.files).map(([path, sha]) => `file\t${sha}\t${path}`),
    ...sorted(stamp.scripts).map(([key, value]) => `script\t${key}\t${value}`),
  ];
  return `${lines.join("\n")}\n`;
}

export function parseStamp(text: string): Stamp {
  const files = new Map<string, string>();
  const scripts = new Map<string, string>();
  for (const [at, line] of text.split("\n").entries()) {
    if (line === "" || line.startsWith("#")) continue;
    const [kind, first = "", ...rest] = line.split("\t");
    const second = rest.join("\t");
    if (kind === "file" && first !== "" && second !== "") files.set(second, first);
    else if (kind === "script" && first !== "" && second !== "") scripts.set(first, second);
    else throw new Error(`${STAMP_FILE} 第 ${at + 1} 行讀不懂：${line}`);
  }
  return { files, scripts };
}

/**
 * 自我防護（C154 §三 第 3 條，不計分）：一份空的、或缺了 base 檔的章，會讓下面每一行比對
 * 都「通過」—— 與樹指紋那個 `files === 0` 同一個形狀（`tree-fingerprint.ts`）。
 */
function selfCheck(recorded: Stamp): Problem[] {
  const paths = [...recorded.files.keys()];
  const problems: Problem[] = [];
  for (const dir of CLOSED_DIRS) {
    if (paths.some((path) => path.startsWith(dir))) continue;
    problems.push({
      kind: "章壞了",
      detail: `章裡沒有任何 ${dir} 底下的檔 —— 列舉本身壞了，不是「沒有東西被改」`,
    });
  }
  for (const name of NAMED_FILES) {
    if (!recorded.files.has(name)) problems.push({ kind: "章壞了", detail: `章裡沒有 ${name}` });
  }
  return problems;
}

function compareFiles(recorded: Stamp, current: Stamp, side: Side): Problem[] {
  const problems: Problem[] = [];
  for (const [path, sha] of recorded.files) {
    const now = current.files.get(path);
    if (now === undefined || now === MISSING) {
      problems.push({ kind: "腳手架的檔不見了", detail: path });
    } else if (now !== sha) {
      problems.push({ kind: "腳手架的檔被改了", detail: path });
    }
  }
  for (const path of current.files.keys()) {
    // fork：關閉的目錄多一個檔就紅，workflow 那一層是開的（Q33／Q36）。上游：章與樹相等。
    if (recorded.files.has(path) || (side === "fork" && !isClosed(path))) continue;
    problems.push({ kind: "章裡沒有這個檔", detail: path });
  }
  return problems;
}

function compareScripts(recorded: Stamp, current: Stamp, side: Side): Problem[] {
  const problems: Problem[] = [];
  for (const [key, value] of recorded.scripts) {
    const now = current.scripts.get(key);
    if (now === undefined) {
      problems.push({ kind: "腳手架的 script 不見了", detail: key });
      continue;
    }
    const extensible = side === "fork" && EXTENSIBLE_SCRIPTS.has(key);
    if (extensible ? now.includes(value) : now === value) continue;
    problems.push({
      kind: "腳手架的 script 被改了",
      detail: extensible ? `${key}（可以往後接，但上游那一串要原樣在裡面）` : key,
    });
  }
  if (side === "upstream") {
    for (const key of current.scripts.keys()) {
      if (!recorded.scripts.has(key)) problems.push({ kind: "章裡沒有這條 script", detail: key });
    }
  }
  return problems;
}

export function compareStamp(recorded: Stamp, current: Stamp, side: Side): Problem[] {
  return [
    ...selfCheck(recorded),
    ...compareFiles(recorded, current, side),
    ...compareScripts(recorded, current, side),
  ];
}
