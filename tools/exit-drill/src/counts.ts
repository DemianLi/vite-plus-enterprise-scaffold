/**
 * 演練成績的單一事實來源。
 *
 * ── 這裡防的是哪一種失敗 ────────────────────────────────────────────
 *
 * 「退到上游 Vite 可建置、**98 個測試全過**」這句話是拿去跟採購與稽核講的。
 * 而在 C36 修完之前，那個數字只存在於**手抄進三份文件的 10 個位置**，
 * `evidence.json` 裡根本沒有它。
 *
 * 後果是保證會發生的：每季重跑一次演練，測試數就變一次，那 10 處同時變成錯的，
 * 而且沒有人會發現 —— 這個 repo 在「人抄下來的數字沒有人再推導一次」上
 * 已經栽了六次（C17／C24／C25／C27／C31／C36）。
 *
 * 所以：演練把數字撈進 `evidence.json`，靜態檢查再拿文件去對。
 *
 * ── 為什麼只守測試數，不守耗時 ──────────────────────────────────────
 *
 * 耗時同樣被手抄（4 秒 → 17 秒也錯過一輪），但它的寫法在文件裡有好幾種
 *（「耗時 N 秒」「全程 N 秒（含 npm install）」），而「耗時」這兩個字
 * 在別的脈絡也出現（D5 的 lint 目標耗時表）。要守它就得靠更鬆的樣式，
 * 而更鬆的樣式會誤報。
 *
 * **一道會亂叫的閘門，三個月後會被某個趕著出貨的人加上 skip，然後永遠不會拿掉。**
 * 耗時是說明性的，測試數是實質主張 —— 只守後者，是刻意的取捨，不是漏掉。
 */

/**
 * ANSI 樣式碼。
 *
 * **vitest 即使輸出到 pipe 仍然上色**（`vp` 會傳 FORCE_COLOR 下去），所以擷取到的
 * 摘要實際長這樣：
 *
 *     \u001B[2m      Tests \u001B[22m \u001B[1m\u001B[32m98 passed\u001B[39m…
 *
 * 眼睛看不到這些碼（終端機會把它們吃掉），於是「輸出裡明明有那一行，正則卻不match」
 * 看起來像鬧鬼。第一版就是這樣卡住的 —— 而它是被「撈不到就當失敗」那條守衛
 * 擋下來的，不是被人看出來的。
 *
 * 刻意用剝除而不是設 `NO_COLOR`：環境變數要靠子行程願意遵守，剝除不用。
 *
 * ⚠️ 實作上**刻意不把 ESC 寫進正則字面值**：那會觸發 `no-control-regex`
 * （即使寫成 Unicode 跳脫也一樣），而這個 repo 的標準是 0 warnings。
 * 為了一行工具程式去關掉一條 lint 規則，是在替後來的人降低那條規則的可信度。
 * 改成先用 ESC 切段、再對每段開頭比對 CSI 序列 —— 正則裡一個控制字元都沒有。
 */
const ESC = String.fromCharCode(27);

/**
 * CSI SGR 序列，緊接在 ESC 之後：`[` ＋ 分號分隔的數字 ＋ `m`。
 *
 * 用單一字元類 `[\d;]*` 而不是 `\d*(?:;\d*)*`：後者是巢狀量詞，
 * 遇到 `[999999⋯` 這種沒有結尾 `m` 的輸入會指數回溯（ReDoS）。
 * Tier 2 的 security/detect-unsafe-regex 當場擋下來 —— 而這支函式吃的正是
 * 子行程的輸出。
 */
const SGR_PREFIX = /^\[[\d;]*m/;

export function stripAnsi(text: string): string {
  const [first = "", ...rest] = text.split(ESC);
  return first + rest.map((part) => part.replace(SGR_PREFIX, "")).join("");
}

/** `N passed`。刻意單獨一支：見 `passedOn` 為什麼不把它併進行首的樣式裡。 */
const PASSED = /(\d+) passed/;

/**
 * 撈出 `Tests` 或 `Test Files` 那一行的 **passed** 數字。
 *
 * ⚠️ **先挑行、再取數字，兩步**。有預期失敗時（C148）摘要長成
 * `Tests  4 failed | 493 passed (497)`，而把 `(?:\d+ failed \| )?` 併進
 * 行首那個樣式裡會被 `security/detect-unsafe-regex` 擋下來（實測過）——
 * 那條規則守的正是這支函式吃的東西：**子行程的輸出**。
 *
 * 拆成兩步之後兩個樣式都沒有相鄰的量詞，而且撈到的必然是 passed 那個數字，
 * 不會是 failed 那個。
 */
function passedOn(plain: string, label: "Tests" | "Test Files"): number | null {
  const prefix = label === "Tests" ? /^\s*Tests\s/ : /^\s*Test Files\s/;
  const line = plain.split("\n").find((candidate) => prefix.test(candidate));
  if (line === undefined) return null;
  const passed = PASSED.exec(line);
  return passed === null ? null : Number(passed[1]);
}

/** vitest 摘要行的樣式。撈不到就回 null，讓上層當成失敗處理，不要寫下 0。 */
export function parseTestCounts(output: string): { tests: number; testFiles: number } | null {
  const plain = stripAnsi(output);
  const tests = passedOn(plain, "Tests");
  const testFiles = passedOn(plain, "Test Files");
  if (tests === null || testFiles === null) return null;
  return { tests, testFiles };
}

/** 「N 個測試全過」／「N tests 全過」。中英兩種寫法在文件裡都真的出現。 */
const CLAIM = /(\d+)\s*(?:個測試|tests)\s*全過/g;

/**
 * 只有提到「上游」的那一行才算演練的成績。
 *
 * 因為同一個講法在這份文件裡有**兩種**用途：
 *
 *   演練的成績    「退到**上游** Vite 8.2.1⋯⋯98 個測試全過」
 *   本 repo 的測試「`vp run -r test` | **232 tests 全過**（16 個測試檔）」
 *
 * 兩個數字都對，但只有前者該跟 `evidence.json` 比。不分辨的話，這道閘門
 * 從第一天起就對著 232 那一列亂叫 —— 第一版就是這樣，被自己的測試抓到。
 *
 * 演練的說法一律是「退到**上游** Vite／上游 Vitest」，用它當錨點。
 */
const DRILL_CONTEXT = "上游";

/**
 * 講**第一次**那場演練的句子不比對。
 *
 * ── 為什麼需要這個例外 ──────────────────────────────────────────────
 *
 * 這道閘門原本要求每一句「退到上游⋯N 個測試全過」都等於 `evidence.json`。
 * 那對「最後一次跑出什麼」是對的，對**歷史紀錄**是錯的：
 * DECISIONS 有一段寫著「2026-08-15 首次實測結果：⋯上游 Vitest 108 個測試全過，
 * 全程 5 秒」——那是那一天真的發生的事。演練重跑之後把它改成新數字，
 * 等於**要求改寫歷史**，而那正是 `tools/doc-facts` 明白拒絕守 DECISIONS.md 的理由。
 *
 * 2026-08-16 重跑時這個衝突真的發生了（108 → 146），六處引用同時變紅，
 * 其中四處是敘述、一處是歷史。
 *
 * ── 為什麼「首次」是安全的錨點 ──────────────────────────────────────
 *
 * 因為**「首次」與「最後一次」互斥**：跑過兩次以上時，講首次的句子必然
 * 不是在講現況；只跑過一次時，兩個數字本來就相等。所以這個例外不會
 * 放掉任何一句真的在宣稱現況的話 —— 它只放掉明說自己在講第一次的那些。
 *
 * ⚠️ 它**不是**一個通用的「不想被守就加這幾個字」的出口。要寫的是
 * 「首次實測」這個具體事件，不是「當時」「那時候」這類模糊詞。
 */
const HISTORICAL = "首次實測";

/**
 * 會引用演練成績、而且**受這道閘門檢查**的文件。
 *
 * ⚠️ **`DECISIONS.md` 於 2026-08-16 移出（C64）。** 不是因為它不重要，
 * 是因為它扛錯了東西：那裡原本有四處抄著演練成績，而它是一份**有日期的
 * 決策日誌**。重跑演練（108 → 146）時那四處同時變紅，而把它們改成新數字
 * 會讓「2026-08-15 實測⋯」變成假的 —— **要求改寫歷史**。
 *
 * 那四處的論點本來就不需要那個數字（「Pinia 一個字沒改」才是重點），已拿掉；
 * 唯一真的在記錄歷史的那一句由上面的 `HISTORICAL` 豁免。
 *
 * 這與 `tools/doc-facts` 拒絕守 DECISIONS.md 是同一條判準，只是那邊守套件數、
 * 這邊守測試數。
 *
 * ⚠️ 住在這裡而不是 `cli.ts`：`cli.ts` 最後一行是 top-level `process.exit`，
 * 測試一 import 就會被殺掉。清單放在純模組裡，測試才驗得到它。
 */
export const DOCUMENTS_CITING_EVIDENCE: readonly string[] = [
  "HANDOFF.md",
  "tools/exit-drill/README.md",
];

/**
 * 文件裡宣稱的演練測試數。
 *
 * **取捨**：沒寫「上游」的演練成績會被漏掉（召回率的損失），換來零誤報。
 * 這與 `vite.config.ts:55` 對 `import/no-relative-parent-imports` 做的取捨相同 ——
 * 一道會亂叫的閘門，三個月後會被某個趕著出貨的人加上 skip，然後永遠不會拿掉。
 * 真正的保險是下面那支「三份文件確實各自都有引用」的測試：漏光了它會紅。
 */
export function findDocumentedTestCounts(source: string): readonly number[] {
  const found: number[] = [];
  for (const line of source.split("\n")) {
    if (!line.includes(DRILL_CONTEXT) || line.includes(HISTORICAL)) continue;
    for (const match of line.matchAll(CLAIM)) found.push(Number(match[1]));
  }
  return found;
}

export interface DocumentSource {
  /** 相對於 repo 根目錄的路徑，只用在錯誤訊息上。 */
  readonly path: string;
  readonly source: string;
}

/** 核對文件與證據。回傳錯誤訊息，空陣列＝通過。 */
export function checkDocumentedCounts(
  documents: readonly DocumentSource[],
  evidenceTests: number,
): readonly string[] {
  const errors: string[] = [];

  for (const document of documents) {
    for (const claimed of findDocumentedTestCounts(document.source)) {
      if (claimed === evidenceTests) continue;
      errors.push(
        `${document.path} 寫著「${claimed} 個測試全過」，而 evidence.json 是 ${evidenceTests}`,
      );
    }
  }

  return errors;
}
