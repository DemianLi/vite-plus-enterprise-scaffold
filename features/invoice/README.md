# @org/feature-invoice

請款單

**Owner**：`@org/team-fulfillment`（見根目錄 `CODEOWNERS`）

## 邊界

這個切片**不得**依賴任何其他 `features/*`。三層防護會擋下：

1. `tools/conformance` 讀 `package.json`（Tier 2，繞不過的底線）
2. oxlint `no-restricted-imports`（Tier 1，擋裸模組名）
3. `tools/conformance` 精確路徑解析（Tier 2，擋相對路徑逃逸）

需要與其他切片互動時只有兩條合法路徑：往上到 `apps/` 層組裝，
或往下把共用契約抽到 `platform/`。

切片**之內**還有第四層（D14）：`src/views/` 與 `src/store.ts` 不得直接碰資料層。

## 設計系統（D15）

畫面元件一律從 `@org/ui` 取用。一致性檢查驗的是**兩個方向**：

| 規則                                                | 防的是什麼                                     |
| --------------------------------------------------- | ---------------------------------------------- |
| 不得直接 import `reka-ui`／`clsx`／`tailwind-merge` | 繞過 `@org/ui` 自己拼基元                      |
| 整個切片**至少一處**使用 `@org/ui`                  | 根本不用 —— 全部自己刻，一條規則都不會 violate |

第二條才是實際上比較常發生的那一種。要的元件 `@org/ui` 沒有，
就把它加進 `platform/ui` —— 那個 package 有 CODEOWNERS 與 api-surface 閘門，
切片沒有。

## 結構

| 檔案               | 職責                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| `specs/`           | **驗收規格**（`.feature`）。人寫的需求，agent 讀它、用 TDD 實現                 |
| `src/index.ts`     | 對外的唯一公開契約（`defineFeature`）                                           |
| `src/ports.ts`     | 與外界之間的介面。usecase 只認得它，不認得 HTTP                                 |
| `src/usecases/`    | **業務規則**，純 TS 零框架。規格打的就是這一層                                  |
| `src/routes.ts`    | 本切片的路由樹，`/invoice` 之下、name 以 `invoice/` 開頭                        |
| `src/api.ts`       | 資料存取。一律走 `@org/http-client`，禁止直接用 fetch/axios                     |
| `src/composables/` | `useXxx()` —— 取數、快取 key、後備值。**有狀態的邏輯住這裡**（D14）             |
| `src/store.ts`     | Pinia。只放**客戶端才是權威**的東西：篩選條件、選取的 id。**存 id 不存 entity** |
| `src/views/`       | 畫面元件，**只負責呈現**。不得直接 import `@tanstack/vue-query` 或 `api.ts`     |
| `tests/specs/`     | 規格的**接線**（`.spec.ts`）。把規格的中文句子接到 usecase 上，越薄越好         |
| `tests/`           | 本切片的測試。一致性檢查要求至少一支                                            |

> 「這份資料如果和伺服器不一致，誰是錯的？」
> 伺服器是權威 → `composables/`；客戶端是權威 → `store.ts`；
> 兩者都不是（例如「選取的那幾筆物件」）→ 哪裡都不放，用 `computed` 推導。

## 命名空間

`defineFeature` 會在 dev 模式驗證下列全部落在 `invoice` 命名空間下，違規當場拋錯：

- 路由 `name` → `invoice/*`
- 頂層路由 `path` → `/invoice*`
- 權限碼 → `invoice:*`
- i18n 頂層 key → 恰好只有 `invoice`
- TanStack Query key → 第一段為 `invoice`

## 業務功能完成率

`specs/invoice.feature` 是**需求**，由人寫；agent 讀它、用 TDD 把它實現出來。
**綠幾條就是完成幾條** —— 那就是這個切片的完成率。覆蓋率量的是程式碼被跑過，
回答不了「功能做完了沒有」。

三態：

| 標記    | 意思           | 結果           |
| ------- | -------------- | -------------- |
| `@待辦` | 有定義、還沒做 | ⚠️ 跳過，不擋  |
| 沒有標  | 該做了         | 沒綠就 🔴 擋下 |

⚠️ **`@待辦` 只有人能拿掉。** 拿掉的那一刻，就是在說「這條該做了」——
它進入解析結果、找不到接線、紅燈。

⚠️ **agent 不得修改 `specs/` 底下的檔案**（含不得自己加上 `@待辦`）。
這條沒有閘門在守，靠的是人讀規格的 diff —— 見根目錄 `AGENTS.md` 的契約。

規格打的是 `src/usecases/`（純 TS、零框架），而 composable 呼叫的也是它 ——
**同一份業務規則**。規格餵 in-memory 的 gateway，畫面餵真的 HTTP，
中間那層一模一樣；不這樣接的話，規格全綠而畫面壞掉，沒有閘門看得見。

## 開發

```bash
vp run @org/feature-invoice#test
```
