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
 * ── ⚠️ 只守 README 與 HANDOFF，**刻意不守 DECISIONS.md** ────────────
 *
 * 這是整個設計的樞紐。DECISIONS.md 是一份**有日期的決策日誌**：
 * 「C24 當時是 467 個套件」在寫下的那一刻是真的，而且**現在仍然是真的** ——
 * 它陳述的是歷史，不是現況。
 *
 * 守它等於要求每次相依變動都回頭改寫歷史記錄，那比數字過期更糟：
 * 一份被持續改寫的決策日誌，就不再是決策日誌了。
 *
 * README 與 HANDOFF 不一樣 —— 它們用現在式描述「這個系統現在是什麼樣子」。
 * 那種句子過期就是錯的。
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
 */

export interface Fact {
  readonly id: string;
  /** 這個數字是什麼意思。出現在錯誤訊息裡。 */
  readonly describe: string;
  /** 權威來源，寫給讀訊息的人看。 */
  readonly source: string;
  /**
   * 引用這個事實的句子。每個樣式必須**恰好一個**捕獲群組，就是那個數字。
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
      // README：「腳手架帶進來的東西比想像的多：**467 個套件，其中…」
      /\*\*(\d+) 個套件，其中/,
      // HANDOFF：「- 467 個套件全帶 sha512 integrity」
      /(\d+) 個套件全帶 sha512 integrity/,
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
    citations: [/\*\*(\d+) 個沒有 SLSA provenance\*\*/],
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

    let cited = 0;
    for (const document of documents) {
      for (const line of document.source.split("\n")) {
        for (const citation of fact.citations) {
          const match = citation.exec(line);
          if (match === null) continue;
          cited += 1;
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

    if (cited === 0) {
      problems.push({
        kind: "never-cited",
        detail:
          `事實 ${fact.id}（${fact.describe}）在被守的文件裡一個引用都找不到。\n` +
          "      句子被改寫了，還是那段被刪了？登記的樣式對不到東西的話，這條就等於沒在守。",
      });
    }
  }

  return problems;
}
