import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkSlice,
  leaksField,
  maskingProblems,
  parsePersonalData,
  renderedExpressions,
} from "../src/masking.ts";

/**
 * §11 II ⑨ 靜態層的**反向測試**。
 *
 * 這一層判錯的方向有兩個，而兩個都會讓它失效：
 *
 *   - 漏報：新加一欄直接印出完整姓名，閘門全綠
 *   - 誤報：合法的寫法被擋，於是有人把這道檢查從 workflow 拿掉
 *
 * 標 ★ 的驗的是**不該紅的時候不會紅**。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CLI = join(ROOT, "tools/pii-check/src/cli.ts");

function sfc(templateBody: string, scriptBody = ""): string {
  return `<script setup lang="ts">\n${scriptBody}\n</script>\n\n<template>\n${templateBody}\n</template>\n`;
}

function check(templateBody: string, fields: readonly string[] = ["customerName"]) {
  return checkSlice("demo", fields, new Map([["demo.vue", sfc(templateBody)]]));
}

describe("parsePersonalData：宣告必須是字面的", () => {
  it("讀得出字面陣列", () => {
    expect(parsePersonalData(`personalData: ["customerName", "email"],`)).toEqual([
      "customerName",
      "email",
    ]);
  });

  it("★ 空陣列是一個答案，不是讀不到", () => {
    expect(parsePersonalData("personalData: [],")).toEqual([]);
  });

  it("🔴 完全沒宣告 → null（而不是當成空陣列放行）", () => {
    // 這是整條規則的樞紐：「這個切片沒有個資」與「沒有人想過這件事」
    // 必須長得不一樣。當成空陣列的話，第二種會靜靜通過。
    expect(parsePersonalData("permissions: [], menu: [],")).toBeNull();
  });

  it("🔴 算出來的宣告 → null", () => {
    // review 看不出這個切片碰了哪些個資的話，宣告就失去意義。
    expect(parsePersonalData("personalData: [...BASE, fieldName],")).toBeNull();
    expect(parsePersonalData("personalData: [`x${y}`],")).toBeNull();
  });

  it("真的切片檔讀得出來", () => {
    const order = readFileSync(join(ROOT, "features/order/src/index.ts"), "utf8");
    expect(parsePersonalData(order)).toEqual(["customerName"]);
    const shipment = readFileSync(join(ROOT, "features/shipment/src/index.ts"), "utf8");
    expect(parsePersonalData(shipment)).toEqual([]);
  });
});

describe("renderedExpressions：只看 template", () => {
  it("抓得到插值", () => {
    expect(renderedExpressions(sfc("<p>{{ order.customerName }}</p>"))).toContain(
      "order.customerName",
    );
  });

  it("抓得到繫結屬性 —— :title 也會把值放進 DOM", () => {
    expect(renderedExpressions(sfc(`<p :title="order.customerName" />`))).toContain(
      "order.customerName",
    );
  });

  it("★ 不看 <script> —— 規則講的是呈現", () => {
    // 把 script 也納入只會逼人改個變數名繞過，而畫面照樣印出完整姓名。
    const source = sfc("<p>{{ masked }}</p>", "const masked = maskName(order.customerName);");
    expect(renderedExpressions(source)).toEqual(["masked"]);
  });
});

describe("🔴 該紅的時候會紅", () => {
  it("直接插值宣告過的欄位 → 違規", () => {
    const result = check("<td>{{ order.customerName }}</td>");
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.field).toBe("customerName");
  });

  it("藏在繫結屬性裡也算 —— :title 一樣進 DOM", () => {
    expect(check(`<td :title="order.customerName">x</td>`).violations).toHaveLength(1);
  });

  it("多個違規全部列出，不是只報第一個", () => {
    const result = check("<td>{{ a.customerName }}</td><td>{{ b.customerName }}</td>");
    expect(result.violations).toHaveLength(2);
  });

  it("🔴 宣告了卻沒有任何模板用到 → 紅（欄位可能改名了）", () => {
    // 宣告對不到東西的話，它保護的是空氣，而閘門會一直全綠。
    const result = checkSlice("demo", ["oldFieldName"], new Map([["a.vue", sfc("<p>x</p>")]]));
    const kinds = maskingProblems([result]).map((problem) => problem.kind);
    expect(kinds).toContain("declared-but-never-rendered");
  });

  it("🔴 一個切片都沒讀到 → 紅", () => {
    expect(maskingProblems([]).map((problem) => problem.kind)).toContain("no-slices");
  });
});

describe("★ 不該紅的時候不會紅", () => {
  it("包在 maskName 裡 → 放行", () => {
    expect(check("<td>{{ maskName(order.customerName) }}</td>").violations).toEqual([]);
  });

  it("其他 mask* 函式一樣認得", () => {
    for (const call of ["maskEmail", "maskPhone", "maskNationalId", "maskAll"]) {
      expect(check(`<td>{{ ${call}(order.customerName) }}</td>`).violations).toEqual([]);
    }
  });

  it("沒宣告的欄位不管 —— 金額與狀態不是個資", () => {
    expect(check("<td>{{ order.totalCents }}{{ order.status }}</td>").violations).toEqual([]);
  });

  it("欄位名是別的字的一部分時不誤判", () => {
    // `customerNameLabel` 不是 `customerName`。用 \\b 邊界，
    // 少了它，改個變數名就會被誤擋，然後有人把整道檢查關掉。
    expect(leaksField("t.customerNameLabel", "customerName")).toBe(false);
  });

  it("空的 personalData 不產生任何事", () => {
    const result = checkSlice("demo", [], new Map([["a.vue", sfc("<p>{{ anything }}</p>")]]));
    expect(maskingProblems([result])).toEqual([]);
  });
});

describe("CLI 端對端", () => {
  it("這個 repo 現在是綠的", () => {
    const result = spawnSync("node", [CLI, "--masking"], { cwd: ROOT, encoding: "utf8" });
    expect(result.status, `${result.stdout ?? ""}${result.stderr ?? ""}`).toBe(0);
  });

  it("★ 通過訊息要講出這一層證明不到什麼", () => {
    // 「寫了 mask」與「真的遮住了」是兩件事。少了這句，綠燈會被讀成後者。
    const result = spawnSync("node", [CLI, "--masking"], { cwd: ROOT, encoding: "utf8" });
    expect(result.stdout).toContain("不證明渲染結果真的被遮住");
  });

  it("而且它真的看到了東西 —— 零個宣告欄位是假綠燈", () => {
    const result = spawnSync("node", [CLI, "--masking"], { cwd: ROOT, encoding: "utf8" });
    const fields = /(\d+) 個宣告欄位/.exec(result.stdout ?? "")?.[1];
    expect(Number(fields)).toBeGreaterThan(0);
  });
});
