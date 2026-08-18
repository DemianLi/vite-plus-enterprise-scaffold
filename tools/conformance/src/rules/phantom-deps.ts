import { readFileSync, existsSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative, sep } from "node:path";

import { IMPORT_SPECIFIER_PATTERN } from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";
import { collectSourceFiles, collectCssFiles, readJson } from "../scan.ts";

/**
 * 幽靈依賴：**程式碼 import 了某個套件，而這個 package 的 `package.json` 沒宣告它**。
 *
 * ── 為什麼本機與 CI 都看不出來 ──────────────────────────────────────
 *
 * pnpm 的嚴格 `node_modules` 通常會擋，但有三條繞過路徑：workspace 根目錄的
 * 提升、`vite.config.ts` 的 alias、以及被別的套件間接帶進來的相依。
 * 三條都只在**這台機器的安裝結果**下成立，而檢查讀的是宣告，不是安裝結果。
 *
 * 症狀因此是最難回推的那種：本機綠、CI 綠，**乾淨重建時才爆**。
 * 而「乾淨重建」在這個腳手架有三個發生地點，其中第三個寫在契約裡：
 * 退出演練、單獨發佈、以及**機關端依原始碼重建 —— 那是驗收現場**。
 *
 * ── 掃的範圍：`features`／`platform`／`apps`，且**不含 `tests/`** ──────
 *
 * 兩個排除都是先乾跑量出來的，不是憑感覺畫的：
 *
 *   - **`tools/*` 不掃**：產生器與 codemod 的本職就是**把程式碼當資料拿著**
 *     （`slice-gen` 的模板、`codemods` 的 fixture、`conformance` 自己的反向
 *     測試）。乾跑在 `tools/` 底下噴出 20 幾條，全部是偽陽性。而且它們是
 *     開發期工具，不隨產物交付 —— 掃它們是拿誤報換零收益。
 *   - **`tests/` 不掃**：同一個理由的小號。測試檔會用樣板字串**組出**一段
 *     假的原始碼餵給被測物，那些 `import ... from "pinia"` 是資料不是相依。
 *
 * ⚠️ 代價要說清楚：**測試檔裡的幽靈依賴這條規則看不到。** 那是刻意的取捨，
 * 而它可以接受的理由是失敗方向不同 —— 測試少一個相依會**當場跑不起來**，
 * 不會安靜地混到驗收那天。真正致命的是 `src/` 那一半，而那一半守住了。
 *
 * 一道會誤報的閘門第一天就會被加上例外，然後例外永遠不會拿掉（見 C41）。
 * 寧可範圍窄而準，也不要寬而吵。
 */
const BLOCK_COMMENT = /\/\*[^]*?\*\//g;
const LINE_COMMENT = /^[ \t]*\/\/.*$/gm;

/**
 * 剝掉註解再掃。
 *
 * 不剝的話這條規則會**在定義規則的那份檔案上誤報**：`slice-kit/src/contract.ts`
 * 的 JSDoc 裡有 `import { useQuery } from "@tanstack/vue-query";` 當範例
 * （那正是它在解釋哪些 import 該被擋）。乾跑時它是第一個亮起來的。
 *
 * 與 `importClauseBefore` 是同一個坑的第二次 —— 差別只在這次乾跑先撞到，
 * 而不是等閘門上線之後被人回報。
 */
function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

/**
 * 去 CSS 註解，而且**先認得引號字串**。
 *
 * ⚠️ 天真的 `/\/\*[^]*?\*\//g` 在這個 repo 會踩到一個已知的坑：
 *
 * ```
 * @source "../../../../**\/*.{vue,ts}";
 *                      ↑ 這裡的 /**\/ 是一個合法的 CSS 空註解
 * ```
 *
 * 吃掉它會把後面一整段（含 `@import`）一起刨掉，而**兩邊都不會報錯** ——
 * 檢查看到的內容與瀏覽器看到的不是同一個東西。同一個坑
 * `platform/ui/tests/styles.test.ts` 已經踩過一次，寫在該 package 的 README。
 */
export function stripCssComments(css: string): string {
  let out = "";
  let index = 0;
  let quote: string | null = null;

  while (index < css.length) {
    const ch = css[index] as string;

    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        out += css[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (ch === quote) quote = null;
      index++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      index++;
      continue;
    }

    if (ch === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end === -1 ? css.length : end + 2;
      // 註解換成一個空白，免得把兩個 token 黏在一起。
      out += " ";
      continue;
    }

    out += ch;
    index++;
  }

  return out;
}

/**
 * `@import "x"`、`@import url("x")`、`@import "x" layer(y)` 三種都要抓到。
 *
 * ⚠️ **刻意寫成兩個分支而不是 `(?:url\(\s*)?`。** 那個寫法把 `\s*` 包在
 * 一個 `?` 群組裡 ＝ star height 2，Tier 2 的 `security/detect-unsafe-regex`
 * 當場咬住 —— 而它咬得對。同一個坑 `@org/slice-kit/contract` 的切片命名
 * 規則已經踩過一次，`theme-verify` 的 `palette.ts` 也踩過。
 *
 * 沒有加豁免：一道跑在 CI 上的檢查掛在自己的正則上，是最難解釋的那種故障。
 * 兩個分支各自 star height 1，`url()` 裡的空白照樣吃得到。
 */
export const CSS_IMPORT_PATTERN = /@import\s+url\(\s*["']([^"']+)["']|@import\s+["']([^"']+)["']/g;

/** npm 套件名的單一段（scope 或 name）。刻意單層量詞，理由見契約的 C19 註解。 */
const PACKAGE_NAME_SEGMENT = /^[a-z0-9._-]+$/;

function isPackageName(name: string): boolean {
  if (!name.startsWith("@")) return PACKAGE_NAME_SEGMENT.test(name);
  const slash = name.indexOf("/");
  if (slash === -1) return false;
  return (
    PACKAGE_NAME_SEGMENT.test(name.slice(1, slash)) &&
    PACKAGE_NAME_SEGMENT.test(name.slice(slash + 1))
  );
}

const BUILTIN_MODULES = new Set(builtinModules);

/**
 * import 指定字串 → 要在 `package.json` 裡找的套件名。不是套件的回 `null`。
 *
 * `@org/slice-kit/contract` 要收斂成 `@org/slice-kit`：**子路徑匯入的是同一個
 * 套件**，不收斂的話這條規則會對每一個合法的子路徑匯入亂叫。
 *
 * ⚠️ 含冒號的一律放行（`node:fs`、`virtual:*`、`data:`、`http:`）。
 * 內建模組**兩種寫法都要放行** —— 只擋 `node:` 前綴的話，一個裸寫的
 * `import { join } from "path"` 會被報成幽靈依賴，而那是完全合法的。
 */
function packageOfSpecifier(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.includes(":")) return null;

  const slash = specifier.indexOf("/");
  const name = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : slash === -1
      ? specifier
      : specifier.slice(0, slash);

  if (BUILTIN_MODULES.has(name)) return null;
  if (!isPackageName(name)) return null;
  return name;
}

const TESTS_SEGMENT = `${sep}tests${sep}`;

export function checkPhantomDependencies(
  root: string,
  packageDir: string,
  label: string,
): Finding[] {
  return collect((fail) => {
    const pkgPath = join(packageDir, "package.json");
    if (!existsSync(pkgPath)) return;

    const pkg = readJson(pkgPath);
    const declared = new Set<string>([
      ...Object.keys((pkg["dependencies"] as Record<string, string> | undefined) ?? {}),
      ...Object.keys((pkg["devDependencies"] as Record<string, string> | undefined) ?? {}),
      ...Object.keys((pkg["peerDependencies"] as Record<string, string> | undefined) ?? {}),
    ]);

    // 自我參照（`@org/ui` 內部匯入 `@org/ui/xxx`）不是幽靈依賴。
    const own = pkg["name"];
    if (typeof own === "string") declared.add(own);

    // ⚠️ 這裡**刻意不把 workspace 根目錄的 package.json 併進來**。
    // 根目錄的宣告正是「提升」這條繞過路徑的來源 —— 併進來的話，
    // 這條規則會對它最該抓的那一種情況回報綠燈。
    const reported = new Set<string>();

    for (const file of collectSourceFiles(packageDir)) {
      if (file.includes(TESTS_SEGMENT)) continue;
      const source = stripComments(readFileSync(file, "utf8"));

      for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
        const name = packageOfSpecifier(match[1] ?? "");
        if (name === null || declared.has(name) || reported.has(name)) continue;
        reported.add(name);

        fail(
          label,
          "幽靈依賴",
          `${relative(root, file)} 匯入了 "${name}"，但 ${relative(root, pkgPath)} 沒有宣告它`,
          `把 "${name}" 加進該 package.json 的 dependencies 或 devDependencies。` +
            "現在能跑是靠 workspace 根目錄的提升或間接相依 —— " +
            "那在乾淨重建（退出演練、單獨發佈、機關端依原始碼重建）時不成立",
        );
      }
    }

    // ── CSS 的 `@import` 也是相依，只是它不長得像 import ────────────────
    //
    // 2026-08-17 撞到的：`platform/ui/src/styles/index.css` 寫著
    // `@import "tailwindcss"`，而 `platform/ui` 沒有宣告它 —— 解析成功純粹
    // 因為 `apps/console` 剛好有。換一個消費者就不成立，而症狀是乾淨重建
    // 時才爆，那正是上面那條檢查存在的理由。
    //
    // ⚠️ 乾跑的時候整個 repo **0 違規**（四筆 `@import`，三個 package 全都
    // 已宣告）。接它不是因為現在有東西可抓，是因為**它要抓的那個缺陷已經
    // 真的發生過一次**，而當時沒有任何東西說話（D16 的迭代軸）。
    for (const file of collectCssFiles(packageDir)) {
      if (file.includes(TESTS_SEGMENT)) continue;
      const css = stripCssComments(readFileSync(file, "utf8"));

      for (const match of css.matchAll(CSS_IMPORT_PATTERN)) {
        // 兩個分支各有一個捕獲組，命中的那一個才有值。
        const name = packageOfSpecifier(match[1] ?? match[2] ?? "");
        if (name === null || declared.has(name) || reported.has(name)) continue;
        reported.add(name);

        fail(
          label,
          "幽靈依賴（CSS）",
          `${relative(root, file)} 的 @import 用了 "${name}"，但 ${relative(root, pkgPath)} 沒有宣告它`,
          `把 "${name}" 加進該 package.json。CSS 的 @import 與 JS 的 import 走同一套解析，` +
            "所以失敗方式也一樣：本機綠、CI 綠、乾淨重建時才爆",
        );
      }
    }
  });
}
