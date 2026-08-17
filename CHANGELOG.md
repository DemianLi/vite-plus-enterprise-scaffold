# 版本沿革

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，
版號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

> ⚠️ **這個 repo 的 SemVer 承諾對象是 `platform/*` 的型別形狀。**
> `tools/api-surface` 每次 CI 比對每個進入點的 props／slot／emit／成員形狀，
> **移除、改名、或改變形狀就讓閘門失敗**，而且必須附一份可執行的 codemod。
> 也就是說：major 版號不是宣告，是**閘門強制出來的**。

---

## [1.0.0] — 2026-08-17

第一個穩定版。**範圍是刻意縮小的** —— 五條承諾，其他能力留在 `main`。

### 這一版承諾什麼

1. **分工開發不受影響的系統架構** —— 垂直切片、三層邊界防護、切片產生器與
   一致性檢查共用同一份契約
2. **設計模板到前端工程的開發方式**
3. **設計模板對應 vue component 的方式** —— 值→代幣、形狀→variant、結構→slot
4. **各案快速換配色與元件樣式** —— 代幣分兩層，`theme-verify` 真的建置兩次驗證
5. **基礎資安在撰寫時就被發現** —— 前置過濾器，不是交付的那份掃描報告

完整說明與**刻意不承諾什麼**：[HANDOFF.md](HANDOFF.md)。

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
