import { describe, it, expect } from "vitest";
import { posix } from "node:path";
import { IMPORT_SPECIFIER_PATTERN, SOURCE_EXTENSIONS } from "@org/slice-kit/contract";

import { buildSliceFiles } from "../src/files.ts";
import { flattenPaths } from "../src/contract-shape.ts";

/**
 * 把產生器綁到 D4 第 3 層（相對路徑逃逸切片根目錄）。
 *
 * ── 為什麼需要這支測試 ──────────────────────────────────────────────
 *
 * `contract-alignment.test.ts` 驗的是產出的**檔案清單**與 **package.json**。
 * 它完全沒有檢查產出的**原始碼**。
 *
 * 但產生器會產出 `src/views/<Pascal>List.vue`，裡面寫著 `from "../api.ts"` ——
 * 正是「從巢狀目錄往上跳」的形狀，也正是第 3 層在解析的東西。
 * 今天它是安全的（`src/views/` → `src/` 仍在切片內），但沒有任何斷言釘住這件事：
 * 將來有人在產生器加一層 `src/views/detail/`，就會安靜地產出過不了 Tier 2 的切片，
 * 而現有測試全綠。
 *
 * 這支測試用**與 tools/conformance 完全相同**的樣式與解析邏輯
 * （兩者都從 `@org/slice-kit/contract` 取得 `IMPORT_SPECIFIER_PATTERN`），
 * 把產生器與檢查器焊在一起。
 */

const files = buildSliceFiles({
  name: "order-history",
  title: "訂單紀錄",
  team: "@org/team-fulfillment",
});

/** 用點號路徑取出巢狀檔案內容。 */
function read(path: string): string {
  let node: unknown = files;
  for (const part of path.split("/")) {
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") throw new Error(`${path} 不是檔案`);
  return node;
}

const SLICE_ROOT = "/features/order-history";

const sourcePaths = flattenPaths(files).filter((path) =>
  SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext)),
);

describe("產生器的輸出不會被 D4 第 3 層擋下", () => {
  it("確實有掃到原始碼檔案（避免測試本身空轉而假性通過）", () => {
    expect(sourcePaths.length).toBeGreaterThan(0);
  });

  it("產生器有產出巢狀目錄下的檔案（這才是會逃逸的形狀）", () => {
    expect(sourcePaths.some((path) => path.split("/").length >= 3)).toBe(true);
  });

  it.each(sourcePaths)("%s 的所有相對 import 解析後仍在切片根目錄內", (path) => {
    const source = read(path);
    const fileDir = posix.dirname(posix.join(SLICE_ROOT, path));

    const escaped: string[] = [];
    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined || !specifier.startsWith(".")) continue;

      const resolved = posix.resolve(fileDir, specifier);
      if (resolved !== SLICE_ROOT && !resolved.startsWith(`${SLICE_ROOT}/`)) {
        escaped.push(`${specifier} → ${resolved}`);
      }
    }

    expect(escaped, `這些 import 逃出了切片根目錄：${escaped.join(", ")}`).toEqual([]);
  });
});

describe("產生器的輸出不會被 D4 第 2 層擋下", () => {
  it.each(sourcePaths)("%s 不 import 任何其他切片或 HTTP 客戶端", (path) => {
    const source = read(path);
    const forbidden: string[] = [];

    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined) continue;

      // 自己的切片名不算跨切片；產生器不會產出這種 import，但保守起見排除。
      if (specifier.startsWith("@org/feature-") && specifier !== "@org/feature-order-history") {
        forbidden.push(specifier);
      }
      if (["axios", "ky", "got", "superagent", "node-fetch"].includes(specifier)) {
        forbidden.push(specifier);
      }
    }

    expect(
      forbidden,
      `這些 import 會被 no-restricted-imports 擋下：${forbidden.join(", ")}`,
    ).toEqual([]);
  });
});
