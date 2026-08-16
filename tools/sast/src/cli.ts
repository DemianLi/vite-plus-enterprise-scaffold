#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectFields, renderRules } from "./generate.ts";

/**
 * 產生的 SAST 規則與切片契約是否同步。
 *
 *   node tools/sast/src/cli.ts            比對（CI 跑這個）
 *   node tools/sast/src/cli.ts --update   重新產生
 *
 * ⚠️ 這支工具**不執行 SAST**。規則的行為由 `semgrep --test` 對
 * `.semgrep/fixtures/` 驗證，跑在 Tier 2 —— 那需要 semgrep 本體。
 * 這裡守的是「規則有沒有跟上 personalData」，那不需要 semgrep。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const GENERATED = join(ROOT, ".semgrep/generated-pii.yml");

/**
 * 產完丟給 `vp fmt`，比對的也是它的輸出。
 *
 * ⚠️ 自己排版等於在專案裡養第二個 formatter，而它遲早與真的那個分歧。
 * 這一課這個 repo 已經上過兩次：`api-surface` 產出一份過不了 `vp check`
 * 的基準線、`compliance` 的表格欄寬。第三次是這裡 —— 我寫完規則、
 * 跑了一次 `vp check --fix`，YAML 被重排，然後同步檢查當場紅了。
 */
function formatted(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sast-fmt-"));
  try {
    const path = join(dir, "generated-pii.yml");
    writeFileSync(path, content);
    const result = spawnSync("./node_modules/.bin/vp", ["fmt", path], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      // 靜靜回傳未排版的內容會讓比對永遠不一致，而原因看不出來。
      throw new Error(`vp fmt 失敗：${result.stderr ?? ""}`);
    }
    return readFileSync(path, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  const expected = formatted(renderRules(collectFields(ROOT)));

  if (process.argv.slice(2).includes("--update")) {
    writeFileSync(GENERATED, expected);
    console.log(`✓ 已更新 ${GENERATED}`);
    return 0;
  }

  const actual = readFileSync(GENERATED, "utf8");
  if (actual === expected) {
    const fields = collectFields(ROOT).flatMap((entry) => entry.fields);
    console.log(
      `✓ 產生的 SAST 規則與切片契約同步（${fields.length} 個個資欄位）\n` +
        "  ⚠️ 這一步不執行 SAST —— 規則的行為由 semgrep --test 驗（見 Tier 2）。",
    );
    return 0;
  }

  console.error(
    "✗ .semgrep/generated-pii.yml 與 features/*/src/index.ts 的 personalData 不同步\n\n" +
      "  有人加了（或改了）個資欄位而沒有重新產生規則 ——\n" +
      "  於是那個欄位被寫進 log 或 localStorage 時，不會有任何東西說話。\n\n" +
      "  執行：node tools/sast/src/cli.ts --update\n",
  );
  return 1;
}

process.exit(main());
