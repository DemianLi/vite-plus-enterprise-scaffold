import type { ReactNode } from "react";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSeparatorSlot } from "../theme.ts";

/**
 * 分隔線。
 *
 * ── 為什麼不是一個 `<hr>` 或一條 `border-t` ────────────────────
 *
 * 兩種都可以畫出線，差別在**輔具會不會唸它**。多數分隔線是純裝飾
 * （一個區塊與下一個區塊之間），唸出來只是噪音；少數是真的語意分界。
 * 所以**預設是裝飾**，`semantic` 才送 `role="separator"`。
 * 自己寫 `<hr>` 的話永遠是語意的（`<hr>` 有隱含的 `role="separator"`），
 * 於是一個排版用的分隔線會被唸出來。
 *
 * ⚠️ **不用 Base UI 的 `Separator`：它沒有「裝飾」這個模式**，永遠送 `role="separator"`
 * （`separator/Separator.js`）。照 shadcn 用它的話，預設就從「裝飾」翻成「語意」，
 * 每一條排版用的線都會被唸出來 —— 而畫面一個像素都不會變。這裡照 reka-ui 的
 * `BaseSeparator` 自己送屬性（裝飾 → `role="none"`；語意 → `role="separator"`，
 * 只有垂直時才帶 `aria-orientation`）。
 *
 * 垂直的要有明確高度（外面給），否則畫不出來。
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
