import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

export interface WalkOptions {
  /**
   * 不進去的**目錄名**（比對整個名字，不是前綴）。
   *
   * ⚠️ 這是一個參數而不是一份預設值，是刻意的。本 repo 現存八份跳過清單互相
   * 矛盾，其中 `conformance` 最短（只有 `node_modules`／`dist`）。給它一份聯集
   * 清單會讓它**不再讀今天讀得到的檔案** —— 一道閘門悄悄變弱，比誤報難發現
   * 得多。收攏成一個型別、把分歧擺在同一個地方看得見；調和是下一步的事，
   * 要帶自己的反向測試。
   */
  readonly skip: readonly string[];
  /** 額外跳過所有以 `.` 開頭的目錄。八份清單裡只有兩份用這條規則。 */
  readonly skipDotDirs?: boolean;
  /** 只收這些後綴（`endsWith` 比對）。空陣列＝不過濾。 */
  readonly extensions: readonly string[];
}

/**
 * 走目錄，回傳**相對於 `root`** 的檔案路徑。
 *
 * 不讀檔 —— 呼叫端自己決定要不要讀、什麼時候讀。`pii-check` 是把讀取函式往下
 * 傳給判定層的，`walk()` 若代讀就會奪走那個選擇。
 *
 * 走訪順序刻意與被取代的六份實作一致：照 `readdirSync` 的順序，遇到目錄就當場
 * 遞迴下去（深度優先、與檔案交錯），**不排序**。排序會讓輸出更穩定，但那是行為
 * 改變 —— 這一版只收攏，不調和。
 */
export function walk(root: string, options: WalkOptions): string[] {
  const found: string[] = [];
  collect(root, root, options, found);
  return found;
}

function collect(dir: string, root: string, options: WalkOptions, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (options.skip.includes(entry.name)) continue;
      if (options.skipDotDirs === true && entry.name.startsWith(".")) continue;
      collect(full, root, options, found);
    } else if (
      options.extensions.length === 0 ||
      options.extensions.some((extension) => entry.name.endsWith(extension))
    ) {
      found.push(relative(root, full));
    }
  }
}
