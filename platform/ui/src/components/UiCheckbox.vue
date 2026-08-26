<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot, Label } from "reka-ui";
import { inject, useId, type VNode } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiCheckboxSlot } from "../theme.ts";

/**
 * 核取方塊。用 reka-ui 的 Checkbox 基元 ＋ Label。
 *
 * ── 為什麼不是 `<input type="checkbox">` ─────────────────────────
 *
 * 原生的那個**沒辦法換樣式**（勾勾是作業系統畫的），而各案換不掉勾勾的
 * 顏色就等於換不掉這個元件。慣用的解法是 `appearance-none` 加一個假勾勾，
 * 而那一步就把鍵盤操作、`aria-checked`、以及與 `<label>` 的關聯全部
 * 變成自己的責任 —— 那正是 `UiDialog` 選 reka-ui 的同一條理由。
 *
 * ⚠️ reka-ui 全套件唯一注入 `<style>` 的是 Splitter，Checkbox 不碰它
 * （`style-src 'self'` 那條由 `tools/conformance` 強制）。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守（見 UiBadge 的說明、#57）──
 *
 *   border-primary / bg-primary        → border-line / bg-accent
 *   text-primary-foreground            → text-on-accent
 *   focus-visible:ring-ring/50         → focus-visible:ring-focus/50
 *   data-[state=checked]:bg-primary    → data-[state=checked]:bg-accent
 *   rounded-sm                         → rounded-control
 *
 * ── 勾勾是內嵌 SVG 而不是圖示套件 ────────────────────────────────
 *
 * 多一個圖示套件就是多一筆 SCA 範圍、多一筆鏡像清單 —— 而換到的是一條
 * 八個字元的 path。`currentColor` 讓它跟著 `indicator` 那格代幣走，
 * 所以換配色時不必動到 SVG。
 *
 * ── 為什麼 `defineModel<boolean>()` 不具名 ───────────────────────
 *
 * 不具名的那一個產生 `modelValue` 與 `update:modelValue`，也就是
 * `v-model="checked"` 直接可用。`UiDialog` 用的是具名的 `defineModel("open")`
 * ——那裡具名是對的（一個對話框還有別的狀態），這裡沒有第二個狀態。
 *
 * ⚠️ 這是本 repo 第二個 `defineModel`，而且型別不同（`boolean` vs `UiInput`
 * 的 `string | number`）。`api-surface` 的基準會分別記著兩者 ——
 * 那條解析路在 C74 補好之前，這兩格都會**安靜地不進 API 表面**。
 *
 * ── 三態（indeterminate）刻意不做 ────────────────────────────────
 *
 * reka-ui 支援它，但它需要第二個 model（`v-model:indeterminate`），
 * 而目前沒有任何切片需要「部分選取」。真的需要時再加是一筆 minor
 * （新增一個選填的 model）—— 現在先做是 D16 說的那種過度設計。
 */

const checked = defineModel<boolean>({ default: false });

defineProps<{
  /**
   * 標籤文字。
   *
   * ⚠️ **選填**，因為預設 slot 一旦給了就完全取代它。第一版寫成必填，
   * 於是「只想在標籤裡放一個連結」的使用端被迫傳一個永遠不會顯示的字串。
   */
  label?: string;
}>();

/** 標籤位置的內容。給的話取代 `label` 純文字 —— 需要放連結時用得到。 */
defineSlots<{
  default(): VNode[];
}>();

/**
 * ⚠️ **`label` 與 slot 兩個都不給，這個方塊就沒有名字**（螢幕閱讀器會報
 * 「未命名的核取方塊」）。沒有閘門守得住 —— slot 有沒有內容是執行期才知道的，
 * 而 `label` 必填會逼出上面那個「傳一個不會顯示的字串」。所以寫在這裡。
 *
 * ── 下面這個 id 是 review 補的，而少了它整個元件的無障礙是壞的 ──────
 *
 * 第一版的 `<Label>` 沒有 `for`、也沒有包住 `CheckboxRoot`，而 `CheckboxRoot`
 * 沒有 `id` —— **兩者完全沒有關聯**。實測 SSR 產出：
 * `<button role="checkbox" aria-checked="false">` 沒有任何 accessible name，
 * 旁邊一個沒有 `for` 的 `<label>`。點標籤不會切換，輔具讀不到名字。
 *
 * 那正是這個檔案開頭說「選 reka-ui 就是為了不要自己扛這些」的那一類 ——
 * 用了基元不等於接對了，而**畫面看起來完全正常**。
 *
 * `useId()` 是 Vue 3.5 的內建，SSR 與用戶端會產生同一個值（不會 hydration
 * mismatch），所以不需要自己拼一個計數器。
 */
const inputId = useId();

const DEFAULT_PARTS: Readonly<Record<UiCheckboxSlot, string>> = {
  root: cn(
    "peer size-4 shrink-0 rounded-control border-control border-line bg-surface",
    "transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
  ),
  indicator: "flex items-center justify-center text-on-accent",
  label: "text-sm text-fg peer-disabled:opacity-50",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiCheckboxSlot, string>> = {
  root: theme.UiCheckbox?.root ?? DEFAULT_PARTS.root,
  indicator: theme.UiCheckbox?.indicator ?? DEFAULT_PARTS.indicator,
  label: theme.UiCheckbox?.label ?? DEFAULT_PARTS.label,
};
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <CheckboxRoot :id="inputId" v-model="checked" data-slot="checkbox" :class="parts.root">
      <CheckboxIndicator :class="parts.indicator">
        <svg viewBox="0 0 16 16" class="size-3" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </CheckboxIndicator>
    </CheckboxRoot>
    <Label :for="inputId" :class="parts.label">
      <slot>{{ label }}</slot>
    </Label>
  </div>
</template>
