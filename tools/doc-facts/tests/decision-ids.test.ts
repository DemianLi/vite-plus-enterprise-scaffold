import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/**
 * 決策日誌的編號指得到嗎 —— `C<n>`／`D<n>`／`R<n>` 引用到的東西必須存在（C141）。
 *
 * ── 為什麼這條規則守得住一份「有日期的日誌」 ────────────────────────
 *
 * `doc-facts` 的 `GUARDED` 刻意不含決策日誌（`src/cli.ts:25`）：那是歷史，
 * 「C24 當時是 467 個套件」在當時是真的，守它等於要求回頭改寫歷史。
 *
 * **指不到的編號不是同一件事。** 條目從不被刪除，所以一個指不到的編號
 * **從寫下的那一刻就是死的**，不是後來過期的 —— C99 逐個 commit 查過 50 個
 * 版本才得出這句話，這裡沿用它，射程從 `HANDOFF.md` 換成決策日誌自己。
 *
 * ── 失敗方向 ────────────────────────────────────────────────────────
 *
 * 與 C99 同一個：讀的人不會知道那一則不存在，只會以為自己漏讀了。
 *
 * ── ⚠️ 這條規則刻意**不**用 C99 的指路動詞代理 ──────────────────────
 *
 * 量過（2026-08-30，`d4c4925`）：全樹 2,975 個編號引用，其中帶指路動詞
 * （見／參照／詳見／參見）的只有 **171 個**。改用那個代理，偽陽性歸零，
 * 但守備範圍剩 5.7%，而且 C99 自己的檔頭寫著那個代理繞得過去
 * （「HANDOFF 的 R7 有詳細說明」）。這裡選寬掃 ＋ 一個具名豁免。
 */

/** 版控裡的每一個檔（C73／C98：事實來源是 `git ls-files`，不是 `readdirSync`）。 */
function trackedFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`[decision-ids] git ls-files 失敗：${result.stderr}`);
  return result.stdout.split("\0").filter(Boolean);
}

/**
 * ⚠️ **`reports/` 不在射程內，而理由比看起來的弱 —— 寫下來免得下一個人高估它。**
 *
 * 唯一站得住的理由是 `reports/research/rigs/README.md:6` 那句沒有修飾語的
 * 「**這個目錄沒有任何機制在守**」：掃它就讓那句話變成假的，而 `#199` 明文
 * 不動別人的射程宣告。代價逐日長：`d4c4925`（2026-08-30）量到 3 個檔、46 個引用；
 * `dac91ce`（2026-09-01）是 **6 個檔、119 個引用**，兩天 2.6 倍。**兩次都全部指得到。**
 *
 * ⚠️ 上一版把 46 那個數字寫成沒有時戳的現況，而 `#232` 拿它估過這個選項的代價 ——
 * 所以這裡改成**標明那一天那個 commit**（C137 §五 的老招）。要現在的數，跑一次量測。
 * ⚠️ **改的是這段成本估計，不是下面那一行射程** —— 射程一個字未動（C159 §六）。
 *
 * ⚠️ **「那是凍結的研究稿、算歷史」不能拿來當理由** —— 那個論證對決策日誌
 * 本身也成立，而上面整段檔頭正是在說它不成立。要把 `reports/` 收進來，
 * 改這一行 ＋ 改那句 README，兩件事一起做。
 */
const OUT_OF_SCOPE = "reports/";

/**
 * **確知不存在、而且樹上有句子在陳述這件事**的編號。
 *
 * `C51` 從未使用，而樹上提到它的每一處都是在陳述這件事 ——
 * **記錄那個洞存在的句子，被守它的規則判成缺陷**。這個形狀在 C139 §三 有紀錄
 * （⚠️ 那裡把它記在已刪分支 `release/v1` 的編號下，`main` 的同號是另一件事）。
 *
 * ⚠️ **不要在這裡寫「共 N 處」** —— 談論這份豁免本身就會製造更多被豁免的引用
 * （本檔與 C141 兩份就把它從 4 推到 18）。要現在的數，跑一次量測；
 * 帶基準 commit 的那個數在 C141 §八。
 *
 * ⚠️ **這份豁免不是可以續加的白名單，也不是一顆可以轉鬆的旋鈕。** 要再加一個
 * 編號進來，那是一則裁決，不是一次編輯（AGENTS.md 規則二）。下面有一條夾具斷言：
 * `C51` 哪天真的被用了，這份豁免當場變成錯的，測試會紅並要你把它拿掉。
 */
const ABSENT = new Set(["C51"]);

/** `\b` ＋ 三位數上界 —— 少了任何一個，`pnpm-lock.yaml` 的 sha512 會灌出 145 個假命中（實測 145 → 1）。 */
const REFERENCE = /\b([CDR])(\d{1,3})\b/g;

/**
 * 決策日誌的每一卷。分卷是靠**檔名體例**找的，**不是靠「C138 為界」那句散文**
 * （C140 §五.2 記著那句話會腐爛而沒有東西在守 —— 這裡是拆掉對它的依賴，不是修好它）。
 *
 * ⚠️ 拆成「首卷 ＋ 續卷樣式」而不是一條 `(-\d+)?` 的樣式：後者的可選群組裡包著
 * 量詞，`security/detect-unsafe-regex` 會擋下來。
 */
const FIRST_VOLUME = "DECISIONS.md";
const LATER_VOLUME = /^DECISIONS-\d+\.md$/;

/**
 * ⚠️ **事實來源是版控，不是 `readdirSync`** —— 與上面那支同一條規矩（C73／C98）。
 * 讀磁碟的話，工作區裡一份還沒 `git add` 的續卷會讓它的條目進入定義集：
 * **本機綠、CI 紅**，而紅的訊息會說「這個編號不存在」。
 */
function volumes(files: string[]): string[] {
  return files.filter((name) => name === FIRST_VOLUME || LATER_VOLUME.test(name));
}

interface Definitions {
  C: Set<number>;
  D: Set<number>;
  R: Set<number>;
}

/**
 * 三串編號，**三種體例**（C140 §二）—— 定義集因此要用兩種抽法。
 *
 * `C`／`D` 每則一個 `### ` 標題；**`R` 是一張登記表**，只有需處置的那幾條
 * 另開專節。拿 `### ` 去量 R，R7／R9 會被判成不存在 —— 那個誤讀已經
 * 獨立發生三次（#189）。
 */
function definitions(files: string[]): Definitions {
  const text = volumes(files)
    .map((name) => readFileSync(join(ROOT, name), "utf8"))
    .join("\n");
  const collect = (pattern: RegExp): Set<number> =>
    new Set([...text.matchAll(pattern)].map((match) => Number(match[1])));

  return {
    C: collect(/^### *C(\d+)\b/gm),
    D: collect(/^### *D(\d+)\b/gm),
    R: collect(/^\| *R(\d+) *\|/gm),
  };
}

/** 一則條目的**定義標題**：在哪一卷、第幾行、認領哪一個編號。 */
interface Heading {
  readonly id: string;
  readonly file: string;
  readonly line: number;
}

/**
 * ⚠️ **這是第二把尺，而它與 `definitions()` 那一把刻意不同 —— 理由與代價都在這裡。**
 *
 * `definitions()` 問的是「這個編號存不存在」，答案進 `Set`，**重複在那裡塌成一個**
 * （C173 §二）。要數「同一個號被幾則條目認領」就不能用同一把尺。
 *
 * 差別只有一處：這把要求編號後面**跟著破折號**（`### C171 —`），因為那是一則
 * **定義**的形狀。`### D14 下半：Pinia 的界線`（`DECISIONS.md:403`，2026-08-15 起）
 * 是 D14 的**續節**，不是第二則 D14 —— 寬的那把尺吃得下它，於是天真的重複檢查
 * **今天就會在 `main` 上紅**。⚠️ `#262` 票面寫「加一條斷言不難」，那句話是錯的。
 *
 * ⚠️ **破折號後面不可以要求空格**：`DECISIONS.md:1633` 是
 * `### C37 —「這個應用怎麼上樣式」…`，破折號直接接引號。下一個把樣式收緊成
 * `— ` 的人會讓 C37 掉出去，而掉出去的方向**不會紅**（它只是少數一則）。
 *
 * ⚠️ **兩把尺會漂開**，所以下面有一條夾具斷言它們對「有哪些編號」完全同意。
 * `R` 不在這個問題裡：它的定義樣式就是登記表的列，兩把尺是同一把。
 */
function headingsIn(file: string, source: string): Heading[] {
  const found: Heading[] = [];
  source.split("\n").forEach((text, index) => {
    const entry = /^### *([CD])(\d+) *—/u.exec(text) ?? /^\| *(R)(\d+) *\|/u.exec(text);
    if (entry !== null) found.push({ id: `${entry[1]}${entry[2]}`, file, line: index + 1 });
  });
  return found;
}

function definitionHeadings(files: string[]): Heading[] {
  return volumes(files).flatMap((name) => headingsIn(name, readFileSync(join(ROOT, name), "utf8")));
}

/** 被兩則以上條目認領的編號，附上每一則在哪裡。 */
function duplicates(headings: readonly Heading[]): string[] {
  const byId = new Map<string, Heading[]>();
  for (const heading of headings) byId.set(heading.id, [...(byId.get(heading.id) ?? []), heading]);
  return [...byId.entries()]
    .filter(([, where]) => where.length > 1)
    .map(
      ([id, where]) =>
        `${id} 被 ${where.length} 則認領：${where.map((at) => `${at.file}:${at.line}`).join("、")}`,
    )
    .sort();
}

interface Dangling {
  file: string;
  line: number;
  id: string;
  text: string;
}

function danglingIn(file: string, source: string, defined: Definitions): Dangling[] {
  const found: Dangling[] = [];
  source.split("\n").forEach((text, index) => {
    for (const [id, series, number] of text.matchAll(REFERENCE)) {
      const series_ = series as keyof Definitions;
      if (defined[series_].has(Number(number)) || ABSENT.has(id)) continue;
      found.push({ file, line: index + 1, id, text: text.trim().slice(0, 60) });
    }
  });
  return found;
}

describe("決策日誌的編號指得到（C141）", () => {
  const tracked = trackedFiles();
  const defined = definitions(tracked);

  it("🔴 夾具：找得到兩卷以上，而每一卷都合乎檔名體例", () => {
    /**
     * ⚠️ 這條擋的是**兩個相反方向**。少一卷（改名、搬走）→ 定義集縮小 →
     * 一整批引用變成假的紅燈；多一卷（`DECISIONS-DRAFT.md` 之類）→ 定義集
     * **安靜地變寬**，而變寬的方向不會有任何紅燈。後者是這條唯一擋得到的地方。
     */
    expect(
      volumes(tracked),
      "決策日誌的卷數變了。**少**了一卷（改名／搬走）→ 定義集縮小，一整批引用會變成" +
        "假的紅燈；**多**了一卷 → 先確認檔名合乎 `DECISIONS-<n>.md`，再把這裡改掉。" +
        "⚠️ 不合體例的那一卷不會紅在這裡，它會安靜地不進定義集。",
    ).toEqual(["DECISIONS-2.md", "DECISIONS.md"]);
  });

  it("🔴 夾具：`R` 的定義集來自登記表，而 R7／R9 一定要在裡面", () => {
    /**
     * ⚠️ 這一條是掛在被守對象上的絆線，不是體例的複述。有人把抽法「簡化」成
     * `### R<n>`（那正是最直覺的寫法）時，R7／R9 會從定義集掉出去 ——
     * 而掉出去之後，指向它們的引用會紅，紅的訊息會說「這個編號不存在」。
     */
    expect(
      [...defined.R].sort((a, b) => a - b),
      "R 的定義集不是那張九列的登記表了",
    ).toContain(7);
    expect([...defined.R], "R9 不在定義集裡 —— 抽法被換成 `### R<n>` 了？").toContain(9);
    expect(defined.R.size, "登記表的列抽不出來（格式漂移）").toBeGreaterThanOrEqual(9);
  });

  const headings = definitionHeadings(tracked);

  it("🔴 夾具：兩把尺對「有哪些編號」完全同意", () => {
    /**
     * ⚠️ `definitions()`（寬）與 `headingsIn()`（嚴）是**兩份名冊**，而這棵樹
     * 一再栽在「同一件事有兩份寫法然後它們漂開」上。漂開的方向是安靜的：
     * 嚴的那把漏掉一則 → 那一則的重複永遠不會被數到，而**寬的那把仍然全綠**。
     *
     * ⚠️ 這一條擋不到「兩把尺同時漏掉同一則」—— 那要 `## 定義集` 那兩條夾具。
     */
    const strict = {
      C: new Set(
        [...headings].filter((h) => h.id.startsWith("C")).map((h) => Number(h.id.slice(1))),
      ),
      D: new Set(
        [...headings].filter((h) => h.id.startsWith("D")).map((h) => Number(h.id.slice(1))),
      ),
      R: new Set(
        [...headings].filter((h) => h.id.startsWith("R")).map((h) => Number(h.id.slice(1))),
      ),
    };
    for (const series of ["C", "D", "R"] as const) {
      expect(
        [...strict[series]].sort((a, b) => a - b),
        `${series} 的兩把尺不同意了 —— 嚴格式（要求破折號）與寬鬆式（\\b）抽出的編號集必須一樣。` +
          "⚠️ 差集若只在嚴格式那邊少，重複檢查會安靜地漏掉那一則。",
      ).toEqual([...defined[series]].sort((a, b) => a - b));
    }
  });

  it("🔴 夾具：`C51` 仍然沒有被使用 —— 那份豁免的前提", () => {
    /**
     * C97 §三之二 那條教訓：豁免會在它不再需要的那天安靜地變成一個洞。
     * `C51` 哪天真的成為一則條目，`ABSENT` 就從「陳述一個空號」變成
     * 「放行一個真的引用」—— 而那會安靜地發生。
     */
    for (const id of ABSENT) {
      const number = Number(id.slice(1));
      expect(defined.C.has(number), `${id} 已經是一則條目了 —— 把它從 ABSENT 拿掉`).toBe(false);
    }
  });

  it("🔴 版控裡沒有指不到的 C／D／R 編號", () => {
    const problems = tracked
      .filter((file) => !file.startsWith(OUT_OF_SCOPE))
      .flatMap((file) => danglingIn(file, readFileSync(join(ROOT, file), "utf8"), defined));

    expect(
      problems.map((problem) => `${problem.file}:${problem.line} → ${problem.id}｜${problem.text}`),
      "有引用指向不存在的編號 —— **改那個引用**（打錯字就改掉，指向還沒寫的條目" +
        "就先把條目寫出來）。⚠️ **不要動本檔的 `ABSENT`**：那不是門檻旋鈕，是一份" +
        "「確知從未使用」的事實登記，而放寬它就是改閘門來換綠燈（AGENTS.md 規則二）。" +
        "如果你判斷真的又出現了一個空號，**停下來告訴人**，那要一則裁決。",
    ).toEqual([]);
  });

  it("🔴 沒有一個編號被兩則條目認領（C173）", () => {
    expect(
      duplicates(headings),
      "有兩則條目認領同一個編號 —— **改其中一則的號**，並把指向它的引用一起改。\n" +
        "      ⚠️ C141 那條（上面那則）**看不到這件事**：它問的是「引用指得到嗎」，" +
        "而一個重複的編號照樣指得到，只是指到兩則不同的裁決。\n" +
        "      ⚠️⚠️ **這一條守的是「重複已經進了同一棵樹」，不是「兩張並行的票各自認領同一個號」**：" +
        "後者發生在寫下之前，任何讀單一工作樹的檢查都看不到它（C173 §三）。",
    ).toEqual([]);
  });

  it("★ 這條規則真的咬得到 —— 合成一個不存在的編號", () => {
    /**
     * ⚠️ 沒有這一條的話，樣式寫錯（少了 `\b`、上界寫成 `\d{4}`）會讓上面那條
     * 永遠綠，而那跟「樹是乾淨的」長得一模一樣。
     *
     * ⚠️ **樣本是算出來的，不是寫死的** —— 寫死一個不存在的編號，那個字面量
     * 自己就會被上面那條掃到，這支測試會讓整棵樹紅在它自己的夾具上。
     */
    const ghost = Array.from({ length: 999 }, (_, index) => index + 1).find(
      (number) => !defined.C.has(number) && !ABSENT.has(`C${number}`),
    );
    expect(ghost, "1–999 全被用完了 —— 這條樣本產生器要重寫").toBeDefined();

    const line = `詳見 C${ghost} 的第三節。`;
    expect(danglingIn("(合成)", line, defined).map((problem) => problem.id)).toEqual([`C${ghost}`]);
  });

  it("★ 重複那條真的咬得到 —— 合成一則重號，而續節標題不算", () => {
    /**
     * ⚠️ 斷言的是**恰好那一個 id**，不是「有東西紅了」：這棵樹記過，一條被
     * 短路的偵測器可以因為別的原因紅，而「紅了」與「抓到了」長得一樣。
     *
     * 第二段是這一條真正的內容：`### D<n> 下半：…` 這個形狀**不可以**被算成
     * 第二則定義，否則整棵樹今天就紅了（`DECISIONS.md:403` 就是這個形狀），
     * 而下一個人會去改 `DECISIONS.md`。
     *
     * ⚠️ 編號**是算出來的**，理由與上面那條 ★ 同一個：寫死一個字面量，
     * 上面那條「指不到的編號」會把這支測試自己掃成違規。
     */
    const spare = (taken: Set<number>): number => {
      const free = Array.from({ length: 999 }, (_, index) => index + 1).find(
        (number) => !taken.has(number),
      );
      expect(free, "1–999 全被用完了 —— 這條樣本產生器要重寫").toBeDefined();
      return free as number;
    };
    const c = spare(defined.C);
    const d = spare(defined.D);

    const source = [
      `### C${c} — 合成的一則`,
      "內文",
      `### C${c} — 合成的另一則，同號`,
      `### D${d} — 合成的 D`,
      `### D${d} 下半：續節，不是第二則定義`,
    ].join("\n");

    expect(duplicates(headingsIn("(合成)", source)).map((line) => line.split(" ")[0])).toEqual([
      `C${c}`,
    ]);
  });
});
