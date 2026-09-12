import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRef, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { UiButton } from "./UiButton.tsx";
import { useUiTheme } from "../theme-context.tsx";
import type { UiAlertDialogSlot } from "../theme.ts";

/**
 * 破壞性動作的確認框，React 版（C237）。它為什麼不是 `UiDialog` 換兩顆按鈕、為什麼沒有
 * `footer` 槽、兩顆按鈕為什麼都會關、`confirmLabel` 為什麼必填而且要是動詞，見
 * `UiAlertDialog.vue` 的檔頭。
 *
 * ── ⚠️ 初始焦點：reka 的那條路在 Base UI 上不存在 ─────────────────────
 *
 * reka 版的「焦點落在取消」主要靠 `AlertDialogCancel` 在掛載時把自己登記給 content，那條路
 * 與 DOM 順序無關。Base UI 沒有這個機制：`Popup` 預設聚焦**內容裡第一個可聚焦元素**。實測在
 * `children` 裡放一個連結，焦點就落在連結上 —— reka 版同一個情境（它的測試檔頭的 B4）落在取消。
 *
 * 所以這裡用 `initialFocus` 指到**按鈕列裡的第一顆**，也就是取消。⚠️ 這條替身與預設那條靠的是
 * 同一個順序（取消寫在確認前面）：它補的是「`children` 裡有可聚焦的東西」那一格，不是 reka 那種
 * 與順序無關的保險。模板的順序因此在 React 版比 Vue 版更承重 —— 對調兩顆，兩條路一起落到確認上。
 * 兩條各有一條測試，見 `tests/alert-dialog-react.test.ts`。
 *
 * 不用 ref 直接指到取消鈕：`UiButton` 不收 `ref`，幫它加一個選填的 `ref`，`api-surface` 判成
 * 破壞性變更（函式型別的文字變了）而要附 codemod —— 為一個相容的新增寫 codemod 不值得。
 *
 * ── `confirm` 事件 → `onConfirm` ─────────────────────────────────────
 *
 * 兩顆都是 `AlertDialog.Close`（上游語意照做）。`onConfirm` 在關閉**之前**被呼叫 ——
 * 實測在處理器裡查 DOM，對話框還在；它在那一次狀態更新之後才消失。
 */
export function UiAlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  confirmVariant = "danger",
  onConfirm,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm?: () => void;
  children?: ReactNode;
}): ReactNode {
  const actions = useRef<HTMLDivElement>(null);
  const theme = useUiTheme();
  const parts: Readonly<Record<UiAlertDialogSlot, string>> = {
    overlay: theme.UiAlertDialog?.overlay ?? DEFAULT_PARTS.overlay,
    content: theme.UiAlertDialog?.content ?? DEFAULT_PARTS.content,
    title: theme.UiAlertDialog?.title ?? DEFAULT_PARTS.title,
    description: theme.UiAlertDialog?.description ?? DEFAULT_PARTS.description,
    actions: theme.UiAlertDialog?.actions ?? DEFAULT_PARTS.actions,
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={parts.overlay} />
        <AlertDialog.Popup
          data-slot="alert-dialog"
          initialFocus={() => actions.current?.querySelector("button") ?? null}
          className={parts.content}
        >
          <AlertDialog.Title className={parts.title}>{title}</AlertDialog.Title>
          <AlertDialog.Description className={parts.description}>
            {description}
          </AlertDialog.Description>

          <div className="mt-4">{children}</div>

          <div ref={actions} className={parts.actions}>
            <AlertDialog.Close render={<UiButton variant="secondary" />}>
              {cancelLabel}
            </AlertDialog.Close>
            <AlertDialog.Close
              render={<UiButton variant={confirmVariant} onClick={() => onConfirm?.()} />}
            >
              {confirmLabel}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiAlertDialogSlot, string>> = {
  overlay: "fixed inset-0 bg-overlay/40",
  content: cn(
    "fixed top-1/2 left-1/2 w-[min(28rem,92vw)] -translate-x-1/2 -translate-y-1/2",
    "rounded-surface bg-surface p-6 shadow-overlay",
    "focus:outline-none",
  ),
  title: "text-lg font-heading text-fg",
  description: "mt-1 text-sm text-fg-muted",
  actions: "mt-6 flex justify-end gap-2",
};
