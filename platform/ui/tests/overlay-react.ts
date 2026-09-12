import { act, fireEvent } from "@testing-library/react";

/**
 * 彈出層那幾支 React 測試共用的操作（C237）。
 */

/** 讓 portal、Base UI 的 effect、floating-ui 的非同步定位全部跑完。 */
export async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * 滑鼠在某個元素上按下再放開。
 *
 * ⚠️ 只送 `click` 不夠：Base UI 的「點外面」判定掛在按下那一刻。實測只送 `click` 的話
 * `UiDialog` 也不會關 —— 拿那種按法去證明「`UiAlertDialog` 點外面不會關」是恆真的。
 * 所以那一條旁邊有一條對照組，用同一支函式把 `UiDialog` 關掉。
 */
export async function pressOn(target: Element): Promise<void> {
  await act(async () => {
    fireEvent.pointerDown(target, { pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(target, { button: 0 });
    fireEvent.pointerUp(target, { pointerType: "mouse", button: 0 });
    fireEvent.mouseUp(target, { button: 0 });
    fireEvent.click(target, { button: 0, detail: 1 });
  });
  await settle();
}

export async function pressKey(element: Element | null, key: string): Promise<void> {
  fireEvent.keyDown(element ?? document.body, { key });
  await settle();
}

/** 目前焦點所在元素的文字。焦點在容器上時是所有項目串起來的那一長串。 */
export function activeText(): string {
  return (document.activeElement?.textContent ?? "").trim();
}
