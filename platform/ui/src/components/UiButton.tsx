import { Button } from "@base-ui/react/button";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSize, UiVariant } from "../theme.ts";

/**
 * 按鈕。
 *
 * ── 這個檔案就是 shadcn 模型的示範 ──────────────────────────────────
 *
 * 樣式與行為都在這裡，**沒有上游可以問**。要改圓角、改 focus ring、
 * 改 disabled 的表現，就是改這個檔案 —— 不是覆寫別人的 CSS、不是等上游發版。
 * 這正是選這條路而不是 element-plus 的原因。代價是：這個檔案的品質就是
 * 產品的品質，沒有人幫你把關。所以它歸 `platform/` 的 CODEOWNERS 管，
 * 改公開面要當成破壞性變更處理。
 *
 * 由 shadcn CLI（Base UI 那一套）的 Button 改寫而來：產出是素材，契約照舊。
 * 留下的是 Base UI 的 `Button` 基元；換掉的是 cva 與 shadcn 的 variant 名
 * （`default`／`destructive` → `primary`／`danger`，理由見 `../theme.ts`）。
 * 覆寫是**整條替換**，不經 `cn` 附加 —— 同 `theme.ts` 的說明。
 *
 * ── 為什麼變體是純物件而不是 cva ────────────────────────────────────
 *
 * `class-variance-authority` 在這個規模只是把查表包一層。少一個相依
 * ＝ 少一筆 SCA 範圍、少一筆鏡像清單。
 *
 * ── 下面每一個顏色都是語意代幣，一個內建調色盤都沒有 ────────────────
 *
 * 在 2026-08-17 之前不是這樣：`secondary`（**預設**的那個 variant）是
 * `border-gray-300 bg-white text-gray-900 hover:bg-gray-50` —— 四個全是
 * Tailwind 內建色階。也就是各案換得掉強調色，**換不掉最常出現在畫面上的
 * 那顆按鈕**。現在元件裡一個內建色階都沒有（歸零前 16 處）。
 *
 * ── ⚠️ props 的 union **刻意寫成字面值，不用 `UiVariant`／`UiSize` 別名** ──
 *
 * 寫成字面值，union 少一個成員就會直接改變 `UiButton` 的簽章文字，
 * 讀 diff 的人看得到。換成別名之後，簽章只剩 `UiVariant` 這個名字 ——
 * **union 少一個成員，在 `UiButton` 的簽章上就看不出來了**。
 *
 * 代價是同一份 union 寫在三個地方：這裡、`../theme.ts` 的 `UiVariant`、
 * 以及下面 `VARIANTS` 的鍵，三者必須一起改。
 *
 * ⚠️ **React 沒有屬性穿透**：這裡收的就是下面列出的這幾個。使用端要第二種
 * 屬性時加在這裡，那是一筆相容的新增。
 */
export function UiButton({
  variant = "secondary",
  size = "md",
  // 預設 "button" 而不是瀏覽器預設的 "submit"：在表單裡放一個沒寫 type 的
  // 按鈕會意外送出表單，而那個 bug 每個團隊都會踩一次。
  type = "button",
  disabled = false,
  onClick,
  children,
}: {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
}): ReactNode {
  const theme = useUiTheme();
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-control",
    // focus-visible 而不是 focus：滑鼠點擊不該出現焦點環，鍵盤操作必須出現。
    // 用 focus 會讓設計師要求拿掉它，然後鍵盤使用者就看不到自己在哪裡了。
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-50",
    theme.UiButton?.[variant] ?? VARIANTS[variant],
    theme.UiButton?.[size] ?? SIZES[size],
  );

  return (
    <Button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

const VARIANTS: Readonly<Record<UiVariant, string>> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border-control border-line bg-surface text-fg hover:bg-surface-hover",
  danger: "bg-danger text-on-danger hover:bg-danger-hover",
  ghost: "text-fg-subtle hover:bg-surface-ghost-hover",
};

/**
 * 尺寸**刻意留成內建 spacing**，沒有代幣化。
 *
 * 判準是那句產品要求裡的分界：「一套基礎的 UI 版型」是要集中的，
 * 「配色／形狀／互動」才是各案要換的。高度與內距屬於版型 ——
 * 代幣化它們會長出 `--spacing-control-sm-padding` 這種名字，
 * 而真正想換尺寸的案子要換的是**整條規則**，不是其中一個數字。
 * 那條路由 `UiThemeOverride` 的 `sm`／`md` 兩格提供。
 */
const SIZES: Readonly<Record<UiSize, string>> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};
