/**
 * 隱碼機制（§11 II ⑨：「隱碼機制，隱藏個人資料之呈現」）。
 *
 * ── 這條規則防的是誰 ────────────────────────────────────────────────
 *
 * 不是防使用者看自己的資料。防的是**內部人員** —— 客服、營運、後台管理者 ——
 * 在日常作業畫面上看到完整的客戶個資。適用的正是 `apps/console` 這種東西。
 *
 * 也就是說，這條規則的落點是**列表與明細畫面的預設呈現**，
 * 而不是資料庫、不是 API。前端做得到，而且只有前端做得到。
 *
 * ── 為什麼是「呼叫 mask()」而不是「型別包起來自動隱碼」 ────────────
 *
 * 想過一種更漂亮的設計：讓 PII 欄位是一個包裝物件，`toString` 直接吐隱碼版，
 * 於是忘記處理的預設結果是**安全的**。
 *
 * 沒有採用，兩個理由：
 *
 *   1. **拿不出證據。** 「忘記也安全」是好設計，卻是弱證據 —— 稽核問
 *      「你怎麼證明它有隱碼」時，指得出來的東西只有一份原始碼。
 *      現在的形狀有一道會紅的閘門與一支斷言渲染結果的元件測試。
 *
 *   2. **包裝物件會靜靜地漏出去。** `currency.format()`、`localeCompare`、
 *      `encodeURIComponent`、`JSON.stringify` 都會把它強制轉型，
 *      而轉出來的東西會進 TanStack 的快取與 Pinia 的狀態 ——
 *      **一個沒有任何東西會報錯的地方**。用編譯期的缺口換一個執行期的缺口，
 *      不划算。
 *
 * ── 隱碼不是加密，也不是刪除 ────────────────────────────────────────
 *
 * 這裡的函式全部**不可逆**：吃一個字串、吐一個字串，沒有 key、沒有還原路徑。
 * 需要看完整值的情境（例如客服核對身分）不在這一層解決 ——
 * 那是後端授權的事，前端拿不到完整值才是對的。
 */

/** 遮罩字元。用全形圓圈而不是 `*`：等寬、在中文字串裡不會塌成一團。 */
const MASK = "○";

/**
 * 拆成**字素叢集**（grapheme cluster），不是 `[...value]`。
 *
 * 第一版用的是展開運算子，lint 擋下來了，而它是對的 —— 展開拆的是
 * Unicode 碼點，會把一個「字」拆成好幾塊：帶結合附標的字母（é 的分解形式）、
 * emoji、以及某些漢字的變體選擇符。
 *
 * 在一個隱碼函式上，那不是排版瑕疵：`keepHead(value, 1)` 會留下半個字素，
 * 而剩下的部分被算成需要遮的長度 —— **遮罩長度會透露原字串的碼點數，
 * 而且留下來的那半個字可能仍然可讀。**
 */
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(value: string): string[] {
  return [...SEGMENTER.segment(value)].map((segment) => segment.segment);
}

function keepHead(value: string, keep: number): string {
  const characters = graphemes(value);
  if (characters.length <= keep) return characters.map(() => MASK).join("");
  return characters.slice(0, keep).join("") + MASK.repeat(characters.length - keep);
}

/**
 * 姓名：留第一個字。
 *
 * 「林佳蓉」→「林○○」、「Aya Nakamura」→ 每一段各留首字。
 * 分段處理是必要的：整串只留第一個字母的話，
 * 西方姓名會變成「A○○○○○○○○○○○」，長度本身就洩漏資訊，
 * 而且在列表裡完全無法辨識 —— 那會讓人乾脆不用這個函式。
 */
export function maskName(value: string): string {
  if (value === "") return "";
  return value
    .split(/(\s+)/)
    .map((part) => (part.trim() === "" ? part : keepHead(part, 1)))
    .join("");
}

/**
 * 電子郵件：本地部分留首字，網域完整保留。
 *
 * 網域不隱碼是刻意的 —— 它通常是判斷「這是不是公司客戶」所需，
 * 而且本身不是識別到個人的資訊。`wang@example.com` →「w○○○@example.com」。
 */
export function maskEmail(value: string): string {
  const at = value.lastIndexOf("@");
  if (at <= 0) return keepHead(value, 1);
  return `${keepHead(value.slice(0, at), 1)}${value.slice(at)}`;
}

/** 電話：留末三碼。核對身分時問的是後三碼，前面沒有保留的必要。 */
export function maskPhone(value: string): string {
  const digits = graphemes(value);
  if (digits.length <= 3) return MASK.repeat(digits.length);
  return MASK.repeat(digits.length - 3) + digits.slice(-3).join("");
}

/**
 * 身分證字號：留首碼字母與末三碼。
 *
 * 首碼是地區別，末三碼是常見的核對依據。中間六碼是真正的識別資訊。
 */
export function maskNationalId(value: string): string {
  const characters = graphemes(value);
  if (characters.length <= 4) return MASK.repeat(characters.length);
  return characters[0] + MASK.repeat(characters.length - 4) + characters.slice(-3).join("");
}

/**
 * 通用後備：什麼都不留。
 *
 * 給「知道它是個資、但不知道是哪一種」的欄位用。**刻意很難看** ——
 * 難看會促使人去挑一個對的函式，而挑對了呈現才有用。
 */
export function maskAll(value: string): string {
  return MASK.repeat(graphemes(value).length);
}

/** 這個字串已經被隱碼過了嗎。給元件測試與靜態檢查共用一個判準。 */
export function isMasked(value: string): boolean {
  return value.includes(MASK);
}

export const MASK_CHARACTER = MASK;
