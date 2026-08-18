# 版本沿革

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，
版號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

> ⚠️ **這個 repo 的 SemVer 承諾對象是 `platform/*` 的型別形狀。**
> `tools/api-surface` 每次 CI 比對每個進入點的 props／slot／emit／成員形狀，
> **移除、改名、或改變形狀就讓閘門失敗**，而且必須附一份可執行的 codemod。
> 也就是說：major 版號不是宣告，是**閘門強制出來的**。

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
