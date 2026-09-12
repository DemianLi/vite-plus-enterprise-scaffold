import { Dialog } from "@base-ui/react/dialog";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiDialogSlot } from "../theme.ts";

/**
 * 對話框，React 版（C237）。為什麼不自己寫、遮罩的濃淡為什麼留在元件、`content` 槽就是
 * Sheet、那兩個排版 `<div>` 為什麼沒有槽，見 `UiDialog.vue` 的檔頭。
 *
 * ── Vue 的三個 slot 在這裡是三個 prop ────────────────────────────────
 *
 *   children  換內容
 *   footer    換整組收尾動作；給了它，`close` 就不渲染（同 Vue 具名 slot 的預設內容）
 *   close     只換那顆關閉鈕：傳一個元素（通常是 `<UiButton>關閉</UiButton>`），它成為
 *             `Dialog.Close` 的 `render` —— 點擊會關、鍵盤與焦點行為不變
 *
 * 槽名照舊：`overlay` 是 Base UI 的 `Backdrop`、`content` 是 `Popup`。
 * 點遮罩會關、Esc 會關、開啟時焦點落在內容裡第一個可聚焦元素 —— 在 Base UI 上重量過，
 * 見 `tests/dialog-react.test.ts`。
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
