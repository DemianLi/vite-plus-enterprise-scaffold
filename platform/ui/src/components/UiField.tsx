import { useId, type ReactNode } from "react";
import { UiLabel } from "./UiLabel.tsx";
import { useUiTheme } from "../theme-context.tsx";
import type { UiFieldSlot } from "../theme.ts";

/**
 * 表單欄位的版型與接線，React 版（C236）。它補的兩個洞、為什麼錯誤訊息刻意沒有
 * `role="alert"`、為什麼 import `UiLabel`，見 `UiField.vue` 的檔頭。
 *
 * Vue 版的 scoped slot 在這裡是 render prop，接線一樣由使用端寫一行：
 *
 *     <UiField label="電子郵件" error={errors.email}>
 *       {(control) => <UiInput {...control} value={email} onValueChange={setEmail} />}
 *     </UiField>
 *
 * ⚠️ 使用端沒把 `control` 展開上去，接線就是斷的而畫面正常 —— 同 Vue 版那一句。
 * 能收下 `control` 三格的控制項（`UiInput`、`UiTextarea`）把那三個 prop 明列出來，
 * 見 `UiInput.tsx`。
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

  // 順序就是唸出來的順序：說明先、錯誤後。一個都沒有時是 undefined，不是空字串 ——
  // `aria-describedby=""` 是指向空的引用。理由同 `UiField.vue` 的 `control`。
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
  description: "text-sm text-fg-muted",
  error: "text-sm text-danger",
};
