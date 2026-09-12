// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiSelect } from "../src/components/UiSelect.tsx";
import { pressOn, settle } from "./overlay-react.ts";

/**
 * `UiSelect` 的 React 版（C237）。Vue 版的行為全交給 reka；React 版多了一段自己寫的
 * 轉換 —— 對外的「空字串＝沒選」對 Base UI 的 `null` —— 那一段要量。
 * `UiField` 接線（C101）在 `field-wiring-react.test.ts`。
 */

afterEach(cleanup);

const ITEMS = [
  { value: "a", label: "甲等" },
  { value: "b", label: "乙等" },
] as const;

type Props = Partial<ComponentProps<typeof UiSelect>>;

function mountSelect(props: Props = {}): void {
  render(createElement(UiSelect, { items: ITEMS, placeholder: "選一個等級", ...props }));
}

function triggerEl(): HTMLElement {
  const element = document.querySelector('[data-slot="select"]');
  expect(element, "找不到觸發鈕").not.toBeNull();
  return element as HTMLElement;
}

const options = (): readonly HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[role="option"]'),
];

describe("UiSelect（React）", () => {
  it("觸發鈕是 combobox，箭頭對輔具隱藏", () => {
    mountSelect();
    expect(triggerEl().getAttribute("role")).toBe("combobox");
    expect(triggerEl().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("沒給 value 時顯示 placeholder，觸發鈕帶 data-placeholder —— 淡色字那一格選的就是它", () => {
    mountSelect();
    expect((triggerEl().textContent ?? "").trim()).toBe("選一個等級");
    expect(triggerEl().hasAttribute("data-placeholder")).toBe(true);
  });

  it("value 給空字串也是「沒選」—— 同 Vue 版", () => {
    // ⚠️ 拿掉元件裡「空字串 → null」那一行，這條照樣綠（C237 M12）：Base UI 對不在 items 裡的值
    // 也顯示 placeholder。所以這條守的是對外行為，不是那一行 —— 那一行為什麼留著見 `UiSelect.tsx`。
    mountSelect({ value: "" });
    expect((triggerEl().textContent ?? "").trim()).toBe("選一個等級");
    expect(triggerEl().hasAttribute("data-placeholder")).toBe(true);
  });

  it("受控：value 決定顯示哪一項的 label，不是 value", () => {
    mountSelect({ value: "b" });
    expect((triggerEl().textContent ?? "").trim()).toBe("乙等");
    expect(triggerEl().hasAttribute("data-placeholder")).toBe(false);
  });

  it("點開之後選項照 items 的順序", async () => {
    mountSelect();
    await pressOn(triggerEl());
    expect(options().map((option) => (option.textContent ?? "").trim())).toEqual(["甲等", "乙等"]);
  });

  it("⭐ 選一項回報它的 value，觸發鈕換成它的 label", async () => {
    const onValueChange = vi.fn();
    mountSelect({ onValueChange });
    await pressOn(triggerEl());
    await pressOn(options()[0] as HTMLElement);
    expect(onValueChange.mock.calls[0]?.[0]).toBe("a");
    expect((triggerEl().textContent ?? "").trim()).toBe("甲等");
  });

  it("aria-label 落在觸發鈕上 —— 不用 UiLabel 時的另一個名字來源", () => {
    mountSelect({ "aria-label": "排序方式" });
    expect(triggerEl().getAttribute("aria-label")).toBe("排序方式");
  });

  it("★ 探針本身：沒點開時沒有選項 —— 上面「點開之後」那兩條不是讀到常駐的 DOM", async () => {
    mountSelect();
    await settle();
    expect(options()).toHaveLength(0);
  });
});
