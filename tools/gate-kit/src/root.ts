import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * repo 根目錄。
 *
 * ⚠️ 這裡數的 `..` 是**這個檔案**在 repo 裡的位置（`tools/gate-kit/src/root.ts`），
 * 不是呼叫端的。搬動這個檔案就要改這一行。
 *
 * ⚠️ 它能成立的前提是 Node 解析 `node_modules/@org/gate-kit` 這個 symlink 時
 * 給的是**真實路徑**而不是連結路徑 —— pnpm 的 workspace 全靠 symlink，
 * 若給的是連結路徑，`import.meta.url` 會落在 `node_modules` 底下而算錯。
 * 已實測（見 tests/root.test.ts），不是推論。
 */
export function repoRoot(): string {
  return resolve(fileURLToPath(import.meta.url), "../../../..");
}
