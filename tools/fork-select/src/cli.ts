#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { parseFlags, repoRoot } from "@org/gate-kit";

import { FORK_MARKER, SELECTABLE, isSelectable, sideOf, targetScript } from "./select.ts";

/**
 * `vpr gate`／`vpr ready` 的選擇器（C217 §四）。
 *
 * 用法：
 *   node tools/fork-select/src/cli.ts --script gate
 *   node tools/fork-select/src/cli.ts --script ready
 *
 * 沒有 `.scaffold-fork` 跑 `<script>:upstream`，有就跑 `<script>:fork`。
 *
 * ⚠️ **它轉交給 `vp run <那一條>`，不自己用 shell 執行那一串指令。** 理由是快取：
 * `vp run` 把 `&&` 串起來的每一段拆成各自快取的子任務，而 `gate:upstream` 必須
 * 與 C217 之前的 `scripts.gate` 行為逐一相同（C217 §七）—— 自己跑那一串，
 * 快取的單位就變了。
 *
 * ⚠️⚠️ **它必須跑在一個不被快取追蹤的行程裡**，所以 `scripts.gate` 是
 * `vp run --no-cache gate:select`，不是直接叫這支（C218）。被追蹤的行程裡，巢狀的
 * `vp` 只要必須真的執行就開不起子行程（`os error 22`）—— 而 cache hit 的時候它只重播、
 * 不開行程，所以這個錯只在「有東西改過」的那一趟出現。
 *
 * ⚠️ **只在本機。** 兩個 workflow 仍然一步一格直接呼叫每支 CLI，辨別子由每個
 * workflow 裡的一步讀（C217 §四 最後一段）。
 *
 * ⚠️ 開頭那一行判定會印出來：「跑了哪一條」是這支唯一的產出，而它選錯的樣子
 * （上游只跑了 5 道）在其餘的輸出裡看起來就是全綠。
 */
const FLAGS = parseFlags(process.argv.slice(2), {
  script: { kind: "value", noun: "script 名" },
} as const);
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

const name = FLAGS.flags.script;
if (name === undefined || !isSelectable(name)) {
  console.error(
    `✗ --script 要是 ${SELECTABLE.join("／")} 其中之一，收到的是 ${name === undefined ? "（沒給）" : `「${name}」`}。\n` +
      "  選擇器只接得起有 `<名字>:upstream` 與 `<名字>:fork` 兩條的 script（C217 §四）。",
  );
  process.exit(1);
}

const root = repoRoot();
const side = sideOf(root);
const target = targetScript(name, side);
console.log(
  side === "fork"
    ? `▶ fork（${FORK_MARKER} 存在）→ vp run ${target}`
    : `▶ 上游（沒有 ${FORK_MARKER}）→ vp run ${target}`,
);

const result = spawnSync(join(root, "node_modules", ".bin", "vp"), ["run", target], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
