import { describe, it, expect } from "vitest";

import codemod from "../flatten-ui-theme-to-components.ts";

/**
 * codemod 也要有測試 —— 而且測試重點不是「它會不會改」，
 * 是「它**不會**改到不該改的東西」。
 *
 * 一個過度熱心的 codemod 跑過全 repo 之後造成的損害，
 * 比不做這次遷移大得多，而且要靠 code review 一行行看才找得回來。
 */

const run = (source: string): string | null => codemod.transform(source, "main.ts");

describe("flatten-ui-theme-to-components", () => {
  it("只有 variants", () => {
    expect(run(`createUiTheme({ variants: { secondary: "bg-surface" } })`)).toBe(
      `createUiTheme({ UiButton: { secondary: "bg-surface" } })`,
    );
  });

  it("只有 sizes", () => {
    expect(run(`createUiTheme({ sizes: { sm: "h-6" } })`)).toBe(
      `createUiTheme({ UiButton: { sm: "h-6" } })`,
    );
  });

  it("★ 兩格合併成一格，不是產生兩個 UiButton 鍵", () => {
    // 分別改名的話會產生重複鍵，而後者會靜靜蓋掉前者 ——
    // 症狀是「升級之後 variant 的覆寫沒了，size 的還在」。
    const migrated = run(
      `createUiTheme({ variants: { ghost: "bg-surface" }, sizes: { sm: "h-6" } })`,
    );
    expect(migrated).toBe(`createUiTheme({ UiButton: { ghost: "bg-surface", sm: "h-6" } })`);
    expect(migrated?.match(/UiButton:/g)).toHaveLength(1);
  });

  it("多行的呼叫", () => {
    const source = `const uiTheme = createUiTheme({
  variants: { secondary: "border-control border-accent bg-surface" },
});`;
    expect(run(source)).toContain(
      `UiButton: { secondary: "border-control border-accent bg-surface" }`,
    );
  });

  it("★ class 字串裡的括號與逗號不能讓括號配對算錯", () => {
    // `w-[min(32rem,92vw)]` 是 UiDialog 真的在用的字串。純深度計數會在這裡
    // 把物件切在半路，然後產生一個編不過的檔案。
    const source = `createUiTheme({ variants: { ghost: "w-[min(32rem,92vw)] p-6" } })`;
    expect(run(source)).toBe(`createUiTheme({ UiButton: { ghost: "w-[min(32rem,92vw)] p-6" } })`);
  });

  it("保留不認識的其他鍵", () => {
    const source = `createUiTheme({ variants: { ghost: "a" }, UiDialog: { overlay: "b" } })`;
    expect(run(source)).toBe(
      `createUiTheme({ UiButton: { ghost: "a" }, UiDialog: { overlay: "b" } })`,
    );
  });

  it("同一個檔案裡的兩個呼叫都要改到", () => {
    const source = `a(createUiTheme({ variants: { ghost: "x" } }));\nb(createUiTheme({ sizes: { sm: "y" } }));`;
    const migrated = run(source);
    expect(migrated).toContain(`{ UiButton: { ghost: "x" } }`);
    expect(migrated).toContain(`{ UiButton: { sm: "y" } }`);
  });
});

describe("🔴 不該改的東西", () => {
  it("新形狀是 no-op（冪等）", () => {
    expect(run(`createUiTheme({ UiButton: { secondary: "x" } })`)).toBeNull();
  });

  it("已經改過的檔案再跑一次不會再動", () => {
    const once = run(`createUiTheme({ variants: { ghost: "x" }, sizes: { sm: "y" } })`);
    expect(run(once as string)).toBeNull();
  });

  it("★ 認不出來的形狀原樣留著，不硬改", () => {
    // `variants: someVariable` 沒辦法安全地搬進 UiButton —— 那個變數可能同時
    // 含有 size。留著不動的話升級的人會在型別檢查那裡當場看到它，
    // 那是比較好的失敗方式。
    expect(run(`createUiTheme({ variants: PRESET })`)).toBeNull();
  });

  it("別的函式叫 variants 不受影響", () => {
    expect(run(`configure({ variants: { a: "b" } })`)).toBeNull();
  });

  it("巢狀在別處的 variants 不受影響", () => {
    // 只有 createUiTheme 的**頂層**鍵才是遷移目標。
    expect(run(`createUiTheme({ UiButton: { variants: "x" } })`)).toBeNull();
  });

  it("完全沒提到的檔案", () => {
    expect(run(`import { createApp } from "vue";`)).toBeNull();
  });
});
