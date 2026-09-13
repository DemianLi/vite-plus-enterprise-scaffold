// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CalendarDate } from "@internationalized/date";
import { createElement, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UiDatePicker } from "../src/components/UiDatePicker.tsx";
import { pressKey, pressOn, settle } from "./overlay-react.ts";

/**
 * `UiDatePicker` 的 React 版（C238）。Vue 版沒有行為測試 —— 分段、日曆、焦點全是 reka 的；
 * React 版自己寫了四段東西，這裡逐段量：`CalendarDate` ↔ `Date` 的轉換、`locale` 小表、
 * 一週起始日、日格的狀態屬性。`UiField` 接線在 `field-wiring-react.test.ts`。
 */

afterEach(cleanup);

type Props = Partial<ComponentProps<typeof UiDatePicker>>;

const AUG_19 = new CalendarDate(2026, 8, 19);

function mountPicker(props: Props = {}): void {
  render(createElement(UiDatePicker, { placeholder: "請選擇日期", ...props }));
}

function button(): HTMLElement {
  const element = document.querySelector('[data-slot="date-picker"]');
  expect(element, "找不到按鈕").not.toBeNull();
  return element as HTMLElement;
}

const text = (): string => (button().textContent ?? "").trim();

function dayButton(isoDate: string): HTMLElement {
  const element = document.querySelector(`td[data-day="${isoDate}"] button`);
  expect(element, `日曆上沒有 ${isoDate}`).not.toBeNull();
  return element as HTMLElement;
}

function yearSelect(): HTMLSelectElement {
  const element = document.querySelector('select[aria-label="選擇年份"]');
  expect(element, "找不到年份下拉").not.toBeNull();
  return element as HTMLSelectElement;
}

describe("UiDatePicker（React）", () => {
  it("沒給 value：按鈕顯示 placeholder，文字那格帶 data-placeholder —— 淡色字那一格選的就是它", () => {
    mountPicker();
    expect(text()).toBe("請選擇日期");
    expect(button().querySelector("[data-placeholder]")).not.toBeNull();
  });

  it("受控 value 照 locale 排：zh-TW 年在前、en-US 月在前", () => {
    mountPicker({ value: AUG_19 });
    expect(text()).toBe("2026/08/19");
    expect(button().querySelector("[data-placeholder]")).toBeNull();
    cleanup();
    mountPicker({ value: AUG_19, locale: "en-US" });
    expect(text()).toBe("08/19/2026");
  });

  it("⭐ 選一天回報那天的 CalendarDate；日曆收起、焦點回到按鈕（C238 Q73 —— Vue 版不收）", async () => {
    const onValueChange = vi.fn();
    mountPicker({ value: AUG_19, onValueChange });
    await pressOn(button());
    await pressOn(dayButton("2026-08-20"));

    const picked = onValueChange.mock.calls[0]?.[0] as CalendarDate | undefined;
    expect(picked).toBeInstanceOf(CalendarDate);
    expect(picked?.toString()).toBe("2026-08-20");
    expect(document.querySelector('[data-slot="date-picker-content"]')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("打開時焦點落在選中的那天", async () => {
    mountPicker({ value: AUG_19 });
    await pressOn(button());
    expect(document.activeElement).toBe(dayButton("2026-08-19"));
  });

  it("沒選時焦點落在今天", async () => {
    mountPicker();
    await pressOn(button());
    const today = new Date();
    const iso = new CalendarDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    expect(document.activeElement).toBe(dayButton(iso.toString()));
  });

  it("方向鍵移動焦點 —— 自訂的日格按鈕把預設那一支的焦點處理帶過來了", async () => {
    mountPicker({ value: AUG_19 });
    await pressOn(button());
    await pressKey(document.activeElement, "ArrowRight");
    expect(document.activeElement).toBe(dayButton("2026-08-20"));
  });

  it("一週從星期日開始 —— 照 reka 取自 CLDR，不是 date-fns 那份 zhTW 寫的星期一", async () => {
    mountPicker({ value: AUG_19 });
    await pressOn(button());
    const first = document.querySelector("th[aria-label]");
    expect(first?.getAttribute("aria-label")).toBe("星期日");
  });

  it("日格按鈕帶 reka 名字的狀態屬性 —— 預設表 `day` 那幾條 variant 的對象", async () => {
    mountPicker({ value: AUG_19 });
    await pressOn(button());
    expect(dayButton("2026-08-19").hasAttribute("data-selected")).toBe(true);
    expect(dayButton("2026-08-20").hasAttribute("data-selected")).toBe(false);
    // 2026 年 8 月 1 日是星期六，第一週前面六格是 7 月的外側日。
    expect(dayButton("2026-07-31").hasAttribute("data-outside-view")).toBe(true);
    expect(dayButton("2026-08-01").hasAttribute("data-outside-view")).toBe(false);
  });

  it("年份下拉涵蓋今年前後各 100 年 —— 不是 react-day-picker 預設那個選不到明年的出生日期範圍", async () => {
    mountPicker({ value: AUG_19 });
    await pressOn(button());
    const years = [...yearSelect().options].map((option) => Number(option.value));
    const thisYear = new Date().getFullYear();
    expect(Math.min(...years)).toBe(thisYear - 100);
    expect(Math.max(...years)).toBe(thisYear + 100);
  });

  it("值在範圍外時，年份下拉延伸到涵蓋它", async () => {
    mountPicker({ value: new CalendarDate(1800, 1, 1) });
    await pressOn(button());
    expect(yearSelect().options[0]?.value).toBe("1800");
  });

  it("換年份，日曆跟著換月", async () => {
    mountPicker({ value: AUG_19 });
    await pressOn(button());
    fireEvent.change(yearSelect(), { target: { value: "2030" } });
    await settle();
    expect(document.querySelector("table")?.getAttribute("aria-label")).toBe("2030年8月");
  });

  it("0–99 年不會被讀成 1900 年代", async () => {
    mountPicker({ value: new CalendarDate(50, 3, 1) });
    await pressOn(button());
    expect(document.activeElement).toBe(dayButton("0050-03-01"));
  });

  it("🔴 不支援的 locale 丟例外，不是安靜退回英文 —— 同 Vue 版檔頭那一句", () => {
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => mountPicker({ locale: "ja-JP" })).toThrow(/不支援 locale "ja-JP"/);
      expect(() => mountPicker({ locale: "toString" })).toThrow(RangeError);
    } finally {
      silence.mockRestore();
    }
  });

  it("日期文字排在 aria-describedby 最前面 —— 按鈕的名字是標籤時，選好的日期要從這裡念到", () => {
    mountPicker({ value: AUG_19, "aria-describedby": "hint" });
    const [first, ...rest] = (button().getAttribute("aria-describedby") ?? "").split(" ");
    expect(document.getElementById(first ?? "")?.textContent).toBe("2026/08/19");
    expect(rest).toEqual(["hint"]);
  });

  it("aria-label 落在按鈕上 —— 不用 UiLabel 時的另一個名字來源", () => {
    mountPicker({ "aria-label": "生日" });
    expect(button().getAttribute("aria-label")).toBe("生日");
  });

  it("面板裡的五格各自落在檔頭說的元素上 —— 契約只守「讀了自己那一格」，不守讀到哪裡去", async () => {
    mountPicker({ value: AUG_19 });
    await pressOn(button());
    const classes = (element: Element | null | undefined): readonly string[] =>
      (element?.getAttribute("class") ?? "").split(" ");
    expect(classes(document.querySelector('[data-slot="date-picker-content"]'))).toContain(
      "shadow-overlay",
    );
    expect(classes(document.querySelector('button[aria-label="前往上個月"]'))).toContain("size-7");
    expect(classes(document.querySelector('button[aria-label="前往下個月"]'))).toContain("size-7");
    expect(classes(yearSelect().parentElement?.parentElement)).toContain("font-control");
    expect(classes(document.querySelector("th[aria-label]"))).toContain("text-xs");
    expect(classes(dayButton("2026-08-19"))).toContain("data-[selected]:bg-accent");
  });

  it("★ `segment`／`trigger` 那兩格的聚焦 variant 在這裡永遠不觸發 —— 檔頭那句話過期就紅", () => {
    // 那兩個元素不能聚焦，所以 `focus:*`、`focus-visible:*` 在 React 版是死的（C238 Q70）。
    // 兩個方向都會紅：元素變得能聚焦（那就不是死的了），或預設表不再有那些 variant（例外過期）。
    mountPicker({ value: AUG_19 });
    const segment = button().querySelector("span[id]") as HTMLElement;
    const trigger = button().querySelector("span:not([id])") as HTMLElement;
    for (const [element, variant] of [
      [segment, "focus:"],
      [trigger, "focus-visible:"],
    ] as const) {
      expect(element.tabIndex).toBe(-1);
      expect(element.className.split(" ").some((token) => token.startsWith(variant))).toBe(true);
    }
  });
});

describe.each(["Asia/Taipei", "America/Los_Angeles"])("時區 %s：日曆日進出都不差一天", (zone) => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env["TZ"];
    process.env["TZ"] = zone;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env["TZ"];
    else process.env["TZ"] = previous;
  });

  it("★ 探針本身：時區真的換了 —— UTC 午夜在台北是當天、在洛杉磯是前一天", () => {
    const utcMidnight = new Date(Date.UTC(2026, 7, 19));
    expect(utcMidnight.getDate()).toBe(zone === "Asia/Taipei" ? 19 : 18);
  });

  it("進：值是 8/19，日曆上選中的是 8/19", async () => {
    mountPicker({ value: AUG_19 });
    await pressOn(button());
    expect(document.querySelector("td[data-selected]")?.getAttribute("data-day")).toBe(
      "2026-08-19",
    );
  });

  it("出：點 8/20，回報的是 8/20", async () => {
    const onValueChange = vi.fn();
    mountPicker({ value: AUG_19, onValueChange });
    await pressOn(button());
    await pressOn(dayButton("2026-08-20"));
    const picked = onValueChange.mock.calls[0]?.[0] as CalendarDate | undefined;
    expect(picked?.toString()).toBe("2026-08-20");
  });
});
