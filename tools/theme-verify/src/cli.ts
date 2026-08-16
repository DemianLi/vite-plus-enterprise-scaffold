#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";

import { findPaletteUsage, usedClassNames, type PaletteViolation } from "./palette.ts";
import { customProperties, resolve as resolveVar, ruleFor, rules } from "./css.ts";
// fixture 的探針類別。**從 fixture 讀進來，不在這支程式裡寫死** —— 理由見下面
// 那條斷言旁邊的說明（寫死的話這支工具自己會讓斷言恆真）。
import { TS_ONLY_PROBE } from "../fixtures/probe.ts";

/**
 * 設計系統接縫的驗收（HANDOFF #24 → C62 那句產品要求）。
 *
 *   > 公司會有一套基礎的 UI 版型和互動方式，但是各團隊可以依不同案件需求
 *   > 更換配色或 component 形狀或互動方式。
 *
 * 這支工具守前兩條軸。**第三條（互動方式）不在這裡** —— 它被
 * `tools/api-surface` 的 `SFC_UNSUPPORTED` 主動擋著，開它是另一件事，
 * #24 仍然開著。這裡刻意不假裝三條都守到了。
 *
 * ── 兩半，而且兩半缺一不可 ──────────────────────────────────────────
 *
 * 一、**靜態**：元件裡不准出現原始顏色（`src/palette.ts`）。
 *     只讀檔、不建置。這是「可換性」的**前置條件** —— 元件寫死
 *     `bg-gray-50`，代幣接得再好也換不到那一格。
 *
 * 二、**建置**：同一份 fixture 建兩次，一次帶 `@theme` 覆寫、一次不帶，
 *     比對兩份產出的 CSS。這是「可換性」的**證據**。
 *
 * ── 為什麼一定要真的建置 ────────────────────────────────────────────
 *
 * 因為 Tailwind 的失敗模式是**建置成功、CSS 甚至變大，但裡面什麼都沒有**
 *（`@source` 掃不到來源時，見 platform/ui/tests/styles.test.ts 的檔頭）。
 * 一支只 grep `styles.css` 有沒有寫 `@theme` 的測試，量的是「有沒有寫」，
 * 不是「有沒有生效」—— 這一輪已經在 `sr-only` 上踩過一次那個形狀。
 *
 * ── 為什麼比對的是**解析後**的值 ────────────────────────────────────
 *
 * 代幣分兩層：`--color-accent: var(--color-brand-600)`。app 端覆寫色票時，
 * `--color-accent` 的**宣告文字一個字都不會變** —— 只有展開之後才看得出來
 * 它跟著變了。比對宣告文字的話，最該驗的那一格永遠通過。
 *
 * ── 這支工具不驗什麼 ────────────────────────────────────────────────
 *
 * 不驗 `apps/console/src/styles.css` 那幾個**特定的值**。那份是給人看的
 * 示範，各案會改它；閘門盯著它的話，換一個顏色就會紅，然後閘門會被放寬
 *（C41：會誤報的閘門第一天就會被加例外，而例外永遠不會拿掉）。
 * 守的是**那條路徑會不會生效**，用的是 `fixtures/` 底下自己的一份。
 */

const ROOT = resolvePath(fileURLToPath(import.meta.url), "../../../..");
const COMPONENTS = join(ROOT, "platform/ui/src/components");
const FIXTURES = join(ROOT, "tools/theme-verify/fixtures");

let failures = 0;

function fail(rule: string, detail: string, fix: string): void {
  failures++;
  console.error(`\n✗ ${rule}\n  ${detail}\n  → ${fix}`);
}

/** 讀一次，兩半都用。靜態檢查掃它們，建置比對拿它們的類別當濾網。 */
const componentSources = new Map<string, string>(
  readdirSync(COMPONENTS)
    .filter((file) => file.endsWith(".vue"))
    .map((file) => [file, readFileSync(join(COMPONENTS, file), "utf8")]),
);

const componentClasses = new Set<string>(
  [...componentSources.values()].flatMap((source) => [...usedClassNames(source)]),
);

// ── 一、靜態：元件只准用語意代幣 ──────────────────────────────────────

function runStatic(): void {
  const files = [...componentSources.keys()];
  if (files.length === 0) {
    fail(
      "元件目錄是空的",
      `${relative(ROOT, COMPONENTS)} 底下找不到任何 .vue`,
      "這條檢查掃不到東西時會全綠 —— 那正是「綠燈代表沒有人看」，所以這裡直接紅",
    );
    return;
  }

  const violations: PaletteViolation[] = [];
  for (const [file, source] of componentSources) violations.push(...findPaletteUsage(file, source));

  if (violations.length > 0) {
    for (const violation of violations) {
      const layer = violation.kind === "builtin" ? "Tailwind 內建色階" : "色票層";
      fail(
        "元件裡有原始顏色",
        `${violation.file}:${violation.line} 用了 ${violation.className}（${layer}）`,
        violation.kind === "builtin"
          ? "改用語意代幣（見 platform/ui/src/styles/index.css 的第二層）。內建色階各案完全換不掉"
          : "改用語意代幣。色票層換得掉，但換的人必須先知道「brand-600 在這裡代表強調色」",
      );
    }
    return;
  }

  console.log(`✓ 靜態：${files.length} 個元件、0 處原始顏色`);
}

// ── 二、建置：覆寫真的會進到產物 ──────────────────────────────────────

async function compile(entry: string): Promise<string> {
  const output = await build({
    root: FIXTURES,
    configFile: false,
    logLevel: "error",
    plugins: [tailwindcss()],
    build: { write: false, rollupOptions: { input: entry } },
  });

  // vite 的 build() 依設定回傳單一結果或陣列。fixture 只有一個輸入，
  // 但型別上兩種都可能 —— 硬轉的話這裡會在 vite 改版時安靜地拿到 undefined。
  const bundles = Array.isArray(output) ? output : [output];
  const chunk = bundles
    .flatMap((bundle) => ("output" in bundle ? bundle.output : []))
    .find((asset) => asset.fileName.endsWith(".css"));

  if (chunk === undefined || chunk.type !== "asset") {
    throw new Error(`${entry} 建置成功卻沒有產出 CSS —— 這正是這支工具要抓的那種失敗`);
  }
  return String(chunk.source);
}

/**
 * 從 fixture 自己的 `@theme` 區塊推導「哪幾格被覆寫了」。清單不寫死在這支程式裡（A1）。
 *
 * 回傳空陣列＝fixture 被掏空。**這不是例外，是這道閘門最該擋下的那種改動** ——
 * 把 override.css 的 `@theme` 刪掉，下面每一條斷言都會變成恆真，
 * 然後整支工具安靜地全綠。所以它走 fail()，不是 throw。
 */
function overriddenTokens(): readonly string[] {
  const css = readFileSync(join(FIXTURES, "override.css"), "utf8");
  const theme = /@theme\s*\{([^}]*)\}/.exec(css);
  if (theme === null) return [];

  return [...(theme[1] as string).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1] as string);
}

/**
 * 傳遞閉包：直接或間接引用到 `roots` 的代幣。
 *
 * 這是「零附帶影響」那條斷言的另一半 —— 沒有它就只能寫死一份
 * 「預期會變的清單」，而那份清單會在有人加一個語意代幣的那天過期，
 * 過期的方向是**安靜地通過**。
 */
function dependents(
  vars: ReadonlyMap<string, string>,
  roots: readonly string[],
): ReadonlySet<string> {
  const changed = new Set(roots);

  for (let grew = true; grew;) {
    grew = false;
    for (const [name, value] of vars) {
      if (changed.has(name)) continue;
      for (const match of value.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!changed.has(match[1] as string)) continue;
        changed.add(name);
        grew = true;
        break;
      }
    }
  }

  return changed;
}

/** 只取主題區塊（`:root` / `:host`）的宣告。utility 內部的 `--tw-*` 不是代幣。 */
function themeTokens(css: string): ReadonlyMap<string, string> {
  const theme = rules(css).filter((rule) => rule.selector.includes(":root"));
  return customProperties(theme.map((rule) => rule.body).join(";"));
}

async function runBuilds(): Promise<void> {
  const [baseCss, overrideCss] = await Promise.all([compile("base.css"), compile("override.css")]);

  const base = themeTokens(baseCss);
  const over = themeTokens(overrideCss);

  if (base.size === 0 || over.size === 0) {
    fail(
      "建置產物裡沒有代幣",
      `base=${base.size} 格、override=${over.size} 格`,
      "Tailwind 掃不到來源時會建置成功但產出空殼 —— 先確認 platform/ui 的 @source",
    );
    return;
  }

  const roots = overriddenTokens();
  if (roots.length === 0) {
    fail(
      "fixture 沒有覆寫任何代幣",
      "fixtures/override.css 裡沒有 @theme 區塊（或區塊是空的）",
      "這份 fixture 就是這道閘門的證據來源。掏空它會讓下面每一條斷言變成恆真而全綠",
    );
    return;
  }
  const expected = dependents(base, roots);

  // ── 反向的核心：被覆寫的每一格，兩版解析值都必須不同 ──
  for (const token of roots) {
    // Tailwind 只會把**有 utility 用到**的代幣寫進產物。兩邊都沒有它，
    // 代表沒有人在用這一格 —— 那與「覆寫失效」是兩回事，錯誤訊息要分得開，
    // 否則會有人去修一條沒有壞的路徑。
    if (!base.has(token) && !over.has(token)) {
      fail(
        "被覆寫的代幣沒有出現在產物裡",
        `${token} 兩份建置都沒有 —— 沒有任何 utility 用到它`,
        "先確認元件（或 fixture 的探針）真的用得到這一格；沒有人用的代幣換了也不會有畫面改變",
      );
      continue;
    }

    const before = resolveVar(base.get(token) ?? "«缺»", base);
    const after = resolveVar(over.get(token) ?? "«缺»", over);
    if (before !== after) continue;
    fail(
      "覆寫沒有生效",
      `${token} 在兩份建置裡都是 ${before} —— fixtures/override.css 的 @theme 沒有進到產物`,
      "app 端覆寫代幣的路徑斷了。先確認 override.css 的 @import 在 @theme 之前",
    );
  }

  // ── 兩層結構還在：至少有一個語意代幣是跟著色票走的 ──
  const followers = [...expected].filter((token) => !roots.includes(token));
  if (followers.length === 0) {
    fail(
      "代幣只剩一層",
      `被覆寫的 ${roots.join("、")} 沒有任何語意代幣指向它`,
      "語意層應該寫成 `--color-accent: var(--color-brand-600)`。" +
        "改成直接寫值的話，各案就只能一格一格追 —— 那正是 #24 量到的狀態",
    );
  }
  for (const token of followers) {
    const before = resolveVar(base.get(token) ?? "«缺»", base);
    const after = resolveVar(over.get(token) ?? "«缺»", over);
    if (before !== after) continue;
    fail(
      "語意層沒有跟著色票走",
      `${token} 宣告上引用了被覆寫的色票，解析後卻兩版相同（${before}）`,
      "Tailwind 若改成在建置期求值，這一層間接就失效了 —— 那會是升級的破壞性變更",
    );
  }

  // ── 零附帶影響：其餘每一格兩版必須逐字相同 ──
  const collateral = [...base.keys()].filter((token) => {
    if (expected.has(token)) return false;
    return (
      resolveVar(base.get(token) as string, base) !== resolveVar(over.get(token) ?? "«缺»", over)
    );
  });
  if (collateral.length > 0) {
    fail(
      "覆寫有附帶影響",
      `沒有被覆寫、也沒有引用被覆寫代幣的這幾格卻變了：${collateral.join("、")}`,
      "覆寫應該是就地取代單一宣告。會擴散的話，各案改一個顏色就會動到別人的東西",
    );
  }

  // ── 元件端不必跟著改：用到這些代幣的 utility，本體兩版逐字相同 ──
  //
  // ⚠️ 選擇器清單**刻意不寫在這支程式裡**，而且不只是為了整潔：
  // Tailwind 掃 `.ts` 時連註解一起掃，所以任何寫在這裡的類別名稱
  // 都會讓它自己被編進產物 —— 包括寫在「不要寫在這裡」那句警告裡的。
  // 實測過一次：元件裡的用法整條刪掉，這道檢查照樣全綠（見 palette.ts
  // 的 usedClassNames）。所以先用元件的實際用法把候選濾一遍。
  const touched = [...roots, ...followers];
  const users = rules(baseCss).filter(
    (rule) =>
      // `:root` 自己也引用被覆寫的代幣，而它**本來就該**兩版不同 ——
      // 那正是上面幾條斷言在驗的東西。少了這一行，這道檢查會在正常狀態下
      // 就紅，然後被當成噪音關掉。
      !rule.selector.includes(":root") &&
      componentClasses.has(rule.selector.replace(/^\./, "")) &&
      touched.some((token) => rule.body.includes(`var(${token})`)),
  );

  if (users.length === 0) {
    fail(
      "沒有任何 utility 用到被覆寫的代幣",
      `覆寫了 ${touched.join("、")}，產物裡卻沒有一條規則引用它們`,
      "代幣存在但沒有元件在用 —— 換了也不會有任何畫面改變，這條接縫是空的",
    );
  }

  for (const before of users) {
    const after = ruleFor(rules(overrideCss), before.selector);
    if (after === undefined) {
      fail(
        "覆寫之後少了一條規則",
        `${before.selector} 只出現在 base 建置裡`,
        "換品牌不該讓任何 utility 消失。這是「建置成功但少了東西」那個症狀",
      );
      continue;
    }
    if (before.body === after.body) continue;
    fail(
      "覆寫改到了 utility 本體",
      `${before.selector} 兩版不同：\n    base     ${before.body}\n    override ${after.body}`,
      "換品牌應該只換 :root 的變數值。utility 也跟著變代表元件綁到了具體的值",
    );
  }

  // ── 覆寫字串寫在 .ts 裡也要掃得到 ──
  //
  // 類別名稱從 fixture **讀進來**而不是寫在這裡，理由同上。
  if (TS_ONLY_PROBE.length === 0) {
    fail(
      "fixture 的 .ts 探針是空的",
      "fixtures/probe.ts 沒有列出任何類別",
      "那條斷言會變成恆真。探針要挑一個整個 repo 其他地方都沒用到的類別",
    );
  }
  for (const candidate of TS_ONLY_PROBE) {
    if (ruleFor(rules(baseCss), `.${candidate}`) !== undefined) continue;
    fail(
      "只寫在 .ts 裡的類別沒有被編出來",
      `fixtures/probe.ts 的 ${candidate} 不在產物裡`,
      "createUiTheme() 的覆寫字串就住在 .ts（composition root）。" +
        "@source 掃不到 .ts 的話那些覆寫會安靜地沒有樣式，而建置全綠",
    );
  }

  if (failures === 0) {
    console.log(
      `✓ 建置：覆寫 ${roots.length} 格代幣、連動 ${followers.length} 格語意代幣、` +
        `${users.length} 條 utility 本體不變、其餘 ${base.size - expected.size} 格零附帶影響`,
    );
  }
}

runStatic();
await runBuilds();

if (failures > 0) {
  console.error(`\n✗ 設計系統接縫：${failures} 項未通過`);
  process.exit(1);
}
console.log("✓ 設計系統接縫：配色與形狀兩條軸都實測可換（互動軸見 HANDOFF #24）");
