import { describe, it, expect } from "vitest";

import codemod from "../slice-routes-and-hooks.ts";

const ROUTES_BEFORE = `import type { RouteRecordRaw } from "vue-router";

export const routes: RouteRecordRaw[] = [];
`;

describe("slice-routes-and-hooks", () => {
  it("路由的型別 import 與標註一起換", () => {
    expect(codemod.transform(ROUTES_BEFORE, "routes.ts")).toBe(
      `import type { SliceRoute } from "@org/slice-kit";

export const routes: SliceRoute[] = [];
`,
    );
  });

  it("契約的三個 hook 名字", () => {
    const source =
      'import { COMPOSABLES_DIR, isValidComposableFile, composableFunctionName } from "@org/slice-kit/contract";';
    expect(codemod.transform(source, "layering.ts")).toBe(
      'import { HOOKS_DIR, isValidHookFile, hookFunctionName } from "@org/slice-kit/contract";',
    );
  });

  // ── 以下是不該改的 ───────────────────────────────────────────────────

  it("**不**動 RouteRecordRaw 跟著執行期名字一起 import 的句子 —— 拆那一句要語意分析", () => {
    const source =
      'import { createRouter, type RouteRecordRaw } from "vue-router";\nconst r: RouteRecordRaw[] = [];\n';
    expect(codemod.transform(source, "main.ts")).toBeNull();
  });

  it("**不**動名字以舊名為前綴的其他識別字", () => {
    expect(codemod.transform("const COMPOSABLES_DIR_LEGACY = 1;", "x.ts")).toBeNull();
    expect(codemod.transform("type RouteRecordRawish = 1;", "x.ts")).toBeNull();
  });

  it("沒有命中時回傳 null，讓執行器跳過寫檔", () => {
    expect(codemod.transform('import { HOOKS_DIR } from "@org/slice-kit/contract";', "x.ts")).toBeNull();
  });

  it("是冪等的：對已遷移的內容重跑不再改動", () => {
    const migrated = codemod.transform(ROUTES_BEFORE, "routes.ts");
    expect(migrated).not.toBeNull();
    expect(codemod.transform(migrated ?? "", "routes.ts")).toBeNull();
  });
});
