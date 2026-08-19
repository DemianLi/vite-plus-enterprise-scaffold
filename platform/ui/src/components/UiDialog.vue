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
import { inject, type VNode } from "vue";
import { cn } from "../utils/cn.ts";
import { NO_OVERRIDE, UI_THEME, type UiDialogSlot } from "../theme.ts";

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

/**
 * ── 「形狀」那條軸的接縫 ────────────────────────────────────────────
 *
 * ⚠️ **這個元件在 2026-08-17 之前完全沒有這一格。** 值走代幣、結構走 slot，
 * 但形狀寫死在模板裡 —— 一個要把對話框改成手機版底部滑出的案子，
 * 代幣換不掉（那不是值）、slot 換不掉（那不是結構），只能去改這個檔案，
 * 也就是要集中的那一半。而 HANDOFF 當時寫著「接縫是通的」。
 *
 * 那句話對 `UiButton` 為真、對這個元件為假，**而沒有任何東西會說話** ——
 * 因為當時的檢查是 `readFileSync("UiButton.vue")`，寫死一個檔名。
 * 現在改成掃目錄（`../tests/component-contract.test.ts`）。
 *
 * ── ⚠️ 不要新增 `UiSheet`：它就是 `content` 槽（C81）────────────────
 *
 * shadcn 的 `Sheet`（從側邊滑出的對話框）**不是另一個元件**，是這一格的
 * 覆寫：`fixed inset-y-0 right-0 h-full w-96` 取代下面那串
 * `top-1/2 left-1/2 -translate-*`。焦點鎖定、Esc、外側點擊、`aria-modal`
 * 全部原封不動 —— 上面那段「手機版底部滑出」講的就是這件事。
 *
 * 新增一個 `UiSheet` 的代價不是多一個檔案，是**兩份無障礙接線從此各自
 * 漂移** —— 而其中一份壞掉的時候畫面完全正常。
 *
 * ⚠️ `Drawer` 不同：它靠拖曳手勢關閉，那個換不出來，要新的基元。
 *
 * ── 四個槽名的來源 ──────────────────────────────────────────────────
 *
 * 不是我們取的：它們就是上面 import 的 reka-ui 基元名，也是 shadcn-vue 的
 * part 名。設計師講「overlay 要更淡」，前端要改的那一格就叫 `overlay`。
 *
 * ⚠️ 刻意**沒有**給那兩個排版用的 `<div>`（`mt-4` 與 `mt-6 flex …`）槽。
 * 規則若是「每一塊 class 都要有槽」，那兩格會被逼出沒有人會覆寫的槽名 ——
 * 形式主義的閘門第一天就會被加例外，而例外永遠不會拿掉（C41）。
 * 「接縫夠不夠」是 review 的職責，不是靜態檢查的。
 */
const DEFAULT_PARTS: Readonly<Record<UiDialogSlot, string>> = {
  overlay: "fixed inset-0 bg-overlay/40",
  content: cn(
    "fixed top-1/2 left-1/2 w-[min(32rem,92vw)] -translate-x-1/2 -translate-y-1/2",
    "rounded-surface bg-surface p-6 shadow-overlay",
    "focus:outline-none",
  ),
  title: "text-lg font-heading text-fg",
  description: "mt-1 text-sm text-fg-muted",
};

// 覆寫表是凍結的、而且不依賴 props，所以**每個實例解析一次**就好 ——
// 不需要 computed。
//
// ⚠️ 「一次」指的是**每個實例一次**，不是整個 module 一次：`<script setup>`
// 的本體就是 `setup()`。上面 DEFAULT_PARTS 裡那個 cn() 也一樣。
// 量過了，那樣是對的 —— 每個實例 0.26 – 0.29 µs，而實例掛載本身約 2.8 µs，
// 提到真正的 module 層只會把未命中的成本搬到 import 時（C75、utils/cn.ts）。
const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiDialogSlot, string>> = {
  overlay: theme.UiDialog?.overlay ?? DEFAULT_PARTS.overlay,
  content: theme.UiDialog?.content ?? DEFAULT_PARTS.content,
  title: theme.UiDialog?.title ?? DEFAULT_PARTS.title,
  description: theme.UiDialog?.description ?? DEFAULT_PARTS.description,
};
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <!-- 色相在代幣、不透明度留在元件。`--color-overlay-40` 那種代幣會讓
           每換一次濃淡就多一格，見 styles/index.css 對這一條的說明。 -->
      <DialogOverlay :class="parts.overlay" />
      <DialogContent :class="parts.content">
        <DialogTitle :class="parts.title">{{ title }}</DialogTitle>
        <DialogDescription :class="parts.description">
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
