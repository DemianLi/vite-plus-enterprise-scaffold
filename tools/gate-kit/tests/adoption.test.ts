import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot, runCli } from "../src/testing.ts";

/**
 * **這個 module 有沒有真的被用上。**
 *
 * ── 為什麼「四支接上了」不夠 ────────────────────────────────────────
 *
 * C125 判的是「不做子集」，理由是先改一部分會長成 C118 那句「守到一條，
 * 還差四條」的第二個版本 —— 一個做完的子集、一個沒有追蹤處的餘數。
 * 而**一條只守四支的絆線，與沒有絆線，在第九支加進來的那天長得一模一樣**。
 *
 * 所以名冊是**推導出來的**，不是寫死的清單（`tripwire-must-hang-on-its-target`：
 * 斷言吃的資料要從被守的東西取）。
 *
 * ── 名冊是磁碟上的 `tools/<某支>/src/cli.ts`，不是執行路徑（C178）────────
 *
 * 這份名冊曾經從 `scripts.gate` ＋ `scripts.ready` ＋ 根 `vite.config.ts` 的
 * **文字**推導 —— 問的是「哪幾支 CLI 出現在執行路徑上」。那個問法每多一種
 * 接線形狀就要多讀一處（`spec-report` 只在 `ready`、`release-distance` 只在
 * `vite.config.ts` 的 task），而 `UNGATED` 裡帶 CLI 的兩支（`csp-verify`、
 * `ui-survey`）**永遠不在任何執行路徑上**，於是永遠在絆線外，兩支檔頭各自
 * 寫著「這幾行沒有東西在守」。
 *
 * 檔頭那句主張是「這條線上**每一支** CLI」。每一支就是磁碟上每一支：
 * `gate-roster` 的 ① 守著「`tools/*` 每一個目錄都登記在 `GATES ∪ UNGATED`」，
 * 所以磁碟清單與名冊等價，而且不用 import `gate-roster`（它相依本 package，
 * 反向再加一條是循環）。
 *
 * ── ⚠️ `eslint` 不在名冊裡 ──────────────────────────────────────────
 *
 * 它是第三方 CLI，旗標解析不歸這條線管。名冊只收 `tools/<某支>/src/cli.ts` 這個形狀。
 * `promise-check/tests/fixtures/…/src/cli.ts` 那種 fixture 也不收：它不在 `tools/<某支>/`
 * 的第一層。
 */

const ROOT = repoRoot();

/** 磁碟上每一支 `tools/<某支>/src/cli.ts`。 */
function trackedClis(): string[] {
  return readdirSync(join(ROOT, "tools"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `tools/${entry.name}/src/cli.ts`)
    .filter((cli) => existsSync(join(ROOT, cli)))
    .sort();
}

const CLIS = trackedClis();

/** 一個絕對不會有人真的想用的旗標。 */
const NONSENSE = "--definitely-not-a-real-flag";

describe("不認得的旗標一律失敗 —— 這條線上每一支 CLI", () => {
  it("★ 名冊是推導出來的，而且抓得到不在任何執行路徑上的那一支", () => {
    expect(CLIS.length, "名冊是空的 —— 那樣下面每一條都會「通過」").toBeGreaterThan(0);
    // ⚠️ 這一條不是湊數：名冊改回從執行路徑推導的話，`UNGATED` 裡帶 CLI 的
    // 那兩支會安靜地掉出去，而下面的 it.each 照樣全綠。
    expect(CLIS, "csp-verify 不在名冊裡 —— 名冊被改回只讀執行路徑了").toContain(
      "tools/csp-verify/src/cli.ts",
    );
  });

  it.each(CLIS)("%s 收到不認得的旗標必須非零", (cli) => {
    const result = runCli(cli, [NONSENSE]);
    const output = result.output;

    expect(result.status, `這一支靜靜地跑完了一趟：\n${output}`).not.toBe(0);
    // ⚠️ 非零還不夠 —— 它可能是**別的原因**紅的（掃不到東西、路徑不存在）。
    // 訊息要說得出是旗標的問題，否則 CI 上讀到紅燈的人會去修錯的東西。
    expect(output, "紅了，但沒說是旗標的問題").toContain(NONSENSE);
    // ⚠️ 而且要說得出**為什麼這會紅**：讀到這條訊息的人多半正在 CI 上看紅燈，
    // 少了原因，最短的修法是把旗標加回 spec —— 那正好是錯的方向。這句話住在
    // `parseFlags` 裡，這裡守的是每一支都**原樣轉出**它，而不是印自己的一句
    //（C178：`pii-check` 曾經獨自守這件事，而那是每一支的事）。
    expect(output, "紅了，但沒說為什麼會紅").toContain("會紅是刻意的");
  });
});

/**
 * 只讀一次 `process.argv`（C180）。
 *
 * C126 接線的形狀是把 `parseFlags` 擋在前面、舊的手讀段留著：五支 CLI 拿到
 * `FLAGS` 之後一次都沒讀，自己再掃一次 `process.argv` 取值。後果兩個，都安靜：
 * 把 `--file` 的 kind 改成 `boolean` 零紅（C178 §六 M4／M7）、重複給同一個旗標時
 * 手讀取第一個而 `parseFlags` 取最後一個（C180 §二 D1）。
 *
 * 這條守的是形狀：每支 `cli.ts` 的程式碼裡 `process.argv` **恰好一次** —— 就是交給
 * `parseFlags` 那一次。它抓不到「抓一次 argv 再自己 `indexOf`」那種形，所以下面
 * 還有一條：對旗標字面做 `indexOf`／`includes`／`lastIndexOf`／`startsWith` 的
 * 呼叫零次。C180 時 `spec-report`／`promise-check` 為可重複旗標刻意留著那種形，
 * `parseFlags` 有了 `list` kind 之後（C181）它們是最後兩處，現在零例外。
 */
describe("`process.argv` 每支 cli.ts 只讀一次 —— 值從 parseFlags 來", () => {
  it("對照組：註解裡的不算，手讀 argv 的形狀算兩次", () => {
    expect(argvReads("/** process.argv */\nconst x = parseFlags(process.argv.slice(2), {});")).toBe(
      1,
    );
    expect(argvReads("// process.argv\nconst x = parseFlags(process.argv.slice(2), {});")).toBe(1);
    expect(
      argvReads('parseFlags(process.argv.slice(2), {});\nif (process.argv.includes("--full")) {}'),
    ).toBe(2);
  });

  it("★ 沒有一支多讀或少讀", () => {
    const offenders = CLIS.map((cli) => ({
      cli,
      reads: argvReads(readFileSync(join(ROOT, cli), "utf8")),
    })).filter(({ reads }) => reads !== 1);
    // 少讀（0）也要紅：那表示註解剝除吃掉了程式碼，這條絆線在量空氣。
    expect(offenders, "有 CLI 在 parseFlags 之外自己讀 process.argv").toEqual([]);
  });

  it("對照組：argv 對旗標字面的方法呼叫算；USAGE 字串、YAML 行、CSS 名字都不算", () => {
    expect(handParses('const i = argv.indexOf("--spec");')).toBe(1);
    expect(handParses("if (ARGV.includes('--full')) {}")).toBe(1);
    expect(handParses("for (let i = argv.indexOf(name); i >= 0; ) {}")).toBe(1);
    expect(handParses("main(process.argv.slice(2))")).toBe(0);
    expect(handParses("const USAGE = `  --report <path>  報表檔位置`;")).toBe(0);
    expect(handParses('// argv.indexOf("--spec")')).toBe(0);
    // 第一版 pattern 不看接收者，這兩句（`supply-chain` 掃 workflow、`theme-verify`
    // 判 CSS 自訂屬性）當場誤報 —— 它們比對的字串來自檔案，不是 argv。
    expect(handParses('line.includes("--frozen-lockfile")')).toBe(0);
    expect(handParses('utility.startsWith("--") ? null : x')).toBe(0);
  });

  it("★ 沒有一支自己對旗標字面做比對 —— 可重複的也走 parseFlags", () => {
    const offenders = CLIS.map((cli) => ({
      cli,
      handParses: handParses(readFileSync(join(ROOT, cli), "utf8")),
    })).filter(({ handParses }) => handParses !== 0);
    expect(offenders, "有 CLI 在 parseFlags 之外自己比對旗標字面").toEqual([]);
  });
});

/** 剝掉區塊註解與整行 `//` 之後，`process.argv` 出現幾次。 */
function argvReads(source: string): number {
  return stripComments(source).match(/process\.argv/g)?.length ?? 0;
}

/**
 * 剝掉註解之後，`argv.indexOf(…)` 這一類「自己在 argv 裡找東西」的呼叫出現幾次。
 *
 * 接收者限定 argv 的慣用別名：上一條絆線已經保證 `process.argv` 只出現一次，
 * 所以手讀只能經由它綁定的那個名字。C180 之前五支的手讀接收者是 `argv`／`args`／
 * `process.argv`／`ARGV` 四種（`\b` 讓 `process.argv.` 也算），沒有第五種。
 * ⚠️ 不要求引數是 `"--…"` 字面：`promise-check` 的 `parseRepeated(argv, name)` 寫的是
 * `argv.indexOf(name)`，要字面的版本對它回 0（C181 §四 實測）。
 */
function handParses(source: string): number {
  return (
    stripComments(source).match(
      /\b(?:argv|args|ARGV|ARGS)\.(?:indexOf|lastIndexOf|includes|startsWith|find|some)\(/g,
    )?.length ?? 0
  );
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
