#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTRACT_ITEMS } from "@org/bff-contract";

import {
  actionCounts,
  codeownersEntryCount,
  uiComponentCount,
  workspacePackageCount,
} from "./derive.ts";
import { FACTS, REMEDIATION, checkFacts, type DocumentSource } from "./facts.ts";

/**
 * 文件裡的數字與 repo 內部事實來源是否一致。
 *
 * 用法：
 *   node tools/doc-facts/src/cli.ts    不一致時回傳非零
 *
 * 守備範圍與它刻意不守的東西寫在 `src/facts.ts` 的檔頭。
 * 簡短版：**只守用現在式描述現況的文件**（見下方 `GUARDED`）——
 * DECISIONS.md 是有日期的決策日誌，守它等於要求回頭改寫歷史。
 *
 * ⚠️ 清單刻意不在註解裡重寫一次。這支工具的整個用途就是防「人抄下來的
 * 東西沒有人再推導一次」，而 `GUARDED` 加了第三份檔案的那一刻，
 * 四個地方寫著「只守 README 與 HANDOFF」的句子同時變成假的。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/**
 * 用現在式描述「這個系統現在是什麼樣子」的文件。理由見 facts.ts 檔頭。
 *
 *
 * 判準：**被 README 或 HANDOFF 指過去、而且用現在式寫的，就要進這份清單。**
 */
const GUARDED = ["README.md", "HANDOFF.md"];

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, relative), "utf8")) as Record<string, unknown>;
}

function deriveTruth(): Record<string, number> {
  const surface = readJson("tools/api-surface/surface.json")["surface"] as Record<
    string,
    Record<string, unknown>
  >;
  const actions = actionCounts(ROOT);

  return {
    "api-entries": Object.keys(surface).length,
    "api-exports": Object.values(surface).reduce(
      (total, entry) => total + Object.keys(entry).length,
      0,
    ),
    "contract-items": CONTRACT_ITEMS.length,
    "ui-components": uiComponentCount(ROOT),
    "workspace-packages": workspacePackageCount(ROOT),
    "action-refs": actions.refs,
    "distinct-actions": actions.distinct,
    "codeowners-entries": codeownersEntryCount(ROOT),
  };
}

function main(): number {
  const documents: DocumentSource[] = GUARDED.map((path) => ({
    path,
    source: readFileSync(join(ROOT, path), "utf8"),
  }));

  const truth = deriveTruth();
  const problems = checkFacts(documents, truth);

  if (problems.length === 0) {
    // 樣式數也印出來：HANDOFF 第 18 項刻意不寫死這兩個數字，改成叫人跑這一行。
    //
    // ⚠️ 印的是**樣式數**不是句子數，而這兩個不再相等：`packages` 有一條樣式
    // 刻意同時咬住 HANDOFF 裡兩句一樣的話（見 facts.ts 該條的註解）。
    // 原本這裡寫「N 個句子」—— 一個在講「數字要對得上來源」的工具，
    // 自己印了一個對不上的數字。
    const citations = FACTS.reduce((total, fact) => total + fact.citations.length, 0);
    console.log(
      `✓ 文件裡的數字與事實來源一致（${FACTS.length} 個事實、${citations} 個引用樣式、${documents.length} 份文件）\n` +
        // 檔名從 GUARDED 印出來，不手寫 —— 加第三份的那天，
        // 四個地方寫著「只守 README 與 HANDOFF」的句子同時變成假的。
        `  守的是：${GUARDED.join("、")}\n` +
        "  ⚠️ 刻意不守 DECISIONS.md —— 那是有日期的決策日誌，\n" +
        "     「C24 當時是 467 個套件」陳述的是歷史，守它等於要求改寫歷史。",
    );
    return 0;
  }

  console.error(`✗ 文件數字與事實來源不符：${problems.length} 項\n`);
  for (const problem of problems) console.error(`  [${problem.kind}] ${problem.detail}`);
  console.error(REMEDIATION);
  return 1;
}

process.exit(main());
