import type { ReactNode } from "react";
import { cn } from "../utils/cn.ts";
import { useUiTheme } from "../theme-context.tsx";
import type { UiSkeletonSlot } from "../theme.ts";

/**
 * 載入中的佔位方塊。
 *
 * ── 尺寸為什麼是 `className` 而不是 prop ───────────────────────────
 *
 * 骨架的尺寸是**每個使用點都不一樣**的（一行標題、一張頭像、一整塊卡片），
 * 做成 `size` union 只會逼出 `sm`／`md`／`lg` 三個猜出來的值，然後第四種
 * 需求出現時要改 `platform/`。所以這是唯一收 `className` 的元件。
 *
 * 它走 `cn()`（tailwind-merge），於是 `rounded-full` 這種與預設衝突的 class **會贏**。
 * 要換預設表裡的任何一條，仍然走 `UiThemeOverride` 的 `UiSkeleton.skeleton`（整條替換）。
 *
 * ── 輔具：骨架自己 `aria-hidden`，`aria-busy` 是**容器**的事 ───────
 *
 * WAI-ARIA 1.2 有一條 **MUST**，但它的適用條件要照抄清楚，不能只抄結論：
 * **當 widget 因為腳本執行或載入而缺了「必須擁有的子元素」時**，作者必須把
 * `aria-busy="true"` 標在**容器**（containing element）上。
 *
 * 骨架正是那個形狀 —— 內容還沒到，位置先擺著。所以照它做：`aria-busy` 歸
 * 容器，骨架自己不送。（規範講的是那個情形，不是「凡骨架皆如此」；下面
 * 那個論證才是這裡真正的理由，就算沒有這條 MUST 也成立。）
 *
 * 那為什麼不順手在骨架上再送一個 `role="status"`？因為它**同時吵又空**：
 *
 * - 空：`role="status"` 是一個 live region，而 live region 播報的是**它裡面
 *   的文字**。骨架是「還不存在的內容」的佔位，沒有無障礙名稱、沒有子節點 ——
 *   註冊了一個永遠沒東西可唸的 region。
 * - 吵：骨架的正常用法是一次排好幾個（一行標題＋三行內文＋一張頭像），
 *   那會變成 N 個 region 各自註冊。
 *
 * 兩件事指向同一個結論：**骨架不是訊號的發送者，它是要被藏起來的雜訊。**
 *
 * 那訊號去哪了？**消費端的容器**。理由不是分層好看，是只有交換點知道載入
 * 什麼時候結束 —— 骨架自己不知道（它沒有狀態）。使用端該長這樣：
 *
 *     <div aria-busy={pending} role="status" aria-label="載入中">
 *       <UiSkeleton className="h-4 w-32" />
 *       <UiSkeleton className="h-4 w-48" />
 *     </div>
 *
 * ⚠️ **這是「刻意不提供」**：上面那個容器 `platform/` 不生成、也守不到。
 * 閘門能證明的只有「骨架自己是 `aria-hidden`」（`tests/a11y.test.ts`）；
 * 「使用端有沒有送 busy」不在任何閘門的射程內。`aria-hidden` 不收成 prop：
 * 單一骨架要自己當訊號的情形，包一層容器就是出口。
 *
 * ── 動畫用 `animate-pulse` 而不是自訂 keyframes ───────────────────
 *
 * 自訂 keyframes 要寫進 `styles/index.css`，而那份檔案是**代幣**的家。
 * 一個只有一個元件在用的動畫住進去，下一個人就會照做，那份檔案會變成
 * 「所有 CSS 的家」—— 而它現在能被 `theme-verify` 逐格驗，正是因為它只有代幣。
 *
 * ⚠️ **`animate-pulse` 不自帶 `prefers-reduced-motion` 保護，所以要自己加。**
 * 實測 `tailwindcss@4.3.3`：`index.css`／`theme.css`／`preflight.css`／
 * `utilities.css` 四份全檔**沒有**這個媒體查詢（只有引擎 `dist/lib.mjs` 裡
 * 有，那是 variant 的實作，不是預設保護）。少了 `motion-reduce:animate-none`，
 * 這個閃動對前庭障礙使用者**關不掉**。
 *
 * 那一條真的有產出規則 —— 建置實測到的字串是
 * `@media (prefers-reduced-motion:reduce){.motion-reduce\:animate-none{animation:none}}`。
 * 這句話要有證據，是因為「class 寫了而執行期被丟掉」正是本 repo 栽過的坑，
 * 所以守它的斷言驗的是**產物裡的那段 CSS**，不是原始碼裡有沒有那個字。
 *
 * ⚠️ 它放在 `DEFAULT_PARTS` 裡，於是**走 `UiThemeOverride` 整條替換掉這一格
 * 的案子會連保護一起換掉**。這是「整條替換」那個設計的代價，不是疏漏：
 * 閘門守的是預設表，覆寫在它的射程之外（同 `theme-verify` README 那句
 * 「綠燈的意思是配色與形狀實測可換，不是設計系統可換」）。
 */
export function UiSkeleton({ className }: { className?: string }): ReactNode {
  const theme = useUiTheme();
  const parts: Readonly<Record<UiSkeletonSlot, string>> = {
    skeleton: theme.UiSkeleton?.skeleton ?? DEFAULT_PARTS.skeleton,
  };

  return <div data-slot="skeleton" aria-hidden="true" className={cn(parts.skeleton, className)} />;
}

const DEFAULT_PARTS: Readonly<Record<UiSkeletonSlot, string>> = {
  skeleton: "animate-pulse motion-reduce:animate-none rounded-control bg-surface-hover",
};
