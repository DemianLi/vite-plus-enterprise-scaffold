/**
 * §11 II ⑨ 的**靜態層**：宣告過的個資欄位，在畫面上必須走隱碼。
 *
 * ── 兩層的分工 ──────────────────────────────────────────────────────
 *
 * 這一層問的是「原始碼裡有沒有寫」，元件測試那一層問的是
 * 「渲染出來的東西裡有沒有」。兩個都需要，理由與 `csp-verify` 一樣：
 *
 *   - 只有靜態層：`maskName(x)` 寫了，但函式回傳原值 —— 檢查全綠
 *   - 只有元件測試：只證明**被測到的那個元件**沒漏，新加一欄不會有人發現
 *
 * ── 只看 `<template>`，不看 `<script>` ─────────────────────────────
 *
 * 規則講的是**呈現**。個資在 script 裡被讀取、排序、傳給 composable 都是
 * 正常的；把 script 也納入只會逼人用變數改名繞過檢查，
 * 而繞過的結果是畫面照樣印出完整姓名。
 *
 * ── 刻意不解析 DOM ──────────────────────────────────────────────────
 *
 * 與 `static-csp.ts` 同一條理由（D2）：一個守門檢查不該為此引入 HTML parser。
 * 詞法比對在這裡夠用 —— 要找的是「這個欄位名出現在哪個運算式裡」，
 * 不是「它在哪個節點下」。
 */

/** 全部單層量詞：巢狀量詞會被 security/detect-unsafe-regex 擋（C19）。 */
const TEMPLATE_BLOCK = /<template[^>]*>([\s\S]*)<\/template>/;
const INTERPOLATION = /\{\{([^}]*)\}\}/g;
/** `:prop="expr"` 與 `v-bind:prop="expr"`，以及 `@click="expr"`。 */
const BOUND_ATTRIBUTE = /(?::|v-bind:|@)[\w.-]+="([^"]*)"/g;
/** 認得出來的隱碼呼叫。`@org/pii` 匯出的都以 mask 開頭。 */
const MASK_CALL = /\bmask[A-Z]\w*\s*\(/;

/**
 * 從切片的 `src/index.ts` 讀出 `personalData` 的**字面值**。
 *
 * ── 為什麼不 import 進來執行 ────────────────────────────────────────
 *
 * 第一版是 `await import(...)`，跑起來當場炸：`defineFeature` 會讀
 * `import.meta.env.DEV`，那在純 node 底下是 undefined。
 *
 * 但真正該改的理由不是那個 —— 是**一道法遵閘門不該執行被它稽核的程式碼**。
 * 執行的話，`personalData` 可以是算出來的，於是「這個切片宣告了哪些個資」
 * 就不再是 review 看得到的東西。這與 `supply-chain` 把家族分級表寫在原始碼裡
 * 而不是 JSON 是同一條理由：**宣告要能被人一眼看完。**
 *
 * 所以這裡只接受字面陣列。寫成別的形式會被當成「讀不到」而擋下，
 * 而不是靜靜地當成空陣列 —— 空陣列是一個答案，讀不到不是。
 */
export function parsePersonalData(source: string): readonly string[] | null {
  const match = /personalData\s*:\s*\[([^\]]*)\]/.exec(source);
  if (match === null) return null;

  const body = (match[1] ?? "").trim();
  if (body === "") return [];

  const fields: string[] = [];
  for (const piece of body.split(",")) {
    const value = piece.trim();
    if (value === "") continue;
    const quoted = /^"([\w.$]+)"$/.exec(value) ?? /^'([\w.$]+)'$/.exec(value);
    // 一個算出來的元素（變數、樣板字串、展開）讓整份宣告不再是字面的。
    if (quoted === null) return null;
    fields.push(quoted[1] as string);
  }
  return fields;
}

export interface MaskingViolation {
  readonly file: string;
  readonly field: string;
  readonly expression: string;
}

export interface SliceMasking {
  readonly slice: string;
  readonly declared: readonly string[];
  readonly templatesExamined: number;
  readonly violations: readonly MaskingViolation[];
  /** 宣告了、而且真的出現在某個渲染運算式裡的欄位（不論有沒有隱碼）。 */
  readonly rendered: readonly string[];
}

/** 抽出所有會被渲染的運算式。回傳原文，訊息才指得出是哪一段。 */
export function renderedExpressions(source: string): readonly string[] {
  const template = TEMPLATE_BLOCK.exec(source)?.[1];
  if (template === undefined) return [];

  const found: string[] = [];
  for (const match of template.matchAll(INTERPOLATION)) found.push((match[1] ?? "").trim());
  for (const match of template.matchAll(BOUND_ATTRIBUTE)) found.push((match[1] ?? "").trim());
  return found;
}

/** 識別字元。判斷欄位名是不是完整出現，而不是某個更長名字的一部分。 */
function isIdentifierChar(character: string | undefined): boolean {
  return character !== undefined && /[\w$]/.test(character);
}

/**
 * `expression` 裡有沒有完整提到 `field`。
 *
 * ── 刻意不用 `new RegExp(`\\b${field}\\b`)` ────────────────────────────
 *
 * 第一版是那樣寫的，`security/detect-non-literal-regexp` 擋下來了，而它是對的：
 * `field` 來自被稽核的檔案。`parsePersonalData` 已經把欄位名限制在 `[\w.$]+`，
 * 但**「上游會擋住」不是一個該由下游依賴的性質** —— 那個限制哪天放寬，
 * 這裡會安靜地變成一個以檔案內容組出來的 regex。
 *
 * 手寫邊界比對把整類問題移除，而不是抑制它的警告。
 */
export function mentionsField(expression: string, field: string): boolean {
  let at = expression.indexOf(field);
  while (at !== -1) {
    const before = at === 0 ? undefined : expression[at - 1];
    const after = expression[at + field.length];
    // `order.customerName` 的 `.` 不是識別字元，所以算完整提到；
    // `customerNameLabel` 的 `L` 是，所以不算。
    if (!isIdentifierChar(before) && !isIdentifierChar(after)) return true;
    at = expression.indexOf(field, at + 1);
  }
  return false;
}

/**
 * 這個運算式有沒有把 `field` 漏出去。
 *
 * 「同一個運算式裡有 mask 呼叫」是刻意寬鬆的判準：要精確判斷
 * `maskName(a.customerName)` 與 `foo(maskName(b), a.customerName)` 的差別，
 * 需要真的解析 JS 運算式，而那個複雜度換來的精確度，
 * 在一個「畫面上有沒有隱碼」的檢查上不值得 ——
 * **元件測試那一層會抓到寫錯的那種**，而它抓得比任何靜態分析都準。
 */
export function leaksField(expression: string, field: string): boolean {
  if (!mentionsField(expression, field)) return false;
  return !MASK_CALL.test(expression);
}

export function checkSlice(
  slice: string,
  declared: readonly string[],
  templates: ReadonlyMap<string, string>,
): SliceMasking {
  const violations: MaskingViolation[] = [];
  const rendered = new Set<string>();

  for (const [file, source] of templates) {
    for (const expression of renderedExpressions(source)) {
      for (const field of declared) {
        if (!mentionsField(expression, field)) continue;
        rendered.add(field);
        if (leaksField(expression, field)) violations.push({ file, field, expression });
      }
    }
  }

  return {
    slice,
    declared,
    templatesExamined: templates.size,
    violations,
    rendered: [...rendered],
  };
}

export interface MaskingProblem {
  readonly kind: "leak" | "no-slices" | "declared-but-never-rendered" | "not-declared";
  readonly detail: string;
}

export function maskingProblems(results: readonly SliceMasking[]): readonly MaskingProblem[] {
  const problems: MaskingProblem[] = [];

  if (results.length === 0) {
    // 沒有這一條，切片列舉壞掉就會表現成「零違規 ＝ 通過」。
    problems.push({
      kind: "no-slices",
      detail: "一個切片都沒讀到 —— 切片列舉壞了，而零違規不是通過。",
    });
  }

  for (const result of results) {
    for (const violation of result.violations) {
      problems.push({
        kind: "leak",
        detail:
          `${violation.file}：${result.slice} 宣告 "${violation.field}" 是個資，` +
          `但這段運算式直接把它渲染出去 —— \`${violation.expression}\`\n` +
          "      改法：用 @org/pii 的 maskName／maskEmail／maskPhone／maskNationalId 包起來。",
      });
    }

    // 宣告了、卻沒有在任何渲染運算式裡出現的欄位。
    //
    // 最可能的原因是**欄位改名了**，而宣告沒跟著改 —— 於是 personalData 上
    // 掛著一個不存在的欄位名，新的那個欄位一路裸奔而檢查全綠。
    // 這與 `stale-exemption`、`roster-drift` 是同一件事：
    // 一份宣告如果對不到任何東西，它保護的就是空氣。
    const rendered = new Set(result.rendered);
    for (const field of result.declared) {
      if (rendered.has(field)) continue;
      problems.push({
        kind: "declared-but-never-rendered",
        detail:
          `${result.slice} 宣告 "${field}" 是個資，但它沒有出現在任何 .vue 的渲染運算式裡` +
          `（看了 ${result.templatesExamined} 個模板）。\n` +
          "      欄位改名了嗎？宣告對不到東西的話，它保護的是空氣。\n" +
          "      畫面還沒做的話，先把它從 personalData 拿掉，做的時候再加回來。",
      });
    }
  }

  return problems;
}
