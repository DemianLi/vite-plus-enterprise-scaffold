# @org/codemods

`platform/` 破壞性變更的遷移工具（D12）。

## 這條規則的真正目的

> **breaking change 必須附 codemod，且由提出者在同一個 PR 跑完全 repo。**

在 D3 的單一 org monorepo 裡，`platform/` 就是腳手架本身：改它等於同時改動所有切片、
所有團隊。所以這條規則不是為了省時間，是**讓提出 breaking change 的人自己承擔成本** ——
這會過濾掉九成不必要的 API 變動。

做不到 codemod 的改動，就不是 breaking change，是**新 API**：新增 export、
把舊的標 `@deprecated` 保留一個 release 週期，讓一致性檢查在窗口結束後轉成 error。

## 機制怎麼強制

規則寫在文件裡不會有人遵守。三個部分讓它有牙齒：

| 元件                                  | 職責                                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`tools/api-surface`](../api-surface) | 匯入每個**版控裡的** `platform/*` 套件（index 與磁碟對不上就先擋，見 C98）、列舉實際 export，與基準比對。**移除或改名就失敗**，除非基準已登記對應的 codemod |
| `tools/api-surface/surface.json`      | 已提交的基準。新增 export 也要更新它，否則下次比對的基礎是舊的（等於檢查靜默失效）                                                                          |
| `run.ts`                              | 執行器。跨 `apps/` `features/` `platform/` `tools/` 套用轉換                                                                                                |

`api-surface` 跑在 `vpr gate` 與 Tier 2 CI，繞不過。

> ⚠️ **這道閘門保證的是「被看見並經過 review」，不是「codemod 正確」。**
>
> 它只驗證 `surface.json` 有對應登記、且 `tools/codemods/<name>.ts` 存在。
> 一個 `transform: () => null` 的空殼檔案同樣能過關。
>
> 這是刻意不再加碼的：reviewer 會在**同一個 PR**裡同時看到 `surface.json` 的
> diff 與那個空殼，而觸發這場 review 正是這個機制存在的全部目的。
> 用更多程式碼去驗證 codemod 的語意，是在自動化一件本來就該由人判斷的事。

## 流程

```bash
node tools/codemods/run.ts <name> --dry-run
```

```bash
node tools/codemods/run.ts <name> && ./node_modules/.bin/vp check --fix && node tools/api-surface/src/cli.ts --update
```

完整步驟：

1. 建立 `tools/codemods/<name>.ts`（default export 一個 `Codemod`）
2. 寫測試 —— 重點是驗證它**不會**改到不該改的東西
3. 在 `surface.json` 的 `codemods` 登記名稱、`removes`、以及一句話理由
4. `--dry-run` 確認命中範圍，再實際套用
5. `vp check --fix` 格式化，`vpr ready` 確認全套通過
6. `node tools/api-surface/src/cli.ts --update` 更新基準
7. PR 打上 `platform-codemod` 標籤 —— 機械性改動可自動核准，人工改動才需各團隊審

## 寫 codemod 的三條硬規則

**① 必須冪等。** 跑兩次的結果要與跑一次相同。執行器不會阻止你寫出非冪等的轉換，
但 CI 重跑時會把差異暴露出來。

**② 測試的重點是「不會誤傷」，不是「會改」。** 一個過度熱心的 codemod 跑過全 repo
之後造成的損害，比不做這次遷移大得多，而且要靠 code review 一行行看才找得回來。
`rename-feature-kit-to-slice-kit.ts` 的測試裡，一半以上是 `toBeNull()` 的斷言。

**③ 字串轉換夠用就別上 AST。** 執行器的 `transform` 是字串層級的，對「改名一個 import」
這類詞法上明確的遷移足夠 —— 而那是 platform breaking change 的絕大多數。
需要理解語意的遷移（改變呼叫的參數結構、追蹤變數別名）請在該 codemod **自己的實作裡**
引入 `ts-morph`。執行器刻意不預設任何 AST 工具，以免每個專案都被迫吞下一個大型相依（D2）。

## 兩個實測踩過的坑

**codemod 不會掃到自己。** 執行器跳過整個 `tools/codemods/`。第一次 `--dry-run` 時它
回報要修改 codemod 自己與它的測試 —— 因為那兩個檔案裡合法地含有舊識別字（一個是常數、
一個是測試 fixture）。真的跑下去，codemod 會把自己改成 no-op，測試還會一起被改到全綠。
**通則：codemod 檔案裡的舊識別字是資料，不是待遷移的用法。**

**正則會被 Tier 2 擋。** `rename-feature-kit-to-slice-kit.ts` 的正則被
`security/detect-unsafe-regex` 擋了兩次：先是反向參照（讓正則變成非正規語言），
再是可選群組包量詞（star height 2，指數回溯的經典形狀）。兩次都是規則對、程式碼錯。
定版用**交替**取代巢狀量詞。寫 codemod 時預期會撞到這條，**改正則、不要加例外**。
