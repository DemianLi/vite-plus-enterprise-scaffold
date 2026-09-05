#!/usr/bin/env node
import { resolve } from "node:path";

import { parseFlags, repoRoot } from "@org/gate-kit";

import { readGit } from "./git.ts";
import { fixtures, format, report } from "./report.ts";

/**
 * 距上一個 tag 幾支、幾天。
 *
 * 用法：
 *   node tools/release-distance/src/cli.ts             量這棵樹
 *   node tools/release-distance/src/cli.ts --root <p>  量另一個 git 工作樹
 *
 * ⚠️ **它永遠回傳 0。** 沒有門檻、不判定、不擋任何 PR —— 規格見 `src/report.ts`
 * 檔頭（C169 §一）。它接在 `scripts.ready` 的最後一步而**不在** `scripts.gate` 上：
 * 一支不會失敗的東西放進閘門鏈，會讓「閘門」這個詞在這棵樹上少掉一半意思，
 * 而它在名冊裡的位置是 `UNGATED`（`tools/gate-roster/src/gates.ts`）。
 *
 * ⚠️ 唯一的非零是**不認得的旗標**（C126）—— 那是呼叫方式錯了，不是對樹的判定。
 * 這一條由 `tools/gate-kit/tests/adoption.test.ts` 守著。
 *
 * ⚠️ **而它在 `ready` 裡的形式是 `vp run release-distance`，一個根 `vite.config.ts`
 * 的 task** —— 理由是快取（C171 §九）：`&&` 串起來的每一段各自快取，而這支的輸入
 * 是 git 的 ref，自動追蹤看不到，寫成 script 會在第一趟之後永遠 cache hit。
 * 於是它的路徑不再出現在那兩個 script 的字串裡，上面那份名冊因此多讀了一處。
 */
const FLAGS = parseFlags(process.argv.slice(2), {
  root: { kind: "value", noun: "目錄" },
} as const);
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

const TARGET = FLAGS.flags.root === undefined ? repoRoot() : resolve(FLAGS.flags.root);
const facts = readGit(TARGET);

const broken = fixtures(facts, TARGET);
if (broken === undefined) {
  console.log(format(report(facts)));
} else {
  // ⚠️ 夾具壞了也**不紅**。這支的規格是不會失敗，而一個「量測台壞了就變紅」的
  // 例外，會讓它在淺 checkout 之類的環境裡變成一道沒人打算加的閘門。
  // 代價是這行訊息只能靠人讀 —— 寫成 stderr 是為了讓它在一堆綠燈裡跳出來。
  console.error(`⚠️ 距上一個 tag：這一行不可信 —— ${broken}`);
}
console.log("  ⚠️ 這一行沒有門檻，不會紅（C169 §一）—— 它報數，什麼時候發版仍然由人決定。");
