// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiButton } from "../src/components/UiButton.tsx";
import { createUiTheme } from "../src/theme-context.tsx";

/**
 * React 版 `UiButton` 的行為（C235）。對照的是 `UiButton.vue` 的語意，不是 shadcn 的 ——
 * 產出是素材，契約照舊（Q58）。
 *
 * 用 `createElement` 而不寫 JSX：測試檔若是 `.tsx`，`styles/index.css` 的
 * `@source not "…/*.test.ts"` 排不到它，測試字面值會變成正式產物的 CSS 規則。
 */

afterEach(cleanup);

function button(): HTMLButtonElement {
  return screen.getByRole("button") as HTMLButtonElement;
}

describe("UiButton（React）", () => {
  it("預設 type 是 button —— 放進表單不會意外送出", () => {
    render(createElement(UiButton, null, "存檔"));
    expect(button().type).toBe("button");
  });

  it("預設 variant 是 secondary、size 是 md", () => {
    render(createElement(UiButton, null, "存檔"));
    expect(button().className).toContain("bg-surface");
    expect(button().className).toContain("h-10");
  });

  it("disabled 時點不下去", () => {
    const onClick = vi.fn();
    render(createElement(UiButton, { disabled: true, onClick }, "刪除"));
    fireEvent.click(button());
    expect(button().disabled).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("onClick 接得上", () => {
    const onClick = vi.fn();
    render(createElement(UiButton, { onClick }, "送出"));
    fireEvent.click(button());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("createUiTheme（React）", () => {
  it("覆寫是整條替換，不是附加 —— 同 UiButton.vue", () => {
    const UiTheme = createUiTheme({ UiButton: { secondary: "bg-accent text-on-accent" } });
    render(createElement(UiTheme, null, createElement(UiButton, null, "存檔")));
    expect(button().className).toContain("bg-accent");
    // 附加語意的話預設那一條會留著，而 tailwind-merge 只擋得掉它認得的衝突。
    expect(button().className).not.toContain("border-line");
  });

  it("只換覆寫到的那一格 —— size 那一格照舊", () => {
    const UiTheme = createUiTheme({ UiButton: { secondary: "bg-accent" } });
    render(createElement(UiTheme, null, createElement(UiButton, null, "存檔")));
    expect(button().className).toContain("h-10");
  });

  it("★ 沒有 UiTheme 包著時用預設值 —— context 的預設不是 undefined", () => {
    render(createElement(UiButton, { variant: "danger" }, "刪除"));
    expect(button().className).toContain("bg-danger");
  });

  it("🔴 兩道防線與 Vue 版是同一份", () => {
    expect(() => createUiTheme({})).toThrow(/沒有收到任何覆寫/);
    expect(() => createUiTheme({ UiButton: { primary: " " } })).toThrow(/UiButton\.primary/);
  });
});
