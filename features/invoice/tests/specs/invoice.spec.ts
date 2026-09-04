import {
  describeFeature,
  loadFeature,
  setVitestCucumberConfiguration,
} from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import type { InvoiceGateway, InvoiceItem, InvoiceListResponse } from "../../src/ports.ts";
import { queryInvoice } from "../../src/usecases/query-invoice.ts";
import { createInMemoryInvoiceGateway } from "../support/in-memory-gateway.ts";

/**
 * 規格的**接線**，不是測試。它把 specs/invoice.feature 裡的中文句子接到
 * usecase 上。人讀的是那份 .feature，不是這一支 —— 這裡越薄越好。
 */

// ⚠️ 這一行是實測出來的**必要條件**，不是可選設定（C110）：
//
//   language    .feature 裡的「# language: zh-TW」標頭**本身不生效**。
//               少了這裡，parser 解析不出 Feature，錯誤訊息是
//               「TypeError: ...reading 'getScenario'」—— 完全看不出根因。
//   excludeTags @待辦 的場景若沒被排除，runner 會要求它**也要有接線**
//               （ScenarioNotCalledError），三態機制就做不出來。
//
// ⚠️ 兩件事靠同一行解決，而**這一行由 slice-gen 產生，不要刪**。
setVitestCucumberConfiguration({
  language: "zh-TW",
  excludeTags: ["待辦"],
  // ⚠️ 這兩個是**上游型別的缺陷，不是我們需要的設定**：VitestCucumberOptions
  // 把它們標成必填，而同一個檔案裡的 getVitestCucumberConfiguration 自己
  // 把它們 Omit 掉 —— 可見作者本意是可選。少了這兩行，產出的切片
  // 第一次跑 vp check 就是 TS2739（實測，C114）。
  predefinedSteps: [],
  mappedExamples: {},
});

// ⚠️ 路徑是 **package 相對**，不是從 monorepo 根目錄起算 ——
// vp run <pkg>#test 的 cwd 就是這個 package 的目錄（C111）。
const feature = await loadFeature("specs/invoice.feature");

describeFeature(feature, ({ Background, Scenario, ScenarioOutline }) => {
  let gateway: InvoiceGateway;
  let result: InvoiceListResponse;
  let thrown: unknown;

  Background(({ Given }) => {
    // ⚠️ 表格直接餵給假的 gateway，**不打真的 HTTP**。
    // 規格描述的是業務規則，不是網路行為。
    //
    // 欄位名是中文（規格用業務語言），翻譯成程式的欄位是**接線的工作** ——
    // 這正是這一支存在的理由。
    Given("系統裡有下列資料:", (_, table: { 編號: string }[]) => {
      const items: InvoiceItem[] = table.map((row) => ({ id: row.編號 }));
      gateway = createInMemoryInvoiceGateway(items);
      thrown = undefined;
    });
  });

  Scenario("不帶條件時列出全部", ({ When, Then }) => {
    When("查詢資料", async () => {
      result = await queryInvoice(gateway);
    });
    Then("應該列出 {number} 筆", (_, expected: number) => {
      expect(result.items).toHaveLength(expected);
    });
  });

  // ⚠️ **場景大綱的步驟表達式有兩種寫法，選哪一種由 .feature 的原文決定**
  // （實測，C114）—— runner 比對的是**還沒展開**的那一行：
  //
  //     .feature 原文              這裡要寫
  //     以關鍵字 "<關鍵字>" …      以關鍵字 {string} …   ← 帶引號，配得上 {string}
  //     應該列出 <筆數> 筆          應該列出 <筆數> 筆     ← 不帶引號，只能寫字面
  //
  // 兩種寫反都是 runner 當場報錯，不會安靜跳過（「No step match」／
  // 「does not exist」），所以這個坑會吵，不會爛在那裡。
  //
  // ⚠️ 值一律從 variables 拿，不從 step 的參數拿 —— 字面那一種根本沒有參數。
  ScenarioOutline("以關鍵字篩選", ({ When, Then, And }, variables) => {
    When("以關鍵字 {string} 查詢資料", async () => {
      result = await queryInvoice(gateway, { keyword: String(variables.關鍵字) });
    });
    Then("應該列出 <筆數> 筆", () => {
      expect(result.items).toHaveLength(Number(variables.筆數));
    });
    And("總數應該是 <筆數>", () => {
      expect(result.total).toBe(Number(variables.筆數));
    });
  });

  Scenario("查無相符時回傳空清單，不是錯誤", ({ When, Then, And }) => {
    When("以關鍵字 {string} 查詢資料", async (_, keyword: string) => {
      // ⚠️ 這裡刻意接住例外而不是讓它冒出去 —— 下一個步驟要斷言的正是
      // 「沒有拋出」。直接 await 的話，拋了就變成一條看不出意圖的紅燈。
      try {
        result = await queryInvoice(gateway, { keyword });
      } catch (error) {
        thrown = error;
      }
    });
    Then("應該列出 {number} 筆", (_, expected: number) => {
      expect(result.items).toHaveLength(expected);
    });
    And("不應該拋出錯誤", () => {
      expect(thrown).toBeUndefined();
    });
  });

  // ⚠️ 標了 @待辦 的場景**不在這裡出現** —— 它們被 excludeTags 擋在解析之外，
  // 所以不要求接線。人把 @待辦 拿掉的那一刻，那個場景就進入解析結果、
  // 找不到接線、紅燈 —— 那就是「該做了」。
});
