import { describe, it, expect } from "vitest";

import codemod from "../rename-feature-kit-to-slice-kit.ts";

/**
 * codemod 也要有測試 —— 而且測試重點不是「它會不會改」，
 * 是「它**不會**改到不該改的東西」。
 *
 * 一個過度熱心的 codemod 跑過全 repo 之後造成的損害，
 * 比不做這次遷移大得多，而且要靠 code review 一行行看才找得回來。
 */

describe("rename-feature-kit-to-slice-kit", () => {
  it("改寫具名 import", () => {
    expect(codemod.transform('import { defineFeature } from "@org/feature-kit";', "x.ts")).toBe(
      'import { defineFeature } from "@org/slice-kit";',
    );
  });

  it("改寫子路徑 import", () => {
    expect(
      codemod.transform('import { REQUIRED_FILES } from "@org/feature-kit/contract";', "x.ts"),
    ).toBe('import { REQUIRED_FILES } from "@org/slice-kit/contract";');
  });

  it("改寫單引號寫法", () => {
    expect(codemod.transform("import x from '@org/feature-kit';", "x.ts")).toBe(
      "import x from '@org/slice-kit';",
    );
  });

  it("改寫 package.json 裡的依賴宣告", () => {
    expect(codemod.transform('"@org/feature-kit": "workspace:*"', "package.json")).toBe(
      '"@org/slice-kit": "workspace:*"',
    );
  });

  // ── 以下是這組測試真正的重點 ────────────────────────────────────────

  it("**不**改動註解或說明文字中提及的舊名（那是歷史紀錄）", () => {
    const source = "// 本套件原名 @org/feature-kit，因命名撞號而改名（C5）";
    expect(codemod.transform(source, "x.ts")).toBeNull();
  });

  it("**不**誤傷名稱以舊名為前綴的其他套件", () => {
    const source = 'import x from "@org/feature-kit-legacy";';
    expect(codemod.transform(source, "x.ts")).toBeNull();
  });

  it("**不**改動切片自己的 @org/feature-* 套件名", () => {
    const source = 'import order from "@org/feature-order";';
    expect(codemod.transform(source, "x.ts")).toBeNull();
  });

  it("沒有命中時回傳 null，讓執行器跳過寫檔", () => {
    expect(codemod.transform('import { x } from "@org/slice-kit";', "x.ts")).toBeNull();
  });

  it("是冪等的：對已遷移的內容重跑不再改動", () => {
    const migrated = 'import { defineFeature } from "@org/slice-kit";';
    expect(codemod.transform(migrated, "x.ts")).toBeNull();
  });

  it("一個檔案內的多處出現全部改到", () => {
    const source = [
      'import { defineFeature } from "@org/feature-kit";',
      'import { REQUIRED_FILES } from "@org/feature-kit/contract";',
    ].join("\n");
    const result = codemod.transform(source, "x.ts");
    expect(result).not.toContain("@org/feature-kit");
    expect(result?.match(/@org\/slice-kit/g)).toHaveLength(2);
  });
});
