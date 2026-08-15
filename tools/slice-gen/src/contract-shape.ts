import {
  REQUIRED_FILES,
  BANNED_DIRECT_DEPENDENCIES,
  isValidSliceDir,
  slicePackageName,
} from "@org/slice-kit/contract";

/**
 * 產生器與一致性檢查之間的接合處。
 *
 * D9 的核心要求：**產生器產出的東西 ＝ 一致性檢查會驗的東西**。
 * 兩份手動同步的定義，半年內必定漂移；因此兩邊都從
 * `@org/slice-kit/contract` 讀同一份宣告。
 *
 * 這個檔案存在的意義是把那份宣告轉成產生器需要的形狀，並在建置期
 * 自我檢查有沒有漏產 —— 契約新增必要檔案時，`assertCoversContract`
 * 會讓產生器**自己的測試**失敗，而不是等到有人產出一個不合規的切片。
 */

export { isValidSliceDir, slicePackageName, BANNED_DIRECT_DEPENDENCIES };

/** kebab-case → PascalCase，例如 order-history → OrderHistory */
export function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** kebab-case → camelCase，例如 order-history → orderHistory */
export function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * 驗證產生器的輸出涵蓋契約要求的每一個必要檔案。
 *
 * 契約若新增一項而產生器沒跟上，這裡會**在產生器自己的測試**就爆，
 * 而不是等到某個團隊產出一個過不了 CI 的切片才發現。
 */
export function assertCoversContract(producedPaths: readonly string[]): void {
  const produced = new Set(producedPaths);
  const missing = REQUIRED_FILES.filter((file) => !produced.has(file));

  if (missing.length > 0) {
    throw new Error(
      `[slice-gen] 產生器未涵蓋契約要求的必要檔案：${missing.join(", ")}。\n` +
        `契約定義在 @org/slice-kit/contract 的 REQUIRED_FILES。` +
        `新增契約項目時，產生器必須同步產出對應檔案。`,
    );
  }
}

/**
 * 把 bingo 的巢狀檔案結構攤平成 `a/b/c.ts` 形式的路徑清單，
 * 以便與契約的 REQUIRED_FILES 比對。
 */
export type FileTree = { [key: string]: string | FileTree };

export function flattenPaths(tree: FileTree, prefix = ""): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}/${key}`;
    if (typeof value === "string") {
      paths.push(path);
    } else {
      paths.push(...flattenPaths(value, path));
    }
  }
  return paths;
}
