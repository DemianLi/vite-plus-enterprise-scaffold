/**
 * 「元件裡不准出現原始顏色」的判定（HANDOFF #24）。
 *
 * ── 這條規則要擋的是什麼 ────────────────────────────────────────────
 *
 * `platform/ui` 的代幣分兩層：色票（`--color-brand-600`）與語意
 * （`--color-accent`）。元件**只准用第二層**。理由不是整潔，是可換性：
 *
 *   `bg-gray-50`   各案完全換不掉 —— 那是 Tailwind 內建的值，不是我們的代幣
 *   `bg-brand-600` 換得掉，但換的人必須知道「brand-600 在這裡代表強調色」
 *   `bg-accent`    換的人只要知道「強調色」
 *
 * 2026-08-17 轉換之前，元件裡 16 處顏色只有 5 處走代幣，而**預設**的那個
 * variant（`secondary`）一處都沒有。也就是各案換得掉強調色，換不掉
 * 最常出現在畫面上的那顆按鈕。
 *
 * ── 為什麼是自己寫而不是 eslint 規則 ────────────────────────────────
 *
 * 要擋的東西住在 `.vue` 的 `<template>` 的 `class` 屬性裡，以及 `<script>`
 * 裡的字串字面值。eslint 的 vue 解析看得到前者、看不到後者的語意
 *（`VARIANTS` 那張表就是一堆字串），而兩邊都要守。字串比對在這裡
 * 反而是**推導得出來的**那一種（A1）。
 *
 * ⚠️ ── 這支偵測器自己踩過的坑 ───────────────────────────────────────
 *
 * #24 第一次量顏色數量時寫的 grep 認不得 Tailwind v4 那個「括號裡直接放
 * 自訂屬性」的語法（`text-()`）—— **它漏掉的正好是唯一被正確代幣化的那一類**，
 * 於是數字連錯兩次。用來量「有沒有代幣化」的工具，第一版看不見代幣。
 *
 * ⚠️ 上一句刻意只寫括號、不把變數名補進去：補進去它就是一個合法的 utility，
 * 而 Tailwind 連註解一起掃 —— 那句話會把自己編成一條指向不存在變數的規則。
 * 這不是假設，是實測到的（見 css.ts 的 auditReferences）。
 *
 * 所以這裡的判準倒過來寫：**列舉違規的形狀**（內建色階、white/black、
 * 色票層名稱），而不是列舉合法的形狀。漏列一個違規只會少擋一次；
 * 漏列一個合法形狀會擋掉正確的程式碼，然後有人把整條規則關掉。
 */

/**
 * Tailwind v4 內建色階的名字。這份清單漏掉一個的代價只是少擋一次，
 * 所以照官方預設主題抄全，不做「我們大概只會用到 gray」的猜測。
 */
const BUILTIN_RAMPS = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

/** 本 repo 自己的色票層。`bg-danger` 合法（語意），`bg-danger-500` 不合法（色票）。 */
const PALETTE_RAMPS = ["brand", "danger"] as const;

/**
 * ── 第三類：從 shadcn 抄元件時忘了翻譯的代幣 ────────────────────────
 *
 * 這個 repo 用 shadcn 的**模型**（原始碼在自己手上）與它的三個原料，
 * 但**不用它的代幣詞彙**：它的 `--primary` 在這裡叫 `--color-accent`，
 * `--muted-foreground` 叫 `--color-fg-muted`（見 HANDOFF 承諾三）。
 *
 * 抄一個元件進來的時候，翻譯表有十幾條。**忘掉其中一條，那一格顏色就
 * 換不掉** —— 而前兩類都抓不到它：它不是內建色階，也不是色票層，
 * 它是一個「合法但不是我們的」名字。
 *
 * ⚠️ **判準不是「shadcn 的詞彙全部擋掉」。** `accent` 兩邊剛好同名，
 * 那樣寫會把 `bg-accent`（元件裡用了 19 次的合法寫法）全部誤報。
 * 判準是 **shadcn 的詞彙 減去 我們 `@theme` 裡真的宣告過的名字** ——
 * 碰撞的自動被排除，而且那一半是**推導**出來的，不是手抄的。
 *
 * ⚠️ 那份 `@theme` 由 `cli.ts` 從 `platform/ui/src/styles/index.css` 讀進來，
 * 不寫死在這裡。寫死的話，改一個代幣名（`--color-muted` → `--color-fg-muted`
 * 真的發生過）就會讓這道檢查**靜靜地開始誤報或漏報**。
 */

/**
 * shadcn 的代幣詞彙。**手抄的上游事實**，與 `BUILTIN_RAMPS` 同一個理由：
 * 漏列一個的代價只是少擋一次，所以照抄不做「我們大概只會用到某幾個」的猜測。
 *
 * ⚠️ 只收**顏色**代幣。`--radius` 不在這裡 —— 它在我們這邊是
 * `--radius-control`／`--radius-surface`，而形狀那一半的翻譯還沒有累積到
 * 值得列舉的程度（第一類與第二類也都只守顏色）。
 */
const SHADCN_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

/**
 * 上游名 → 我們的名字。**紅燈訊息必須說得出替代品**：少了它，最短的修法
 * 是把上游名字加進 `@theme`，而那正好是錯的方向（多一層沒有人用的代幣）。
 *
 * ⚠️ **這張表與 `SHADCN_TOKENS` 的失敗方向不同，所以守法也不同。**
 * 詞彙表漏一個 → 少擋一次。**這裡的目標寫錯 → 訊息把人送去一個不存在的
 * 代幣**，那是錯的方向不是漏掉。所以 `tests/palette.test.ts` 有一條斷言
 * 每個目標都真的出現在 `index.css` 的 `@theme` 裡 ——
 * `--color-muted` → `--color-fg-muted` 那次改名證明這個風險是真的。
 */
const TRANSLATION: Readonly<Record<string, string>> = {
  background: "--color-surface",
  foreground: "--color-fg",
  card: "--color-surface",
  "card-foreground": "--color-fg",
  popover: "--color-surface",
  "popover-foreground": "--color-fg",
  primary: "--color-accent",
  "primary-foreground": "--color-on-accent",
  muted: "--color-surface-hover",
  "muted-foreground": "--color-fg-muted",
  "accent-foreground": "--color-on-accent",
  destructive: "--color-danger",
  "destructive-foreground": "--color-on-danger",
  border: "--color-line",
  input: "--color-line",
  ring: "--color-focus",
};

const SHADCN_SET = new Set<string>(SHADCN_TOKENS);

/**
 * 這個上游代幣在我們這裡叫什麼；沒有單一對應時回傳 `null`。
 *
 * ⚠️ **`secondary` 與 `sidebar-*`／`chart-*` 刻意沒有對應。** 前者在這裡不是
 * 一個顏色代幣而是一組 class（`border-control border-accent bg-surface`），
 * 後兩者這個 repo 根本沒有那個概念。**硬給一個對應比不給更糟** ——
 * 它會讓人以為換掉那一個代幣就等價，而實際上少了三格。
 */
export function translationFor(token: string): string | null {
  return TRANSLATION[token] ?? null;
}

/** 給測試用：驗每個翻譯目標都真的存在。 */
export const TRANSLATION_TARGETS: readonly string[] = [...new Set(Object.values(TRANSLATION))];

/**
 * 從 `index.css` 的 `@theme` 區塊解析出我們宣告過的顏色代幣名。
 *
 * ⚠️ **只取 `--color-*`，而且去掉那個前綴** —— 比對的對象是 shadcn 的
 * 裸名（`primary`、`muted-foreground`）。
 */
export function declaredColorTokens(css: string): ReadonlySet<string> {
  const start = css.indexOf("@theme");
  if (start < 0) return new Set<string>();

  const names = new Set<string>();
  for (const line of css.slice(start).split("\n")) {
    const match = /^\s*--color-([a-z0-9-]+)\s*:/.exec(line);
    if (match?.[1] !== undefined) names.add(match[1]);
  }
  return names;
}

/**
 * 吃顏色的 utility 前綴。
 *
 * ⚠️ 只列**顏色**的。`rounded-lg`／`text-sm`／`shadow-xl` 不在這裡 ——
 * 那些是尺寸與字級，屬於「版型」那一半，刻意留給 platform 集中管
 *（見 UiButton.vue 對 SIZES 的說明）。把它們一起擋掉會逼出一堆
 * `--spacing-control-sm-padding` 這種代幣，那是 D16 說的過度設計。
 */
const COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "outline",
  "ring",
  "fill",
  "stroke",
  "divide",
  "accent",
  "caret",
  "decoration",
  "shadow",
  "from",
  "via",
  "to",
] as const;

export interface PaletteViolation {
  /** 相對於 repo 根目錄的路徑。 */
  readonly file: string;
  /** 1 起算。 */
  readonly line: number;
  /** 命中的完整類別，含 variant 前綴（例如 `hover:bg-gray-50`）。 */
  readonly className: string;
  readonly kind: "builtin" | "palette" | "untranslated";
  /**
   * 第三類專用：命中的**上游裸代幣名**（`primary`、`muted-foreground`），
   * 前兩類是 `null`。
   *
   * ⚠️ 帶在這裡而不是讓 `cli.ts` 從 `className` 再解析一次 —— 那會是同一段
   * 剖析的第二份手抄本（去掉 variant 前綴、取第一個連字號之後、丟掉
   * `/opacity`），而這個 repo 栽在「兩份手抄本沒有東西斷言它們一致」上
   * 已經很多次。訊息與判定看到的一定是同一個名字。
   */
  readonly upstream: string | null;
}

const COLOR_PREFIX_SET = new Set<string>(COLOR_PREFIXES);
const BUILTIN_SET = new Set<string>(BUILTIN_RAMPS);
const PALETTE_SET = new Set<string>(PALETTE_RAMPS);

/**
 * ⚠️ ── 為什麼是切詞＋查表，不是正則 ──────────────────────────────────
 *
 * 第一版把三個色階清單 `join("|")` 拼進 `new RegExp`。它會動，但本 repo 的
 * SAST 對它有話說，而且**兩句都是對的**：
 *
 *   - `security/detect-non-literal-regexp`：用字串拼出來的正則，
 *     光看它那一行看不出它會匹配什麼
 *   - `security/detect-unsafe-regex`：`(?:[a-z-]+:)*` 接 `[a-z]` 是有歧義的
 *     巢狀量詞，最壞情況會回溯爆炸
 *
 * 而這件事本來就不需要正則：類別名稱的結構是固定的
 * （`variant:` 前綴 ＋ `前綴-其餘`），切開來查表就好 —— 線性、看得懂、
 * 而且每一步都能單獨測。
 */

/** 切出「看起來像類別名稱」的詞。`:`（variant）與 `/`（不透明度）留在詞裡。 */
function tokenize(line: string): readonly string[] {
  return line.split(/[^A-Za-z0-9:/_-]+/).filter((token) => token.length > 0);
}

/**
 * 這個裸名是不是「shadcn 有、而我們沒宣告」的那一類。
 *
 * ⚠️ **減法在這裡，不在常數表裡。** 兩邊同名的（今天只有 `accent`）自動
 * 被排除，所以清單是推導出來的 —— 加一個 `--color-input` 到 `@theme` 的
 * 那天，`border-input` 就自動變成合法的，不必記得回來改這支檔案。
 */
function isUntranslated(name: string, declared: ReadonlySet<string>): boolean {
  return SHADCN_SET.has(name) && !declared.has(name);
}

/**
 * 判定一個詞是不是違規，是的話回傳它屬於哪一層。
 *
 * ⚠️ **不合法的形狀要列舉，合法的不要列舉**（見檔頭）。所以這裡回答的是
 * 「它是不是原始顏色」，任何認不出來的形狀一律當成合法。
 */
interface Classified {
  readonly kind: PaletteViolation["kind"];
  readonly upstream: string | null;
}

function classify(token: string, declared: ReadonlySet<string>): Classified | null {
  // `hover:`／`focus-visible:`／`dark:md:` —— 只有最後一段是 utility 本體。
  // 少了這一步，`hover:bg-gray-50` 會被漏掉，而那正是轉換前 secondary 的那一格。
  const utility = token.slice(token.lastIndexOf(":") + 1);

  // ⚠️ **裸代幣名要在 `dash <= 0` 之前攔。** Tailwind v4 的任意屬性語法
  // （前綴後面接一對括號、裡面放代幣名）被 tokenize 切成兩個詞：`bg-` 與
  // 裸代幣名。而後者的第一個連字號在 index 0 —— 落到下面那行就被當成
  // 「不是類別名」丟掉。
  //
  // ⚠️ 上一句刻意不把那個語法寫完整，理由見檔頭最後一段：Tailwind 連註解
  // 一起掃，寫完整就是在這裡編出一條指向不存在代幣的規則。
  // **寫這一格的時候真的踩了一次**，`auditReferences` 當場紅（C104 §三）。
  //
  // 這一格不是補完性的：檔頭記著第一次量顏色的 grep 認不得那個語法，
  // 而**它漏掉的正好是唯一被正確代幣化的那一類**。同一個語法，同一個漏法。
  //
  // ⚠️ 用**完整相等**而不是前綴比對：我們自己有 `--border-width-control`，
  // 而 shadcn 有 `--border`。前綴比對會把自己的形狀代幣報成違規。
  if (utility.startsWith("--")) {
    const bare = utility.slice(2);
    return isUntranslated(bare, declared) ? { kind: "untranslated", upstream: bare } : null;
  }

  const dash = utility.indexOf("-");
  if (dash <= 0) return null;
  if (!COLOR_PREFIX_SET.has(utility.slice(0, dash))) return null;

  // `bg-black/40` —— 色相與不透明度分開看，不透明度不影響判定。
  const rest = utility.slice(dash + 1).split("/")[0] ?? "";
  if (rest === "white" || rest === "black") return { kind: "builtin", upstream: null };

  // ⚠️ **這一格必須在數字後綴那段之前。** `bg-primary` 的 `rest` 一個連字號
  // 都沒有，`bg-muted-foreground` 的最後一段不是數字 —— 兩者都會被下面
  // 那兩行 `return null` 丟掉。放到後面去就是一道**永遠跑不到**的檢查。
  if (isUntranslated(rest, declared)) return { kind: "untranslated", upstream: rest };

  // `gray-50`／`brand-600`：最後一段全是數字時，前面那一段才是色階名。
  const lastDash = rest.lastIndexOf("-");
  if (lastDash <= 0) return null;
  // `/^\d+$/` 而不是把字串展開成陣列 —— 展開字串會把 emoji 之類的字元
  // 拆成多個碼點，本 repo 的 lint 對它有話說（`no-misused-spread`），
  // 而這裡只是要問「全都是數字嗎」。
  if (!/^\d+$/.test(rest.slice(lastDash + 1))) return null;

  const ramp = rest.slice(0, lastDash);
  if (BUILTIN_SET.has(ramp)) return { kind: "builtin", upstream: null };
  if (PALETTE_SET.has(ramp)) return { kind: "palette", upstream: null };
  return null;
}

/**
 * 註解行。剔除它是因為這一份檔案的檔頭就寫著違規類別當反例，而元件的
 * docblock 也會提到轉換前用的是哪些類別 —— 抓到那些的話，規則會在
 * 「解釋自己」的句子上紅，然後被關掉。
 */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("<!--");
}

/**
 * 掃一份元件原始碼。
 *
 * 收的是**內容**而不是路徑：讀檔留在 cli.ts，這裡保持純函式，才有辦法
 * 用人造來源把每一種違規都測過一次（與 exit-drill 的兩張帳目同一個切法）。
 */
export function findPaletteUsage(
  file: string,
  source: string,
  declared: ReadonlySet<string>,
): readonly PaletteViolation[] {
  const violations: PaletteViolation[] = [];

  source.split("\n").forEach((text, index) => {
    if (isComment(text)) return;

    for (const token of tokenize(text)) {
      const hit = classify(token, declared);
      if (hit !== null) {
        violations.push({ file, line: index + 1, className: token, ...hit });
      }
    }
  });

  return violations;
}

/**
 * 元件**真的用到**的類別名稱（已剔除註解行）。
 *
 * ── 為什麼建置比對需要這一份 ────────────────────────────────────────
 *
 * Tailwind 掃 `.ts` 時**連註解一起掃**。所以「產物裡有沒有這條 utility」
 * 這種斷言，可以被任何一份檔案的註解餵飽 —— 包括寫這道檢查的那份。
 *
 * 實測到的具體情形：cli.ts 裡一句「不要把選擇器寫死在這裡」的**警告本身**
 * 含有那個選擇器，於是即使把元件裡的用法整條刪掉，那條規則仍然存在，
 * 檢查照樣全綠。警告的那句話讓它警告的事情發生了。
 *
 * 所以建置那一半在比對之前，先用這份清單把「元件真的有在用的」濾出來。
 */
export function usedClassNames(source: string): ReadonlySet<string> {
  const names = new Set<string>();

  for (const line of source.split("\n")) {
    if (isComment(line)) continue;
    for (const token of tokenize(line)) {
      // 只收 utility 本體（去掉 `hover:` 這類 variant 前綴），因為產物裡的
      // 選擇器就是拿它比對的。
      const utility = token.slice(token.lastIndexOf(":") + 1);
      // 至少含一個連字號 —— Tailwind 的 utility 幾乎都長這樣，
      // 而少了這個條件會把 `computed`、`props` 這種識別字全收進來。
      if (utility.includes("-")) names.add(utility);
    }
  }

  return names;
}
