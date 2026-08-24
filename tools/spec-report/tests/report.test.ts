import { describe, it, expect } from "vitest";

import { collectInstances } from "../src/collect.ts";
import { resolve, type VitestResults } from "../src/match.ts";
import { renderCli, renderReport, tally } from "../src/render.ts";

import { FEATURE, ALL_GREEN, results } from "./fixture.ts";

const specs = [{ slice: "order", path: "features/order/specs/order.feature", text: FEATURE }];
const instances = collectInstances(specs);

describe("分母 ＝ 場景的執行實例數", () => {
  it("場景算 1、場景大綱按例子的每一列各算 1", () => {
    // 1（不帶條件）＋ 2（場景大綱兩列）＋ 1（待辦）＝ 4
    expect(instances).toHaveLength(4);
  });

  it("場景大綱展開成每一列，而不是一整個算一個", () => {
    const outline = instances.filter((i) => i.scenario === "以關鍵字篩選");
    expect(outline.map((i) => i.example)).toEqual(["A,2", "B-001,1"]);
  });

  it("@待辦 被認出來 —— 標籤不在 .tags 上，走的是 matchTags", () => {
    expect(instances.filter((i) => i.todo).map((i) => i.scenario)).toEqual(["依金額區間篩選"]);
  });

  it("對照鍵的格式固定，CLI 與報表檔靠它接起來", () => {
    expect(instances.map((i) => i.key)).toEqual([
      "order/訂單查詢#不帶條件時列出全部",
      "order/訂單查詢#以關鍵字篩選[A,2]",
      "order/訂單查詢#以關鍵字篩選[B-001,1]",
      "order/訂單查詢#依金額區間篩選",
    ]);
  });

  /**
   * ⚠️ 步驟標題走的是 parser 自己的 `getStepTitle(step, example)`，
   * 不是我們重現一份 Gherkin 的參數替換 —— 而它產出的字串與 vitest
   * 報出來的 test 名稱**逐字相同**，那是整個對照機制的地基（C115 §二實測）。
   */
  it("場景大綱各列的步驟標題帶著代進去的值，所以不同列分得開", () => {
    const [, first, second] = instances;
    expect(first?.stepTitles).toEqual(['當 以關鍵字 "A" 查詢資料', "那麼 應該列出 2 筆"]);
    expect(second?.stepTitles).toEqual(['當 以關鍵字 "B-001" 查詢資料', "那麼 應該列出 1 筆"]);
  });
});

describe("四態", () => {
  it("全綠時：非待辦的都完成，待辦仍是待辦", () => {
    const t = tally(resolve(instances, ALL_GREEN));
    expect(t).toMatchObject({ 完成: 3, 待辦: 1, 擋下: 0, 未執行: 0, total: 4 });
  });

  it("某一列的斷言紅了，只有那一列擋下", () => {
    const red = structuredClone(ALL_GREEN) as VitestResults;
    const target = red.testResults[0]?.assertionResults.find(
      (a) => a.title === "那麼 應該列出 2 筆",
    ) as { status: string };
    target.status = "failed";

    const resolved = resolve(instances, red);
    const blocked = resolved.filter((r) => r.status === "擋下");
    expect(blocked.map((r) => r.instance.example)).toEqual(["A,2"]);
    expect(blocked[0]?.failedSteps).toEqual(["那麼 應該列出 2 筆"]);
  });

  /**
   * ⚠️ **這一條是這支工具最重要的斷言。**
   *
   * 接線檔的副檔名取錯（C114 §二）、規格檔改名、整個測試檔 collect 失敗 ——
   * 症狀全都是「測試全綠而場景一條都沒跑」。把「找不到對應結果」算成完成，
   * 就是把那個洞原樣重建在一份拿去對外報進度的文件裡。
   */
  it("結果裡完全找不到 → 未執行，而不是完成", () => {
    const t = tally(resolve(instances, { testResults: [] }));
    expect(t).toMatchObject({ 完成: 0, 待辦: 1, 擋下: 0, 未執行: 3 });
  });

  it("跑到一半炸掉（後面的步驟沒跑）判成未執行，不是擋下", () => {
    const partial = results([
      { scenario: "場景: 不帶條件時列出全部", title: "當 查詢資料", status: "failed" },
    ]);
    const hit = resolve(instances, partial).find(
      (r) => r.instance.scenario === "不帶條件時列出全部",
    );
    // 「那麼 應該列出 3 筆」根本沒出現在結果裡 —— 該報的是沒跑完，
    // 不是「跑了但錯」，後者會讓人以為規格至少被執行過一遍。
    expect(hit?.status).toBe("未執行");
  });
});

describe("報表檔", () => {
  const report = renderReport(resolve(instances, ALL_GREEN));

  /**
   * ⚠️ 有了時間戳，這份檔案每一天都與重新產生的內容不同，`--check` 永遠是紅的，
   * 於是沒有任何閘門守得住它是不是最新的 —— 而一份沒有人在守、又進了版控的
   * 產出物，正是這個 repo 一再栽跟頭的東西。
   */
  it("沒有時間戳 —— 有的話 --check 就永遠紅，等於沒有閘門", () => {
    expect(report).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("不寫失敗原因 —— 原因會過期，而這份檔案會被貼進工單", () => {
    const red = structuredClone(ALL_GREEN) as VitestResults;
    const target = red.testResults
      .flatMap((file) => file.assertionResults)
      .find((assertion) => assertion.title === "那麼 應該列出 2 筆") as { status: string };
    target.status = "failed";
    expect(renderReport(resolve(instances, red))).not.toContain("那麼 應該列出 2 筆");
  });

  it("合計只給絕對數，不給跨切片的百分比", () => {
    const total = report.split("\n").find((line) => line.includes("**合計**"));
    expect(total).toContain("| — |");
  });

  it("每一個場景實例都有一列 —— 它是唯一完整來源", () => {
    for (const instance of instances) {
      const label =
        instance.example === null ? instance.scenario : `${instance.scenario}[${instance.example}]`;
      expect(report).toContain(`| ${label} |`);
    }
  });

  it("空樹不是錯誤，而且說得出為什麼是空的", () => {
    const empty = renderReport([]);
    expect(empty).toContain("C114");
    expect(empty).toContain("vp create slice");
  });
});

describe("CLI 輸出", () => {
  /**
   * ⚠️ CLI 刻意不完整 —— 全部列出來就沒有人看了。待辦只印鍵不印細節：
   * 細節在規格裡，而規格是人寫的，人本來就知道；印出來只會讓紅燈被淹掉。
   */
  it("待辦只印對照鍵，不印步驟", () => {
    const out = renderCli(resolve(instances, ALL_GREEN), "SPEC-REPORT.md");
    expect(out).toContain("order/訂單查詢#依金額區間篩選");
    expect(out).not.toContain("那麼 應該列出 1 筆");
  });

  it("完成的場景不出現在 CLI 裡 —— 它們不需要行動", () => {
    const out = renderCli(resolve(instances, ALL_GREEN), "SPEC-REPORT.md");
    expect(out).not.toContain("不帶條件時列出全部");
    expect(out).toContain("完成率 3/4");
  });

  /**
   * 🔴 括號裡那個百分比**也要驗**，不是只驗 `3/4`。
   *
   * 上面那條 `toContain("完成率 3/4")` 停在分數形式，於是 `rate()` 裡的
   * `* 100` 改成 `/ 100`（`75.0%` → `0.0%`）**不會有任何測試變紅** ——
   * 而那是這份報表最外層、最多人只看那一眼的數字。
   *
   * ⚠️ #136 的突變測試掉出來的（#145 其二）。這是 C115 記的「三態不夠用」
   * 之外、**同一支檔案的第二個洞**：三態那次缺的是一個狀態，這次缺的是
   * 「有人在看那個數字算得對不對」。
   */
  it("🔴 完成率的百分比真的算出來 —— 只驗 3/4 的話 `* 100` 改成 `/ 100` 也是綠的", () => {
    const out = renderCli(resolve(instances, ALL_GREEN), "SPEC-REPORT.md");
    expect(out).toContain("完成率 3/4（75.0%）");
  });

  it("未執行印得出「接線斷了」，那與「沒綠」是不同的病", () => {
    const out = renderCli(resolve(instances, { testResults: [] }), "SPEC-REPORT.md");
    expect(out).toContain("接線斷了");
  });
});
