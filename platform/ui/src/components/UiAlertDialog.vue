<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";
import { inject, type VNode } from "vue";
import { cn } from "../utils/cn.ts";
import UiButton from "./UiButton.vue";
import { NO_OVERRIDE, UI_THEME, type UiAlertDialogSlot } from "../theme.ts";

/**
 * 破壞性動作的確認框。CRUD 的 D 就是它。
 *
 * ── ⚠️ 它**不是** `UiDialog` 換兩顆按鈕 ────────────────────────────
 *
 * C81 一開始判它是「`UiDialog` 的變體：`footer` 槽放兩顆鈕就好」，
 * 讀了 `reka-ui` 的原始碼之後推翻。`AlertDialogContent` 對 `DialogContent`
 * 做了四件事（實測 `reka-ui@2.10.3`，`dist/AlertDialog/AlertDialogContent.js`）：
 *
 *     role: "alertdialog",
 *     onPointerDownOutside: withModifiers(() => {}, ["prevent"]),
 *     onInteractOutside:    withModifiers(() => {}, ["prevent"]),
 *     onOpenAutoFocus: () => nextTick(() => cancelElement?.focus(…)),
 *
 * 輔具聽到的是 alertdialog 不是 dialog、**點外面不會關**、而且**初始焦點
 * 落在「取消」**。最後一項是安全設計：焦點若落在「確認」，一個 Enter
 * 就刪掉了 —— 而畫面上完全看不出差別。
 *
 * 同 C78 §3 的 `UiSwitch` vs `UiCheckbox`：**差別是語意不是外觀，
 * 而選錯的代價由使用者付。**
 *
 * ── ⚠️ 為什麼**沒有** `footer` 槽（`UiDialog` 有）──────────────────
 *
 * 上面那個「焦點落在取消」不是 `AlertDialogContent` 自己做到的。
 * 它只準備了一個空的 `cancelElement`，**真正註冊的是 `AlertDialogCancel`
 * 自己的 `onMounted`**（`contentContext.onCancelElementChange(currentElement)`）。
 *
 * → **沒有渲染 `AlertDialogCancel`，`cancelElement` 就是 undefined，
 *   那行 `?.focus()` 變成 no-op**，而畫面完全正常。
 *
 * 所以這個元件不給「整組換掉按鈕列」的槽。同 C82 記下的形狀：
 * 走 `UiThemeOverride` 整條替換那一格的案子**會連保護一起換掉**。
 * 兩顆按鈕的樣式走 `UiButton` 既有的那幾格，不在這裡另開可覆寫的按鈕格 ——
 * 一個 `hidden` 的覆寫就足以讓保護消失，而且沒有任何閘門看得見。
 *
 * ── ⚠️ 兩顆按鈕都會關掉對話框 ─────────────────────────────────────
 *
 * `AlertDialogAction` 與 `AlertDialogCancel` **都是 `DialogClose`**。
 * 所以「按下確認 → 跑一個 async 刪除 → 中途顯示 spinner」在這個元件裡做不到：
 * 框在請求送出前就關了。那是上游的語意，這裡照做而不是繞過 ——
 * 需要「送出中」狀態的案子要的是一個表單對話框（`UiDialog` ＋ `footer` 槽），
 * 不是確認框。
 *
 * ── 用法 ──────────────────────────────────────────────────────────
 *
 *     <UiAlertDialog
 *       v-model:open="confirming"
 *       title="刪除訂單"
 *       description="訂單 #1024 會被永久刪除，這個動作無法復原。"
 *       confirm-label="刪除"
 *       @confirm="remove()"
 *     />
 *
 * ── ⚠️ 這個檔頭的最後一段：能驗到哪裡 ─────────────────────────────
 *
 * 見 `../../tests/alert-dialog.test.ts` 的檔頭。簡短版：**上面那四件事全部
 * 是用戶端行為，SSR 一個字都驗不到** —— reka-ui 的 `Teleport` 是
 * `isMounted || forceMount` 才渲染，而 `useMounted()` 在伺服器端是 false，
 * 所以整個對話框在 `renderToString` 下的產出是 `<!--v-if-->`。
 */

const open = defineModel<boolean>("open", { default: false });

withDefaults(
  defineProps<{
    /** 標題。**必填** —— 一個沒有標題的 alertdialog 對輔具使用者是無名的。 */
    title: string;
    /**
     * 說明。**必填**，而且要寫清楚「會發生什麼、能不能復原」。
     *
     * ⚠️ 這是使用者唯一的判斷依據。寫「確定嗎？」等於沒寫。
     */
    description: string;
    /**
     * 確認鈕上的字。**必填，而且要是動詞**（「刪除」「撤銷」），不是「確認」。
     *
     * ⚠️ 刻意不給預設值 —— 給了的話它會是「確認」，而
     * 「確定嗎？［確認］［取消］」正是使用者按錯的那種框。同 `UiSelect`
     * 的 `placeholder` 必填：選填會讓元件安靜地退化成沒用的樣子。
     */
    confirmLabel: string;
    /** 取消鈕上的字。這一顆有預設值 —— 它永遠就是「不要做剛剛那件事」。 */
    cancelLabel?: string;
    /**
     * 確認鈕的樣式。預設 `danger`，因為 C81 判它進範圍的理由原句就是
     * 「CRUD 的 D 就是它」。非破壞性的確認（例如「要離開嗎」）用 `primary`。
     */
    confirmVariant?: "primary" | "danger";
  }>(),
  {
    // ⚠️ 預設值寫在 `withDefaults` 而不是模板的 `?? "取消"`：契約測試
    // 「預設值必須是該 prop 的 union 成員之一」讀的是 `withDefaults`，
    // 寫進模板就逃掉了。這個錯誤在 v1.0.6 出現過三次。
    cancelLabel: "取消",
    confirmVariant: "danger",
  },
);

/**
 * 使用者按下確認鈕。
 *
 * ⚠️ **收到的時候對話框還開著，它在下一個 tick 才關。**（C88 實測更正 ——
 * 這裡原本寫的是「已經關了」。）在這個處理器裡同步寫 `open = true`
 * 會被一個 tick 之後的關閉安靜地蓋掉，所以不要從這裡改 `open`。
 *
 * 「兩顆按鈕都會關掉對話框」那件事本身沒有變，見檔頭 —— 錯的只有時序。
 */
const emit = defineEmits<{
  confirm: [];
}>();

/**
 * 標題與說明之外要補的內容 —— 例如「會一併刪除的 3 筆附件」清單。
 *
 * ⚠️ 這裡放可聚焦的東西（連結、輸入框）**不會**破壞焦點保護 —— 實測過。
 * 第一版的這段話寫的是相反的，推理是「DOM 順序那條路會被槽內容擋在前面」，
 * 而實測說註冊那條路壓過 DOM 順序（見 `alert-dialog.test.ts` 檔頭的 B3／B4）。
 * **寫了論證就要去量它。**
 *
 * 唯一還在的影響：槽內容會把那條**備援**路徑（DOM 順序）推後，
 * 所以它只在「註冊那條已經斷了」的世界裡才咬人。
 */
defineSlots<{
  default(): VNode[];
}>();

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

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiAlertDialogSlot, string>> = {
  overlay: theme.UiAlertDialog?.overlay ?? DEFAULT_PARTS.overlay,
  content: theme.UiAlertDialog?.content ?? DEFAULT_PARTS.content,
  title: theme.UiAlertDialog?.title ?? DEFAULT_PARTS.title,
  description: theme.UiAlertDialog?.description ?? DEFAULT_PARTS.description,
  actions: theme.UiAlertDialog?.actions ?? DEFAULT_PARTS.actions,
};
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay :class="parts.overlay" />
      <AlertDialogContent data-slot="alert-dialog" :class="parts.content">
        <AlertDialogTitle :class="parts.title">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription :class="parts.description">
          {{ description }}
        </AlertDialogDescription>

        <div class="mt-4">
          <slot />
        </div>

        <div :class="parts.actions">
          <AlertDialogCancel as-child>
            <UiButton variant="secondary">{{ cancelLabel }}</UiButton>
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <UiButton :variant="confirmVariant" @click="emit('confirm')">
              {{ confirmLabel }}
            </UiButton>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
