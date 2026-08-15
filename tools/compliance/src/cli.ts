#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTROLS, FUTURE, GATES, REGULATION } from "./map.ts";
import { blockingGates, owedGaps, render, unprovenGates } from "./render.ts";
import { verifyMap } from "./verify.ts";

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

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const DEFAULT_BASELINE = join(ROOT, "tools/compliance/COMPLIANCE.md");

/**
 * 要比對的檔案。`--file <path>` 可以指到別處。
 *
 * 這個參數存在的唯一理由是讓這支工具能被反向測試：把產出的表複製到暫存
 * 目錄、改掉一個字，再讓 CLI 去驗那一份 —— repo 的 COMPLIANCE.md 不被動到。
 * 與 `tools/conformance` 的 `--root` 同一個取捨，只是範圍更窄：
 * 映射的檔案存在性檢查仍然對**真的** repo 跑，因為那份映射描述的就是這個 repo。
 */
function parseFile(argv: readonly string[]): string {
  const at = argv.indexOf("--file");
  if (at === -1) return DEFAULT_BASELINE;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("--file 後面要接一個路徑");
    process.exit(1);
  }
  return resolve(value);
}

/** 產出並交給 `vp fmt`。回傳 formatter 的輸出，那才是要比對的東西。 */
function renderFormatted(): string {
  const markdown = render({
    regulation: REGULATION,
    gates: GATES,
    controls: CONTROLS,
    future: FUTURE,
  });
  const dir = mkdtempSync(join(tmpdir(), "compliance-render-"));
  const path = join(dir, "COMPLIANCE.md");

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
  const argv = process.argv.slice(2);
  const baseline = parseFile(argv);

  // ── --update 先寫再驗，順序是刻意的 ────────────────────────────────
  //
  // COMPLIANCE.md 自己就是 `compliance` 這道閘門宣告的證據檔。在寫出來
  // 之前驗它，等於要求它先於自己存在 —— 第一次產生就永遠卡住。
  // 驗證模式沒有這個問題，所以那一側維持先驗後比。
  if (argv.includes("--update")) {
    writeFileSync(baseline, renderFormatted());
    console.log(`✓ 已更新 ${baseline}`);
    const status = reportMapErrors();
    if (status === 0) summarise();
    return status;
  }

  const mapStatus = reportMapErrors();
  if (mapStatus !== 0) return mapStatus;

  const expected = renderFormatted();

  if (!existsSync(baseline)) {
    console.error(`✗ 找不到 ${baseline}`);
    console.error("  執行：node tools/compliance/src/cli.ts --update\n");
    return 1;
  }

  if (readFileSync(baseline, "utf8") !== expected) {
    console.error("\n✗ COMPLIANCE.md 與映射不一致\n");
    console.error(
      "  可能是改了 map.ts 卻沒重產，也可能是有人直接手改了 COMPLIANCE.md。\n" +
        "  後者是這道閘門主要在擋的：手改一列「已證明」，表就開始高估自己，\n" +
        "  而稽核收到的是一份看起來很完整的文件。\n\n" +
        "  執行：node tools/compliance/src/cli.ts --update\n",
    );
    return 1;
  }

  console.log("✓ 法遵對照表與映射一致");
  summarise();
  return 0;
}

process.exit(main());
