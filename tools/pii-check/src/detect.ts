/**
 * 「測試資料裡有沒有真的個資」的偵測器（§11 II ⑥）。
 *
 * ── 這條規則現行有效、前端做得到，而且一條檢查都沒有 ────────────────
 *
 * 《數位經濟相關產業個人資料檔案安全維護管理辦法》§11 II ⑥：
 * **測試環境應避免使用真實個人資料。**
 *
 * 這是所有條號裡最容易被違反的一條，因為違反它最省事：
 * 要一份「像真的」的測試資料，最快的做法就是從正式環境撈一份下來。
 * 而它一旦進了 git，就永遠在歷史裡。
 *
 * ── 這個偵測器抓得到什麼、抓不到什麼 ────────────────────────────────
 *
 * **抓得到**：有校驗規則的結構化識別碼 —— 身分證字號、信用卡號、手機號碼，
 * 以及指向真實網域的電子郵件。這幾類有一個共同性質：**亂打的字串幾乎不可能
 * 通過校驗**，所以誤報率天生就低。
 *
 * **抓不到姓名。** 「林佳蓉」與一個真的客戶的名字在字面上沒有任何差別 ——
 * 沒有校驗碼、沒有格式、沒有可判定的性質。任何宣稱抓得到的實作都是在猜。
 *
 * 所以這一條的覆蓋是 `partial`，不是 `full`。把它標成 full 就是重演
 * §11 II ⑦ 那個「覆蓋是滿的、欠的是證明」的高估。
 *
 * ── 刻意不驗統一編號 ────────────────────────────────────────────────
 *
 * 統編有校驗碼、也很好寫，但它是**營利事業**的識別碼，不是個人資料。
 * 收進來只會多一類誤報，換不到任何法規覆蓋。
 */

/** 一筆命中。`why` 說明它為什麼被判定成真的，那才是人要看的東西。 */
export interface Finding {
  readonly kind: "national-id" | "credit-card" | "mobile" | "real-email";
  readonly value: string;
  readonly line: number;
  readonly why: string;
}

/**
 * 身分證字號首碼的地區代號。**不是 A=1、B=2 這種順序** ——
 * I、O、W、X、Y、Z 的位置是歷史遺留，照字母序算會讓校驗失效，
 * 而失效的方向是**放行**（算出來的檢查碼對不上，於是判定成假資料）。
 */
const AREA_CODE: Readonly<Record<string, number>> = {
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
  G: 16,
  H: 17,
  I: 34,
  J: 18,
  K: 19,
  L: 20,
  M: 21,
  N: 22,
  O: 35,
  P: 23,
  Q: 24,
  R: 25,
  S: 26,
  T: 27,
  U: 28,
  V: 29,
  W: 32,
  X: 30,
  Y: 31,
  Z: 33,
};

/** 全部刻意寫成單層量詞：巢狀量詞會被 security/detect-unsafe-regex 擋（C19）。 */
const NATIONAL_ID = /\b[A-Z][12]\d{8}\b/g;
const LONG_DIGITS = /\b\d{13,19}\b/g;
const MOBILE = /\b09\d{8}\b/g;
/**
 * ⚠️ 結尾的 `[a-z]{2,}` 不是講究，是**這支工具能不能活下來**的分界。
 *
 * 第一版寫成 `[\w.-]+` 收尾，第一次跑就報了 45 項 —— 幾乎全部是
 * `fsevents@2.3.3`、`vite-plus@0.2.9` 這種 **npm 套件規格**：
 * `名稱@版本` 與 `本地部分@網域` 在字面上一模一樣。
 *
 * 一道第一天就吐出四十幾條誤報的閘門，不會有人去讀第四十六條 ——
 * 它會被關掉，然後真的個資從此靜靜留在 repo 裡。
 * 頂級網域一定是字母，版本號一定不是，這一條把兩者分開。
 */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]*[a-z]{2,}\b/gi;

/**
 * RFC 2606／6761 保留給文件與測試的網域。用這些的信箱寄不到任何人，
 * 所以它們不是個資 —— 而且**應該鼓勵**，不是容忍。
 */
const RESERVED_TLDS = new Set(["test", "invalid", "localhost", "example", "internal", "local"]);
const RESERVED_DOMAINS = new Set(["example.com", "example.org", "example.net", "example.edu"]);

export function isNationalId(value: string): boolean {
  const area = AREA_CODE[value[0] as string];
  if (area === undefined) return false;

  // 首碼拆成兩位數，權重 1 與 9；其後八位權重 8→1；最後一位是檢查碼，權重 1。
  let sum = Math.floor(area / 10) + (area % 10) * 9;
  for (let index = 1; index <= 8; index += 1) {
    sum += Number(value[index]) * (9 - index);
  }
  sum += Number(value[9]);
  return sum % 10 === 0;
}

/** Luhn。信用卡、部分會員卡與部分身分證件都用它。 */
export function isLuhn(value: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * 這個信箱指向真實網域嗎？
 *
 * 反過來寫（列出「哪些算真的」）不可行 —— 真實網域是無限多的。
 * 所以列的是保留網域，其餘一律當成真的。**預設值站在報出來那一邊**：
 * 漏掉一個保留網域只會多一次誤報，漏掉一個真網域則是真的個資留在 repo 裡。
 */
export function isRealEmail(address: string): boolean {
  const domain = (address.split("@")[1] ?? "").toLowerCase();
  if (domain === "") return false;

  // RFC 2606 保留的是**整棵子樹**：`corp.example.com` 與 `example.com` 一樣
  // 寄不到任何人。第一版只比對完整網域與 `example.` 開頭，於是
  // `a@corp.example.com` 被報成真信箱 —— 而那是這份規範**建議**的寫法。
  // 對著正確做法開火的檢查，會教人改用真網域，剛好與規則的目的相反。
  if (RESERVED_DOMAINS.has(domain)) return false;
  if ([...RESERVED_DOMAINS].some((reserved) => domain.endsWith(`.${reserved}`))) return false;

  // ⚠️ 這裡**不能**寫成 `domain.startsWith("example.")`。第一版是那樣，
  // 於是 `example.com.tw` 被當成保留網域放行 —— 而那是一個真的、
  // 在台灣註冊得到的網域。放行的方向是漏報：真的個資從此靜靜留在 repo 裡。
  // `example.internal` 這種需求由 RESERVED_TLDS 涵蓋，不需要前綴比對。

  const tld = domain.split(".").pop() ?? "";
  return !RESERVED_TLDS.has(tld);
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let at = 0; at < index; at += 1) {
    if (text[at] === "\n") line += 1;
  }
  return line;
}

function collect(
  text: string,
  pattern: RegExp,
  kind: Finding["kind"],
  accept: (value: string) => boolean,
  why: (value: string) => string,
): Finding[] {
  const found: Finding[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    if (!accept(value)) continue;
    found.push({ kind, value, line: lineOf(text, match.index), why: why(value) });
  }
  return found;
}

export function scanText(text: string): readonly Finding[] {
  return [
    ...collect(
      text,
      NATIONAL_ID,
      "national-id",
      isNationalId,
      () => "格式與檢查碼都符合中華民國身分證字號 —— 亂編的字串通過這個校驗的機率是十分之一",
    ),
    ...collect(
      text,
      LONG_DIGITS,
      "credit-card",
      isLuhn,
      (value) => `${value.length} 位數字且通過 Luhn 校驗 —— 信用卡號的形狀`,
    ),
    ...collect(
      text,
      MOBILE,
      "mobile",
      () => true,
      () => "09 開頭的十位數字 —— 台灣手機號碼的形狀",
    ),
    ...collect(
      text,
      EMAIL,
      "real-email",
      isRealEmail,
      (value) =>
        `網域 ${value.split("@")[1]} 不在 RFC 2606／6761 的保留清單裡 —— 測試資料請用 example.com 或 .test`,
    ),
  ];
}
