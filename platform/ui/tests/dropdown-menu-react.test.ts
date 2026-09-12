// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement, useState, type ComponentProps, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiDropdownMenu } from "../src/components/UiDropdownMenu.tsx";
import { activeText, pressKey, pressOn, settle } from "./overlay-react.ts";

/**
 * `UiDropdownMenu` 的 React 版（C237）。條目照 `dropdown-menu.test.ts` 逐條重量；
 * Base UI 與 reka 答案不同的那幾條（焦點落點、disabled、繞回、modal 的外面）在這裡寫的是
 * **Base UI 的答案**，差別與理由列在 `UiDropdownMenu.tsx` 的檔頭。
 *
 * 綠燈的意思同 Vue 那支的檔頭：happy-dom 上成立；位置與捲軸寬度量不到。
 */

afterEach(cleanup);

const LABEL = "訂單 #1024 的操作";
const ITEMS = [
  { value: "edit", label: "編輯" },
  { value: "duplicate", label: "複製" },
  { value: "archive", label: "封存", disabled: true },
  { value: "remove", label: "刪除", variant: "danger" },
] as const;

type Props = Partial<ComponentProps<typeof UiDropdownMenu>>;

function mountMenu(props: Props = {}): ReturnType<typeof render> {
  return render(createElement(UiDropdownMenu, { label: LABEL, items: ITEMS, ...props }));
}

/** 不受控 —— 觸發器自己開關，像沒有綁 `open` 的使用端。 */
async function openByKeyboard(props: Props = {}): Promise<void> {
  mountMenu(props);
  await settle();
  triggerEl().focus();
  await pressKey(triggerEl(), "ArrowDown");
}

function Stateful({ onOpenChange, ...props }: Props): ReactNode {
  const [open, setOpen] = useState(true);
  return createElement(UiDropdownMenu, {
    label: LABEL,
    items: ITEMS,
    ...props,
    open,
    onOpenChange: (next: boolean) => {
      onOpenChange?.(next);
      setOpen(next);
    },
  });
}

function triggerEl(): HTMLElement {
  const element = document.querySelector('[data-slot="dropdown-menu-trigger"]');
  expect(element, "找不到觸發器").not.toBeNull();
  return element as HTMLElement;
}

/** 展開中的面板；沒展開時是 `null`（刻意不斷言，有兩條在驗它不存在）。 */
const contentEl = (): HTMLElement | null => document.querySelector('[data-slot="dropdown-menu"]');

function openContent(): HTMLElement {
  const element = contentEl();
  expect(element, "選單沒有展開").not.toBeNull();
  return element as HTMLElement;
}

const menuItems = (): readonly HTMLElement[] => [
  ...openContent().querySelectorAll<HTMLElement>('[role="menuitem"]'),
];

const activeRole = (): string | null => document.activeElement?.getAttribute("role") ?? null;

describe("UiDropdownMenu（React）", () => {
  it("⭐ 選單的名字是從觸發器接過來的", async () => {
    mountMenu({ open: true });
    await settle();
    const content = openContent();
    expect(content.getAttribute("role")).toBe("menu");

    const labelledBy = content.getAttribute("aria-labelledby");
    expect(labelledBy, "面板沒有 aria-labelledby").toBeTruthy();
    const named = document.getElementById(labelledBy as string);
    expect(named, `aria-labelledby="${labelledBy}" 指不到任何元素`).not.toBeNull();
    expect((named?.textContent ?? "").trim()).toBe(LABEL);
  });

  it("⭐ label 給空字串，名字就整個沒了 —— 上一條真的在讀它", async () => {
    mountMenu({ open: true, label: "" });
    await settle();
    const named = document.getElementById(openContent().getAttribute("aria-labelledby") ?? "");
    expect((named?.textContent ?? "").trim()).toBe("");
  });

  it("★ 名字的載體還在 DOM 裡 —— 上面那兩條 ⭐ 的前置條件（同 Vue 版）", async () => {
    mountMenu();
    await settle();
    const trigger = triggerEl();
    expect(trigger.getAttribute("aria-label"), "名字不該走 aria-label").toBeNull();
    expect((trigger.textContent ?? "").trim()).toBe(LABEL);
    expect(trigger.querySelector("span")?.getAttribute("class")).toBe("sr-only");
  });

  it("★ 觸發器今天沒有可見文字 —— WCAG 2.5.3 那條理由還沒上膛（同 Vue 版）", async () => {
    mountMenu();
    await settle();
    const clone = triggerEl().cloneNode(true) as HTMLElement;
    for (const node of clone.querySelectorAll(".sr-only")) node.remove();
    expect(
      (clone.textContent ?? "").trim(),
      "觸發器出現了不在 `sr-only` 裡的文字 —— 有人加了可見文字，或名字的載體被換掉了",
    ).toBe("");
  });

  it("觸發器的 aria 接線：圖示藏起來、haspopup 是 menu", async () => {
    mountMenu();
    await settle();
    expect(triggerEl().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(triggerEl().getAttribute("aria-haspopup")).toBe("menu");
  });

  it("項目是 menuitem，順序就是 items 的順序", async () => {
    mountMenu({ open: true });
    await settle();
    expect(menuItems().map((item) => (item.textContent ?? "").trim())).toEqual([
      "編輯",
      "複製",
      "封存",
      "刪除",
    ]);
  });

  it("⭐ 用鍵盤打開 → 焦點落在第一個項目", async () => {
    await openByKeyboard();
    expect(activeRole()).toBe("menuitem");
    expect(activeText()).toBe("編輯");
  });

  it("⭐ 用滑鼠點開也落在第一個項目 —— reka 在這裡停在容器上（Base UI 的答案不同）", async () => {
    mountMenu();
    await settle();
    await pressOn(triggerEl());
    expect(activeRole()).toBe("menuitem");
    expect(activeText()).toBe("編輯");
  });

  it.each(["pointer", "keyboard"] as const)(
    "⭐ 程式打開、頁面最後一個輸入是 %s → 焦點都停在容器上 —— reka 的整頁旗標在這裡不存在",
    async (last) => {
      const { rerender } = mountMenu({ open: false });
      await settle();
      if (last === "pointer") fireEvent.pointerDown(document.body, { pointerType: "mouse" });
      else fireEvent.keyDown(document.body, { key: "Tab" });
      await settle();
      rerender(createElement(UiDropdownMenu, { label: LABEL, items: ITEMS, open: true }));
      await settle();
      expect(activeRole(), "焦點不該落在項目上").toBe("menu");
    },
  );

  it("↓ 會停在 disabled 的項目上 —— reka 跳過它，Base UI 讓它可聚焦", async () => {
    await openByKeyboard();
    await pressKey(document.activeElement, "ArrowDown");
    expect(activeText()).toBe("複製");
    await pressKey(document.activeElement, "ArrowDown");
    expect(activeText()).toBe("封存");
    expect(document.activeElement?.getAttribute("aria-disabled")).toBe("true");
    await pressKey(document.activeElement, "ArrowDown");
    expect(activeText()).toBe("刪除");
  });

  it("End 到最後一項，Home 回第一項", async () => {
    await openByKeyboard();
    await pressKey(document.activeElement, "End");
    expect(activeText()).toBe("刪除");
    await pressKey(document.activeElement, "Home");
    expect(activeText()).toBe("編輯");
  });

  it("⭐ 到底了不會繞回去 —— Base UI 預設會繞，這裡照 Vue 版關掉", async () => {
    await openByKeyboard();
    await pressKey(document.activeElement, "End");
    await pressKey(document.activeElement, "ArrowDown");
    expect(activeText(), "最後一項再按 ↓ 不該回到第一項").toBe("刪除");
    await pressKey(document.activeElement, "Home");
    await pressKey(document.activeElement, "ArrowUp");
    expect(activeText(), "第一項再按 ↑ 不該跳到最後一項").toBe("編輯");
  });

  it("首字母跳轉", async () => {
    await openByKeyboard();
    await pressKey(document.activeElement, "複");
    expect(activeText()).toBe("複製");
  });

  it("⚠️ 首字母的緩衝區是連續的 —— 一秒內的第二個鍵會接在後面", async () => {
    // 防止上一條被誤讀成「每按一個字都會跳到那個字」（同 Vue 版那一條）。
    await openByKeyboard();
    await pressKey(document.activeElement, "刪");
    expect(activeText()).toBe("刪除");
    await pressKey(document.activeElement, "複");
    expect(activeText(), "緩衝區是「刪複」，不該跳到複製").toBe("刪除");
  });

  it("Esc 關閉，而且焦點還給觸發器", async () => {
    await openByKeyboard();
    await pressKey(document.activeElement, "Escape");
    expect(contentEl(), "Esc 之後面板該消失").toBeNull();
    expect(document.activeElement, "焦點該回到觸發器").toBe(triggerEl());
  });

  it("選一項會回報它的 value，而且選單同時關掉", async () => {
    const onSelect = vi.fn();
    render(createElement(Stateful, { onSelect }));
    await settle();
    (menuItems()[1] as HTMLElement).click();
    await settle();
    // 回報的是 value 不是 label —— 顯示文字會被翻譯，動作代號不會。
    expect(onSelect.mock.calls).toEqual([["duplicate"]]);
    expect(contentEl(), "選完之後選單該關").toBeNull();
  });

  it("⭐ onSelect 被呼叫的那一刻選單還開著 —— 關閉在那之後", async () => {
    const openWhenCalled: boolean[] = [];
    render(
      createElement(Stateful, {
        onSelect: () => {
          openWhenCalled.push(contentEl() !== null);
        },
      }),
    );
    await settle();
    (menuItems()[0] as HTMLElement).click();
    expect(openWhenCalled, "處理器根本沒被呼叫").toEqual([true]);
    await settle();
    expect(contentEl()).toBeNull();
  });

  it("disabled 的項目點不動 —— 不回報也不關", async () => {
    const onSelect = vi.fn();
    render(createElement(Stateful, { onSelect }));
    await settle();
    const archived = menuItems()[2] as HTMLElement;
    expect(archived.getAttribute("aria-disabled")).toBe("true");
    archived.click();
    await settle();
    expect(onSelect).not.toHaveBeenCalled();
    expect(contentEl(), "點不動的項目不該把選單關掉").not.toBeNull();
  });

  it("danger 那一項疊上紅色那一格，其他項目沒有（對照組寫法，同 Vue 版）", async () => {
    mountMenu({ open: true });
    await settle();
    const classOf = (index: number): string => menuItems()[index]?.getAttribute("class") ?? "";
    expect(classOf(3)).not.toBe(classOf(0));
    expect(classOf(3)).toContain("rounded-control");
    expect(classOf(0)).toContain("rounded-control");
  });

  it("align 預設是 end，傳 start 會傳到面板上", async () => {
    const { unmount } = mountMenu({ open: true });
    await settle();
    expect(openContent().getAttribute("data-align")).toBe("end");
    unmount();

    mountMenu({ open: true, align: "start" });
    await settle();
    expect(openContent().getAttribute("data-align")).toBe("start");
  });

  it("open 是 false 時面板整個不存在", async () => {
    mountMenu();
    await settle();
    expect(contentEl()).toBeNull();
    // 觸發器還在 —— 不然上一句會是恆真的。
    expect(triggerEl().getAttribute("aria-expanded")).toBe("false");
  });

  it("它是 modal 的：頁面捲不動，但選單以外**沒有**被 aria-hidden（Base UI 的答案不同）", async () => {
    const outside = document.createElement("div");
    outside.id = "外面的內容";
    document.body.append(outside);
    try {
      mountMenu({ open: true });
      await settle();
      expect(document.body.getAttribute("style") ?? "").toContain("overflow");
      expect(outside.getAttribute("aria-hidden")).toBeNull();
    } finally {
      outside.remove();
    }
  });
});

describe("★ 探針本身", () => {
  it("觸發器與面板是兩個不同的元素，而且各只有一個", async () => {
    mountMenu({ open: true });
    await settle();
    expect(document.querySelectorAll('[data-slot="dropdown-menu-trigger"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="dropdown-menu"]')).toHaveLength(1);
    expect(triggerEl()).not.toBe(openContent());
  });

  it("項目數與傳進去的一樣多 —— 否則導航那幾條是在空清單上跑", async () => {
    mountMenu({ open: true });
    await settle();
    expect(menuItems()).toHaveLength(ITEMS.length);
  });
});
