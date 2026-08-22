#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatReport } from "@org/conformance/report";

import { checkScope, GOVERNED, LAYER_LABEL } from "./check.ts";

/**
 * `SCOPE.md` 與版控內容一致嗎。
 *
 * 用法：
 *   node tools/scope-check/src/cli.ts    不一致時回傳非零
 *
 * 判定與它刻意不守的東西寫在 `src/check.ts` 的檔頭。
 *
 * ⚠️ 這個檔案是唯一一個可以讀 `process.argv`、呼叫 `process.exit` 的地方，
 * 規矩與 `tools/conformance` 同一條（#53）：判定要能被 import 測到。
 */
const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

const findings = checkScope(ROOT);

if (findings.length === 0) {
  const layers = GOVERNED.map((p) => LAYER_LABEL[p] ?? p).join("、");
  console.log(`✓ SCOPE.md 與版控一致（${layers}）`);
  console.log("  比對的是 git ls-files（版控追蹤中的），不是磁碟上的目錄 —— 理由見 src/tree.ts");
  console.log("  ⚠️ 守的是「有哪些東西」，不是每一個裡面寫什麼 —— apps/ 與 features/ 這兩個");
  console.log("     目錄本身登記在根層那一節，底下的內容是示範切片，SCOPE.md 自己說了不管。");
} else {
  // ⚠️ 不是 process.exit(1)：macOS 上管線的 stderr 是非同步的，
  // exit 會把還沒寫完的內容截掉（#53 實測 123 KB 的報告被砍在 65536 位元組）。
  process.stderr.write(formatReport(findings, "範疇檢查"));
  process.exitCode = 1;
}
