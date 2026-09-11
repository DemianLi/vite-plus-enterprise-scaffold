#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FORK_MARKER, sideOf } from "@org/fork-select";
import { parseFlags, repoRoot } from "@org/gate-kit";

import { checkEffective, type ScaffoldHalf } from "./effective.ts";
import {
  STAMP_FILE,
  compareStamp,
  currentStamp,
  formatStamp,
  isProtected,
  parseStamp,
  trackedFiles,
  type Problem,
} from "./stamp.ts";

/**
 * 腳手架的章（C220，實作 C215 §六）。
 *
 * 用法：
 *   node tools/scaffold-stamp/src/cli.ts            # 驗（gate 鏈上那一道，`vpr scaffold-stamp`）
 *   node tools/scaffold-stamp/src/cli.ts --update   # 上游重算章（`vpr scaffold-stamp-update`）
 *   … --root <目錄>                                 # 驗另一棵樹
 *
 * ⚠️ fork 不得蓋章（C215 §六）。這裡擋得住工具，擋不住手改章檔、也擋不住還沒放標記的
 * 第一天 —— 那是偵測不是防止，真正的守衛是 CODEOWNERS 與讀 diff 的人（C220 §六）。
 */
const FLAGS = parseFlags(process.argv.slice(2), {
  update: { kind: "boolean" },
  root: { kind: "value", noun: "目錄" },
} as const);
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

const root = FLAGS.flags.root === undefined ? repoRoot() : resolve(FLAGS.flags.root);
const side = sideOf(root);
const tracked = trackedFiles(root);
const current = currentStamp(root, tracked);

if (FLAGS.flags.update) {
  if (side === "fork") {
    console.error(
      `✗ 這是 fork（${FORK_MARKER} 存在），fork 不得蓋章（C215 §六）。\n` +
        "  章是上游對「腳手架長什麼樣子」的陳述；在這裡重算，等於把你們的改動宣告成腳手架的。\n" +
        "  要改腳手架的檔，向上游提；合併上游時章會跟著進來。",
    );
    process.exit(1);
  }
  writeFileSync(join(root, STAMP_FILE), formatStamp(current));
  console.log(
    `✓ 章已重算（${current.files.size} 個檔、${current.scripts.size} 條 script）—— 與這次的改動進同一個 PR`,
  );
  process.exit(0);
}

function stampProblems(): Problem[] {
  const path = join(root, STAMP_FILE);
  if (!existsSync(path)) return [{ kind: "沒有章", detail: `${STAMP_FILE} 不存在` }];
  try {
    return compareStamp(parseStamp(readFileSync(path, "utf8")), current, side);
  } catch (cause) {
    return [{ kind: "章壞了", detail: String(cause) }];
  }
}

/** 同 `threshold-check` 的 `probe.ts`：輸出走哪一條串流是上游的事，兩條都收。 */
function printConfig(): unknown {
  const local = join(root, "node_modules", ".bin", "vp");
  const result = spawnSync(existsSync(local) ? local : "vp", ["lint", "--print-config"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const text = stdout.trim().length > 0 ? stdout : (result.stderr ?? "");
  const at = text.indexOf("{");
  if (at === -1) throw new Error(`vp lint --print-config 沒有給出 JSON（${root}）`);
  return JSON.parse(text.slice(at)) as unknown;
}

async function effectiveProblems(): Promise<Problem[]> {
  try {
    const scaffold = (await import(pathToFileURL(join(root, "vite.scaffold.ts")).href)) as {
      scaffoldLint: ScaffoldHalf["lint"];
      scaffoldOverrides: ScaffoldHalf["overrides"];
    };
    const half = { lint: scaffold.scaffoldLint, overrides: scaffold.scaffoldOverrides };
    return checkEffective(half, printConfig(), tracked.filter(isProtected));
  } catch (cause) {
    return [{ kind: "量不到生效設定", detail: String(cause) }];
  }
}

const problems = [...stampProblems(), ...(await effectiveProblems())];
const where = side === "fork" ? "fork" : "上游";

if (problems.length === 0) {
  console.log(
    `✓ 腳手架的章相符（${where}：${current.files.size} 個檔、${current.scripts.size} 條 script；` +
      "生效設定與 vite.scaffold.ts 一致）",
  );
  process.exit(0);
}

console.error(`✗ 腳手架的章對不上（${where}，${problems.length} 處）：`);
for (const problem of problems) console.error(`  · ${problem.kind}：${problem.detail}`);
console.error(
  side === "fork"
    ? `\n  這是 fork（${FORK_MARKER} 存在）。上面那些是腳手架的，不是你們的 —— 還原它們；\n` +
        "  要改腳手架，向上游提，升級時合併上游、章跟著進來（C220）。\n" +
        "  ⚠️ AGENTS.md 規則二：不得為了綠燈改設定 —— 生效設定那幾格就是那一條的機械邊界。\n" +
        "  團隊自己的工具放在 tools/ 以外的目錄（HANDOFF〈團隊自己的工具〉）。"
    : "\n  這是上游。改了腳手架的檔或 script，就重算章、與改動進同一個 PR：\n" +
        "    vpr scaffold-stamp-update\n" +
        "  ⚠️ 生效設定那幾格重算章修不掉 —— 那是根層 vite.config.ts 蓋掉了 vite.scaffold.ts，改那一支。",
);
process.exit(1);
