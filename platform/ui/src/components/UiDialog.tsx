import { Dialog } from "@base-ui/react/dialog";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiDialogSlot } from "../theme.ts";

/**
 * 對話框。用 Base UI 的 Dialog 基元。
 *
 * ── 為什麼不自己寫 ────────────────────────────────────────────────
 *
 * 對話框看起來只是「一個蓋在上面的框」，實際上要處理：焦點鎖定與還原、
 * Esc 關閉、外側點擊、`aria-modal` 與 `aria-labelledby`、背景捲動鎖定、
 * 以及螢幕閱讀器的朗讀順序。每一項做錯都不會壞掉，只會讓鍵盤與輔具使用者
 * 用不了 —— 而那種 bug 沒有人會回報，只會在無障礙稽核時一次全部出現。
 * 基元把這些做完了，而且**不帶任何樣式**，所以外觀仍然是我們的。
 * 點遮罩會關、Esc 會關、開啟時焦點落在內容裡第一個可聚焦元素。
 *
 * ── CSP：捲動鎖定只寫 `element.style` ─────────────────────────────
 *
 * Radix 的捲動鎖定注入不帶 nonce 的 `<style>`，被 `style-src 'self'` 安靜擋掉，
 * 這是換成 Base UI 的理由。Base UI 零處 `createElement('style')`，對裝上去的那一版
 * 逐檔量過。
 *
 * ── 遮罩：色相在代幣、不透明度留在元件 ────────────────────────────
 *
 * `overlay` 那一格寫的是 `bg-overlay/40`。⚠️ 不要為了那個 40 再開一個
 * `--color-overlay-40` 代幣 —— 那會讓**每換一次濃淡就多一格**，而濃淡是
 * 逐案調的東西。`styles/index.css` 對這一條有更完整的說明。
 *
 * ── 這三個 prop 就是「各案可以更換互動方式」的接縫 ─────────────────
 *
 * 配色與形狀是靠代幣換的（`createUiTheme`）；**互動換不了代幣，只能靠組合**。
 *
 *   children  換內容
 *   footer    換**整組**收尾動作 —— 「確認／取消」、一個表單送出、或空的；給了它，`close` 就不渲染
 *   close     只換那顆關閉鈕：傳一個元素（通常是 `<UiButton>關閉</UiButton>`），它成為
 *             `Dialog.Close` 的 `render` —— 點擊會關、鍵盤與焦點行為不變
 *
 * ── 「形狀」那條軸的接縫：`content` 槽 ─────────────────────────────
 *
 * 值走代幣、結構走 prop，形狀走 `content` 這一格。一個要把對話框改成手機版底部滑出的案子，
 * 代幣換不掉（那不是值）、prop 換不掉（那不是結構），只能覆寫這一格。
 *
 * ⚠️ **不要新增 `UiSheet`：它就是 `content` 槽。** shadcn 的 `Sheet`（從側邊滑出的
 * 對話框）是這一格的覆寫：`fixed inset-y-0 right-0 h-full w-96` 取代下面那串
 * `top-1/2 left-1/2 -translate-*`，焦點鎖定、Esc、外側點擊、`aria-modal` 全部原封不動。
 * 新增一個 `UiSheet` 的代價是**兩份無障礙接線從此各自漂移** —— 而其中一份壞掉的時候
 * 畫面完全正常。⚠️ `Drawer` 不同：它靠拖曳手勢關閉，那個換不出來，要新的基元。
 *
 * ── 四個槽名的來源 ──────────────────────────────────────────────────
 *
 * 不是我們取的，是 shadcn 的 part 名：設計師講「overlay 要更淡」，前端要改的那一格就叫
 * `overlay`。在 Base UI 上 `overlay` 是 `Backdrop`、`content` 是 `Popup`。
 *
 * ⚠️ 刻意**沒有**給那兩個排版用的 `<div>`（`mt-4` 與 `mt-6 flex …`）槽。
 * 規則若是「每一塊 class 都要有槽」，那兩格會被逼出沒有人會覆寫的槽名 ——
 * 形式主義的規則第一天就會被加例外，而例外永遠不會拿掉。
 * 「接縫夠不夠」是 review 的職責。
 *
 * `description` 必填 —— 沒有它的對話框對輔具使用者是一個無名的框。
 */
export function UiDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  close,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  footer?: ReactNode;
  close?: ReactElement;
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiDialogSlot, string>> = {
    overlay: theme.UiDialog?.overlay ?? DEFAULT_PARTS.overlay,
    content: theme.UiDialog?.content ?? DEFAULT_PARTS.content,
    title: theme.UiDialog?.title ?? DEFAULT_PARTS.title,
    description: theme.UiDialog?.description ?? DEFAULT_PARTS.description,
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={parts.overlay} />
        <Dialog.Popup data-slot="dialog" className={parts.content}>
          <Dialog.Title className={parts.title}>{title}</Dialog.Title>
          <Dialog.Description className={parts.description}>{description}</Dialog.Description>

          <div className="mt-4">{children}</div>

          <div className="mt-6 flex justify-end gap-2">
            {footer ?? (close === undefined ? null : <Dialog.Close render={close} />)}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiDialogSlot, string>> = {
  overlay: "fixed inset-0 bg-overlay/40",
  content: cn(
    "fixed top-1/2 left-1/2 w-[min(32rem,92vw)] -translate-x-1/2 -translate-y-1/2",
    "rounded-surface bg-surface p-6 shadow-overlay",
    "focus:outline-none",
  ),
  title: "text-lg font-heading text-fg",
  description: "mt-1 text-sm text-fg-muted",
};
