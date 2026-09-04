#!/usr/bin/env node
import { formatReport } from "@org/conformance/report";
import { parseFlags, repoRoot } from "@org/gate-kit";

import { judge, measure } from "./check.ts";
import { pairSlots } from "./config.ts";
import { probe, ProbeError } from "./probe.ts";

/**
 * 複雜度門檻有沒有比實測最大值高。
 *
 * 用法：
 *   node tools/threshold-check/src/cli.ts    有一格對不上時回傳非零
 *
 * 判定寫在 `src/check.ts` 的檔頭，量法寫在 `src/probe.ts` 的檔頭。
 *
 * ⚠️ 這個檔案是唯一一個可以讀 `process.argv`、呼叫 `process.exit` 的地方，
 * 規矩與 `tools/conformance` 同一條（#53）。
 */
/**
 * ⚠️ **這支不吃任何旗標 —— 而「不吃」必須是一句話，不是一片沉默**（C126）。
 * 空 spec 在 `parseFlags` 底下的意思是拒絕所有旗標，不是放行所有旗標。
 */
const FLAGS = parseFlags(process.argv.slice(2), {});
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

const ROOT = repoRoot();

/**
 * 一個**一定會被 lint 到**的檔案。用來證明檔案清單真的是檔案清單。
 *
 * ⚠️ 刻意不挑 `vite.config.ts` —— 那正是農場裡唯一被換掉的那一個。
 */
const ANCHOR = "tools/gate-roster/src/cli.ts";

/**
 * 量測台自己的四條夾具。
 *
 * ⚠️ 依 C154 §三 第 3 條，這四條**不計 D16 迭代軸的分** —— 它們守的是這支
 * 工具有沒有量對，不是別人的程式碼有沒有壞。寫在這裡是因為少了它們，
 * 一趟壞掉的量測會回綠：這支工具的所有紅燈都是「零違規」形狀的，
 * 而「什麼都沒量到」也是零違規。
 */
function fixtures(outcome: ReturnType<typeof probe>): string | undefined {
  if (outcome.rewritten !== outcome.realSlots.length) {
    return (
      `原始碼裡改寫了 ${outcome.rewritten} 格門檻，而 --print-config 讀出 ${outcome.realSlots.length} 格。\n` +
      `  → 兩者對不上代表萃取樣式漏了某一種寫法。修 src/config.ts 的 RULE_LINE，\n` +
      `    不要放著 —— 漏掉的那一格從此不會被任何東西量。`
    );
  }
  if (outcome.realFiles.length === 0) {
    return "真樹上 vp lint 一個檔案都沒掃到 —— 量測台壞了，不是這棵樹乾淨。";
  }
  // ⚠️ **非空與逐行相同都接不住「兩邊都是同一坨垃圾」。** 檔案清單走的是
  // `--debug=files`，而那條輸出串流是上游的事（今天在 stderr）—— 哪天它往
  // stdout 印一行 `note:`，兩趟都會拿到同一個單行字串：長度是 1 不是 0、
  // 兩邊還相等。**綠燈，而什麼都沒量到。** 釘一個一定會被 lint 到的檔案，
  // 是這一格唯一擋得住的辦法。
  if (!outcome.realFiles.includes(ANCHOR)) {
    return `vp lint 的檔案清單裡沒有 ${ANCHOR} —— 那個清單不是檔案清單（見 src/probe.ts 的 bothStreams）。`;
  }
  // ⚠️ 上面兩條問的是 `--debug=files` 那兩趟，而讀數來自 `-f json` 那一趟 ——
  // **不同的呼叫**。射程要問產出讀數的那一趟自己，不能拿另一趟替它作證。
  if (outcome.parsed.files !== outcome.realFiles.length) {
    return (
      `量測那一趟掃了 ${outcome.parsed.files} 個檔，而這棵樹是 ${outcome.realFiles.length} 個。\n` +
      `  → 產出讀數的那一趟射程不對，讀數就是不對的 —— 差多少不重要，不等就是紅。`
    );
  }
  if (outcome.realFiles.join("\n") !== outcome.probeFiles.join("\n")) {
    return (
      `農場掃到 ${outcome.probeFiles.length} 個檔，真樹掃到 ${outcome.realFiles.length} 個 —— 兩邊必須一樣。\n` +
      `  → 符號連結農場沒有完整重現這棵樹（見 src/probe.ts 檔頭）。差集就是量不到的部分。`
    );
  }
  if (outcome.parsed.unparsed.length > 0) {
    return (
      `有 ${outcome.parsed.unparsed.length} 條違規訊息含「Maximum allowed is」卻讀不出數字：\n` +
      outcome.parsed.unparsed
        .slice(0, 3)
        .map((line) => `    ${line}`)
        .join("\n") +
      `\n  → 上游換了措辭。修 src/diagnostics.ts 的 MEASURE，不要放著 —— 讀不到會讓每一格都變成「量不到」。`
    );
  }
  return undefined;
}

try {
  const outcome = probe(ROOT);

  const broken = fixtures(outcome);
  if (broken !== undefined) {
    console.error(`\n✗ 門檻檢查的量測台自己壞了\n\n  ${broken}\n`);
    process.exitCode = 1;
  } else {
    const pairing = pairSlots(outcome.realSlots, outcome.probeSlots);
    if (!pairing.ok) {
      console.error(`\n✗ 門檻檢查的量測台自己壞了\n\n  ${pairing.why}\n`);
      process.exitCode = 1;
    } else {
      const rows = measure(pairing.pairs, outcome.parsed.readings);
      const findings = judge(rows);

      if (findings.length === 0) {
        console.log(`✓ 複雜度門檻與實測最大值一致（${rows.length} 格）`);
        for (const row of rows) {
          console.log(
            `  ${String(row.pair.slot.value).padStart(4)} = 實測 max  ${row.pair.slot.rule}／${row.pair.slot.option}` +
              `（${row.pair.slot.where}，${row.count} 個測得到的單位）`,
          );
        }
        console.log("  它守的是 C147 §二 的「降」那一半：最大值掉下來時門檻要跟著降，不需要論證。");
        console.log("  ⚠️ 「抬」那一半不在這裡 —— 那要一則 C 編號，靠人（C119／C147 §二）。");
        console.log(
          "  ⚠️ 射程由 vp lint --print-config 決定，不是一份手抄清單 —— 今天是 " +
            rows.length +
            " 格。",
        );
      } else {
        // ⚠️ 不是 process.exit(1)：macOS 上管線的 stderr 是非同步的，
        // exit 會把還沒寫完的內容截掉（#53）。
        process.stderr.write(formatReport(findings, "複雜度門檻檢查"));
        process.exitCode = 1;
      }
    }
  }
} catch (cause) {
  if (cause instanceof ProbeError) {
    console.error(`\n✗ 門檻檢查跑不完：${cause.message}\n`);
    process.exitCode = 1;
  } else {
    throw cause;
  }
}
