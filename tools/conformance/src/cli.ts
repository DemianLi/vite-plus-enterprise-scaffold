#!/usr/bin/env node
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { slicePackageName } from "@org/slice-kit/contract";

import type { Finding } from "./finding.ts";
import { formatReport } from "./report.ts";
import { loadCodeowners } from "./scan.ts";
import { checkActionPinning } from "./rules/action-pinning.ts";
import { checkCspIncompatibleImports } from "./rules/csp.ts";
import { checkPhantomDependencies } from "./rules/phantom-deps.ts";
import { checkSlice } from "./rules/slice.ts";

/**
 * 一致性檢查 —— D4 邊界防護第 1 層，以及 D9 的防漂移機制。
 *
 * 為什麼需要這支：產生器只決定**起點**。第一天大家從同一個模板出發，三個月後
 * A 團隊的切片沒寫測試、B 團隊把 API 呼叫寫進元件、C 團隊偷偷加了跨切片依賴。
 * 產生器對這些一無所知，因為它只在建立那一刻跑過一次。
 *
 * 這支在 CI 每次都跑（Tier 2，不可繞過），驗的項目與產生器產出的內容
 * 讀同一份 contract.ts —— 兩者互為定義，不會各說各話。

/**
 * ⚠️ **判定不住在這個檔案裡。** 這裡只做四件事：解析參數、依序收集
 * `Finding[]`、把報告印出去、用結束碼說結果。
 *
 * 理由是這個檔案最後一行是 `process.exit(...)` —— 它一被 import 就跑完並
 * 結束行程，所以住在裡面的任何判定都沒有辦法被單獨測到。規則搬進
 * `src/rules/` 之前，這支工具的測試只能起子行程比對字串（#53）。
 * 規矩見 `src/scan.ts` 的檔頭。
 */

/**
 * 掃描的根目錄。預設是本 repo，`--root <dir>` 可以指到別處。
 *
 * ── 這個參數不是為了彈性，是為了讓這支工具能被反向測試 ──────────────
 *
 * 「該紅的時候會不會紅」只能靠**真的弄壞一個切片**來證明。
 * 在寫死 ROOT 的版本下，那意味著就地竄改 `features/order` 再還原 ——
 * 能動，但跑到一半被中斷 repo 就壞著，而且是安靜地壞。
 *
 * 有了 `--root`，反向測試可以把切片複製到暫存目錄再破壞副本：
 * 中斷了最多留一個 temp 目錄，原始碼一個位元組都沒動過。
 *
 * 這是**為了可測試性去改正式工具的介面**，值得說清楚代價：
 * 多一個參數、多一條解析路徑。換到的是這支 Tier 2 閘門
 * 第一次有辦法證明自己有牙齒 —— 在那之前它只證明過「現況是綠的」。
 *
 * ⚠️ 刻意**不做**環境變數版本。env 會被繼承到子行程，
 * 一個沒清乾淨的 `CONFORMANCE_ROOT` 會讓 CI 安靜地掃錯目錄然後回報通過。
 * 明確的旗標做不到這件事。
 */
function parseRoot(argv: readonly string[]): string {
  const at = argv.indexOf("--root");
  if (at === -1) return resolve(fileURLToPath(import.meta.url), "../../../..");

  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("--root 後面要接一個目錄");
    process.exit(1);
  }
  return resolve(value);
}

const ROOT = parseRoot(process.argv.slice(2));
const FEATURES_DIR = join(ROOT, "features");

// ── 執行 ──────────────────────────────────────────────────────────────
if (!existsSync(FEATURES_DIR)) {
  console.error(`找不到 features/ 目錄（預期在 ${relative(process.cwd(), FEATURES_DIR)}）`);
  process.exit(1);
}

const codeowners = loadCodeowners(ROOT);
const slices = readdirSync(FEATURES_DIR).filter((entry) =>
  statSync(join(FEATURES_DIR, entry)).isDirectory(),
);

// 先建立「哪些套件名確實是切片」的事實名單，再逐片檢查。
const sliceNames = new Set(slices.map(slicePackageName));

const findings: Finding[] = [];

for (const dir of slices) findings.push(...checkSlice(ROOT, dir, codeowners, sliceNames));

// D15：CSP 不相容的元件掃**整個 repo**，不是只掃切片 ——
// platform/ui 才是最可能不小心用到 reka-ui Splitter 的地方。
for (const layer of ["features", "platform", "apps"]) {
  const dir = join(ROOT, layer);
  if (existsSync(dir)) findings.push(...checkCspIncompatibleImports(ROOT, dir, layer));
}

// CI 的 action 必須以 commit SHA 釘住。與切片無關，掃的是 .github/workflows。
findings.push(...checkActionPinning(ROOT));

// 幽靈依賴：**逐 package** 檢查，不是逐層 —— 因為比對的對象是
// 「這個 package 自己的 package.json」，而每一層底下有很多個。
for (const layer of ["features", "platform", "apps"]) {
  const dir = join(ROOT, layer);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir)) {
    const packageDir = join(dir, entry);
    if (!statSync(packageDir).isDirectory()) continue;
    findings.push(...checkPhantomDependencies(ROOT, packageDir, `${layer}/${entry}`));
  }
}

/**
 * ⚠️ **這裡用 `process.exitCode` 而不是 `process.exit()`，而那是一個實測出來的
 * 缺陷，不是風格偏好。**
 *
 * macOS 上寫到 pipe 的 stderr 是**非同步**的（Linux 與 Windows 是同步的），
 * 而 `process.exit()` 不等待未送出的那一段。整份報告改成一次寫出之後，
 * 一個 600 條違規的 repo 在本機實測**只印得出 38 KB，123 KB 的報告被從
 * 中間切斷** —— 而結束碼仍然是 1，所以 CI 是紅的、看起來也「正常」。
 *
 * 前身是十幾行 `console.error`，剛好躲過了這件事。也就是說這不是原本就有的
 * 問題，是「把報告收成一個字串」這個改動帶進來的，而**一般大小的報告完全
 * 看不出來**：拆解當時錄的六份輸出全部一字不差，最大的那份 7 KB。
 *
 * 設 `exitCode` 之後行程會自己跑完並在離開前把 stderr 排乾。這支工具到這裡
 * 已經沒有任何未完成的非同步工作，所以不會拖著不結束。
 */
if (findings.length === 0) {
  console.log(`✓ 一致性檢查通過（${slices.length} 個切片）`);
} else {
  process.stderr.write(formatReport(findings));
  process.exitCode = 1;
}
