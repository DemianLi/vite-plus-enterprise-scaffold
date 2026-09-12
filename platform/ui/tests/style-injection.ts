import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 「這個套件會不會在執行期注入 `<style>`」的判定函式（C235，C233 §六）。
 *
 * 讀檔與判定分開，同 `contract.ts` 的切法：只對真的 node_modules 跑的話，
 * 「該紅沒紅」那半邊測不到 —— 一個 `return []` 就能讓整條斷言變綠。
 *
 * ⚠️ 量的是**原始碼形狀**，不是瀏覽器行為。C233 §三 是在瀏覽器裡量的；這裡守的是
 * 那次量測的前提（「全套件 `createElement('style')` 0 支」）在升級之後還成立。
 * 注入的寫法換成別的形狀（例如 `innerHTML` 塞一段 `<style>`），這條看不到 ——
 * 那時要回到瀏覽器量，不是把樣式放寬。
 */
export const STYLE_INJECTION = /createElement\(\s*["'`]style["'`]\s*\)/;

/** 會被瀏覽器執行的檔案。型別宣告與 source map 不算。 */
const RUNTIME_FILE = /\.(?:c|m)?js$/;

/** 目錄底下命中 `STYLE_INJECTION` 的執行期檔案（絕對路徑）與掃過的檔案數。 */
export function injectingFiles(dir: string): {
  readonly hits: readonly string[];
  readonly scanned: number;
} {
  const hits: string[] = [];
  let scanned = 0;
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        // 巢狀的 node_modules 是別的套件，由相依閉包那一步各自走到。
        if (entry.name !== "node_modules") walk(path);
      } else if (RUNTIME_FILE.test(entry.name)) {
        scanned += 1;
        if (STYLE_INJECTION.test(readFileSync(path, "utf8"))) hits.push(path);
      }
    }
  };
  walk(dir);
  return { hits, scanned };
}

/**
 * 從 `from`（某個 `package.json` 的路徑）往上找 `node_modules/<name>` —— Node 的目錄解析規則。
 *
 * ⚠️ 不用 `require.resolve`：它走套件的 `exports`，而 `@babel/runtime`（Base UI 的相依）
 * 沒有 `.` 那一格，解析直接丟例外（實測）。這裡要的是套件根目錄，不是它的入口。
 */
function packageRoot(name: string, from: string): string {
  let dir = dirname(from);
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    // ⚠️ 取真實路徑：pnpm 的 `node_modules/<name>` 是 symlink，從 symlink 的路徑往上走
    // 到不了 `.pnpm/<套件>/node_modules`，那才是它的相依住的地方（實測第二趟紅在這裡）。
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`從 ${from} 往上找不到 node_modules/${name}`);
    dir = parent;
  }
}

/**
 * `name` 的執行期相依閉包：套件名 → 根目錄。
 *
 * 走閉包而不是只掃 `@base-ui/react` 自己：C233 量到的注入點在 Radix 那一側是
 * **傳遞相依**（`react-style-singleton`，經 `react-remove-scroll-bar`），
 * Base UI 的捲動鎖定也住在另一支套件（`@base-ui/utils`）。只掃入口套件的話，
 * 哪天它把工作外包給一支會注入的相依，這條照樣綠。
 *
 * `skip` 是 peer（`react`、`react-dom`）—— 它們不是 Base UI 帶進來的。
 */
export function dependencyClosure(
  name: string,
  from: string,
  skip: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const visit = (current: string, requester: string): void => {
    if (skip.has(current) || found.has(current)) return;
    const root = packageRoot(current, requester);
    found.set(current, root);
    const manifest = join(root, "package.json");
    const { dependencies = {} } = JSON.parse(readFileSync(manifest, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    for (const dependency of Object.keys(dependencies)) visit(dependency, manifest);
  };
  visit(name, from);
  return found;
}
