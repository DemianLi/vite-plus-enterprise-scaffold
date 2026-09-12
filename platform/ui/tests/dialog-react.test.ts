// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { createElement, useState, type ComponentProps, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiButton } from "../src/components/UiButton.tsx";
import { UiDialog } from "../src/components/UiDialog.tsx";
import { pressKey, pressOn, settle } from "./overlay-react.ts";

/**
 * `UiDialog` 的 React 版（C237）。Vue 版沒有行為測試（它的保證全是 reka 的），React 版的
 * 三個 slot 改成了 prop，而 `close` 是交給 `Dialog.Close` 當 `render` 的 —— 那一段是
 * 這裡寫的接線，要量。另外它是 `alert-dialog-react.test.ts` 那條「點外面不會關」的對照組。
 *
 * 綠燈的意思同 `alert-dialog.test.ts` 檔頭：happy-dom 上成立，不是真瀏覽器。
 */

afterEach(cleanup);

const PROPS = { title: "編輯收件資訊", description: "修改後會通知物流。" } as const;

type Props = Partial<ComponentProps<typeof UiDialog>>;

/** 自己記 `open` 的外殼 —— 受控但會跟著 `onOpenChange` 關，像真的使用端。 */
function Stateful({ onOpenChange, ...props }: Props): ReactNode {
  const [open, setOpen] = useState(true);
  return createElement(UiDialog, {
    ...PROPS,
    ...props,
    open,
    onOpenChange: (next: boolean) => {
      onOpenChange?.(next);
      setOpen(next);
    },
  });
}

const contentEl = (): Element | null => document.querySelector('[data-slot="dialog"]');

async function openDialog(props: Props = {}): Promise<Element> {
  render(createElement(Stateful, props));
  await settle();
  const content = contentEl();
  expect(content, "掛載後找不到對話框內容").not.toBeNull();
  return content as Element;
}

const buttonTexts = (content: Element): readonly string[] =>
  [...content.querySelectorAll("button")].map((button) => (button.textContent ?? "").trim());

describe("UiDialog（React）", () => {
  it("role 是 dialog，標題與說明被 aria 接上", async () => {
    const content = await openDialog();
    expect(content.getAttribute("role")).toBe("dialog");
    const title = document.getElementById(content.getAttribute("aria-labelledby") ?? "");
    const description = document.getElementById(content.getAttribute("aria-describedby") ?? "");
    expect(title?.textContent).toBe(PROPS.title);
    expect(description?.textContent).toBe(PROPS.description);
  });

  it("點外面會關", async () => {
    const onOpenChange = vi.fn();
    await openDialog({ onOpenChange });
    await pressOn(document.body);
    expect(onOpenChange.mock.calls.map(([open]) => open)).toEqual([false]);
    expect(contentEl()).toBeNull();
  });

  it("Esc 會關", async () => {
    const onOpenChange = vi.fn();
    await openDialog({ onOpenChange });
    await pressKey(document.activeElement, "Escape");
    expect(onOpenChange.mock.calls.map(([open]) => open)).toEqual([false]);
  });

  it("⭐ close：傳進來的按鈕渲染出來，而且點了會關 —— Dialog.Close 的 render 接上了", async () => {
    const onOpenChange = vi.fn();
    const content = await openDialog({
      onOpenChange,
      close: createElement(UiButton, null, "關閉"),
    });
    expect(buttonTexts(content)).toEqual(["關閉"]);

    (content.querySelector("button") as HTMLButtonElement).click();
    await settle();
    expect(onOpenChange.mock.calls.map(([open]) => open)).toEqual([false]);
    expect(contentEl()).toBeNull();
  });

  it("給了 footer，close 就不渲染 —— 同 Vue 具名 slot 的預設內容", async () => {
    const content = await openDialog({
      footer: createElement(UiButton, null, "送出"),
      close: createElement(UiButton, null, "關閉"),
    });
    expect(buttonTexts(content)).toEqual(["送出"]);
  });

  it("兩個都沒給時收尾那一列是空的", async () => {
    const content = await openDialog();
    expect(buttonTexts(content)).toEqual([]);
  });

  it("children 渲染在內容裡", async () => {
    const content = await openDialog({ children: "收件地址" });
    expect(content.textContent).toContain("收件地址");
  });

  it("open 是 false 時什麼都不渲染", async () => {
    render(createElement(UiDialog, { ...PROPS, open: false }));
    await settle();
    expect(contentEl()).toBeNull();
  });
});
