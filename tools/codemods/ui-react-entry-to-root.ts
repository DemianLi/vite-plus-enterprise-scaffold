import type { Codemod } from "./run.ts";

/**
 * `@org/ui/react` → `@org/ui`（C244，收回 C235 Q57 開的子路徑）。
 *
 * 遷移期間 `.` 仍是 Vue 版，React 元件從 `./react` 取；Vue 退場時 `./react` 那一份
 * 收回 `.`，子路徑拿掉。匯出的名字一個都沒變，所以改的只有 import 指定字串 ——
 * 同 `rename-feature-kit-to-slice-kit` 那一種詞法上明確的遷移，不需要 AST。
 *
 * ⚠️ 不遷移的是**還在用 Vue 版 `.` 的程式碼**：`createUiTheme()` 從 Vue plugin 換成
 * React 元件、`UiButton` 從 SFC 換成函式，那是改寫不是改名。沒有 fork（C232 Q49），
 * 樹內的消費端 C240 已經全部換成 React。
 *
 * 冪等：`@org/ui/react` 改完就不存在，重跑是 no-op。
 */

const OLD_SPECIFIER = "@org/ui/react";
const NEW_SPECIFIER = "@org/ui";

// 只比對引號內、而且**後面緊接引號**的那一種：`@org/ui/react-foo`、`@org/ui/reactive`
// 都不中。刻意寫成字面 regex，理由同 `rename-feature-kit-to-slice-kit.ts`。
const PATTERN = /(["'])@org\/ui\/react(["'])/g;

if (!PATTERN.test(`"${OLD_SPECIFIER}"`)) {
  throw new Error(`[codemod] PATTERN 與 OLD_SPECIFIER (${OLD_SPECIFIER}) 不一致`);
}
PATTERN.lastIndex = 0;

const codemod: Codemod = {
  description: `把 ${OLD_SPECIFIER} 的 import 改為 ${NEW_SPECIFIER}`,

  transform(source) {
    if (!source.includes(OLD_SPECIFIER)) return null;
    const next = source.replace(
      PATTERN,
      (_match, open: string, close: string) => `${open}${NEW_SPECIFIER}${close}`,
    );
    return next === source ? null : next;
  },
};

export default codemod;
