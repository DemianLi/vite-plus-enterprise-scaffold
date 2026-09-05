import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
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
