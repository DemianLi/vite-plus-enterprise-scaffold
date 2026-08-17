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
import type { VNode } from "vue";
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

/**
 * ── 這三個 slot 就是 C62 那句「各案可以更換互動方式」的接縫 ────────────
 *
 * 配色與形狀是靠代幣換的（`createUiTheme`）；**互動換不了代幣，只能靠組合**。
 * 這三格分別對應三種粒度：
 *
 *   default  換內容
 *   footer   換**整組**收尾動作 —— 預設是「一顆關閉鈕」，各案可以放
 *            「確認／取消」、放一個表單送出、或放空的
 *   close    只換那顆關閉鈕本身（外層仍是 reka-ui 的 DialogClose，
 *            所以點擊會關閉、鍵盤與焦點行為不變）
 *
 * ⚠️ **它們從落地那天就存在，只是沒有被宣告過。** 而在 2026-08-17 之前
 * `api-surface` 看不見它們 —— 那道「加 defineSlots 會丟例外」的限制擋的是
 * 宣告，不是 slot 本身。實測：往模板加一個具名 slot，閘門全綠。
 * 現在宣告與模板必須一致，兩個方向都會紅。
 *
 * ⚠️ 回傳型別是**未經檢查的文字**（`.vue` 沒有型別檢查，見 HANDOFF #26）。
 */
defineSlots<{
  default(): VNode[];
  footer(): VNode[];
  close(): VNode[];
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
