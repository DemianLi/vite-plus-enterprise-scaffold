# @org/feature-shipment

出貨管理

**Owner**：`@org/team-logistics`（見根目錄 `CODEOWNERS`）

## 邊界

這個切片**不得**依賴任何其他 `features/*`。三層防護會擋下：

1. `tools/conformance` 讀 `package.json`（Tier 2，繞不過的底線）
2. oxlint `no-restricted-imports`（Tier 1，擋裸模組名）
3. `tools/conformance` 精確路徑解析（Tier 2，擋相對路徑逃逸）

需要與其他切片互動時只有兩條合法路徑：往上到 `apps/` 層組裝，
或往下把共用契約抽到 `platform/`。

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
