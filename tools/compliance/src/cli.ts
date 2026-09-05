#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTROLS, FUTURE, GATES, REGULATION } from "./map.ts";
import { blockingGates, owedGaps, render, unprovenGates } from "./render.ts";
import { verifyMap } from "./verify.ts";
import { RETENTION_EVIDENCE, renderEvidenceManifest, verifyEvidence } from "./evidence.ts";
import { CRITERIA, preFilterRules, verifyCriteria } from "./a11y.ts";
import { renderAccessibility } from "./a11y-render.ts";
import { parseFlags } from "@org/gate-kit";

/**
 * 法遵對照表：產生、並在每次 CI 驗它沒有說謊。
 *
 * ── 這支工具擋的是什麼 ──────────────────────────────────────────────
 *
 * 一份手寫的法遵對照表，在第一次改動閘門之後就開始騙人，而且**騙的方向
 * 永遠是樂觀的** —— 沒有人會在刪掉一支測試之後，順手把對照表那一列改成
 * 「未證明」。於是交到稽核桌上的那份文件，宣稱的覆蓋率高於實際。
 *
 * 所以這裡做的是雙向檢查：
 *
 *   宣告有反向測試 → 檔案必須存在（否則表在**高估**自己，這是危險的方向）
 *   宣告沒有       → 慣例路徑必須**不**存在（否則表在低估自己，也是漂移）
 *
 * 第二個方向看起來多餘，但它是這張表能長期為真的原因：少了它，有人補了
 * 反向測試卻沒更新映射，表上就永遠掛著一個假的洞 —— 而假的洞會讓真的洞
 * 失去意義（「反正那幾格本來就是紅的」）。
 *
 * ── 為什麼第四欄允許是空的 ──────────────────────────────────────────
 *
 * 這張表第一次產出來的時候，11 道閘門裡有 8 道沒有反向測試。
 * 把那 8 格藏起來、或等補完再產表，都會失去這張表最大的用處：
 * **先知道洞在哪裡，才排得出補的順序。** 空的一格是誠實的，
 * 假的一列不是。
 *
 * ── 為什麼產出要過一次 formatter ────────────────────────────────────
 *
 * `vp fmt` 會重排 markdown 表格的欄寬。自己算欄寬等於在專案裡養第二個
 * formatter，而它遲早與真的那個分歧 —— `tools/api-surface` 就是這樣產出
 * 一份過不了 `vp check` 的基準線（`JSON.stringify` 展開陣列、oxfmt 收合）。
 * 所以這裡把 formatter 當權威：產完丟給它，比對的也是它的輸出。
 */

/**
 * ⚠️ **不認得的旗標一律紅**（C126／C133 §五）。這幾行不是驗證輸入，是**擋一種
 * 綠燈**：被拿掉的旗標留在 CI 裡而被靜靜忽略時，那一步會頂著它原本的名字回綠
 * —— C52 的 `--masking` 就是那樣活了下來（完整量測在 C125 §一）。
 *
 * ⚠️ **spec 漏掉一個真旗標，合併當天 CI 就紅** —— 「不認得就失敗」對還沒登記的
 * 真旗標一視同仁。三個來源要一起掃：根 `package.json` 的 `scripts`、
 * `.github/workflows/*.yml`（⚠️ **含排程那兩個**，它們不在 `gate`／`ready` 上，
 * `gate-kit` 的名冊測試看不見它們）、以及這支工具自己的 `tests/`。
 */
const PARSED = parseFlags(process.argv.slice(2), {
  file: { kind: "value", noun: "路徑" },
  evidence: { kind: "boolean" },
  update: { kind: "boolean" },
} as const);
if (!PARSED.ok) {
  console.error(PARSED.message);
  process.exit(1);
}
/** ⚠️ 收窄要在頂層做一次：`process.exit` 的 `never` 不會把 `PARSED` 的型別帶進函式體。 */
const FLAGS = PARSED.flags;

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const DEFAULT_BASELINE = join(ROOT, "tools/compliance/COMPLIANCE.md");

/**
 * 要比對的檔案。`--file <path>` 可以指到別處。
 *
 * 這個參數存在的唯一理由是讓這支工具能被反向測試：把產出的表複製到暫存
 * 目錄、改掉一個字，再讓 CLI 去驗那一份 —— repo 的 COMPLIANCE.md 不被動到。
 * 與 `tools/conformance` 的 `--root` 同一個取捨，只是範圍更窄：
 * 映射的檔案存在性檢查仍然對**真的** repo 跑，因為那份映射描述的就是這個 repo。
 *
 * ⚠️ 值從 `FLAGS` 來，不再自己掃 argv（C180）。C126 接線時 `parseFlags` 只被
 * 擋在前面、舊的 `indexOf("--file")` 留著，於是同一個 argv 在同一個行程裡有兩個
 * 答案（重複給 `--file` 時手讀取第一個、`parseFlags` 取最後一個），而沒人讀
 * `FLAGS` 所以看不見。缺值那道檢查也一起拆：`parseFlags` 先紅，它到不了。
 */
const BASELINE = FLAGS.file === undefined ? DEFAULT_BASELINE : resolve(FLAGS.file);

/** 產出並交給 `vp fmt`。回傳 formatter 的輸出，那才是要比對的東西。 */
function formatted(markdown: string, name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "compliance-render-"));
  const path = join(dir, name);

  try {
    writeFileSync(path, markdown);

    const vp = join(ROOT, "node_modules/.bin/vp");
    const result = spawnSync(existsSync(vp) ? vp : "vp", ["fmt", path], {
      cwd: ROOT,
      encoding: "utf8",
    });

    if (result.status !== 0) {
      console.error("✗ 產出的 markdown 過不了 vp fmt");
      console.error(`${result.stdout ?? ""}${result.stderr ?? ""}`);
      process.exit(1);
    }

    return readFileSync(path, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function renderFormatted(): string {
  return formatted(
    render({ regulation: REGULATION, gates: GATES, controls: CONTROLS, future: FUTURE }),
    "COMPLIANCE.md",
  );
}

/**
 * 無障礙那一份（HANDOFF #22／C69）。
 *
 * 刻意是**另一個檔案**而不是 COMPLIANCE.md 的一節：兩套規範的判定者、
 * 流程、交付產出都不同，理由寫在 `a11y.ts` 的檔頭。
 */
function renderAccessibilityFormatted(): string {
  return formatted(
    renderAccessibility({ criteria: CRITERIA, rules: preFilterRules() }),
    "ACCESSIBILITY.md",
  );
}

function summarise(): void {
  const gaps = owedGaps(CONTROLS);
  const unproven = unprovenGates(GATES);
  console.log(
    `  欠、且沒有東西在守的條號 ${gaps.length}／${CONTROLS.length}、` +
      `未證明會紅的閘門 ${unproven.length}／${blockingGates(GATES).length}`,
  );
}

function reportMapErrors(): number {
  const errors = verifyMap(GATES, CONTROLS, (path) => existsSync(join(ROOT, path)));
  if (errors.length === 0) return 0;

  console.error("\n✗ 法遵映射與檔案系統對不上\n");
  for (const error of errors) console.error(`  ✗ ${error}`);
  console.error(
    "\n  這張表是拿去回答「你怎麼知道這個檢查真的有在檢查」的。\n" +
      "  映射一旦與實際檔案分歧，它回答的就是別的 repo 的狀況。\n" +
      "  事實來源：tools/compliance/src/map.ts\n",
  );
  return 1;
}

function main(): number {
  // ── §16 證據清單 ──────────────────────────────────────────────────
  if (FLAGS.evidence) {
    const problems = verifyEvidence(RETENTION_EVIDENCE, (path) => existsSync(join(ROOT, path)));
    if (problems.length > 0) {
      console.error(`✗ §16 證據清單與現實不符：${problems.length} 項\n`);
      for (const problem of problems) console.error(`  [${problem.kind}] ${problem.detail}`);
      return 1;
    }

    console.log(renderEvidenceManifest(RETENTION_EVIDENCE));
    console.log(
      "\n⚠️ §16 要求業者保存五年的有三類，這份清單只涵蓋第三類" +
        "（落實執行安全維護計畫之證據）。\n" +
        "   個資的蒐集處理利用紀錄與自動化機器設備的軌跡資料在後端與基礎設施，" +
        "前端碰不到。\n\n" +
        "⚠️ sbom.cdx.json 是 CI artifact，GitHub 上限 90 天 —— **結構上到不了五年**。\n" +
        "   要滿足 §16 只有兩條路，兩條都是組織的決定：進版控，" +
        "或由組織的保存系統定期取走。\n\n" +
        "⚠️ 版控的那幾份跟著 repo 走。repo 被刪或歷史被重寫，證據就沒了 ——" +
        "那也是組織要接的風險。",
    );
    return 0;
  }

  const a11yBaseline = join(ROOT, "tools/compliance/ACCESSIBILITY.md");

  // 無障礙那張表的自我檢查：宣稱有閘門守 → 那個閘門必須真的存在。
  const knownGateIds = new Set(GATES.map((gate) => gate.id));
  const a11yProblems = verifyCriteria(CRITERIA, knownGateIds);
  if (a11yProblems.length > 0) {
    console.error("\n✗ 無障礙分工表與映射對不上\n");
    for (const problem of a11yProblems) console.error(`  ✗ [${problem.kind}] ${problem.detail}`);
    console.error("\n  事實來源：tools/compliance/src/a11y.ts\n");
    return 1;
  }

  // ── --update 先寫再驗，順序是刻意的 ────────────────────────────────
  //
  // COMPLIANCE.md 自己就是 `compliance` 這道閘門宣告的證據檔。在寫出來
  // 之前驗它，等於要求它先於自己存在 —— 第一次產生就永遠卡住。
  // 驗證模式沒有這個問題，所以那一側維持先驗後比。
  if (FLAGS.update) {
    writeFileSync(BASELINE, renderFormatted());
    console.log(`✓ 已更新 ${BASELINE}`);
    writeFileSync(a11yBaseline, renderAccessibilityFormatted());
    console.log(`✓ 已更新 ${a11yBaseline}`);
    const status = reportMapErrors();
    if (status === 0) summarise();
    return status;
  }

  const mapStatus = reportMapErrors();
  if (mapStatus !== 0) return mapStatus;

  const expected = renderFormatted();

  if (!existsSync(BASELINE)) {
    console.error(`✗ 找不到 ${BASELINE}`);
    console.error("  執行：node tools/compliance/src/cli.ts --update\n");
    return 1;
  }

  if (readFileSync(BASELINE, "utf8") !== expected) {
    console.error("\n✗ COMPLIANCE.md 與映射不一致\n");
    console.error(
      "  可能是改了 map.ts 卻沒重產，也可能是有人直接手改了 COMPLIANCE.md。\n" +
        "  後者是這道閘門主要在擋的：手改一列「已證明」，表就開始高估自己，\n" +
        "  而稽核收到的是一份看起來很完整的文件。\n\n" +
        "  執行：node tools/compliance/src/cli.ts --update\n",
    );
    return 1;
  }

  if (!existsSync(a11yBaseline)) {
    console.error(`✗ 找不到 ${a11yBaseline}`);
    console.error("  執行：node tools/compliance/src/cli.ts --update\n");
    return 1;
  }
  if (readFileSync(a11yBaseline, "utf8") !== renderAccessibilityFormatted()) {
    console.error("\n✗ ACCESSIBILITY.md 與 a11y.ts 不一致\n");
    console.error("  執行：node tools/compliance/src/cli.ts --update\n");
    return 1;
  }

  console.log("✓ 法遵對照表與無障礙分工表都與映射一致");
  summarise();
  return 0;
}

process.exit(main());
