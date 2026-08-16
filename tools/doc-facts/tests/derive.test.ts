import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  TRANSIENT_PREFIX,
  actionCounts,
  codeownersEntryCount,
  workspacePackageCount,
} from "../src/derive.ts";

/**
 * 從檔案系統推導那幾個事實的反向測試。
 *
 * ── 為什麼是臨時目錄，不是這個 repo ──────────────────────────────────
 *
 * 這幾支原本住在 `cli.ts` 裡，而 `cli.ts` 一被 import 就 `process.exit`，
 * 所以它們一條測試都沒有 —— 唯一能碰到它們的是「跑整支 CLI 掃整個 repo」，
 * 而那只答得出「現在是綠的」，答不出「它在什麼情況下會數錯」。
 *
 * 更直接的理由是本檔在測的那件事本身：**測試動到 repo，會害別的測試變紅。**
 * 用一棵臨時目錄樹來測「數目錄」這件事，才不會自己就是下一個競態。
 */

const SANDBOXES: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "doc-facts-derive-"));
  SANDBOXES.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of SANDBOXES.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 建一棵最小的 workspace：`packages` 樣式 ＋ 幾個帶 package.json 的目錄。 */
function workspace(members: readonly string[], globs = ["features", "platform"]): string {
  const root = sandbox();
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    `packages:\n${globs.map((glob) => `  - ${glob}/*\n`).join("")}`,
  );
  for (const glob of globs) mkdirSync(join(root, glob), { recursive: true });
  for (const member of members) {
    mkdirSync(join(root, member), { recursive: true });
    writeFileSync(join(root, member, "package.json"), '{"name":"x"}');
  }
  return root;
}

describe("workspacePackageCount", () => {
  it("數的是樣式底下有 package.json 的目錄", () => {
    const root = workspace(["features/order", "features/shipment", "platform/ui"]);
    expect(workspacePackageCount(root)).toBe(3);
  });

  it("沒有 package.json 的目錄不算 —— tools/sast 就是這種", () => {
    const root = workspace(["features/order"]);
    mkdirSync(join(root, "platform/not-a-package"), { recursive: true });
    expect(workspacePackageCount(root)).toBe(1);
  });

  it("樣式從 pnpm-workspace.yaml 讀，加一層要跟著動", () => {
    // 寫死目錄清單的話，新增一個頂層層級會**安靜地少算一整層**。
    const root = workspace(["features/order", "tools/doc-facts"], ["features", "tools"]);
    expect(workspacePackageCount(root)).toBe(2);
  });

  it(`★ ${TRANSIENT_PREFIX} 開頭的目錄不算 —— 那是測試期間才存在的`, () => {
    // 這條擋的是一個**實測過、而且會隨機發生**的競態：
    // slice-gen 的端對端測試會在 features/ 底下真的產生一個 zz- 切片，
    // 而 vp run -r test 是平行跑的 —— 那幾百毫秒裡 doc-facts 的端對端測試
    // 會看到多一個套件，於是閘門紅，而紅的原因是我們自己的另一支測試。
    //
    // #31 加這個事實之後，兩個 PR 的 CI 都碰巧綠燈通過，本機才踩到。
    const root = workspace(["features/order", `features/${TRANSIENT_PREFIX}slice-gen-e2e`]);
    expect(workspacePackageCount(root)).toBe(1);
  });

  it("★ 排除的只有那個前綴，不是所有看起來像測試的名字", () => {
    // 前綴寫寬一點（例如連 `test-`、`tmp-` 都排除）就會有人哪天用那個名字
    // 開一個真的 package，然後這個數字安靜地少一。
    const root = workspace(["features/test-orders", "features/tmp-billing"]);
    expect(workspacePackageCount(root)).toBe(2);
  });
});

describe("actionCounts", () => {
  function workflows(files: Readonly<Record<string, string>>): string {
    const root = sandbox();
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(root, ".github/workflows", name), source);
    }
    return root;
  }

  it("引用處數與不重複 action 數是兩個不同的數字", () => {
    // 這個區別是登記這兩個事實時才逼出來的：文件裡「N 個 action」在兩處
    // 分別指這兩件事，而兩個事實共用一個講法就沒有樣式分得開它們（C59）。
    const root = workflows({
      "a.yml": "      - uses: actions/checkout@abc\n      - uses: actions/setup-node@def\n",
      "b.yml": "      - uses: actions/checkout@abc\n",
    });
    expect(actionCounts(root)).toEqual({ refs: 3, distinct: 2 });
  });

  it("不是 workflow 的檔案不算", () => {
    const root = workflows({
      "a.yml": "      - uses: actions/checkout@abc\n",
      "README.md": "      - uses: actions/should-not-count@abc\n",
    });
    expect(actionCounts(root)).toEqual({ refs: 1, distinct: 1 });
  });
});

describe("codeownersEntryCount", () => {
  it("註解與空行不算條目", () => {
    const root = sandbox();
    writeFileSync(
      join(root, "CODEOWNERS"),
      ["# 這是註解", "", "* @org/platform", "  # 縮排的註解也是註解", "/features/ @org/team"].join(
        "\n",
      ),
    );
    expect(codeownersEntryCount(root)).toBe(2);
  });
});
