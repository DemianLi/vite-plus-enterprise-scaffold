import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { repoRoot } from "../src/root.ts";

describe("repoRoot", () => {
  it("指到真的 repo 根（那裡有 pnpm-workspace.yaml）", () => {
    expect(existsSync(join(repoRoot(), "pnpm-workspace.yaml"))).toBe(true);
  });

  /**
   * 穿過 pnpm symlink 之後仍然算得對，這件事**不在這裡測**。
   *
   * 它要從一個真的宣告了 `@org/gate-kit` 的 package 去 import 才有意義，
   * 而那正是消費端 —— 測試住在 `tools/pii-check/tests/roster.test.ts`。
   * 在這裡做只能用動態 import 帶一個算出來的路徑，那會被
   * `no-unsanitized/method` 擋下，而那條規則是對的。
   */
});
