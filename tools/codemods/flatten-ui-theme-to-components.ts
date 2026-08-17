import type { Codemod } from "./run.ts";

/**
 * `createUiTheme({ variants, sizes })` → `createUiTheme({ UiButton: { … } })`。
 *
 * ── 為什麼要改這個形狀 ──────────────────────────────────────────────
 *
 * 舊形狀是**按鈕的概念**（variant／size）長在一個全域 API 上。第二個元件
 * （`UiDialog`）需要覆寫它的遮罩與內容框時沒有地方可去，於是它就沒有接縫 ——
 * 而各案唯一的辦法是去改 `platform/ui` 的原始碼，也就是要集中的那一半。
 *
 * 論證見 `platform/ui/src/theme.ts` 的檔頭。
 *
 * ── 為什麼不是詞法改名 ──────────────────────────────────────────────
 *
 * 兩個舊鍵要**合併**成一格：`{ variants: {…}, sizes: {…} }` → `{ UiButton: {…} }`。
 * 把 `variants:` 與 `sizes:` 各自換成 `UiButton:` 會產生重複鍵，而後者會靜靜地
 * 蓋掉前者 —— 症狀是「升級之後 variant 的覆寫沒了，size 的還在」。
 *
 * 所以這一支做括號配對。**不引入 ts-morph**：run.ts 說得對，需要語意分析的
 * 遷移才值得那個相依，而這裡需要的只是「跳過字串內容之後的深度計數」——
 * 而字串內容非跳過不可，因為 class 字串裡真的有括號（`w-[min(32rem,92vw)]`）。
 *
 * ── 冪等性 ──────────────────────────────────────────────────────────
 *
 * 新形狀裡沒有頂層的 `variants`／`sizes` 鍵，所以重跑是 no-op。
 */

const CALL = "createUiTheme(";

/** 成對的括號。用來從 open 的位置找到對應的收尾。 */
const CLOSING: Readonly<Record<string, string>> = { "(": ")", "{": "}", "[": "]" };

/**
 * 從 `open` 這個位置（該字元必須是開括號）找到對應的收尾索引，找不到回傳 -1。
 *
 * ⚠️ **必須跳過字串內容。** Tailwind 的 class 字串裡有括號與逗號
 * （`w-[min(32rem,92vw)]`），純深度計數會在那裡算錯，
 * 而算錯的結果是把物件切在半路然後產生一個編不過的檔案。
 */
function matchBracket(source: string, open: number): number {
  const wanted = CLOSING[source[open] as string];
  if (wanted === undefined) return -1;

  let depth = 0;
  let quote = "";

  for (let i = open; i < source.length; i += 1) {
    const char = source[i] as string;

    if (quote !== "") {
      if (char === "\\") i += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (CLOSING[char] !== undefined) depth += 1;
    else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return char === wanted ? i : -1;
    }
  }
  return -1;
}

/** 把物件內容切成頂層屬性。逗號在巢狀或字串裡時不切。 */
function topLevelProps(body: string): readonly string[] {
  const props: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i] as string;

    if (quote !== "") {
      if (char === "\\") i += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (CLOSING[char] !== undefined) depth += 1;
    else if (char === ")" || char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      props.push(body.slice(start, i));
      start = i + 1;
    }
  }
  props.push(body.slice(start));
  return props.filter((prop) => prop.trim() !== "");
}

/** `variants: { a: "x" }` → `["variants", '{ a: "x" }']`。認不出來的形狀回傳 null。 */
function splitProp(prop: string): readonly [string, string] | null {
  const colon = prop.indexOf(":");
  if (colon < 0) return null;
  return [prop.slice(0, colon).trim(), prop.slice(colon + 1).trim()];
}

/** 去掉一層外層大括號並修掉結尾逗號。 */
function unwrap(objectText: string): string | null {
  const trimmed = objectText.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  return trimmed.slice(1, -1).trim().replace(/,$/, "");
}

/**
 * 改寫一個 `createUiTheme({ … })` 的引數。沒有要改的東西時回傳 null。
 *
 * ⚠️ 認不出來的形狀一律回傳 null，也就是**原樣留著**。一個看不懂就硬改的
 * codemod 造成的損害要靠一行行 review 才找得回來 —— 留著不動的話，
 * 升級的人會在型別檢查那裡當場看到它，那是比較好的失敗方式。
 */
function migrateArgument(argument: string): string | null {
  const open = argument.indexOf("{");
  if (open < 0) return null;
  const close = matchBracket(argument, open);
  if (close < 0) return null;

  const buttonSlots: string[] = [];
  const untouched: string[] = [];

  for (const prop of topLevelProps(argument.slice(open + 1, close))) {
    const split = splitProp(prop);
    if (split === null) return null;

    const [key, value] = split;
    if (key !== "variants" && key !== "sizes") {
      untouched.push(prop.trim());
      continue;
    }
    const inner = unwrap(value);
    // `variants: someVariable` —— 認不出來，整個呼叫原樣留著。
    if (inner === null) return null;
    if (inner !== "") buttonSlots.push(inner);
  }

  if (buttonSlots.length === 0) return null;

  const rebuilt = [`UiButton: { ${buttonSlots.join(", ")} }`, ...untouched].join(", ");
  return `${argument.slice(0, open)}{ ${rebuilt} }${argument.slice(close + 1)}`;
}

const codemod: Codemod = {
  description:
    "createUiTheme({ variants, sizes }) → createUiTheme({ UiButton: { … } })" +
    "（v1.0.0：元件覆寫改成「元件 → 具名槽」，見 platform/ui/src/theme.ts）",

  transform(source: string): string | null {
    let result = source;
    let changed = false;
    let from = 0;

    for (;;) {
      const call = result.indexOf(CALL, from);
      if (call < 0) break;

      const open = call + CALL.length - 1;
      const close = matchBracket(result, open);
      if (close < 0) break;

      const argument = result.slice(open + 1, close);
      const migrated = migrateArgument(argument);
      if (migrated === null) {
        from = close;
        continue;
      }

      result = result.slice(0, open + 1) + migrated + result.slice(close);
      changed = true;
      // 從改寫後的位置繼續，才不會把同一個呼叫再看一次。
      from = open + 1 + migrated.length;
    }

    // 回傳 null＝這個檔案沒有要改的東西。執行器靠它算「動了幾個檔」。
    return changed ? result : null;
  },
};

export default codemod;
