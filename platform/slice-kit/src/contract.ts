/**
 * 切片契約 —— **單一事實來源**（D9）。
 *
 * 這個檔案刻意零依賴、純資料，因為它同時被三個地方 import：
 *
 *   1. tools/conformance  — CI 每次都跑的一致性檢查（在 bare node 下執行）
 *   2. tools/slice-gen    — 產生器（bingo，程式化產生 → 讀得到這份資料）
 *   3. define-feature.ts  — 執行期驗證
 *
 * 產生器產出的東西 ＝ 一致性檢查會驗的東西，因為兩者讀同一份宣告。
 * 分成兩份手動同步的定義，半年內必定漂移 —— 這正是 D9 要避免的。
 */

/** 三層架構的目錄名（D4）。依賴方向只准 apps → features → platform。 */
export const LAYERS = {
  apps: "apps",
  features: "features",
  platform: "platform",
  tools: "tools",
} as const;

/** 每個 features/* 都必須存在的檔案。產生器負責產出，檢查負責驗證。 */
export const REQUIRED_FILES = [
  "package.json",
  "tsconfig.json",
  "README.md",
  "src/index.ts",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 切片**內部**的分層（D14）
//
// 上面那些規則管的是「切片之間」。這一段管的是「切片之內」——
// 而它原本是空白的：REQUIRED_FILES 驗完四個檔案就結束，
// api.ts / store.ts / routes.ts / views/ 那套結構只存在於產生器的模板裡，
// 沒有任何檢查在守。誰手寫一個切片、或改了產生器，那套慣例就消失，而閘門全綠。
//
// 補上的分層照 Vue 官方對 composable 的定義（vuejs.org/guide/reusability/composables）：
// **有狀態的邏輯住在 `useXxx()` 裡，元件只負責呈現。**
// ─────────────────────────────────────────────────────────────────────────────

/** 切片內放 composable 的目錄。Vue 官方文件用的就是這個慣例位置。 */
export const COMPOSABLES_DIR = "src/composables";

/** 切片內放元件的目錄。 */
export const VIEWS_DIR = "src/views";

/**
 * composable 檔名規則：`use` 開頭、駝峰、`.ts` 結尾（`useOrderList.ts`）。
 *
 * 與切片名的規則同理，刻意避開巢狀量詞（見本檔案末尾 SLICE_DIR_CHARSET 的說明）——
 * Tier 2 的 `security/detect-unsafe-regex` 會擋，而且它是對的。
 */
const COMPOSABLE_FILE_CHARSET = /^use[A-Z][A-Za-z0-9]*\.ts$/;

export function isValidComposableFile(fileName: string): boolean {
  return COMPOSABLE_FILE_CHARSET.test(fileName);
}

/** 檔名 → 應該匯出的函式名（`useOrderList.ts` → `useOrderList`）。 */
export function composableFunctionName(fileName: string): string {
  return fileName.replace(/\.ts$/, "");
}

/**
 * **元件不得直接碰資料層。**
 *
 * 這是 D14 唯一真正有牙齒的一條，其餘都是命名規則。禁的兩樣東西合起來
 * 恰好就是「在元件裡抓資料」：查詢的執行器，以及本切片的資料存取模組。
 *
 * 為什麼是禁「元件 import 它們」而不是禁「元件裡有 useQuery」：
 * 前者是可精確判定的靜態事實，後者要語意分析。同樣的取捨見 D4 第 3 層。
 *
 * ⚠️ 這條不禁 `@tanstack/vue-query` 出現在切片裡 —— composable 就是要用它。
 * 禁的是**位置**，不是相依。
 */
export const VIEW_FORBIDDEN_IMPORTS = ["@tanstack/vue-query", "@org/http-client"] as const;

/** 元件也不得直接 import 同切片的資料存取模組（相對路徑，需另外判定）。 */
export const VIEW_FORBIDDEN_LOCAL_MODULES = ["api"] as const;

/** 切片內的 Pinia store。 */
export const STORE_FILE = "src/store.ts";

/**
 * **Pinia 只放「客戶端才是權威」的東西。**
 *
 * 判準一句話：*這份資料如果和伺服器不一致，誰是錯的？*
 *
 *   伺服器是權威（`Order[]` 本身）              → TanStack Query，走 composable
 *   客戶端是權威（篩選條件、選取的 id、草稿）   → Pinia
 *   兩者都不是（「選取的那幾筆 Order 物件」）   → 哪裡都不放，composable 裡的 computed
 *
 * 濃縮成可以背的一句：**Pinia 存 id，不存 entity。**
 *
 * 第三類是這條界線真正要擋的東西。把 join 出來的結果存進 store，等於做了第二份
 * 快取 —— 它與 TanStack Query 那份的失效時機不同，而且**不會有任何測試變紅**。
 * 這跟 D14 上半段要防的 queryKey 漂移是同一種病，只是換個位置發作。
 *
 * ⚠️ 禁的是 **value import**，`import type` 完全允許：
 *
 *     import type { Order } from "./api.ts";     // ✓ 借型別，編譯期就消失
 *     import { fetchOrders } from "./api.ts";    // ✗ 呼叫伺服器
 *     import { useQuery } from "@tanstack/vue-query";  // ✗
 *
 * 這不是為了方便而開的例外，是語意上本來就不同 —— 而且本 repo 的
 * `verbatimModuleSyntax: true` 讓這個區分**精確可判定**：
 * `import type { X }` 會被完全抹除，`import { type X }` 仍會產出
 * `import "./api.ts"`（模組實際被載入）。所以把後者算成 value import 是對的，
 * 不是偽陽性。
 *
 * 這條規則的價值在於**讓錯誤寫不出來**：拿不到 `fetchOrders`、拿不到 `useQuery`，
 * entity 就進不了 store。剩下的路徑（元件手動把資料塞進 store）明顯得多，
 * code review 看得到。
 */
export const STORE_FORBIDDEN_IMPORTS = ["@tanstack/vue-query", "@org/http-client"] as const;

/** store 也不得 value import 同切片的資料存取模組。 */
export const STORE_FORBIDDEN_LOCAL_MODULES = ["api"] as const;

/** 只認 `import type` / `export type` 開頭 —— 單層量詞，不會被 detect-unsafe-regex 擋。 */
const TYPE_ONLY_HEAD = /^(?:import|export)\s+type\b/;

/**
 * 判定 `IMPORT_SPECIFIER_PATTERN` 的某一個命中是不是 type-only import。
 *
 * `matchIndex` 是那個命中的起點（指向 `from` / `import(` / `require(`），
 * 從它往回找最近的 `import` 或 `export` 就是該敘述的開頭。
 * 這種掃法對多行 import 也成立，而且不需要 parser。
 *
 * 三個刻意的判定：
 *
 *   `import type { X } from "…"`   → true（整句被抹除，沒有執行期效果）
 *   `import { type X } from "…"`   → **false**。`verbatimModuleSyntax` 之下它仍會
 *                                     產出 `import "…"`，模組實際被載入 —— 算成
 *                                     value import 是對的，不是偽陽性
 *   `import("…")`（動態）           → false。動態載入一定是執行期
 *
 * ⚠️ 已知限制：被註解掉的 import 也會被算進來（`// import { x } from "./api.ts"`）。
 * 這與 D4 第 3 層的相對路徑檢查行為一致 —— 兩者都偏向嚴格，而偏嚴的代價是
 * 偶爾要把註解改寫，偏鬆的代價是規則失效。
 */
export function isTypeOnlyImportAt(source: string, matchIndex: number): boolean {
  const start = Math.max(
    source.lastIndexOf("import", matchIndex),
    source.lastIndexOf("export", matchIndex),
  );
  if (start < 0) return false;
  return TYPE_ONLY_HEAD.test(source.slice(start, matchIndex));
}

/** 切片必須有測試。沒有測試的切片＝沒有人能安全重構的切片。 */
export const TEST_GLOB = "tests/**/*.test.ts";

/**
 * D4 硬規則：切片之間一律禁止互相依賴。
 * 這是第 1 層防護（讀 manifest），擋宣告出來的依賴。
 * 第 2、3 層（oxlint）在 vite.config.ts，擋裸模組名與相對路徑逃逸。
 *
 * ⚠️ 實作注意：一致性檢查**不以正則判斷**某個依賴是不是切片，而是直接讀
 * `features/` 目錄的實際內容來建立名單。
 *
 * 為什麼：初版用了 `/^@org\/feature-/`，結果把住在 platform/ 的
 * `@org/feature-kit` 誤判成切片（該套件後來改名為 `@org/slice-kit`）。
 * 正則是對「什麼是切片」的猜測，目錄清單是事實 —— 猜測會有偽陽性與偽陰性，
 * 事實不會。這個常數只保留給產生器決定新切片該叫什麼名字。
 */
export const SLICE_PACKAGE_PREFIX = "@org/feature-";

/**
 * D8：切片不得直接使用 HTTP 客戶端。
 * 一律走 @org/http-client，否則 CSRF 標頭與錯誤處理會每片各做一套。
 */
export const BANNED_DIRECT_DEPENDENCIES = [
  "axios",
  "ky",
  "got",
  "superagent",
  "node-fetch",
] as const;

/** D6：所有版本必須走 catalog，否則共用 lockfile 下的 CVE 同步升級會有漏網。 */
export const REQUIRE_CATALOG_PROTOCOL = true;

/** 允許不走 catalog 的依賴協定（workspace 內部連結）。 */
export const ALLOWED_VERSION_PROTOCOLS = ["workspace:", "catalog:"] as const;

/** 切片必須有 CODEOWNERS 條目。沒有 owner 的切片＝沒人負責的切片（D12）。 */
export const REQUIRE_CODEOWNERS_ENTRY = true;

/** 一致性檢查會掃描的原始碼副檔名（D4 第 3 層）。 */
export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".vue"] as const;

/**
 * 抽出 import 指定字串的樣式（D4 第 3 層）。
 *
 * 由兩處共用，這正是它住在契約裡的原因：
 *   - `tools/conformance` 用它找出逃逸切片根目錄的相對路徑
 *   - `tools/slice-gen` 的測試用它驗證**產生器自己的輸出**不會被上面那條擋下
 *
 * 兩邊各持一份副本的話，產生器改了目錄結構（例如多一層 src/views/detail/）
 * 就會安靜地產出過不了 Tier 2 的切片，而兩邊的測試全綠。
 */
export const IMPORT_SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/**
 * 切片命名規則：目錄名 kebab-case，套件名 `@org/feature-<目錄名>`。
 *
 * 這裡刻意**不用**直覺的 `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`。
 * 那個寫法有巢狀量詞（star height 2），Tier 2 的 `security/detect-unsafe-regex`
 * 會判定為 ReDoS 風險 —— 而且它是對的：巢狀量詞在特定輸入下會退化成
 * 指數級回溯。切片名雖然來自開發者而非使用者輸入，風險實際很低，
 * 但「這條路徑碰不到不可信輸入」的假設會隨時間失效，而規則例外不會。
 *
 * 改用單層量詞 + 明確的邊界檢查：可讀性更好，且是線性時間。
 */
const SLICE_DIR_CHARSET = /^[a-z][a-z0-9-]*$/;

export function isValidSliceDir(dir: string): boolean {
  return SLICE_DIR_CHARSET.test(dir) && !dir.includes("--") && !dir.endsWith("-");
}

export const slicePackageName = (dir: string): string => `${SLICE_PACKAGE_PREFIX}${dir}`;

/**
 * D11：CSP 無 unsafe-eval 的前提是 Vue runtime-only build。
 * 執行期樣板字串會需要編譯器，一旦有人用了，整份 CSP 就得放寬。
 * 這條由 oxlint 的 no-eval / no-implied-eval 擋，此處記錄理由供檢查腳本引用。
 */
export const RUNTIME_TEMPLATE_FORBIDDEN = true;
