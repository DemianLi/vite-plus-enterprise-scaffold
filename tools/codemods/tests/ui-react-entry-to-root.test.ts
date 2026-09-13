import { describe, expect, it } from "vitest";

import codemod from "../ui-react-entry-to-root.ts";

describe("ui-react-entry-to-root", () => {
  it("改寫具名 import", () => {
    expect(codemod.transform('import { UiButton, UiDialog } from "@org/ui/react";', "x.tsx")).toBe(
      'import { UiButton, UiDialog } from "@org/ui";',
    );
  });

  it("改寫單引號寫法", () => {
    expect(codemod.transform("import { cn } from '@org/ui/react';", "x.ts")).toBe(
      "import { cn } from '@org/ui';",
    );
  });

  it("改寫產生器範本字串裡的 import（slice-gen 的模板是字串，照樣要遷）", () => {
    const template = 'const view = `import { UiButton } from "@org/ui/react";\\n`;';
    expect(codemod.transform(template, "files.ts")).toBe(
      'const view = `import { UiButton } from "@org/ui";\\n`;',
    );
  });

  // ── 以下是重點：不該動的 ────────────────────────────────────────────

  it("**不**改動註解或說明文字裡提到的舊路徑", () => {
    const source = "// C235 期間 React 元件從 @org/ui/react 取";
    expect(codemod.transform(source, "x.ts")).toBeNull();
  });

  it("**不**誤傷以舊路徑為前綴的其他子路徑", () => {
    expect(codemod.transform('import x from "@org/ui/react-extras";', "x.ts")).toBeNull();
    expect(codemod.transform('import x from "@org/ui/reactive";', "x.ts")).toBeNull();
  });

  it("**不**改動 `@org/ui` 自己與它的其他子路徑", () => {
    expect(codemod.transform('import "@org/ui/styles.css";', "x.ts")).toBeNull();
    expect(codemod.transform('import { cn } from "@org/ui";', "x.ts")).toBeNull();
  });

  it("是冪等的：對已遷移的內容重跑不再改動", () => {
    const once = codemod.transform('import { UiButton } from "@org/ui/react";', "x.tsx") as string;
    expect(codemod.transform(once, "x.tsx")).toBeNull();
  });
});
