# @org/feature-order

訂單切片：查詢、篩選、取消。

**Owner**：`@org/team-fulfillment`（見根目錄 `CODEOWNERS`）

## 邊界

這個切片**不得**依賴任何其他 `features/*`。三層防護會擋下：

1. `tools/conformance` 讀 `package.json`（Tier 2，繞不過的底線）
2. oxlint `no-restricted-imports`（Tier 1，擋裸模組名）
3. `tools/conformance` 精確路徑解析（Tier 2，擋相對路徑逃逸）

需要與其他切片互動時，只有兩條合法路徑：往上到 `apps/` 層組裝，
或往下把共用契約抽到 `platform/`。

切片**之內**還有第四層（D14）：`src/views/` 與 `src/store.ts` 不得直接碰資料層。

## 結構

| 檔案               | 職責                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| `src/index.ts`     | 對外的唯一公開契約（`defineFeature`）                                           |
| `src/routes.ts`    | 本切片的路由樹，`/order` 之下、name 以 `order/` 開頭                            |
| `src/api.ts`       | 資料存取。一律走 `@org/http-client`，禁止直接用 fetch/axios                     |
| `src/composables/` | `useXxx()` —— 取數、快取 key、後備值。**有狀態的邏輯住這裡**（D14）             |
| `src/store.ts`     | Pinia。只放**客戶端才是權威**的東西：篩選條件、選取的 id。**存 id 不存 entity** |
| `src/views/`       | 畫面元件，**只負責呈現**。不得直接 import `@tanstack/vue-query` 或 `api.ts`     |
| `tests/`           | 本切片的測試。一致性檢查要求至少一支                                            |

> 「這份資料如果和伺服器不一致，誰是錯的？」
> 伺服器是權威 → `composables/`；客戶端是權威 → `store.ts`；
> 兩者都不是（例如「選取的那幾筆 Order 物件」）→ 哪裡都不放，用 `computed` 推導。

## ⚠️ 這一片扛的四樣示範 —— 逐項查過，全樹只有這裡有

**三片切片不是三份重複。** `features/invoice` 是**架構**的範本（`ports.ts` ／
`src/usecases/` ／ `specs/`，由 `slice-gen` 產生）；這一片是**能力**的示範。
下面四樣逐項實測過（C205 §一）：

| 示範                               | 落點                                                               | 別處有嗎                                               |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| **D14 判準「客戶端是權威」那一半** | `src/store.ts` 的 `status` 篩選驅動 `query`                        | 沒有 —— `invoice` 的 store 只有 `page` 與 `selectedId` |
| **個資遮蔽在真畫面裡的樣子**       | `src/views/OrderList.vue:109,135` 的 `maskName()`                  | 沒有 —— `maskName` 全樹只在這支 `.vue` 裡被用          |
| **貨幣格式化**                     | `OrderList.vue:110,137` 的 `Intl.NumberFormat`                     | 沒有                                                   |
| **非唯讀的權限碼**                 | `order:write`／取消 —— `apps/console/bff-routes.ts:85` 的 403 路徑 | 沒有 —— 另外兩片都只有 `:read`                         |

⚠️ **所以 `Order` 的欄位是示範用的詞彙，不是業務需求。** 採用團隊 fork 之後換掉它們是預期的動作。
⚠️ 而 `placedAt` 已經拿掉了（C205 §二 1）：它宣告成必填、**全樹零消費者**，
`bff-mock` 的 `DEMO_ORDERS` 也沒給它 —— 示範資料不滿足切片自己的型別，而沒有東西會紅（#318）。

⚠️ **`tests/masking.test.ts` 是 `platform/pii` 那個設計決定的舉證，不要搬也不要刪。**
`platform/pii/src/index.ts:21` 明文寫著「現在的形狀有一道會紅的閘門與**一支斷言渲染結果的
元件測試**」，指的就是它。`platform/pii` 刻意零框架相依（沒有 `vite.config.ts`、沒有
happy-dom、零 runtime deps），接不住這支測試。

⚠️ 而它掛的是**自己定義的替身元件**，不是 `OrderList.vue`（檔頭自陳）。
「`OrderList.vue` 有沒有繼續呼叫 `maskName()`」仍然靠 review，登記在 `HANDOFF.md:1290`。

## 命名空間

`defineFeature` 會在 dev 模式驗證下列全部落在 `order` 命名空間下，違規當場拋錯：

- 路由 `name` → `order/*`
- 頂層路由 `path` → `/order*`
- 權限碼 → `order:*`
- i18n 頂層 key → 恰好只有 `order`
- TanStack Query key → 第一段為 `order`

## 開發

```bash
pnpm vp run @org/feature-order#test
```
