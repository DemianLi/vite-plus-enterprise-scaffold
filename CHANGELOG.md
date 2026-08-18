# 版本沿革

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，
版號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

> ⚠️ **這個 repo 的 SemVer 承諾對象是 `platform/*` 的型別形狀。**
> `tools/api-surface` 每次 CI 比對每個進入點的 props／slot／emit／成員形狀，
> **移除、改名、或改變形狀就讓閘門失敗**，而且必須附一份可執行的 codemod。
> 也就是說：major 版號不是宣告，是**閘門強制出來的**。

---

## [1.0.4] — 2026-08-18

**純文件。** 一行程式碼都沒動，`platform/*` 的型別形狀當然也沒動。

把 v1.0.3 那一版**用來做判斷的那條判準本身**寫下來 —— 上一版是憑它擋掉了
`gate-roster`，但它只存在於幾個人的腦子裡與一則 issue 的內文中。

### 新增 `SCOPE.md`

回答一個問題：**什麼准許出現在 `release/v1` 的樹上。**判準是
**看它守的東西給誰看** —— 面向交付物（含文件）在內，受益者是拉 v1 去做案子的
團隊；面向開發流程在外，受益者是維護者。判定時**必須寫得出「受益者是拉 v1 的
團隊」那一句**，寫不出來就不准進。

它與 HANDOFF〈v1.0.0 **不**涵蓋什麼〉是**兩條不同的軸**，刻意不重述對方：

| 文件           | 軸       | 回答                                       |
| -------------- | -------- | ------------------------------------------ |
| HANDOFF 那一節 | **能力** | 「我的案子要無障礙／SBOM，該用哪條分支？」 |
| `SCOPE.md`     | **目錄** | 「這個目錄准不准出現在 v1 的樹上？」       |

⚠️ 加一份清單而不加守它的機制，就是在製造第五份手抄本 —— 這一版清楚知道自己
在做這件事，所以 `SCOPE.md` 裡**一個導出的數字都沒有**（全部列名字，不寫
「幾支工具」），而且文末就寫著「沒有任何機制在守這份文件」。掃 `git ls-tree`
比對的檢查排在 `v1.0.5`。

### 修正：README 的目錄樹列著一個不存在的目錄

`tools/sast/` **從來不在 `release/v1` 的樹上**。自寫的 SAST 汙點傳遞規則住在
`.semgrep/`，由 `tier2-security.yml` 用釘住 digest 的容器跑 —— 而 `.semgrep/`
在那棵目錄樹裡**根本沒出現**。一個假的項目、一個缺席的真項目，不知道多久了。

這正是這一版存在的理由：**`tools/doc-facts` 守的是數字，不是清單。**
一份被讀者當成「這個 repo 有什麼」的目錄樹，可以整行是假的而全套閘門照樣全綠。

### `HANDOFF.md` 承諾表補上 `tools/codemods`

承諾一的表裡 `api-surface` 那列一直寫著「破壞性變更必須附 codemod」，
但 `tools/codemods` 自己沒有一列。

⚠️ **`tools/doc-facts` 刻意沒有補進承諾表。** 原本的計畫是補，實際去補才發現
它不對應五條承諾中的任何一條 —— 它守的是那五條**寫下來的樣子可不可信**。
硬塞進某一條會重演 C70（同一份證據掛在兩條承諾上，而空著的那一條沒有人發現）。
它在 `SCOPE.md` 有獨立一列，理由寫在同一格。

### `DECISIONS.md`

- **C72** —— 判準怎麼定出來的：兩條看起來合理的判準各自砍錯東西，
  以及「守範疇的機制本身算不算範疇內」這個自我指涉的答案（算，因為它守的是
  交付物有哪些）。也記下搬運順序做反了的後果。
- **C71 加標註**，不改原文：那道閘門已於 v1.0.3 移出 v1，分析全部成立，
  只是解法住在 `main`。

---

## [1.0.3] — 2026-08-18

**移除 `tools/gate-roster`** —— 它在 40 分鐘前隨 v1.0.2 發布，而依這一版才定下來的
範疇判準，它不屬於 v1。

### 為什麼進來又出去

判準當時不存在。v1.0.2 發布之後才把它定下來：**看它守的東西給誰看** ——
面向交付物（含文件）在 v1 內，受益者是拉 v1 去做案子的團隊；面向開發流程的
在 v1 外，受益者是維護者。

`gate-roster` 守的是 CI 閘門清單四份手抄副本的一致性。**漂移傷的是維護者。**
所以它出局 —— 而它解決的問題是真的，工具會接到 `main`，那裡它更需要
（`main` 有 8 支 v1 沒有的工具，清單更長）。

⚠️ **v1.0.2 的 tag 與 release 不撤、歷史不改寫。** 這個 repo 不容忍的是
「歷史看起來比實際乾淨」—— v1.0.1 整版做的就是「把不實的敘述改成實的」。
它進來又出去這件事留在這裡，比抹掉它有用。

### 移除

- `tools/gate-roster` 整包，以及 `package.json` 的 `gate-roster` 別名與 `gate` 鏈裡那一段
- `tier1-quality.yml` 的「閘門名冊一致」那一步
- `tools/doc-facts` 的 `exports` 進入點，`workspacePackages()` 退回成 `derive.ts` 的內部函式
  —— 唯一的跨 package 消費者是 `gate-roster`。留一個沒有消費者的進入點，
  就是 `tools/gate-kit`（C73）拒絕先定義 `report()` 的同一個錯誤。
  函式本身留著，`workspacePackageCount()` 仍在用它。

### 保留

- **README〈兩層檢查〉Tier 2 那格的修正。** 那一格原本寫「一致性檢查 + ESLint
  安全規則」，而 Tier 2 實際上還跑 `api-surface`、`doc-facts`、SAST 與機密掃描。
  **那是一個真的錯誤被修好了，和 `gate-roster` 無關。**

### 新增

- **`HANDOFF.md`〈已知的誠實缺口〉第五條：四份閘門清單是手抄的。**
  移除之後這件事在 v1 回到零機制，所以它必須被寫下來 ——
  這個 repo 不容忍的不是「沒有閘門」，是「**沒有閘門卻讓人以為有**」。
  README 那張表上方的說明同步改掉：原本寫著「這張表不是手抄的清單」，
  移除之後那句話是假的。

---

## [1.0.2] — 2026-08-18

`platform/*` 的型別形狀一格沒動。這一版有兩件事：修掉 v1.0.1 修過的那個毛病的
**成因**，以及讓五條承諾裡最根本的那道閘門**第一次有辦法被測到**。

### 新增

- **`tools/gate-roster`：閘門名冊的單一事實來源，以及一道比對它的閘門。**

  同一份閘門清單被手抄在 `package.json`（`scripts.gate` 與各別名）、
  兩個 workflow、以及 README〈兩層檢查〉那張表，
  而在此之前**沒有任何東西在斷言它們一致**。

  這已經發作過兩次。v1.0.1 修的是第一次（`doc-facts` 只在 CI 跑，本機
  `vpr ready` 全綠而推上去 CI 紅）。那是修症狀：下一個人加一支工具，
  還是會漏在其中一份裡，而且不會有任何東西說話。

  第二次是寫這道閘門的當下抓到的，見〈修正〉。

  加一支 `tools/*` 而不登記會紅；登記了卻沒接進 workflow 會紅；
  接了卻沒寫進 README 那張表也會紅。刻意不當閘門的工具寫進 `UNGATED`，
  **理由必填**，這樣「漏接」與「刻意不接」才不會長得一樣（C41）。

### 修正

- **README〈兩層檢查〉那張表的 Tier 2 那格漏了兩道閘門。** 它寫著
  「一致性檢查 + ESLint 安全規則」，而 Tier 2 實際上還跑 `api-surface`
  與 `doc-facts`。這一格是讀者判斷「PR 會被什麼擋下來」的地方。
  現在它由 `vpr gate-roster` 守著。

### 變更

- **`tools/conformance` 的每一條規則現在都能被單獨 import 測到。輸出一字不差。**

  這支是 D4 邊界防護與 D9 防漂移的執行機制 —— 五條承諾裡最根本的那條。
  而在此之前它是 943 行的單一檔案，最後一行是 `process.exit(...)`：
  **一被 import 就跑完並結束行程**，所以裡面沒有任何一條判定測得到。
  能驗它的只有「起一個行程、掃整個 repo、比對 stdout」，
  而那種測試答得出「現在是綠的」，答不出「這條規則什麼時候會判錯」。

  判定搬進 `src/rules/*.ts`（8 支，每一條 `checkX(...): Finding[]`），
  `cli.ts` 縮到 117 行，只做「解析參數 → 收集 → 列印 → 離開」。
  既有的反向測試一條都沒改，仍然全過。

  **stdout 與結束碼一字不差** —— 六種情況逐位元組比對過，另外把改動前的 CLI
  抓回來做差分測試，補跑六個快照沒走到的分支（切片缺 `package.json`、
  空的 `features/`、非目錄檔案、`apps` 層…）。

  對要改這支工具的人，差別是：加一條自己的邊界規則（政府案很常見 ——
  某某目錄不准引用某某東西），現在可以寫一支不起行程的測試，
  而不是只能斷言「那個行程印了什麼」。

  ⚠️ **`Finding` 的形狀在這一版定下來**：`where`／`rule`／`detail`／`fix`。
  刻意沒有 severity —— 這支只有一種嚴重度，而 `main` 上的 `tools/gate-kit`
  當初拒絕先定義 `report()`，理由正是「沒有生產者就不要先發明接縫」（C73）。
  這支是第一個生產者，所以型別先住在生產者這一側。

- **`doc-facts` 匯出 `workspacePackages()`。** 「什麼算一個 workspace 套件」
  這條規則現在只有一份，`workspacePackageCount()` 改成呼叫它。
  判準是**目錄裡有 `package.json`**，不是「目錄存在」—— 差別在切過分支的
  開發機上是 16 比 7（見 C71）。

---

## [1.0.1] — 2026-08-18

`platform/*` 的型別形狀一格沒動 —— 這一版只把**不實的敘述改成實的**，
以及讓 `vpr ready` 名副其實。

### 修正

v1.0.0 是從 `main` **刪掉七支工具**做出來的，而刪掉的東西在文件與程式碼裡
留下了引用。歷史紀錄（本檔與 `DECISIONS.md`）保留原樣 —— 那是有日期的敘述；
其餘十三處改掉了：

- **`.claude/launch.json` 指向不存在的檔案。** 唯一的 preview 設定寫的是
  `tools/csp-verify/src/cli.ts`，而那支工具不在這一版 —— 任何團隊拉下來叫
  agent 跑預覽，第一步就失敗。改成 `apps/console` 的 dev server（port 5173）。
- **兩處「有東西在守」的假承諾。** `platform/pii/tests/mask.test.ts` 與
  `features/order/tests/masking.test.ts` 寫著 `tools/pii-check` 會掃到假資料
  並擋下 PR。這一版沒有那支工具 —— 改成寫明「靠約定，不靠閘門」。
- **兩處沒有東西在執行的規矩。** `apps/console/vite.config.ts` 與
  `renovate.json` 要求新的 vite plugin 登記進 `tools/exit-drill` 的
  `DRILL_PLUGINS`。改成寫明這一版要靠人記得。
- **四份文件叫人跑不存在的指令**（`vpr bff-check`、`vpr exit-drill`）。
  `platform/bff-contract` 的規格與 `platform/bff-mock` 這個參考實作都**還在**，
  不在的是把它跑成測試的驗收器 —— 兩份 README 都改成講清楚這件事。
- **四處指向不存在的程式當作參照**（`tools/compliance` 的對照表、
  `tools/exit-drill` 的 plugin 解析器、`tools/sast`）。
- **`tier2-security.yml` 有一整段 D8 契約的註解被留在 `doc-facts` 那一步上面** ——
  刪工具時刪了步驟、沒刪註解。

### 變更

- **`doc-facts` 加進 `scripts.gate`。** 在此之前它只跑在 CI 的 Tier 2，
  所以本機 `vpr ready` 可以全綠而推上去 CI 紅 —— 而 README 把 `vpr ready`
  講成「一次跑完所有檢查」。現在那句話是真的。

---

## [1.0.0] — 2026-08-17

第一個穩定版。**範圍是刻意縮小的** —— 五條承諾，其他能力留在 `main`。

### 這一版承諾什麼

1. **分工開發不受影響的系統架構** —— 垂直切片、三層邊界防護、切片產生器與
   一致性檢查共用同一份契約
2. **設計模板到前端工程的開發方式** —— 槽被宣告、元件真的讀到、宣告與預設表
   一致、各案覆寫得到：**每一段都有檢查**，而且是掃目錄的
3. **設計模板對應 vue component 的方式** —— 值→代幣、形狀→**具名槽**、結構→slot；
   槽名取自 reka-ui 的基元（也就是 shadcn 的 part 名）
4. **各案快速換配色與元件樣式** —— 代幣分兩層，`theme-verify` 真的建置兩次驗證
5. **基礎資安在撰寫時就被發現** —— 前置過濾器，不是交付的那份掃描報告

完整說明與**刻意不承諾什麼**：[HANDOFF.md](HANDOFF.md)。

### 變更（Changed）

- **`createUiTheme()` 的形狀**：`{ variants, sizes }` → `{ 元件名: { 槽名: class 字串 } }`
  - ⚠️ **breaking**：附 codemod `flatten-ui-theme-to-components`
  - 舊形狀是**按鈕的概念**長在一個全域 API 上。第二個元件 `UiDialog` 需要覆寫
    遮罩與內容框時沒有地方可去，於是它就沒有接縫 —— 寬度與位置寫死在模板裡，
    任何案子都換不掉，而**沒有任何閘門說話**
  - 在 tag 之前改，代價是一個呼叫端；tag 之後改，代價是每一個 fork、永遠
- **`platform/ui` 的元件契約改成掃目錄**：前一版的檢查 `readFileSync("UiButton.vue")`，
  寫死一個檔名 —— 它守的是一個檔案，不是一條規則

### 從 v0.7.1 移出（Removed）

以下能力**不是被刪除，是不放進這條產品線**。它們在 `main` 分支有完整實作
（含閘門、反向測試與文件），需要的案子請用 `main`：

- **無障礙**：`platform/eslint-config` 的 `./a11y` 匯出、Tier 1 的無障礙檢查步驟、
  以及無障礙驗收分工表
  - ⚠️ **breaking**：附 codemod `drop-a11y-config-for-v1`
- **法遵**：`tools/compliance`（個資法對照表、§16 證據清單）、`tools/pii-check`
- **供應鏈**：`tools/supply-chain`（盤點、SCA 例外申請書、鏡像清單、封閉網路
  前置條件）、Tier 2 的 SBOM 與 SCA 漏洞掃描
- **退出演練**：`tools/exit-drill`、`exit-drill.yml`
- **契約驗收**：`tools/bff-check`
- **CSP 實測**：`tools/csp-verify`
- **選型比較**：`tools/ui-survey` 與 `UI-SURVEY.md`

`tools/doc-facts` 隨之縮減：不再守供應鏈的五個數字，只守推導得出來的
API 進入點數、export 數、契約條目數、workspace 套件數、CI action 數、
CODEOWNERS 條目數。

### 已知缺口（Known issues）

不是 bug，是**已經知道而且刻意留著**的：

- `platform/ui` 只有 `UiButton` 與 `UiDialog` 兩個元件 —— 接縫通了，
  但能換的東西還不多
- `platform/pii` 的遮罩能力在，**強制它的東西不在**（那道檢查在 `main`）
- `bff-mock` 不是認證伺服器，正式環境請用組織的 gateway
- `tools/vue-typecheck` 用第二個 TypeScript（JS 版 5.x）

### 採用這一版的第一步

把 `CODEOWNERS` 的 `@org/*` 換成真的團隊。**在換掉之前，
擁有權治理是一份文字檔，完全沒有生效** —— GitHub 對不存在的團隊不會報錯。

---

## v0.1.0 – v0.7.1

腳手架的建構期。決策理由、實測校正與踩過的坑逐條記在
[DECISIONS.md](DECISIONS.md)（涵蓋範圍大於 v1.0.0）。
