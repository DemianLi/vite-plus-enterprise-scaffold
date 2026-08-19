import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collect, type Finding } from "@org/conformance/finding";

import { sectionFor } from "./parse.ts";
import { trackedDirectories } from "./tree.ts";

/**
 * `SCOPE.md` 說准許存在的東西，與版控裡真正存在的東西，是不是同一份。
 *
 * ── 為什麼需要這道閘門 ──────────────────────────────────────────────
 *
 * `v1.0.4` 把 v1 的範疇判準寫成 `SCOPE.md`，而那一版的文末自己就寫著
 * 「**沒有任何機制在守這份文件**」。手抄的清單會漂 —— 這個 repo 已經在
 * 同一件事上栽過三次（C71 記了兩次，`main` 的 C74 是第三次）。
 *
 * 而且它不是假想的：寫 `SCOPE.md` 的那一版順手抓到 README 的目錄樹列著
 * `tools/sast/`，而**那個目錄從來不在 v1 的樹上** —— 一個假的項目在最會被
 * 讀的地方待了不知道多久，而全套閘門照樣全綠。`doc-facts` 守的是數字，
 * 不是清單，兩者中間有一條縫。這道閘門補的就是那條縫。
 *
 * ── 兩個方向都要驗 ──────────────────────────────────────────────────
 *
 *   ① 樹上有、`SCOPE.md` 沒列 —— **範疇裡悄悄多了東西**，而判準要求
 *      每一項都寫得出「受益者是拉 v1 的團隊」。沒寫就是沒判斷過。
 *   ② `SCOPE.md` 列了、樹上沒有 —— **清單在說謊**，就是 `tools/sast` 那個病。
 *
 * 只驗①的話，這份文件會慢慢長出一堆早就不存在的東西，而讀它的人以為
 * 那些都在。只驗②的話，加一支工具就再也沒有人會被逼著寫那句受益者。
 */

/** `SCOPE.md` 管的那幾層。`apps/` 與 `features/` 是示範切片，文件自己說了不管。 */
export const GOVERNED = ["tools", "platform"] as const;

export function checkScope(root: string, source?: string): Finding[] {
  const text = source ?? readFileSync(join(root, "SCOPE.md"), "utf8");

  return collect((fail) => {
    for (const parent of GOVERNED) {
      const section = sectionFor(text, parent);

      if (section === undefined) {
        fail(
          "SCOPE.md",
          "那一節不見了",
          `找不到 \`${parent}/\` 的〈准許存在的〉那一節`,
          `把標題寫回 "## \\\`${parent}/\\\` —— 准許存在的"。` +
            `這道閘門靠那個標題定位表格 —— 找不到就當成「這一層沒有清單」的話，` +
            `改個標題就能讓整層不再被檢查，而且是綠的。`,
        );
        continue;
      }

      const listed = new Set(section.listed);
      const tracked = new Set(trackedDirectories(root, parent));

      for (const path of tracked) {
        if (listed.has(path)) continue;
        fail(
          "SCOPE.md",
          "樹上有、沒登記",
          `\`${path}\` 在版控裡，但 \`${parent}/\` 那張表沒有它`,
          `在那張表加一列，並寫出「受益者是拉 v1 的團隊」那一句 —— ` +
            `寫不出來的東西就不該進 \`release/v1\`，送 \`main\`（判準見 C72）。` +
            `少了這一列，v1 就是悄悄多了一個團隊沒預期的東西。`,
        );
      }

      for (const path of listed) {
        if (tracked.has(path)) continue;
        fail(
          "SCOPE.md",
          "登記了不存在的",
          `\`${parent}/\` 那張表列著 \`${path}\`，但版控裡沒有它`,
          `拿掉那一列，或把東西加回版控。` +
            `一份列著不存在的項目的清單，比沒有清單更糟 —— ` +
            `README 的目錄樹列了 \`tools/sast/\` 不知道多久，而它從來沒存在過。`,
        );
      }
    }
  });
}
