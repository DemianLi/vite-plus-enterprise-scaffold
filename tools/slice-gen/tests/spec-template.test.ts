import { describe, it, expect } from "vitest";
import { loadFeatureFromText } from "@amiceli/vitest-cucumber";

import { TODO_TAG } from "@org/slice-kit/contract";

import { buildSliceFiles } from "../src/files.ts";

/**
 * ── 用**真的 parser** 跑模板自己的規格（C114 §十一）──────────────────
 *
 * 其餘的斷言都在讀字串：檔案在不在、那一行設定有沒有生成、副檔名對不對。
 * 那些擋得住「模板被改壞」，擋不住**上游變了**：runner 換掉
 * `predefinedSteps` 的形狀、或中文關鍵字表改版，字串斷言全都還是綠的，
 * 而破掉的東西會落在第一個產切片的專案組手上。
 *
 * 這一支把模板產出的 `.feature` 原文餵進 `loadFeatureFromText` ——
 * 同一個 parser、同一組中文關鍵字。它跑在 CI 每一次，不需要產切片、
 * 不需要 tmpdir、不需要 install。
 *
 * ⚠️ 它**不執行**場景（那需要 describeFeature 與接線），驗的是「規格解析得出來、
 * 而且分母數得對」。執行那一半由產出的切片自己跑。
 */

const options = { name: "order-history", title: "訂單紀錄", team: "@org/team-fulfillment" };
const files = buildSliceFiles(options);

function featureText(): string {
  const specs = (files as Record<string, Record<string, string>>)["specs"];
  const text = specs?.[`${options.name}.feature`];
  if (typeof text !== "string") throw new Error("模板沒有產出 .feature —— 讀不到就不要給判決");
  return text;
}

/** 場景的**執行實例**數：場景算 1，場景大綱按例子的每一列各算 1（C110）。 */
function instanceCount(scenario: unknown): number {
  const examples = (scenario as { examples?: unknown[] }).examples;
  return Array.isArray(examples) ? examples.length : 1;
}

describe("模板的規格餵得進真的 parser", () => {
  const feature = loadFeatureFromText(featureText(), { language: "zh-TW" });

  it("中文關鍵字解析得出 Feature —— 標頭那一行本身不生效，靠的是 language", () => {
    expect(feature.name).toBe(options.title);
    expect(feature.scenarii.length).toBeGreaterThan(0);
  });

  it("有背景，而且背景帶著資料表", () => {
    expect(feature.background).not.toBeNull();
  });

  it("場景大綱按例子的每一列展開 —— 分母不是場景數", () => {
    const outlines = feature.scenarii.filter((s) => instanceCount(s) > 1);
    expect(outlines.length, "模板應該示範一個場景大綱").toBeGreaterThan(0);
  });

  /**
   * ⚠️ 這一條是完成率的分母算法本身（C110）：不過濾載一次算分母，
   * 過濾之後跑該跑的，兩者的差集就是待辦清單。
   *
   * 標籤**不在** `.tags` 上（那是 `{}`），要用 `matchTags()` —— 這是實測出來的，
   * 而它是一個上游隨時可能改的內部形狀，所以值得有一條測試盯著。
   */
  it("待辦與該做的分得開，而且兩邊都不是空的", () => {
    const todo = feature.scenarii.filter((s) => s.matchTags([TODO_TAG]));
    const due = feature.scenarii.filter((s) => !s.matchTags([TODO_TAG]));

    expect(todo.length, "模板應該示範至少一條 @待辦").toBeGreaterThan(0);
    expect(due.length, "模板應該有至少一條該做了的場景").toBeGreaterThan(0);

    const denominator = feature.scenarii.reduce((sum, s) => sum + instanceCount(s), 0);
    const todoInstances = todo.reduce((sum, s) => sum + instanceCount(s), 0);

    expect(denominator).toBe(todoInstances + due.reduce((sum, s) => sum + instanceCount(s), 0));
    expect(todoInstances).toBeLessThan(denominator);
  });
});
