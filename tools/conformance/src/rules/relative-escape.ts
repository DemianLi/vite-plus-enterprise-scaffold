import { readFileSync } from "node:fs";
import { resolve, relative, dirname, sep } from "node:path";

import { IMPORT_SPECIFIER_PATTERN } from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";
import { collectSourceFiles } from "../scan.ts";

/**
 * D4 邊界防護第 3 層：擋相對路徑逃逸 package 根目錄。
 *
 * 為什麼在這裡而不是用 lint 規則：oxlint 的 `import/no-relative-parent-imports`
 * 擋掉的是**所有** `../`，包含 `src/views/X.vue` 匯入同一個 package 內的
 * `../api.ts` —— 那完全合法。開著它等於強迫切片變成扁平目錄，
 * DX 代價高到大家會把它關掉，反而製造真正的破口。
 *
 * 需要判斷的是「解析後是否仍在 package 根目錄內」，那要路徑解析而非語法比對。
 * 這裡做精確版本：零偽陽性，代價是失去編輯器即時回饋（Tier 2 才會亮）。
 */
export function checkRelativeEscapes(root: string, slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    const boundary = slicePath + sep;

    for (const file of collectSourceFiles(slicePath)) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
        const specifier = match[1];
        if (specifier === undefined || !specifier.startsWith(".")) continue;

        const resolved = resolve(dirname(file), specifier);
        if (resolved === slicePath || resolved.startsWith(boundary)) continue;

        fail(
          slice,
          "相對路徑逃逸",
          `${relative(slicePath, file)} 匯入了 "${specifier}"，解析後落在切片外` +
            `（${relative(root, resolved)}）`,
          "相對路徑不得離開切片根目錄（D4 第 3 層）。跨切片請走 apps/ 層組裝，" +
            "共用邏輯請抽到 platform/ 並以套件名 import",
        );
      }
    }
  });
}
