import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 從檔案系統推導出來的那幾個事實。
 *
 * ── 為什麼從 `cli.ts` 搬出來 ────────────────────────────────────────
 *
 * `cli.ts` 最後一行是 `process.exit(main())` —— 它一被 import 就跑完並結束
 * 行程，所以住在裡面的函式**沒有任何辦法被單獨測到**。它們原本因此一條
 * 測試都沒有：能驗它們的只有「跑整支 CLI 掃整個 repo」，而那種端對端測試
 * 只答得出「現在是綠的」，答不出「它在什麼情況下會數錯」。
 *
 * 搬出來之後每一支都收一個 `root`，測試可以指到一棵臨時的目錄樹 ——
 * **不動到 repo**。這件事在這裡特別重要：本檔第一條註解講的就是一個
 * 「測試動到 repo，害另一支測試變紅」的競態。
 */

/**
 * 測試期間才存在的目錄的保留前綴。
 *
 * ⚠️ 這不是潔癖，是一個**實測過的競態**：`tools/slice-gen/tests/e2e.test.ts`
 * 會在 `features/` 底下**真的**產生一個切片（它必須是真的檔案，因為
 * `tools/conformance` 讀的是真的檔案），跑完再刪掉。而 `vp run -r test`
 * 是平行跑的 —— 那幾百毫秒裡，`tools/doc-facts` 的端對端測試會 spawn 真正的
 * CLI 去掃真正的 repo，於是 workspace 套件數是 26 而文件寫著 25，閘門紅。
 *
 * 這種紅燈最糟的地方在於它**不是每次都紅**：#31 加這個事實之後，兩個 PR 的
 * CI 都碰巧綠燈通過，本機才踩到。一道會隨機亮紅燈的閘門，最後一定是被拿掉
 * 或被加旗標繞過（C57）—— 而被拿掉的會是那個真的在守數字的東西。
 *
 * 前綴本身不是這裡發明的：slice-gen 的那支測試在自己的檔頭就寫著
 *「目錄名刻意取 `zz-` 開頭：在 `features/` 裡排最後，而且一眼看得出不是真的切片」。
 * 這裡只是讓數數的那一側也認得同一個約定。
 *
 * ⚠️ 殘留物**不歸這裡管**：slice-gen 自己有一條測試斷言
 *「清理後 features/ 只剩真正的切片」。真的殘留時該紅的是那一條，
 * 不是文件數字 —— 讓一道閘門去報另一道閘門的問題，只會讓兩邊的訊息都變模糊。
 */
export const TRANSIENT_PREFIX = "zz-";

/**
 * workspace 樣式底下的 package 數。
 *
 * 樣式從 `pnpm-workspace.yaml` 讀，不寫死目錄清單 —— 加一個新的頂層層級時，
 * 這個數字要跟著動，而不是安靜地少算一整層。
 */
export function workspacePackageCount(root: string): number {
  const manifest = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const globs = [...manifest.matchAll(/^\s*-\s*([\w./-]+)\/\*\s*$/gm)].map((match) => match[1]);

  let total = 0;
  for (const glob of globs) {
    if (glob === undefined) continue;
    const dir = join(root, glob);
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(TRANSIENT_PREFIX)) continue;
      const candidate = join(dir, entry);
      if (!statSync(candidate).isDirectory()) continue;
      try {
        statSync(join(candidate, "package.json"));
        total += 1;
      } catch {
        // 沒有 package.json 的目錄不是 workspace 成員。
      }
    }
  }
  return total;
}

const USES = /^\s*-?\s*uses:\s*(\S+)/gm;

/** workflow 裡的 action 引用。回傳「引用處數」與「不重複 action 數」兩個。 */
export function actionCounts(root: string): { refs: number; distinct: number } {
  const dir = join(root, ".github/workflows");
  const names = new Set<string>();
  let refs = 0;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
    const source = readFileSync(join(dir, file), "utf8");
    for (const match of source.matchAll(USES)) {
      const reference = match[1];
      if (reference === undefined) continue;
      refs += 1;
      names.add(reference.split("@")[0] ?? reference);
    }
  }
  return { refs, distinct: names.size };
}

/**
 * CODEOWNERS 的條目數 —— 非註解、非空白的行。
 *
 * ⚠️ 這**不是**文件原本寫的那個 22。那個數字是 `gh api …/codeowners/errors`
 * 回報的無效條目數，是 GitHub 的判定，不是 repo 裡數得出來的東西
 *（實測 C40 量到 22 的那個 commit，本地是 14 條條目、21 個 owner 引用）。
 * 可推導的只有條目數，所以守的是它，理由寫在 facts.ts 的 codeowners-entries。
 */
export function codeownersEntryCount(root: string): number {
  return readFileSync(join(root, "CODEOWNERS"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith("#")).length;
}
