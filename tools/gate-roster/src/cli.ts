#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkRoster } from "./check.ts";
import { GATES, UNGATED } from "./gates.ts";
import { parseFlags } from "@org/gate-kit";

/**
 * 閘門名冊的四個消費端是否一致。
 *
 * 用法：
 *   node tools/gate-roster/src/cli.ts    不一致時回傳非零
 *
 * 名冊本身在 `src/gates.ts`，那個檔的檔頭寫了它涵蓋什麼、刻意不涵蓋什麼。
 * 判定在 `src/check.ts`。這裡只做三件事：收集、印、決定回傳值。
 */

/**
 * ⚠️ **不認得的旗標一律紅**（C126／C133 §五）。這幾行不是驗證輸入，是**擋一種
 * 綠燈**：被拿掉的旗標留在 CI 裡而被靜靜忽略時，那一步會頂著它原本的名字回綠
 * —— C52 的 `--masking` 就是那樣活了下來（完整量測在 C125 §一）。
 *
 * ⚠️ **空 spec 的意思是「拒絕所有旗標」，不是「放行所有旗標」。**
 * ⚠️ spec 漏掉一個真旗標，合併當天 CI 就紅** —— 「不認得就失敗」對還沒登記的
 * 真旗標一視同仁。三個來源要一起掃：根 `package.json` 的 `scripts`、
 * `.github/workflows/*.yml`（⚠️ **含排程那兩個**，它們不在 `gate`／`ready` 上，
 * `gate-kit` 的名冊測試看不見它們）、以及這支工具自己的 `tests/`。
 */
const FLAGS = parseFlags(process.argv.slice(2), {} as const);
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

const problems = checkRoster(ROOT);

if (problems.length === 0) {
  const tier1 = GATES.filter((gate) => gate.tiers.includes("tier1")).length;
  const tier2 = GATES.filter((gate) => gate.tiers.includes("tier2")).length;
  // 數字全部從名冊算出來，不手寫 —— 一支在講「不要手抄清單」的工具，
  // 自己印一個手抄的數字會很難看，而且它會過期（C53）。
  console.log(
    `✓ 閘門名冊一致：${GATES.length} 道閘門（Tier 1 ${tier1} 道、Tier 2 ${tier2} 道）、` +
      `${UNGATED.length} 個刻意不接的工具\n` +
      "  比對的是：package.json 的 gate 與各別名、兩個 workflow、README〈兩層檢查〉那張表\n" +
      "  ⚠️ 只比對本 repo 自己寫的檢查。semgrep 與 gitleaks 不在名冊裡，\n" +
      "     所以這道閘門對那幾個步驟什麼都沒說 —— 理由見 src/gates.ts 檔頭。",
  );
  process.exit(0);
}

console.error(`✗ 閘門名冊對不上：${problems.length} 項\n`);
for (const problem of problems) console.error(`  [${problem.kind}] ${problem.detail}`);
console.error(
  "\n  同一份閘門清單在上面那幾處各寫一份，而它們必須說同一件事。\n" +
    "  唯一的事實來源是 tools/gate-roster/src/gates.ts —— 先改那裡，再讓其餘四份跟上。",
);
process.exit(1);
