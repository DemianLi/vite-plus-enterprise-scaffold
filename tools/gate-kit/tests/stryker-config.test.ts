import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { repoRoot } from "../src/testing.ts";
import { REAL_TREE_OBSERVERS } from "../../../vitest.stryker.config.ts";

/**
 * 絆線：`stryker.config.mjs` 那趟乾跑能不能跑，靠的是兩格設定＋一份排除名單，而三樣
 * 東西的壞法都是安靜的（#307）——
 *
 *   - 名單裡的路徑改名、搬家、刪掉：vitest 的 `exclude` 對不存在的路徑**不報錯**，
 *     那支測試就靜靜回到乾跑裡，下一次跑 stryker 才紅，而那可能是幾週後、別人跑的。
 *   - `disableTypeChecks` 被改回預設：`vue-typecheck` 的 fixture 被插 `@ts-nocheck`，
 *     同樣只在乾跑紅。
 *   - `vitest.configFile` 指到不存在的檔：runner 退回根層 `vite.config.ts`，名單整份失效。
 *
 * 乾跑本身 1 分 25 秒、而且**就地改寫產品碼**，進不了 `vpr ready`（C154 §三 兩軸：
 * 對象在外 —— Stryker 不是這棵樹的閘門；壞法安靜 —— 上面三條）。這裡守的是
 * 「設定指得到它說的東西」，**不是**「名單完整」：一支新測試讀真樹而沒列進名單，
 * 只有乾跑抓得到。
 */

function missingPaths(list: readonly string[], root: string): string[] {
  return list.filter((path) => !existsSync(join(root, path)));
}

// `.mjs` 沒有型別宣告（TS7016），而 `import(變數)` 撞 Tier 2 的 `no-unsanitized/method`；
// Node 22+ 的 `require` 吃得下 ESM，字面路徑兩邊都放行。
const config = (
  createRequire(import.meta.url)("../../../stryker.config.mjs") as {
    default: Record<string, unknown>;
  }
).default;

describe("對照組：檢查本身有反應", () => {
  it("名單裡有一條不存在的路徑 → 被點名", () => {
    expect(missingPaths(["package.json", "tools/nope/tests/x.test.ts"], repoRoot())).toEqual([
      "tools/nope/tests/x.test.ts",
    ]);
  });
});

describe("stryker 乾跑的三格設定指得到它們說的東西", () => {
  it("★ 排除名單裡的每一支都在樹上", () => {
    expect(missingPaths(REAL_TREE_OBSERVERS, repoRoot())).toEqual([]);
  });

  it("名單裡的每一條都是 vitest 會收的 `.test.ts` —— 排除別的東西沒有意義", () => {
    for (const path of REAL_TREE_OBSERVERS) {
      expect(path, path).toMatch(/\/tests\/.+\.test\.ts$/);
    }
  });

  it("★ `vitest.configFile` 指到那份名單所在的檔", () => {
    expect(config.vitest).toEqual({ configFile: "vitest.stryker.config.ts" });
    expect(existsSync(join(repoRoot(), "vitest.stryker.config.ts"))).toBe(true);
  });

  it("★ `disableTypeChecks` 關著 —— 開著它，`vue-typecheck` 的 fixture 會被插 `@ts-nocheck`", () => {
    expect(config.disableTypeChecks).toBe(false);
  });
});
