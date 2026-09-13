/**
 * 切片命名規則：目錄名 kebab-case，套件名 `@org/feature-<目錄名>`。
 *
 * 這裡刻意**不用**直覺的 `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`。
 * 那個寫法有巢狀量詞（star height 2），是 ReDoS 風險：巢狀量詞在特定輸入下會退化成
 * 指數級回溯。切片名雖然來自開發者而非使用者輸入，風險實際很低，
 * 但「這條路徑碰不到不可信輸入」的假設會隨時間失效，而規則例外不會。
 *
 * 改用單層量詞 + 明確的邊界檢查：可讀性更好，且是線性時間。
 */
const SLICE_DIR_CHARSET = /^[a-z][a-z0-9-]*$/;

export function isValidSliceDir(dir: string): boolean {
  return SLICE_DIR_CHARSET.test(dir) && !dir.includes("--") && !dir.endsWith("-");
}
