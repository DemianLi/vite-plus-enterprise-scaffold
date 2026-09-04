import { loadFeatureFromText } from "@amiceli/vitest-cucumber";

import { collect, type Finding } from "@org/conformance/finding";

/**
 * 把 `specs/*.feature` 解析成**可執行的承諾**。
 *
 * ── 這一層只做一件事：把人寫的句子變成三個欄位 ──────────────────────
 *
 * 「怎麼把樹弄壞」在 `breakage.ts`、「跑起來對不對」在 `check.ts`。
 * 這裡不碰檔案系統，也不 spawn 任何東西 —— 那讓「規格寫錯了會怎樣」
 * 可以被單獨測到，不必先準備一份切片副本。
 *
 * ── ⚠️ 解析不出來一律是紅燈，不是跳過 ───────────────────────────────
 *
 * 一個打錯字的「那麼」句如果被安靜略過，這份規格就會**看起來還在守**
 * 而實際上少了一條。`tools/spec-report` 的第四態（❓ 未執行）記的是
 * 同一件事的另一個版本：**測試全綠而場景一條都沒跑**，與全綠長得一樣。
 *
 * 所以下面每一個 `fail(...)` 對應的都是「這句話我讀不懂」，
 * 而讀不懂的規格 ≠ 沒有承諾。
 */

/** 一條承諾：把樹弄壞成什麼樣、跑哪一道閘門、期待什麼結果。 */
export interface PromiseScenario {
  /**
   * 這條承諾寫在哪一份規格裡。
   *
   * ⚠️ 有兩份規格之後才需要它：「至少要有一條對照組」如果整批問，
   * 刪掉其中一份的對照組會被另一份蓋過去（見 `check.ts`）。
   */
  readonly spec: string;
  /** `功能:` 那一行 —— 承諾的標題。 */
  readonly feature: string;
  /** `場景:` 那一行。 */
  readonly scenario: string;
  /**
   * 「假設」那一句的內容，**逐字**當作 `breakage.ts` 的鍵。
   *
   * ⚠️ 逐字相同是刻意的：改了規格的句子而沒改接線，這裡就接不上而紅。
   * 用寬鬆比對（正規化空白、去標點）換來的是「改了規格但閘門沒感覺」。
   */
  readonly given: string;
  /** 「當 跑 <這裡>」—— 閘門的目錄，例如 `tools/conformance`。 */
  readonly gate: string;
  /** 「那麼 它必須紅」＝ true；「必須綠」＝ false。 */
  readonly expectRed: boolean;
  /** 訊息裡必須出現的片段。 */
  readonly fragment: string;
}

export interface ParseResult {
  readonly scenarios: readonly PromiseScenario[];
  readonly findings: readonly Finding[];
}

/** 規格的語言。⚠️ 與 `tools/spec-report` 的 `SPEC_LANGUAGE` 是同一個值，兩處各自寫死。 */
const LANGUAGE = "zh-TW";

const WHEN_PATTERN = /^跑\s+(\S+)$/u;
// 「它必須紅，訊息裡要出現 "跨切片"」——⚠️ 引號內的片段是必填的：
// 少了它，任何一種違規都能讓任何一個場景變綠，而那道閘門看起來還在守。
const THEN_PATTERN = /^它必須(紅|綠)，訊息裡要出現\s+"([^"]+)"$/u;

interface ParsedStep {
  readonly type: string;
  readonly details: string;
}

interface ParsedScenario {
  readonly description: string;
  readonly steps: readonly ParsedStep[];
}

function stepOf(steps: readonly ParsedStep[], type: string): string | null {
  const found = steps.filter((step) => step.type === type);
  // 兩句同型的話取哪一句都是猜 —— 猜錯不會有人知道，所以不猜。
  if (found.length !== 1) return null;
  return found[0]?.details ?? null;
}

/**
 * 解析一份規格。
 *
 * ⚠️ **場景大綱在這裡不支援，而且是明講的紅燈**（規格用得到的那天再說）。
 * 沉默地只跑第一列，是這份設計最不能出的錯。
 */
export function parseSpec(path: string, text: string): ParseResult {
  const scenarios: PromiseScenario[] = [];

  const findings = collect((fail) => {
    // ⚠️ 三種讀不到承諾的情形共用一條規則，因為**要做的事是同一件**：
    // 回去把規格寫對。分成三個代號只會讓人以為它們有不同的處置。
    const fix =
      "修好 Gherkin 語法，或把承諾寫進來。⚠️ 讀不懂的規格與空的規格**都不等於**" +
      "「沒有承諾」，所以這裡是紅燈不是跳過 —— 跳過的話，它與「承諾全部守住了」長得一樣。";

    let feature: { name: string; scenarii: readonly unknown[] } | undefined;
    try {
      feature = loadFeatureFromText(text, { language: LANGUAGE }) as typeof feature;
    } catch (error) {
      // ⚠️ 上游對「一個場景都沒有」是**丟錯**，不是回傳空的 —— 所以這條
      // catch 同時涵蓋語法錯與空規格，而下面兩個檢查是它改行為時的後備。
      fail(
        path,
        "規格不成立",
        `讀不懂這份規格：${error instanceof Error ? error.message : String(error)}`,
        fix,
      );
      return;
    }

    if (feature === undefined) {
      fail(path, "規格不成立", "整份檔案裡找不到「功能:」", fix);
      return;
    }

    if (feature.scenarii.length === 0) {
      fail(path, "規格不成立", "這份規格一個場景都沒有", fix);
      return;
    }

    for (const raw of feature.scenarii) {
      const scenario = raw as ParsedScenario;
      const where = `${path} › ${scenario.description}`;

      const given = stepOf(scenario.steps, "Given");
      const when = stepOf(scenario.steps, "When");
      const then = stepOf(scenario.steps, "Then");

      if (given === null || when === null || then === null) {
        fail(
          where,
          "場景形狀",
          "一個場景要**剛好各一句**假設／當／那麼",
          "照現有場景的三句寫法補齊。缺一句就沒有東西可執行，多一句則無從判斷跑哪一個。",
        );
        continue;
      }

      const whenMatch = WHEN_PATTERN.exec(when);
      if (whenMatch?.[1] === undefined) {
        fail(
          where,
          "當句",
          `讀不懂「當 ${when}」`,
          "寫成「當 跑 tools/<閘門>」。這一句指名的是**真的會被執行**的那道閘門。",
        );
        continue;
      }

      const thenMatch = THEN_PATTERN.exec(then);
      if (thenMatch?.[1] === undefined || thenMatch[2] === undefined) {
        fail(
          where,
          "那麼句",
          `讀不懂「那麼 ${then}」`,
          '寫成「那麼 它必須紅，訊息裡要出現 "片段"」。' +
            "⚠️ 片段不可省 —— 少了它，紅在**別的規則**上也算通過。",
        );
        continue;
      }

      scenarios.push({
        spec: path,
        feature: feature.name,
        scenario: scenario.description,
        given,
        gate: whenMatch[1],
        expectRed: thenMatch[1] === "紅",
        fragment: thenMatch[2],
      });
    }
  });

  return { scenarios, findings };
}
