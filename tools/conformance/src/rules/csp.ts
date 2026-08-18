import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { IMPORT_SPECIFIER_PATTERN, CSP_INCOMPATIBLE_MODULES } from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";
import { collectSourceFiles } from "../scan.ts";

/**
 * 抽出一段 import 敘述的**匯入子句**（`import` 與 `from` 之間那一段）。
 *
 * 第一版掃的是整份檔案有沒有出現那個識別字，結果**在定義這條規則的檔案上誤報**——
 * `slice-kit/src/contract.ts` 把禁用名稱當資料列著，於是閘門指控契約本身違規。
 *
 * 那不是「加個例外把契約檔跳過」就好：那種修法會讓規則對任何「剛好提到這個名字」
 * 的檔案繼續誤報，而一道會亂叫的閘門會被加上 skip，然後永遠不會拿掉。
 * 正確的修法是只看**真的 import 敘述**。
 */
function importClauseBefore(source: string, specifierIndex: number): string | null {
  const head = source.lastIndexOf("import", specifierIndex);
  if (head === -1) return null;
  const from = source.indexOf("from", head);
  if (from === -1 || from > specifierIndex) return null;
  return source.slice(head + "import".length, from);
}

/** 匯入子句裡有沒有這個具名匯入。用字串比對，不用動態正則（Tier 2 會擋）。 */
function clauseImports(clause: string, name: string): boolean {
  const isWordChar = (char: string | undefined): boolean =>
    char !== undefined && /[A-Za-z0-9_$]/.test(char);

  let at = clause.indexOf(name);
  while (at !== -1) {
    if (!isWordChar(clause[at - 1]) && !isWordChar(clause[at + name.length])) return true;
    at = clause.indexOf(name, at + 1);
  }
  return false;
}

/**
 * D15：全 repo 禁止 CSP 不相容的模組。
 *
 * 目前只有一條：reka-ui 的 Splitter 會在拖曳時注入 <style> 元素，
 * 被 style-src 'self' 擋掉。症狀是「游標沒變」這種沒有人會聯想到 CSP 的小毛病。
 *
 * 這條掃**整個 repo**（含 platform/），不是只掃切片 —— 因為 platform/ui 才是
 * 最可能不小心用到它的地方。
 */
export function checkCspIncompatibleImports(root: string, dir: string, label: string): Finding[] {
  return collect((fail) => {
    for (const file of collectSourceFiles(dir)) {
      const contents = readFileSync(file, "utf8");

      for (const match of contents.matchAll(IMPORT_SPECIFIER_PATTERN)) {
        const specifier = match[1];
        if (specifier === undefined || match.index === undefined) continue;

        const rule = CSP_INCOMPATIBLE_MODULES.find((entry) => entry.specifier === specifier);
        if (rule === undefined) continue;

        const clause = importClauseBefore(contents, match.index);
        if (clause === null) continue;

        for (const name of rule.names) {
          if (!clauseImports(clause, name)) continue;

          fail(
            label,
            "CSP 不相容的元件",
            `${relative(root, file)} 匯入了 ${name}`,
            `${rule.reason}。改用不需要它的版面，或把這條規則的改動當成` +
              "「要不要為了它引入 per-request nonce」那場討論的入口" +
              "（見 slice-kit 契約的 CSP_INCOMPATIBLE_MODULES）",
          );
        }
      }
    }
  });
}
