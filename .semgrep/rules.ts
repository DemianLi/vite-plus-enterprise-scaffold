/**
 * `.semgrep/rules.yml` 的**反向測試**，格式由 semgrep 的 `--test` 決定：
 * 檔名要與規則檔同名（`rules.yml` ↔ `rules.ts`），標記寫在被測那一行的**上一行**：
 * 一個標記說「這一行**必須**被該規則命中」，另一個說「這一行**不得**被命中」。
 *
 * ⚠️ 這段說明刻意**不把那兩個關鍵字寫出來**。第一版寫了，於是 semgrep 把
 * 註解裡的說明文字當成真的標記去解析，然後報 `rule id mismatch` ——
 * 這個檔案是被自己的機制擋下來的，而那其實是好消息：它證明標記真的有在被讀。
 *
 * ⚠️ 這個檔案裡的程式碼是**故意寫壞的**，而且它不會被建置 ——
 * `.semgrep/` 不在任何 tsconfig 的 include 裡，也不在 eslint 的掃描範圍。
 * 它存在的唯一目的是讓「規則到底有沒有在檢查」變成一個可以執行的問題。
 *
 * ── 為什麼一定要有這個檔案 ──────────────────────────────────────────
 *
 * `semgrep --test` 在**找不到任何 fixture 時會印一行字，然後回傳 0**。
 * 也就是說：規則寫錯、語言設定錯、路徑配對不上 —— 全部長成「掃描通過」。
 * 那正是這個 repo 一路在防的形狀，而 SAST 這一輪是它第一次以
 * 「工具預設行為」的姿態出現，不是誰寫錯了什麼。
 *
 * workflow 因此有兩道防呆：`grep -q "No unit tests found"` 之後 exit 1，
 * 以及斷言輸出裡真的有「N/N tests passed」的數字。
 *
 * ── ⚠️ 這個檔案守不到什麼：規則的**射程**（#144／#149）───────────────
 *
 * `semgrep --test` **不套用規則的 `paths`**（#144 實測，推翻過一個相反的猜想）。
 * 所以 `runtime-code-construction` 的 `paths.include`／`exclude` 改成什麼，
 * 這裡一條 fixture 都不會變色 —— 這個檔案本身的路徑（`/src/rules.ts`）
 * 連一個 include 都 match 不上，而它照樣通過。
 *
 * **這是結構性的，不是缺一條 fixture。** 射程錯掉的症狀因此不是紅燈，
 * 是一個看起來合理的綠燈 —— 與 #130（覆蓋率的預設射程）、#136（突變測試漏一支
 * 產品碼）同一個形狀。射程改動要驗的話，得用 `semgrep scan` 對一組**已知位置**
 * 的檔案跑，比對命中的檔案清單；#149 就是那樣驗的。
 */
/**
 * ⚠️ 這個檔案**刻意不 import 任何東西**，`useRoute` 在下面自己宣告。
 *
 * 第一版照真實寫法 `import { useRoute } from "vue-router"`，結果 tsc 報
 * `Cannot find module` —— `.semgrep/` 不是一個 package，沒有相依宣告。
 * 那個錯是對的（它就是幽靈依賴），只是這裡不該用排除去消音。
 *
 * semgrep 的比對是語法與資料流層級的，**不解析模組**：`useRoute().query`
 * 這個樣式命不命中，與 `useRoute` 從哪裡來完全無關。所以自己宣告一個，
 * fixture 變成零相依，而規則測到的東西一模一樣。
 */
declare function useRoute(): { query: Record<string, unknown> };

export function writesTaintedHtml(element: HTMLElement): void {
  const route = useRoute();
  // ruleid: tainted-route-input-to-dom-sink
  element.innerHTML = route.query["q"] as string;
}

export function redirectsToTaintedUrl(): void {
  const route = useRoute();
  // ruleid: tainted-route-input-to-dom-sink
  window.location.href = route.query["next"] as string;
}

/**
 * 對照組：同一個汙點來源，流進**安全的** sink。
 *
 * 少了這一條，一個「看到 route.query 就報」的爛規則會通過上面兩條測試 ——
 * 而它會在第一週對每一個正常讀取查詢參數的元件亂叫，然後被關掉。
 */
export function writesTaintedText(element: HTMLElement): void {
  const route = useRoute();
  // ok: tainted-route-input-to-dom-sink
  element.textContent = route.query["q"] as string;
}

// ruleid: runtime-code-construction
const built = new Function("return 1");

// ok: runtime-code-construction
const timer = setTimeout(() => undefined, 100);

export { built, timer };
