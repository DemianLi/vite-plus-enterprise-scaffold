import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
 * ── ⚠️ 事實來源是兩個 script，不是一個 ─────────────────────────────
 *
 * `tools/spec-report` **不在** `scripts.gate` 上 —— 它是 `scripts.ready`
 * 的最後一步（也是 `tier1-quality.yml` 裡那一行）。而它正是讓 C125 成立的
 * 那一支：`--chec` 打錯一個字母會讓它把報表覆寫成當下現況然後回綠。
 *
 * ⚠️ 只讀 `scripts.gate` 的名冊會漏掉它，而那正是 C118 §二 的教訓反過來
 * 打在自己身上：**閘門鏈的成員資格，對「會不會被執行」既不必要也不充分。**
 * 下面第一條斷言守的就是這件事。
 *
 * ── ⚠️ `eslint` 不在名冊裡 ──────────────────────────────────────────
 *
 * 它是第三方 CLI，旗標解析不歸這條線管。名冊只收 `node tools/<某支>/src/cli.ts` 這個形狀。
 */

const ROOT = repoRoot();

/** 從 `scripts.gate` ＋ `scripts.ready` 推導出這條線上自己寫的 CLI。 */
function trackedClis(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const chain = `${pkg.scripts?.gate ?? ""} ${pkg.scripts?.ready ?? ""}`;
  return [...new Set(chain.match(/tools\/[a-z-]+\/src\/cli\.ts/gu) ?? [])].sort();
}

const CLIS = trackedClis();

/** 一個絕對不會有人真的想用的旗標。 */
const NONSENSE = "--definitely-not-a-real-flag";

describe("不認得的旗標一律失敗 —— 這條線上每一支 CLI", () => {
  it("★ 名冊是推導出來的，而且抓得到不在 scripts.gate 上的那一支", () => {
    expect(CLIS.length, "名冊是空的 —— 那樣下面每一條都會「通過」").toBeGreaterThan(0);
    // ⚠️ 這一條不是湊數：只讀 `scripts.gate` 的話，讓整則裁決成立的那一支
    // 會不在名冊裡，而下面的 it.each 會全綠。
    expect(CLIS, "spec-report 不在名冊裡 —— 事實來源被改回只讀 scripts.gate 了").toContain(
      "tools/spec-report/src/cli.ts",
    );
  });

  it.each(CLIS)("%s 收到不認得的旗標必須非零", (cli) => {
    const result = runCli(cli, [NONSENSE]);
    const output = result.output;

    expect(result.status, `這一支靜靜地跑完了一趟：\n${output}`).not.toBe(0);
    // ⚠️ 非零還不夠 —— 它可能是**別的原因**紅的（掃不到東西、路徑不存在）。
    // 訊息要說得出是旗標的問題，否則 CI 上讀到紅燈的人會去修錯的東西。
    expect(output, "紅了，但沒說是旗標的問題").toContain(NONSENSE);
  });
});
