# @org/feature-invoice

請款單

**Owner**：`@org/team-fulfillment`

## 邊界

這個切片**不得**依賴任何其他 `features/*`。需要與其他切片互動時只有兩條合法路徑：
往上到 `apps/` 層組裝，或往下把共用契約抽到 `platform/`。

切片**之內**也分層：`src/views/` 與 `src/store.ts` 不得直接碰資料層，
`src/usecases/` 不得碰前端框架。三處都放行 `import type`。

## 設計系統

畫面元件一律從 `@org/ui` 取用。要的元件 `@org/ui` 沒有，就把它加進 `platform/ui`，
不要在切片裡自己拼 —— 第二個團隊也拼一套之後，兩套永遠不會收斂。

## 結構

| 檔案            | 職責                                                                              |
| --------------- | --------------------------------------------------------------------------------- |
| `src/index.ts`  | 對外的唯一公開契約（`defineFeature`）                                             |
| `src/ports.ts`  | 與外界之間的介面。usecase 只認得它，不認得 HTTP                                   |
| `src/usecases/` | **業務規則**，純 TS 零框架                                                        |
| `src/routes.ts` | 本切片的路由樹，`/invoice` 之下、name 以 `invoice/` 開頭                          |
| `src/api.ts`    | 資料存取。一律走 `@org/http-client`，禁止直接用 fetch/axios                       |
| `src/hooks/`    | `useXxx()` —— 取數、快取 key、後備值。**有狀態的邏輯住這裡**                      |
| `src/store.ts`  | zustand。只放**客戶端才是權威**的東西：篩選條件、選取的 id。**存 id 不存 entity** |
| `src/views/`    | 畫面元件，**只負責呈現**。不得直接 import `@tanstack/react-query` 或 `api.ts`     |

> 「這份資料如果和伺服器不一致，誰是錯的？」
> 伺服器是權威 → `hooks/`；客戶端是權威 → `store.ts`；
> 兩者都不是（例如「選取的那幾筆物件」）→ 哪裡都不放，render 時從列表推導。

## 命名空間

`defineFeature` 會在 dev 模式驗證下列全部落在 `invoice` 命名空間下，違規當場拋錯：

- 路由 `name` → `invoice/*`
- 頂層路由 `path` → `/invoice*`
- 權限碼 → `invoice:*`
- i18n 頂層 key → 恰好只有 `invoice`
- TanStack Query key → 第一段為 `invoice`
