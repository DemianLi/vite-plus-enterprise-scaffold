import { collect, type Finding } from "@org/conformance/finding";

import { codeOf, type Pair } from "./config.ts";
import type { Reading } from "./diagnostics.ts";

/**
 * 判定：每一格門檻，實測最大值在哪裡。
 *
 * ── 這支工具在守什麼 ────────────────────────────────────────────────
 *
 * C147 §二 把複雜度門檻的移動訂成單向的：
 *
 *   · **觀測最大值下降** ⇒ 門檻必須跟著降，**不需要論證**（它擋不下任何
 *     今天存在的東西，所以降它不會紅）。
 *   · **上升** ⇒ 維持原判，要抬得有一則 C 編號。
 *
 * **抬那一半有慣例撐著，而且開火過四次；降那一半在這支之前沒有任何東西在守。**
 * C147 §四 自己寫下了那件事，並把可機械化的形狀留給下一個人 —— 這就是那一支。
 * ⚠️ **「抬」那一半今天仍然沒有機制在守，而且刻意**：抬要一則 C 編號，靠人。
 *
 * ⚠️ **它的失敗方向是安全的**：程式碼變好才會紅，而那種紅一行 config 就修掉。
 *
 * ── 四種判定，而其中兩種在讀數上長得一樣 ──────────────────────────
 *
 * ⚠️⚠️ 票面的做法（門檻各減一，報不出違規就是過期）有一個它看不見的死角：
 * **「規則在這個範圍裡實測不到分佈」與「門檻過期了」都是零違規。**
 * 兩個相反的狀態映到同一個讀數 —— 而處置完全不同：前者「降到 N」有答案，
 * 後者根本沒有 N 可以降。
 *
 * 壓到地板（而不是減一）就把兩者分開了 —— **在地板 0 那一格上**：地板值之上
 * 還是零違規，代表那個範圍裡連一個測得到的函式都沒有。⚠️⚠️ 地板 ≥ 1 的格不成立
 * （排名地板，見 `config.ts` 的 `floorSource`）：真最大值 ≤ 地板值時一樣零違規，
 * 而那其實是「過期」。所以那種格要補量一趟再判（`resolveUnmeasurable`，C223）。
 *
 * 補量之後「量不到」只剩壓到 0 的讀數，而它仍有兩種讀法（範圍空了／最大值是 0）
 * —— **刻意不分辨**：C147 §五 為了 `.vue` 那一格明文拒答過，所以它不許被算成
 * 「降到 0」。⚠️ 這也不是假想的 —— 測試碼的 `vue/max-props: 2`
 * 今天由**兩支 fixture `.vue`** 撐著，刪掉它們這一格就懸空了。
 * 而 C147 §五 明文拒答過 `.vue` 那一格（「要先答『元件的邏輯有多少在 template 裡』，
 * 不是先答一個數字」），所以這支工具**不許**把它算成「降到某個數字」。
 */

export type Verdict = "ok" | "stale" | "unmeasurable" | "exceeded";

export interface Row {
  readonly pair: Pair;
  /** 這一格在探針裡報了幾條。 */
  readonly count: number;
  /** 實測最大值。`count` 為 0 時是 `undefined` —— 那正是「量不到」。 */
  readonly observed: number | undefined;
  readonly verdict: Verdict;
  /** 排名地板上量不到、另外壓到 0 補量過（C223）。 */
  readonly rechecked: boolean;
}

function verdictOf(observed: number | undefined, value: number): Verdict {
  if (observed === undefined) return "unmeasurable";
  if (observed < value) return "stale";
  if (observed > value) return "exceeded";
  return "ok";
}

function readingsAt(pair: Pair, readings: readonly Reading[], allowed: number): Reading[] {
  const code = codeOf(pair.slot.rule);
  return readings.filter((r) => r.code === code && r.allowed === allowed);
}

function rowOf(pair: Pair, mine: readonly Reading[], rechecked: boolean): Row {
  const observed = mine.length === 0 ? undefined : Math.max(...mine.map((r) => r.reported));
  return {
    pair,
    count: mine.length,
    observed,
    verdict: verdictOf(observed, pair.slot.value),
    rechecked,
  };
}

export function measure(pairs: readonly Pair[], readings: readonly Reading[]): Row[] {
  return pairs.map((pair) => rowOf(pair, readingsAt(pair, readings, pair.floor), false));
}

/**
 * 排名地板吃掉的那幾格，補量一趟再判（C223）。
 *
 * 只補「地板 ≥ 1 而量不到」的格：地板 0 的「量不到」已經是壓到底的讀數。
 * 補量那一趟只有目標格是 0，所以只認 `allowed = 0` 的讀數（理由見 `floorOne`）。
 */
export function resolveUnmeasurable(
  rows: readonly Row[],
  recheck: (pair: Pair) => readonly Reading[],
): Row[] {
  return rows.map((row) =>
    row.verdict !== "unmeasurable" || row.pair.floor === 0
      ? row
      : rowOf(row.pair, readingsAt(row.pair, recheck(row.pair), 0), true),
  );
}

export function judge(rows: readonly Row[]): Finding[] {
  return collect((fail) => {
    for (const row of rows) {
      const { slot } = row.pair;
      const name = `${slot.rule}／${slot.option}`;

      if (row.verdict === "stale") {
        fail(
          slot.where,
          "門檻過期",
          `${name} 設在 ${slot.value}，而這個範圍裡的實測最大值是 ${row.observed}（${row.count} 個測得到的單位）` +
            (row.rechecked
              ? `。⚠️ 排名地板 ${row.pair.floor} 看不見它，壓到 0 補量才量到（C223）`
              : ""),
          `把它降成 ${row.observed}。⚠️ **降不需要論證**（C147 §二：它擋不下任何今天存在的東西），` +
            `這也不是 AGENTS.md 規則二 禁的那種改動 —— 那一條禁的是調鬆。` +
            `不降的話，有人重構掉的那支極端值就白省了：門檻留在舊高度，` +
            `下一段同樣長的程式碼會安靜地通過。`,
        );
        continue;
      }

      if (row.verdict === "unmeasurable") {
        fail(
          slot.where,
          "門檻量不到",
          `${name} 設在 ${slot.value}，而這個範圍裡**一個測得到的單位都沒有**` +
            `（探針已經把它壓到 ${row.rechecked ? 0 : row.pair.floor}` +
            `${row.rechecked ? `；排名地板是 ${row.pair.floor}，另外補量過一趟` : ""}）`,
          `⚠️ **不要隨便填一個數字** —— 沒有實測最大值可以降到。` +
            `這一格要嘛範圍空了（規則在守一個不存在的東西），要嘛規則對這種檔案本來就量不到` +
            `（C147 §五 為了 .vue 那一格明文拒答過同一個問題）。` +
            `依 AGENTS.md 規則二，**停下來告訴人**，由人裁要拿掉這一格還是留著並寫一則 C 編號。`,
        );
        continue;
      }

      if (row.verdict === "exceeded") {
        fail(
          slot.where,
          "門檻被超過",
          `${name} 設在 ${slot.value}，而實測最大值是 ${row.observed} —— 已經有程式碼超過它`,
          "跑 `vp check`，那一步現在應該是紅的。這道閘門不跑 lint 本身，" +
            `所以它讀到的是「門檻與樹脫節」的另一個方向；先修 lint，不要動門檻。`,
        );
      }
    }
  });
}
