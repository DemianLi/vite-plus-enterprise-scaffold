import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { probeRootSupport } from "../src/probe.ts";

/**
 * 探針本身。
 *
 * ── ⚠️ 為什麼這裡一定要有一支假閘門 ─────────────────────────────────
 *
 * 這條線上今天唯一被承諾規格指名的閘門（`tools/conformance`）**是**真的讀
 * `--root`。所以探針寫出來的那一刻就會全綠 —— 而全綠與「探針沒有作用」
 * 長得一模一樣。這個 repo 在假的零上付過好幾次學費，每一次的解藥都是
 * 同一句：**表裡至少要有一列非零**。那一列在
 * `tests/fixtures/ignores-root/`。
 *
 * ⚠️ 上面那條（`conformance` → 讀了）也不可省：只有下面那條的話，一支
 * 「永遠回答讀不到」的探針會全綠 —— 兩個方向都要有人守。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const IGNORES_ROOT = "tools/promise-check/tests/fixtures/ignores-root";

describe("閘門看不看得見我給它的那棵樹", () => {
  it("★ tools/conformance 讀了 --root（正向那一列）", () => {
    const probe = probeRootSupport(ROOT, "tools/conformance");

    expect(probe.readsRoot, probe.evidence).toBe(true);
    // ⚠️ 綠燈這條路徑也要留證據：這個判定認的是「兩趟有差異」，而差異不必然
    // 來自 `--root`（一個時間數字就夠了）。那種判錯不會有紅燈 —— 證據留著，
    // 那一天才看得出差在哪裡。
    expect(probe.evidence, "判它「讀了」卻說不出差在哪裡").toContain("指向 repo 自己");
  });

  it("★ 故意忽略 --root 的假閘門會被抓到（已知非零的那一列）", () => {
    const probe = probeRootSupport(ROOT, IGNORES_ROOT);

    expect(probe.readsRoot).toBe(false);
    // 紅燈要說得出證據 —— 只回一個 false 的話，讀報告的人無從判斷是
    // 閘門忽略了旗標，還是探針自己壞了。
    expect(probe.evidence).toContain(IGNORES_ROOT);
  });

  /**
   * ⚠️ 這一條守的是 `probe.ts` 那兩個「⚠️」的設計決定（兩趟 argv 對稱、
   * 兩個路徑遮成同一個標記）。上面那支假閘門**把 argv 原樣印出來**，
   * 所以少了任何一步，它都會被判成「讀了 --root」—— 而那是危險方向的判錯：
   * 放行一支其實在量真樹的閘門。
   */
  it("把參數印出來不算「讀了它」", () => {
    const probe = probeRootSupport(ROOT, IGNORES_ROOT);

    expect(probe.evidence, "路徑沒有被遮成同一個標記").toContain("<ROOT>");
    expect(probe.evidence, "遮罩把 argv 那一行整段吃掉了，證據就不成立").toContain("argv:");
  });
});
