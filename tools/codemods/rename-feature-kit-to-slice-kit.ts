import type { Codemod } from "./run.ts";

/**
 * `@org/feature-kit` → `@org/slice-kit`（C5）。
 *
 * ── 這不是示範用的假 codemod，是真的發生過的遷移 ──────────────────────
 *
 * 平台層的契約套件原本叫 `@org/feature-kit`，與切片的 `@org/feature-*` 命名撞號，
 * 結果被自己的邊界規則誤判成跨切片依賴 —— 一致性檢查第一次跑就抓到了。
 *
 * 這正是 D12 要求的形狀：改名是 breaking change，因此附上可以自動套用的 codemod，
 * 由提出者在同一個 PR 跑完全 repo。做不到 codemod 的改動，就不是 breaking change，
 * 是新 API。
 *
 * ── 為什麼字串取代在這裡是夠的 ────────────────────────────────────────
 *
 * 套件名在 import 指定字串裡是**詞法上明確**的：它只會出現在引號內，
 * 沒有別名、沒有間接引用、沒有需要追蹤的變數。這類遷移不需要 AST。
 *
 * 需要理解語意的遷移（改變呼叫的參數結構、追蹤變數別名）請在該 codemod
 * 自己的實作裡引入 ts-morph —— 執行器不預設 AST 工具，見 run.ts 的說明。
 *
 * ── 冪等性 ──────────────────────────────────────────────────────────
 *
 * 舊名已完全不存在，因此重跑是 no-op。這是 codemod 的硬性要求：
 * 跑兩次的結果必須與跑一次相同，否則 CI 重跑會產生假的差異。
 */

const OLD_SPECIFIER = "@org/feature-kit";
const NEW_SPECIFIER = "@org/slice-kit";

// 只比對出現在引號內的套件名，避免動到註解或說明文字裡提及舊名的地方
//（例如本檔自己，以及 DECISIONS.md 的 C5 紀錄 —— 那些是歷史，不該被改掉）。
//
// 刻意寫成字面 regex 而非 `new RegExp(組出來的字串)`：後者會被 Tier 2 的
// `security/detect-non-literal-regexp` 標記，而那條規則是對的 ——
// 從變數組 regex 是 ReDoS 與意外比對的常見來源。字面值沒有這個問題，
// 可讀性也更好。代價是套件名寫了兩次，由下面的斷言釘住兩者一致。
//
// 這個正則被 Tier 2 的 `security/detect-unsafe-regex` 擋了兩次，兩次都是對的：
//
//   1. 初版用反向參照 `\1` 要求前後引號一致 —— 反向參照讓正則變成非正規語言
//   2. 二版用 `(\/[^"']*)?` —— **可選群組裡包量詞**就是 star height 2，
//      也就是巢狀量詞，指數級回溯的經典形狀
//
// 定版改用**交替**取代巢狀量詞：群組本身不帶量詞，內部的 `[^"']*` 是單層。
// 尾端必須是引號或 `/子路徑` + 引號，因此 `@org/feature-kit-legacy` 不會誤中
//（下一個字元是 `-`，兩個分支都不符）。
const PATTERN = /(["'])@org\/feature-kit(["']|\/[^"']*["'])/g;

// 若有人改了 OLD_SPECIFIER 卻忘了同步上面的字面 regex，這裡會在載入時就爆，
// 而不是安靜地變成一個永遠命中不到東西的 codemod。
if (!PATTERN.test(`"${OLD_SPECIFIER}"`)) {
  throw new Error(`[codemod] PATTERN 與 OLD_SPECIFIER (${OLD_SPECIFIER}) 不一致`);
}
PATTERN.lastIndex = 0;

const codemod: Codemod = {
  description: `把 ${OLD_SPECIFIER} 的 import 改為 ${NEW_SPECIFIER}`,

  transform(source) {
    if (!source.includes(OLD_SPECIFIER)) return null;

    // tail 已包含結尾引號（可能還帶子路徑），因此不需要再補一個引號 ——
    // 輸出的引號風格自然與原始碼一致。
    const next = source.replace(PATTERN, (_match, quote: string, tail: string) => {
      return `${quote}${NEW_SPECIFIER}${tail}`;
    });

    return next === source ? null : next;
  },
};

export default codemod;
