#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FACTS, checkFacts, handoffItemCount, type DocumentSource } from "./facts.ts";

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
 * ⚠️ `UI-SURVEY.md` 是 2026-08-16 補的。它原本不在這裡，而 README 與
 * HANDOFF 第 14 項都直接把讀者指過去（「完整的三方比較留在 UI-SURVEY.md」）——
 * 也就是說它是審查者**會打開**的一份，卻是唯一一份沒有被守的。
 * 補的當下它就有一句過期的（467 套件／121 原生二進位，實際 563／144）。
 *
 * 判準：**被 README 或 HANDOFF 指過去、而且用現在式寫的，就要進這份清單。**
 */
const GUARDED = ["README.md", "HANDOFF.md", "UI-SURVEY.md"];

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, relative), "utf8")) as Record<string, unknown>;
}

function deriveTruth(handoff: string): Record<string, number> {
  const inventory = readJson("tools/supply-chain/inventory.json");
  const provenance = readJson("tools/supply-chain/provenance.json");
  const inventoryTotals = inventory["totals"] as Record<string, number>;
  const provenanceTotals = provenance["totals"] as Record<string, number>;

  return {
    packages: inventoryTotals["packages"] as number,
    native: inventoryTotals["native"] as number,
    families: inventoryTotals["families"] as number,
    "no-slsa": provenanceTotals["registry-signature"] as number,
    slsa: provenanceTotals["slsa-provenance"] as number,
    "handoff-items": handoffItemCount(handoff),
  };
}

function main(): number {
  const documents: DocumentSource[] = GUARDED.map((path) => ({
    path,
    source: readFileSync(join(ROOT, path), "utf8"),
  }));

  const handoff = documents.find((document) => document.path === "HANDOFF.md")?.source ?? "";
  const truth = deriveTruth(handoff);
  const problems = checkFacts(documents, truth);

  if (problems.length === 0) {
    // 句子數也印出來：HANDOFF 第 18 項刻意不寫死這兩個數字，改成叫人跑這一行。
    const citations = FACTS.reduce((total, fact) => total + fact.citations.length, 0);
    console.log(
      `✓ 文件裡的數字與事實來源一致（${FACTS.length} 個事實、${citations} 個句子、${documents.length} 份文件）\n` +
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
  console.error(
    "\n  這些數字是拿去跟採購與資安講的話。每次相依變動它們就會變，\n" +
      "  而這個 repo 在「人抄下來的數字沒有人再推導一次」上一再栽跟頭。\n" +
      "  請把上列位置改成推導出來的值；句子被改寫的話，同步更新 src/facts.ts 的樣式。",
  );
  return 1;
}

process.exit(main());
