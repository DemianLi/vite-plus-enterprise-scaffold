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

function typeShape(checker: Checker, symbol: ApiSymbol): ExportShape {
  const declared = declaredTypeOf(checker, symbol);
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
 * `defineProps<{…}>()` 與 `defineModel<T>(…)`。
 *
 * ⚠️ **這是文字解析，涵蓋範圍必須寫死而不是盡力而為。** 元件的公開面
 * 除了 props 還有 emits、slots、expose；只認 props 卻記成一份完整形狀，
 * 就是「看起來有守、其實沒守」。因此遇到 `defineEmits` / `defineSlots` /
 * `defineExpose` 一律丟例外，讓加這些東西的人來決定怎麼記，而不是
 * 讓閘門安靜地少算。
 */
const SFC_UNSUPPORTED = ["defineEmits", "defineSlots", "defineExpose"] as const;
const DEFINE_PROPS = /defineProps<\{([\s\S]*?)\}>\(\)/;
const DEFINE_MODEL = /defineModel<([^>]+)>\(\s*"([^"]+)"/g;
const LOCAL_TYPE = /^\s*type\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/gm;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(^|[^:])\/\/[^\n]*/g;

function parseComponent(file: string): ExportShape {
  /**
   * 先把註解拿掉，再看有沒有那三個巨集。
   *
   * ⚠️ 這一步是被自己絆倒之後才加的：`UiButton.vue` 的說明文字裡寫了一句
   * 「加 `defineEmits` 會讓 api-surface 直接丟例外」，於是這支解析讀到
   * 自己的警語，然後對那個檔案丟了例外。
   *
   * 教訓不是「別在註解裡提巨集名」—— 那正是應該寫在那裡的話。
   * 是**掃原始碼的檢查一律要先剝掉註解**，否則文件與程式碼會互相干擾，
   * 而症狀（一個看起來很正確的錯誤訊息）不會指向真正的原因。
   */
  const source = readFileSync(file, "utf8").replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "$1");

  for (const marker of SFC_UNSUPPORTED) {
    if (!source.includes(marker)) continue;
    throw new Error(
      `${basename(file)} 使用了 ${marker}，而這裡只解析 props。\n` +
        "  元件的公開面因此不只 props，記下來的形狀會是不完整的 —— " +
        "請先擴充 tools/api-surface/src/shape.ts 的解析，再加這個宣告。",
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
      aliases.set(match[1], match[2].trim().replace(/\s+/g, " "));
    }
  }
  const expand = (text: string): string =>
    text.replace(/\b[A-Za-z_$][\w$]*\b/g, (name) => aliases.get(name) ?? name);

  const members: string[] = [];
  for (const line of propsBlock[1].split(";")) {
    const declaration = /^\s*([A-Za-z_$][\w$]*)(\??)\s*:\s*([\s\S]+)$/.exec(line);
    if (declaration === null) continue;
    const [, name, optional, type] = declaration;
    members.push(`${name}${optional}: ${expand((type ?? "").trim().replace(/\s+/g, " "))}`);
  }

  // defineModel 同時產生一個 prop 與一個 update:<name> 事件，兩邊都是公開面。
  for (const match of source.matchAll(DEFINE_MODEL)) {
    const [, type, name] = match;
    members.push(`${name}?: ${(type ?? "unknown").trim()}`);
    members.push(`[emit update:${name}]: void`);
  }

  if (members.length === 0) {
    throw new Error(`${basename(file)} 的 defineProps 解析結果是空的 —— 空形狀等於沒有守`);
  }

  return { kind: "component", members: sortMembers(members) };
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
