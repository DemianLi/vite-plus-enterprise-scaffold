import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { UiButton, UiDialog } from "@org/ui/react";

import { useInvoiceList } from "../hooks/useInvoiceList.ts";
import { useInvoiceFilterStore } from "../store.ts";

/**
 * 這個元件**只負責呈現**（D14）。取數在 hooks/useInvoiceList.ts。
 *
 * 畫面元件一律從 `@org/ui` 取用（D15）。一致性檢查會驗這個切片**真的用過**它：
 * 自己刻一顆按鈕不會違反任何一條規則，但第二個團隊也刻一顆之後，
 * 兩套永遠不會收斂 —— 而且兩邊各自看起來都是對的。
 */
export default function InvoiceList(): ReactNode {
  const { t } = useTranslation();
  const page = useInvoiceFilterStore((state) => state.page);
  const selectedId = useInvoiceFilterStore((state) => state.selectedId);
  const select = useInvoiceFilterStore((state) => state.select);
  const { items, isPending, isError, error } = useInvoiceList({ page });

  // 被選取的那一筆 —— **從列表推導，不從 store 讀**（D14）。
  // store 裡只有一個 id；把物件也存進去就是第二份快取。
  const selected = items.find((item) => item.id === selectedId);

  return (
    <section>
      <h1 className="text-xl font-semibold text-fg">{t("invoice.title")}</h1>

      {/*
        錯誤訊息一律以文字輸出，絕不使用 dangerouslySetInnerHTML。
        伺服器回傳的內容可能含使用者輸入，那會讓它變成 XSS 入口。
      */}
      {isPending ? (
        <p>…</p>
      ) : isError ? (
        <p role="alert">{error?.message}</p>
      ) : items.length === 0 ? (
        <p>{t("invoice.empty")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4">
              <span>{item.id}</span>
              <UiButton size="sm" onClick={() => select(item.id)}>
                {t("invoice.detail")}
              </UiButton>
            </li>
          ))}
        </ul>
      )}

      {/* 對話框的內容由 `selected` 推導 —— D14 那條「存 id 不存 entity」在畫面上的樣子。 */}
      <UiDialog
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) select(null);
        }}
        title={t("invoice.detail")}
        description={t("invoice.detailDescription")}
        close={<UiButton>{t("invoice.close")}</UiButton>}
      >
        {selected === undefined ? null : (
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-fg-muted">#</dt>
            <dd>{selected.id}</dd>
            {/* TODO: 補上這個切片實際的欄位（與 api.ts 的 InvoiceItem 對齊） */}
          </dl>
        )}
      </UiDialog>
    </section>
  );
}
