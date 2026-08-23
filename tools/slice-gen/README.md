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

一個必須照做的細節：

| 細節                                    | 為什麼                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `--directory` 要寫 `../features/<name>` | `vp create` 以產生器所在的 `tools/` 為錨點，不加 `../` 會產到 `tools/` 底下 |

> **`--opt=value` 與 `--opt value` 現在都可以。**
>
> 這裡原本寫著「**不能**用 `--opt value`，bingo 會把它當成布林旗標」。
> 那個限制是真的，但**原因不是 bingo 對所有選項都這樣** ——
> 只有 zod schema 被 `.refine()`／`.transform()` 包過的選項才會中招
> （那會變成 `ZodEffects`，bingo 認不得就把整個選項丟掉，
> 於是 `--slice` 變裸旗標；用 `=` 則讓 `parseArgs` 直接推出字串，所以繞得過）。
>
> 當時 `slice` 與 `team` 有 `.refine()`、`title` 沒有 ——
> 也就是同一支 CLI 上三個選項有兩種行為，而 README 把它寫成一條通則。
>
> `.refine()` 已經移除（驗證搬進 `produce()`），所以現在兩種寫法都對。
> **但如果將來有人加了 `z.enum()`／`z.number()` 或任何 `.refine()`，
> 這個坑會原樣回來** —— `tests/e2e.test.ts` 會擋下（它用 `--opt value` 跑）。
> 詳見 C42。

產完之後照畫面上印出的三個步驟做：加 CODEOWNERS 條目、把切片加進
`apps/<app>/package.json` 的 dependencies 與 `src/features.ts`、跑 `vp install` 驗證。

## 產出的驗收規格設施（C114）

除了切片的骨架，產生器還交付**第二類測試**的整條線 —— 那是
[`TESTING.md`](../../TESTING.md) 層 3 的落點：

| 產出                                 | 是什麼                                               |
| ------------------------------------ | ---------------------------------------------------- |
| `specs/<切片>.feature`               | **需求**，人寫的。與 `src/` 平行，不在 `tests/` 底下 |
| `src/ports.ts`                       | 介面。usecase 只認得它，不認得 HTTP                  |
| `src/usecases/query-<切片>.ts`       | **業務規則**，純 TS 零框架。規格打這一層             |
| `tests/specs/<切片>.spec.ts`         | 接線，把規格的中文句子接到 usecase 上                |
| `tests/support/in-memory-gateway.ts` | 規格用的假資料來源                                   |

**產出的切片開箱即綠**：`vp run @org/feature-<切片>#test` 直接跑得出 20 條，
其中 15 條來自規格。

三件必須由模板生成、不能靠專案組記得寫的事：

| 生成的東西                                  | 少了它會怎樣                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `setVitestCucumberConfiguration({...})`     | `.feature` 的 `# language:` 標頭**本身不生效**，parser 解析不出 Feature |
| `excludeTags: ["待辦"]`                     | `@待辦` 的場景會被要求也要有接線，三態做不出來                          |
| `predefinedSteps: []`／`mappedExamples: {}` | 上游型別把兩者標成必填，產出的切片第一次 `vp check` 就 TS2739           |

⚠️ **接線檔的副檔名 `.spec.ts` 不是可以換的。** vitest 的預設 include 只收
`*.test.*` 與 `*.spec.*`，而這條線的根層沒有覆寫 `test.include`。取名
`.steps.ts` 會讓整份規格**一條都不被收集** —— runner 靜默不跑、既有測試繼續
全綠、完成率讀的是一個從來沒有被執行過的檔案。`tests/contract-alignment.test.ts`
有一條絆線掛在契約的 `STEPS_GLOB` 上。

⚠️ **字串斷言擋不住上游變。** 其餘的斷言都在讀字串（檔案在不在、那一行設定
有沒有生成），那擋得住模板被改壞，擋不住 runner 或 vitest 改了行為。
`tests/spec-template.test.ts` 把模板產出的 `.feature` 原文餵進真的 parser
（`loadFeatureFromText`），跑在 CI 每一次。⚠️ 它**不執行**場景 —— 驗的是
「規格解析得出來、分母數得對」，執行那一半發生在產出的切片上。

⚠️ **usecase 必須在畫面真的會走到的路徑上。** 模板產出的鏈是
`views → composables → usecases → ports → api.ts`；composable 呼叫的是 usecase，
規格打的也是 usecase。改成讓 composable 直接呼叫 `api.ts` 的話，規格驗的東西
與畫面跑的東西就是兩條路 —— 那條也有絆線守著。

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
機制會阻止有人從 `tools/slice-gen` 直接 import `../conformance/src/rules/`。
（#53 把那些判定拆成沒有副作用的模組之後，這件事從「做不到」變成「很好做」——
擋它的東西因此只剩下這一段話。）
別這麼做 —— 那會安靜地重建出 D9 想消滅的「兩份事實來源」，而且所有測試照樣全綠。

## 開發

```bash
vp run @org/slice-gen#test
```
