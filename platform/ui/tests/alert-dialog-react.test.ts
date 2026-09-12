// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { createElement, useState, type ComponentProps, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiAlertDialog } from "../src/components/UiAlertDialog.tsx";
import { UiDialog } from "../src/components/UiDialog.tsx";
import { activeText, pressKey, pressOn, settle } from "./overlay-react.ts";

/**
 * `UiAlertDialog` 的 React 版（C237）。問題與 `alert-dialog.test.ts` 相同，答案要在
 * Base UI 上重量 —— Vue 版那張五個實驗的表量的是 reka 的兩條焦點路徑，其中「取消鈕
 * 自己登記」那一條 Base UI 沒有（見 `UiAlertDialog.tsx` 檔頭）。
 *
 * 焦點保護在這裡同樣是兩條，換成：
 *
 *   路 1 `initialFocus` 指到按鈕列裡的第一顆 → 「⭐ 內容裡有連結時焦點仍在取消」只有它接得住
 *   路 2 預設聚焦第一個可聚焦元素            → 「⭐ 取消鈕是內容裡第一個可聚焦元素」
 *
 * ⚠️ 兩條靠同一個順序（取消在前），對調兩顆會一起失守 —— 與 reka 版不同，見元件檔頭。
 *
 * 綠燈的意思同 Vue 那支的檔頭：happy-dom 上成立，不是真瀏覽器。
 */

afterEach(cleanup);

const PROPS = {
  title: "刪除訂單",
  description: "訂單 #1024 會被永久刪除，這個動作無法復原。",
  confirmLabel: "刪除",
} as const;

type Props = Partial<ComponentProps<typeof UiAlertDialog>>;

function Stateful({ onOpenChange, ...props }: Props): ReactNode {
  const [open, setOpen] = useState(true);
  return createElement(UiAlertDialog, {
    ...PROPS,
    ...props,
    open,
    onOpenChange: (next: boolean) => {
      onOpenChange?.(next);
      setOpen(next);
    },
  });
}

const contentEl = (): Element | null => document.querySelector('[data-slot="alert-dialog"]');

async function openDialog(props: Props = {}): Promise<Element> {
  render(createElement(Stateful, props));
  await settle();
  const content = contentEl();
  // 找不到就直接紅 —— 下面每一條都會在 `null` 上恆真。
  expect(content, "掛載後找不到對話框內容").not.toBeNull();
  return content as Element;
}

const buttonTexts = (content: Element): readonly string[] =>
  [...content.querySelectorAll("button")].map((button) => (button.textContent ?? "").trim());

function button(content: Element, text: string): HTMLButtonElement {
  const found = [...content.querySelectorAll("button")].find(
    (element) => (element.textContent ?? "").trim() === text,
  );
  expect(found, `找不到「${text}」`).toBeDefined();
  return found as HTMLButtonElement;
}

const closes = (spy: ReturnType<typeof vi.fn>): readonly unknown[] =>
  spy.mock.calls.map(([open]) => open);

describe("UiAlertDialog（React）", () => {
  it("role 是 alertdialog 而不是 dialog", async () => {
    const content = await openDialog();
    expect(content.getAttribute("role")).toBe("alertdialog");
  });

  it("標題與說明真的被 aria 接上（代理，同 Vue 版那一條的說明）", async () => {
    const content = await openDialog();
    const title = document.getElementById(content.getAttribute("aria-labelledby") ?? "");
    const description = document.getElementById(content.getAttribute("aria-describedby") ?? "");
    expect(title?.textContent?.trim()).toBe(PROPS.title);
    expect(description?.textContent?.trim()).toBe(PROPS.description);
  });

  it("⭐ 初始焦點落在取消鈕，不是確認鈕", async () => {
    await openDialog();
    expect(activeText()).toBe("取消");
  });

  it("⭐ 內容裡有連結時焦點仍在取消 —— 只有 initialFocus 接得住這一格", async () => {
    // Base UI 的預設是「內容裡第一個可聚焦元素」，而 children 排在按鈕列前面：
    // 少了 initialFocus，焦點會落在這個連結上（實測）。
    await openDialog({ children: createElement("a", { href: "#attachments" }, "3 筆附件") });
    expect(activeText()).toBe("取消");
  });

  it("⭐ 取消鈕是內容裡第一個可聚焦元素 —— initialFocus 斷掉時的第二道防線", async () => {
    const content = await openDialog();
    expect(buttonTexts(content)).toEqual(["取消", "刪除"]);
  });

  it("點外面不會關 —— 這正是它與 UiDialog 的差別之一", async () => {
    const onOpenChange = vi.fn();
    await openDialog({ onOpenChange });
    await pressOn(document.body);
    expect(closes(onOpenChange), "點外面竟然關了").toEqual([]);
    expect(contentEl()).not.toBeNull();
  });

  it("★ 對照：同一個按法 UiDialog 會關 —— 否則上一條是在一個什麼都關不掉的按法上綠", async () => {
    const onOpenChange = vi.fn();
    render(createElement(UiDialog, { title: "t", description: "d", open: true, onOpenChange }));
    await settle();
    await pressOn(document.body);
    expect(closes(onOpenChange)).toEqual([false]);
  });

  it("Esc 仍然會關 —— 逃生路徑沒有被一起拿掉", async () => {
    const onOpenChange = vi.fn();
    await openDialog({ onOpenChange });
    await pressKey(document.activeElement, "Escape");
    expect(closes(onOpenChange)).toEqual([false]);
  });

  it("按確認會呼叫 onConfirm，而且對話框同時關掉", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const content = await openDialog({ onOpenChange, onConfirm });
    button(content, "刪除").click();
    await settle();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(closes(onOpenChange)).toEqual([false]);
    expect(contentEl()).toBeNull();
  });

  it("⭐ onConfirm 被呼叫的那一刻對話框還在 —— 關閉在那之後", async () => {
    // 探針要在處理器**裡面**：settle() 之後查的話那時已經關了，對時序完全無感（C88）。
    const presentWhenCalled: boolean[] = [];
    const content = await openDialog({
      onConfirm: () => {
        presentWhenCalled.push(contentEl() !== null);
      },
    });
    button(content, "刪除").click();
    expect(presentWhenCalled, "處理器根本沒被呼叫").toEqual([true]);
    await settle();
    expect(contentEl()).toBeNull();
  });

  it("按取消會關，而且不會呼叫 onConfirm", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const content = await openDialog({ onOpenChange, onConfirm });
    button(content, "取消").click();
    await settle();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(closes(onOpenChange)).toEqual([false]);
  });

  it("confirmVariant 預設是 danger，不是 primary（對照組寫法，同 Vue 版）", async () => {
    const byDefault = button(await openDialog(), "刪除").className;
    cleanup();
    const asPrimary = button(await openDialog({ confirmVariant: "primary" }), "刪除").className;
    expect(byDefault).toBeTruthy();
    expect(byDefault).not.toBe(asPrimary);
  });

  it("open 是 false 時什麼都不渲染", async () => {
    render(createElement(UiAlertDialog, { ...PROPS, open: false }));
    await settle();
    expect(contentEl()).toBeNull();
  });
});

describe("★ 探針本身", () => {
  it("選擇器抓得到東西，而且抓到的是同一個元素", async () => {
    const content = await openDialog();
    expect(document.querySelectorAll('[data-slot="alert-dialog"]')).toHaveLength(1);
    expect(content.querySelectorAll("button")).toHaveLength(2);
  });
});
