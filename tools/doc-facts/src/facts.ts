/**
 * 文件裡的數字，與它們**推導得出來的**事實來源。
 *
 * ── 這個 repo 在這件事上已經栽了七次 ────────────────────────────────
 *
 * C17／C24／C25／C27／C31／C36 各一次，加上這一輪的 §11 II ⑦ 註記。
 * 形狀每次都一樣：**一個人抄下來的數字，沒有人再推導一次。**
 *
 * `tools/exit-drill` 已經守住其中一個（演練的測試數）。這裡把守備範圍
 * 擴大到其餘**有 repo 內部事實來源**的數字。
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
    id: "packages",
    describe: "lockfile 裡的套件總數",
    source: "tools/supply-chain/inventory.json → totals.packages",
    citations: [
      // README：「腳手架帶進來的東西比想像的多：**563 個套件，其中…」
      /\*\*(\d+) 個套件，其中/,
      // HANDOFF：「- 563 個套件全帶 sha512 integrity」
      /(\d+) 個套件全帶 sha512 integrity/,
      // ⬇ 以下三句是 2026-08-16 補的，見本檔「摘要表是最先被讀的」一節。
      // HANDOFF 摘要表第 5 列：「內部 registry 鏡像 **563 個**套件」
      /鏡像 \*\*(\d+) 個\*\*套件/,
      // HANDOFF 第 5–7 節的指令註解：「# 563 筆，含 sha512，可直接餵給鏡像工具」
      /(\d+) 筆，含 sha512/,
      // HANDOFF 交付表：「563 筆鏡像清單，含 sha512」
      /(\d+) 筆鏡像清單/,
      // UI-SURVEY 的既有約束表：「供應鏈閘門（563 套件／144 原生二進位進版控）」
      /閘門（(\d+) 套件/,
    ],
  },
  {
    id: "native",
    describe: "平台限定的原生二進位總數",
    source: "tools/supply-chain/inventory.json → totals.native",
    citations: [
      /其中 (\d+) 個是平台限定的原生二進位/,
      /(\d+) 個原生二進位裡有/,
      /核准 \*\*(\d+) 個平台原生二進位/,
      /那 (\d+) 個在安裝時不執行任何腳本/,
      // HANDOFF 摘要表第 2 列：「原生工具鏈的**政策性**例外（144 個二進位）」
      /例外（(\d+) 個二進位）/,
      // UI-SURVEY 的既有約束表：「…／144 原生二進位進版控）」
      /／(\d+) 原生二進位進版控/,
    ],
  },
  {
    id: "families",
    describe: "原生二進位的家族數",
    source: "tools/supply-chain/inventory.json → totals.families",
    citations: [/分屬 (\d+) 個家族/, /(\d+) 個家族\*\*的例外/],
  },
  {
    id: "no-slsa",
    describe: "只有發佈簽章、沒有 SLSA provenance 的原生二進位數",
    source: "tools/supply-chain/provenance.json → totals['registry-signature']",
    citations: [
      /\*\*(\d+) 個沒有 SLSA provenance\*\*/,
      // HANDOFF 摘要表第 3 列：「接受 43 個只有發佈簽章的佐證」
      /接受 (\d+) 個只有發佈簽章的佐證/,
      // HANDOFF 第 2–3 節：「43 個只有 npm 發佈簽章（可驗發佈者…）」
      /(\d+) 個只有 npm 發佈簽章/,
      // 同節的警語：「43 個沒有 provenance 的那批含全部 20 個 …」
      /(\d+) 個沒有 provenance 的那批/,
    ],
  },
  {
    id: "slsa",
    describe: "有 SLSA provenance 的原生二進位數",
    /**
     * 與 `no-slsa` 是同一份 JSON 的另一半。分成兩個事實而不是一個，
     * 是因為文件裡**兩個數字都出現**（「101 個有／43 個只有簽章」），
     * 而只守其中一個的話，另一個過期時整句話讀起來仍然像對的 ——
     * 那比兩個都不守更糟，因為它有一半是真的。
     */
    source: "tools/supply-chain/provenance.json → totals['slsa-provenance']",
    citations: [/(\d+) 個有 SLSA provenance/],
  },
  {
    id: "handoff-items",
    describe: "HANDOFF.md 收錄的交辦事項數",
    /**
     * 數的是**不重複的項次編號**，包含已經決策完畢的那幾項。
     *
     * 這個定義要寫死在這裡，因為它有三個都說得通的算法，而目前文件寫的
     * 「13 件事」**三個都不是**（不重複項次 15、最大編號 16、未決項 14）——
     * 也就是說它從來就是抄的。
     *
     * 選「不重複項次」的理由是它最不會漂移：判斷「未決」要去解析 ✅ 標記，
     * 而那個標記的寫法沒有約定，第一次有人改寫成別的樣子，
     * 這個數字就會安靜地變成另一個意思。
     *
     * 已決策的項目仍然算 —— README 那句是「**收的是** N 件事」，
     * 講的是這份文件收錄的範圍，不是待辦清單的長度。
     */
    source: "HANDOFF.md 的 `## N.` 與 `## N–M.` 標題",
    citations: [/只有組織能決定的 (\d+) 件事/],
  },
];

/**
 * `## 5–7.` 這種合併標題要展開成 5、6、7。破折號是全形的 –。
 *
 * ⚠️ 刻意寫成單一字元類再自己拆，**不是** `(\d+)(?:–(\d+))?`：
 * 後者是「可選群組裡包量詞」，被 security/detect-unsafe-regex 擋下。
 * 這個 repo 已經為那條規則改過四次程式碼（C19 記了前三次）——
 * 為了一行工具程式去關掉它，是在替後來的人降低那條規則的可信度。
 */
const HEADING = /^## ([\d–]+)\./gm;

export function handoffItemCount(source: string): number {
  const numbers = new Set<number>();
  for (const match of source.matchAll(HEADING)) {
    const [first = "", second] = (match[1] ?? "").split("–");
    const from = Number(first);
    if (!Number.isInteger(from)) continue;
    const to = second === undefined ? from : Number(second);
    if (!Number.isInteger(to) || to < from) continue;
    for (let at = from; at <= to; at += 1) numbers.add(at);
  }
  return numbers.size;
}

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
