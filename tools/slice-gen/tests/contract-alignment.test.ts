import { describe, it, expect } from "vitest";
import {
  REQUIRED_FILES,
  BANNED_DIRECT_DEPENDENCIES,
  ALLOWED_VERSION_PROTOCOLS,
  slicePackageName,
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
