/**
 * `@org/ui/react` —— 設計系統的 React 版公開契約（C235，Q57）。
 *
 * 遷移期間（C232 §六 ②–④）與 `index.ts`（Vue 版）並列：使用端的 Vue 畫面要到
 * 批次 ③ 才改寫，在那之前 `.` 必須仍然是 Vue。批次 ⑤ 刪 Vue 時這一份收回 `.`，
 * 那一步 `api-surface` 會判成破壞性變更 —— 當時沒有 fork（Q49），代價只在樹內。
 *
 * 規矩與 `index.ts` 相同：只具名轉出、不轉出基元（這裡是 `@base-ui/react`），
 * 由 `tests/styles.test.ts` 守；元件一律具名轉出，由 `tests/component-contract.test.ts`
 * 的 ① 逐支核對。
 */

export { UiButton } from "./components/UiButton.tsx";
export { cn } from "./utils/cn.ts";

export { createUiTheme } from "./theme-context.tsx";
export type { UiThemeProvider } from "./theme-context.tsx";
/**
 * 型別清單與 `index.ts` 逐字相同，**連還沒有 React 版的元件的槽型別也在**：
 * `UiThemeOverride` 引用了全部，而 `api-surface` 要求公開簽章裡出現的型別
 * 都要有名字可以稱呼（C235 §三）。
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
