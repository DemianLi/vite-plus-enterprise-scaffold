<script setup lang="ts">
import { inject } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiTextareaSlot } from "../theme.ts";

/**
 * 多行輸入框。
 *
 * ── reka-ui 沒有這個基元，而那是對的 ─────────────────────────────
 *
 * 原生 `<textarea>` 的鍵盤操作、選取、IME、無障礙全部是瀏覽器做的，
 * 沒有一項需要 JavaScript 補。headless 函式庫只在「原生元素做不到」的地方
 * 才有價值（Dialog 的焦點鎖定、Select 的鍵盤導航、Checkbox 的可換樣式勾勾）。
 *
 * ⚠️ 這一條值得寫下來，因為反過來做很常見：把每個元件都包一層基元，
 * 然後多背一份相依而換到零。
 *
 * ── 樣式與 `UiInput` 是同一組，刻意重複 ──────────────────────────
 *
 * 下面那條 class 與 `UiInput.input` 幾乎一樣。抽成共用常數是**錯的**：
 * 具名槽的語意是**整條替換**，各案覆寫 `UiInput.input` 時不該連帶動到
 * textarea。共用常數會讓兩個槽在預設值上耦合，而在覆寫後又不耦合 ——
 * 那種「有時一起變、有時不會」是最難查的一種。
 *
 * 差別只有兩處，都是多行才有的：`min-h-20`（一開始就看得出是多行）
 * 與 `field-sizing-content`（跟著內容長高，Baseline 2025，不支援時退回
 * 固定高度 —— 退化是「不會自己長高」，不是壞掉）。
 *
 * ── ⚠️ 代幣對照是人工核對的，沒有閘門在守（見 UiBadge、#57）────────
 *
 *   border-input                → border-line
 *   focus-visible:border-ring   → focus-visible:border-focus
 *   ring-ring/50                → ring-focus/50
 *   aria-invalid:*-destructive  → aria-invalid:*-danger
 *   placeholder:text-muted-fg   → placeholder:text-fg-muted
 *   rounded-md                  → rounded-control
 */

const model = defineModel<string>({ default: "" });

const DEFAULT_PARTS: Readonly<Record<UiTextareaSlot, string>> = {
  textarea: cn(
    "min-h-20 w-full min-w-0 field-sizing-content resize-y",
    "rounded-control border-control border-line bg-transparent px-3 py-2",
    "text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
    "placeholder:text-fg-muted",
    "focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50",
    "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  ),
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiTextareaSlot, string>> = {
  textarea: theme.UiTextarea?.textarea ?? DEFAULT_PARTS.textarea,
};
</script>

<template>
  <textarea v-model="model" data-slot="textarea" :class="parts.textarea"></textarea>
</template>
