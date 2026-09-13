import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { UiButton, UiDialog } from "@org/ui/react";
import { maskName } from "@org/pii";

import { useOrderList } from "../hooks/useOrderList.ts";
import { useOrderFilterStore } from "../store.ts";

const currency = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
});

/**
 * 要公告給輔具的狀態訊息鍵，沒有的話是 `null`。
 *
 * ⚠️ 它存在的理由是 **live region 的時序**，不是版面：`aria-live` 的元素必須在
 * 文字變化**之前**就已經在 DOM 裡，瀏覽器才會朗讀。元素與文字同時出現的寫法
 * 視覺上完全正確，但輔具那邊很可能一個字都沒有。回傳 `null` 時畫面仍然渲染一個
 * 空的 `role="status"`，那個空元素就是這件事的重點。
 *
 * ⚠️ 這一類缺陷**無障礙靜態閘門看不見**（見 platform/eslint-config/src/a11y.js）。
 */
function statusKeyOf(isPending: boolean, count: number): string | null {
  if (isPending) return "order.loading";
  if (count === 0) return "order.empty";
  return null;
}

/**
 * 這個元件**只負責呈現**（D14）。
 *
 * 取數、快取 key、後備值全在 `useOrderList` 裡 —— 元件不得直接 import
 * `@tanstack/react-query` 或本切片的 `api.ts`，這條由一致性檢查強制。
 */
export default function OrderList(): ReactNode {
  const { t } = useTranslation();
  const status = useOrderFilterStore((state) => state.status);
  const page = useOrderFilterStore((state) => state.page);
  const selectedId = useOrderFilterStore((state) => state.selectedId);
  const select = useOrderFilterStore((state) => state.select);
  const { orders, isPending, isError, error } = useOrderList({ status, page });

  // 被選取的那一筆 —— **從列表推導，不從 store 讀**（D14）。store 只存 id；
  // 把 Order 物件也存進去就是第二份快取：列表重新整理之後對話框裡還是舊資料。
  const selected = orders.find((order) => order.id === selectedId);
  const statusKey = statusKeyOf(isPending, orders.length);

  return (
    <section>
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg">{t("order.title")}</h1>
      </header>

      {/*
        錯誤走 role="alert"、其餘狀態走 role="status"：alert 會打斷輔具當下的
        朗讀，而「查詢失敗」屬於要立刻知道的那一類；載入中與查無資料不是。

        錯誤訊息一律以文字輸出，絕不使用 dangerouslySetInnerHTML —— 伺服器回傳的
        錯誤內容可能含使用者輸入，那會讓它變成 XSS 入口。
      */}
      {isError ? (
        <p role="alert">{error?.message}</p>
      ) : (
        <p role="status">{statusKey === null ? "" : t(statusKey)}</p>
      )}

      {orders.length > 0 ? (
        <table className="w-full border-collapse">
          {/*
            caption 與最後一欄的表頭都是 sr-only：畫面上不變，但用表格模式瀏覽的
            輔具使用者才知道自己在哪張表、最後一欄是什麼。
          */}
          <caption className="sr-only">{t("order.tableCaption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-3 py-2 text-left">
                #
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 text-left">
                Customer
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 text-left">
                Total
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 text-left">
                Status
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 text-left">
                <span className="sr-only">{t("order.rowActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="border-b border-line px-3 py-2">{order.id}</td>
                {/*
                  客戶姓名在列表上隱碼。防的是內部人員（客服、營運）在日常作業畫面上
                  看到完整個資，不是防使用者看自己的資料。
                  ⚠️ 強制它的靜態閘門已移除（C52）—— 這裡是**慣例，不是機制**。
                */}
                <td className="border-b border-line px-3 py-2">{maskName(order.customerName)}</td>
                <td className="border-b border-line px-3 py-2">
                  {currency.format(order.totalCents / 100)}
                </td>
                <td className="border-b border-line px-3 py-2">
                  {t(`order.status.${order.status}`)}
                </td>
                <td className="border-b border-line px-3 py-2">
                  <UiButton size="sm" onClick={() => select(order.id)}>
                    {t("order.detail")}
                  </UiButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {/*
        對話框的內容由 `selected` 推導。它是 D14 那條「存 id 不存 entity」
        在畫面上的樣子：store 裡只有一個字串。
      */}
      <UiDialog
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) select(null);
        }}
        title={t("order.detail")}
        description={t("order.detailDescription")}
        close={<UiButton>{t("order.close")}</UiButton>}
      >
        {selected === undefined ? null : (
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-fg-muted">#</dt>
            <dd>{selected.id}</dd>
            <dt className="text-fg-muted">Customer</dt>
            {/* 明細也一樣。「點開就看得到完整的」等於沒有隱碼。 */}
            <dd>{maskName(selected.customerName)}</dd>
            <dt className="text-fg-muted">Total</dt>
            <dd>{currency.format(selected.totalCents / 100)}</dd>
            <dt className="text-fg-muted">Status</dt>
            <dd>{t(`order.status.${selected.status}`)}</dd>
          </dl>
        )}
      </UiDialog>
    </section>
  );
}
