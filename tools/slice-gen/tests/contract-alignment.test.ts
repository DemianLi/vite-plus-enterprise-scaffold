import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_FILES,
  BANNED_DIRECT_DEPENDENCIES,
  ALLOWED_VERSION_PROTOCOLS,
  slicePackageName,
  COMPOSABLES_DIR,
  VIEWS_DIR,
  VIEW_FORBIDDEN_IMPORTS,
  isValidComposableFile,
  composableFunctionName,
  usesDesignSystem,
  DESIGN_SYSTEM_PACKAGE,
  SLICE_DESIGN_SYSTEM_IMPORTS,
} from "@org/slice-kit/contract";

import { buildSliceFiles } from "../src/files.ts";
import { flattenPaths, assertCoversContract } from "../src/contract-shape.ts";

/**
 * 這組測試是 D9 的執行機制。
 *
 * 它驗的不是「產生器會不會壞」，而是**產生器與一致性檢查有沒有開始各說各話**。
 * 每一條斷言都直接讀 `@org/slice-kit/contract` 的常數 —— 契約一改，
 * 這裡就會告訴你產生器哪裡沒跟上，而不是等某個團隊產出一個過不了 CI 的切片。
 */

const options = { name: "order-history", title: "訂單紀錄", team: "@org/team-fulfillment" };
const files = buildSliceFiles(options);
const paths = flattenPaths(files);

function fileAt(path: string): string {
  let node: unknown = files;
  for (const part of path.split("/")) {
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") throw new Error(`${path} 不是檔案`);
  return node;
}

/** 設計系統 `@theme` 區塊裡宣告的代幣名。讀原始碼而不是抄一份清單（A1）。 */
function declaredThemeTokens(): ReadonlySet<string> {
  const path = resolve(
    fileURLToPath(import.meta.url),
    "../../../..",
    "platform/ui/src/styles/index.css",
  );
  const block = /@theme\s*\{([\s\S]*)\}/.exec(readFileSync(path, "utf8"));
  if (block === null) throw new Error(`${path} 裡找不到 @theme 區塊 —— 讀不到就不要給判決`);
  return new Set(
    [...(block[1] as string).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1] as string),
  );
}

function generatedPackageJson(): Record<string, Record<string, string> | string> {
  const raw = files["package.json"];
  if (typeof raw !== "string") throw new Error("package.json 不是檔案");
  return JSON.parse(raw) as Record<string, Record<string, string> | string>;
}

describe("產生器涵蓋契約的必要檔案", () => {
  it.each(REQUIRED_FILES)("產出 %s", (required) => {
    expect(paths).toContain(required);
  });

  it("assertCoversContract 對完整產出通過", () => {
    expect(() => assertCoversContract(paths)).not.toThrow();
  });

  it("契約新增項目而產生器沒跟上時，會明確報出缺哪一個", () => {
    expect(() => assertCoversContract(["package.json"])).toThrow(/未涵蓋契約要求/);
  });

  it("產出測試檔（一致性檢查要求 tests/**/*.test.ts）", () => {
    expect(paths.some((path) => path.startsWith("tests/") && path.endsWith(".test.ts"))).toBe(true);
  });
});

describe("產出的 package.json 符合一致性檢查", () => {
  const pkg = generatedPackageJson();
  const allDeps = {
    ...(pkg["dependencies"] as Record<string, string>),
    ...(pkg["devDependencies"] as Record<string, string>),
  };

  it("套件名符合契約推導的名稱", () => {
    expect(pkg["name"]).toBe(slicePackageName(options.name));
  });

  it("所有依賴都走 workspace: 或 catalog:，沒有寫死版本（D6）", () => {
    for (const [depName, version] of Object.entries(allDeps)) {
      const ok = ALLOWED_VERSION_PROTOCOLS.some((protocol) => version.startsWith(protocol));
      expect(ok, `${depName} 的版本 "${version}" 未使用允許的協定`).toBe(true);
    }
  });

  it("不直接依賴任何 HTTP 客戶端，一律走 @org/http-client（D8）", () => {
    for (const banned of BANNED_DIRECT_DEPENDENCIES) {
      expect(Object.keys(allDeps)).not.toContain(banned);
    }
  });

  it("不依賴任何其他切片（D4 硬規則）", () => {
    const crossSlice = Object.keys(allDeps).filter(
      (dep) => dep.startsWith("@org/feature-") && dep !== pkg["name"],
    );
    expect(crossSlice).toEqual([]);
  });

  it("透過 @org/http-client 取得資料存取能力", () => {
    expect(Object.keys(allDeps)).toContain("@org/http-client");
  });

  /**
   * ── 模板裡的 `$t` 是一個相依，而它不長得像相依（C68）──────────────
   *
   * 2026-08-17 之前，產生器產出的模板用 `$t`，而產出的 `package.json` 沒有
   * `vue-i18n`、`env.d.ts` 也沒有匯入它。症狀是**切片單獨拿出來型別檢查
   * 噴一整排 TS2339，而所有閘門全綠** —— 全域屬性不是 import，
   * `tools/conformance` 的幽靈相依檢查看不見它。
   *
   * 這條斷言刻意從**產出的模板**推導，不是寫死一組 `$t` ↔ `vue-i18n`：
   * 模板哪天不再用 `$t` 了，這條就自己失效，不會變成一條沒人敢刪的規則。
   */
  it("★ 模板用了 $t → 宣告與一句真的 import 兩處都要有（C68）", () => {
    const views = flattenPaths(files).filter((path) => path.endsWith(".vue"));
    expect(views.length).toBeGreaterThan(0);

    const usesGlobalT = views.some((path) => fileAt(path).includes("$t("));
    if (!usesGlobalT) return;

    expect(Object.keys(allDeps)).toContain("vue-i18n");
    // 只宣告是不夠的 —— 實測只加宣告仍然 10 條，要有一句真的 import 才會
    // 把 augmentation 帶進 program。放哪個 .d.ts 不重要，有就好。
    const declarations = flattenPaths(files).filter((path) => path.endsWith(".d.ts"));
    expect(declarations.some((path) => fileAt(path).includes('from "vue-i18n"'))).toBe(true);
  });

  /**
   * ⚠️ 上一條的陷阱：那句 import 放錯檔案會**把 `.vue` 的解析整個弄壞**。
   *
   * `env.d.ts` 一旦出現頂層 import／export 就從全域腳本變成模組，而模組裡的
   * `declare module "*.vue"` 不再是環境宣告 —— `routes.ts` 的
   * `import("./views/…​.vue")` 當場找不到模組。實作時就是這樣紅的。
   *
   * 而且它**只有 tsgolint 紅、vue-tsc 全綠**（vue-tsc 真的解析 `.vue`，
   * 不需要那個 shim）。所以這條不是「多寫一條保險」，是釘住一個
   * 兩支編譯器看法不同的位置 —— 那正是 C57 說會出事的地方。
   */
  it('★ env.d.ts 不得是模組 —— 否則 declare module "*.vue" 會失效', () => {
    const source = fileAt("src/env.d.ts");
    for (const line of source.split("\n")) {
      expect(line, `env.d.ts 出現頂層 import／export：${line}`).not.toMatch(/^(import|export)\s/);
    }
    expect(source).toContain('declare module "*.vue"');
  });
});

describe("產出的程式碼落在正確的命名空間", () => {
  function read(path: string): string {
    const parts = path.split("/");
    let node: unknown = files;
    for (const part of parts) {
      node = (node as Record<string, unknown>)[part];
    }
    if (typeof node !== "string") throw new Error(`${path} 不是檔案`);
    return node;
  }

  it("路由 name 與 path 帶切片前綴", () => {
    const routes = read("src/routes.ts");
    expect(routes).toContain('name: "order-history/list"');
    expect(routes).toContain('path: "/order-history"');
  });

  it("權限碼帶切片前綴", () => {
    expect(read("src/index.ts")).toContain('"order-history:read"');
  });

  it("Pinia store id 帶切片命名空間", () => {
    expect(read("src/store.ts")).toContain('defineStore("order-history/filter"');
  });

  it("query key 第一段是切片名", () => {
    expect(read("src/api.ts")).toContain('all: ["order-history"]');
  });

  it("kebab-case 正確轉成 PascalCase 與 camelCase 識別字", () => {
    expect(read("src/api.ts")).toContain("OrderHistoryListResponse");
    expect(read("src/api.ts")).toContain("orderHistoryKeys");
  });

  it("含連字號的切片名在 i18n 物件中以引號包裹（否則是語法錯誤）", () => {
    expect(read("src/index.ts")).toContain('"order-history": {');
  });

  it("產出的畫面不使用 v-html 指令（Tier 2 會擋，但產生器不該先犯）", () => {
    // 比對「指令用法」而非字串出現：產出的檔案刻意在註解裡提到 vue/no-v-html
    // 來說明為什麼錯誤訊息要用文字插值，單純 toContain("v-html") 會誤判。
    expect(read("src/views/OrderHistoryList.vue")).not.toMatch(/\sv-html\s*=/);
  });
});

/**
 * D14：產生器產出的切片，內部分層必須自己就過得了一致性檢查。
 *
 * 這組測試存在的理由與整個檔案一樣 —— 產生器是**教學品**。
 * 它示範什麼，團隊就長成什麼。原本的模板把 `useQuery` 直接寫在元件裡，
 * 於是每個新切片都從「取數混在呈現層」開始，而當時沒有任何檢查會說話。
 */
describe("產出的切片符合 D14 內部分層", () => {
  const composables = paths.filter((path) => path.startsWith(`${COMPOSABLES_DIR}/`));
  const views = paths.filter((path) => path.startsWith(`${VIEWS_DIR}/`));

  it("產出至少一個 composable —— 否則模板等於沒示範這一層", () => {
    expect(composables.length).toBeGreaterThan(0);
  });

  it("composable 檔名符合 useXxx.ts 且匯出同名函式", () => {
    for (const path of composables) {
      const fileName = path.split("/").pop() ?? "";
      expect(isValidComposableFile(fileName), `${path} 不符合 useXxx.ts`).toBe(true);

      const source = fileAt(path);
      expect(source, `${path} 沒有匯出 ${composableFunctionName(fileName)}`).toContain(
        `export function ${composableFunctionName(fileName)}`,
      );
    }
  });

  it("composable 照 Vue 官方慣例：toValue 正規化輸入、queryKey 包 computed", () => {
    const source = composables.map((path) => fileAt(path)).join("\n");
    // 少了 toValue，呼叫端就得自己解 .value，getter 傳進來會變成函式當成查詢條件。
    expect(source).toContain("toValue(");
    // queryKey 傳靜態值 → 條件變了不重新取數，畫面停在舊資料且不報錯。
    expect(source).toMatch(/queryKey:\s*computed\(/);
  });

  it("產出的元件不直接 import 資料層（這條由一致性檢查強制）", () => {
    expect(views.length).toBeGreaterThan(0);
    for (const path of views) {
      const source = fileAt(path);
      for (const banned of VIEW_FORBIDDEN_IMPORTS) {
        expect(source, `${path} 直接 import 了 ${banned}`).not.toContain(`from "${banned}"`);
      }
      expect(source, `${path} 直接 import 了 api.ts`).not.toContain(`from "../api.ts"`);
    }
  });

  it("產出的元件確實透過 composable 取數（不是單純把邏輯刪掉）", () => {
    // 少了這一條，上面那條「不 import 資料層」可以靠產出一個空元件通過。
    const source = views.map((path) => fileAt(path)).join("\n");
    expect(source).toMatch(/from "\.\.\/composables\/use[A-Z]/);
  });
});

/**
 * D15：產生器產出的切片，必須自己就通過設計系統的**兩條**規則。
 *
 * ── 為什麼這組測試是這次工作的核心 ──────────────────────────────────
 *
 * D15 落地的時候只改到 `features/order`。產生器完全不知道 `@org/ui` 存在，
 * 模板的 view 是一顆裸 `<h1>` —— 也就是說**每一個新產生的切片，
 * 都會從「不使用設計系統」開始**，而當時沒有任何檢查會說話。
 *
 * 這正是 C35 那個形狀：產生器是**教學品**，它示範什麼，團隊就長成什麼。
 * 一致性檢查擋得住既有切片，但擋不住「模板本身教錯」——
 * 除非產生器的輸出也拿同一份判定式驗一次。
 *
 * 所以這裡用的 `usesDesignSystem` 與 `tools/conformance` 是**同一個函式**，
 * 不是「長得很像的另一份實作」。
 */
describe("產出的切片符合 D15 設計系統規則", () => {
  const sources = paths
    .filter((path) => path.endsWith(".vue") || path.endsWith(".ts"))
    .map((path) => fileAt(path));

  it("整個切片至少一處使用 @org/ui —— 與 tools/conformance 同一個判定式", () => {
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((source) => usesDesignSystem(source))).toBe(true);
  });

  it("用的是 view 而不是別的地方 —— 設計系統要出現在畫面上", () => {
    // 上一條可以靠在 store.ts 裡 import 一個沒用到的元件通過。
    const viewSources = paths
      .filter((path) => path.startsWith(`${VIEWS_DIR}/`))
      .map((path) => fileAt(path));
    expect(viewSources.length).toBeGreaterThan(0);
    expect(viewSources.some((source) => usesDesignSystem(source))).toBe(true);
  });

  it("元件真的被渲染，不是只 import 不用", () => {
    // 只 import 不用會被 Tier 1 的 no-unused-vars 擋，但那是另一道閘門的事；
    // 這裡直接驗模板有沒有真的示範用法 —— 產生器是教學品。
    const view = fileAt(`${VIEWS_DIR}/OrderHistoryList.vue`);
    expect(view).toMatch(/<UiButton[\s>]/);
  });

  it("package.json 宣告了 @org/ui（否則 import 得到只是 monorepo 的巧合）", () => {
    const pkg = generatedPackageJson();
    const deps = pkg["dependencies"] as Record<string, string>;
    expect(Object.keys(deps)).toContain(DESIGN_SYSTEM_PACKAGE);
    expect(deps[DESIGN_SYSTEM_PACKAGE]).toBe("workspace:*");
  });

  it("不直接 import 設計系統的底層（那是另一條 D15 規則）", () => {
    for (const source of sources) {
      for (const banned of SLICE_DESIGN_SYSTEM_IMPORTS) {
        expect(source, `產生器產出了直接 import "${banned}" 的程式碼`).not.toContain(
          `from "${banned}"`,
        );
      }
    }
  });

  /**
   * ⚠️ 這一條與 `tools/theme-verify` 的懸空引用檢查**故意重疊，但看的不是同一件事**。
   *
   * 2026-08-17 的實測：`--color-muted` 改名成 `--color-fg-muted` 之後，模板裡的
   * 引用留在原地，而且是**這個檔案**把它複製給之後每一個切片。那次是靠產物裡
   * 的懸空 `var()` 抓到的 —— 但那條路徑有個死角：
   *
   *   括號寫法 `text-(--沒有的代幣)`  → Tailwind 照樣編出規則，var() 懸空 → 抓得到
   *   工具類名 `text-沒有的代幣`       → Tailwind **什麼都不產生**       → 抓不到
   *
   * 也就是改用正規工具類名之後，同一個錯誤反而變得**更安靜**。所以模板這一側
   * 要有一條原始碼層的耦合：代幣改名時，這裡會紅。
   */
  it("★ 模板用到的語意代幣真的在設計系統裡（代幣改名時這裡要紅）", () => {
    const tokens = declaredThemeTokens();
    // 讀不到代幣時下面兩條會恆真 —— 先擋掉那種綠燈。
    expect(tokens.size).toBeGreaterThan(10);

    const view = fileAt(`${VIEWS_DIR}/OrderHistoryList.vue`);
    expect(tokens.has("--color-fg-muted")).toBe(true);
    expect(view).toContain("text-fg-muted");
  });

  it("★ 括號寫法引用的代幣也要存在（現在是 0 處，所以連植入的情況一起驗）", () => {
    const tokens = declaredThemeTokens();
    const referenced = (source: string): string[] =>
      [...source.matchAll(/\((--[a-z0-9-]+)\)/g)].map((match) => match[1] as string);

    for (const source of sources) {
      for (const name of referenced(source)) {
        expect(tokens.has(name), `模板引用了不存在的代幣 ${name}`).toBe(true);
      }
    }

    /*
     * 模板現在一處括號寫法都沒有，上面那圈是空的。少了下面這一行，
     * 這條測試會在判定式壞掉時照樣通過。
     *
     * ⚠️ **這個反例不能整段寫成字面值，而它第一版就是。** Tailwind 的
     * `@source` 掃 `.ts`，於是這一行植入的假類別被編成一條真的 CSS 規則，
     * 指向一個不存在的代幣 —— `tools/theme-verify` 的「引用」那一段當場紅了，
     * 抓到的是**寫來驗證它的那條測試**。同一個形狀在這個 repo 的第四次。
     *
     * 所以名字拆出來組回去：掃描器是純文字的，看不到完整的候選字。
     */
    const notAToken = "--color-gone";
    expect(referenced(`<dt class="text-(${notAToken})">`)).toEqual([notAToken]);
    expect(tokens.has("--color-gone")).toBe(false);
  });

  it("判定式對「沒用設計系統的 view」確實回傳 false（否則上面全是空轉）", () => {
    // 這是 D15 落地前模板長的樣子。少了這一條，`usesDesignSystem` 只要
    // 永遠回傳 true，這個 describe 的每一條都會通過。
    const before = `<script setup lang="ts">
import { useOrderHistoryList } from "../composables/useOrderHistoryList.ts";
</script>

<template><section><h1>{{ $t("order-history.title") }}</h1></section></template>
`;
    expect(usesDesignSystem(before)).toBe(false);
  });
});

/**
 * D14：模板的 store 註解宣稱「存 id，不存 entity」，那就要真的示範一次。
 *
 * 這條是 C39 撈到的同一個形狀 —— `features/order` 的 store 也是先有那段
 * 註解、很久之後才有 `selectedId`。文件描述了一個它沒有示範的模式，
 * 而讀模板的人只會照抄看得到的部分。
 */
describe("產出的 store 示範了它自己註解裡宣稱的模式", () => {
  const store = fileAt("src/store.ts");

  it("有 selectedId（客戶端才是權威的東西）", () => {
    expect(store).toContain("selectedId");
  });

  it("沒有把 entity 整個存進 store", () => {
    // 比對的是**實際形狀**（一個持有 entity 的 ref），不是名字有沒有出現 ——
    // 第一版寫成 `.not.toMatch(/OrderHistoryItem/)`，當場被自己的模板打臉：
    // store 的註解裡就寫著「這裡刻意不放 OrderHistoryItem 物件」。
    // 提到一個名字和使用它是兩回事，這正是 conformance 的 importClauseBefore
    // 在處理的同一件事（見 tools/conformance/src/cli.ts 的註解）。
    expect(store).not.toMatch(/ref<[^>]*Item/);
    expect(store).toContain("ref<string | null>(null)");
  });

  it("view 用 computed 從列表推導那筆物件，而不是從 store 讀", () => {
    const view = fileAt(`${VIEWS_DIR}/OrderHistoryList.vue`);
    expect(view).toMatch(/computed\(\(\) =>\s*items\.value\.find/);
  });
});
