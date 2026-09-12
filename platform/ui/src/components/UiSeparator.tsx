import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSeparatorSlot } from "../theme.ts";

/**
 * 分隔線，React 版（C236）。為什麼預設是裝飾、不給輔具唸，見 `UiSeparator.vue` 的檔頭。
 *
 * ⚠️ **不用 Base UI 的 `Separator`：它沒有「裝飾」這個模式**，永遠送 `role="separator"`
 * （`separator/Separator.js`）。照 shadcn 用它的話，預設就從「裝飾」翻成「語意」，
 * 每一條排版用的線都會被唸出來 —— 而畫面一個像素都不會變。這裡照 reka-ui 的
 * `BaseSeparator` 自己送屬性（裝飾 → `role="none"`；語意 → `role="separator"`，
 * 只有垂直時才帶 `aria-orientation`），`tests/react-parity.test.ts` 逐字比對兩版的產出。
 */
export function UiSeparator({
  orientation = "horizontal",
  semantic = false,
}: {
  orientation?: "horizontal" | "vertical";
  semantic?: boolean;
}): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiSeparatorSlot, string>> = {
    separator: theme.UiSeparator?.separator ?? DEFAULT_PARTS.separator,
  };

  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      role={semantic ? "separator" : "none"}
      aria-orientation={semantic && orientation === "vertical" ? "vertical" : undefined}
      className={parts.separator}
    />
  );
}

const DEFAULT_PARTS: Readonly<Record<UiSeparatorSlot, string>> = {
  separator:
    "shrink-0 bg-line data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
};
