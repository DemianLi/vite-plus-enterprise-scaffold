# @org/feature-shipment

出貨

**Owner**：`@org/team-logistics`（見根目錄 `CODEOWNERS`）

## 邊界

這個切片**不得**依賴任何其他 `features/*`。三層防護會擋下：

1. `tools/conformance` 讀 `package.json`（Tier 2，繞不過的底線）
2. oxlint `no-restricted-imports`（Tier 1，擋裸模組名）
3. `tools/conformance` 精確路徑解析（Tier 2，擋相對路徑逃逸）

需要與其他切片互動時只有兩條合法路徑：往上到 `apps/` 層組裝，
或往下把共用契約抽到 `platform/`。

切片**之內**還有第四層（D14）：`src/views/` 與 `src/store.ts` 不得直接碰資料層。

## 結構

| 檔案               | 職責                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| `src/index.ts`     | 對外的唯一公開契約（`defineFeature`）                                           |
| `src/routes.ts`    | 本切片的路由樹，`/shipment` 之下、name 以 `shipment/` 開頭                      |
| `src/api.ts`       | 資料存取。一律走 `@org/http-client`，禁止直接用 fetch/axios                     |
| `src/composables/` | `useXxx()` —— 取數、快取 key、後備值。**有狀態的邏輯住這裡**（D14）             |
| `src/store.ts`     | Pinia。只放**客戶端才是權威**的東西：篩選條件、選取的 id。**存 id 不存 entity** |
| `src/views/`       | 畫面元件，**只負責呈現**。不得直接 import `@tanstack/vue-query` 或 `api.ts`     |
| `tests/`           | 本切片的測試。一致性檢查要求至少一支                                            |

> 「這份資料如果和伺服器不一致，誰是錯的？」
> 伺服器是權威 → `composables/`；客戶端是權威 → `store.ts`；
> 兩者都不是（例如「選取的那幾筆物件」）→ 哪裡都不放，用 `computed` 推導。

## 命名空間

`defineFeature` 會在 dev 模式驗證下列全部落在 `shipment` 命名空間下，違規當場拋錯：

- 路由 `name` → `shipment/*`
- 頂層路由 `path` → `/shipment*`
- 權限碼 → `shipment:*`
- i18n 頂層 key → 恰好只有 `shipment`
- TanStack Query key → 第一段為 `shipment`

## 開發

```bash
vp run @org/feature-shipment#test
```
