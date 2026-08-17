<script setup lang="ts">
import { computed, inject, type VNode } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiSize, type UiVariant } from "../theme.ts";

/**
 * 按鈕。
 *
 * ── 這個檔案就是 shadcn 模型的示範 ──────────────────────────────────
 *
 * 樣式與行為都在這裡，**沒有上游可以問**。要改圓角、改 focus ring、
 * 改 disabled 的表現，就是改這個檔案 —— 不是覆寫別人的 CSS、不是等上游發版。
 * 這正是 D15 選這條路而不是 element-plus 的原因。
 *
 * 代價是：這個檔案的品質就是產品的品質，沒有人幫你把關。所以它歸
 * `platform/` 治理（CODEOWNERS ＋ api-surface 破壞性變更閘門）。
 *
 * ⚠️ **那句話在 2026-08-16 之前是假的。** api-surface 當時只比對 export
 * 名稱，而 `declare module "*.vue"` 讓 checker 對每個元件都回報同一個
 * `DefineComponent<Record<string, unknown>, …>` —— 實測加一個必填 prop，
 * 閘門零反應，連 UiButton 與 UiDialog 都分不出來。現在下面的 `defineProps`
 * 由 `tools/api-surface/src/shape.ts` 直接解析 SFC 取得，那句話才成立。
 *
 * ⚠️ **而它在 2026-08-17 之前只成立了一半。** 當時的限制寫著「加
 * `defineEmits`／`defineSlots`／`defineExpose` 會讓 api-surface 直接丟例外」，
 * 但那道絆線絆的是**巨集的名字**，不是公開面：下面那個 `<slot />` 從第一天
 * 就存在、就是公開面，而且**不需要任何巨集** —— 閘門一句話都沒說。
 * 現在 slot 與 emit 都要宣告，而且「模板裡有、宣告裡沒有」會直接紅。
 * 只剩 `defineExpose` 仍然擋著（`<script setup>` 預設封閉，那道絆線是真的）。
 *
 * ── 為什麼變體是純物件而不是 cva ────────────────────────────────────
 *
 * `class-variance-authority` 在這個規模只是把查表包一層。少一個相依
 * ＝ 少一筆 SCA 範圍、少一筆鏡像清單、少一次 `--capture`。
 *
 * ── 下面每一個顏色都是語意代幣，一個內建調色盤都沒有 ────────────────
 *
 * 在 2026-08-17 之前不是這樣：`secondary`（**預設**的那個 variant）是
 * `border-gray-300 bg-white text-gray-900 hover:bg-gray-50` —— 四個全是
 * Tailwind 內建色階。也就是各案換得掉強調色，**換不掉最常出現在畫面上的
 * 那顆按鈕**。那道落差由 `tools/theme-verify` 的靜態檢查守著（歸零前 16 處）。
 */

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: "sm" | "md";
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  {
    variant: "secondary",
    size: "md",
    // 預設 "button" 而不是瀏覽器預設的 "submit"：在表單裡放一個沒寫 type 的
    // 按鈕會意外送出表單，而那個 bug 每個團隊都會踩一次。
    type: "button",
    disabled: false,
  },
);

/**
 * ⚠️ 上面那兩個 union **刻意寫成字面值，不用 `UiVariant`／`UiSize` 別名**。
 *
 * `api-surface` 記錄的是 `defineProps` 的字面文字。換成別名之後，基準檔會
 * 從 `"primary" | "secondary" | …` 變成 `UiVariant` —— 而那之後
 * **union 少一個成員這道閘門就看不見了**，因為 UiButton 的形狀字串沒變。
 * 拿「少寫一次」換一道變弱的閘門，是這個 repo 一路在拆的那種交易。
 *
 * 代價是同一份 union 寫在三個地方：這裡、`../theme.ts` 的 `UiVariant`、
 * 以及下面 `VARIANTS` 的鍵。三者由 `../tests/component-contract.test.ts` 比對，
 * 任何一邊多或少一個成員都會紅 —— 而那支測試是**掃目錄**的，
 * 不是綁在這個檔名上，所以第三個元件加進來時它一樣會說話。
 *
 * ⚠️ 第一版把那個比對寫成**型別層的等式**（`Exact<typeof props.variant, UiVariant>`），
 * 而它什麼都沒檢查 —— **`vp check` 不對 `.vue` 做型別檢查**。實測：
 * `const broken: number = "字串"` 放在 `.vue` 裡是 0 errors，放在 `.ts` 裡是
 * 1 error。所以 SFC 裡的型別斷言是裝飾品。這個缺口記在 HANDOFF #26。
 */

/**
 * 按鈕的內容 —— 這是這個元件唯一的組合點（C62 的「互動方式」那條軸）。
 *
 * ⚠️ 宣告的**回傳型別是未經檢查的文字**：`vp check` 不對 `.vue` 做型別檢查
 * （HANDOFF #26），而 `api-surface` 是原文記錄它。所以 `VNode[]` 是照
 * Vue 的 `Slot` 型別寫的，不是被驗證過的 —— #26 修好之前它就是一份文件。
 * 它**受保護**的部分是另一件事：改了它，基準檔會漂移、閘門會紅。
 */
defineSlots<{
  default(): VNode[];
}>();

const VARIANTS: Readonly<Record<UiVariant, string>> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border-control border-line bg-surface text-fg hover:bg-surface-hover",
  danger: "bg-danger text-on-danger hover:bg-danger-hover",
  ghost: "text-fg-subtle hover:bg-surface-ghost-hover",
};

/**
 * 尺寸**刻意留成內建 spacing**，沒有代幣化。
 *
 * 判準是 #24 那句產品要求裡的分界：「一套基礎的 UI 版型」是要集中的，
 * 「配色／形狀／互動」才是各案要換的。高度與內距屬於版型 ——
 * 代幣化它們會長出 `--spacing-control-sm-padding` 這種名字，
 * 而真正想換尺寸的案子要換的是**整條規則**，不是其中一個數字。
 * 那條路由下面的擴充點提供（`sizes`）。
 */
const SIZES: Readonly<Record<UiSize, string>> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

// 各案的覆寫（見 ../theme.ts）。沒有人 provide 時是凍結的空物件。
const theme = inject(UI_THEME, NO_OVERRIDE);

const classes = computed(() =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-control",
    // focus-visible 而不是 focus：滑鼠點擊不該出現焦點環，鍵盤操作必須出現。
    // 用 focus 會讓設計師要求拿掉它，然後鍵盤使用者就看不到自己在哪裡了。
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-50",
    theme.UiButton?.[props.variant] ?? VARIANTS[props.variant],
    theme.UiButton?.[props.size] ?? SIZES[props.size],
  ),
);
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
