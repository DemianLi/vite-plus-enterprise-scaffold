<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";
import { inject } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiSwitchSlot } from "../theme.ts";

/**
 * 開關。
 *
 * ── 它與 `UiCheckbox` 不是同一件事，而選錯的代價是使用者按錯 ────────
 *
 * 兩者的視覺差別是慣例，**語意差別是真的**：
 *
 *   核取方塊  —— 表單的一部分，要按「送出」才生效
 *   開關      —— **立刻生效**，沒有送出這一步
 *
 * 所以「同意條款」永遠是 checkbox，「深色模式」永遠是 switch。
 * 把設定頁做成 checkbox 的話使用者會找送出鈕；把表單做成 switch 的話
 * 使用者會以為已經存檔了。這一條沒有閘門，只有這段話。
 *
 * reka-ui 的 `SwitchRoot` 送出的 `role="switch"` 與 `aria-checked`
 * 就是那個語意差別在輔具那一端的樣子。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守（見 UiBadge、#57）────────
 *
 *   data-[state=checked]:bg-primary    → data-[state=checked]:bg-accent
 *   data-[state=unchecked]:bg-input    → data-[state=unchecked]:bg-surface-hover
 *   bg-background（thumb）             → bg-surface
 *   focus-visible:ring-ring/50         → focus-visible:ring-focus/50
 *   rounded-full                       → 留著（開關就是圓的，不是代幣）
 *
 * ⚠️ `rounded-full` 刻意**不**換成 `rounded-control`：圓角在這裡不是風格
 * 選擇，是「這是一個開關」的形狀本身。真的要換的案子換整條槽。
 */

const checked = defineModel<boolean>({ default: false });

/**
 * ⚠️ **`id` 刻意不宣告成 prop，靠 fallthrough。**
 *
 * 第一版把它宣告成必填，理由是「這個元件是多根的，fallthrough 可能掉」——
 * **那個理由沒有查證，而且是錯的**：reka-ui 的基元自己 `v-bind="$attrs"`，
 * 實測拿掉宣告之後 `<UiSwitch id="c" />` 的產出仍然是 `id="c"`。
 *
 * 必填的代價是真的：`<UiSwitch v-model="dark" aria-label="深色模式" />`
 * 會**過不了型別檢查**，而那是一個完全合法、無障礙也正確的寫法。
 *
 * ⚠️ 這個元件**沒有內建標籤**（`UiCheckbox` 與 `UiRadioItem` 有）。
 * 所以名字只能來自外面：`<UiLabel for="…">` ＋ 同名的 `id`，或者 `aria-label`。
 * 兩個都不給的話開關是沒有名字的 —— 沒有閘門守得住，只有這句話。
 */

const DEFAULT_PARTS: Readonly<Record<UiSwitchSlot, string>> = {
  root: cn(
    // ⚠️ 這裡刻意**沒有** `peer`：這個元件裡沒有任何 `peer-*` 的兄弟，
    // 而外面的 `UiLabel` 不是兄弟節點（`peer-*` 只作用在同層的後續兄弟）。
    // 第一版寫了它 —— 一條寫了但永遠無效的 class，正是 `UiInput` 的檔頭
    // 拿掉 `dark:` 變體的同一個理由。
    "inline-flex h-6 w-11 shrink-0 items-center rounded-full",
    "border-control border-transparent transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-focus/50",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-hover",
  ),
  thumb: cn(
    "pointer-events-none block size-5 rounded-full bg-surface shadow",
    "transition-transform",
    "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5",
  ),
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiSwitchSlot, string>> = {
  root: theme.UiSwitch?.root ?? DEFAULT_PARTS.root,
  thumb: theme.UiSwitch?.thumb ?? DEFAULT_PARTS.thumb,
};
</script>

<template>
  <SwitchRoot v-model="checked" data-slot="switch" :class="parts.root">
    <SwitchThumb :class="parts.thumb" />
  </SwitchRoot>
</template>
