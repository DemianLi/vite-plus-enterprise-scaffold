/**
 * 從 `vp lint -f json` 的輸出裡，把「實測值」與「當時的門檻」讀出來。
 *
 * ⚠️ **讀的是訊息文字，而那是上游的措辭。** 五條規則有五種寫法，其中
 * `complexity` 那一條沒有括號：
 *
 *   The function `runFull` has too many lines (199). Maximum allowed is 0.
 *   This component has too many props (2). Maximum allowed is 1.
 *   Blocks are nested too deeply (3). Maximum allowed is 2.
 *   Function 'patch' has too many parameters (4). Maximum allowed is 3.
 *   async function has a complexity of 15. Maximum allowed is 14.
 *
 * 措辭改掉的話這支工具就讀不到了，而**讀不到必須是紅的**：
 * `parseDiagnostics` 把「含 `Maximum allowed is` 卻解析不出兩個數字」的訊息
 * 單獨收在 `unparsed` 裡，呼叫端拿它當紅燈。少了那一半，上游換一次措辭
 * 就會讓十一格全部變成「量不到」—— 而那是一個看起來有在工作的綠燈。
 */

export interface Reading {
  /** 例如 `eslint(max-lines-per-function)`、`vue(max-props)`。 */
  readonly code: string;
  /** 這一支函式／元件的實測值。 */
  readonly reported: number;
  /** 報這一條時生效的門檻 —— 探針設定裡它就是那一格的地板值。 */
  readonly allowed: number;
}

export interface ParsedDiagnostics {
  readonly readings: readonly Reading[];
  /** 看起來是門檻違規、卻讀不出數字的訊息。**非空就是紅的。** */
  readonly unparsed: readonly string[];
  /**
   * ⚠️ **量測那一趟自己掃了幾個檔。**
   *
   * 檔案集合那條夾具問的是 `--debug=files` 那兩趟，而讀數來自 `-f json` 那一趟
   * —— **是不同的呼叫**。這一欄讓呼叫端問得到「真正產出讀數的那一趟射程對不對」，
   * 而不是拿另一趟的射程去替它作證。
   */
  readonly files: number;
}

const MEASURE = /(?:\((\d+)\)|(\d+))\.\s*Maximum allowed is (\d+)\./;
const LOOKS_LIKE_THRESHOLD = "Maximum allowed is";

export function parseDiagnostics(payload: unknown): ParsedDiagnostics {
  const readings: Reading[] = [];
  const unparsed: string[] = [];

  const list =
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as { diagnostics?: unknown }).diagnostics)
      ? (payload as { diagnostics: unknown[] }).diagnostics
      : [];

  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const { code, message } = entry as { code?: unknown; message?: unknown };
    if (typeof code !== "string" || typeof message !== "string") continue;
    if (!message.includes(LOOKS_LIKE_THRESHOLD)) continue;

    const hit = MEASURE.exec(message);
    const reported = hit?.[1] ?? hit?.[2];
    const allowed = hit?.[3];
    if (reported === undefined || allowed === undefined) {
      unparsed.push(`${code}｜${message}`);
      continue;
    }
    readings.push({ code, reported: Number(reported), allowed: Number(allowed) });
  }

  const files =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { number_of_files?: unknown }).number_of_files === "number"
      ? (payload as { number_of_files: number }).number_of_files
      : 0;

  return { readings, unparsed, files };
}
