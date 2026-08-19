/**
 * 文件裡的數字，與它們**推導得出來的**事實來源。
 *
 * ── 這個 repo 在這件事上一再栽跟頭 ──────────────────────────────────
 *
 * C17／C24／C25／C27／C31／C36 各一次、這一輪的 §11 II ⑦ 註記，
 * 以及 2026-08-16 出初版前掃出的〈先看這張表〉三個數字（見下方一節）。
 * 形狀每次都一樣：**一個人抄下來的數字，沒有人再推導一次。**
 *
 * ⚠️ 這裡刻意**不寫「N 次」**。第一版寫了「七次」，而那個數字被抄進另外
 * 四個檔案；等到這一類錯誤又發生一次的時候，五份同時變成假的 ——
 * **一句在講「不要抄數字」的話，本身是一個被抄的數字。**
 * 上面那串是**列舉**：加一件就多一項，不需要有人記得去改一個計數（C53）。
 *
 * 這支工具守的是**有 repo 內部事實來源**的那些數字。
 *
 * ── A1：只守推導得出來的 ────────────────────────────────────────────
 *
 * 「四個目標平台」「約 4 MB」這種數字沒有 repo 內的權威來源，守不了 ——
 * 硬守只能靠人再抄一次期望值到這裡，那是把同一個問題換個地方犯。
 *
 * ── ⚠️ 守用現在式寫的文件，**刻意不守 DECISIONS.md** ─────────────────
 *
 * 守哪幾份由 `cli.ts` 的 `GUARDED` 決定 —— 這裡不重抄一次檔名清單。
 * 判準是：**被 README 或 HANDOFF 指過去、而且用現在式寫的，就要進去。**
 *
 * 這是整個設計的樞紐。DECISIONS.md 是一份**有日期的決策日誌**：
 * 「C24 當時是 467 個套件」在寫下的那一刻是真的，而且**現在仍然是真的** ——
 * 它陳述的是歷史，不是現況。
 *
 * 守它等於要求每次相依變動都回頭改寫歷史記錄，那比數字過期更糟：
 * 一份被持續改寫的決策日誌，就不再是決策日誌了。
 *
 * 被守的那幾份不一樣 —— 它們用現在式描述「這個系統現在是什麼樣子」。
 * 那種句子過期就是錯的。
 *
 * ⚠️ `UI-SURVEY.md` 是 2026-08-16 才補進來的，而**補的當下它就有一句過期的**
 * （467 套件／121 原生二進位，實際 563／144）。它一直沒被守的理由很平庸：
 * 它不在根目錄那三份的直覺清單裡。但 README 與 HANDOFF 第 14 項都把讀者
 * 直接指過去 —— **被指過去的文件，讀者不會知道它守備等級比較低。**
 *
 * （`exit-drill` 確實會檢查 DECISIONS.md，那是刻意的例外：
 *  它守的那一句宣稱的是**當前**的演練成績，不是歷史。）
 *
 * ── 為什麼是「整句樣式」而不是「任何 N 個 X」 ──────────────────────
 *
 * `HANDOFF.md` 裡「8 個原生二進位」（授權實測的那一批）、「22 個原生二進位」
 *（lightningcss 那一批）都是**子集**，不是總數。用寬鬆樣式去比對總數，
 * 這道閘門第一天就會對著兩個正確的數字亂叫。
 *
 * 所以每個事實登記的是**它被引用的那幾個句子**。改寫句子會讓樣式對不上，
 * 而那會變成 `never-cited` 的紅燈 —— 失敗方向是安全的：
 * 它逼人回來確認那句話還在不在，而不是靜靜地不再守它。
 *
 * ── 摘要表是最先被讀的，卻是最後被登記的（2026-08-16 補）─────────────
 *
 * 第一版登記的是**內文**裡的句子。出初版送人工審查前重掃一次，發現
 * `HANDOFF.md` 開頭那張〈先看這張表〉有三個數字過期得很嚴重：
 *
 *     121 個二進位 → 實際 144    32 個只有簽章 → 實際 43
 *     鏡像 467 個套件 → 實際 563
 *
 * 而這道閘門一直是綠的 —— 因為那三句話從來沒有被登記過。
 *
 * 這比內文過期糟得多：摘要表是拿去開會投影的那一頁，也是採購與資安
 * **唯一會讀完**的一頁。教訓不是「再多登記幾句」，是**登記的順序反了** ——
 * 新增引用時，先問「這句話會不會被單獨拿出去用」，會的話優先登記。
 */

export interface Fact {
  readonly id: string;
  /** 這個數字是什麼意思。出現在錯誤訊息裡。 */
  readonly describe: string;
  /** 權威來源，寫給讀訊息的人看。 */
  readonly source: string;
  /**
   * 引用這個事實的句子。兩條硬性要求，**兩條都由 `facts.test.ts` 釘住**：
   *
   *   1. **恰好一個捕獲群組**，就是那個數字。兩個群組的話 `match[1]`
   *      可能不是它，而比對會安靜地錯。
   *   2. **不得帶 `g` 旗標。** 這些是模組層級的共用物件，而底下用的是
   *      `exec`；帶 `g` 的 regex 會在物件上累積 `lastIndex`，於是同一個
   *      樣式跑到第二行時從中間開始比對 —— 症狀是**時有時無地漏掉命中**，
   *      看起來像文件沒問題。（`HEADING` 確實帶 `g`，但它只餵給
   *      `matchAll`，那是安全的用法。）
   *
   * 刻意全是單層量詞（C19：security/detect-unsafe-regex）。
   */
  readonly citations: readonly RegExp[];
}

export const FACTS: readonly Fact[] = [
  {
    id: "api-entries",
    describe: "platform/ 被追蹤的進入點數",
    /**
     * 這兩筆是 2026-08-16 補的，補的當下兩個數字都是錯的
     *（文件寫 9 進入點／65 export，實際是 10／92）。
     *
     * 它們本來就在 HANDOFF 第 18 項的「有事實來源、還沒登記」那一格裡 ——
     * 也就是說「知道它沒守」這件事已經寫下來一段時間了，而那段時間裡
     * 那句話就一直是錯的。登記的成本是這四行。
     */
    source: "tools/api-surface/surface.json → surface 的鍵數",
    citations: [/api-surface（(\d+) 個進入點/],
  },
  {
    id: "api-exports",
    describe: "platform/ 被追蹤的 export 總數",
    source: "tools/api-surface/surface.json → surface 各進入點的鍵數總和",
    citations: [/個進入點／(\d+) 個 export）/],
  },
  {
    id: "contract-items",
    describe: "D8 中間層的可執行契約條目數",
    /**
     * 引用最多的一個（5 句），而且兩份文件的**交付表**裡各有一句 ——
     * 那是拿去跟後端／gateway 團隊對規格的那一格。
     */
    source: "platform/bff-contract 的 CONTRACT_ITEMS",
    citations: [
      // HANDOFF：「它必須做到什麼（13 條可執行契約）」
      // HANDOFF 交付表：「D8 中間層的 13 條驗收條目」
      // README 資料夾結構：「中間層必須做到什麼（13 條契約條目）」
      /（(\d+) 條契約條目）/,
      // README：「全綠代表這一層滿足 D8。13 條契約條目、可覆寫的 env…」
      /D8。(\d+) 條契約條目/,
      // README 交付表：「13 條中間層契約條目、可覆寫的 env…」
      /(\d+) 條中間層契約條目/,
    ],
  },
  {
    id: "ui-components",
    describe: "platform/ui 的元件數",
    /**
     * 2026-08-19 補（#56）。⚠️ **補的當下那句話是對的，但它一路上錯過三次**
     * —— `UiInput` 進來時（#54）README 與 HANDOFF 三處都得手改，
     * 而漏改不會有任何檢查說話。這一批一次加五個，那三處要一起動。
     *
     * 登記它的成本是這幾行；不登記的成本是每一批元件都重新賭一次。
     */
    source: "git ls-files platform/ui/src/components 底下的 .vue 數",
    citations: [
      // README〈已知限制〉：「platform/ui 目前只有八個元件」
      // HANDOFF〈已知的誠實缺口〉：「platform/ui 只有八個元件」
      /`platform\/ui` (?:目前)?只有 (\d+) 個元件/,
      // HANDOFF 承諾三：「…三個元件都被檢查過」／〈缺口〉：「…都被檢查器驗過」
      /\*\*(\d+) 個元件都被檢查/,
    ],
  },
  {
    id: "workspace-packages",
    describe: "workspace 內的 package 數",
    source: "pnpm-workspace.yaml 的 packages 樣式底下的 package.json 數",
    citations: [/底下 (\d+) 個 workspace 套件/],
  },
  {
    id: "action-refs",
    describe: "workflow 裡 `uses:` 的引用處數",
    /**
     * ⚠️ 登記這一筆的當下，被引用的兩句都是錯的（寫 16，實際 17）——
     * 而它們是 2026-08-16 才寫下的，寫的人（同一個）當時沒有數。
     *
     * 更麻煩的是**同一個詞被用來指兩件事**：「16 個 action」講的是引用處，
     * 「8 個 action」講的是不重複的 action。已把句子改成「N 處引用」與
     * 「N 個 action」，這兩個事實才分得開。
     *
     * ⚠️ **第 23 項裡另外兩句寫著同一個數字，但它們刻意不登記** ——
     * 「~~17 處引用全用可移動的標籤~~」（摘要表，刪除線）與
     * 「17 處引用全部以標籤釘住：`actions/checkout@v7`…」（問題陳述）
     * 講的是**修好之前**的狀態。加第 18 個引用時，那兩句不會變成錯的；
     * 把它們改成 18 才會 —— 那是「守它等於要求改寫歷史」，
     * 與 DECISIONS.md 不進守備範圍是同一條理由。
     *
     * 這條界線與 CODEOWNERS 那一筆是同一種判斷，只是換了個形狀：那邊是
     * 「數字推導不出來」，這邊是「句子講的是過去式」。
     */
    source: ".github/workflows/*.yml 裡的 `uses:` 行數",
    citations: [
      // HANDOFF 第 23 節：「8 個 action（17 處引用）全部改成 commit SHA」——
      // 這一句講的是**現況**，所以只有它被登記。
    ],
  },
  {
    id: "distinct-actions",
    describe: "workflow 引用到的不重複 action 數",
    source: ".github/workflows/*.yml 裡 `uses:` 去掉 @ 版本後的不重複值",
    citations: [/\*\*(\d+) 個 action（/],
  },
  {
    id: "codeowners-entries",
    describe: "CODEOWNERS 的條目數",
    /**
     * 這一筆是**降級**來的，而降級本身是這次掃描的主要發現。
     *
     * 文件原本四處寫著「22 條全部是 Unknown owner」。那個 22 來自
     * `gh api …/codeowners/errors` —— **GitHub 的輸出，不是 repo 裡的數字**。
     * 實測它與本地任何一種算法都對不上：C40 量到 22 的那個 commit，檔案是
     * 14 條條目、21 個 owner 引用。
     *
     * 而那句話用現在式寫在〈先看這張表〉第 15 列（「採用的第一步」）。
     * 它現在是 20 條 —— 也就是那句話在被引用得最多的那一頁上是錯的。
     *
     * 處理方式照第 18 項自己的判準：**可推導的那半（條目數）登記起來，
     * 不可推導的那半（GitHub 判定幾條無效）留在文件裡但標上量測日期**，
     * 不要讓它看起來像被守著的。
     */
    source: "CODEOWNERS 裡非註解、非空白的行數",
    citations: [
      // HANDOFF 摘要表第 15 列：「現在 20 條條目全是 @org/* 佔位符」
      // HANDOFF 第 15 節：「CODEOWNERS 裡的 20 條條目全部是佔位符」
      /裡的 (\d+) 條條目全部是佔位符/,
    ],
  },
];

export interface DocumentSource {
  readonly path: string;
  readonly source: string;
}

export interface FactProblem {
  readonly kind: "mismatch" | "never-cited" | "no-documents";
  readonly detail: string;
}

/**
 * 核對。`truth` 是每個事實推導出來的值。
 *
 * 回傳空陣列＝通過。**沒有任何一條會因為「找不到那句話」而放行** ——
 * 找不到會變成 `never-cited`，理由見檔頭。
 */
export function checkFacts(
  documents: readonly DocumentSource[],
  truth: Readonly<Record<string, number>>,
  facts: readonly Fact[] = FACTS,
): readonly FactProblem[] {
  const problems: FactProblem[] = [];

  if (documents.length === 0) {
    return [
      {
        kind: "no-documents",
        detail: "一份文件都沒讀到 —— 檔案列舉壞了，而零個不符不是通過。",
      },
    ];
  }

  for (const fact of facts) {
    const expected = truth[fact.id];
    if (expected === undefined) {
      problems.push({
        kind: "never-cited",
        detail: `事實 ${fact.id} 沒有推導出值 —— 事實來源讀不到（${fact.source}）。`,
      });
      continue;
    }

    // ⚠️ 計數是**逐個樣式**的，不是逐個事實。
    //
    // 第一版是後者，而那讓這個機制的一半失效：`families` 同時被 README 與
    // HANDOFF 引用，刪掉 HANDOFF 那一句之後總數仍然是 1，閘門照樣綠 ——
    // 也就是說「改寫句子會變成紅燈」只在**最後一個**引用被改寫時才成立。
    //
    // 一個對不到任何東西的樣式，就是一個不再守著任何東西的樣式。
    const hits = new Map<RegExp, number>(fact.citations.map((citation) => [citation, 0]));

    for (const document of documents) {
      for (const line of document.source.split("\n")) {
        for (const citation of fact.citations) {
          const match = citation.exec(line);
          if (match === null) continue;
          hits.set(citation, (hits.get(citation) ?? 0) + 1);
          const claimed = Number(match[1]);
          if (claimed === expected) continue;
          problems.push({
            kind: "mismatch",
            detail:
              `${document.path} 寫著 ${claimed}，而${fact.describe}是 ${expected}\n` +
              `      來源：${fact.source}\n` +
              `      句子：${line.trim().slice(0, 90)}`,
          });
        }
      }
    }

    for (const [citation, count] of hits) {
      if (count > 0) continue;
      problems.push({
        kind: "never-cited",
        detail:
          `事實 ${fact.id}（${fact.describe}）的其中一個樣式對不到任何句子：\n` +
          `      ${citation.source}\n` +
          "      句子被改寫了，還是那段被刪了？對不到東西的樣式就是不再守著任何東西。",
      });
    }
  }

  return problems;
}
