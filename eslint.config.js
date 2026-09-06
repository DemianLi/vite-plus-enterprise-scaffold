// Tier 2 安全閘門的進入點（D10）。
//
// 刻意**不**經由 vp 執行 —— D2 保單要求安全閘門獨立於可替換的驅動層。
// CI 直接呼叫：pnpm exec eslint . --max-warnings=0
//
// 跑法（D10）：全量、不過濾、不快取、PR ＋ 每日排程。
// 安全掃描的結果會隨時間失效，即使程式碼一字未改 —— 新公布的 CVE 不會改變
// 任何快取指紋，affected 過濾會判定「無影響」，於是命中快取回綠燈，
// 而專案此刻正是脆弱的。
import base from "@org/eslint-config";
import nestedWorktrees from "@org/eslint-config/worktrees";

export default [
  ...base,
  // 這道閘門問的是「**這個 checkout**」，不是「這個目錄樹底下」——
  // ⚠️ 它今天在鄰居工作樹上是**綠的**，而那是「走進去了、只是那些檔沒有違規」，
  // 不是「排除了」（C190 §四（1）：285 → 570 個檔，RC 仍 0）。理由與實測寫在
  // `platform/eslint-config/src/worktrees.js`；刻意不從 `@org/eslint-config`
  // 繼承，那會把這一列塞進 Tier 2 的身分裡（同上，§二 2）。
  nestedWorktrees,
  {
    /**
     * `.semgrep/rules.ts` 是 SAST 規則的 fixture，裡面的程式碼是**故意寫壞的**
     * （`route.query` → `innerHTML`、`new Function`）。它不會被建置，
     * 存在的唯一目的是讓「規則到底有沒有在檢查」變成可執行的問題。
     *
     * ⚠️ 加這條排除之前，ESLint 的 `no-unsanitized/property` 與 oxlint 的
     * `no-implied-eval` **各自獨立地把它抓了出來**。那是好消息，值得寫下來：
     * 兩個與 semgrep 無關的工具確認了這份 fixture 真的是有問題的程式碼 ——
     * 也就是說 semgrep 的反向測試測的不是一個假想的壞例子。
     *
     * 排除的範圍刻意只有這個目錄。它是唯一一處「故意寫壞的程式碼」，
     * 而擴大排除範圍等於在安全 lint 上開一個沒有人會記得關掉的洞。
     */
    ignores: [".semgrep/**"],
  },
];
