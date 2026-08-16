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
 * #24 第一次量顏色數量時寫的 grep 認不得 Tailwind v4 的 `text-(--var)`
 * 語法 —— **它漏掉的正好是唯一被正確代幣化的那一類**，於是數字連錯兩次。
 * 用來量「有沒有代幣化」的工具，第一版看不見代幣。
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
  readonly kind: "builtin" | "palette";
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
 * 判定一個詞是不是違規，是的話回傳它屬於哪一層。
 *
 * ⚠️ **不合法的形狀要列舉，合法的不要列舉**（見檔頭）。所以這裡回答的是
 * 「它是不是原始顏色」，任何認不出來的形狀一律當成合法。
 */
function classify(token: string): PaletteViolation["kind"] | null {
  // `hover:`／`focus-visible:`／`dark:md:` —— 只有最後一段是 utility 本體。
  // 少了這一步，`hover:bg-gray-50` 會被漏掉，而那正是轉換前 secondary 的那一格。
  const utility = token.slice(token.lastIndexOf(":") + 1);

  const dash = utility.indexOf("-");
  if (dash <= 0) return null;
  if (!COLOR_PREFIX_SET.has(utility.slice(0, dash))) return null;

  // `bg-black/40` —— 色相與不透明度分開看，不透明度不影響判定。
  const rest = utility.slice(dash + 1).split("/")[0] ?? "";
  if (rest === "white" || rest === "black") return "builtin";

  // `gray-50`／`brand-600`：最後一段全是數字時，前面那一段才是色階名。
  const lastDash = rest.lastIndexOf("-");
  if (lastDash <= 0) return null;
  // `/^\d+$/` 而不是把字串展開成陣列 —— 展開字串會把 emoji 之類的字元
  // 拆成多個碼點，本 repo 的 lint 對它有話說（`no-misused-spread`），
  // 而這裡只是要問「全都是數字嗎」。
  if (!/^\d+$/.test(rest.slice(lastDash + 1))) return null;

  const ramp = rest.slice(0, lastDash);
  if (BUILTIN_SET.has(ramp)) return "builtin";
  if (PALETTE_SET.has(ramp)) return "palette";
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
export function findPaletteUsage(file: string, source: string): readonly PaletteViolation[] {
  const violations: PaletteViolation[] = [];

  source.split("\n").forEach((text, index) => {
    if (isComment(text)) return;

    for (const token of tokenize(text)) {
      const kind = classify(token);
      if (kind !== null) violations.push({ file, line: index + 1, className: token, kind });
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
