/**
 * `@org/ui` —— 設計系統的唯一公開契約。
 *
 * ── 為什麼元件住在這裡而不是各切片裡 ────────────────────────────────
 *
 * shadcn 的模型是「你擁有原始碼」，所以「複製到哪」是一個必須回答的架構問題。
 * 答案已經被決定了：切片禁止互相依賴，所以複製進每個切片就**沒有任何
 * 機制能讓它們收斂** —— 設計系統會在第二個切片出現的那天碎片化，
 * 而且沒有人會發現，因為每一片自己看起來都是對的。
 *
 * 放在 `platform/` 換來的是既有的流程：CODEOWNERS 與破壞性變更的版本規則。
 * 多的是流程，不是新的架構概念。
 *
 * ── 這份 export 清單就是 API 表面 ───────────────────────────────────
 *
 * 移除或改名任何一個 export 都算破壞性變更，要附遷移方式 ——
 * 因為所有切片都依賴這個 package，一個沒交代的改名會同時打斷所有團隊。
 *
 * ── 不要從這裡轉出基元 ─────────────────────────────────────────────
 *
 * 使用端只該看到我們包裝過的元件。直接轉出 `@base-ui/react` 或
 * `react-day-picker` 等於把「哪些基元可以用」這件事交給每個團隊各自決定 ——
 * 而基元庫哪一版開始在執行期注入 `<style>`，就會被本 repo 的
 * `style-src 'self'` 安靜擋掉（Radix 的捲動鎖定就是這樣出局的）。
 *
 * ── 這一份在 Vue 退場前叫 `./react` ─────────────────────────────────
 *
 * 那段期間 `.` 仍是 Vue 版；Vue 退場時收回 `.`，舊的 `@org/ui/react`
 * import 要改成 `@org/ui`。
 */

export { UiButton } from "./components/UiButton.tsx";
export { UiInput } from "./components/UiInput.tsx";
export { UiBadge } from "./components/UiBadge.tsx";
export { UiCheckbox } from "./components/UiCheckbox.tsx";
export { UiSkeleton } from "./components/UiSkeleton.tsx";
export { UiTabs } from "./components/UiTabs.tsx";
export { UiTabsPanel } from "./components/UiTabsPanel.tsx";
export { UiAlert } from "./components/UiAlert.tsx";
export { UiPagination } from "./components/UiPagination.tsx";
export { UiSeparator } from "./components/UiSeparator.tsx";
export { UiTable } from "./components/UiTable.tsx";
export { UiTableBody } from "./components/UiTableBody.tsx";
export { UiTableCell } from "./components/UiTableCell.tsx";
export { UiTableHead } from "./components/UiTableHead.tsx";
export { UiTableHeadCell } from "./components/UiTableHeadCell.tsx";
export { UiTableRow } from "./components/UiTableRow.tsx";
export { UiLabel } from "./components/UiLabel.tsx";
export { UiField } from "./components/UiField.tsx";
export { UiRadioGroup } from "./components/UiRadioGroup.tsx";
export { UiRadioItem } from "./components/UiRadioItem.tsx";
export { UiSwitch } from "./components/UiSwitch.tsx";
export { UiTextarea } from "./components/UiTextarea.tsx";
export { UiDialog } from "./components/UiDialog.tsx";
export { UiAlertDialog } from "./components/UiAlertDialog.tsx";
export { UiSelect } from "./components/UiSelect.tsx";
export { UiDropdownMenu } from "./components/UiDropdownMenu.tsx";
export { UiDatePicker } from "./components/UiDatePicker.tsx";
export { cn } from "./utils/cn.ts";

/**
 * 各案客製的擴充點。
 *
 * ⚠️ context 物件**刻意不在這裡匯出**：唯一的入口是 `createUiTheme()`，因為只有它
 * 擋得掉空覆寫與空字串（見 theme.ts 的 `checkedOverride`）。直接把表塞進 context
 * 會繞過那兩條，而繞過去的症狀是「按鈕變成一個看不見但點得到的方塊」。
 */
export { createUiTheme } from "./theme-context.tsx";
export type { UiThemeProvider } from "./theme-context.tsx";
/**
 * 型別清單要涵蓋每一支元件的槽型別：`UiThemeOverride` 引用了全部，
 * 而公開簽章裡出現的型別都要有名字可以稱呼。
 */
export type {
  UiAlertDialogSlot,
  UiAlertSlot,
  UiBadgeSlot,
  UiButtonSlot,
  UiCheckboxSlot,
  UiDatePickerSlot,
  UiDialogSlot,
  UiDropdownMenuSlot,
  UiInputSlot,
  UiLabelSlot,
  UiFieldSlot,
  UiPaginationSlot,
  UiRadioGroupSlot,
  UiRadioItemSlot,
  UiSelectSlot,
  UiSeparatorSlot,
  UiSize,
  UiSkeletonSlot,
  UiSwitchSlot,
  UiTableBodySlot,
  UiTableCellSlot,
  UiTableHeadCellSlot,
  UiTableHeadSlot,
  UiTableRowSlot,
  UiTableSlot,
  UiTabsPanelSlot,
  UiTabsSlot,
  UiTextareaSlot,
  UiThemeOverride,
  UiVariant,
} from "./theme.ts";
