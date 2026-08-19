<script setup lang="ts">
import { computed, inject, useId, type VNode } from "vue";
import UiLabel from "./UiLabel.vue";
import { NO_OVERRIDE, UI_THEME, type UiFieldSlot } from "../theme.ts";

/**
 * 表單欄位的版型與**接線**：標籤 ＋ 控制項 ＋ 說明 ＋ 錯誤訊息。
 *
 * ── 它補的是兩個已經寫在別的檔頭裡的洞 ────────────────────────────
 *
 * 這個元件不是「上游有所以我們也要有」。它補的兩個洞，兩份原始碼裡都
 * 已經自己承認了：
 *
 *   `UiLabel`      「`for` 是**使用端的責任**，而這裡沒有任何閘門守得住它」
 *   `UiDatePicker` 三條 `aria-invalid:*` 是**死的** —— 沒有任何東西在設它（C79）
 *
 * 兩個的症狀是同一種：**畫面完全正常，而鍵盤與輔具那一半是壞的**。
 * `for` 對不到 id 就是沒有標籤；`aria-invalid` 沒人設，那三條紅框樣式
 * 從落地那天起就沒有機會生效。
 *
 * ── ⚠️ 上游的 `Field` 不做接線，所以這一個刻意不照抄 ──────────────
 *
 * shadcn 的 `Field` 是九個子元件的**版型家族**，而 `aria-describedby` 與
 * `aria-invalid` 全部要使用者自己寫：
 *
 *     <Field data-invalid>
 *       <FieldLabel for="email">Email</FieldLabel>
 *       <Input id="email" aria-invalid />        ← 手動
 *       <FieldError>…</FieldError>
 *     </Field>
 *
 * 照抄的話這個元件就只是一個 `flex flex-col gap-2` —— **缺了看得出來**
 * （C81 的層 2），而上面那兩個洞一個都沒補到。
 *
 * ── 為什麼是 scoped slot 而不是 provide/inject ────────────────────
 *
 * Vue 的 slot 內容由**使用端**建立，父層改不了它的 props（沒有
 * `cloneElement`）。所以「自動接上去」在 Vue 裡只有一條路：`provide` 一個
 * context，讓每個控制項自己 `inject`。
 *
 * ⚠️ 那條路要動 `UiInput`／`UiSelect`／`UiTextarea`／`UiDatePicker` 全部，
 * 讓它們長出一個**看不見的耦合** —— 而 `UiInput` 現在是零 prop 的，
 * 它的檔頭說「多宣告一格什麼都沒多守」。為了這個元件把那句話推翻，代價
 * 比換到的多。
 *
 * 所以走中間那條：**值由這裡產生，綁定由使用端寫一行**。
 *
 *     <UiField label="電子郵件" :error="errors.email" v-slot="{ control }">
 *       <UiInput v-model="email" v-bind="control" />
 *     </UiField>
 *
 * ⚠️ **使用端忘了 `v-bind="control"` 的話，接線還是斷的** —— 而且畫面正常。
 * 這裡沒有閘門守得住，只有這句話。換到的是「該有哪些值」不用再想：
 * 一個物件、一次綁上，不必記得錯誤訊息要有 id、要進 `aria-describedby`、
 * 控制項要 `aria-invalid`。
 *
 * ── ⚠️ 錯誤訊息刻意**沒有** `role="alert"` ────────────────────────
 *
 * 錯誤透過 `aria-describedby` 在聚焦時被唸到就夠了。加上 live region 的話，
 * **即時驗證**（每打一個字就重算）會變成每打一個字打斷唸讀一次。
 * 「提交後跳到第一個錯誤欄位」是**表單層**的責任，不是欄位層的。
 *
 * ⚠️ 這段話寫在檔頭而不是模板裡，因為**模板註解會進 SSR 產物** ——
 * `renderToString` 不移除註解（用戶端 production build 會），所以一段中文
 * 論證會出現在使用 Nuxt 那種 SSR 的專案下載的 HTML 裡。同 C83 的形狀：
 * 寫在原始碼裡的東西進了交付物。⚠️ `UiDialog` 的模板裡也有一段，另外處理。
 *
 * ── ⚠️ 這是第一個 import 別的元件的元件 ──────────────────────────
 *
 * 在此之前 `platform/ui` 裡沒有任何元件 import 另一個元件。這裡用 `UiLabel`
 * 而不是自己再包一次 reka-ui 的 `Label`，理由是**行為會漂移**：`UiLabel`
 * 用 reka-ui 的 `Label` 是為了「按兩下不選取文字」那件事，自己再寫一份的話
 * 兩份哪天不一樣了沒有人會發現。
 *
 * ⚠️ 而這與 C78 §3 的「`UiTextarea` 刻意重複不抽共用」不衝突 —— 那一條講的是
 * **樣式**（具名槽的語意是整條替換，抽出來會讓兩個槽在預設值上耦合），
 * 這裡是**行為**。所以標籤的樣式仍然走 `UiLabel` 的那一格，這個元件
 * 不再開一格 `label`。
 */

const props = defineProps<{
  /**
   * 欄位名稱。**必填** —— 一個沒有標籤的表單欄位對輔具使用者是無名的，
   * 而那正是 `UiLabel` 檔頭說沒有閘門守得住的那件事。
   */
  label: string;
  /** 補充說明。給了才會渲染，而且會進 `aria-describedby`。 */
  description?: string;
  /**
   * 錯誤訊息。給了才會渲染，而且**同時**做三件事：進 `aria-describedby`、
   * 讓 `control` 帶上 `aria-invalid`、渲染紅字。
   */
  error?: string;
}>();

/**
 * 控制項。`v-bind="control"` 一次綁上 `id` 與兩個 aria 屬性。
 *
 * ⚠️ 回傳型別是**未經檢查的文字**（`.vue` 沒有型別檢查，見 HANDOFF #26）。
 */
defineSlots<{
  default(props: { control: Readonly<Record<string, string | true | undefined>> }): VNode[];
}>();

// `useId()` 是 Vue 3.5 的內建，SSR 與用戶端產生同一個值（不會 hydration
// mismatch）—— 同 UiCheckbox。
const controlId = useId();
const descriptionId = useId();
const errorId = useId();

/**
 * ⚠️ `aria-describedby` 要**兩個都指到**，而順序就是唸出來的順序：
 * 說明先、錯誤後。只送其中一個是很容易寫出來的 bug ——
 * 畫面上兩行都在，而輔具只聽得到一行。
 *
 * ⚠️ 沒有任何一個時必須是 `undefined` 而不是空字串：`aria-describedby=""`
 * 是一個指向空的引用，某些輔具會唸出「空白」。
 */
const control = computed(() => {
  const described = [props.description ? descriptionId : "", props.error ? errorId : ""]
    .filter(Boolean)
    .join(" ");

  return {
    id: controlId,
    "aria-describedby": described === "" ? undefined : described,
    // ⚠️ 必須是 `true` 不是 `false`：Vue 會把 `false` 渲染成
    // `aria-invalid="false"`（aria-* 保留 false），而 Tailwind 的
    // `aria-invalid:*` variant 選的是 `[aria-invalid="true"]` ——
    // 送 false 不會讓樣式生效，但會在 DOM 裡留下一個看起來有設的屬性。
    "aria-invalid": props.error ? (true as const) : undefined,
  };
});

const DEFAULT_PARTS: Readonly<Record<UiFieldSlot, string>> = {
  field: "flex flex-col gap-1.5",
  // ⚠️ 說明與錯誤共用一個間距而不是各自帶 margin：兩者是互斥的常見情況
  // （有錯誤時說明常被隱藏），各自帶 margin 的話「只有一個」與「兩個都有」
  // 的間距會不一樣，而那種差異沒有人會回報。
  description: "text-sm text-fg-muted",
  error: "text-sm text-danger",
};

const theme = inject(UI_THEME, NO_OVERRIDE);
const parts: Readonly<Record<UiFieldSlot, string>> = {
  field: theme.UiField?.field ?? DEFAULT_PARTS.field,
  description: theme.UiField?.description ?? DEFAULT_PARTS.description,
  error: theme.UiField?.error ?? DEFAULT_PARTS.error,
};
</script>

<template>
  <div data-slot="field" :class="parts.field">
    <UiLabel :for="controlId">{{ label }}</UiLabel>

    <slot :control="control" />

    <p
      v-if="description"
      :id="descriptionId"
      data-slot="field-description"
      :class="parts.description"
    >
      {{ description }}
    </p>
    <p v-if="error" :id="errorId" data-slot="field-error" :class="parts.error">
      {{ error }}
    </p>
  </div>
</template>
