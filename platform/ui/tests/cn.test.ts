import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cn } from "../src/utils/cn.ts";

/**
 * `cn()` 對**本 repo 自訂代幣**的分族是否正確。
 *
 * ── 這支測試是被一個已經上線的 bug 逼出來的 ──────────────────────────
 *
 * `tailwind-merge` 認得的是 Tailwind **出廠的**類別族。`border-control`
 * 這種名字它只能猜，而 `border-<名字>` 看起來像顏色 —— 於是它把寬度歸進
 * `border-color`，`cn("border-control border-line")` 只留下顏色那一格。
 *
 * 而 Tailwind 的 preflight 是 `border: 0 solid`，少了寬度 utility 就是
 * **邊框寬度 0、完全看不見**。2026-08-19 實測時 `UiButton` 的 `secondary`
 * （**預設**那個 variant）、`UiInput`、`UiCheckbox` 三個的邊框都是 0，
 * 而每一道閘門都是綠的：CSS 產物完全正確，那一格是**執行期被丟掉的**。
 *
 * ── 為什麼從 CSS 推導而不是抄一份清單 ────────────────────────────────
 *
 * `cn.ts` 裡的登記表是手寫的（它要跑在瀏覽器裡，讀不到 CSS）。手寫不是問題，
 * **沒有東西在守它**才是（C71）。這裡從 `styles/index.css` 的 `@theme`
 * 把代幣名推導出來反過來問 —— 加一個代幣卻忘了登記就會紅。
 */

const CSS = readFileSync(join(import.meta.dirname, "../src/styles/index.css"), "utf8");
const THEME_BLOCK = /@theme\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";

/**
 * `@theme` 裡某個命名空間底下宣告的名字。
 *
 * ⚠️ 用 `startsWith` 而不是 `new RegExp(\`--${namespace}-…\`)`：動態正規式會被
 * `security/detect-non-literal-regexp` 擋下，而為它加一條 disable 註解，
 * 下一個真的在拼接使用者輸入的人會照抄（C19、`shape.ts` 的 `macroPositions`
 * 用的是同一條理由）。
 */
const DECLARATION = /^--([a-z0-9-]+)\s*:/;

function tokens(namespace: string): readonly string[] {
  const names: string[] = [];
  for (const line of THEME_BLOCK.split("\n")) {
    const property = DECLARATION.exec(line.trim())?.[1];
    if (property === undefined || !property.startsWith(`${namespace}-`)) continue;
    names.push(property.slice(namespace.length + 1));
  }
  return names;
}

/**
 * 每個命名空間對應：utility 的前綴、以及一個**同族的 Tailwind 內建**。
 *
 * 判準是「同族的兩個放一起，後面那個要贏」—— 那正是 `twMerge` 的工作。
 * 沒贏就表示它不認得這個名字，而不認得的後果分兩種：**少東西**（歸錯族被
 * 丟掉）或**多東西**（不認得所以兩個都留，於是 CSS 順序決定，
 * 也就是 twMerge 存在的理由本身失效）。兩種這條斷言都抓得到。
 */
const NAMESPACES = [
  { css: "border-width", prefix: "border", builtin: "border-2" },
  { css: "font-weight", prefix: "font", builtin: "font-bold" },
  { css: "radius", prefix: "rounded", builtin: "rounded-none" },
  { css: "shadow", prefix: "shadow", builtin: "shadow-xs" },
] as const;

describe("cn() 認得自訂代幣的類別族", () => {
  it("★ 真的從 CSS 讀到東西了", () => {
    // 少了這條，`@theme` 的格式一改，下面每個 it.each 都會零次執行然後報綠 ——
    // 這一整組最可能安靜失效的方式就是這個（同 component-contract 的第一條）。
    expect(THEME_BLOCK.length).toBeGreaterThan(200);
    for (const { css } of NAMESPACES) expect(tokens(css).length, css).toBeGreaterThan(0);
  });

  for (const { css, prefix, builtin } of NAMESPACES) {
    describe(`--${css}-*`, () => {
      for (const name of tokens(css)) {
        const utility = `${prefix}-${name}`;
        if (utility === builtin) continue;

        it(`${utility} 與 ${builtin} 同族 —— 後者要贏`, () => {
          expect(
            cn(utility, builtin),
            `${utility} 沒有被歸進 ${builtin} 那一族 —— 請到 cn.ts 的 classGroups 登記`,
          ).toBe(builtin);
        });
      }
    });
  }

  /**
   * ⚠️ 上面那條只問「同族會不會互斥」。這幾條問**反方向**：
   * 不同族的兩個放一起，**兩個都要留**。
   *
   * 少了這一半，把所有自訂代幣通通登記進同一族也會全綠 —— 而那會讓
   * `font-control` 吃掉 `font-sans`，正是修這個 bug 之前的實際情形。
   */
  const CROSS: readonly (readonly [string, string])[] = [
    ["border-control", "border-line"],
    ["border-line", "border-control"],
    ["font-sans", "font-control"],
    ["rounded-control", "bg-surface"],
    ["shadow-overlay", "text-fg"],
  ];

  for (const [first, second] of CROSS) {
    it(`★ ${first} 與 ${second} 不同族 —— 兩個都要留`, () => {
      expect(cn(first, second)).toBe(`${first} ${second}`);
    });
  }

  it("🔴 這支測試抓得到「歸錯族」—— 用一個沒登記的名字驗", () => {
    /**
     * `border-nonexistent` 沒有在 `cn.ts` 登記，所以 twMerge 會照它的猜法
     * 把它當顏色。與 `border-line`（真的顏色）放一起就會互相排斥 ——
     * 那正是修好之前 `border-control` 的行為。
     *
     * 這條的用途是證明上面那組 `★ 不同族` 不是恆真句。
     */
    expect(cn("border-nonexistent", "border-line")).toBe("border-line");
  });
});
