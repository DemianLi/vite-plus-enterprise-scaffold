# @org/slice-gen

產生一個符合契約的 vertical slice。

## 用法

```bash
vp create slice -- --directory=../features/<name> --slice=<name> --title=<顯示名> --team=@org/<team>
```

實例（已驗證）：

```bash
vp create slice -- --directory=../features/shipment --slice=shipment --title=出貨管理 --team=@org/team-logistics
```

兩個必須照做的細節，錯了都會以難懂的方式失敗：

| 細節                                           | 為什麼                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| 選項用 `--opt=value`，**不能**用 `--opt value` | bingo 的 CLI 會把 `--opt value` 當成布林旗標，傳進 `produce` 的值變成 `true` |
| `--directory` 要寫 `../features/<name>`        | `vp create` 以產生器所在的 `tools/` 為錨點，不加 `../` 會產到 `tools/` 底下  |

產完之後照畫面上印出的三個步驟做：加 CODEOWNERS 條目、把切片加進
`apps/<app>/package.json` 的 dependencies 與 `src/features.ts`、跑 `vp install` 驗證。

## 為什麼產生器不自動改那三個檔案

`CODEOWNERS` 決定權責歸屬、`features.ts` 決定系統由哪些切片組成、
`apps/*/package.json` 決定依賴圖 —— 三個都是**全 repo 共用、且 code review 一定會看**
的檔案。讓工具自動塞進去，等於繞過那道 review，而那道 review 正是這些檔案存在的理由。

所以產生器只寫**新**檔案，並把要貼的內容準備好。

## 這支工具解決不了漂移

產生器只決定**起點**。第一天大家從同一個模板出發，三個月後 A 團隊的切片沒寫測試、
B 團隊把 API 呼叫寫進元件、C 團隊偷偷加了跨切片依賴 —— 產生器對這些一無所知，
因為它只在建立那一刻跑過一次。

真正防退化的是 [`tools/conformance`](../conformance)，它在 CI 每次都跑。

## 兩者怎麼保證不各說各話

**它們讀同一份 `@org/slice-kit/contract`。**

- 產生器的 `assertCoversContract` 驗證產出涵蓋契約的 `REQUIRED_FILES`
- 產生器的命名驗證直接用契約的 `isValidSliceDir`，不重寫一份
- `tests/contract-alignment.test.ts` 的每條斷言都直接讀契約常數

契約新增一項而產生器沒跟上時，**產生器自己的測試會失敗** ——
而不是等到某個團隊產出一個過不了 CI 的切片才發現。

## 唯一合法的通道

產生器與一致性檢查之間**只准經由 `@org/slice-kit/contract` 溝通**。

`tools/*` 不受切片邊界規則約束（那些規則只作用於 `features/*/**`），所以沒有任何
機制會阻止有人從 `tools/slice-gen` 直接 import `../conformance/src/cli.ts`。
別這麼做 —— 那會安靜地重建出 D9 想消滅的「兩份事實來源」，而且所有測試照樣全綠。

## 開發

```bash
vp run @org/slice-gen#test
```
