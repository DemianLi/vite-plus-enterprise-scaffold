#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";

import { parseFlags } from "@org/gate-kit";

import {
  declaredColorTokens,
  findPaletteUsage,
  translationFor,
  usedClassNames,
  type PaletteViolation,
} from "./palette.ts";
import { auditReferences, customProperties, resolve as resolveVar, ruleFor, rules } from "./css.ts";
// fixture 的探針類別。**從 fixture 讀進來，不在這支程式裡寫死** —— 理由見下面
// 那條斷言旁邊的說明（寫死的話這支工具自己會讓斷言恆真）。
import { TS_ONLY_PROBE } from "../fixtures/probe.ts";
// 反向探針：**應該掃不到**的類別。字面值住在被 @source not 排除的檔案裡，
// 這支程式只拿變數 —— 寫在這裡的話它自己會進產物，斷言就永遠紅。
import { EXCLUDED_PROBE, EXCLUDED_PROBE_MARK } from "../tests/excluded-probe.ts";

/**
 * 設計系統接縫的驗收（HANDOFF #24 → C62 那句產品要求）。
 *
 *   > 公司會有一套基礎的 UI 版型和互動方式，但是各團隊可以依不同案件需求
 *   > 更換配色或 component 形狀或互動方式。
 *
 * 這支工具守前兩條軸。**第三條（互動方式）不在這裡，而且不該在這裡** ——
 * 互動換不了代幣，它是靠組合（slot／emit）換的，所以守它的是
 * `tools/api-surface`：元件的 slot 與 emit 必須宣告，而宣告改了會漂移
 *（2026-08-17 起，見 C67）。這裡刻意不假裝三條都守到了。
 *
 * ── 三段，而且三段缺一不可 ──────────────────────────────────────────
 *
 * 一、**靜態**：元件裡不准出現原始顏色（`src/palette.ts`）。
 *     只讀檔、不建置。這是「可換性」的**前置條件** —— 元件寫死
 *     `bg-gray-50`，代幣接得再好也換不到那一格。
 *
 * 二、**引用**：產物裡不准有指向不存在代幣的 `var()`（`runReferences`）。
 *     這一段守的是設計系統的**使用端**，而前後兩段都只看 platform/ui。
 *     它是 2026-08-17 補的，補的正是前兩段上線那個 PR 自己留下的 6 處缺陷。
 *
 * 三、**建置**：同一份 fixture 建兩次，一次帶 `@theme` 覆寫、一次不帶，
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

/**
 * ⚠️ **這支不吃任何旗標 —— 而「不吃」必須是一句話，不是一片沉默**（C126）。
 *
 * 空 spec 在 `parseFlags` 底下的意思是**拒絕所有旗標**，不是放行所有旗標。
 * 少了這三行，`node <這支> --anything` 會靜靜地跑一趟預設路徑然後回 0 ——
 * 而 CI 上留著一個被拿掉的旗標時，那一步會頂著它原本的名字回傳綠燈
 * （C52 付過這筆學費，完整量測在 C125 §一）。
 */
const FLAGS = parseFlags(process.argv.slice(2), {});
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

const ROOT = resolvePath(fileURLToPath(import.meta.url), "../../../..");
const COMPONENTS = join(ROOT, "platform/ui/src/components");
const FIXTURES = join(ROOT, "tools/theme-verify/fixtures");
const THEME_CSS = join(ROOT, "platform/ui/src/styles/index.css");

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

/**
 * **消費端**的 `.vue`：切片與應用。
 *
 * ── 為什麼供應端守好了還不夠 ────────────────────────────────────────
 *
 * 元件一行原始顏色都沒有，不代表各案換得掉配色 —— 切片自己在頁面上寫
 * `text-gray-900`，那一格就永遠是灰的。乾跑量出來的不是假想：
 * **`features` 兩處、`apps` 一處，而第四處在產生器模板裡**，也就是
 * 每個新切片天生帶著一個換不掉的顏色（C41 那個形狀的重演）。
 *
 * 判準與元件那一段**共用同一支偵測器**（`findPaletteUsage`）。
 * 兩邊各持一份的話，供應端收緊而消費端沒跟上，而閘門全綠。
 *
 * ⚠️ 這與檔頭那句「不驗 `apps/console/src/styles.css` 的特定值」**不衝突**：
 * 那句講的是 `@theme` 覆寫的**值**（那是刻意留給各案的擴充點），
 * 這裡擋的是模板裡**繞過代幣層**寫死顏色。前者是用擴充點，後者是不用。
 */
const CONSUMER_ROOTS = ["features", "apps"] as const;

function collectViews(dir: string, out: Map<string, string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
        continue;
      }
      collectViews(join(dir, entry.name), out);
    } else if (entry.name.endsWith(".vue")) {
      const path = join(dir, entry.name);
      out.set(relative(ROOT, path), readFileSync(path, "utf8"));
    }
  }
}

const consumerSources = new Map<string, string>();
for (const root of CONSUMER_ROOTS) collectViews(join(ROOT, root), consumerSources);

function describeUntranslated(violation: PaletteViolation): string {
  return (
    `${violation.file}:${violation.line} 用了 ${violation.className}` +
    ` —— \`--${violation.upstream ?? ""}\` 是 shadcn 的代幣名，這個 repo 沒有宣告它`
  );
}

/**
 * ⚠️ **訊息一定要說得出替代品。** 少了它，最短的修法是把上游名字加進
 * `@theme` —— 而那正好是錯的方向：多一層沒有人用的代幣，設計稿上那一格
 * 仍然對不到名字（承諾三的整個重點是槽名不需要翻譯表）。
 */
function untranslatedFix(violation: PaletteViolation): string {
  const name = violation.upstream ?? "";
  const ours = translationFor(name);

  if (ours !== null) {
    const utility = violation.className.slice(violation.className.lastIndexOf(":") + 1);
    const prefix = utility.startsWith("--") ? null : utility.slice(0, utility.indexOf("-"));
    const suggestion = prefix === null ? ours : `\`${prefix}-${ours.slice("--color-".length)}\``;
    return (
      `這個 repo 的語意層叫 \`${ours}\` —— 改成 ${suggestion}。\n` +
      `    ⚠️ 不要把 \`--${name}\` 加進 @theme：那會多一層沒有人用的代幣，` +
      "而設計稿上那一格仍然對不到名字"
    );
  }

  return (
    `這個 repo **沒有** \`--${name}\` 的單一對應，所以沒有一行改法。\n` +
    "    · `secondary` 在這裡是一組 class（見 UiButton 的 VARIANTS），不是一個顏色代幣\n" +
    "    · `sidebar-*`／`chart-*` 這個 repo 沒有那個概念 —— 抄進來的元件如果需要它，\n" +
    "      那是一個要先做的設計決定（哪些格子可換、叫什麼名字），不是一次改名\n" +
    `    ⚠️ 同樣不要把 \`--${name}\` 加進 @theme 了事 —— 那會讓它看起來像有人決定過`
  );
}

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

  // 消費端掃不到東西也是「綠燈代表沒有人看」—— 與上面那條同一個理由。
  if (consumerSources.size === 0) {
    fail(
      "切片與應用底下找不到任何 .vue",
      `${CONSUMER_ROOTS.join("／")} 掃出 0 個檔`,
      "這條檢查掃不到東西時會全綠 —— 所以這裡直接紅",
    );
    return;
  }

  /**
   * 第三類（未翻譯的 shadcn 代幣）要用的減數：我們 `@theme` 裡真的宣告過的名字。
   *
   * ⚠️ **從 CSS 讀，不寫死在偵測器裡。** 寫死的話，改一個代幣名就會讓那一類
   * 靜靜地開始誤報或漏報 —— 而 `--color-muted` → `--color-fg-muted` 這種
   * 改名真的發生過（見 index.css 那一格的註解）。
   */
  const declared = declaredColorTokens(readFileSync(THEME_CSS, "utf8"));
  if (declared.size === 0) {
    fail(
      "@theme 解析不出任何顏色代幣",
      `${relative(ROOT, THEME_CSS)} 的 @theme 區塊沒有讀到 --color-*`,
      "第三類的判準是「shadcn 的詞彙**減去**這一份」——" +
        "減數是空的時候它會把所有同名代幣都報成違規，所以這裡先紅",
    );
    return;
  }

  const violations: PaletteViolation[] = [];
  for (const [file, source] of componentSources) {
    violations.push(...findPaletteUsage(file, source, declared));
  }
  for (const [file, source] of consumerSources) {
    violations.push(...findPaletteUsage(file, source, declared));
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      if (violation.kind === "untranslated") {
        fail("未翻譯的 shadcn 代幣", describeUntranslated(violation), untranslatedFix(violation));
        continue;
      }
      const layer = violation.kind === "builtin" ? "Tailwind 內建色階" : "色票層";
      fail(
        "原始顏色",
        `${violation.file}:${violation.line} 用了 ${violation.className}（${layer}）`,
        violation.kind === "builtin"
          ? "改用語意代幣（見 platform/ui/src/styles/index.css 的第二層）。內建色階各案完全換不掉"
          : "改用語意代幣。色票層換得掉，但換的人必須先知道「brand-600 在這裡代表強調色」",
      );
    }
    return;
  }

  console.log(
    `✓ 靜態：${files.length} 個元件 ＋ ${consumerSources.size} 個切片／應用畫面、0 處原始顏色`,
  );
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

/**
 * 三、引用：產物裡沒有指向不存在代幣的 `var()`。
 *
 * ── 這一條守的是設計系統的**使用端**，其他兩半都只看 platform/ui ──────
 *
 * 代幣改名時，宣告那一側改得掉；引用那一側散在各切片的 `class` 字串裡。
 * 實測（2026-08-17）：#24 把 `--color-muted` 改名成 `--color-fg-muted`，
 * 兩個切片與 `tools/slice-gen` 的模板共 6 處引用留在原地，產物裡因此有
 * `.text-\(--color-muted\){color:var(--color-muted)}` 指向一個不存在的東西 ——
 * 而當時這支工具**全綠**，因為它的靜態半只掃 `platform/ui/src/components`。
 *
 * 這一半掃得到，是因為 `platform/ui` 的 `@source` 是一條從 repo 根往下的
 * glob：fixture 建置會把**整個 repo**（含 `features/`、含 `tools/` 裡的模板字串）
 * 的類別一起編進來。所以檢查的對象雖然是 fixture 的產物，涵蓋的是全 repo。
 */
function runReferences(builds: readonly (readonly [string, string])[]): void {
  const before = failures;
  let declared = 0;

  for (const [label, css] of builds) {
    const audit = auditReferences(css);
    declared += audit.declared;

    if (audit.declared === 0) {
      fail(
        "產物裡一個自訂屬性宣告都沒讀到",
        `${label} 建置解析出 0 格宣告`,
        "解析不到東西時「沒有懸空引用」會恆真 —— 那是綠燈代表沒有人看，所以這裡直接紅",
      );
      continue;
    }

    for (const reference of audit.dangling) {
      fail(
        "引用了不存在的代幣",
        `${label} 建置：${reference.name} 被 ${reference.selectors.join("、")} 引用，` +
          "但整份產物裡沒有任何地方宣告它",
        "改名代幣時要一起改使用端；`var()` 指到不存在的名字時瀏覽器會讓整條宣告失效" +
          "（`color` 的結果是安靜地繼承父層），而建置不會有任何話說",
      );
    }
  }

  if (failures === before) {
    console.log(`✓ 引用：${builds.length} 份產物共 ${declared} 格代幣宣告、0 處懸空引用`);
  }
}

async function runBuilds(): Promise<void> {
  const [baseCss, overrideCss] = await Promise.all([compile("base.css"), compile("override.css")]);

  runReferences([
    ["base", baseCss],
    ["override", overrideCss],
  ]);

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

  // ── 反過來：測試檔裡的類別**不准**進產物 ──
  //
  // 上面那條守「掃得到」，這條守「掃得剛好」。兩條都要，因為
  // `@source` 的兩種壞法方向相反：漏掃讓畫面壞掉，多掃讓交付的 CSS
  // 帶著測試殘留（實測 0.84 kB／13 條選擇器，全部來自測試檔的字面值與註解）。
  //
  // ⚠️ 退出演練抓不到多掃那一種：它比的是 CSS 位元組比值 ≥ 80%，
  // 而多掃的方向是產物變大。所以這裡是唯一在守它的地方。
  if (EXCLUDED_PROBE.length === 0 || EXCLUDED_PROBE_MARK.length === 0) {
    fail(
      "反向探針是空的",
      "tests/excluded-probe.ts 沒有給出類別或比對字串",
      "空字串會讓下面那條斷言恆真 —— 同 fixtures/probe.ts 的理由",
    );
  } else if (baseCss.includes(EXCLUDED_PROBE_MARK)) {
    fail(
      "測試檔裡的類別被編進產物了",
      `${EXCLUDED_PROBE} 只寫在 tests/ 底下，卻在產物裡留下了 ${EXCLUDED_PROBE_MARK}`,
      "platform/ui 的 @source 少了 `not` 那兩條排除。Tailwind 的抽取器不解析語法，" +
        "連註解裡長得像 utility 的字串都會變成規則 —— 那些規則會進使用者下載的 CSS",
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
console.log("✓ 設計系統接縫：配色與形狀兩條軸都實測可換（互動軸由 api-surface 守，見 C67）");
