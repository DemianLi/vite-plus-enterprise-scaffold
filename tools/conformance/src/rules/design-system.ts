import { readFileSync } from "node:fs";
import { relative } from "node:path";

import {
  IMPORT_SPECIFIER_PATTERN,
  isTypeOnlyImportAt,
  SLICE_DESIGN_SYSTEM_IMPORTS,
  DESIGN_SYSTEM_PACKAGE,
  usesDesignSystem,
} from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";
import { collectSourceFiles } from "../scan.ts";

/**
 * D15：切片不得自己長出一套設計系統。
 *
 * 擋的是 import 而不是「有沒有 components 目錄」—— 切片當然需要自己的呈現元件，
 * 擋掉目錄只會逼大家把元件塞進 views/，規則變成純粹的騷擾。
 * 真正要防的是繞過 `@org/ui` 自己拼基元：D4 禁止切片互依，
 * 所以第二個團隊會再拼一次，兩套永遠不會收斂。
 */
export function checkDesignSystemBoundary(slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    for (const file of collectSourceFiles(slicePath)) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
        const specifier = match[1];
        if (specifier === undefined || match.index === undefined) continue;
        // 借型別不算耦合，理由同 store 的規則。
        if (isTypeOnlyImportAt(source, match.index)) continue;

        const banned = SLICE_DESIGN_SYSTEM_IMPORTS.find((name) => specifier === name);
        if (banned === undefined) continue;

        fail(
          slice,
          "繞過設計系統",
          `${relative(slicePath, file)} 直接 import 了 "${banned}"`,
          `一律走 @org/ui（D15）。要的元件那裡沒有，就把它加進 platform/ui ——` +
            "那個 package 有 CODEOWNERS 與 api-surface 閘門，切片沒有。" +
            "在切片裡自己拼一套，第二個團隊會再拼一次，而兩套永遠不會收斂",
        );
      }
    }
  });
}

/**
 * D15 的另一半：切片有沒有**真的用**設計系統。
 *
 * `checkDesignSystemBoundary` 擋的是「繞過 `@org/ui` 自己拼基元」。
 * 這條擋的是更常見、也更安靜的那一種：**根本沒用**。
 *
 * 沒有這條的話，一個全用裸 `<h1>`／`<table>`／自己寫的 `<style scoped>`
 * 的切片會全綠通過 —— 而那正是 D15 想避免的「每個團隊各長一套」，
 * 它不是靠有人偷偷 import reka-ui 發生的，是靠沒有人 import 任何東西發生的。
 *
 * 判準住在契約裡（`usesDesignSystem`），與產生器的測試共用同一份實作。
 */
export function checkDesignSystemAdoption(slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    const files = collectSourceFiles(slicePath);

    // 掃不到檔案就當失敗。空清單會讓 `.some()` 回傳 false，
    // 訊息會變成「這個切片沒用設計系統」—— 指著完全錯誤的方向。
    if (files.length === 0) {
      fail(
        slice,
        "設計系統採用",
        "掃不到任何原始碼檔案",
        "這通常表示目錄結構與 SOURCE_EXTENSIONS 對不上，而不是切片真的沒有程式碼",
      );
      return;
    }

    if (files.some((file) => usesDesignSystem(readFileSync(file, "utf8")))) return;

    fail(
      slice,
      "設計系統採用",
      `整個切片沒有任何一處使用 ${DESIGN_SYSTEM_PACKAGE}`,
      `畫面元件一律從 ${DESIGN_SYSTEM_PACKAGE} 取用（D15）。` +
        "自己刻一套不會違反任何一條規則，但兩個團隊各刻一次之後就永遠不會收斂 ——" +
        "而且兩邊各自看起來都是對的。" +
        `真的有切片不該用設計系統（純後台工具頁之類），那是契約要改，不是這一片開個旗標`,
    );
  });
}
