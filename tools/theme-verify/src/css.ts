/**
 * 從建置產物裡把「代幣宣告」與「utility 規則」讀出來的最小 CSS 讀取層。
 *
 * ⚠️ ── 為什麼不用正則一把抓 ───────────────────────────────────────
 *
 * 第一版是 `/(?:^|\})([^{}]*)\{([^{}]+)\}/g`。它在這份產物上**安靜地少回傳
 * 一半的規則** —— `@layer`／`@media`／`:is(…)` 都會讓它對錯位置。
 * 而「少回傳幾條」在比對工具上的表現是**通過**：要比對的那條不在集合裡，
 * 於是「兩邊相同」成立。這與 #24 那個認不得 `text-()` 括號語法的 grep 是
 * 同一種病 —— **用來量 X 的工具看不見 X**。
 *
 * ⚠️ 上一句話原本把那個 utility **完整**寫出來（`text-` ＋ 括號 ＋ 變數名）。
 * Tailwind 連 `.ts` 的註解一起掃，於是那句警告讓自己被編成一條真的 CSS
 * 規則，指向一個不存在的變數，一路進到每一支 app 的產物裡 ——
 * 由這個檔案下面新加的 auditReferences() 抓到。所以這裡只寫括號、不寫變數名。
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

// ── 懸空引用 ──────────────────────────────────────────────────────────

/** 一個被引用、卻沒有任何地方宣告的自訂屬性。 */
export interface DanglingReference {
  readonly name: string;
  /** 引用它的選擇器（去重、排序過）。 */
  readonly selectors: readonly string[];
}

export interface ReferenceAudit {
  /**
   * 產物裡宣告過的自訂屬性總數。
   *
   * 這個數字要跟著回傳，是因為**「零個懸空引用」與「一個字都沒讀到」在輸出上
   * 長得一模一樣**。呼叫端拿它當前置條件：讀到 0 格宣告時該紅，不是該綠。
   * 同一個顧慮在 cli.ts 的 overriddenTokens() 上已經寫過一次。
   */
  readonly declared: number;
  readonly dangling: readonly DanglingReference[];
}

/**
 * ⚠️ **有 fallback 的 `var(--x, y)` 一律放行，這一條不要「收緊」。**
 *
 * 實測（2026-08-17，apps/console 的產物）：全部 9 筆未宣告引用裡有 7 筆帶
 * fallback，而且**7 筆全部是 Tailwind 自己寫的**（`--default-font-feature-settings`、
 * `--tw-leading`、`--tw-ease`…）。fallback 正是 CSS 給「這一格可能沒人設定」
 * 的正規寫法，把它們算成違規＝這道檢查上線第一天就有 7 個偽陽性，
 * 然後被加例外或關掉（C41）。
 *
 * 剩下的 2 筆沒有 fallback，而且兩筆都是真的缺陷 —— 見 README。
 */
const BARE_VAR = /var\(\s*(--[a-z0-9-]+)\s*\)/g;

/**
 * 把「宣告過的自訂屬性」放到最寬：**整份樣式表裡任何一條規則宣告過**就算數，
 * 外加 `@property` 註冊過的名字。
 *
 * 不追作用域是刻意的。嚴格做法（只認同一條規則或 `:root`）會把 Tailwind
 * 那套「A 規則設 `--tw-shadow`、B 規則讀它」的組合全部判成違規，
 * 而那些一個都不是缺陷。這裡要抓的是另一種東西：**整份產物裡沒有任何地方
 * 宣告過它** —— 那種引用在瀏覽器裡是 invalid at computed-value time，
 * 對 `color` 來說結果是安靜地繼承父層，畫面壞掉而建置全綠。
 */
function declaredNames(all: readonly Rule[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const rule of all) {
    // `@property --tw-leading { … }` —— 名字在前言裡，不在 body 裡。
    if (rule.selector.startsWith("@property")) {
      const registered = rule.selector.slice("@property".length).trim();
      if (registered.startsWith("--")) names.add(registered);
    }
    for (const name of customProperties(rule.body).keys()) names.add(name);
  }
  return names;
}

/**
 * 找出產物裡「引用了但沒有人宣告」的自訂屬性。
 *
 * ── 為什麼這道檢查非有不可 ──────────────────────────────────────────
 *
 * 代幣改名的時候，改得掉的是宣告那一側；引用那一側散在各切片的 `class` 裡，
 * 而**沒有任何東西會因此變紅** —— TypeScript 看不到 class 字串，Tailwind 照樣
 * 把 `.text-\(--color-muted\)` 編出來（它不檢查那個變數存不存在），
 * 建置成功、CSS 還變大。實測就是這樣發生的：#24 把 `--color-muted` 改成
 * `--color-fg-muted`，兩個切片與產生器模板共 6 處引用留在原地，
 * 而當時 `theme-verify` 全綠 —— 因為它的靜態半只掃 `platform/ui` 的元件，
 * 看不見設計系統的**使用端**。
 */
export function auditReferences(css: string): ReferenceAudit {
  const all = rules(css);
  const declared = declaredNames(all);
  const found = new Map<string, Set<string>>();

  for (const rule of all) {
    for (const match of rule.body.matchAll(BARE_VAR)) {
      const name = match[1] as string;
      if (declared.has(name)) continue;
      const bucket = found.get(name) ?? new Set<string>();
      bucket.add(rule.selector);
      found.set(name, bucket);
    }
  }

  return {
    declared: declared.size,
    dangling: [...found]
      .map(([name, selectors]) => ({ name, selectors: [...selectors].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
