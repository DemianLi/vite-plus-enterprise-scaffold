import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { repoRoot } from "../src/root.ts";

/**
 * `repoRoot()` 這一個字面（`src/root.ts:16` 的 `"../../../.."`）**只有兩處在釘**，
 * 而兩處各有一件另一處做不到的事：
 *
 *   - 這裡 —— 直接路徑，而且是這份分工唯一的記載處；
 *   - `tools/pii-check/tests/roster.test.ts:37` —— 唯一穿過 pnpm symlink 的一條
 *     （理由見下面那段，以及那支檔自己的檔頭）。
 *
 * ⚠️ 第三處曾經在 `tests/testing.test.ts`（「re-export 與 ./root.ts 同一個答案」）——
 * 純重複：同一個變異三邊同紅（實測把 `:16` 改成 `"../../.."`，三條都紅），
 * 而「re-export 是同一個函式」由型別系統擋（拿掉 `testing.ts:9` 的 `export
 * { repoRoot }` 是型別錯誤，`vp check` 先紅）。不要再補回去。
 */
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
