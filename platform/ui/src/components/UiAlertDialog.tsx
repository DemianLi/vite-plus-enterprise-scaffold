import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRef, type ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { UiButton } from "./UiButton.tsx";
import { useUiTheme } from "../theme-context.tsx";
import type { UiAlertDialogSlot } from "../theme.ts";

/**
 * 破壞性動作的確認框。CRUD 的 D 就是它。
 *
 * ── ⚠️ 它**不是** `UiDialog` 換兩顆按鈕 ────────────────────────────
 *
 * 一開始判它是「`UiDialog` 的變體：`footer` 放兩顆鈕就好」，讀了基元的原始碼之後推翻。
 * 輔具聽到的是 `alertdialog` 不是 `dialog`、**點外面不會關**（Esc 仍然會）、而且**初始焦點
 * 落在「取消」**。最後一項是安全設計：焦點若落在「確認」，一個 Enter 就刪掉了 —— 而畫面上
 * 完全看不出差別。四件事都量過。
 *
 * 同 `UiSwitch` vs `UiCheckbox`：**差別是語意不是外觀，而選錯的代價由使用者付。**
 *
 * ── ⚠️ 初始焦點靠的是按鈕列的順序 ─────────────────────────────────────
 *
 * Base UI 的 `Popup` 預設聚焦**內容裡第一個可聚焦元素**。實測在 `children` 裡放一個連結，
 * 焦點就落在連結上（reka 版同一個情境落在取消：它靠 `AlertDialogCancel` 在掛載時把自己登記給
 * content，與 DOM 順序無關）。所以這裡用 `initialFocus` 指到**按鈕列裡的第一顆**，也就是
 * 取消。⚠️ 這條替身與預設那條靠的是同一個順序（取消寫在確認前面）：它補的是「`children` 裡有
 * 可聚焦的東西」那一格，不是與順序無關的保險 —— 對調兩顆，兩條路一起落到確認上。兩條都量過。
 *
 * 不用 ref 直接指到取消鈕：`UiButton` 不收 `ref`，幫它加一個選填的 `ref` 會改變它公開的函式型別，
 * 要當成破壞性變更處理 —— 為一個相容的新增付那個代價不值得。
 *
 * ── ⚠️ 為什麼**沒有** `footer`（`UiDialog` 有）─────────────────────
 *
 * 上面那個保護住在按鈕列的結構裡。給「整組換掉按鈕列」的出口，換掉的案子**會連保護一起換掉**。
 * 兩顆按鈕的樣式走 `UiButton` 既有的那幾格，不在這裡另開可覆寫的按鈕格 ——
 * 一個 `hidden` 的覆寫就足以讓保護消失，而且畫面上看不出來。
 *
 * ── ⚠️ 兩顆按鈕都會關掉對話框 ─────────────────────────────────────
 *
 * 兩顆都是 `AlertDialog.Close`（上游語意照做）。所以「按下確認 → 跑一個 async 刪除 → 中途顯示
 * spinner」在這個元件裡做不到：框在請求送出前就關了。需要「送出中」狀態的案子要的是一個表單
 * 對話框（`UiDialog` ＋ `footer`），不是確認框。`onConfirm` 在關閉**之前**被呼叫 —— 實測在
 * 處理器裡查 DOM，對話框還在；它在那一次狀態更新之後才消失。
 *
 * ── 用法 ──────────────────────────────────────────────────────────
 *
 *     <UiAlertDialog
 *       open={confirming}
 *       onOpenChange={setConfirming}
 *       title="刪除訂單"
 *       description="訂單編號 1024 會被永久刪除，這個動作無法復原。"
 *       confirmLabel="刪除"
 *       onConfirm={remove}
 *     />
 *
 * - `description` 必填，而且要寫清楚「會發生什麼、能不能復原」。這是使用者唯一的判斷依據，
 *   寫「確定嗎？」等於沒寫。
 * - `confirmLabel` **必填，而且要是動詞**（「刪除」「撤銷」），不是「確認」。刻意不給預設值 ——
 *   給了的話它會是「確認」，而「確定嗎？［確認］［取消］」正是使用者按錯的那種框。同 `UiSelect`
 *   的 `placeholder` 必填：選填會讓元件安靜地退化成沒用的樣子。
 * - `cancelLabel` 有預設值：它永遠就是「不要做剛剛那件事」。
 * - `confirmVariant` 預設 `danger`，因為它存在的理由就是「CRUD 的 D」。
 *   非破壞性的確認（例如「要離開嗎」）用 `primary`。
 * - `children` 放標題與說明之外要補的內容（例如「會一併刪除的 3 筆附件」清單）。放可聚焦的
 *   東西不會破壞焦點保護 —— 那正是 `initialFocus` 在接的那一格。
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
