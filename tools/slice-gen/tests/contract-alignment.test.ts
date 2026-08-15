import { describe, it, expect } from "vitest";
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
