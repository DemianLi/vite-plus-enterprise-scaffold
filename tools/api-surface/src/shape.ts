import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  API,
  NodeBuilderFlags,
  ObjectFlags,
  SignatureKind,
  SymbolFlags,
  type Checker,
  type Project,
  type Symbol as ApiSymbol,
  type Type,
  type TypeReference,
} from "typescript/unstable/sync";

/**
 * 把 `platform/*` 的公開 export 抽成**型別形狀**。
 *
 * ── 為什麼不是名稱清單 ──────────────────────────────────────────────
 *
 * 這支工具原本只比對「模組 → export 名稱」。2026-08-16 撞到它的盲點：
 * `Feature` 加了一個必填的 `personalData`，下游每一個既有切片都會編譯失敗，
 * 而閘門一聲不吭 —— 名稱一個都沒變，所以它是對的、也是瞎的。
 *
 * 那個欄位當天就隨 C52 回退了，但盲點沒有跟著消失：回退本身
 *（移除必填欄位）是同一種變更，閘門同樣沒有說話。
 *
 * ── TypeScript 7 沒有舊的 compiler API ─────────────────────────────
 *
 * `ts.createProgram` / `ts.createSourceFile` 那一套在 7.0（Go 重寫）不存在，
 * `node_modules/typescript/lib/typescript.js` 這個檔案本身就沒有了。
 * 取而代之的是 `typescript/unstable/sync`：一個跑在 tsgo 行程裡、
 * 透過 IPC 溝通的真 checker。名字裡的 unstable 是真的 —— 升 TypeScript 大版本
 * 時這裡可能要改。這是刻意付的代價：換來的是**消費端真正看到的型別**，
 * 而不是我們自己解析原始碼猜出來的。
 *
 * 實測整份表面約 130–180 ms，在 `vpr gate` 裡可以忽略。
 *（進入點數與 export 數不寫在這裡 —— 跑一次它自己會印，而且那兩個數字
 * 由 `tools/doc-facts` 守著。C53(c)：沒有事實來源的計數不要寫。）
 */

/** 一個 export 的形狀。`members` 存在時比對走成員層級，否則比對 `type` 字串。 */
export interface ExportShape {
  readonly kind: "type" | "class" | "component" | "object" | "function" | "value" | "names-only";
  /** 成員，格式 `name: type` 或 `name?: type`。**永遠排序過** —— 見下。 */
  readonly members?: readonly string[];
  /** 整體型別字串。沒有成員的 export（常數、函式、陣列）只有這個。 */
  readonly type?: string;
}

export type EntrySurface = Record<string, ExportShape>;

export interface EntryPoint {
  /** 對外的模組名，例如 `@org/slice-kit` 或 `@org/slice-kit/contract`。 */
  readonly key: string;
  /** 該 package 的 tsconfig.json 絕對路徑；沒有的話代表只能記名稱。 */
  readonly config: string | undefined;
  /** 進入點檔案絕對路徑。 */
  readonly file: string;
}

/**
 * 成員一律排序後才記錄。
 *
 * 實測：把 `Feature` 的兩個屬性對調位置，未排序的版本會漂移 —— 而屬性順序
 * 對消費端沒有任何意義。這種假警報只要出現一次，下一次就會有人在 CI 加例外。
 */
function sortMembers(members: readonly string[]): string[] {
  return [...members].sort((a, b) => a.localeCompare(b));
}

const PRINT = NodeBuilderFlags.NoTruncation;

/**
 * `getTypeOfSymbol` / `getDeclaredTypeOfSymbol` 都可能回 `undefined`。
 *
 * 用 `?? someFallback` 帶過去的話，那個 export 的形狀會少一塊，而少的那一塊
 * 之後永遠不會被比對到 —— 一個安靜的破洞。這裡一律丟例外：
 * 抽不出形狀就讓整道閘門紅，不要交出一份看起來完整的殘缺快照。
 */
function typeOf(checker: Checker, symbol: ApiSymbol): Type {
  const type = checker.getTypeOfSymbol(symbol);
  if (type === undefined) throw new Error(`拿不到 ${symbol.name} 的型別 —— 形狀會少一塊`);
  return type;
}

function declaredTypeOf(checker: Checker, symbol: ApiSymbol): Type {
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  if (type === undefined) throw new Error(`拿不到 ${symbol.name} 的宣告型別 —— 形狀會少一塊`);
  return type;
}

function optionalMark(symbol: ApiSymbol): string {
  return (symbol.flags & SymbolFlags.Optional) === SymbolFlags.Optional ? "?" : "";
}

function memberOf(checker: Checker, symbol: ApiSymbol): string {
  const type = typeOf(checker, symbol);
  return `${symbol.name}${optionalMark(symbol)}: ${checker.typeToString(type, undefined, PRINT)}`;
}

/**
 * 索引簽章要單獨抓 —— `getPropertiesOfType` 看不到它們。
 *
 * 少了這幾行，`CookieAttributes`（`readonly [name: string]: string`）與
 * `CspDirectives` 會被記成一個只有自己名字的空形狀：把索引型別從 `string`
 * 改成 `string | number` 完全不會漂移。那是這個 repo 一路在防的那種綠燈。
 */
function indexMembers(checker: Checker, type: Type): string[] {
  return checker.getIndexInfosOfType(type).map((info) => {
    const key = checker.typeToString(info.keyType, undefined, PRINT);
    const value = checker.typeToString(info.valueType, undefined, PRINT);
    return `[index ${key}]${info.isReadonly ? " readonly" : ""}: ${value}`;
  });
}

function signatureMembers(checker: Checker, type: Type, kind: SignatureKind): string[] {
  const label = kind === SignatureKind.Construct ? "new " : "";
  return checker.getSignaturesOfType(type, kind).map((signature) => {
    const params = signature
      .getParameters()
      .map((param) => memberOf(checker, param))
      .join(", ");
    const returns = checker.getReturnTypeOfSignature(signature);
    return `${label}(${params}): ${returns === undefined ? "unknown" : checker.typeToString(returns, undefined, PRINT)}`;
  });
}

/**
 * class 要展開，因為 `typeToString` 對它只會印出 `typeof HttpError`。
 *
 * `@org/http-client` 匯出三個錯誤類別，而每一個切片都會 catch 它們。
 * 不展開的話，替建構子加一個必填參數、或改一個方法的簽章，記錄下來的字串
 * 一個字都不會變 —— 與 `.vue` 的 shim 同一種瞎法，只是發生在一個
 * 更常被用到的 package 裡。
 */
function classShape(checker: Checker, symbol: ApiSymbol): ExportShape {
  const staticType = typeOf(checker, symbol);
  const instanceType = declaredTypeOf(checker, symbol);
  const members = [
    ...signatureMembers(checker, staticType, SignatureKind.Construct),
    ...checker.getPropertiesOfType(instanceType).map((prop) => memberOf(checker, prop)),
    ...indexMembers(checker, instanceType),
  ];
  return { kind: "class", members: sortMembers(members) };
}

/**
 * 印一個非物件型別。
 *
 * ⚠️ **不能直接 `typeToString`。** 對 `type UiVariant = "a" | "b"` 來說，
 * 那個型別自己帶著 aliasSymbol，於是 `typeToString` 回傳的是
 * **`"UiVariant"` 這個名字本身** —— 一個把自己的名字當成自己形狀的條目。
 * 改名會被抓到（鍵變了），但改內容不會，而改內容才是破壞下游的那一種。
 *
 * 所以聯集逐一印出成員再接起來。順序由 checker 決定（字面值聯集會被
 * 正規化成字典序，不是宣告順序），對比對來說只要**穩定**就夠了。
 */
function printNonObject(checker: Checker, type: Type): string {
  if (type.isUnionType()) {
    return type
      .getTypes()
      .map((member) => checker.typeToString(member, undefined, PRINT))
      .join(" | ");
  }
  return checker.typeToString(type, undefined, PRINT);
}

function typeShape(checker: Checker, symbol: ApiSymbol): ExportShape {
  const declared = declaredTypeOf(checker, symbol);

  /*
   * ⚠️ 非物件型別必須在展開成員**之前**攔下來。
   *
   * 字面值聯集（`"sm" | "md"`）的每一個成員都是 string，於是
   * `getPropertiesOfType` 回傳的是整套 `String.prototype`。實測：
   * `@org/ui` 的 `UiVariant` 記成 123 行的 `charAt`／`blink`／`fontcolor`，
   * 而 **union 本身一個字都沒有記到**。
   *
   * 所以那道守衛是裝飾品：把 `"primary" | "secondary"` 改成 `"primary"`，
   * 記錄下來的形狀**完全一樣** —— 與 `.vue` 的 shim 同一種瞎法，
   * 只是這次發生在一個看起來已經記了很多東西的條目上。
   *
   * 這條界線在這份檔案裡已經寫過兩次（`walkNamedTypes`、`carriesSignatures`
   * 都寫著「字面量與陣列往下走會撞到 String / Array 自己的方法」），
   * 只有這裡漏了。介面與物件型別不受影響，仍然逐一展開成員。
   */
  if (!declared.isObjectType() || checker.isArrayType(declared) || checker.isTupleType(declared)) {
    return { kind: "type", type: printNonObject(checker, declared) };
  }

  const members = [
    ...checker.getPropertiesOfType(declared).map((prop) => memberOf(checker, prop)),
    ...indexMembers(checker, declared),
    ...signatureMembers(checker, declared, SignatureKind.Call),
  ];
  if (members.length > 0) return { kind: "type", members: sortMembers(members) };
  // 沒有成員的型別別名（聯集、字面量、對映型別）—— 字串本身就是完整的形狀。
  return { kind: "type", type: checker.typeToString(declared, undefined, PRINT) };
}

// ── `.vue` 元件 ───────────────────────────────────────────────────────

/**
 * `declare module "*.vue"` 讓 Node 與 tsgo 都看不見元件的真實型別。
 *
 * 實測：替 `UiButton` 加一個**必填** prop `ariaLabel`，checker 回報的型別
 * 與加之前一字不差 —— 兩個元件都是
 * `DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>`，
 * 連彼此都分不出來。
 *
 * 這個 repo 沒有 vue-tsc 可以用：vue-tsc 建在 TypeScript 6 以前的
 * compiler API 上，而 TS 7 把那個 API 拿掉了。所以這裡直接讀 SFC 的
 * `defineProps` / `defineModel` / `defineSlots` / `defineEmits`。
 *
 * ⚠️ **這是文字解析，涵蓋範圍必須寫死而不是盡力而為。** 元件的公開面
 * 除了 props 還有 emits、slots、expose；只認 props 卻記成一份完整形狀，
 * 就是「看起來有守、其實沒守」。
 */

/**
 * `<script setup>` 裡唯一「不宣告就真的洩不出去」的巨集。
 *
 * ── 為什麼三個變成一個（2026-08-17）───────────────────────────────────
 *
 * 原本 `defineEmits` / `defineSlots` / `defineExpose` 三個都丟例外，理由寫著
 * 「元件的公開面不只 props」。那句話是對的，但**那道絆線綁錯了東西**：
 * 它絆的是「巨集的名字出現在原始碼裡」，不是公開面本身。實測（fixture 元件）：
 *
 *   在 `<template>` 加一個具名 slot 與一個預設 slot   → 閘門**全綠**
 *   在 `<template>` 加 `@click="$emit('picked', label)"` → 閘門**全綠**
 *
 * 兩者都是真的公開面，兩者都不需要那三個巨集。而 `UiDialog` 從落地那天起
 * 就有三個沒被記錄的 slot（`default`／`footer`／`close`），兩個切片正在用
 * `#close` —— 也就是這道「保護」擋著的是宣告，不是變更。
 *
 * `defineExpose` 不一樣：`<script setup>` 預設是**封閉**的，沒有這個巨集，
 * 一個實例成員都洩不出去。它的絆線是真的，所以留著。
 *
 * 三個裡兩個是裝飾品，一個是真的 —— 差別在於那個東西**能不能不經宣告就存在**。
 */
const SFC_UNSUPPORTED = ["defineExpose"] as const;

const DEFINE_PROPS = /defineProps<\{([\s\S]*?)\}>\(\)/;
const DEFINE_SLOTS = /defineSlots<\{([\s\S]*?)\}>\(\)/;
const DEFINE_EMITS = /defineEmits<\{([\s\S]*?)\}>\(\)/;
const DEFINE_MODEL = /defineModel<([^>]+)>\(\s*"([^"]+)"/g;
const LOCAL_TYPE = /^\s*type\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/gm;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(^|[^:])\/\/[^\n]*/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const TEMPLATE_BLOCK = /<template[^>]*>([\s\S]*)<\/template>/;
const SLOT_TAG = /<slot\b([^>]*)>/g;
const EMIT_CALL = /\$?\bemit\(\s*(["'])([^"']*)\1/g;
const EMIT_ANY = /\$?\bemit\(/g;

/**
 * 把一個型別字面值的內容切成成員。
 *
 * ⚠️ **不能用 `split(";")`。** slot 的正規寫法是方法簽章、一行一個、
 * 常常連分號都不寫：
 *
 *   defineSlots<{
 *     default(): VNode[]
 *     footer(): VNode[]
 *   }>()
 *
 * 而 prop 的型別裡本來就可能有分號（`meta?: { a: string; b: number }`）。
 * 兩邊都要對，所以這裡做真的括號配對，只在**深度 0** 的 `;` 或換行切開 ——
 * 與 `tools/theme-verify/src/css.ts` 學到的是同一件事：切錯的那幾個成員
 * 不會報錯，它們會安靜地從記錄裡消失。
 */
function splitMembers(block: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < block.length; i++) {
    const char = block[i];
    if (char === "{" || char === "[" || char === "(" || char === "<") {
      depth++;
    } else if (char === "}" || char === "]" || char === ")") {
      depth--;
      // `=>` 的 `>` 不是泛型的結尾。少了這個判斷，箭頭函式型別會把深度算成負的，
      // 而負深度的下一個 `;` 就切不開了。
    } else if (char === ">" && depth > 0 && block[i - 1] !== "=") {
      depth--;
    } else if ((char === ";" || char === "\n") && depth === 0) {
      parts.push(block.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(block.slice(start));

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

const TIGHTEN = /\s+/g;

/** `name(…)` 或 `name: …` 或 `"name": …` → 名字與其餘。認不出來就回 undefined。 */
function splitDeclaration(member: string, separator: "(" | ":"): [string, string] | undefined {
  let name: string;
  let rest: string;

  if (member.startsWith('"')) {
    const close = member.indexOf('"', 1);
    if (close === -1) return undefined;
    name = member.slice(1, close);
    rest = member.slice(close + 1).trim();
    if (separator === ":") {
      if (!rest.startsWith(":")) return undefined;
      rest = rest.slice(1).trim();
    }
  } else {
    const at = member.indexOf(separator);
    if (at <= 0) return undefined;
    name = member.slice(0, at).trim();
    rest = separator === ":" ? member.slice(at + 1).trim() : member.slice(at).trim();
  }

  if (!/^[A-Za-z_$][\w$:.-]*$/.test(name)) return undefined;
  return [name, rest.replace(TIGHTEN, " ")];
}

/**
 * 認不出來的成員一律丟例外，不是跳過。
 *
 * 跳過的代價是**那個成員從此不在記錄裡**，而不在記錄裡的東西改了不會漂移 ——
 * 又一個「看起來有守」。這裡寧可要求寫法收斂成一種。
 */
function parseBlock(
  file: string,
  kind: "props" | "slots" | "emits",
  block: string,
  expand: (text: string) => string,
): string[] {
  const members: string[] = [];

  for (const member of splitMembers(block)) {
    if (kind === "props") {
      const parsed = /^([A-Za-z_$][\w$]*)(\??)\s*:\s*([\s\S]+)$/.exec(member);
      if (parsed === null) {
        throw new Error(
          `${basename(file)} 的 defineProps 有一段看不懂：\`${member}\`\n` +
            "  只認 `name: 型別` 與 `name?: 型別`。跳過它等於那個 prop 從此不受守護。",
        );
      }
      const [, name, optional, type] = parsed;
      members.push(`${name}${optional}: ${expand((type ?? "").trim().replace(TIGHTEN, " "))}`);
      continue;
    }

    // slot 走方法簽章（Vue 官方寫法），emit 走 3.3 的 tuple 寫法。
    const parsed = splitDeclaration(member, kind === "slots" ? "(" : ":");
    if (parsed === undefined) {
      throw new Error(
        `${basename(file)} 的 define${kind === "slots" ? "Slots" : "Emits"} 有一段看不懂：\`${member}\`\n` +
          (kind === "slots"
            ? "  只認方法簽章 `name(props): 回傳型別`（Vue 官方寫法）。"
            : "  只認 tuple 寫法 `name: [參數: 型別]`（Vue 3.3 起的寫法）。") +
          "\n  跳過它等於那一格從此不受守護。",
      );
    }
    const [name, rest] = parsed;
    members.push(`[${kind === "slots" ? "slot" : "emit"} ${name}]: ${expand(rest)}`);
  }

  return members;
}

/** `<slot>` 的名字。動態名字（`:name`）解析不了，一律丟例外。 */
function templateSlots(file: string, template: string): ReadonlySet<string> {
  const names = new Set<string>();

  for (const match of template.matchAll(SLOT_TAG)) {
    const attributes = match[1] ?? "";
    if (/(^|\s)(:|v-bind:)name[=\s]/.test(attributes)) {
      throw new Error(
        `${basename(file)} 有一個名字是動態的 \`<slot>\`。\n` +
          "  這支解析讀不出它會是哪些名字，而讀不出來就記不進公開面 —— " +
          "請改成固定名字，或先擴充 tools/api-surface/src/shape.ts。",
      );
    }
    const named = /(^|\s)name\s*=\s*"([^"]+)"/.exec(attributes);
    names.add(named?.[2] ?? "default");
  }

  return names;
}

/** `$emit("x")` / `emit("x")` 的事件名。第一個參數不是字面值時丟例外。 */
function emittedNames(file: string, source: string): ReadonlySet<string> {
  const literal = [...source.matchAll(EMIT_CALL)];
  const total = [...source.matchAll(EMIT_ANY)];
  if (literal.length !== total.length) {
    throw new Error(
      `${basename(file)} 有一個 emit 的事件名不是字面值。\n` +
        "  讀不出事件名就記不進公開面，而少記的那一格改了不會漂移。",
    );
  }
  return new Set(literal.map((match) => match[2] as string));
}

function parseComponent(file: string): ExportShape {
  /**
   * 先把註解拿掉，再看有沒有那些巨集。
   *
   * ⚠️ 這一步是被自己絆倒之後才加的：`UiButton.vue` 的說明文字裡寫了一句
   * 「加 `defineEmits` 會讓 api-surface 直接丟例外」，於是這支解析讀到
   * 自己的警語，然後對那個檔案丟了例外。
   *
   * 教訓不是「別在註解裡提巨集名」—— 那正是應該寫在那裡的話。
   * 是**掃原始碼的檢查一律要先剝掉註解**，否則文件與程式碼會互相干擾，
   * 而症狀（一個看起來很正確的錯誤訊息）不會指向真正的原因。
   *
   * ⚠️ HTML 註解是 2026-08-17 補的：新加的 `<template>` 掃描要在那裡面找
   * `<slot>`，而 `UiDialog` 的模板本來就有 `<!-- … -->`。同一個坑，
   * 只是換了一種註解語法。
   */
  const source = readFileSync(file, "utf8")
    .replace(BLOCK_COMMENT, "")
    .replace(LINE_COMMENT, "$1")
    .replace(HTML_COMMENT, "");

  for (const marker of SFC_UNSUPPORTED) {
    if (!source.includes(marker)) continue;
    throw new Error(
      `${basename(file)} 使用了 ${marker}，而這裡不解析它。\n` +
        "  `<script setup>` 預設是封閉的，所以 expose 出去的東西只會來自這個巨集 —— " +
        "記下來的形狀會少掉整個實例面。\n" +
        "  請先擴充 tools/api-surface/src/shape.ts 的解析，再加這個宣告。",
    );
  }

  const propsBlock = DEFINE_PROPS.exec(source);
  if (propsBlock?.[1] === undefined) {
    throw new Error(
      `${basename(file)} 找不到 defineProps<{…}>()。\n` +
        "  這支解析只認型別參數形式；改用執行期物件形式的話這裡會少算，" +
        "所以寧可紅。",
    );
  }

  // 同一個 <script setup> 裡宣告的區域型別別名要就地展開。
  // 它們對消費端不可見，改名不該讓形狀漂移。
  const aliases = new Map<string, string>();
  for (const match of source.matchAll(LOCAL_TYPE)) {
    if (match[1] !== undefined && match[2] !== undefined) {
      aliases.set(match[1], match[2].trim().replace(TIGHTEN, " "));
    }
  }
  const expand = (text: string): string =>
    text.replace(/\b[A-Za-z_$][\w$]*\b/g, (name) => aliases.get(name) ?? name);

  const members = parseBlock(file, "props", propsBlock[1], expand);

  const slotsBlock = DEFINE_SLOTS.exec(source);
  const declaredSlots = new Set<string>();
  if (slotsBlock?.[1] !== undefined) {
    for (const member of parseBlock(file, "slots", slotsBlock[1], expand)) {
      members.push(member);
      declaredSlots.add((/^\[slot ([^\]]+)\]/.exec(member)?.[1] ?? "").trim());
    }
  }

  const emitsBlock = DEFINE_EMITS.exec(source);
  const declaredEmits = new Set<string>();
  if (emitsBlock?.[1] !== undefined) {
    for (const member of parseBlock(file, "emits", emitsBlock[1], expand)) {
      members.push(member);
      declaredEmits.add((/^\[emit ([^\]]+)\]/.exec(member)?.[1] ?? "").trim());
    }
  }

  // defineModel 同時產生一個 prop 與一個 update:<name> 事件，兩邊都是公開面。
  for (const match of source.matchAll(DEFINE_MODEL)) {
    const [, type, name] = match;
    members.push(`${name}?: ${(type ?? "unknown").trim()}`);
    members.push(`[emit update:${name}]: void`);
    declaredEmits.add(`update:${name}`);
  }

  assertDeclared(file, source, declaredSlots, declaredEmits);

  if (members.length === 0) {
    throw new Error(`${basename(file)} 的 defineProps 解析結果是空的 —— 空形狀等於沒有守`);
  }

  return { kind: "component", members: sortMembers(members) };
}

/**
 * 模板裡真的存在的 slot／emit，必須與宣告**完全一致**。
 *
 * ── 少了這一段，這次的擴充只是把絆線換個位置 ────────────────────────
 *
 * 上一版擋的是「巨集出現在原始碼裡」，而實測顯示 slot 與 emit **不需要巨集
 * 就能存在**（見 SFC_UNSUPPORTED 上面的兩筆量測）。所以只加解析、不加這一段，
 * 結果會是：宣告了的守得住，沒宣告的照樣安靜地存在 —— 和之前一樣。
 *
 * slot 兩個方向都檢查：
 *   - 模板有、宣告沒有 → 公開面比記錄大，改了不會漂移
 *   - 宣告有、模板沒有 → 記錄比公開面大，消費端照著寫卻永遠不會渲染
 *
 * ⚠️ **emit 只檢查一個方向**（emit 了就要宣告），這是量出來的不對稱：
 * `defineModel("open")` 會生出一個 `update:open` 事件，而那個事件**沒有任何
 * `emit(...)` 呼叫** —— 是 Vue 自己送的。反方向一起檢查的話，`UiDialog`
 * 第一天就紅，然後這條規則會被關掉（C41）。
 */
function assertDeclared(
  file: string,
  source: string,
  slots: ReadonlySet<string>,
  emits: ReadonlySet<string>,
): void {
  const emitted = emittedNames(file, source);
  for (const name of emitted) {
    if (emits.has(name)) continue;
    throw new Error(
      `${basename(file)} emit 了 "${name}"，但 defineEmits 沒有宣告它。\n` +
        `  沒有宣告的事件仍然是公開面（消費端 @${name} 收得到），只是這道閘門看不見 —— ` +
        "請補進 defineEmits<{…}>()。",
    );
  }

  // 沒有 <template> 時算成「零個 slot」，而不是跳過檢查 —— 跳過的話，
  // 一個宣告了 slot 卻沒有模板的元件會安靜通過，而它宣告的每一格都是假的。
  const templateBlock = TEMPLATE_BLOCK.exec(source);
  const rendered =
    templateBlock?.[1] === undefined ? new Set<string>() : templateSlots(file, templateBlock[1]);

  for (const name of rendered) {
    if (slots.has(name)) continue;
    throw new Error(
      `${basename(file)} 的模板有 <slot${name === "default" ? "" : ` name="${name}"`}>，` +
        "但 defineSlots 沒有宣告它。\n" +
        "  slot 不需要巨集就存在，所以沒宣告＝這道閘門看不見它 —— " +
        "而它仍然是消費端寫得出來的公開面。請補進 defineSlots<{…}>()。",
    );
  }

  for (const name of slots) {
    if (rendered.has(name)) continue;
    throw new Error(
      `${basename(file)} 的 defineSlots 宣告了 "${name}"，但模板裡沒有這個 <slot>。\n` +
        "  記錄比公開面大：消費端照著基準檔寫 <template #" +
        name +
        ">，內容永遠不會出現。",
    );
  }
}

// ── 非匯出的本地型別 ─────────────────────────────────────────────────

/**
 * 公開形狀裡引用到、但自己沒有被 export 的本地型別。
 *
 * ── 為什麼這是一道前置條件而不是一個可以忽略的瑕疵 ──────────────────
 *
 * `typeToString` 對具名型別一律印名字。實測掃過所有 `NodeBuilderFlags`
 *（InTypeAlias、UseStructuralFallback、UseOnlyExternalAliasing…），
 * **沒有任何一個組合會把非匯出的本地型別展開成結構**。
 *
 * 後果是：把一個私有的 `DevServerLike` 改名成 `DevServerShape` —— 一個
 * 消費端完全看不見的重構 —— 會讓 `securityHeaders` 的形狀漂移，而閘門
 * 只能把它判成破壞性變更，要求一份根本不需要的 codemod。那種紅燈會被關掉。
 *
 * 所以改成擋在前面：公開形狀裡的每一個名字，都必須是**這道閘門追蹤得到的
 * 名字**（本 repo 已匯出的型別）或**上游的名字**（node_modules）。
 * 前者改名本來就是破壞性變更，判紅是對的；後者我們改不動。
 *
 * ⚠️ **TypeScript 自己不禁止這件事** —— 實測跑 `tsc --emitDeclarationOnly`，
 * 它會把非匯出的 interface 原樣寫進 `.d.ts`，一個警告都沒有。這條規則是
 * 這道閘門的前置條件，不是語言規則，所以寫在這裡而不是假裝它是常識。
 * 全 repo 實測只有 2 個違規，補救成本是各加一個 `export`。
 */
export interface PrivateTypeReference {
  readonly entry: string;
  readonly typeName: string;
  readonly declaredIn: string;
}

/**
 * 這個 symbol 是不是一個**型別的名字**（interface / type / class / enum）？
 *
 * 不能只看「symbol 存不存在、名字是不是 `__type`」：函式型別背的是**函式宣告
 * 自己的 symbol**，名字就叫 `securityHeaders`。照那個判法會在進入點的第一層
 * 就停手，於是回傳型別裡的 `DevServerLike` 永遠走不到 —— 前置檢查全程零命中，
 * 而零命中與「沒有違規」在輸出上長得一模一樣。
 */
const TYPE_DECLARATION =
  SymbolFlags.Interface | SymbolFlags.TypeAlias | SymbolFlags.Class | SymbolFlags.Enum;

function isTypeDeclaration(symbol: ApiSymbol): boolean {
  return (symbol.flags & TYPE_DECLARATION) !== 0;
}

function isTypeReference(type: Type): type is TypeReference {
  return (
    type.isObjectType() && (type.objectFlags & ObjectFlags.Reference) === ObjectFlags.Reference
  );
}

/**
 * ⚠️ tsgo 回報的宣告路徑是**正規化過的小寫**（macOS／Windows 這種
 * 大小寫不敏感的檔案系統上）：`/Users/demian/…` 會變成 `/users/demian/…`。
 *
 * 直接拿它跟 `ROOT` 比對，`startsWith` 永遠是 false，於是「本地型別」
 * 一個都認不出來，前置檢查全程零命中 —— 而零命中印出來的東西
 * 與「檢查過了，沒有違規」完全一樣。這個 bug 是靠先寫下已知違規的數字
 *（實測 2 個）、再看它有沒有被抓到才發現的。
 */
function normalize(path: string): string {
  return path.toLowerCase();
}

function isLocal(root: string, symbol: ApiSymbol): boolean {
  const declarations = symbol.declarations;
  if (declarations.length === 0) return false;
  const prefix = normalize(root);
  return declarations.every((node) => {
    const path = normalize(node.path);
    return path.startsWith(prefix) && !path.includes("/node_modules/");
  });
}

/**
 * 走過一個型別會碰到的所有具名型別。
 *
 * 只在型別是**匿名結構**時才往裡面走 —— 一旦碰到具名型別就停手：它的內部
 * 不是這個進入點的形狀的一部分（若它是本 repo 的、且已匯出，它自己會有
 * 一筆記錄；若它是上游的，我們改不動）。這同時擋掉了兩種爆炸：
 * 字面量型別會展開成 String 的所有方法、陣列會展開成 Array 的所有方法。
 */
function walkNamedTypes(
  checker: Checker,
  root: string,
  type: Type,
  found: Map<string, ApiSymbol>,
  seen: Set<number>,
): void {
  if (seen.has(type.id)) return;
  seen.add(type.id);

  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (symbol !== undefined && isTypeDeclaration(symbol)) {
    if (isLocal(root, symbol)) found.set(symbol.name, symbol);
    // 具名型別的型別引數仍要看（`readonly Feature[]` 裡的 Feature）。
    //
    // ⚠️ `getTypeArguments` 只能餵 ObjectFlags.Reference 的型別。餵別的
    // 會讓 tsgo 那一端**整個行程 panic**（nil pointer，AsInterfaceType），
    // 而不是回一個錯 —— 所以旗標要自己先擋。
    if (isTypeReference(type)) {
      for (const argument of checker.getTypeArguments(type)) {
        walkNamedTypes(checker, root, argument, found, seen);
      }
    }
    // 別名的型別引數走另一條路：`Record<string, OutputAssetLike>` 展開後是
    // 一個 mapped type，不帶 ObjectFlags.Reference，所以上面那圈拿不到它的
    // 引數。少了這三行，兩個已知違規只會抓到一個。
    for (const argument of type.getAliasTypeArguments()) {
      walkNamedTypes(checker, root, argument, found, seen);
    }
    return;
  }

  if (type.isUnionType() || type.isIntersectionType()) {
    for (const member of type.getTypes()) walkNamedTypes(checker, root, member, found, seen);
    return;
  }

  if (!type.isObjectType() || checker.isArrayType(type) || checker.isTupleType(type)) return;

  walkInterior(checker, root, type, found, seen);
}

/**
 * 從一個具名型別的**內部**開始走。
 *
 * `walkNamedTypes` 碰到具名型別就停手，那對「這個名字是誰」是對的，
 * 但對被追蹤的 export 自己就不夠了：`DevServerLike` 是 export，可是它的
 * `middlewares` 屬性如果指向一個私有的 `Middlewares`，那個名字仍然會被
 * 寫進記錄下來的形狀裡 —— 於是改名照樣漂移，而前置檢查零命中。
 *
 * 所以每一個被追蹤的 export，都要從它的成員（也就是實際被字串化的那些東西）
 * 再走一次。走的範圍與 typeShape／classShape 記錄的範圍**必須一致**，
 * 否則檢查與記錄會對不上。
 */
function walkInterior(
  checker: Checker,
  root: string,
  type: Type,
  found: Map<string, ApiSymbol>,
  seen: Set<number>,
): void {
  for (const prop of checker.getPropertiesOfType(type)) {
    walkNamedTypes(checker, root, typeOf(checker, prop), found, seen);
  }
  for (const info of checker.getIndexInfosOfType(type)) {
    walkNamedTypes(checker, root, info.valueType, found, seen);
  }
  for (const kind of [SignatureKind.Call, SignatureKind.Construct]) {
    for (const signature of checker.getSignaturesOfType(type, kind)) {
      for (const param of signature.getParameters()) {
        walkNamedTypes(checker, root, typeOf(checker, param), found, seen);
      }
      const returns = checker.getReturnTypeOfSignature(signature);
      if (returns !== undefined) walkNamedTypes(checker, root, returns, found, seen);
    }
  }
}

// ── 抽取 ──────────────────────────────────────────────────────────────

export interface Extraction {
  readonly surface: Record<string, EntrySurface>;
  readonly privateReferences: readonly PrivateTypeReference[];
}

function resolveAlias(checker: Checker, symbol: ApiSymbol): ApiSymbol {
  return (symbol.flags & SymbolFlags.Alias) === SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

/**
 * 匿名物件形態的**值** —— `config`、`LAYERS`、`http` 這種 —— 也要記成員。
 *
 * ── 為什麼不能讓它們走「純資料」那條寬鬆路 ──────────────────────────
 *
 * 沒有成員可比的 export 只剩一個型別字串，而字串變了要判成破壞性還是相容，
 * 是靠「它帶不帶呼叫簽章」決定的（見 carriesSignatures）。那個判準對
 * `API_PREFIX = "/api"` 是對的：字面型別跟著內容跑，不是編不過的來源。
 *
 * 但它對 `config` 是錯的。`config` 沒有任何呼叫簽章，會被歸成純資料，
 * 於是**拿掉 `appTitle` 會被判成相容** —— 而每一個讀 `config.appTitle` 的
 * 消費端都當場編不過。這與「判準只有一條：下游會不會編不過」直接矛盾。
 *
 * 所以匿名物件改記成員，走嚴格比對。留在寬鬆那一側的只剩真正的資料形態：
 * 字面量、陣列、tuple —— 它們的型別確實是內容的投影，正是那段理由涵蓋的。
 *
 * 帶呼叫簽章的（函式）不走這裡：它們沒有屬性可列，型別字串本身就是形狀。
 */
function objectMembers(checker: Checker, type: Type): string[] | undefined {
  if (!type.isObjectType() || checker.isArrayType(type) || checker.isTupleType(type)) return;
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (symbol !== undefined && isTypeDeclaration(symbol)) return;
  if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0) return;
  if (checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0) return;

  const members = [
    ...checker.getPropertiesOfType(type).map((prop) => memberOf(checker, prop)),
    ...indexMembers(checker, type),
  ];
  return members.length > 0 ? sortMembers(members) : undefined;
}

function shapeOf(
  checker: Checker,
  root: string,
  symbol: ApiSymbol,
  file: string,
  referenced: Map<string, ApiSymbol>,
  seen: Set<number>,
): ExportShape {
  if (file.endsWith(".vue")) return parseComponent(file);

  if ((symbol.flags & SymbolFlags.Class) === SymbolFlags.Class) {
    walkInterior(checker, root, typeOf(checker, symbol), referenced, seen);
    walkInterior(checker, root, declaredTypeOf(checker, symbol), referenced, seen);
    return classShape(checker, symbol);
  }

  const isType =
    (symbol.flags & (SymbolFlags.Interface | SymbolFlags.TypeAlias)) !== 0 &&
    (symbol.flags & SymbolFlags.Variable) === 0;
  if (isType) {
    walkInterior(checker, root, declaredTypeOf(checker, symbol), referenced, seen);
    return typeShape(checker, symbol);
  }

  const type = typeOf(checker, symbol);
  walkNamedTypes(checker, root, type, referenced, seen);
  const members = objectMembers(checker, type);
  if (members !== undefined) return { kind: "object", members };
  return {
    kind: carriesSignatures(checker, type, new Set()) ? "function" : "value",
    type: checker.typeToString(type, undefined, PRINT),
  };
}

/**
 * 這個值帶不帶呼叫簽章？決定它的型別字串變了要判成破壞性還是相容。
 *
 * ── 為什麼要分 ──────────────────────────────────────────────────────
 *
 * 沒有成員可比的 export 只剩下一個型別字串，而字串只能整條比對 ——
 * 分不出「改了一個函式的參數」與「常數多了一個元素」。
 *
 * 這兩件事的後果差很多：
 *   - `defineFeature` 的簽章變了 → 呼叫端**編不過**，那是這道閘門存在的理由
 *   - `SESSION_COOKIE_REQUIRED_ATTRIBUTES` 從兩個元素變三個 → 字面型別跟著
 *     變，但沒有人編不過
 *
 * 把後者也判成破壞性，等於每改一條設定常數就要人寫一份不存在的 codemod。
 * 那種閘門會被關掉（C57）。
 *
 * ⚠️ **代價寫清楚**：純資料的 export 少掉一個欄位（例如 `CONTRACT_ITEMS`
 * 的元素形狀變了）會被判成相容，只要求更新基準。它仍然會出現在基準檔的
 * diff 裡讓人看到 —— 但沒有東西擋著。要收緊的話得先能區分「內容變動」與
 * 「形狀變動」，而那個代價目前不划算（D16）。
 */
function carriesSignatures(checker: Checker, type: Type, seen: Set<number>): boolean {
  if (seen.has(type.id)) return false;
  seen.add(type.id);

  if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0) return true;
  if (checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0) return true;

  if (type.isUnionType() || type.isIntersectionType()) {
    return type.getTypes().some((member) => carriesSignatures(checker, member, seen));
  }
  // 與 walkNamedTypes 同一條界線：只往匿名結構裡看。字面量與陣列往下走
  // 會撞到 String / Array 自己的方法，那不是這個 export 的形狀。
  if (!type.isObjectType() || checker.isArrayType(type) || checker.isTupleType(type)) return false;
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (symbol !== undefined && isTypeDeclaration(symbol)) return false;

  return checker
    .getPropertiesOfType(type)
    .some((prop) => carriesSignatures(checker, typeOf(checker, prop), seen));
}

/**
 * 進入點裡由 `.vue` 轉出的 export：名字 → SFC 絕對路徑。
 *
 * ── 為什麼不能問 checker ────────────────────────────────────────────
 *
 * 直覺是拿 symbol 的宣告檔判斷副檔名。但 `declare module "*.vue"` 這個 shim
 * 讓 `UiButton` 的宣告落在 `env.d.ts` 上，**不是** `.vue` 檔 —— 照那個判法，
 * SFC 解析永遠不會被觸發，兩個元件就會安靜地記成一模一樣的 shim 型別。
 * 這正是第一次跑出來的結果。
 *
 * 所以改讀進入點的轉出語句：那裡的模組路徑是原文，shim 動不到它。
 */
function componentSources(entryFile: string): Map<string, string> {
  const source = readFileSync(entryFile, "utf8");
  if (/export\s+\*/.test(source)) {
    throw new Error(
      `${entryFile} 使用了 export *，無法把 export 名字對回它的來源檔。` +
        "請改成具名轉出 —— API 表面必須是可枚舉的，否則這道閘門看不見它守的東西",
    );
  }

  const sources = new Map<string, string>();
  for (const statement of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const [, clause, specifier] = statement;
    if (specifier === undefined || !specifier.endsWith(".vue")) continue;
    for (const part of (clause ?? "").split(",")) {
      const trimmed = part.trim();
      if (trimmed.length === 0) continue;
      const alias = /\bas\s+([A-Za-z_$][\w$]*)/.exec(trimmed);
      const name = alias?.[1] ?? trimmed;
      sources.set(name, resolve(entryFile, "..", specifier));
    }
  }
  return sources;
}

/**
 * @param root 判斷「本地型別」用的界線 —— 正式跑是 `platform/`，
 *   反向測試指到 fixture 目錄。用它而不是 repo 根目錄，是因為 fixture
 *   被複製到暫存目錄之後就不在 repo 底下了，界線得跟著搬。
 */
export function extractSurface(root: string, entries: readonly EntryPoint[]): Extraction {
  const surface: Record<string, EntrySurface> = {};
  const privateReferences: PrivateTypeReference[] = [];

  const configs = [...new Set(entries.map((entry) => entry.config).filter((c) => c !== undefined))];
  const api = new API({ cwd: root });
  try {
    const snapshot = api.updateSnapshot({ openProjects: configs });
    const projects = new Map<string, Project>(
      snapshot.getProjects().map((project) => [project.configFileName, project]),
    );

    for (const entry of entries) {
      if (entry.config === undefined) {
        surface[entry.key] = namesOnly(entry);
        continue;
      }
      const project = projects.get(entry.config);
      if (project === undefined) throw new Error(`開不起來的 project：${entry.config}`);

      const checker = project.checker;
      const sourceFile = project.program.getSourceFile(entry.file);
      if (sourceFile === undefined) {
        throw new Error(
          `${entry.file} 不在 ${entry.config} 的 program 裡 —— ` +
            "進入點沒被 tsconfig 的 include 涵蓋，形狀會是空的",
        );
      }
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
      if (moduleSymbol === undefined) throw new Error(`${entry.file} 不是一個模組`);

      const exported = new Map<string, ApiSymbol>();
      const referenced = new Map<string, ApiSymbol>();
      const seen = new Set<number>();
      const shapes: EntrySurface = {};
      const components = componentSources(entry.file);

      const symbols = [...checker.getExportsOfModule(moduleSymbol)].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const symbol of symbols) {
        const target = resolveAlias(checker, symbol);
        exported.set(target.name, target);
        shapes[symbol.name] = shapeOf(
          checker,
          root,
          target,
          components.get(symbol.name) ?? entry.file,
          referenced,
          seen,
        );
      }
      surface[entry.key] = shapes;

      for (const [name, symbol] of referenced) {
        if (exported.has(name)) continue;
        privateReferences.push({
          entry: entry.key,
          typeName: name,
          // root 是 platform 目錄，往上退一層才印得出 `platform/<pkg>/…`。
          declaredIn: (symbol.declarations[0]?.path ?? "?").slice(dirname(root).length + 1),
        });
      }
    }
  } finally {
    api.close();
  }

  return { surface, privateReferences };
}

/**
 * 沒有 tsconfig 的 package 只能記名稱 —— 而這件事必須寫在基準檔裡。
 *
 * `@org/eslint-config` 的進入點是一份 `.js` 的 flat config。把它從表面裡
 * 拿掉會讓這道閘門在「擴大守備範圍」的這個 PR 裡反而變窄，而且沒有人會發現。
 * 所以保留，但用 `names-only` 明講它守到哪裡為止。
 */
function namesOnly(entry: EntryPoint): EntrySurface {
  const source = readFileSync(entry.file, "utf8");
  const names = new Set<string>();
  if (/^\s*export\s+default\b/m.test(source)) names.add("default");
  for (const match of source.matchAll(
    /export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of (match[1] ?? "").split(",")) {
      const alias = /\bas\s+([A-Za-z_$][\w$]*)/.exec(part);
      const name = alias?.[1] ?? part.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  if (names.size === 0) throw new Error(`${entry.file} 抓不到任何 export`);

  const shapes: EntrySurface = {};
  for (const name of [...names].sort()) shapes[name] = { kind: "names-only" };
  return shapes;
}
