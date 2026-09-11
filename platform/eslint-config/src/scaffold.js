// 根層 `eslint.config.js` 裡腳手架的那一半（C219，實作 C215 §六）。
//
// 根層那支是團隊的，寫成 `[...scaffold, /* 你們的 */]`；這一支組的是三樣腳手架自己的
// 東西，升級時由上游改，所以合併不會撞到團隊加的那幾行。
//
// ⚠️ 刻意另開一個 export，不把 worktrees 與 `.semgrep/` 的排除折進 `./index.js`：
// 那一支是 Tier 2 安全閘門的身分，worktrees 不屬於它（C190 §二 2），而 `a11y.js`
// 也要用 worktrees。
import base from "./index.js";
import nestedWorktrees from "./worktrees.js";

export default [
  ...base,
  // 這道閘門問的是「**這個 checkout**」，不是「這個目錄樹底下」——
  // ⚠️ 它今天在鄰居工作樹上是**綠的**，而那是「走進去了、只是那些檔沒有違規」，
  // 不是「排除了」（C190 §四（1）：285 → 570 個檔，RC 仍 0）。理由與實測寫在
  // `./worktrees.js`。
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
