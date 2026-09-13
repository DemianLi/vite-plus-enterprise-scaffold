#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { parseFlags, repoRoot } from "@org/gate-kit";

import { drill } from "./drill.ts";
import { plan, pruneLockfile, readExport, type Step, write } from "./export.ts";
import { formatScan, scan, traceRules, verdict } from "./scan.ts";

/**
 * 交付給機關的匯出（C231）：產出一個沒有 `.git` 的目錄，只含可建置的業務原始碼。
 *
 * 用法：
 *   node tools/delivery-export/src/cli.ts                    匯出到一個新的暫存目錄
 *   node tools/delivery-export/src/cli.ts --out <目錄>       匯出到指定目錄（必須還不存在、在 repo 外）
 *   node tools/delivery-export/src/cli.ts --fail-on-trace    痕跡掃描有命中就失敗、不留產物
 *
 * ⚠️ 今天的預設是**掃描只報數**：C231 §六 ① 寫明掃描今天必紅，② ③ 清完之後由 ④ 改成判定並接線。
 * 它因此登記在 `UNGATED`，不在閘門鏈上。
 *
 * ⚠️ 產物一律在 repo 外：repo 內的副本會被 `threshold-check` 之類讀磁碟的閘門掃到而間歇紅，
 * 也會以「未追蹤且未 ignore」的身分出現在 `git status`（#282）。
 */
const FLAGS = parseFlags(process.argv.slice(2), {
  out: { kind: "value", noun: "目錄" },
  "fail-on-trace": { kind: "boolean" },
} as const);
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

const ROOT = repoRoot();

function outputDir(requested: string | undefined): string {
  if (requested === undefined) return mkdtempSync(join(tmpdir(), "delivery-export-"));
  const out = resolve(requested);
  const inside = relative(ROOT, out);
  if (!inside.startsWith("..") && !isAbsolute(inside)) {
    throw new Error(`--out 指到 repo 裡面（${out}）—— 產物要在 repo 外`);
  }
  if (existsSync(out)) throw new Error(`--out 已經存在（${out}）—— 不覆寫別人的目錄`);
  mkdirSync(out, { recursive: true });
  return out;
}

function report(steps: readonly Step[]): boolean {
  for (const step of steps) {
    console.log(`    ${step.ok ? "✓" : "✗"} ${step.name}`);
    if (!step.ok) console.error(step.output.split("\n").slice(-40).join("\n"));
  }
  return steps.every((step) => step.ok);
}

function main(failOnTrace: boolean, requestedOut: string | undefined): number {
  const planned = plan(ROOT);
  const out = outputDir(requestedOut);
  const fail = (message: string): number => {
    console.error(`\n${message}`);
    rmSync(out, { recursive: true, force: true });
    return 1;
  };

  const excluded = planned.members.filter((member) => !planned.exported.includes(member));
  console.log(
    `白名單：${planned.exported.length} 個 package 出門 —— ${planned.exported.map((m) => m.dir).join("、")}`,
  );
  console.log(`不出門：${excluded.map((m) => m.dir).join("、")}\n`);
  for (const [dir, deps] of planned.dropped) {
    if (deps.length > 0) console.log(`  ${dir} 拿掉測試相依：${deps.join("、")}`);
  }

  write(ROOT, planned, out);
  if (!report([pruneLockfile(out)])) return fail("✗ lockfile 剪不動 —— 匯出失敗，產物已刪除");

  const result = scan(readExport(out), traceRules(planned));
  console.log(`\n${formatScan(result)}\n`);
  const judged = verdict(result, failOnTrace);

  console.log("\n在匯出那棵樹上重跑（repo 外、離線）：");
  const apps = planned.exported
    .filter((member) => member.dir.startsWith("apps/"))
    .map((member) => member.dir);
  if (!report(drill(out, apps))) return fail("✗ 匯出那棵樹建不起來 —— 匯出失敗，產物已刪除");

  if (!judged.ok) return fail(judged.message);
  console.log(`\n${judged.message}`);
  console.log(`\n匯出目錄：${out}`);
  return 0;
}

try {
  process.exit(main(FLAGS.flags["fail-on-trace"], FLAGS.flags.out));
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
