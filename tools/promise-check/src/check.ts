import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { collect, type Fail, type Finding } from "@org/conformance/finding";

import {
  BREAKAGES,
  SLICES_NEEDED,
  makeSandbox,
  trackedSlices,
  type SliceInfo,
} from "./breakage.ts";
import { CLI_SUFFIX, probeRootSupport } from "./probe.ts";
import { parseSpec, type PromiseScenario } from "./spec.ts";

/**
 * 判定：`specs/*.feature` 寫下的承諾，**每一條都真的執行一次**。
 *
 * ── 三件事，缺一條這道閘門就會在最常見的失效模式下全綠 ──────────────
 *
 * 1. **接線是雙向的。** 規格有而接線沒有 → 紅；接線有而規格沒有 → 也紅。
 * 2. **指名的閘門必須真的接在 `scripts.gate` 上。** 承諾說「這件事由
 *    `tools/conformance` 擋下來」，而那支如果根本沒有被執行，承諾是空的。
 *    ⚠️ 這一格是這道閘門買到的東西裡最實在的一塊：HANDOFF〈承諾什麼〉
 *    那幾張「守它的／守什麼」表，在此之前**沒有任何機制在斷言它是真的**
 *    —— 那份文件自己招認過這件事。
 * 3. **真的跑。** 靜態比對「規格提到的閘門存在嗎」只是另一份手抄本；
 *    這裡建一份切片副本、照規格把它弄壞、跑那道閘門、比對結果。
 *
 * ── ⚠️ 「不得誤擋」那一條要先跑 ────────────────────────────────────
 *
 * 沙盒建壞了的話，每一條「必須紅」都會成功變紅，而原因是環境壞了。
 * 所以期待綠燈的場景**先跑**，它沒過就不再往下 —— 後面的結果沒有資訊量，
 * 印出來只會讓人去修錯的東西。
 *
 * ── ⚠️ 接線有問題就不執行 ──────────────────────────────────────────
 *
 * 接不上的規格跑出來的紅燈，指的是接線而不是承諾。先把接線修好，
 * 再讓執行結果說話 —— 兩種紅燈混在同一份報告裡，人會修錯那一個。
 *
 * ── ⚠️ 第 3 條有一個它自己看不見的前提，見 `probe.ts` ────────────────
 *
 * 「真的跑」的前提是**閘門真的看了我給它的那份副本**。這條線上的閘門
 * 一律靜默忽略不認得的旗標（C123 §一），而閘門在量真樹的樣子，是
 * 每一條「必須綠」都成功變綠 —— 對照組守的是相反的方向，接不住它。
 * 所以執行之前先探一次：`probeRootSupport`。
 */

/** 閘門鏈住在根 `package.json` 的這個 script 裡（`vpr gate` 跑的就是它）。 */
const GATE_SCRIPT = "gate";

/** 一條承諾真的被執行過。綠燈訊息印的是這個數字 —— 不是「規格裡寫了幾條」。 */
export interface PromiseRun {
  readonly scenario: PromiseScenario;
}

export interface CheckResult {
  readonly findings: readonly Finding[];
  readonly runs: readonly PromiseRun[];
}

function gateChain(root: string): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts?.[GATE_SCRIPT] ?? "";
}

function runGate(root: string, gate: string, sandbox: string): { red: boolean; output: string } {
  const result = spawnSync("node", [join(root, gate, CLI_SUFFIX), "--root", sandbox], {
    cwd: root,
    encoding: "utf8",
  });
  return {
    red: result.status !== 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/**
 * 執行一條承諾：建沙盒 → 照「假設」弄壞 → 跑「當」指名的閘門 → 比對「那麼」。
 *
 * 回傳它有沒有出問題。沙盒一定清掉，包含破壞手法自己丟錯的那條路徑。
 */
function execute(
  root: string,
  slices: readonly SliceInfo[],
  scenario: PromiseScenario,
  fail: Fail,
): boolean {
  const breakage = BREAKAGES.get(scenario.given);
  if (breakage === undefined) return true;

  const where = `${scenario.feature} › ${scenario.scenario}`;
  const sandbox = makeSandbox(root, slices);

  try {
    breakage(sandbox);
    const { red, output } = runGate(root, scenario.gate, sandbox.dir);

    if (red !== scenario.expectRed) {
      fail(
        where,
        scenario.expectRed ? "承諾沒有牙齒" : "承諾誤擋",
        scenario.expectRed
          ? `照規格弄壞之後 ${scenario.gate} 仍然是綠的\n${output}`
          : `規格說跑完是綠的，而 ${scenario.gate} 紅了\n${output}`,
        scenario.expectRed
          ? "要嘛那道閘門真的漏了這一條（修閘門），要嘛這條承諾不再為真（改規格）。" +
              "⚠️ 兩者差很多，不要為了讓它變綠而改規格。"
          : "兩種可能：那道閘門會誤擋（一道會誤擋的閘門，第一天就會被加上例外，" +
              "然後例外永遠不會拿掉 —— 規則等於廢了，而 CI 全綠），" +
              "或者這個場景本來就該紅而規格被改壞了。⚠️ 先看「假設」那一句說了什麼。",
      );
      return true;
    }

    if (!output.includes(scenario.fragment)) {
      fail(
        where,
        "紅在別的地方",
        `結果對了，但訊息裡沒有 "${scenario.fragment}"\n${output}`,
        "規格要求的片段沒出現 —— 常見原因是**擋下它的是另一條規則**。" +
          "少了這個比對，任何一種違規都能讓任何一條承諾變綠。",
      );
      return true;
    }
  } finally {
    rmSync(sandbox.dir, { recursive: true, force: true });
  }

  return false;
}

/** 規格 → 破壞手法、規格 → 閘門，兩條接線都驗。回傳解析得出的場景。 */
function wire(root: string, specs: readonly string[], fail: Fail): PromiseScenario[] {
  const scenarios: PromiseScenario[] = [];

  // ⚠️ 讀不到或讀不懂就到此為止，**不往下做接線檢查**：那時候每一條接線
  // 都會被判成孤兒，而那份報告會把人指向 breakage.ts —— 錯的那個檔案。
  let unreadable = 0;

  for (const path of specs) {
    const full = resolve(root, path);
    if (!existsSync(full)) {
      unreadable += 1;
      fail(
        path,
        "規格不見了",
        "指名的規格檔不存在",
        "檔案改名或被刪了。這道閘門靠 `git ls-files` 找檔 —— 改名的話補進版控就好。",
      );
      continue;
    }
    const parsed = parseSpec(path, readFileSync(full, "utf8"));
    for (const f of parsed.findings) fail(f.where, f.rule, f.detail, f.fix);
    if (parsed.findings.length > 0) unreadable += 1;
    scenarios.push(...parsed.scenarios);
  }

  if (unreadable > 0) return scenarios;

  const chain = gateChain(root);
  const used = new Set<string>();

  for (const scenario of scenarios) {
    const where = `${scenario.feature} › ${scenario.scenario}`;

    if (!BREAKAGES.has(scenario.given)) {
      fail(
        where,
        "沒有接線",
        `「假設 ${scenario.given}」在 breakage.ts 裡沒有對應的破壞手法`,
        "去 `tools/promise-check/src/breakage.ts` 補一條，鍵要與規格的句子**逐字相同**。" +
          "⚠️ 接不上的承諾這裡是紅燈，不是跳過 —— 跳過就與「守住了」長得一樣。",
      );
      continue;
    }
    used.add(scenario.given);

    const cli = join(scenario.gate, CLI_SUFFIX);
    if (!existsSync(join(root, cli))) {
      fail(where, "閘門不存在", `找不到 ${cli}`, "「當」那一句指名的要是真的存在的一支閘門。");
      continue;
    }

    // ⚠️ 這一條補的正是 HANDOFF 那句「承諾與閘門對不對得上，只有人讀得出來」：
    // 閘門存在**不等於**它會被執行。
    if (!chain.includes(cli)) {
      fail(
        where,
        "閘門沒有接上",
        `${cli} 不在根 package.json 的 scripts.${GATE_SCRIPT} 裡`,
        "承諾說這件事由那道閘門擋下來，而它沒有被 `vpr gate` 執行 —— " +
          "那條承諾在 `vpr gate` 上是空的（⚠️ 不是「在 CI 上」—— C123 §五 b）。把它接上，或改寫承諾。",
      );
    }
  }

  for (const given of BREAKAGES.keys()) {
    if (used.has(given)) continue;
    fail(
      "tools/promise-check/src/breakage.ts",
      "孤兒接線",
      `「${given}」有破壞手法，卻沒有任何場景用到它`,
      "規格裡的場景被刪掉或改寫了。⚠️ **這個方向才是重點**：少了它，" +
        "刪一個場景就是「規格悄悄不再要求某件事」，而閘門全綠。",
    );
  }

  return scenarios;
}

/**
 * 跑完一次承諾檢查。
 *
 * @param specs 規格檔的路徑（相對 `root`）。**空的就是紅燈**，見下。
 */
export function checkPromises(root: string, specs: readonly string[]): CheckResult {
  const runs: PromiseRun[] = [];

  const findings = collect((fail) => {
    let problems = 0;
    const record: Fail = (where, rule, detail, fix) => {
      problems += 1;
      fail(where, rule, detail, fix);
    };

    if (specs.length === 0) {
      record(
        "specs/",
        "沒有規格",
        "版控裡找不到任何 `specs/*.feature`",
        "承諾的唯一來源不見了。⚠️ 這裡刻意是紅燈而不是「沒事可做」—— " +
          "「一條承諾都沒有」與「承諾全部守住了」在綠燈上長得一模一樣。",
      );
      return;
    }

    const scenarios = wire(root, specs, record);
    if (problems > 0) return;

    // ⚠️ **逐份規格問，不是整批問。** 第二份規格進來的那一刻，「整批至少有一條
    // 對照組」就不再守得住第一份：刪掉 `promise-1` 的對照組，另一份的還在，
    // 於是這裡全綠 —— 而那份規格的沙盒壞掉時，它每一條「必須紅」都會成功變紅。
    // 這正是這道閘門在別處擋的形狀（`doc-facts` 的 `unguarded`、第四態 ❓）。
    const control = scenarios.filter((scenario) => !scenario.expectRed);
    const hasControl = new Set(control.map((scenario) => scenario.spec));
    let uncontrolled = 0;

    for (const spec of new Set(scenarios.map((scenario) => scenario.spec))) {
      if (hasControl.has(spec)) continue;
      uncontrolled += 1;
      record(
        spec,
        "沒有對照組",
        "這份規格裡一條「必須綠」的場景都沒有",
        "每一份規格都要有一條「沒有人違規時不得紅」。⚠️ 少了它，沙盒建壞掉的時候" +
          "這份規格每一條「必須紅」都會成功變紅，而這道閘門會顯示全綠。" +
          "⚠️ **別份規格的對照組不算數** —— 它們用的是不同的閘門與不同的素材。",
      );
    }
    if (uncontrolled > 0) return;

    // ⚠️ 素材是樹上實際有的切片。fork 的樹上示範切片早就被換掉了，
    // 而那不是他們做錯了什麼 —— 所以這裡是一句說得出原因的紅燈，
    // 不是複製檔案時噴出來的 ENOENT。
    const slices = trackedSlices(root);
    if (slices.length < SLICES_NEEDED) {
      record(
        "features/",
        "素材不足",
        `這道閘門要 ${SLICES_NEEDED} 片切片當素材，版控裡只有 ${slices.length} 片`,
        "承諾說的是「切片之間」的邊界，一片切片證明不了它 —— 只放一片的話，" +
          "另一片的套件名不在事實名單上，「跨切片依賴」那條**永遠測不出來**而閘門全綠。" +
          "⚠️ 剛 `vp create slice` 的話先 `git add`：事實來源是 `git ls-files`。",
      );
      return;
    }

    // ⚠️ 執行之前先探一次：**被指名的閘門真的看得見那份副本嗎**。
    // 這一趟放在最後（它要 spawn，比上面每一條都貴），但一定在執行之前 ——
    // 一支在量真樹的閘門會讓每一條「必須綠」都成功變綠、每一條「必須紅」
    // 都報〈承諾沒有牙齒〉，而那則訊息會把人指向閘門或規格，兩個都不對。
    for (const gate of new Set(scenarios.map((scenario) => scenario.gate))) {
      const probe = probeRootSupport(root, gate);
      if (probe.readsRoot) continue;
      record(
        gate,
        "閘門指不到副本",
        probe.evidence,
        "這道閘門看不見那份副本，所以接在它身上的每一條承諾**量的是真樹，不是那份被弄壞的副本**。" +
          "⚠️ 有兩種形狀，而**兩種的處置一樣**：它忽略了 `--root`（舊的樣子），" +
          "或者它接了 `parseFlags` 但沒有宣告 `--root`，於是**拒絕**了它（C126 之後的樣子 —— " +
          "兩趟都失敗、訊息相同，判定一樣是「看不見」）。" +
          "⚠️ 這不會長成「沒有東西在跑」，會長成**全綠**，或是一則指向錯誤地方的〈承諾沒有牙齒〉。" +
          "⚠️ 對照組接不住這個方向：那道保險守的是「沙盒建壞掉」（偽陽性），這裡是「閘門沒看沙盒」（偽陰性）。" +
          "修法是讓那支閘門讀 `--root`，而第一步是讓它**對不認得的旗標失敗**（#167／C123 §一）。" +
          "⚠️ 少數情形下這是誤判：閘門讀了 `--root`，而它對一個空目錄的輸出恰好與真樹逐字相同 —— " +
          "那時候要改的是 `src/probe.ts`，不是閘門。",
      );
    }
    if (problems > 0) return;

    for (const scenario of [...control, ...scenarios.filter((s) => s.expectRed)]) {
      const failed = execute(root, slices, scenario, record);
      runs.push({ scenario });
      // 對照組沒過就停：後面的結果沒有資訊量，印出來只會讓人去修錯的東西。
      if (failed && !scenario.expectRed) return;
    }
  });

  return { findings, runs };
}
