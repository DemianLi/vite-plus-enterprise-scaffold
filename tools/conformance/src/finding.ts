/**
 * 一條判定結果。**這份型別的形狀是在這裡第一次定下來的。**
 *
 * ── 為什麼不是先放在共用套件裡 ──────────────────────────────────────
 *
 * `main` 上的 `tools/gate-kit`（C73）收了 `--root` 解析、旗標與目錄走訪，
 * 但刻意**沒有**收 `report()` 與 `Finding`。理由寫在那個 package 裡：
 * 當時沒有任何一支工具產出 `Finding[]`，先定義一個零實作的型別，
 * 等於憑空發明一個接縫，然後讓第一個真的有需求的人去遷就它。
 *
 * 這支就是第一個生產者。型別因此先住在生產者這一側 ——
 * 等第二個生產者出現、而且兩邊的欄位真的一樣，再往上搬。
 *
 * ── 為什麼欄位叫 `where` 而不是 `slice` ─────────────────────────────
 *
 * 前身叫 `slice`，而它從來就不只裝切片：CSP 那條裝的是 `platform`／`apps`
 * 這種層名，action 釘住那條裝的是 `.github/workflows/ci.yml`。
 * 欄位名說了一件不是真的事，而列印時它只是被當成分組標題印出去，
 * 所以沒有任何東西會抗議。
 *
 * ── 為什麼沒有 `severity` ───────────────────────────────────────────
 *
 * `tools/api-surface` 的 finding 有 severity（破壞性／相容），因為它**真的**
 * 對兩種嚴重度做不同的事。這支只有一種：違規就是紅。
 * 加一個現在沒有人讀的欄位，就是 C73 拒絕先定義 `report()` 的同一個錯誤。
 */
export interface Finding {
  /** 違規發生的地方：切片名、層名，或一個檔案路徑。印出來當分組標題。 */
  readonly where: string;
  /** 規則代號。印在 `[...]` 裡，也是反向測試該斷言的東西。 */
  readonly rule: string;
  /** 具體違反了什麼。 */
  readonly detail: string;
  /** 怎麼修，以及不修會怎樣 —— 後半段比前半段重要，見下。 */
  readonly fix: string;
}

/**
 * 規則本體用來記一筆的函式。
 *
 * ⚠️ `fix` 請照現有規則的寫法帶上**為什麼**。這個 repo 的閘門訊息一律是
 * 「怎麼修 + 不修會怎樣」：只寫怎麼修的話，讀的人會把它當成一道格式要求，
 * 然後在第一次覺得麻煩的時候繞過去。
 */
export type Fail = (where: string, rule: string, detail: string, fix: string) => void;

/**
 * 收集一次判定的結果。
 *
 * ── 為什麼是這個形狀，而不是讓規則自己 `push` ──────────────────────
 *
 * 拆解前，這支工具有一個模組頂層的 `violations` 陣列和一個全域 `fail()`。
 * 那正是規則沒辦法被單獨測到的第二個原因（第一個是 `process.exit`）：
 * 兩條規則跑在同一份可變狀態上，測一條就得先想辦法把另一條的結果清掉。
 *
 * 這個包裝讓規則**回傳**自己的結果，同時把 `fail(...)` 的寫法原封不動留在
 * 規則本體裡 —— 包含中途 `return` 提早結束的那幾條（`return` 只離開這個
 * callback，已經記下的 finding 照樣回得去）。
 *
 * 拆解那次 commit 因此在規則本體上幾乎沒有 diff，而 diff 越小，
 * 「輸出一字不差」這句話就越是被看出來的，而不是被相信的。
 */
export function collect(body: (fail: Fail) => void): Finding[] {
  const findings: Finding[] = [];
  body((where, rule, detail, fix) => {
    findings.push({ where, rule, detail, fix });
  });
  return findings;
}
