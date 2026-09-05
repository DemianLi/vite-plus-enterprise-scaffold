import { realpathSync } from "node:fs";

import type { GitFacts } from "./git.ts";

/**
 * 距上一個 tag 有多遠 —— **報數，不判定**（C169 §一）。
 *
 * ── 為什麼沒有門檻 ────────────────────────────────────────────────
 *
 * `#249` 那張表的 **D** 寫著「仍要訂 N」，而 C169 §四 實測**可校準的區間有 0 個**
 * （不是 1 個）：31 個 v1 tag 不在 `main` 的第一父鏈上、跨併線那個窗口的單位
 * 與人工計數不同、唯一同線的區間由 `v1.16.0` 自己判掉。**一個訂不出來的門檻，
 * 訂了就是憑空。**
 *
 * 所以這支的規格是「**不會紅**」，不是「還沒設門檻」。⚠️ 改成會紅要先推翻
 * C169 §四，不是在這裡順手加一個常數。
 *
 * ⚠️ **唯一的例外是不認得的旗標**（C126）—— 那不是對這棵樹的判定，是呼叫方式錯了。
 */
export type Report =
  | {
      readonly kind: "measured";
      readonly tag: string;
      readonly commits: number;
      readonly days: number;
      /** ⚠️ 假就是說：這個數字與「人數的那個數字」會分岔。見 `git.ts` 的 readGit。 */
      readonly onFirstParent: boolean;
    }
  | { readonly kind: "unmeasurable"; readonly why: string };

const MS_PER_DAY = 86_400_000;

export function report(facts: GitFacts): Report {
  if (facts.toplevel === undefined) return { kind: "unmeasurable", why: "這裡不是 git 工作樹" };
  if (facts.tag === undefined) {
    return {
      kind: "unmeasurable",
      why: "看不到任何 tag（淺 checkout 不會帶 tag —— `actions/checkout` 預設 fetch-depth: 1）",
    };
  }
  if (facts.commits === undefined || facts.tagDate === undefined || facts.headDate === undefined) {
    return { kind: "unmeasurable", why: `找得到 ${facts.tag}，但數不出它到 HEAD 的距離` };
  }
  return {
    kind: "measured",
    tag: facts.tag,
    commits: facts.commits,
    days: (Date.parse(facts.headDate) - Date.parse(facts.tagDate)) / MS_PER_DAY,
    onFirstParent: facts.onFirstParent === true,
  };
}

/**
 * 量測台自己的三條夾具。
 *
 * ⚠️ 依 C154 §三 第 3 條，這三條**不計 D16 迭代軸的分** —— 它們守的是這支工具有沒有
 * 量對，不是別人的東西有沒有壞。C169 §六 把這一節留給了本票（#267）。
 *
 * **要擋的那個安靜壞法很具體**：這支工具跑完、印出一行**看起來完全合理**的數字，
 * 而那個數字量的是別的東西 —— 或什麼都沒量。它沒有紅燈可以掉，所以
 * 「印得出來」與「量對了」在輸出上長得一模一樣。三條各守一種：
 */
export function fixtures(facts: GitFacts, asked: string): string | undefined {
  // ① 量的是不是呼叫端問的那棵樹。`git` 會從 cwd 往上找，所以一個打錯的路徑
  //    不會報錯，它會安靜地爬到外層的某個 repo 去 —— 而輸出照樣是一行數字。
  if (facts.toplevel !== undefined && realpathSync(facts.toplevel) !== realpathSync(asked)) {
    return `問的是 ${asked}，而 git 回答的是 ${facts.toplevel} —— 這一行數字量的是另一棵樹。`;
  }
  // ② `0` 是這支工具最像真的錯誤答案：範圍寫壞、tag 解析到別的東西，
  //    `rev-list --count` 都回 0，而「剛發完版」本來就是 0。兩者用眼睛分不出來。
  //    真正的 0 有一個必然成立的伴隨事實：HEAD 就是那個 tag。
  if (facts.commits === 0 && facts.head !== undefined && facts.head !== facts.tagCommit) {
    return `數出 0 支，但 HEAD（${facts.head.slice(0, 8)}）不是 ${facts.tag ?? "?"} 指到的 commit —— 那個 0 是範圍壞掉，不是剛發完版。`;
  }
  // ③ tag 名字讀得到、而它指到的 commit 讀不到：後面每一個數字都是從空氣算出來的，
  //    但輸出裡仍然會出現那個 tag 的名字，看起來像量到了。
  if (facts.tag !== undefined && facts.tagCommit === undefined) {
    return `讀得到 tag 名字 ${facts.tag}，卻解析不出它指到的 commit —— 後面的數字沒有來源。`;
  }
  return undefined;
}

export function format(result: Report): string {
  if (result.kind === "unmeasurable") {
    return `ℹ 距上一個 tag：量不到 —— ${result.why}`;
  }
  const days = result.days.toFixed(1);
  const line = `ℹ 距 ${result.tag} 已 ${result.commits} 支 commit、${days} 天`;
  if (result.onFirstParent) return line;
  return (
    `${line}\n` +
    `  ⚠️ ${result.tag} 不在 HEAD 的第一父鏈上 —— 這個數字會與人數出來的分岔（C169 §四）。`
  );
}
