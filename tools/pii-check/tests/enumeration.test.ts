import { beforeEach, describe, expect, it } from "vitest";

import { walk } from "@org/gate-kit";
import { sandbox, type Sandbox } from "@org/gate-kit/testing";

import { inScope } from "../src/scan.ts";
import { trackedFiles } from "../src/tracked.ts";

/**
 * **一份副本躺在樹底下，這道閘門的射程不得改變**（C182 §九）。
 *
 * ── 它守的是什麼 ────────────────────────────────────────────────────
 *
 * `#282`：`.claude/worktrees/` 底下另一個 session 的工作樹是整棵樹的副本，
 * 而舊的 `walk()` 走進去了 —— 主 checkout 上射程 112 → 220，命中的每一項
 * 都是 `EXEMPT` 裡那份對照組的複本。CI 拿到乾淨 clone，所以**它永遠是綠的**。
 * 一個本機紅、CI 綠的閘門，最短的修法是把它調鬆，而那是 C41 記過的形狀。
 *
 * ── 兩條對照組，缺一不可 ────────────────────────────────────────────
 *
 * ⚠️ 只斷言「種了副本之後數字不變」的話，一支**永遠回零個檔**的實作也會通過。
 * 所以下面兩個方向都放：**已知為零** —— 拿掉副本數字一樣；**已知非零** ——
 * 種一個未追蹤的射程內檔案會 +1（那正是這道閘門最該抓的一刻：真資料還沒 commit）。
 *
 * ⚠️ 還有第三條，守的是**這個 fixture 本身**：同一個沙盒餵給舊的 `walk()`
 * 必須看得到副本裡的檔案。少了它，一個根本沒種成功的副本會讓上面全部變成
 * 在量空氣（`tripwire-must-hang-on-its-target`）。
 *
 * ── 沙盒裡刻意沒有 `.gitignore` ─────────────────────────────────────
 *
 * 真樹上鄰居被擋掉有兩道：`.gitignore:33` 的 `.claude/worktrees/`，以及
 * **git 不走進另一個 repository**。這裡刻意只留後者 —— 前者是黑名單，
 * 換個位置放就失效（C182 §五 否決 `SKIP` 加一列的理由）。所以下面種的副本
 * 一份都沒有被 ignore，而它們照樣不進射程。
 */

/** 湊出射程內的追蹤檔。`files:` 進來的在 `git add -A` 之前，所以是**追蹤中**的。 */
const TRACKED_IN_SCOPE = {
  "features/order/tests/order.test.ts": "// 乾淨\n",
  "features/invoice/tests/invoice.test.ts": "// 乾淨\n",
  "platform/bff-mock/src/server.ts": "// 乾淨\n",
} as const;

const BASELINE = Object.keys(TRACKED_IN_SCOPE).length;

function scoped(root: string): string[] {
  return trackedFiles(root).filter(inScope);
}

/** 沙盒根跑 git，帶上身分 —— CI 的 runner 沒有全域 `user.name`。 */
function git(box: Sandbox, args: readonly string[]): string {
  return box.git(["-c", "user.email=gate@example.test", "-c", "user.name=gate", ...args]);
}

describe("鄰居工作樹不進射程", () => {
  let box: Sandbox;

  beforeEach(() => {
    box = sandbox({ prefix: "pii-enumeration-", git: true, files: TRACKED_IN_SCOPE });
  });

  it("★ 已知為零的方向：沒有副本的時候就是這個數", () => {
    expect(scoped(box.root).sort()).toEqual(Object.keys(TRACKED_IN_SCOPE).sort());
  });

  it("🔴 種一個真的 git worktree 進去 —— 射程不變", () => {
    git(box, ["commit", "--quiet", "-m", "init"]);
    git(box, ["worktree", "add", "--detach", "--quiet", ".claude/worktrees/neighbor", "HEAD"]);

    expect(box.read(".claude/worktrees/neighbor/features/order/tests/order.test.ts")).toContain(
      "乾淨",
    );
    expect(scoped(box.root)).toHaveLength(BASELINE);
  });

  it("🔴 任何一份 `git init` 過的副本都一樣 —— 擋它的是 git 不進別的 repo，不是路徑清單", () => {
    // ⚠️ 落點刻意**不在** `.claude/` 底下：黑名單擋不到這裡，而這條照樣要綠。
    box.write("backup/2026-09/features/order/tests/order.test.ts", "// 副本\n");
    box.git(["-C", "backup/2026-09", "init", "--quiet"]);

    expect(scoped(box.root)).toHaveLength(BASELINE);
  });

  it("★ 已知非零的方向：未追蹤的射程內檔案會被看見 —— 真資料還沒 commit 的那一刻", () => {
    box.write("features/shipment/tests/leak.test.ts", "// 還沒 git add\n");

    expect(scoped(box.root)).toHaveLength(BASELINE + 1);
    expect(scoped(box.root)).toContain("features/shipment/tests/leak.test.ts");
  });

  it("★ 對照組：同一個沙盒餵給 `walk()`，副本裡的檔案看得見 —— 否則上面在量空氣", () => {
    git(box, ["commit", "--quiet", "-m", "init"]);
    git(box, ["worktree", "add", "--detach", "--quiet", ".claude/worktrees/neighbor", "HEAD"]);

    const walked = walk(box.root, { skip: ["node_modules", ".git"], extensions: [".ts"] }).filter(
      inScope,
    );

    expect(walked.length).toBeGreaterThan(BASELINE);
    expect(walked).toContain(".claude/worktrees/neighbor/features/order/tests/order.test.ts");
  });
});
