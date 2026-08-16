<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { cn } from "../utils/cn.ts";

/**
 * 對話框。用 reka-ui 的 Dialog 基元。
 *
 * ── 為什麼不自己寫 ────────────────────────────────────────────────
 *
 * 對話框看起來只是「一個蓋在上面的框」，實際上要處理：焦點鎖定與還原、
 * Esc 關閉、外側點擊、`aria-modal` 與 `aria-labelledby`、背景捲動鎖定、
 * 以及螢幕閱讀器的朗讀順序。每一項做錯都不會壞掉，只會讓鍵盤與輔具使用者
 * 用不了 —— 而那種 bug 沒有人會回報，只會在無障礙稽核時一次全部出現。
 *
 * reka-ui 把這些做完了，而且**不帶任何樣式**，所以外觀仍然是我們的。
 *
 * ── CSP：這個元件零執行期樣式注入 ──────────────────────────────────
 *
 * reka-ui 全套件唯一會 `document.createElement("style")` 的地方是
 * **Splitter** 的拖曳游標（`dist/utils/style.js`）。Dialog 不碰它。
 *
 * 那條限制由 `tools/conformance` 強制：本 repo 禁止 import reka-ui 的
 * Splitter —— 因為 `style-src 'self'` 會把它注入的 `<style>` 擋掉，
 * 而症狀是「拖曳時游標不對」這種沒有人會聯想到 CSP 的小毛病。
 */

const open = defineModel<boolean>("open", { default: false });

defineProps<{
  title: string;
  /** 給螢幕閱讀器的說明。**必填** —— 沒有它的對話框對輔具使用者是一個無名的框。 */
  description: string;
}>();
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <!-- 色相在代幣、不透明度留在元件。`--color-overlay-40` 那種代幣會讓
           每換一次濃淡就多一格，見 styles/index.css 對這一條的說明。 -->
      <DialogOverlay class="fixed inset-0 bg-overlay/40" />
      <DialogContent
        :class="
          cn(
            'fixed top-1/2 left-1/2 w-[min(32rem,92vw)] -translate-x-1/2 -translate-y-1/2',
            'rounded-surface bg-surface p-6 shadow-overlay',
            'focus:outline-none',
          )
        "
      >
        <DialogTitle class="text-lg font-heading text-fg">{{ title }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-fg-muted">
          {{ description }}
        </DialogDescription>

        <div class="mt-4">
          <slot />
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <slot name="footer">
            <DialogClose as-child>
              <slot name="close" />
            </DialogClose>
          </slot>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
