import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectFields, parsePersonalData, renderRules } from "../src/generate.ts";

/**
 * SAST 規則的**結構**測試。
 *
 * ── 這支測試證明不了規則會不會命中 ──────────────────────────────────
 *
 * 那件事只有 semgrep 本體驗得了，而它跑在 Tier 2（`semgrep --test` 對
 * `.semgrep/fixtures/` 的 `ruleid:`／`ok:` 標記）。**那才是這套規則的反向測試。**
 *
 * 這裡驗的是不需要 semgrep 也該成立的性質，而其中最重要的一條是：
 * **每一條規則都必須有 fixture 在測它。** 少了這條，加一條沒有 fixture 的
 * 規則會讓 `semgrep --test` 什麼都不驗而回綠 —— 又是「沒被檢查」與
 * 「檢查通過」長得一樣的那個形狀。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const SEMGREP = join(ROOT, ".semgrep");

function ruleFiles(): readonly string[] {
  return readdirSync(SEMGREP).filter((name) => name.endsWith(".yml"));
}

function ruleIds(source: string): readonly string[] {
  return [...source.matchAll(/^ {2}- id: ([\w-]+)$/gm)].map((match) => match[1] as string);
}

function fixtureText(): string {
  return readdirSync(join(SEMGREP, "fixtures"))
    .map((name) => readFileSync(join(SEMGREP, "fixtures", name), "utf8"))
    .join("\n");
}

describe("規則檔本身", () => {
  it("兩份規則檔都在，而且不是空的", () => {
    expect([...ruleFiles()].sort()).toEqual(["generated-pii.yml", "rules.yml"]);
  });

  it("★ 每一條規則都有 id、severity 與 message", () => {
    for (const file of ruleFiles()) {
      const source = readFileSync(join(SEMGREP, file), "utf8");
      const ids = ruleIds(source);
      if (ids.length === 0) continue; // 產生的那份在沒有個資欄位時可以是空的
      expect(source.match(/severity:/g) ?? [], file).toHaveLength(ids.length);
      expect(source.match(/message:/g) ?? [], file).toHaveLength(ids.length);
    }
  });

  it("🔴 每一條規則都必須有 fixture 在測它", () => {
    // 少了這條，加一條沒有 fixture 的規則會讓 semgrep --test 什麼都不驗
    // 而回綠 —— 「沒被檢查」與「檢查通過」又長得一樣了。
    const fixtures = fixtureText();
    for (const file of ruleFiles()) {
      for (const id of ruleIds(readFileSync(join(SEMGREP, file), "utf8"))) {
        expect(fixtures, `規則 ${id} 沒有任何 fixture 標記`).toContain(`ruleid: ${id}`);
      }
    }
  });

  it("★ 每一條規則也要有「不該命中」的 fixture", () => {
    // 只驗會命中的話，一條寬到什麼都抓的規則會全綠 ——
    // 而誤報正是開發期閘門被關掉的主因。
    const fixtures = fixtureText();
    for (const file of ruleFiles()) {
      for (const id of ruleIds(readFileSync(join(SEMGREP, file), "utf8"))) {
        expect(fixtures, `規則 ${id} 沒有對照組（ok: 標記）`).toContain(`ok: ${id}`);
      }
    }
  });
});

describe("產生的規則與切片契約同步", () => {
  /**
   * ⚠️ 「產出與版控的檔案一致」**刻意不在這裡驗**，而是由閘門
   * （`node tools/sast/src/cli.ts`，跑在 vpr ready 與 Tier 2）負責。
   *
   * 原因是實測撞到的：那個比對要經過 `vp fmt`（formatter 才是權威），
   * 而在 `vp run -r test` 底下再 spawn 一次 `vp` 是**把工具鏈套進它自己裡面**。
   * 單獨跑 `vp run -F @org/sast test` 全綠，放進 `vpr ready` 就有別的
   * package 的測試以看不出原因的方式失敗。
   *
   * 閘門本來就會跑那個比對，測試再跑一次只是多一個併發來源。
   */

  it("目前真的有欄位被涵蓋 —— 零個欄位等於這條規則不存在", () => {
    const fields = collectFields(ROOT).flatMap((entry) => entry.fields);
    expect(fields).toContain("customerName");
  });

  it("🔴 加一個欄位會讓產出改變", () => {
    const before = renderRules([{ slice: "order", fields: ["customerName"] }]);
    const after = renderRules([{ slice: "order", fields: ["customerName", "phone"] }]);
    expect(after).not.toBe(before);
    expect(after).toContain(".phone");
  });

  it("★ 輸出是排序過的 —— 否則同一份原始碼在不同機器上會產出不同檔案", () => {
    const one = renderRules([{ slice: "a", fields: ["zeta", "alpha"] }]);
    const two = renderRules([{ slice: "a", fields: ["alpha", "zeta"] }]);
    expect(one).toBe(two);
  });

  it("★ 沒有任何個資欄位時產出的是「空規則」而不是壞掉的 YAML", () => {
    const empty = renderRules([]);
    expect(empty).toContain("rules: []");
    // 而且要講清楚「沒有規則」不等於「通過」。
    expect(empty).toContain("不代表通過");
  });
});

describe("parsePersonalData 與 pii-check 用同一條規矩", () => {
  it("只認字面陣列", () => {
    expect(parsePersonalData(`personalData: ["a", "b"],`)).toEqual(["a", "b"]);
    expect(parsePersonalData("personalData: [...X],")).toBeNull();
    expect(parsePersonalData("permissions: [],")).toBeNull();
  });
});

describe("規則涵蓋的是 lint 做不到的那一半", () => {
  it("★ taint 規則跨函式邊界 —— fixture 裡有一條就是這樣寫的", () => {
    const source = readFileSync(join(SEMGREP, "fixtures/rules.ts"), "utf8");
    expect(source).toContain("跨了一個函式邊界仍然追得到");
  });

  it("★ fixture 記下了目前抓不到的東西", () => {
    // logger 包裝過的 log 抓不到。把「抓不到」釘成看得見的事實，
    // 比讓它當一個沒有人知道的洞好。
    const source = readFileSync(join(SEMGREP, "fixtures/generated-pii.ts"), "utf8");
    expect(source).toContain("目前的規則只認 console.*");
  });
});
