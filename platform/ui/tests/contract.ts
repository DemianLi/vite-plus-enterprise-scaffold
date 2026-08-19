/**
 * 元件契約的判定函式。
 *
 * ── 契約是什麼 ──────────────────────────────────────────────────────
 *
 * 「設計稿上的一塊東西 → 元件裡的哪一格」這條對應，在這個 repo 分三軸：
 * **值**走代幣、**形狀**走具名槽、**結構**走 slot。前後兩軸已經有人在守
 * （`tools/theme-verify` 守代幣、`tools/api-surface` 守 slot 宣告與模板一致），
 * 中間那一軸在 2026-08-17 之前**沒有** —— 而 `UiDialog` 就是漏掉它的證據：
 * 它的寬度與位置寫死在模板裡，任何案子都換不掉，而沒有任何東西說話。
 *
 * ── 為什麼判定函式與讀檔要分開 ──────────────────────────────────────
 *
 * 這裡收的是**原始碼字串**，讀檔留在 `component-contract.test.ts`。
 * 與 `tools/theme-verify` 的 `palette.ts`／`cli.ts` 同一個切法，理由也同一個：
 * 只驗真實檔案的話，「該紅沒紅」那半邊永遠測不到 —— 一個 `return true`
 * 就能讓整組斷言變綠。分開之後每一條違規都能用人造來源證明它會紅。
 *
 * ── 這裡刻意**不**守的東西 ──────────────────────────────────────────
 *
 * **「接縫夠不夠」不是靜態事實。** 一個元件該開幾個槽、哪幾塊該讓各案換掉，
 * 是設計判斷，由 `CODEOWNERS` 與 PR 審查回答。假裝靜態檢查守得住它，
 * 具體會長成「每一塊 class 都必須有槽」那種規則 —— 然後 `UiDialog` 那兩個
 * 排版用的 `<div>` 會被逼出沒有人會覆寫的槽名，然後有人加例外，
 * 然後例外永遠不會拿掉（C41）。
 *
 * 守得住的只有兩件事：**有沒有接縫**，以及**接縫有沒有漂**。
 */

/**
 * 註解行。剔除它是因為 `UiButton` 的 docblock 就在解釋為什麼 props 不能寫成
 * `UiVariant` 別名 —— 那句話本身含有那個別名，抓到它的話規則會在
 * 「解釋自己」的句子上紅。與 `tools/theme-verify` 的 palette.ts 同一條理由。
 */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("<!--")
  );
}

/** 去掉整行註解。刻意不處理行尾註解 —— 少剔一種只會少擋一次，多剔會吃掉程式碼。 */
export function stripComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !isComment(line))
    .join("\n");
}

/**
 * 切出一段以 `head` 起頭、以 `close` 收尾的區塊，找不到就丟。
 *
 * 用 `throw` 而不是回傳 null：回傳 null 的話呼叫端會拿到一個空集合去比對，
 * 而空集合對空集合是相等的 —— 也就是「錨點移位」會讓整條斷言安靜地變成恆真。
 * 那正是這一整組檢查最可能失效的方式。
 */
function block(source: string, head: string, close: string): string {
  const start = source.indexOf(head);
  if (start < 0) throw new Error(`找不到區塊起點：${head}`);
  const from = start + head.length;
  const end = source.indexOf(close, from);
  if (end < 0) throw new Error(`找不到區塊終點：${head} … ${close}`);
  return source.slice(from, end);
}

// ─────────────────────────────────────────────────────────────────────────────
// 條文 ① 每個元件檔都必須被 index.ts 匯出
// ─────────────────────────────────────────────────────────────────────────────

export interface ComponentExport {
  /** `export { default as UiButton }` 的那個名字。 */
  readonly exportedAs: string;
  /** `./components/UiButton.vue` 的 `UiButton`。 */
  readonly file: string;
}

/**
 * 一個沒有被匯出的元件是**寫了但沒有人用得到**的元件 —— 它不在 `api-surface`
 * 的公開面裡，所以改壞它不會有任何閘門說話，而它仍然會被 Tailwind 的
 * `@source` 掃到、把類別編進產物。症狀是 CSS 變大而畫面沒變。
 */
export function componentExports(indexSource: string): readonly ComponentExport[] {
  const found: ComponentExport[] = [];
  const pattern = /export \{ default as (\w+) \} from "\.\/components\/(\w+)\.vue";/g;
  for (const match of stripComments(indexSource).matchAll(pattern)) {
    found.push({ exportedAs: match[1] as string, file: match[2] as string });
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// 條文 ② 每個元件都必須有一組具名槽
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `UiThemeOverride` 裡每一格：元件名 → 那一格的槽型別名。
 *
 * 例如 `readonly UiButton?: Readonly<Partial<Record<UiButtonSlot, string>>>;`
 * 會回傳 `UiButton → UiButtonSlot`。
 */
export function declaredSlotTypes(themeSource: string): ReadonlyMap<string, string> {
  const body = block(stripComments(themeSource), "export type UiThemeOverride = {", "};");
  const declared = new Map<string, string>();
  const pattern = /readonly (\w+)\?: Readonly<Partial<Record<(\w+), string>>>;/g;
  for (const match of body.matchAll(pattern)) {
    declared.set(match[1] as string, match[2] as string);
  }
  return declared;
}

// ─────────────────────────────────────────────────────────────────────────────
// 條文 ③ 宣告的槽 ＝ 預設表的鍵 ＝ 元件真的讀到的
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 解析一個字串 union 的成員，**會跟著別名往下走**。
 *
 * `UiButtonSlot = UiVariant | UiSize` 要能解析成六個字串，否則這條斷言
 * 對 `UiButton` 就是空對空。深度用 `seen` 擋住循環引用 ——
 * `type A = B; type B = A` 編不過，但這支函式會先無窮遞迴，
 * 而那個症狀（測試跑不完）比一條紅線難查得多。
 */
export function resolveUnion(
  themeSource: string,
  typeName: string,
  seen: ReadonlySet<string> = new Set(),
): readonly string[] {
  if (seen.has(typeName)) throw new Error(`型別別名循環引用：${typeName}`);

  const clean = stripComments(themeSource);
  /**
   * ⚠️ 錨點是 `export type X =`（**不含後面那個空格**）。
   *
   * 第一版寫成 `… = `，於是格式化器把一個長 union 換行成
   *
   *     export type UiDatePickerSlot =
   *       | "field"
   *       | …
   *
   * 之後就整個找不到 —— 而 `block()` 是丟例外的，所以症狀是紅燈不是恆真
   *（那一步當初就選對了）。但訊息會說「找不到區塊起點」，指向錨點而不是
   * 真正的原因：**這支解析假設了 union 與 `=` 在同一行**。
   *
   * 那個假設不是規則，只是當時的元件剛好都夠短。`UiDatePicker` 有八格。
   */
  const body = block(clean, `export type ${typeName} =`, ";");

  const members: string[] = [];
  // 換行式的 union 開頭會有一個空的前導 `|`，切出來是空字串 —— 跳過它。
  // ⚠️ 不能用 filter(Boolean) 一了百了：那樣連「真的解析不出東西」也會
  // 安靜地變成空集合，而空集合對空集合是相等的（見 block() 的說明）。
  for (const part of body.split("|")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const literal = /^"([^"]+)"$/.exec(trimmed);
    if (literal !== null) {
      members.push(literal[1] as string);
      continue;
    }
    // 不是字串字面值就當成別名往下走。認不出來的形狀（泛型、交集）
    // 會在遞迴時因為找不到 `export type X = ` 而丟，不會安靜地少算成員。
    members.push(...resolveUnion(clean, trimmed, new Set([...seen, typeName])));
  }

  /**
   * ⚠️ 解析不出任何成員一律丟例外。
   *
   * 上面那個「跳過空字串」是為了換行式 union 的前導 `|`，但它同時打開了一個
   * 洞：一個怎麼也解析不出東西的 union 會回傳空陣列，而呼叫端拿空集合去比
   * 另一個空集合 —— **恆真**。這正是 `block()` 那段說明在防的事，
   * 只是換了一個位置重新出現。
   */
  if (members.length === 0) {
    throw new Error(`${typeName} 解析不出任何成員 —— 空集合對空集合會恆真`);
  }
  return members;
}

/**
 * 元件裡所有樣式表的鍵**聯集**。
 *
 * 慣例是 `const NAME: Readonly<Record<槽型別, string>> = { … }` ——
 * `UiButton` 有兩張（`VARIANTS`／`SIZES`），`UiDialog` 有兩張
 * （`DEFAULT_PARTS` 與解析後的 `parts`，兩張的型別註記一樣）。
 *
 * ── 這條條文真正買到的是什麼 ────────────────────────────────────────
 *
 * **不是**「表有沒有少一個鍵」—— `Record<X, string>` 是滿的，少一個鍵
 * TypeScript 自己就會擋。買到的是**跨檔案的那一段**：`theme.ts` 的
 * `UiThemeOverride` 宣告了哪些槽，與元件裡真的有表的槽，兩者對不上時
 * 型別完全合法（`theme.UiButton?.[props.variant]` 照樣編得過），
 * 而新加的那個槽**靜靜地什麼都不做**。
 *
 * 回傳 Set 而不是陣列：一個元件可以有好幾張同型別的表，重複出現不是違規。
 */
export function defaultSlotKeys(componentSource: string): ReadonlySet<string> {
  const clean = stripComments(componentSource);
  const keys = new Set<string>();
  const tables = /const \w+: Readonly<Record<\w+, string>> = \{([^}]*)\}/g;
  for (const table of clean.matchAll(tables)) {
    for (const key of (table[1] as string).matchAll(/^\s*(\w+):/gm)) {
      keys.add(key[1] as string);
    }
  }
  return keys;
}

/**
 * 同樣掃那幾張表，但拿的是**值**（class 字串），不是鍵。
 *
 * 存在的理由只有一個：有些條文問的是「這一格的 class 字串裡有沒有某個
 * utility」，而 `defaultSlotKeys` 把值丟掉了。
 *
 * ⚠️ **這裡的 `stripComments` 是一致性，不是防線 —— 實測過。**
 *
 * 起初的理由寫的是「`UiSkeleton` 的檔頭含有 `motion-reduce:animate-none`
 * 這個字串，不去註解會讓條文被自己的說明滿足」。**那是錯的**：拿掉
 * `stripComments` 再把真的那條 class 從預設表刪掉，條文照樣紅。
 *
 * 真正把註解擋在外面的是另外兩層：外層只掃 `= { … }` **區塊內部**（檔頭在
 * 邊界外），內層要求 `key: "value"` 的**形狀**（`//` 或 `*` 開頭的行匹配不
 * 到）。留著 `stripComments` 是為了與 `defaultSlotKeys` 同形、成本為零，
 * 不是因為少了它會漏。
 *
 * ⚠️ 而它擋不住的那個形狀要說清楚，否則下一個人會以為有保護：**多行註解
 * 裡沒有 `*` 前綴的那幾行**（`isComment` 判 false）如果剛好長成
 * `slot: "…"`，兩層都攔不到。真要守就得認得字串與註解的邊界，那是
 * `styles.test.ts` 的去註解器在做的事，不是這裡這個正則。
 *
 * ⚠️ 而下面那條「後出現的為準」在這件事上是**半個防線**（實測，見
 * `a11y.test.ts` 的已知破口那條）：註解掉的舊值排在真值**前面**時被真值蓋掉
 * （安全），排在**後面**時反過來蓋掉真值（漏）。動這條合併規則之前要知道
 * 它現在順手擋著一半。
 *
 * 一個元件有好幾張同型別的表時（`UiButton` 的 `VARIANTS`／`SIZES`），
 * 同名鍵以**後出現的**為準 —— 這個函式的用途是逐條掃 utility，
 * 不是還原解析順序，所以合併規則只要不丟資料就夠。
 */
export function defaultSlotValues(componentSource: string): ReadonlyMap<string, string> {
  const clean = stripComments(componentSource);
  const values = new Map<string, string>();
  const tables = /const \w+: Readonly<Record<\w+, string>> = \{([^}]*)\}/g;
  for (const table of clean.matchAll(tables)) {
    for (const entry of (table[1] as string).matchAll(/^\s*(\w+):\s*"([^"]*)"/gm)) {
      values.set(entry[1] as string, entry[2] as string);
    }
  }
  return values;
}

/**
 * 元件真的從覆寫表讀了哪些元件名（`theme.UiButton?.` 的那個名字）。
 *
 * ⚠️ 這一條要擋的是**宣告了槽卻沒接上**：`UiThemeOverride` 加一格、
 * 預設表也寫好，但元件從頭到尾沒有 `inject(UI_THEME)` —— 型別全對、
 * 測試全綠，而各案的覆寫一個字都不會生效。
 */
export function consumedOverrides(componentSource: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of stripComments(componentSource).matchAll(/theme\.(\w+)\?\./g)) {
    names.add(match[1] as string);
  }
  return names;
}

// ─────────────────────────────────────────────────────────────────────────────
// 條文 ⑤ 模板不得直接引用預設表
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 樣式表分兩種，靠**有沒有讀 `theme.`** 分辨：
 *
 *   預設表（`VARIANTS`／`SIZES`／`DEFAULT_PARTS`）  沒讀 → 各案換不掉
 *   解析後的表（`parts`）                          有讀 → 各案換得掉
 *
 * 兩者的型別註記一模一樣，所以名字不能拿來判斷 —— 一個叫 `DEFAULTS` 的表
 * 與一個叫 `parts` 的表，靠命名慣例區分等於沒有區分。
 */
export function styleTables(componentSource: string): ReadonlyMap<string, boolean> {
  const tables = new Map<string, boolean>();
  const pattern = /const (\w+): Readonly<Record<\w+, string>> = \{([^}]*)\}/g;
  for (const match of stripComments(componentSource).matchAll(pattern)) {
    tables.set(match[1] as string, (match[2] as string).includes("theme."));
  }
  return tables;
}

/** `<template>` 的內容。沒有 template 區塊時回傳空字串。 */
export function templateBlock(componentSource: string): string {
  const clean = stripComments(componentSource);
  if (!clean.includes("<template>")) return "";
  return block(clean, "<template>", "</template>");
}

/**
 * 模板裡直接引用到的**預設表**名稱。有任何一個就是違規。
 *
 * ── 這一條擋的是一個字的錯 ──────────────────────────────────────────
 *
 * `:class="parts.overlay"` 打成 `:class="DEFAULT_PARTS.overlay"` ——
 * 前面每一條都還是綠的：`parts` 仍然被算出來（③ 有讀 `theme.`）、
 * `DEFAULT_PARTS` 仍然有全部的鍵（③ 鍵對得上）、`UiThemeOverride` 仍然
 * 宣告著那個槽（②）。**而各案的覆寫一個字都不會生效。**
 *
 * 整個 `parts` 被刪掉會被③抓到；打錯一個名字不會。差別在於前者是
 * 「接縫不見了」，後者是「接縫還在，只是沒接上」—— 而後者才是實際會發生的。
 *
 * ⚠️ 這個洞是 `UiDialog` 的**間接**帶出來的（多了 `parts` 這個中間名字）。
 * `UiButton` 有同樣的間接（`classes`），只是它剛好沒寫錯 ——
 * 所以規則寫成通則，不是寫成「UiDialog 必須怎樣」。
 */
export function defaultTablesInTemplate(componentSource: string): readonly string[] {
  const template = templateBlock(componentSource);
  if (template === "") return [];

  const used: string[] = [];
  for (const [name, readsTheme] of styleTables(componentSource)) {
    if (readsTheme) continue;
    // 詞界比對：`PARTS` 不該命中 `DEFAULT_PARTS`，而後者是真正的表名。
    //
    // ⚠️ 迴圈變數叫 `word` 而不是 `token`：Tier 2 的
    // `security/detect-possible-timing-attacks` 會對 `token === …` 出聲，
    // 而它認的是名字。這裡不加豁免 —— **改掉觸發詞比留下一條 disable 好**，
    // 因為 disable 註解會留在檔案裡，而下一個真的在比對認證權杖的人會照抄。
    for (const word of template.split(/[^A-Za-z0-9_]+/)) {
      if (word === name) {
        used.push(name);
        break;
      }
    }
  }
  return used;
}

// ─────────────────────────────────────────────────────────────────────────────
// 條文 ④ props 的 union 必須是字面值
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `defineProps<{ … }>` 的內容（已去掉註解）。沒有 `defineProps` 的元件回傳 null。
 */
export function definePropsBlock(componentSource: string): string | null {
  const clean = stripComments(componentSource);
  if (!clean.includes("defineProps<{")) return null;
  return block(clean, "defineProps<{", "}>");
}

/**
 * props 裡引用到的型別別名。**有任何一個就是違規。**
 *
 * ── 為什麼別名在這裡是錯的 ──────────────────────────────────────────
 *
 * `api-surface` 記錄的是 `defineProps` 的**字面文字**。寫成別名之後，
 * 基準檔會從 `"primary" | "secondary" | …` 變成 `UiVariant` ——
 * 而那之後 **union 少一個成員這道閘門就看不見了**，因為形狀字串沒變。
 * 拿「少寫一次」換一道變弱的閘門，是這個 repo 一路在拆的那種交易。
 *
 * 清單從 `theme.ts` 的匯出**推導**，不是寫死（A1）：新增一個型別別名時
 * 這條規則自動涵蓋它。
 */
export function exportedTypeNames(themeSource: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of stripComments(themeSource).matchAll(/export type (\w+)/g)) {
    names.add(match[1] as string);
  }
  return names;
}

export function aliasesUsedInProps(
  propsBlock: string,
  aliases: ReadonlySet<string>,
): readonly string[] {
  const used: string[] = [];
  for (const match of propsBlock.matchAll(/\b([A-Z]\w*)\b/g)) {
    const name = match[1] as string;
    if (aliases.has(name)) used.push(name);
  }
  return used;
}

// ─────────────────────────────────────────────────────────────────────────────
// 預設值必須是 union 的成員之一
// ─────────────────────────────────────────────────────────────────────────────

/** `withDefaults(…, { variant: "secondary", … })` 裡那些字串預設值。 */
export function stringDefaults(componentSource: string): ReadonlyMap<string, string> {
  const clean = stripComments(componentSource);
  if (!clean.includes("withDefaults(")) return new Map();

  // `}>(),` 之後才是 withDefaults 的第二個參數。用它切，比想辦法讓正則認得
  // 巢狀大括號可靠 —— 而且切不到會丟，不會安靜地比對到空字串。
  const defaults = block(clean, "}>(),", ");");
  const found = new Map<string, string>();
  for (const match of defaults.matchAll(/(\w+):\s*"([^"]*)"/g)) {
    found.set(match[1] as string, match[2] as string);
  }
  return found;
}

/** 某個 prop 宣告的字串字面值成員。沒有這個 prop、或它不是字串 union 時回傳空陣列。 */
export function propUnionMembers(propsBlock: string, prop: string): readonly string[] {
  for (const line of propsBlock.split("\n")) {
    const declared = /^\s*(\w+)\??:\s*(.+);\s*$/.exec(line);
    if (declared === null || declared[1] !== prop) continue;
    return [...(declared[2] as string).matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
  }
  return [];
}
