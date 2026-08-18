import { existsSync } from "node:fs";
import { join } from "node:path";

import { REQUIRED_FILES, isValidSliceDir, slicePackageName } from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";
import { hasTestFile } from "../scan.ts";

/** 目錄名本身。切片的名字會變成套件名、CODEOWNERS 路徑與 `--filter` 的參數。 */
export function checkSliceNaming(dir: string, slice: string): Finding[] {
  return collect((fail) => {
    if (!isValidSliceDir(dir)) {
      fail(
        slice,
        "命名",
        `目錄名 "${dir}" 不是 kebab-case`,
        "改成小寫加連字號，例如 order-history",
      );
    }
  });
}

/** 契約列出來的那幾個檔案。缺一個就表示這片不是從產生器出來的，或被改壞了。 */
export function checkRequiredFiles(slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    for (const file of REQUIRED_FILES) {
      if (!existsSync(join(slicePath, file))) {
        fail(
          slice,
          "必要檔案",
          `缺少 ${file}`,
          `建立 ${slice}/${file}，或用 vp create @org:slice 重新產生`,
        );
      }
    }
  });
}

/** 套件名必須由目錄名推導得出，否則 `--filter` 與 CODEOWNERS 會對不上。 */
export function checkPackageName(
  pkg: Record<string, unknown>,
  dir: string,
  slice: string,
): Finding[] {
  return collect((fail) => {
    const expectedName = slicePackageName(dir);
    if (pkg["name"] !== expectedName) {
      fail(
        slice,
        "套件命名",
        `package.json 的 name 是 "${String(pkg["name"])}"，應為 "${expectedName}"`,
        `把 name 改成 "${expectedName}"，否則 --filter 與 CODEOWNERS 對不上`,
      );
    }
  });
}

/** 有沒有測試。 */
export function checkSliceTests(slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    if (!hasTestFile(slicePath)) {
      fail(
        slice,
        "測試",
        "找不到任何 tests/**/*.test.ts",
        "沒有測試的切片＝沒有人能安全重構的切片。至少為主要流程補一支測試",
      );
    }
  });
}
