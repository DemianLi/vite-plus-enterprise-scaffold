import { describe, expect, it } from "vitest";

import type { Finding } from "../src/finding.ts";
import { collect } from "../src/finding.ts";
import { formatReport, groupFindings } from "../src/report.ts";

/**
 * 報告的形狀。
 *
 * ── 為什麼這值得一支測試 ────────────────────────────────────────────
 *
 * 這支工具的 stdout／stderr 不是內部細節：CI 的紀錄直接照抄它，
 * `vpr gate` 的輸出就是它，而人在 PR 上讀的也是它。
 * 拆解之前要驗它只能起子行程比對整段字串 —— 那種測試會同時綁著
 * 判定、格式與結束碼，改任何一個都紅，而紅的訊息不會說是哪一個。
 *
 * ⚠️ 這裡刻意連**換行**都斷言。前身是十幾行 `console.error`，
 * 每一行自動補一個 `\n`；改寫成回傳字串的過程中少補一個不會有任何
 * 東西抗議，而輸出就變了。
 */

function finding(where: string, rule: string): Finding {
  return { where, rule, detail: "細節", fix: "怎麼修" };
}

describe("分組", () => {
  it("照 where 分組，組內維持記下來的順序", () => {
    const grouped = groupFindings([
      finding("features/order", "命名"),
      finding("platform", "CSP 不相容的元件"),
      finding("features/order", "測試"),
    ]);

    expect([...grouped.keys()]).toEqual(["features/order", "platform"]);
    expect(grouped.get("features/order")?.map((f) => f.rule)).toEqual(["命名", "測試"]);
  });

  /**
   * ⚠️ 走訪順序必須是**插入順序**，也就是規則跑的順序。
   *
   * 換成用物件當累加器的話，鍵是整數樣字串的那幾組會被排到最前面 ——
   * 一個叫 `123` 的切片就會踩到。現在的目錄名不會長那樣，
   * 但那種故障不會有任何東西說話，所以先釘住。
   */
  it("整數樣的名字不得被排到前面", () => {
    const grouped = groupFindings([finding("features/order", "命名"), finding("123", "命名")]);

    expect([...grouped.keys()]).toEqual(["features/order", "123"]);
  });
});

describe("排版", () => {
  it("一條違規的完整輸出", () => {
    const report = formatReport([
      { where: "features/order", rule: "測試", detail: "找不到任何測試", fix: "補一支" },
    ]);

    expect(report).toBe(
      "\n✗ 一致性檢查未通過：1 項違規\n\n" +
        "  features/order\n" +
        "    ✗ [測試] 找不到任何測試\n" +
        "      → 補一支\n" +
        "\n",
    );
  });

  it("每一組之間空一行", () => {
    const report = formatReport([finding("a", "r1"), finding("b", "r2")]);

    expect(report.split("\n\n")).toHaveLength(4);
  });
});

describe("collect", () => {
  it("把 fail 的四個參數收成 Finding", () => {
    const findings = collect((fail) => {
      fail("features/order", "測試", "細節", "怎麼修");
    });

    expect(findings).toEqual([
      { where: "features/order", rule: "測試", detail: "細節", fix: "怎麼修" },
    ]);
  });

  /**
   * 規則本體有好幾條靠中途 `return` 提早結束（`checkDesignSystemAdoption`
   * 掃不到檔案時就是這樣）。拆解時那些 `return` 一個字都沒改 ——
   * 它們現在離開的是 callback 而不是函式，而已經記下的那幾筆必須回得去。
   */
  it("中途 return 不會丟掉已經記下的 finding", () => {
    const findings = collect((fail) => {
      fail("a", "先記一筆", "細節", "怎麼修");
      return;
    });

    expect(findings).toHaveLength(1);
  });

  it("什麼都沒記就是空陣列，不是 undefined", () => {
    expect(collect(() => {})).toEqual([]);
  });
});
