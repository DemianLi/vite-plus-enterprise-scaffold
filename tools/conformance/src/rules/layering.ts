import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";

import {
  IMPORT_SPECIFIER_PATTERN,
  COMPOSABLES_DIR,
  VIEWS_DIR,
  VIEW_FORBIDDEN_IMPORTS,
  VIEW_FORBIDDEN_LOCAL_MODULES,
  isValidComposableFile,
  composableFunctionName,
  STORE_FILE,
  STORE_FORBIDDEN_IMPORTS,
  STORE_FORBIDDEN_LOCAL_MODULES,
  isTypeOnlyImportAt,
} from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";
import { collectSourceFiles } from "../scan.ts";

/**
 * D14：切片**內部**的分層 —— 元件只呈現，有狀態的邏輯住在 composable 裡。
 *
 * 這個 repo 原本把「切片之間」守得極嚴，對「切片之內」什麼都沒說：
 * `REQUIRED_FILES` 驗完四個檔案就結束，api / store / routes / views 那套結構
 * 只存在於產生器的模板裡。誰手寫一個切片、或改了產生器，慣例就消失而閘門全綠。
 *
 * 兩條規則，一條是命名、一條才是真正有牙齒的：
 *
 *   1. `src/composables/` 底下的檔案必須叫 `useXxx.ts` 且匯出同名函式
 *   2. **`src/views/` 底下不得直接 import 資料層** —— 禁的是位置，不是相依
 *
 * 第 2 條為什麼是「禁 import」而不是「禁元件裡出現 useQuery」：
 * 前者是可精確判定的靜態事實，後者要語意分析。同一個取捨見 D4 第 3 層。
 */
export function checkSliceLayering(slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    const composablesDir = join(slicePath, COMPOSABLES_DIR);

    if (existsSync(composablesDir)) {
      for (const entry of readdirSync(composablesDir)) {
        if (statSync(join(composablesDir, entry)).isDirectory()) continue;

        if (!isValidComposableFile(entry)) {
          fail(
            slice,
            "composable 命名",
            `${COMPOSABLES_DIR}/${entry} 不符合 useXxx.ts`,
            "Vue 官方慣例：composable 以 use 開頭、駝峰命名。" +
              "命名一致，編輯器與 code review 才看得出哪些函式必須在 setup 期間同步呼叫",
          );
          continue;
        }

        // 檔名叫 useOrderList.ts 卻匯出別的名字，等於這條慣例只做了一半 ——
        // import 端看到的仍是任意名稱，而那才是讀程式碼的人實際會看到的東西。
        const expected = composableFunctionName(entry);
        const source = readFileSync(join(composablesDir, entry), "utf8");
        if (
          !source.includes(`export function ${expected}`) &&
          !source.includes(`export const ${expected}`)
        ) {
          fail(
            slice,
            "composable 命名",
            `${COMPOSABLES_DIR}/${entry} 沒有匯出同名的 ${expected}`,
            `讓檔名與匯出的函式名一致（export function ${expected}）`,
          );
        }
      }
    }

    // ── Pinia 只放「客戶端才是權威」的東西 ────────────────────────────────
    //
    // 判準：這份資料如果和伺服器不一致，誰是錯的？
    // 客戶端是權威（篩選條件、選取的 id）→ Pinia；伺服器是權威 → TanStack Query。
    // 「選取的那幾筆 Order 物件」兩者都不是，它是 join 出來的，存下來就是第二份快取。
    //
    // 禁 value import、放行 `import type` —— 見契約中 STORE_FORBIDDEN_IMPORTS 的說明。
    const storePath = join(slicePath, STORE_FILE);
    if (existsSync(storePath)) {
      const source = readFileSync(storePath, "utf8");

      for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
        const specifier = match[1];
        if (specifier === undefined || match.index === undefined) continue;
        // 借型別不算耦合：`import type` 在 verbatimModuleSyntax 下會被完全抹除。
        if (isTypeOnlyImportAt(source, match.index)) continue;

        const forbidden = STORE_FORBIDDEN_IMPORTS.find((banned) => specifier === banned);
        if (forbidden !== undefined) {
          fail(
            slice,
            "store 存了伺服器狀態",
            `${STORE_FILE} value import 了 "${forbidden}"`,
            "Pinia 只放客戶端才是權威的東西（意圖、選取的 id）。伺服器狀態走 " +
              `${COMPOSABLES_DIR}/use<Xxx>.ts（D14）。存進 store 等於做了第二份快取，` +
              "它與 TanStack Query 那份的失效時機不同，而且不會有任何測試變紅",
          );
        }

        if (!specifier.startsWith(".")) continue;
        const resolved = resolve(dirname(storePath), specifier);
        const localModule = relative(join(slicePath, "src"), resolved).replace(
          /\.(ts|tsx|js|mjs)$/,
          "",
        );
        if ((STORE_FORBIDDEN_LOCAL_MODULES as readonly string[]).includes(localModule)) {
          fail(
            slice,
            "store 存了伺服器狀態",
            `${STORE_FILE} value import 了資料存取模組 "${specifier}"`,
            `只借型別的話請寫成 \`import type\`（那完全允許）。真的要取數請放到 ${COMPOSABLES_DIR}/`,
          );
        }
      }
    }

    const viewsDir = join(slicePath, VIEWS_DIR);
    if (!existsSync(viewsDir)) return;

    for (const file of collectSourceFiles(viewsDir)) {
      const source = readFileSync(file, "utf8");
      const where = relative(slicePath, file);

      for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
        const specifier = match[1];
        if (specifier === undefined) continue;

        const forbiddenPackage = VIEW_FORBIDDEN_IMPORTS.find((banned) => specifier === banned);
        if (forbiddenPackage !== undefined) {
          fail(
            slice,
            "元件直接取數",
            `${where} 直接 import "${forbiddenPackage}"`,
            `把取數搬進 ${COMPOSABLES_DIR}/use<Xxx>.ts，元件只留呈現（D14）。` +
              "同一段查詢一旦被第二個元件需要，複製出去的 queryKey 會慢慢漂移，" +
              "而快取失效時機從此對不起來 —— 不會有任何測試變紅",
          );
        }

        // 相對路徑指向本切片的 api 模組（../api.ts、./api.ts、../../src/api.ts…）。
        if (!specifier.startsWith(".")) continue;
        const resolved = resolve(dirname(file), specifier);
        const localModule = relative(join(slicePath, "src"), resolved).replace(
          /\.(ts|tsx|js|mjs)$/,
          "",
        );
        if ((VIEW_FORBIDDEN_LOCAL_MODULES as readonly string[]).includes(localModule)) {
          fail(
            slice,
            "元件直接取數",
            `${where} 直接 import 了資料存取模組 "${specifier}"`,
            `資料層只准被 ${COMPOSABLES_DIR}/ 使用。元件從 composable 拿已經整理好的 ref（D14）`,
          );
        }
      }
    }
  });
}
