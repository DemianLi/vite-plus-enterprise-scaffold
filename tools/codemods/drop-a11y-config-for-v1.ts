import type { Codemod } from "./run.ts";

/**
 * 移除 `@org/eslint-config/a11y`（v1.0.0 的範圍縮減）。
 *
 * ── 這不是 API 演進，是發版範圍的決定 ────────────────────────────────
 *
 * v1.0.0 的承諾範圍是五條（分工架構、設計模板到前端的開發方式、
 * 設計模板對應 vue component、快速換配色與元件樣式、基礎資安在撰寫時發現）。
 * **無障礙不在裡面**，整條移到 v2 —— 論證在 `main` 的 `DECISIONS.md` C69。
 *
 * 所以這支 codemod 的性質與 `rename-feature-kit-to-slice-kit` 不同：
 * 那一支是「同一條產品線上的改名」，這一支是「這條產品線不再包含這個能力」。
 * 兩者都是 breaking change，都要附 codemod，但**升級路徑不一樣** ——
 * 需要無障礙靜態檢查的案子，要用的是 `main` 那條線，不是把它加回 v1。
 *
 * ── 為什麼在 v1 裡它是 no-op ────────────────────────────────────────
 *
 * v1 的 repo 裡已經沒有任何地方引用它（`gate` 與 Tier 1 的步驟一起拿掉了）。
 * 它存在的理由是**下游**：`platform/*` 會發成內部套件給各案升級，
 * 而「下游」包含不在這個 repo 裡的人 —— 從 v0.x 升上來的案子，
 * 自己的 `eslint.config.js` 可能正引用著它。
 *
 * ⚠️ 這支 codemod **只移除 import**，不會替他們補上替代方案 ——
 * 因為沒有替代方案，那個能力在 v1 就是不存在。跑完之後那些專案會失去
 * 無障礙靜態檢查，而**那正是要讓他們看見的事**：一個安靜地少掉一道閘門
 * 的升級，比一個當場編不過的升級危險得多。
 *
 * ── 冪等性 ──────────────────────────────────────────────────────────
 *
 * 移除之後重跑找不到目標，是 no-op。
 */

// 字面 regex，理由與 rename-feature-kit-to-slice-kit 同一條：
// 從變數組 regex 會被 Tier 2 的 detect-non-literal-regexp 擋，而那條規則是對的。
const IMPORT_LINE = /^.*["']@org\/eslint-config\/a11y["'].*(?:\r?\n|$)/gm;

const codemod: Codemod = {
  description: "移除 @org/eslint-config/a11y 的引用（v1.0.0 不含無障礙，見 main 的 C69）",
  transform(source: string): string | null {
    const next = source.replace(IMPORT_LINE, "");
    // 回傳 null＝這個檔案沒有要改的東西。執行器靠它算「動了幾個檔」。
    return next === source ? null : next;
  },
};

export default codemod;
