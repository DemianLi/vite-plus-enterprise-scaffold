import a11yConfig from "@org/eslint-config/a11y";

import type { Coverage } from "./map.ts";

/**
 * 無障礙：**驗收端與開發端的分工表**（HANDOFF #22／C69）。
 *
 * ── 為什麼與法遵那張表分開 ──────────────────────────────────────────
 *
 * `map.ts` 那張表的 `article` 明寫著只收《個人資料檔案安全維護管理辦法》。
 * 無障礙是**另一個規範體系**：判定的人不同（機關／檢測單位，不是稽核）、
 * 流程不同（機器檢測 → 人工檢測 → 抽測）、產出的東西不同（無障礙標章）。
 * 硬塞進同一個型別，只會讓兩邊都變形 —— 一張開始變形的表就會開始說謊。
 *
 * ── 這張表要回答的問題 ──────────────────────────────────────────────
 *
 * **不是**「我們達標了嗎」。達標與否由 Freego ＋ 人工檢測判定，那在驗收端。
 *
 * 要回答的是：**送檢之前，哪幾格開發期就擋得掉、哪幾格結構上擋不掉。**
 * 後者不是缺陷，是必須寫進交付文件、由人工或委外承接的部分 ——
 * 而把它寫下來，比裝一道假裝守得到的閘門有價值。
 *
 * 這與這個 repo 對源碼掃描的既有立場是同一個形狀：
 * 專業公司做那份交付的掃描，開發期只做開源的前置過濾。
 */

/**
 * ⚠️ **版本是一個欄位，不是一句註解。**
 *
 * 標案文件若指定舊版（網站無障礙規範 2.0），成功準則的編號與數量都不一樣，
 * 而這張表會**安靜地對照到錯的規範**。寫成欄位，至少不符會被看見。
 *
 * 這裡假設 110.07，理由是可查證的硬事實：**Freego 2.0「已不受理此版申請」**，
 * 也就是舊版對一個新的標章申請不是活的選項。
 *
 * ⚠️ **確認標案指定的版本是組織的動作**，與 HANDOFF #15（`@org/*` 換真團隊）
 * 同一類 —— 程式做不到。
 */
export const ACCESSIBILITY_STANDARD = "網站無障礙規範 110.07（對應 WCAG 2.1）";

/** 政府機關網站新設或改版被要求的等級（立法院決議）。 */
export const REQUIRED_LEVEL = "AA";

export type A11yLevel = "A" | "AA" | "AAA";

/**
 * 驗收流程的哪一段會判定它。
 *
 *   freego — 數位發展部的單機檢測工具，掃**已部署的 URL**
 *   manual — 專家人工檢測（鍵盤操作、螢幕閱讀器實走）
 *   sample — 通過後的抽測
 */
export type AcceptanceStage = "freego" | "manual" | "sample";

export interface Criterion {
  /** 成功準則編號。 */
  readonly id: string;
  readonly name: string;
  readonly level: A11yLevel;
  /** 驗收端由哪幾段判定。 */
  readonly acceptance: readonly AcceptanceStage[];
  /** **開發期**的前置過濾器守到什麼程度。與驗收端是否通過無關。 */
  readonly preFilter: Coverage;
  /** 守它的閘門 id（`map.ts` 的 `GATES`）；空 = 開發期沒有東西在守。 */
  readonly gates: readonly string[];
  readonly note: string;
}

/**
 * ⚠️ **這張表刻意只收 HANDOFF #22 點名的那四格，不是 AA 的完整清單。**
 *
 * 完整對照需要規範原文（成功準則的編號、名稱、等級逐條）。官方頁面在
 * 撰寫當下兩次都回 403，而次級來源彼此矛盾（一說 12 指引 66 準則、
 * 一說 13 指引 78 準則）。**沒有事實來源的計數不要寫**（C53）——
 * 所以這裡不寫任何「共 N 條」，只收查證得到的四條。
 *
 * 補完整份表是可以做的，前提是拿到規範原文；那是組織輸入，記在 #22。
 */
export const CRITERIA: readonly Criterion[] = [
  {
    id: "1.4.1",
    name: "顏色的使用",
    level: "A",
    acceptance: ["freego", "manual"],
    preFilter: "none",
    gates: [],
    note:
      "開發期**擋不掉**，而且是量出來的：axe 的對應規則 `link-in-text-block` " +
      "在模擬 DOM（happy-dom）下落在 `incomplete` —— 規則跑了但判定不了。" +
      "天真的 `expect(violations).toHaveLength(0)` 會在這種情況下亮綠燈，" +
      "也就是「什麼都沒檢查」與「沒有問題」印出來一樣。",
  },
  {
    id: "1.4.3",
    name: "對比（最低）",
    level: "AA",
    acceptance: ["freego", "manual"],
    preFilter: "none",
    gates: [],
    note:
      "文字至少 4.5:1、大尺寸文字至少 3:1。開發期**擋不掉**：axe 的 " +
      "`color-contrast` 需要 computed style 與文字節點幾何，而模擬 DOM 沒有排版。" +
      "實測 happy-dom 有 `document.createRange()`，但 `getBoundingClientRect()` " +
      "回傳全零 —— **API 在、數字是假的**，這比直接沒有更難察覺。" +
      "實測一段對比 1.1:1 的文字：落在 `incomplete`，不是 `violations`。",
  },
  {
    id: "2.4.3",
    name: "焦點順序",
    level: "A",
    acceptance: ["manual"],
    preFilter: "partial",
    gates: ["a11y-lint"],
    note:
      "⚠️ **這一條連 Freego 都判定不了，是人工檢測項目。** 開發期只擋得到" +
      "最粗的那一種：`vuejs-accessibility/tabindex-no-positive`（正 tabindex）。" +
      "真正的失效方式 ——「DOM 順序與視覺順序不一致」「對話框的焦點沒有真的鎖住」" +
      "—— 需要真瀏覽器跑鍵盤，**任何靜態或模擬 DOM 的做法都買不到**。",
  },
  {
    id: "2.4.6",
    name: "標題和標籤",
    level: "AA",
    acceptance: ["freego", "manual"],
    preFilter: "partial",
    gates: ["a11y-lint"],
    note:
      "標籤那一半開發期擋得到（`form-control-has-label`、`label-has-for`、" +
      "`heading-has-content`）。**標題階層那一半擋不到**：階層是頁面級性質，" +
      "而開發期的檢查單位是元件與畫面 —— 實測 repo 裡每個畫面只有一個 `<h1>`，" +
      "axe 的 `heading-order` 掃孤立畫面時永遠不適用。",
  },
];

/**
 * 開發期前置過濾器**實際檢查的項目**。
 *
 * ⚠️ 從 `@org/eslint-config/a11y` 推導，不抄一份清單 —— 那份設定自己也是
 * 從外掛的 `rules` 推導的，所以升級外掛時新規則會自動進來（A1）。
 *
 * 刻意**不**宣稱這些規則各自對應哪一條成功準則：那個對照需要規範原文，
 * 而猜一個對照寫進交付文件，比不寫更糟。
 */
export function preFilterRules(): readonly string[] {
  const withRules = a11yConfig.find(
    (entry): entry is { rules: Record<string, unknown> } =>
      typeof entry === "object" && entry !== null && "rules" in entry,
  );
  if (withRules === undefined) {
    throw new Error("@org/eslint-config/a11y 裡找不到 rules —— 讀不到就不要給判決");
  }
  return Object.keys(withRules.rules).sort();
}

export interface A11yProblem {
  readonly kind: string;
  readonly detail: string;
}

/**
 * 這張表有沒有在說謊。與 `verifyMap` 同一個方向：
 * **宣稱有閘門守 → 那個閘門 id 必須真的存在**。
 */
export function verifyCriteria(
  criteria: readonly Criterion[],
  knownGateIds: ReadonlySet<string>,
): readonly A11yProblem[] {
  const problems: A11yProblem[] = [];

  if (criteria.length === 0) {
    problems.push({ kind: "空表", detail: "一條成功準則都沒有 —— 空表會全綠" });
  }

  for (const criterion of criteria) {
    for (const gate of criterion.gates) {
      if (!knownGateIds.has(gate)) {
        problems.push({
          kind: "閘門不存在",
          detail: `${criterion.id} 宣稱由 "${gate}" 守，但 GATES 裡沒有這個 id`,
        });
      }
    }

    // 宣稱開發期守得到、卻一個閘門都沒列 —— 那是這張表最容易長出來的謊。
    if (criterion.preFilter !== "none" && criterion.gates.length === 0) {
      problems.push({
        kind: "覆蓋沒有來源",
        detail: `${criterion.id} 的 preFilter 是 "${criterion.preFilter}"，但沒有列出任何閘門`,
      });
    }
    if (criterion.preFilter === "none" && criterion.gates.length > 0) {
      problems.push({
        kind: "覆蓋與閘門矛盾",
        detail: `${criterion.id} 的 preFilter 是 "none"，卻列了閘門 ${criterion.gates.join("、")}`,
      });
    }
  }

  return problems;
}
