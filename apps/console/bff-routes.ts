/**
 * 這個 app 自己的 mock 資料端點（**只給 dev 用**）。
 *
 * ── 這個檔案是什麼 ──────────────────────────────────────────────────
 *
 * `platform/bff-mock` 是 `@org/bff-contract` 的參考實作，它提供的是
 * session／CSRF／401／403 那條路徑，以及兩片示範切片的唯讀資料。
 * **應用自己的端點補在這裡**，不必去改 `platform/`。
 *
 * 掛上去的方式在根 `package.json` 的 `bff` script：
 *
 *     BFF_MOCK_ROUTES=apps/console/bff-routes.ts node platform/bff-mock/src/cli.ts
 *
 * 也就是 `./node_modules/.bin/vpr bff`。啟動時它會把載入的路由印出來 ——
 * 那是唯一看得出「有沒有真的載到」的地方。
 *
 * ── ⚠️ 為什麼這裡一個 import 都沒有 ─────────────────────────────────
 *
 * 型別是 `@org/bff-mock` 的 `BffMockRoute`，但這個檔案**刻意不 import 它**：
 * `@org/bff-mock` 是開發工具，把它加進這個 app 的相依清單，等於讓一支
 * 「拒絕在 NODE_ENV=production 啟動」的伺服器進了應用的相依圖 ——
 * 然後總有一天會有人從 `src/` 裡 import 它。正式環境的 app 不該知道
 * mock 的存在。
 *
 * 代價是下面那個 `DevRouteRequest`：`@org/bff-mock` 確實匯出了
 * `BffMockRequest`，但這個 app 拿不到它 —— 拿得到就代表相依已經加上去了。
 * 形狀漂掉的話，紅的是 `platform/bff-mock/tests/routes.test.ts`（那支測試
 * 就是拿 `params`／`query`／`body`／`permissions` 在打），而路由本身的形狀
 * 由載入端在啟動時驗，錯了會直接拒絕啟動並指出是第幾條。
 *
 * ── 開新案子時怎麼用 ────────────────────────────────────────────────
 *
 * 加一片切片、切片需要 `/api/<你的資源>` 的話，就在 `routes` 加一條：
 *
 *     { path: "/api/customer", handle: ({ query }) => ({ body: { items: [] } }) }
 *     { method: "POST", path: "/api/customer", handle: ({ body }) => ({ status: 201, body }) }
 *     { method: "PUT", path: "/api/customer/:id", handle: ({ params }) => ({ body: params }) }
 *
 * 處理器拿得到 `params`／`query`／`body`／`permissions`，回傳
 * `{ status?, body? }`。省略 `body` 就是只回狀態碼（預設 204）。
 * 非安全方法一樣要通過 CSRF —— 那是 D8 的路徑，這道接縫不繞過它。
 */

/** 處理器拿得到的東西。只列這個檔案用得到的欄位 —— 理由見檔頭。 */
interface DevRouteRequest {
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: unknown;
  readonly permissions: readonly string[];
}

/** `features/order` 宣告了這個權限碼，而 mock 的預設 session 沒有它。 */
const CANCEL_PERMISSION = "order:cancel";

export const routes = [
  {
    /**
     * `features/order` 的 `cancelOrder()` 打的就是這一條，而
     * `platform/bff-mock` 沒有它 —— 也就是說在補上這條之前，那支函式
     * 在本機**一定** 404。這是 C39 抓到的同一個形狀（示範切片有一段
     * 程式碼在跑起來的應用裡根本到不了），只是換到了寫入側。
     *
     * ⚠️ 訂單列表是 `platform/bff-mock` 的唯讀示範資料，所以取消不會改變
     * 列表的內容。要讓它有狀態的話，在這裡覆寫 `GET /api/orders`：
     * 注入的路由**排在示範資料前面**，就是為了這種需求。
     */
    method: "POST",
    path: "/api/orders/:id/cancel",
    handle: ({ permissions }: DevRouteRequest) => {
      // 這個 mock 的 403 只有 admin 探針在示範，那是契約要驗的東西。
      // 這裡示範的是**應用自己的**權限判斷 —— 少了它，前端那條
      //「沒有權限就不該送出」的分支在本機永遠走不到。
      if (!permissions.includes(CANCEL_PERMISSION)) {
        return { status: 403, body: { error: "forbidden", required: CANCEL_PERMISSION } };
      }
      return { status: 204 };
    },
  },
];

/**
 * 追加到 mock session 的權限碼。
 *
 * `platform/bff-mock` 的預設只有兩片示範切片的**唯讀**權限，
 * 而 `features/order` 還宣告了取消。少了這一行，上面那條路由永遠 403。
 */
export const extraPermissions = [CANCEL_PERMISSION];
