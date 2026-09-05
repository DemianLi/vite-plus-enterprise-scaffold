import { slicePackageName, toPascalCase, toCamelCase, type FileTree } from "./contract-shape.ts";

export interface SliceOptions {
  /** 切片目錄名，kebab-case。同時是路由、store、i18n、權限碼的命名空間。 */
  readonly name: string;
  /** 顯示名稱，用於 i18n 與側邊欄。 */
  readonly title: string;
  /** CODEOWNERS 的負責團隊，例如 @org/team-fulfillment。 */
  readonly team: string;
}

/**
 * 產生一個符合契約的切片。
 *
 * 產出的每一項都對應 `@org/slice-kit/contract` 的一條規則 ——
 * 產生器不是「給個起點就好」，它產出的形狀就是一致性檢查會驗的形狀。
 */
/**
 * 切片的 `vite.config.ts` —— **本檔唯一一支被提到函式外面的模板**。
 *
 * 理由是它與其他模板不同：**它一個 `options` 的值都不用**。全靜態的字串
 * 留在 `buildSliceFiles` 裡面，只是在替那個函式的行數加碼，而那個行數
 * 正是 C119 唯一一條 per-file 放行守著的東西。
 */
const VITE_CONFIG = `import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { USECASE_COVERAGE_GLOB, USECASE_COVERAGE_MIN } from "@org/slice-kit/contract";

/**
 * 切片自己的 Vite 設定。**這支檔案存在的唯一理由是覆蓋率門檻**（C120）。
 *
 * 門檻只收在 \`src/usecases/**\` 上，因為那是規格打的那一層：一行沒被走過的
 * usecase 就是一個沒有規格在驗的 usecase。切片整體**不設數字** ——
 * \`src/views/**\` 佔行分母的 40%、函式分母的 45%，而 \`.vue\` 只算
 * \`<script setup>\`（template 一行都不進分母），一個套在整包上的數字會被
 * 那件事帶著走。
 *
 * ⚠️ 為什麼不放腳手架根層：\`vp test\` 的設定以 package 為根解析，而一個
 * package 只要有自己的 \`vite.config.ts\`，根層那份的 \`test\` 區塊就**整塊
 * 不繼承**。所以這支檔案**不能刪** —— 刪掉之後門檻不會報錯，它會安靜地
 * 不存在。
 *
 * ⚠️ \`plugins\` 這一行不是贅字：少了它 \`.vue\` 不會被轉譯，畫面那支會整支
 * 從覆蓋率報表裡消失（實測：行覆蓋率不降反升，而程式碼一個字都沒改）。
 */
export default defineConfig({
  plugins: [vue()],

  // ── 覆蓋率的產物落在 package 底下，而 \`vp run\` 會把它算成輸入（C120）──
  //
  // ⚠️ 不宣告這一段的話，這支 task **永遠不會 cache**：v8 provider 每跑一次
  // 都會讀寫 \`coverage/.tmp/coverage-N.json\`，而 \`vp run\` 的自動追蹤看到
  // 「讀了自己寫的檔案」就判定不可快取（實測訊息：\`Not cached: read and
  // wrote 'coverage/.tmp/coverage-0.json'\`）。任務快取是 Tier 1 的主要提速
  // 手段（D10），而這件事會發生在**每一個**切片上。
  //
  // ⚠️ 換 \`reportsDirectory\` 沒有用 —— 只要落在 repo 之內都會被追蹤
  // （\`node_modules/\` 底下、\`node_modules/.vite/\` 底下都實測過，一樣不 cache）。
  //
  // ⚠️ 所以 \`test\` 從 \`package.json\` 的 scripts **搬到這裡**：同一個名字不能
  // 同時存在於兩邊，會是 \`Failed to load task graph\`，整批測試連跑都不會開始
  // （同 \`tools/slice-gen/vite.config.ts\` 的那條註解）。
  run: {
    tasks: {
      test: {
        command: "vp test",
        input: [{ auto: true }, "!coverage/**"],
        output: ["coverage/**"],
      },
    },
  },

  test: {
    coverage: {
      // ⚠️ **\`enabled\` 這一行才是門檻真的會跑的原因。** 覆蓋率預設是關的，
      // 只有 \`--coverage\` 才會開 —— 一組只在有人手動加旗標時才成立的門檻，
      // 與「沒有門檻」是同一個東西，而且長得跟全綠一樣。開著它，\`vp test\`
      // 這條所有人本來就會跑的路徑就是它的執行者。
      enabled: true,

      // 每跑一次測試就印一次完整表格太吵；門檻紅的時候 vitest 會另外印出
      // 是哪一條 glob 沒過，不靠這份報表。
      reporter: ["text-summary"],

      // ⚠️ 射程不能省。v8 provider 預設**只把測試載入過的檔案放進分母** ——
      // 沒有任何規格 import 的 usecase 不是 0%，是整支不出現，於是下面那條
      // 門檻對「新寫了一個 usecase 卻沒寫規格」這件事恰好瞎掉。
      include: ["src/**"],

      // ⚠️ glob 與數字都從契約取，不要改成字面值：glob 沒有命中任何檔案時，
      // 覆蓋率門檻**靜默通過、exit 0**，與打錯字完全同形。
      thresholds: {
        [USECASE_COVERAGE_GLOB]: {
          lines: USECASE_COVERAGE_MIN,
          branches: USECASE_COVERAGE_MIN,
          functions: USECASE_COVERAGE_MIN,
          statements: USECASE_COVERAGE_MIN,
        },
      },
    },
  },
});
`;

export function buildSliceFiles(options: SliceOptions): FileTree {
  const { name, title, team } = options;
  const Pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  const pkgName = slicePackageName(name);

  return {
    // key 順序刻意對齊 oxfmt 的正規順序（description 在 type 之前）。
    // 產生後仍會跑一次 `vp fmt`（見 template.ts 的 scripts）—— 手工對齊
    // formatter 規則很脆弱，那道 fmt 才是保證；這裡對齊只是讓 diff 乾淨。
    "package.json":
      JSON.stringify(
        {
          name: pkgName,
          version: "0.0.0",
          private: true,
          description: title,
          type: "module",
          exports: { ".": "./src/index.ts" },
          // ⚠️ `test` 不在這裡 —— 它是 `vite.config.ts` 的 task（見那支檔案的註解）。
          // 兩邊同名會是 `Failed to load task graph`。
          scripts: { check: "vp check" },
          // 一律 workspace: / catalog: —— 寫死版本會被一致性檢查擋下（D6）。
          dependencies: {
            "@org/http-client": "workspace:*",
            "@org/slice-kit": "workspace:*",
            // D15：畫面元件一律從 @org/ui 取用。一致性檢查會驗切片**真的用過**它 ——
            // 只是宣告依賴不算，只是不用也不行。
            "@org/ui": "workspace:*",
            "@tanstack/vue-query": "catalog:",
            pinia: "catalog:",
            vue: "catalog:",
            // 模板用 `$t`，而 `$t` 是 vue-i18n 掛上去的全域屬性 —— 它是相依，
            // 只是不長得像。少了這一行（加上 env.d.ts 那句 import），切片單獨
            // 型別檢查會噴一整排 TS2339，見 C68。
            "vue-i18n": "catalog:",
            "vue-router": "catalog:",
          },
          devDependencies: {
            // 驗收規格的 runner。⚠️ **必須列在切片自己的相依裡**，不能靠
            // workspace 根目錄提升：幽靈相依檢查只掃 `src/`，接線檔住在
            // `tests/` 底下溜得過去 —— 而那種相依在乾淨重建時不成立（C111）。
            "@amiceli/vitest-cucumber": "catalog:",
            "@org/tsconfig": "workspace:*",
            // ⚠️ 這兩條也**必須列在切片自己的相依裡**，理由同上一條（C111）。
            // `vite.config.ts` 不在幽靈相依檢查的射程（它只掃 `src/`），
            // 所以少了它們不會有任何檢查說話 —— 症狀是乾淨重建時才炸。
            "@vitejs/plugin-vue": "catalog:",
            "@vitest/coverage-v8": "catalog:",
            typescript: "catalog:",
            vite: "catalog:",
            "vite-plus": "catalog:",
            vitest: "catalog:",
          },
        },
        null,
        2,
      ) + "\n",

    // 以字面字串輸出而非 JSON.stringify：oxfmt 會把短陣列收成單行，
    // stringify 的多行陣列每次都會被改寫，讓「產完直接 check 就過」不成立。
    "tsconfig.json": `{
  "extends": "@org/tsconfig/lib.json",
  "include": ["src", "tests"]
}
`,

    "vite.config.ts": VITE_CONFIG,

    "README.md": `# ${pkgName}

${title}

**Owner**：\`${team}\`（見根目錄 \`CODEOWNERS\`）

## 邊界

這個切片**不得**依賴任何其他 \`features/*\`。三層防護會擋下：

1. \`tools/conformance\` 讀 \`package.json\`（Tier 2，繞不過的底線）
2. oxlint \`no-restricted-imports\`（Tier 1，擋裸模組名）
3. \`tools/conformance\` 精確路徑解析（Tier 2，擋相對路徑逃逸）

需要與其他切片互動時只有兩條合法路徑：往上到 \`apps/\` 層組裝，
或往下把共用契約抽到 \`platform/\`。

切片**之內**還有第四層（D14）：\`src/views/\` 與 \`src/store.ts\` 不得直接碰資料層。

## 設計系統（D15）

畫面元件一律從 \`@org/ui\` 取用。一致性檢查驗的是**兩個方向**：

| 規則                                            | 防的是什麼                                       |
| ----------------------------------------------- | ------------------------------------------------ |
| 不得直接 import \`reka-ui\`／\`clsx\`／\`tailwind-merge\` | 繞過 \`@org/ui\` 自己拼基元                        |
| 整個切片**至少一處**使用 \`@org/ui\`              | 根本不用 —— 全部自己刻，一條規則都不會 violate    |

第二條才是實際上比較常發生的那一種。要的元件 \`@org/ui\` 沒有，
就把它加進 \`platform/ui\` —— 那個 package 有 CODEOWNERS 與 api-surface 閘門，
切片沒有。

## 結構

| 檔案               | 職責                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| \`specs/\`          | **驗收規格**（\`.feature\`）。人寫的需求，agent 讀它、用 TDD 實現           |
| \`src/index.ts\`     | 對外的唯一公開契約（\`defineFeature\`）                                           |
| \`src/ports.ts\`     | 與外界之間的介面。usecase 只認得它，不認得 HTTP                                  |
| \`src/usecases/\`    | **業務規則**，純 TS 零框架。規格打的就是這一層                                    |
| \`src/routes.ts\`    | 本切片的路由樹，\`/${name}\` 之下、name 以 \`${name}/\` 開頭                          |
| \`src/api.ts\`       | 資料存取。一律走 \`@org/http-client\`，禁止直接用 fetch/axios                     |
| \`src/composables/\` | \`useXxx()\` —— 取數、快取 key、後備值。**有狀態的邏輯住這裡**（D14）             |
| \`src/store.ts\`     | Pinia。只放**客戶端才是權威**的東西：篩選條件、選取的 id。**存 id 不存 entity**  |
| \`src/views/\`       | 畫面元件，**只負責呈現**。不得直接 import \`@tanstack/vue-query\` 或 \`api.ts\`     |
| \`tests/specs/\`     | 規格的**接線**（\`.spec.ts\`）。把規格的中文句子接到 usecase 上，越薄越好      |
| \`tests/\`           | 本切片的測試。一致性檢查要求至少一支                                            |

> 「這份資料如果和伺服器不一致，誰是錯的？」
> 伺服器是權威 → \`composables/\`；客戶端是權威 → \`store.ts\`；
> 兩者都不是（例如「選取的那幾筆物件」）→ 哪裡都不放，用 \`computed\` 推導。

## 命名空間

\`defineFeature\` 會在 dev 模式驗證下列全部落在 \`${name}\` 命名空間下，違規當場拋錯：

- 路由 \`name\` → \`${name}/*\`
- 頂層路由 \`path\` → \`/${name}*\`
- 權限碼 → \`${name}:*\`
- i18n 頂層 key → 恰好只有 \`${name}\`
- TanStack Query key → 第一段為 \`${name}\`

## 業務功能完成率

\`specs/${name}.feature\` 是**需求**，由人寫；agent 讀它、用 TDD 把它實現出來。
**綠幾條就是完成幾條** —— 那就是這個切片的完成率。覆蓋率量的是程式碼被跑過，
回答不了「功能做完了沒有」。

三態：

| 標記     | 意思             | 結果             |
| -------- | ---------------- | ---------------- |
| \`@待辦\` | 有定義、還沒做   | ⚠️ 跳過，不擋    |
| 沒有標   | 該做了           | 沒綠就 🔴 擋下   |

⚠️ **\`@待辦\` 只有人能拿掉。** 拿掉的那一刻，就是在說「這條該做了」——
它進入解析結果、找不到接線、紅燈。

⚠️ **agent 不得修改 \`specs/\` 底下的檔案**（含不得自己加上 \`@待辦\`）。
這條沒有閘門在守，靠的是人讀規格的 diff —— 見根目錄 \`AGENTS.md\` 的契約。

規格打的是 \`src/usecases/\`（純 TS、零框架），而 composable 呼叫的也是它 ——
**同一份業務規則**。規格餵 in-memory 的 gateway，畫面餵真的 HTTP，
中間那層一模一樣；不這樣接的話，規格全綠而畫面壞掉，沒有閘門看得見。

## 開發

\`\`\`bash
vp run ${pkgName}#test
\`\`\`
`,

    // ⚠️ **與 src/ 平行，不在 tests/ 底下** —— 這是需求，不是測試。
    // 放進 tests/ 會讓它讀起來像開發者的資產，而它要能被 PM 與驗收方
    // 直接打開來讀，那是它唯一的價值（TESTING.md 層 3）。
    specs: {
      [`${name}.feature`]: `# language: zh-TW
功能: ${title}

  這一段是寫給人讀的業務說明，不是給機器看的。
  沒有參與開發的人（PM、驗收方）打開這個檔案，要看得懂下面在驗什麼。

  # ── 這份檔案是什麼 ──────────────────────────────────────────────────
  # 它是**需求**，由人寫；agent 讀它、用 TDD 把它實現出來。
  # 綠幾條就是完成幾條 —— 這就是這個切片的「業務功能完成率」。
  #
  # 規格打的是 src/usecases/ 那一層（純 TS、零框架）。
  # 接線在 tests/specs/${name}.spec.ts，那支越薄越好。
  #
  # ── 完成率的分母 ────────────────────────────────────────────────────
  # 場景的**執行實例**數：一個「場景:」算 1，一個「場景大綱:」按「例子:」
  # 的每一列各算 1。綠一個實例，分子加 1。
  #
  # ── 三態 ────────────────────────────────────────────────────────────
  #   @待辦   有定義、還沒做   → 跳過執行、仍計入分母 → ⚠️ 警告，不擋
  #   沒有標  該做了           → 沒綠就是做到一半或做錯 → 🔴 擋下
  #
  # ⚠️ **@待辦 只有人能拿掉。** 拿掉的那一刻，就是在說「這條該做了」。
  # ⚠️ agent 不得修改這個檔案（含不得自己加上 @待辦）—— 見 AGENTS.md 的契約。
  #    這條沒有閘門在守，靠的是人讀規格的 diff。
  # ────────────────────────────────────────────────────────────────────

  背景:
    假設 系統裡有下列資料:
      | 編號  |
      | A-001 |
      | A-002 |
      | B-001 |

  場景: 不帶條件時列出全部
    當 查詢資料
    那麼 應該列出 3 筆

  場景大綱: 以關鍵字篩選
    當 以關鍵字 "<關鍵字>" 查詢資料
    那麼 應該列出 <筆數> 筆
    並且 總數應該是 <筆數>

    例子:
      | 關鍵字 | 筆數 |
      | A     | 2    |
      | B-001 | 1    |

  場景: 查無相符時回傳空清單，不是錯誤
    當 以關鍵字 "不存在的東西" 查詢資料
    那麼 應該列出 0 筆
    並且 不應該拋出錯誤

  # ⚠️ 底下這條是**範本留的示範**：它有定義、還沒做，所以是 ⚠️ 不是 🔴。
  # 把它換成這個切片真正的第一條業務規則，實現好之後拿掉 @待辦。
  @待辦
  場景: 換成這個切片真正的第一條業務規則
    當 查詢資料
    那麼 應該列出 3 筆

`,
    },

    src: {
      // ⚠️ **這個檔案不可以出現任何頂層 import／export。**
      // 有的話它就從全域腳本變成模組，而模組裡的 \`declare module "*.vue"\`
      // 不再是環境宣告 —— \`routes.ts\` 的 \`import("./views/…​.vue")\` 當場
      // 找不到模組。i18n 的那句 import 因此住在隔壁的 i18n.d.ts。
      "env.d.ts": `/// <reference types="vite/client" />

// Vue 單檔元件的型別橋接：tsgolint 不認識 .vue 副檔名。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
`,

      "i18n.d.ts": `// ── 模板裡的 \`$t\` 是一個相依，而它不長得像相依（C68）─────────────────
//
// \`$t\` 由 vue-i18n augment 到 \`ComponentCustomProperties\` 上。少了這一行，
// 這個切片**單獨拿出來型別檢查會噴一整排 TS2339**，而在 apps/console 的
// program 裡是 0 條 —— 因為 console 的 main.ts 有 \`import { createI18n }\`。
//
// ⚠️ 實測過三種寫法，只有這一種有效（package.json 宣告、\`/// <reference>\`
// 都無效）。而這一行的另一半價值是它**是一個 import** —— 幽靈相依檢查讀
// import，所以補完之後這個相依從此有人守。
//
// ⚠️ **為什麼自己一個檔案。** 併進 env.d.ts 會讓那個檔案變成模組，
// 於是裡面的 \`declare module "*.vue"\` 不再是環境宣告。實測時就是這樣紅的，
// 而且**只有 tsgolint 紅、vue-tsc 全綠** —— vue-tsc 真的解析 \`.vue\`，
// 根本不需要那個 shim。一行 import 的位置會決定另一支工具看不看得見半個切片。
import type {} from "vue-i18n";
`,

      // ⚠️ 型別與介面住在 ports.ts，不住在這裡 —— 這樣 usecase 層才拿得到它們
      // 而不必 import 資料存取的實作。零框架、零 HTTP 是那一層唯一的價值。
      "ports.ts": `/**
 * 本切片與外界之間的**介面**（TESTING.md 層 3）。
 *
 * 這個檔案零相依、純型別 —— 它同時被兩邊 import：
 *
 *   1. src/usecases/  — 業務規則，只認得這裡的介面
 *   2. src/api.ts     — 真實作，走 @org/http-client
 *
 * 分開的理由只有一個：**驗收規格要打得到業務規則，而且不能打到網路。**
 * 規格餵一個 in-memory 的 gateway 進去（見 tests/support/），
 * 跑起來的是同一份 usecase —— 不是「測試專用的另一條路」。
 */

export interface ${Pascal}Item {
  readonly id: string;
  // TODO: 補上這個切片實際的欄位
}

export interface ${Pascal}ListQuery {
  readonly page?: number;
}

export interface ${Pascal}ListResponse {
  readonly items: readonly ${Pascal}Item[];
  readonly total: number;
}

/**
 * 送進 usecase 的輸入。
 *
 * ⚠️ 它與 \`${Pascal}ListQuery\` **刻意不是同一個型別**：後者是傳給資料來源的
 * 東西，前者還包含由業務規則自己處理的條件（範本裡是 \`keyword\`）。
 * 合成一個的話，gateway 會收到一個它根本不看的欄位 —— 而下一個人會以為
 * 伺服器有在篩。
 */
export interface Query${Pascal}Input extends ${Pascal}ListQuery {
  readonly keyword?: string;
}

/**
 * 資料來源的介面。**usecase 只認得它，不認得 HTTP。**
 *
 * ⚠️ 換掉資料來源（改走 GraphQL、改走另一個 BFF）時，動的是 api.ts 的實作，
 * usecase 與規格一個字都不用改 —— 那正是這個介面存在的理由。
 */
export interface ${Pascal}Gateway {
  list(query: ${Pascal}ListQuery): Promise<${Pascal}ListResponse>;
}
`,

      "api.ts": `import { http } from "@org/http-client";

import type {
  ${Pascal}Gateway,
  ${Pascal}ListQuery,
  ${Pascal}ListResponse,
  Query${Pascal}Input,
} from "./ports.ts";

/**
 * 本切片的資料存取層 —— \`ports.ts\` 那個介面的**真實作**。
 *
 * 切片被禁止直接 import axios/fetch —— 一律走 @org/http-client，
 * CSRF 標頭與錯誤處理才會全 repo 一致，稽核時才證明得出來（D8）。
 */

export function fetch${Pascal}List(query: ${Pascal}ListQuery = {}): Promise<${Pascal}ListResponse> {
  const search = query.page === undefined ? "" : \`?page=\${String(query.page)}\`;
  return http.get<${Pascal}ListResponse>(\`/${name}\${search}\`);
}

/**
 * 送進 usecase 的正式 gateway。
 *
 * ⚠️ 它必須是**畫面真的在用的那一個** —— composable 拿的就是它。
 * 規格跑的是同一份 usecase，只是換一個 gateway 進去；
 * 兩邊各走各的路的話，規格全綠而畫面壞掉，沒有閘門看得見。
 */
export const ${camel}Gateway: ${Pascal}Gateway = {
  list: fetch${Pascal}List,
};

// 型別的公開出口留在這裡，使用端不必知道 ports.ts 的存在。
export type {
  ${Pascal}Item,
  ${Pascal}ListQuery,
  ${Pascal}ListResponse,
  Query${Pascal}Input,
} from "./ports.ts";

/**
 * TanStack Query 的 key 命名空間。
 * 第一段固定是切片名，兩個切片的快取因此不可能互相污染。
 */
export const ${camel}Keys = {
  all: ["${name}"] as const,
  // ⚠️ 參數是 usecase 的輸入而不是 gateway 的查詢 —— 少了業務條件那一半，
  // 篩選變了 queryKey 卻沒變，畫面停在舊資料上而且不報錯。
  list: (query: Query${Pascal}Input) => ["${name}", "list", query] as const,
  detail: (id: string) => ["${name}", "detail", id] as const,
} as const;
`,

      "store.ts": `import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * 切片內的 Pinia store（D13 / D14）。
 *
 * store id 用 "${name}/" 命名空間前綴，且定義在切片內部 ——
 * **不得有全域 store 目錄**，那是三層架構最常見的破口：
 * 一旦出現，兩個切片就會開始共用狀態，邊界當場失效。
 *
 * ── 這裡只放「客戶端才是權威」的東西 ───────────────────────────────────
 *
 * 判準：*這份資料如果和伺服器不一致，誰是錯的？*
 *
 *   伺服器是權威（列表資料本身）  → composables/use${Pascal}List.ts
 *   客戶端是權威（篩選、選取的 id）→ 這裡
 *   兩者都不是（選取的那幾筆物件）→ 哪裡都不放，用 computed 推導
 *
 * 一句話：**存 id，不存 entity。**
 * 一致性檢查會擋下 value import \`./api.ts\` 與 \`@tanstack/vue-query\`；
 * \`import type\` 允許（在 verbatimModuleSyntax 下會被完全抹除，無執行期效果）。
 */
export const use${Pascal}FilterStore = defineStore("${name}/filter", () => {
  const page = ref(1);

  /**
   * 被選取的那一筆 —— 只存 id。
   *
   * 這裡刻意**不放** \`selected${Pascal}Item\` 物件。放了就是第二份快取：
   * 列表重新整理之後對話框裡還是舊資料，而且不會有任何測試變紅。
   * 要那筆物件的時候，在元件裡用 \`computed\` 從列表推導（見 views/）。
   */
  const selectedId = ref<string | null>(null);

  const query = computed(() => ({ page: page.value }));

  function setPage(next: number): void {
    page.value = next;
  }

  function select(id: string | null): void {
    selectedId.value = id;
  }

  return { page, selectedId, query, setPage, select };
});
`,

      "routes.ts": `import type { RouteRecordRaw } from "vue-router";

/**
 * 本切片自己的路由樹，不碰任何共用 router 檔案（D7）。
 *
 * path 一律在 /${name} 之下、name 一律以 "${name}/" 開頭 ——
 * defineFeature 會在 dev 模式當場驗證，撞名不可能活到執行期。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: "/${name}",
    name: "${name}/list",
    component: () => import("./views/${Pascal}List.vue"),
    meta: { permissions: ["${name}:read"] },
  },
];
`,

      "index.ts": `import { defineFeature } from "@org/slice-kit";

import { routes } from "./routes.ts";

/**
 * ${title}切片對外的**唯一**公開契約（D7）。
 *
 * apps/<app>/src/features.ts 只 import 這個 default export ——
 * 新增一個切片 ＝ 改一個檔案、加一行。
 */
export default defineFeature({
  name: "${name}",

  routes,

  permissions: ["${name}:read"],

  i18n: {
    "zh-TW": {
      ${name === camel ? name : `"${name}"`}: {
        title: "${title}",
        empty: "目前沒有資料",
        detail: "明細",
        detailDescription: "這一筆的完整內容",
        close: "關閉",
      },
    },
    en: {
      ${name === camel ? name : `"${name}"`}: {
        title: "${Pascal}",
        empty: "No data",
        detail: "Detail",
        detailDescription: "Full contents of this record",
        close: "Close",
      },
    },
  },

  menu: [
    {
      labelKey: "${name}.title",
      routeName: "${name}/list",
      order: 100,
      permissions: ["${name}:read"],
    },
  ],
});

export type { ${Pascal}Item, ${Pascal}ListResponse } from "./api.ts";
`,

      // ⚠️ **業務規則住這裡，而且這一層在活的路徑上。**
      // 驗收規格打的是它（餵 in-memory gateway），composable 呼叫的也是它 ——
      // 兩邊各走各的路的話，規格全綠而畫面壞掉，沒有任何閘門看得見。
      usecases: {
        [`query-${name}.ts`]: `import type { ${Pascal}Gateway, ${Pascal}ListResponse, Query${Pascal}Input } from "../ports.ts";

/**
 * 查詢${title}。
 *
 * ── 這一層的規則只有三條（TESTING.md 層 3）────────────────────────────
 *
 *   1. **零框架相依**：不 import vue／pinia／vue-router／vue-i18n／vue-query，
 *      也不 import 任何 .vue
 *   2. **輸入輸出都是純資料**：沒有 ref、沒有 computed、沒有生命週期
 *   3. **業務規則住這裡**，composable 只負責把它接到畫面上
 *
 * 為什麼規格不直接打 composable：規格步驟一旦要掛載 Vue、建 pinia、造
 * QueryClient，那層設施就會貴到沒有專案組願意用 —— 而**沒人用就等於不存在**。
 *
 * ⚠️ 下面這條 \`keyword\` 篩選是**範本**，換成這個切片真正的業務規則。
 * 換的時候連 \`specs/${name}.feature\` 一起換 —— 那份規格才是「什麼叫做對」
 * 的定義，這裡只是它的實作。
 */
export async function query${Pascal}(
  gateway: ${Pascal}Gateway,
  input: Query${Pascal}Input = {},
): Promise<${Pascal}ListResponse> {
  const response = await gateway.list({ page: input.page });

  const keyword = input.keyword?.trim() ?? "";
  if (keyword === "") return response;

  const items = response.items.filter((item) => item.id.includes(keyword));

  // ⚠️ 篩選之後 total 改成**符合的筆數**，不是伺服器回的總數。
  // 這是一個業務決定（分頁器該顯示哪個數字），所以它被寫成規格的一條 ——
  // 不同意的話改規格，不要只改這一行。
  return { items, total: items.length };
}
`,
      },

      composables: {
        [`use${Pascal}List.ts`]: `import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from "vue";

import { ${camel}Gateway, ${camel}Keys, type ${Pascal}Item, type Query${Pascal}Input } from "../api.ts";
import { query${Pascal} } from "../usecases/query-${name}.ts";

/**
 * 本切片的取數邏輯（D14）。
 *
 * **元件只負責呈現，有狀態的邏輯住在這裡。** 一致性檢查會擋下
 * 直接在 views/ 裡 import \`@tanstack/vue-query\` 或 \`../api.ts\` 的寫法。
 *
 * 照 Vue 官方 composable 的三條慣例（vuejs.org/guide/reusability/composables）：
 *
 * 1. 輸入接受 ref／getter／純值，一律用 \`toValue()\` 正規化
 * 2. 回傳 ref 組成的**普通物件**（回傳 \`reactive()\` 的話，解構就斷開響應性）
 * 3. 只在 setup 期間同步呼叫
 *
 * ⚠️ queryKey 包 \`computed\` 是必要的：傳靜態值的話，條件變了不會重新取數，
 * 畫面停在舊資料上而且不報錯。
 */
export interface Use${Pascal}ListResult {
  readonly items: ComputedRef<readonly ${Pascal}Item[]>;
  readonly total: ComputedRef<number>;
  readonly isPending: Ref<boolean>;
  readonly isError: Ref<boolean>;
  readonly error: Ref<Error | null>;
}

export function use${Pascal}List(
  query: MaybeRefOrGetter<Query${Pascal}Input> = {},
): Use${Pascal}ListResult {
  const current = computed(() => toValue(query));

  const { data, isPending, isError, error } = useQuery({
    queryKey: computed(() => ${camel}Keys.list(current.value)),
    // ⚠️ 呼叫的是 **usecase**，不是 api.ts —— 業務規則只有一份，而驗收規格
    // 打的就是這一份。直接叫 fetch${Pascal}List 的話，規格驗的東西與畫面
    // 跑的東西會是兩條路。
    queryFn: () => query${Pascal}(${camel}Gateway, current.value),
  });

  return {
    items: computed(() => data.value?.items ?? []),
    total: computed(() => data.value?.total ?? 0),
    isPending,
    isError,
    error,
  };
}
`,
      },

      views: {
        [`${Pascal}List.vue`]: `<script setup lang="ts">
import { computed } from "vue";
import { UiButton, UiDialog } from "@org/ui";
import { use${Pascal}List } from "../composables/use${Pascal}List.ts";
import { use${Pascal}FilterStore } from "../store.ts";

/**
 * 這個元件**只負責呈現**（D14）。取數在 composables/use${Pascal}List.ts。
 *
 * 注意傳的是 **getter 而不是當下值** —— 傳值會讓條件變動後查詢不重跑。
 *
 * 畫面元件一律從 \`@org/ui\` 取用（D15）。一致性檢查會驗這個切片**真的用過**它：
 * 自己刻一顆按鈕不會違反任何一條規則，但第二個團隊也刻一顆之後，
 * 兩套永遠不會收斂 —— 而且兩邊各自看起來都是對的。
 */
const filter = use${Pascal}FilterStore();
const { items, isPending, isError, error } = use${Pascal}List(() => filter.query);

/**
 * 被選取的那一筆 —— **從列表推導，不從 store 讀**（D14）。
 * store 裡只有一個 id；把物件也存進去就是第二份快取。
 */
const selected = computed(() => items.value.find((item) => item.id === filter.selectedId));

const isOpen = computed({
  get: () => selected.value !== undefined,
  set: (open: boolean) => {
    if (!open) filter.select(null);
  },
});
</script>

<template>
  <section>
    <h1 class="text-xl font-semibold text-fg">{{ $t("${name}.title") }}</h1>

    <p v-if="isPending">…</p>

    <!--
      錯誤訊息一律以文字插值輸出，絕不使用 v-html。
      伺服器回傳的內容可能含使用者輸入，v-html 會讓它變成 XSS 入口。
      這條由 Tier 2 的 vue/no-v-html 強制（oxlint 沒有該規則）。
    -->
    <p v-else-if="isError" role="alert">{{ error?.message }}</p>

    <p v-else-if="items.length === 0">{{ $t("${name}.empty") }}</p>

    <ul v-else class="mt-4 flex flex-col gap-2">
      <li v-for="item in items" :key="item.id" class="flex items-center justify-between gap-4">
        <span>{{ item.id }}</span>
        <UiButton size="sm" @click="filter.select(item.id)">
          {{ $t("${name}.detail") }}
        </UiButton>
      </li>
    </ul>

    <!-- 對話框的內容由 \`selected\` 推導 —— D14 那條「存 id 不存 entity」在畫面上的樣子。 -->
    <UiDialog
      v-model:open="isOpen"
      :title="$t('${name}.detail')"
      :description="$t('${name}.detailDescription')"
    >
      <dl v-if="selected" class="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt class="text-fg-muted">#</dt>
        <dd>{{ selected.id }}</dd>
        <!-- TODO: 補上這個切片實際的欄位（與 api.ts 的 ${Pascal}Item 對齊） -->
      </dl>

      <template #close>
        <UiButton>{{ $t("${name}.close") }}</UiButton>
      </template>
    </UiDialog>
  </section>
</template>
`,
      },
    },

    tests: {
      // ⚠️ **副檔名是 .spec.ts，而它不是可以換的。**
      // vitest 的預設 include 只收 *.test.* 與 *.spec.*，而這條線的根層沒有
      // 覆寫 test.include。取名 .steps.ts（草稿原本的寫法）會讓整份規格
      // **一條都不被收集** —— runner 靜默不跑、既有的 tests/*.test.ts 繼續
      // 全綠、完成率讀的是一個從來沒有被執行過的檔案。實測見 C114。
      specs: {
        [`${name}.spec.ts`]: `import {
  describeFeature,
  loadFeature,
  setVitestCucumberConfiguration,
} from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import type {
  ${Pascal}Gateway,
  ${Pascal}Item,
  ${Pascal}ListResponse,
} from "../../src/ports.ts";
import { query${Pascal} } from "../../src/usecases/query-${name}.ts";
import { createInMemory${Pascal}Gateway } from "../support/in-memory-gateway.ts";

/**
 * 規格的**接線**，不是測試。它把 specs/${name}.feature 裡的中文句子接到
 * usecase 上。人讀的是那份 .feature，不是這一支 —— 這裡越薄越好。
 */

// ⚠️ 這一行是實測出來的**必要條件**，不是可選設定（C110）：
//
//   language    .feature 裡的「# language: zh-TW」標頭**本身不生效**。
//               少了這裡，parser 解析不出 Feature，錯誤訊息是
//               「TypeError: ...reading 'getScenario'」—— 完全看不出根因。
//   excludeTags @待辦 的場景若沒被排除，runner 會要求它**也要有接線**
//               （ScenarioNotCalledError），三態機制就做不出來。
//
// ⚠️ 兩件事靠同一行解決，而**這一行由 slice-gen 產生，不要刪**。
setVitestCucumberConfiguration({
  language: "zh-TW",
  excludeTags: ["待辦"],
  // ⚠️ 這兩個是**上游型別的缺陷，不是我們需要的設定**：VitestCucumberOptions
  // 把它們標成必填，而同一個檔案裡的 getVitestCucumberConfiguration 自己
  // 把它們 Omit 掉 —— 可見作者本意是可選。少了這兩行，產出的切片
  // 第一次跑 vp check 就是 TS2739（實測，C114）。
  predefinedSteps: [],
  mappedExamples: {},
});

// ⚠️ 路徑是 **package 相對**，不是從 monorepo 根目錄起算 ——
// vp run <pkg>#test 的 cwd 就是這個 package 的目錄（C111）。
const feature = await loadFeature("specs/${name}.feature");

describeFeature(feature, ({ Background, Scenario, ScenarioOutline }) => {
  let gateway: ${Pascal}Gateway;
  let result: ${Pascal}ListResponse;
  let thrown: unknown;

  Background(({ Given }) => {
    // ⚠️ 表格直接餵給假的 gateway，**不打真的 HTTP**。
    // 規格描述的是業務規則，不是網路行為。
    //
    // 欄位名是中文（規格用業務語言），翻譯成程式的欄位是**接線的工作** ——
    // 這正是這一支存在的理由。
    Given("系統裡有下列資料:", (_, table: { 編號: string }[]) => {
      const items: ${Pascal}Item[] = table.map((row) => ({ id: row.編號 }));
      gateway = createInMemory${Pascal}Gateway(items);
      thrown = undefined;
    });
  });

  Scenario("不帶條件時列出全部", ({ When, Then }) => {
    When("查詢資料", async () => {
      result = await query${Pascal}(gateway);
    });
    Then("應該列出 {number} 筆", (_, expected: number) => {
      expect(result.items).toHaveLength(expected);
    });
  });

  // ⚠️ **場景大綱的步驟表達式有兩種寫法，選哪一種由 .feature 的原文決定**
  // （實測，C114）—— runner 比對的是**還沒展開**的那一行：
  //
  //     .feature 原文              這裡要寫
  //     以關鍵字 "<關鍵字>" …      以關鍵字 {string} …   ← 帶引號，配得上 {string}
  //     應該列出 <筆數> 筆          應該列出 <筆數> 筆     ← 不帶引號，只能寫字面
  //
  // 兩種寫反都是 runner 當場報錯，不會安靜跳過（「No step match」／
  // 「does not exist」），所以這個坑會吵，不會爛在那裡。
  //
  // ⚠️ 值一律從 variables 拿，不從 step 的參數拿 —— 字面那一種根本沒有參數。
  ScenarioOutline("以關鍵字篩選", ({ When, Then, And }, variables) => {
    When("以關鍵字 {string} 查詢資料", async () => {
      result = await query${Pascal}(gateway, { keyword: String(variables.關鍵字) });
    });
    Then("應該列出 <筆數> 筆", () => {
      expect(result.items).toHaveLength(Number(variables.筆數));
    });
    And("總數應該是 <筆數>", () => {
      expect(result.total).toBe(Number(variables.筆數));
    });
  });

  Scenario("查無相符時回傳空清單，不是錯誤", ({ When, Then, And }) => {
    When("以關鍵字 {string} 查詢資料", async (_, keyword: string) => {
      // ⚠️ 這裡刻意接住例外而不是讓它冒出去 —— 下一個步驟要斷言的正是
      // 「沒有拋出」。直接 await 的話，拋了就變成一條看不出意圖的紅燈。
      try {
        result = await query${Pascal}(gateway, { keyword });
      } catch (error) {
        thrown = error;
      }
    });
    Then("應該列出 {number} 筆", (_, expected: number) => {
      expect(result.items).toHaveLength(expected);
    });
    And("不應該拋出錯誤", () => {
      expect(thrown).toBeUndefined();
    });
  });

  // ⚠️ 標了 @待辦 的場景**不在這裡出現** —— 它們被 excludeTags 擋在解析之外，
  // 所以不要求接線。人把 @待辦 拿掉的那一刻，那個場景就進入解析結果、
  // 找不到接線、紅燈 —— 那就是「該做了」。
});
`,
      },

      support: {
        // ⚠️ 住在 tests/support/ 而**不是** tests/specs/ —— 後者底下的 .spec.ts
        // 會被 vitest 當成測試檔收集，而這一支沒有任何 it()，會被判成
        // 「沒有測試的測試檔」。
        "in-memory-gateway.ts": `import type { ${Pascal}Gateway, ${Pascal}Item } from "../../src/ports.ts";

/**
 * 規格用的假資料來源。
 *
 * ⚠️ 它實作的是 **usecase 真的在用的那個介面** —— 不是「測試專用的另一條路」。
 * 換掉的只有資料從哪裡來，跑起來的業務規則與畫面上跑的是同一份。
 */
export function createInMemory${Pascal}Gateway(items: readonly ${Pascal}Item[]): ${Pascal}Gateway {
  return {
    list: () => Promise.resolve({ items, total: items.length }),
  };
}
`,
      },

      [`${name}.test.ts`]: `import { describe, it, expect } from "vitest";

import feature from "../src/index.ts";
import { ${camel}Keys } from "../src/api.ts";

/**
 * 切片的測試住在切片內。一致性檢查要求每個 features/* 至少有一支
 * tests/**\\/*.test.ts —— 沒有測試的切片＝沒有人能安全重構的切片。
 *
 * ⚠️ 這裡刻意不驗路由 name／權限碼／i18n 頂層 key 的命名空間：那些由
 * \`defineFeature\` 在 import 時驗，違規時上面那行 import 先炸，這支檔
 * 一條都跑不到，寫在這裡的斷言永遠不可達（C172）。所以這裡只放它不驗的事。
 */

describe("${name} 切片契約 —— defineFeature 不驗、只有這裡在守的", () => {
  it("選單項目指向本切片實際存在的路由（defineFeature 只驗前綴，不驗存在）", () => {
    const routeNames = new Set(feature.routes.map((route) => route.name));
    for (const item of feature.menu) {
      expect(routeNames.has(item.routeName)).toBe(true);
    }
  });
});

describe("query key 命名空間", () => {
  it("所有 key 以切片名開頭，兩個切片的快取不可能互相污染", () => {
    expect(${camel}Keys.all[0]).toBe("${name}");
    expect(${camel}Keys.list({})[0]).toBe("${name}");
    expect(${camel}Keys.detail("x")[0]).toBe("${name}");
  });
});

describe("命名空間斷言在 C172 刪掉的前提", () => {
  // defineFeature 只在 DEV 下驗。這一條紅的那天，這片的命名空間就沒有人在守了。
  it("import.meta.env.DEV 在這片的 vitest 底下是 true", () => {
    expect(import.meta.env.DEV).toBe(true);
  });
});
`,
    },
  };
}
