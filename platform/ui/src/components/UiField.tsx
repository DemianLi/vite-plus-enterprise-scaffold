import { useId, type ReactNode } from "react";
import { UiLabel } from "./UiLabel.tsx";
import { useUiTheme } from "../theme-context.tsx";
import type { UiFieldSlot } from "../theme.ts";

/**
 * 表單欄位的版型與**接線**：標籤 ＋ 控制項 ＋ 說明 ＋ 錯誤訊息。
 *
 * ── 它補的是兩個已經寫在別的檔頭裡的洞 ────────────────────────────
 *
 *   `UiLabel`      「`htmlFor` 是**使用端的責任**，而這裡守不住它」
 *   `UiDatePicker` 那三條 `aria-invalid:*` 要有東西去設
 *
 * 兩個的症狀是同一種：**畫面完全正常，而鍵盤與輔具那一半是壞的**。
 * `htmlFor` 對不到 id 就是沒有標籤；`aria-invalid` 沒人設，紅框樣式就沒有機會生效。
 *
 * ── ⚠️ 上游的 `Field` 不做接線，所以這一個刻意不照抄 ──────────────
 *
 * shadcn 的 `Field` 是九個子元件的**版型家族**，而 `aria-describedby` 與
 * `aria-invalid` 全部要使用者自己寫：
 *
 *     <Field data-invalid>
 *       <FieldLabel htmlFor="email">Email</FieldLabel>
 *       <Input id="email" aria-invalid />        ← 手動
 *       <FieldError>…</FieldError>
 *     </Field>
 *
 * 照抄的話這個元件就只是一個 `flex flex-col gap-2` —— **缺了看得出來**，
 * 而上面那兩個洞一個都沒補到。
 *
 * ── 為什麼是 render prop 而不是 context ─────────────────────────
 *
 * context 的路要動 `UiInput`／`UiSelect`／`UiTextarea`／`UiDatePicker` 全部，讓它們
 * 各自去讀一個**看不見的耦合**；`cloneElement` 只碰得到直接子節點，使用端包一層
 * 就安靜地斷掉。所以走中間那條：**值由這裡產生，綁定由使用端寫一行**。
 *
 *     <UiField label="電子郵件" error={errors.email}>
 *       {(control) => <UiInput {...control} value={email} onValueChange={setEmail} />}
 *     </UiField>
 *
 * ⚠️ **使用端沒把 `control` 展開上去，接線還是斷的** —— 而且畫面正常。
 * 這裡守不住，只有這句話。換到的是「該有哪些值」不用再想：
 * 一個物件、一次展開，不必記得錯誤訊息要有 id、要進 `aria-describedby`、
 * 控制項要 `aria-invalid`。能收下這三格的控制項把那三個 prop 明列出來，見 `UiInput.tsx`。
 *
 * ── ⚠️ 錯誤訊息刻意**沒有** `role="alert"` ────────────────────────
 *
 * 錯誤透過 `aria-describedby` 在聚焦時被唸到就夠了。加上 live region 的話，
 * **即時驗證**（每打一個字就重算）會變成每打一個字打斷唸讀一次。
 * 「提交後跳到第一個錯誤欄位」是**表單層**的責任，不是欄位層的。
 *
 * ── ⚠️ 這是第一個 import 別的元件的元件 ──────────────────────────
 *
 * 用 `UiLabel` 而不是自己再寫一個 `<label>`，理由是**行為會漂移**：`UiLabel` 帶著
 * 「按兩下不反白」那件事（`select-none`），自己再寫一份的話兩份哪天不一樣了沒有人會發現。
 * 這與「`UiTextarea` 刻意重複不抽共用」不衝突 —— 那一條講的是
 * **樣式**（具名槽的語意是整條替換），這裡是**行為**。所以標籤的樣式仍然走
 * `UiLabel` 的那一格，這個元件不再開一格 `label`。
 *
 * `label` 必填：一個沒有標籤的表單欄位對輔具使用者是無名的。
 */
export function UiField({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: string;
  error?: string;
  children: (control: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => ReactNode;
}): ReactNode {
  const controlId = useId();
  const descriptionId = useId();
  const errorId = useId();

  // ⚠️ 兩個都要指到，而順序就是唸出來的順序：說明先、錯誤後。只送其中一個是很容易
  // 寫出來的 bug —— 畫面上兩行都在，輔具只聽得到一行。一個都沒有時是 undefined 不是
  // 空字串：`aria-describedby=""` 是指向空的引用，某些輔具會唸出「空白」。
  // `aria-invalid` 必須是 `true` 不是 `false`：`false` 會渲染成 `aria-invalid="false"`，
  // 而 `aria-invalid:*` variant 選的是 `[aria-invalid="true"]` —— 樣式不生效，DOM 裡卻
  // 留下一個看起來有設的屬性。
  const described = [description ? descriptionId : "", error ? errorId : ""]
    .filter(Boolean)
    .join(" ");
  const control = {
    id: controlId,
    "aria-describedby": described === "" ? undefined : described,
    "aria-invalid": error ? (true as const) : undefined,
  };

  const theme = useUiTheme();
  const parts: Readonly<Record<UiFieldSlot, string>> = {
    field: theme.UiField?.field ?? DEFAULT_PARTS.field,
    description: theme.UiField?.description ?? DEFAULT_PARTS.description,
    error: theme.UiField?.error ?? DEFAULT_PARTS.error,
  };

  return (
    <div data-slot="field" className={parts.field}>
      <UiLabel htmlFor={controlId}>{label}</UiLabel>
      {children(control)}
      {description ? (
        <p id={descriptionId} data-slot="field-description" className={parts.description}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} data-slot="field-error" className={parts.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const DEFAULT_PARTS: Readonly<Record<UiFieldSlot, string>> = {
  field: "flex flex-col gap-1.5",
  // ⚠️ 說明與錯誤共用一個間距而不是各自帶 margin：兩者是互斥的常見情況
  // （有錯誤時說明常被隱藏），各自帶 margin 的話「只有一個」與「兩個都有」
  // 的間距會不一樣，而那種差異沒有人會回報。
  description: "text-sm text-fg-muted",
  error: "text-sm text-danger",
};
