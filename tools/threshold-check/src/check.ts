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
 * 壓到地板（而不是減一）就把兩者分開了：地板值之上還是零違規，代表那個範圍裡
 * 連一個測得到的函式都沒有。⚠️ 這不是假想的 —— 測試碼的 `vue/max-props: 2`
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
}

export function measure(pairs: readonly Pair[], readings: readonly Reading[]): Row[] {
  return pairs.map((pair) => {
    const code = codeOf(pair.slot.rule);
    const mine = readings.filter((r) => r.code === code && r.allowed === pair.floor);
    const observed = mine.length === 0 ? undefined : Math.max(...mine.map((r) => r.reported));

    let verdict: Verdict = "ok";
    if (observed === undefined) verdict = "unmeasurable";
    else if (observed < pair.slot.value) verdict = "stale";
    else if (observed > pair.slot.value) verdict = "exceeded";

    return { pair, count: mine.length, observed, verdict };
  });
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
          `${name} 設在 ${slot.value}，而這個範圍裡的實測最大值是 ${row.observed}（${row.count} 個測得到的單位）`,
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
          `${name} 設在 ${slot.value}，而這個範圍裡**一個測得到的單位都沒有**（探針已經把它壓到 ${row.pair.floor}）`,
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
