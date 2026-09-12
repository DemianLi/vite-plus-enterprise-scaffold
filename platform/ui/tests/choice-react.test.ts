// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiCheckbox } from "../src/components/UiCheckbox.tsx";
import { UiLabel } from "../src/components/UiLabel.tsx";
import { UiRadioGroup } from "../src/components/UiRadioGroup.tsx";
import { UiRadioItem } from "../src/components/UiRadioItem.tsx";
import { UiSwitch } from "../src/components/UiSwitch.tsx";
import { UiTabs } from "../src/components/UiTabs.tsx";
import { UiTabsPanel } from "../src/components/UiTabsPanel.tsx";
import { createUiTheme } from "../src/theme-context.tsx";

/**
 * 經過 Base UI 基元的那幾支，React 版的行為（C236）。
 *
 * 這幾支的 DOM 與 Vue 版不同（reka 的勾選類是 `<button>`，Base UI 是 `<span>` ＋ 隱藏的
 * `<input>`），所以 `react-parity.test.ts` 的 SSR 比對對它們沒有意義 —— Vue 版檔頭寫下的
 * 那幾條保證（標籤接得上、點標籤會切換、沒給值時選第一個分頁）要在 Base UI 上**重新量**，
 * 不能從 Vue 版繼承。
 *
 * ⚠️ 「名字接得上」量的是 `aria-labelledby` 指到的元素的文字 —— 本 repo 量不到瀏覽器算出來的
 * 可及名稱（C89），這是那一條的代理。
 */

afterEach(cleanup);

function labelledText(element: Element): string {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(" ").filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

describe("UiCheckbox（React）", () => {
  it("⭐ 名字接得上：role=checkbox 的 aria-labelledby 指到那段標籤文字", () => {
    render(createElement(UiCheckbox, { label: "同意條款" }));
    expect(labelledText(screen.getByRole("checkbox"))).toBe("同意條款");
  });

  it("⭐ 標籤的 for 指到一個可以被標籤的元素 —— 指到 span 的話點了什麼都不會發生", () => {
    const { container } = render(createElement(UiCheckbox, { label: "同意條款" }));
    const label = container.querySelector("label");
    const target = document.getElementById(label?.htmlFor ?? "");
    expect(target?.tagName).toBe("INPUT");
  });

  it("⭐ 點標籤會切換，而且回報新值", () => {
    const onCheckedChange = vi.fn();
    const { container } = render(createElement(UiCheckbox, { label: "同意條款", onCheckedChange }));
    fireEvent.click(container.querySelector("label") as HTMLLabelElement);
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
  });

  it("點方塊本身也會切換", () => {
    render(createElement(UiCheckbox, { label: "同意條款" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });

  it("受控：checked 為 true 時勾勾在，為 false 時不在", () => {
    const { rerender } = render(createElement(UiCheckbox, { label: "甲", checked: true }));
    expect(screen.getByRole("checkbox").querySelector("svg")).not.toBeNull();
    rerender(createElement(UiCheckbox, { label: "甲", checked: false }));
    expect(screen.getByRole("checkbox").querySelector("svg")).toBeNull();
  });

  it("children 取代 label —— 同 Vue 版的預設 slot", () => {
    render(createElement(UiCheckbox, { label: "不會出現" }, "我已閱讀"));
    expect(labelledText(screen.getByRole("checkbox"))).toBe("我已閱讀");
  });

  it("標籤雙擊不反白 —— 與 UiLabel 同一個做法", () => {
    const { container } = render(createElement(UiCheckbox, { label: "甲" }));
    expect(container.querySelector("label")?.className.split(" ")).toContain("select-none");
  });

  it("★ 覆寫整條替換掉標籤那一格，select-none 仍在 —— 它是行為不是樣式", () => {
    const UiTheme = createUiTheme({ UiCheckbox: { label: "text-base text-fg" } });
    const { container } = render(
      createElement(UiTheme, null, createElement(UiCheckbox, { label: "甲" })),
    );
    const classes = container.querySelector("label")?.className.split(" ") ?? [];
    expect(classes).toContain("text-base");
    expect(classes).toContain("select-none");
  });
});

describe("UiRadioGroup ＋ UiRadioItem（React）", () => {
  function group(props: { value?: string; onValueChange?: (value: string) => void } = {}): void {
    render(
      createElement(
        UiRadioGroup,
        props,
        createElement(UiRadioItem, { value: "a", label: "郵寄" }),
        createElement(UiRadioItem, { value: "b", label: "自取" }),
      ),
    );
  }

  it("⭐ 每一項的名字都接得上", () => {
    group();
    expect(screen.getAllByRole("radio").map(labelledText)).toEqual(["郵寄", "自取"]);
  });

  it("⭐ 點第二項的標籤會選中它，而且回報它的 value", () => {
    const onValueChange = vi.fn();
    group({ onValueChange });
    fireEvent.click(screen.getByText("自取"));
    const [first, second] = screen.getAllByRole("radio");
    expect(second?.getAttribute("aria-checked")).toBe("true");
    expect(first?.getAttribute("aria-checked")).toBe("false");
    expect(onValueChange.mock.calls[0]?.[0]).toBe("b");
  });

  it("沒給 value 時一開始沒有選中 —— 同 Vue 版的空字串預設", () => {
    group();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-checked"))).toEqual(
      ["false", "false"],
    );
  });

  it("受控：value 決定選中哪一項", () => {
    group({ value: "b" });
    expect(screen.getAllByRole("radio")[1]?.getAttribute("aria-checked")).toBe("true");
  });
});

describe("UiSwitch（React）", () => {
  it("⭐ 外面的 UiLabel ＋ 同一個 id，名字接得上 role=switch", () => {
    render(
      createElement(
        "div",
        null,
        createElement(UiLabel, { htmlFor: "dark" }, "深色模式"),
        createElement(UiSwitch, { id: "dark" }),
      ),
    );
    expect(labelledText(screen.getByRole("switch"))).toBe("深色模式");
  });

  it("aria-label 落在 role=switch 那個元素上 —— Vue 版靠 fallthrough 的那一格", () => {
    render(createElement(UiSwitch, { "aria-label": "通知" }));
    expect(screen.getByRole("switch").getAttribute("aria-label")).toBe("通知");
  });

  it("點一下切換，而且回報新值", () => {
    const onCheckedChange = vi.fn();
    render(createElement(UiSwitch, { "aria-label": "通知", onCheckedChange }));
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
  });
});

describe("UiTabs ＋ UiTabsPanel（React）", () => {
  const items = [
    { value: "orders", label: "訂單" },
    { value: "shipments", label: "出貨" },
  ];

  function tabs(props: { value?: string; onValueChange?: (value: string) => void } = {}): void {
    render(
      createElement(
        UiTabs,
        { items, ...props },
        createElement(UiTabsPanel, { value: "orders" }, "訂單內容"),
        createElement(UiTabsPanel, { value: "shipments" }, "出貨內容"),
      ),
    );
  }

  const selected = (): readonly (string | null)[] =>
    screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected"));

  it("⭐ 沒給 value 時選第一個分頁 —— 少了它是一排按鈕配一片空白", () => {
    tabs();
    expect(selected()).toEqual(["true", "false"]);
    expect(screen.queryByText("訂單內容")).not.toBeNull();
  });

  it("⭐ value 給空字串也選第一個 —— 同 Vue 版的 current", () => {
    tabs({ value: "" });
    expect(selected()).toEqual(["true", "false"]);
  });

  it("點第二個分頁會切過去，回報它的 value，面板跟著換", () => {
    const onValueChange = vi.fn();
    tabs({ onValueChange });
    fireEvent.click(screen.getByRole("tab", { name: "出貨" }));
    expect(selected()).toEqual(["false", "true"]);
    expect(onValueChange.mock.calls[0]?.[0]).toBe("shipments");
    expect(screen.queryByText("出貨內容")).not.toBeNull();
  });

  it("受控：value 決定選中哪一個", () => {
    tabs({ value: "shipments" });
    expect(selected()).toEqual(["false", "true"]);
  });
});

describe("UiLabel（React）", () => {
  /**
   * Vue 版的「雙擊不反白」是 reka-ui `Label` 的 mousedown 處理器；React 版改用 `select-none`
   * （C236，理由見 `UiLabel.tsx`）。happy-dom 不算選取範圍，所以這裡守的是 class 在不在；
   * 那個 class 真的編得出 `user-select: none` 由 `a11y.test.ts` 的產物實測那一組同一招可驗。
   */
  it("⭐ 雙擊不反白：標籤帶 select-none", () => {
    render(createElement(UiLabel, { htmlFor: "x" }, "姓名"));
    expect(screen.getByText("姓名").className.split(" ")).toContain("select-none");
  });

  it("標籤上沒有 mousedown 處理器 —— 那會把 jsx-a11y 的判定換回來", () => {
    render(createElement(UiLabel, { htmlFor: "x" }, "姓名"));
    expect(fireEvent.mouseDown(screen.getByText("姓名"), { detail: 2 })).toBe(true);
  });
});
