<script setup lang="ts">
import { inject } from "vue";
import { NO_OVERRIDE, UI_THEME, type UiSkeletonSlot } from "../theme.ts";

/**
 * 載入中的佔位方塊。
 *
 * ── 這是這個 repo 第一個**零公開面**的元件 ────────────────────────
 *
 * 沒有 prop、沒有 slot、沒有 emit、沒有 model。`tools/api-surface` 把它記成
 * `{ kind: "component", members: [] }`。
 *
 * ⚠️ 那在 2026-08-19 之前是**不可能的**：解析器對「沒有解析出任何公開面」
 * 無條件丟例外（「空形狀等於沒有守」）。C74 拆掉那個例外時舉的例子就是
 * `Separator`／`Skeleton` 這種純版型元件 —— 這是第一個真實案例。
 *
 * 而空清單**不等於不比對**：`compare.ts` 判的是 `members !== undefined`，
 * 所以這個元件日後長出來的第一個 prop 仍然會漂移。
 *
 * ── 尺寸為什麼不做成 prop ─────────────────────────────────────────
 *
 * 骨架的尺寸是**每個使用點都不一樣**的（一行標題、一張頭像、一整塊卡片），
 * 做成 `size` union 只會逼出 `sm`／`md`／`lg` 三個猜出來的值，然後第四種
 * 需求出現時要改 `platform/`。
 *
 * 這裡靠 Vue 的 fallthrough：單根元件會自動合併使用端傳進來的 `class`。
 * 多宣告一個 `class` prop 只會讓 api-surface 多記一格，而那一格什麼都沒多守
 * （同 `UiInput`）。
 *
 * ⚠️ **但 fallthrough 是字串串接，不是 `twMerge`。** `<UiSkeleton
 * class="h-4 w-32" />` 對，因為尺寸與下面三條不衝突；而
 * `<UiSkeleton class="rounded-full" />` 產生的是
 * `rounded-control rounded-full` **兩個都在**，誰贏取決於產生的 CSS 裡誰排
 * 後面 —— 正是 `utils/cn.ts` 檔頭說 `twMerge` 存在就是為了防的那件事。
 *
 * 要換下面這三條裡的任何一條，走 `UiThemeOverride` 的 `UiSkeleton.skeleton`
 * （整條替換），不要靠 fallthrough 疊上去。
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
 * 什麼時候結束 —— 骨架自己不知道（它沒有 prop、沒有狀態，見上）。
 * 使用端該長這樣：
 *
 *     <div :aria-busy="pending" role="status" aria-label="載入中">
 *       <UiSkeleton class="h-4 w-32" />
 *       <UiSkeleton class="h-4 w-48" />
 *     </div>
 *
 * ⚠️ **這是一個零公開面元件的「刻意不提供」**：上面那個容器 `platform/` 不
 * 生成、也守不到。閘門能證明的只有「骨架自己是 `aria-hidden`」；
 * 「使用端有沒有送 busy」不在任何閘門的射程內。
 *
 * ⚠️ 實測 Vue 的 fallthrough：**非 class 屬性是「使用端覆蓋」**（`class` 才是
 * 串接）。所以 `<UiSkeleton aria-hidden="false" />` 真的會把這裡的 `true`
 * 換掉 —— 單一骨架要自己當訊號時這是出口，而它同樣**關得掉保護**。
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
 * 的案子會連保護一起換掉**。這是上面「整條替換」那個設計的代價，不是疏漏：
 * 閘門守的是預設表，覆寫在它的射程之外（同 `theme-verify` README 那句
 * 「綠燈的意思是配色與形狀實測可換，不是設計系統可換」）。
 */

const DEFAULT_PARTS: Readonly<Record<UiSkeletonSlot, string>> = {
  skeleton: "animate-pulse motion-reduce:animate-none rounded-control bg-surface-hover",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiSkeletonSlot, string>> = {
  skeleton: theme.UiSkeleton?.skeleton ?? DEFAULT_PARTS.skeleton,
};
</script>

<template>
  <div data-slot="skeleton" aria-hidden="true" :class="parts.skeleton" />
</template>
