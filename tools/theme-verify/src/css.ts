/**
 * 從建置產物裡把「代幣宣告」與「utility 規則」讀出來的最小 CSS 讀取層。
 *
 * ⚠️ ── 為什麼不用正則一把抓 ───────────────────────────────────────
 *
 * 第一版是 `/(?:^|\})([^{}]*)\{([^{}]+)\}/g`。它在這份產物上**安靜地少回傳
 * 一半的規則** —— `@layer`／`@media`／`:is(…)` 都會讓它對錯位置。
 * 而「少回傳幾條」在比對工具上的表現是**通過**：要比對的那條不在集合裡，
 * 於是「兩邊相同」成立。這與 #24 那個認不得 `text-(--var)` 的 grep 是
 * 同一種病 —— **用來量 X 的工具看不見 X**。
 *
 * 所以這裡真的做括號配對。
 */

export interface Rule {
  readonly selector: string;
  readonly body: string;
}

/** 切出所有最內層的 `{ … }` 區塊，連同它前面的選擇器／at-rule 前言。 */
export function rules(css: string): readonly Rule[] {
  const out: Rule[] = [];
  let depth = 0;
  let start = 0;
  let selector = "";

  for (let i = 0; i < css.length; i++) {
    const char = css[i];

    if (char === "{") {
      if (depth === 0) {
        selector = css.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
      continue;
    }

    if (char === "}") {
      depth--;
      if (depth === 0) {
        const body = css.slice(start, i);
        // at-rule 內層還有規則的話遞迴進去；否則這就是一條規則。
        if (body.includes("{")) out.push(...rules(body));
        else out.push({ selector, body });
        start = i + 1;
      }
    }
  }

  return out;
}

/**
 * 所有自訂屬性宣告（含 `--tw-*`）。
 *
 * 用最後一次出現的值 —— CSS 的層疊就是這樣，而 app 端的覆寫正是靠
 * 「同名宣告出現在後面」生效的。取第一次會直接把要驗的東西驗反。
 */
export function customProperties(css: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    map.set(match[1] as string, (match[2] as string).trim());
  }
  return map;
}

/**
 * 把 `var(--a)` 一路展開成最終值。
 *
 * 這是整支工具的核心：兩層代幣的間接（`--color-accent: var(--color-brand-600)`）
 * 只有展開之後才看得出來「覆寫色票，語意層有沒有跟著走」。
 * 只比對宣告文字的話，那一格**永遠是相同的字串**，於是永遠通過。
 */
export function resolve(value: string, vars: ReadonlyMap<string, string>, depth = 0): string {
  // 迴圈防護。CSS 自己容得下 `--a: var(--a)`（結果是 invalid at computed-value
  // time），而這裡碰到它必須停下來，不是把 CI 掛住。
  if (depth > 16) return value;

  // ⚠️ 正則只負責切出 `var(…)` 的括號，名稱與 fallback 在程式裡拆。
  //
  // 第一版把 fallback 也寫進正則（`(?:,\s*([^()]*))?`），被 SAST 判成不安全，
  // 而它是對的：可選群組接在 `+` 後面就是有歧義的量詞，最壞情況會回溯爆炸。
  // 一道跑在 CI 上的檢查掛在自己的正則上，是最難解釋的那種故障。
  //
  // 代價：巢狀的 `var(--a, var(--b))` 只會展開內層，外層原樣留著。
  // Tailwind 的主題區塊不會這樣寫，而**留著原文比展開錯更安全** ——
  // 兩份建置的結果仍然可比，只是那一格比的是文字。
  return value.replace(/var\(([^()]+)\)/g, (whole, inner: string) => {
    const comma = inner.indexOf(",");
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    if (!name.startsWith("--")) return whole;

    const found = vars.get(name);
    if (found !== undefined) return resolve(found, vars, depth + 1);
    return comma === -1 ? `«未定義:${name}»` : inner.slice(comma + 1).trim();
  });
}

/** 找出第一條選擇器**完全等於** `selector` 的規則。等於而非包含 —— 見下。 */
export function ruleFor(all: readonly Rule[], selector: string): Rule | undefined {
  // ⚠️ 這裡曾經寫成 `s.includes(selector)`，而 `.text-fg` 會同時命中
  // `.text-fg-muted` 與 `.text-fg-subtle`，比對出來的是三條規則串在一起。
  // 子字串比對在類別名稱上永遠是錯的，因為類別名稱本來就互為前綴。
  return all.find((rule) => rule.selector === selector);
}
