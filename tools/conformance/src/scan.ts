import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { SOURCE_EXTENSIONS } from "@org/slice-kit/contract";

/**
 * 走檔案系統的共用零件。**沒有副作用，import 它不會做任何事。**
 *
 * ── 為什麼從 `cli.ts` 搬出來 ────────────────────────────────────────
 *
 * `cli.ts` 最後一行是 `process.exit(...)`，而 `ROOT` 是模組頂層的 const ——
 * 它一被 import 就解析 `process.argv`、掃完整個 repo、然後結束行程。
 * 住在裡面的每一條判定因此**沒有任何辦法被單獨測到**：能驗它們的只有
 * 「起一個行程比對 stdout」，而那種測試答得出「現在是綠的」，
 * 答不出「這條規則在什麼情況下會判錯」。
 *
 * 這個坑這個 repo 已經寫下來一次（`tools/doc-facts/src/derive.ts` 的檔頭），
 * 那一支繞過去了，而**最大的那一支沒有** ——
 * 它守的是 v1 承諾裡最根本的那條（切片邊界）。
 *
 * 規矩因此只有一條：`src/` 底下除了 `cli.ts` 以外，**任何檔案都不得讀
 * `process.argv`、不得呼叫 `process.exit`、不得有模組頂層的掃描**。
 * 根目錄一律以參數傳進來。
 */
export function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export function hasTestFile(dir: string): boolean {
  const testsDir = join(dir, "tests");
  if (!existsSync(testsDir)) return false;
  const walk = (current: string): boolean => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        if (walk(full)) return true;
      } else if (entry.endsWith(".test.ts")) {
        return true;
      }
    }
    return false;
  };
  return walk(testsDir);
}

// 副檔名與 import 樣式來自契約，與 tools/slice-gen 的測試共用同一份定義 ——
// 各持一份副本的話，產生器改了目錄結構就會安靜地產出過不了這裡的切片。

export function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, found);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

export function collectCssFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectCssFiles(full, found);
    } else if (entry.endsWith(".css")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * CODEOWNERS 的內容。三個候選位置都找不到就回空字串 ——
 * 那會讓每一片都缺條目，而那正是「沒有人負責」的正確判定。
 */
export function loadCodeowners(root: string): string {
  for (const candidate of ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]) {
    const path = join(root, candidate);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return "";
}
