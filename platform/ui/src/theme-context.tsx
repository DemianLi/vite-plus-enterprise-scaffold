import { createContext, useContext, type ReactNode } from "react";
import { checkedOverride, NO_OVERRIDE, type UiThemeOverride } from "./theme.ts";

/**
 * `theme.ts` 的 React 版接線（C235）。型別、槽名、兩道防線都在 `theme.ts`，
 * 這裡只換掉「怎麼把覆寫表交給元件」—— Vue 用 `provide`／`inject`，React 用 context。
 *
 * ⚠️ context 物件**刻意不匯出**，同 `UI_THEME` 不從 `index.ts` 匯出的理由：
 * 直接 `<UiThemeContext value={…}>` 會繞過 `checkedOverride()` 那兩道防線。
 */
const UiThemeContext = createContext<UiThemeOverride>(NO_OVERRIDE);

export function useUiTheme(): UiThemeOverride {
  return useContext(UiThemeContext);
}

export type UiThemeProvider = (props: { readonly children?: ReactNode }) => ReactNode;

/**
 * 裝進 composition root：
 *
 *     const UiTheme = createUiTheme({ UiButton: { secondary: "…" } });
 *     root.render(<UiTheme><App /></UiTheme>);
 *
 * 回傳一個元件而不是覆寫表，是為了讓「驗過的表」與「交給 context 的表」只可能是
 * 同一份：呼叫端手上沒有任何東西可以直接塞進 context。
 */
export function createUiTheme(override: UiThemeOverride): UiThemeProvider {
  const checked = checkedOverride(override);
  return function UiTheme({ children }) {
    return <UiThemeContext value={checked}>{children}</UiThemeContext>;
  };
}
