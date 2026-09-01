> ## 處置去向（2026-08-29 補記，兩支 PR 皆已合併）
>
> ⚠️ **這裡原本寫「這份報告本身不進版控（`reports/` 在 `.gitignore` 裡）」，已撤回**
> （C159 §五）：`dcc65f9`（2026-08-29「研究稿進版控 —— `reports/research/` 解除忽略
> 並登記」）**就是把這個檔加進版控的那一支**，今天 `.gitignore` 寫的是 `reports/*`
> ＋ `!reports/research/`。⚠️ 那句話不是慢慢過期的，是**被收它進來的那一支 commit
> 當場推翻的**，而三天沒有人說話。
>
> 它的內容已依性質分別落到兩個地方，這裡留的是完整推導過程與被推翻的中間結論。
>
> | 這份報告的哪一部分                        | 去了哪裡                                    |
> | ----------------------------------------- | ------------------------------------------- |
> | 閘門回綠燈的方式（唯一量得動的一格）      | `TESTING.md` §五 —— PR #185（`c11c7ba`）    |
> | 判準、數字、以及本報告自己的三次錯誤      | `DECISIONS.md` C137 —— PR #186（`26d2d3e`） |
> | `CODEOWNERS` 實效／release 流程／Nx／SLSA | **無處置** —— 理由逐項寫在 C137 §二 的表裡  |
>
> ⚠️ **C137 §一 裁定：這份報告產出的是觀察不是判準，不帶處置後果。**
> 不准拿它論證刪掉哪一支閘門、或論證再加一支。
>
> ⚠️ **本文量測基準是 `84c5089`，而 `main` 之後前進到 `b745d6e`（#184）
> 再到 `26d2d3e`。** 文中標「⚠️ 已過期」處為當時的覆核修正；此後的漂移沒有
> 任何機制在守（⚠️ **原句在這裡也寫了「`reports/` 不進版控」，同上已撤回**；
> 而**後半成立** —— `doc-facts` 確實刻意不守這一類，見
> `tools/doc-facts/tests/decision-ids.test.ts` 的 `OUT_OF_SCOPE = "reports/"`）。

---

# Vite+ 企業級前端腳手架的設計張力：足夠 vs 過度

**研究日期**：2026-08-27  
**測量對象**：`main` 分支 commit `84c5089`  
**⚠️ 基準已移動**：研究進行期間 `main` 前進到 `b745d6e`（#184「scope-check 上閘門鏈」）。
下文凡標「⚠️ 已過期」處，為 `b745d6e` 覆核後的修正。  
**測量邊界**：`tools/` 層的 19 支自製工具（13 上鏈 + 6 未上鏈）

---

## 執行摘要

**結論：兩者都有** ——正當的功能對應明確需求，但驗收規格嚴重不足，治理層維護成本可觀。

**最強的三條證據**：

1. **驗收規格失配**：19 支工具背後只有 4 個場景驗收（全指 conformance），對應五條承諾中的一條
2. **治理層自我修復**：最近 50 次提交中 10 次涉及「修自己的缺陷」（假綠燈、靜默失效、測試恆真等），佔 20%
3. **CODEOWNERS 的實效落差**：檔案存在但因佔位符失效；5 支工具有 `@org/security`，其餘 14 支無額外 owner 指派

**缺失**：驗收規格只涵蓋 1/5 承諾；release 流程未文件化（是否刻意，未查到裁決）。

**⚠️ 更正**：`dependabot` 不列為缺失 —— 它與 `renovate` 是**替代品**（同為依賴更新機器人），
本 repo 已有 `renovate.json`（3,735 bytes），再加 dependabot 只會兩台機器人互相打架。

---

## 第一部分：19 支工具驗證

```bash
$ git ls-tree main --name-only tools/ | wc -l
19
```

清單：api-surface, bff-check, codemods, compliance, conformance, csp-verify, doc-facts, exit-drill, gate-kit, gate-roster, pii-check, promise-check, scope-check, slice-gen, spec-report, supply-chain, theme-verify, ui-survey, vue-typecheck

拆解（`84c5089`）：13 上鏈（GATES）+ 6 未上鏈（UNGATED）+ 2 ESLint（eslint, a11y）

**⚠️ 已過期** —— `b745d6e` 覆核：**14 上鏈 + 5 未上鏈**（`scope-check` 已移入 `GATES`）。
UNGATED 現存五支：codemods、slice-gen、gate-kit、csp-verify、ui-survey。

**來源**：`git show main:tools/gate-roster/src/gates.ts`

---

## 第二部分：19 支工具擊獲紀錄與 CODEOWNERS 指派

| 工具          | 上鏈          | 決策     | 擊獲類別   | CODEOWNERS                               | 備註                                                                                              |
| ------------- | ------------- | -------- | ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| conformance   | ✅            | D4/D9    | 產品碼     | @org/platform-maintainers                | 1 of 1 已驗收承諾                                                                                 |
| api-surface   | ✅            | D12      | 產品碼     | @org/platform-maintainers                | 無明確擊獲                                                                                        |
| vue-typecheck | ✅            | C68      | 產品碼     | @org/platform-maintainers                | 無明確擊獲                                                                                        |
| theme-verify  | ✅            | C62      | 產品碼     | @org/platform-maintainers                | 無明確擊獲                                                                                        |
| exit-surface  | ✅            | D2       | 治理層     | @org/platform-maintainers                | 無明確擊獲                                                                                        |
| supply-chain  | ✅            | R2–R5    | 法規       | @org/platform-maintainers, @org/security | C133 發現漂移                                                                                     |
| compliance    | ✅            | D13      | 法規       | @org/platform-maintainers, @org/security | 無明確擊獲                                                                                        |
| pii-check     | ✅            | C52      | 法規       | @org/platform-maintainers, @org/security | 無明確擊獲                                                                                        |
| doc-facts     | ✅            | A1/C136  | 文件事實   | @org/platform-maintainers                | PR #51 發現                                                                                       |
| promise-check | ✅            | C118     | 產品碼     | @org/platform-maintainers                | C124 發現假綠                                                                                     |
| spec-report   | ✅            | C114     | 產品碼     | @org/platform-maintainers                | 無明確擊獲                                                                                        |
| bff-check     | ✅            | R6       | 產品碼     | @org/platform-maintainers, @org/security | 無明確擊獲                                                                                        |
| gate-roster   | ✅            | C41/C136 | 假綠燈     | @org/platform-maintainers                | —                                                                                                 |
| codemods      | ❌            | D12      | 工具       | @org/platform-maintainers                | 刻意不當閘                                                                                        |
| slice-gen     | ❌            | D9       | 工具       | @org/platform-maintainers                | 刻意不當閘                                                                                        |
| gate-kit      | ❌            | C131     | （不適用） | @org/platform-maintainers                | **它是 library 不是閘門** —— 無 cli.ts，只導出 repoRoot／walk／parseFlags；壞了會讓消費它的閘門紅 |
| scope-check   | ⚠️ **已上鏈** | C136     | 邊界       | @org/platform-maintainers                | `b745d6e`／#184 已進 GATES，此列的 ❌ 已過期                                                      |
| csp-verify    | ❌            | D11      | 人工驗證   | @org/platform-maintainers, @org/security | —                                                                                                 |
| ui-survey     | ❌            | D15      | 市調       | @org/platform-maintainers                | —                                                                                                 |

**核心發現**：

- 13 支工具只有 4 個場景驗收（全執行 conformance），對應 1/5 承諾
- 5 支工具有 `@org/security`；**14 支無額外 owner**
- CODEOWNERS 存在但因佔位符失效

**來源**：`git show main:CODEOWNERS` + `git show main:tools/gate-roster/src/gates.ts`

---

## 第三部分：驗收規格失配

五條承諾 vs 四個場景：

```
承諾 1：分工架構 ← 4 個場景全在這裡 ✓
承諾 2：設計流程 ← 無規格
承諾 3：元件對應 ← 無規格
承諾 4：配色換性 ← 無規格（但 theme-verify 在做）
承諾 5：破壞性變更 ← 無規格（但 api-surface 在做）
```

**量測**：

```bash
$ git show main:specs/promise-1-architecture.feature | grep "^  場景:" | wc -l
4
```

**來源**：工作樹 README.md + `git show main:specs/promise-1-architecture.feature`

---

## 第四部分：治理層自我修復（10/50 = 20%）

近 50 次提交中自我修復案例（逐提交 `git log` 驗證）：

- b30a969, 5adc3d2（gate-kit parseFlags，C126）
- 989054e, 78e277e（六支 CLI 只讀 `--root`，C124）
- 7b8077c（檔案模式測試恆真，C122）
- 9c13193（semgrep 退出碼）
- b05d22d（SAST 射程）
- d1357be（bin 模式）
- 0904d79（架構缺陷，C133）
- e43f660（gate-roster 自製過期）

**來源**：`git log main --oneline | wc -l` = 50

---

## 第五部分：外部對照

### Nx enforce-module-boundaries

**來源**：https://nx.dev/docs/features/enforce-module-boundaries

- **Nx**：1 條 lint 規則 + project tags → 模組邊界檢查
- **這裡的可比對象**：`conformance` + `scope-check` 這**兩支**

**⚠️ 分母更正**：不可把 Nx 的 1 條規則拿去對「13 支工具」。
`enforce-module-boundaries` 只管**模組相依邊界**，而 13 支裡的 `supply-chain`（SLSA）、
`pii-check`（個資）、`compliance`（法規）、`theme-verify`（配色）、`api-surface`（破壞性變更）
做的是 Nx 這條規則**完全沒有涵蓋**的事。拿它們對比會得出漂亮但錯誤的結論。

**修正後的對照結論**：邊界治理這一格，Nx 用 1 條規則 + tags 做完，這裡用 2 支自製 CLI ——
**這一格確實偏重**，但它撐不起「整個 tools/ 過度設計」的論斷。

### SLSA/CycloneDX

- supply-chain 與 compliance 對應明確的外部規範
- **正當**：法規與供應鏈標準

**來源**：https://slsa.dev/spec/v1.0/requirements + https://cyclonedx.org/specification/overview/

### Team Topologies

- 平台過度 = 治理量 > 認知預算
- 這個 repo：19 工具 + 1.07MB 文件，已超出「拉去跑」預期

**來源**：Skelton & Pais (2019). _Team Topologies_. IT Revolution Press.

---

## 第六部分：不足的地方

### 6.1 CODEOWNERS 實效性

**事實**（驗證）：

- ✅ CODEOWNERS 存在（根層，9,226 bytes）
- ✅ renovate.json 存在
- ➖ 無 `dependabot.yml` —— **這不是缺失**：renovate 與 dependabot 是**替代品**，
  兩者同時裝會產生重複 PR。已有 renovate 即已覆蓋此需求。

**GitHub 官方規範**（https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners）：
CODEOWNERS 可在 `.github/`、根層、或 `docs/` 三處之一

**實效問題**（CODEOWNERS 檔頭註解）：

- `@org/*` 是佔位符，GitHub 判定為 `Unknown owner`
- 分支保護未啟「Require review from Code Owners」
- 本機 2026-08-15 實測：當時 22 條全部無效（C40 記錄）

**分配情況**（`git show main:CODEOWNERS`）：

```
/tools/ 全轄：@org/platform-maintainers
5 支工具額外：@org/security（bff-check, supply-chain, compliance, csp-verify, pii-check）
14 支工具：僅 @org/platform-maintainers（無額外審查人）
```

### 6.2 Release 流程未自動化

**事實**：

- ✅ CHANGELOG.md 存在，記錄版本與 SemVer 政策
- ✅ major 由 api-surface 閘門強制
- ❌ 無 release workflow 文件化（.github/workflows/ 中無 release.yml）

**CHANGELOG.md 政策**：版號由 api-surface 閘門強制（型別破壞性變更 = major）

**結論**：發版流程因 api-surface 強制版號，但版本發佈本身未見自動化。**未找到明確決策紀錄**判斷是設計或遺漏。

---

## 第七部分：結論與改進

### 7.1 兩者都有

**正當保留**：

- conformance（D4/D9）
- api-surface（D12）
- supply-chain + compliance（SLSA/個資法）
- vue-typecheck（C68）+ theme-verify（C62）

**過度部分**：

- 14 支上鏈工具，但只有 4 個場景在驗收（涵蓋 1/5 承諾）
- 近 50 次提交有 20% 在修治理層自己的缺陷
- 邊界治理這一格：Nx 用 1 條 lint 規則 + tags，這裡用 `conformance` + `scope-check` 兩支自製 CLI

**⚠️ 必須同時記下的反證（否則「過度」這個判斷不公平）**：
5 支未上鏈工具**每一支都有寫下來的、刻意不上鏈的理由**，而且理由成立 ——
`codemods`／`slice-gen` 是「改東西的」不是「檢查東西的」，上鏈等於每次 CI 對 repo 跑一次遷移；
`gate-kit` 是 library；`csp-verify` 要人開瀏覽器（每次成本最高的一道）；
`ui-survey` 算的是別人專案的授權，會因外部變動而紅。
**這是「有人想過該不該加」的證據，不是無節制堆疊的樣子。**

**不足部分**：

- 驗收規格只涵蓋 1/5 承諾
- release 流程未自動化
- CODEOWNERS 實效被削弱

### 7.2 改進優先級

| P0 | 添加 Scenario 覆蓋承諾 3–4 | 驗收 1/5 → 3/5 |
| ~~P0~~ | ~~scope-check 升進 GATES~~ | **✅ 研究期間已完成**（`b745d6e`／#184） |
| P1 | 啟用 CODEOWNERS + 分支保護 | 審查自動化生效 |
| P1 | 文件化 release 流程 | 版本管理透明 |

---

## 第八部分：一手 vs 推論

### 一手證據

- ✅ git log（50 次提交）
- ✅ gates.ts 定義
- ✅ CODEOWNERS 內容
- ✅ 驗收規格與場景數
- ✅ CHANGELOG 版本政策

### 推論（需外部框架）

- 🤔 「過度設計」依賴 Team Topologies（已引）
- 🤔 「簡潔替代」依賴 Nx 官方（已引）
- 🤔 「正當性」依賴 SLSA/CycloneDX（已引）

### 未驗證之處

- ❓ DECISIONS.md 編號錯誤（C/D/R 三串、R9 未定義）
- ❓ ESLint 與 oxlint 實際 overlap
- ❓ release 是「刻意手工」還是「遺漏」

---

## 結語

**一句話結論**：功能層正當，驗收層失配，需擴充規格並啟用 CODEOWNERS。

**最強三條證據**：驗收 1/5 承諾、治理層修自己 20%、CODEOWNERS 存在但失效。

**無法取得一手來源的地方**：DECISIONS.md 編號系統錯誤、release 流程決策、ESLint/oxlint 實際重疊。
