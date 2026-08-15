# @org/feature-order

訂單切片：查詢、篩選、取消。

**Owner**：`@org/team-fulfillment`（見根目錄 `CODEOWNERS`）

## 邊界

這個切片**不得**依賴任何其他 `features/*`。三層防護會擋下：

1. `tools/conformance` 讀 `package.json`（Tier 2，繞不過的底線）
2. oxlint `no-restricted-imports`（Tier 1，擋裸模組名）
3. oxlint `import/no-relative-parent-imports`（Tier 1，擋 `../../billing/...` 這類相對路徑逃逸）

需要與其他切片互動時，只有兩條合法路徑：往上到 `apps/` 層組裝，
或往下把共用契約抽到 `platform/`。

## 結構

| 檔案            | 職責                                                        |
| --------------- | ----------------------------------------------------------- |
| `src/index.ts`  | 對外的唯一公開契約（`defineFeature`）                       |
| `src/routes.ts` | 本切片的路由樹，`/order` 之下、name 以 `order/` 開頭        |
| `src/api.ts`    | 資料存取。一律走 `@org/http-client`，禁止直接用 fetch/axios |
| `src/store.ts`  | Pinia store，id 以 `order/` 命名空間為前綴                  |
| `src/views/`    | 畫面元件                                                    |
| `tests/`        | 本切片的測試。一致性檢查要求至少一支                        |

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
