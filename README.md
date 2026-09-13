# 🧱 @org/monorepo

> **把架構決策寫成閘門，而不是寫成規範文件。**
> 以 [Vite+](https://viteplus.dev) 為驅動層的企業級 vertical-slice monorepo 骨架。

---

## 專案簡介

大型前端專案真正的痛點不是「怎麼寫元件」，而是**架構規範會腐爛**——切片邊界靠 code review 守、
供應鏈清單靠人抄、「不要把 token 放進 localStorage」靠口頭約定，三個月後全部失效而且沒有人會發現。

這個骨架把那些規範**全部改寫成會失敗的檢查**：跨切片 import 讓建置紅燈、
看起來像機密的環境變數讓建置直接失敗、文件裡抄來的數字對不上事實來源就擋下 PR。
適用於**多團隊並行開發、需要通過資安與稽核的企業內部系統**。

它對採用團隊承諾四件事。承諾一由 [`specs/`](specs) 底下的規格照著執行；
其餘三條由設計系統接縫、platform API 表面檢查與 `platform/ui` 的元件契約測試守著：

1. **分工開發不受影響的系統架構** — 一片功能 ＝ 一個 package，依賴方向單向，
   切片之間一律禁止互相依賴。
2. **設計模板到前端工程的開發方式** — 那條路徑上的每一段都有檢查：
   槽必須被宣告、元件必須真的讀到它、各案必須覆寫得到。
3. **設計模板對應元件的方式** — 元件的公開面分三格，各對應設計稿上的一種東西：
   **值**→代幣、**形狀**→具名槽、**結構**→slot。槽名沿用 shadcn 的 part 名，
   設計師與前端共用同一套詞彙。
4. **各案快速換配色與元件樣式** — 代幣分兩層（色票 → 語意），
   覆寫是否真的生效由實際建置兩次比對產物來證明。

開工前先讀 [HANDOFF.md](HANDOFF.md) 的〈採用指南〉：安裝、第一個能操作的畫面、
這個骨架承諾什麼與刻意不承諾什麼，都在那裡。

---

## 📂 專案資料夾結構

```text
.
├── apps/                     部署單位。薄殼：路由組裝、環境設定、composition root
│   └── console/              主控台應用（唯一知道有哪些切片的地方：src/features.ts）
│
├── features/                 垂直切片。一片 ＝ 一個 package，彼此之間禁止互相依賴
│   ├── invoice/              架構的範本：ports.ts / usecases / specs，由 slice-gen 產生
│   └── order/                能力的示範：篩選、個資遮蔽、貨幣格式化、非唯讀權限碼
│
├── platform/                 技術底座。所有切片共用，改動等於同時改動所有團隊
│   ├── slice-kit/            defineFeature() 切片契約，命名空間在執行期驗到底
│   ├── http-client/          唯一合法的 HTTP 出口；沒有、也不會有 token 存取介面
│   ├── config/               環境設定；VITE_* 白名單，像機密的變數讓建置失敗
│   ├── security-headers/     CSP 以「資料」定義，由 BFF／dev 中介層／測試三方共用
│   ├── bff-contract/         中間層必須做到什麼（13 條契約條目）＋怎麼證明做到了
│   ├── bff-mock/             契約的參考實作；不是認證伺服器，session 存在記憶體裡
│   ├── ui/                   共用 UI 元件層。代幣分兩層，各案在自己的 app 覆寫
│   ├── pii/                  個資欄位的標註與遮罩基礎設施
│   ├── tsconfig/             共用 TypeScript 設定
│   └── eslint-config/        兩份 ESLint 設定：安全規則集，與無障礙規則集
│
├── tools/                    建置與治理腳本。多數是會失敗的閘門，例外都在下面標明
│   ├── gate-kit/             閘門底下那一層（不是閘門）：repo 根、走目錄、旗標解析
│   ├── fork-select/          閘門鏈的選擇器：有沒有 .scaffold-fork 決定跑上游或 fork 那一條（不是閘門）
│   ├── gate-roster/          閘門名冊的單一事實來源，以及四個消費端的一致性檢查
│   ├── scaffold-stamp/       腳手架的章：fork 之後不准改的那一半還是不是原樣（含 oxlint 生效設定）
│   ├── conformance/          切片邊界一致性檢查（宣告依賴＋相對路徑逃逸＋切片內分層）
│   ├── api-surface/          platform/* 的型別形狀與基準比對，改名或改形狀即失敗
│   ├── theme-verify/         設計系統接縫：真的建置兩次，證明各案換得掉配色與形狀
│   ├── codemods/             breaking change 必附的遷移腳本（改東西的，不是閘門）
│   ├── slice-gen/            切片產生器（產東西的，不是閘門）
│   ├── bff-check/            對參考實作或真實 gateway 驗收中間層契約
│   ├── exit-drill/           退出演練：用上游 Vite/Vitest 實際重建一次，證明驅動層可替換
│   ├── supply-chain/         套件盤點、SCA 例外申請書、鏡像清單、封閉網路前置條件
│   ├── csp-verify/           CSP 探針；探針由工具產生，不讓人照抄（要人開瀏覽器，刻意不接）
│   ├── compliance/           控制項與證據的對應表
│   ├── pii-check/            個資外洩路徑檢查
│   ├── doc-facts/            文件裡的數字 vs. repo 內部事實來源
│   ├── scope-check/          SCOPE.md 列的東西 vs. 版控裡真正存在的目錄
│   ├── threshold-check/      複雜度門檻沒有過期：實測最大值降了，門檻要跟著降
│   ├── spec-report/          驗收規格的完成率報表
│   ├── release-distance/     距上一版幾支 commit、幾天（只報數，不是閘門）
│   └── promise-check/        specs/ 的承諾：照規格弄壞一份副本，跑指名的閘門，比對結果
│
├── specs/                    框架承諾（.feature）。腳手架對採用團隊的承諾，人逐字讀
├── reports/research/         凍結的研究稿與產生那些數字的量測腳本（不是閘門）
├── .semgrep/                 開發期源碼掃描的自寫規則（汙點傳遞）＋ 故意寫壞的 fixture
├── .github/workflows/        CI：tier1-quality / tier2-security / exit-drill / supply-chain-recapture
│
├── HANDOFF.md                採用指南 ＋ 只有組織能決定的事項
├── TESTING.md                測試層級模型：這個骨架的正確性靠哪幾層守
├── SCOPE.md                  這棵樹的組成登記表
├── SPEC-REPORT.md            業務功能完成率（由 spec-report 產生）
├── API.md                    platform/* 的形狀參考（由 api-surface 產生）
├── UI-SURVEY.md              UI 技術選型的比較
├── DECISIONS.md              決策紀錄第一卷
├── DECISIONS-2.md            決策紀錄第二卷
├── CHANGELOG.md              版本沿革
├── AGENTS.md                 給 AI agent 的契約 ＋ Vite+ 指令對照
├── CODEOWNERS                擁有權對照
├── .scaffold-stamp           腳手架那一半的指紋
├── vite.config.ts            驅動層設定 —— 業務碼那一半，屬於團隊
└── vite.scaffold.ts          腳手架那一半的 lint 設定；fork 之後不改，升級時跟著上游進來
```

依賴方向**只准單向**：`apps → features → platform`。
切片需要互動時只有兩條合法路徑：往上到 `apps/` 層組裝，或往下把共用契約抽到 `platform/`。

---

## 邊界怎麼守

這棵樹有三條邊界：切片與切片之間、`platform/` 與使用它的切片之間、
採用團隊與腳手架之間。每一條都有會失敗的檢查在守，不是靠 review。

### 切片與切片之間

單一機制都有各自守不住的縫，所以分三層：

| 層  | 機制                                                        | 擋什麼                                         | 跑在哪               |
| --- | ----------------------------------------------------------- | ---------------------------------------------- | -------------------- |
| 1   | `tools/conformance` 讀 workspace manifest                   | 宣告出來的跨切片依賴                           | Tier 2               |
| 2   | oxlint `no-restricted-imports`（設定在 `vite.scaffold.ts`） | 裸模組名跨切片 import、繞過 `@org/http-client` | Tier 1（編輯器即時） |
| 3   | `tools/conformance` 精確路徑解析                            | 相對路徑逃逸切片根目錄                         | Tier 2               |

第 3 層不用 lint 規則，是因為現成的規則擋掉的是**所有** `../`，
連同一個 package 裡的相對匯入都擋，偽陽性高到大家會關掉它。

切片**之內**還有一層分層規則，由 `tools/conformance` 在 Tier 2 執行：
畫面層與 store 不得直接 import 資料查詢函式庫、`@org/http-client` 或本切片的 `api.ts`
（取數一律走 `src/hooks/`），`src/usecases/` 不得 import 任何前端框架模組。
兩份禁用清單都定義在 `platform/slice-kit` 的契約裡。禁的是**位置**不是相依，
hook 本來就要用它們；`import type` 一律放行。

### `platform/` 與切片之間

`platform/` 就是腳手架本身：改它等於同時改動所有切片、所有團隊。

[`tools/api-surface`](tools/api-surface) 抽出每個 `platform/*` 進入點的**型別形狀**，
與已提交的基準比對。形狀包含 interface 的成員、class 的建構子、元件的 props／slot／emit。
**移除、改名、或改變形狀就讓閘門失敗**，除非基準已登記對應的 codemod。
判準只有一條：**下游會不會編不過。**

做不到 codemod 的改動，就不是 breaking change，是**新 API**——新增 export、
新增選填成員、把舊的標 `@deprecated` 保留一個 release 週期。
流程與寫 codemod 的規則見 [tools/codemods](tools/codemods)。

### 採用團隊與腳手架之間

採用團隊 fork 這棵樹、在根目錄放上 `.scaffold-fork` 之後，閘門鏈改跑 fork 那一條，
預設只接五道：腳手架的章、一致性檢查、platform API 表面檢查、
設計系統接縫、退出面檢查（C244 之前是六道，`.vue` 型別檢查隨 Vue 退場）。其餘閘門在上游照跑，不下發給 fork。

樹因此分成兩半：

- **腳手架那一半**：`tools/`、`platform/`、`vite.scaffold.ts`、上游的 workflow、
  閘門那幾條 script，以及 oxlint 的生效設定。它們的指紋記在 `.scaffold-stamp`，
  改了、刪了、或在 `tools/`／`platform/` 底下新增檔案，閘門就紅。
  升級的方式是 merge 上游，所以團隊自己的工具要放在別的目錄。
- **團隊那一半**：`apps/`、`features/`，以及 `vite.config.ts` 裡業務碼的設定。

完整的做法見 [HANDOFF.md](HANDOFF.md) 的〈放上 `.scaffold-fork`〉一節。

### 機器守著的邊界：兩層檢查

|                       | 內容                                                                                                                                                                                                     | 何時跑                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Tier 1 — 品質**     | 閘門名冊一致 + SCOPE.md 與版控內容一致 + 腳手架的章 + oxlint + oxfmt + 型別檢查 + 驗收規格完成率 + 無障礙靜態檢查 + 設計系統接縫 + 複雜度門檻沒有過期                                                    | 本機、每次 PR           |
| **Tier 2 — 安全閘門** | 一致性檢查 + platform API 表面檢查 + D2 退出面檢查 + 供應鏈盤點 + 法遵對照表 + 測試環境個資檢查 + 文件數字與事實來源一致 + 框架承諾檢查 + BFF 契約驗收 + ESLint 安全規則 + SAST + 機密掃描 + SBOM 與 SCA | 每次 PR **＋ 每日排程** |

這張表的閘門部分由 `tools/gate-roster` 與閘門鏈、CI workflow 逐項比對，少寫一道會紅。

Tier 2 刻意**全量、不快取、不經驅動層**：安全掃描的結果會隨時間失效，
即使程式碼一字未改——新公布的 CVE 不會改變任何快取指紋，命中快取回綠燈的那一刻，
專案正是脆弱的。

---

## 📖 完整文件

這份 README 只講這棵樹是什麼、邊界在哪裡。其餘內容各有歸屬：

| 文件                                                           | 內容                                                                                                       | 讀者               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ |
| [HANDOFF.md](HANDOFF.md)                                       | 上半是採用指南（安裝、第一個畫面、承諾與已知缺口）；下半是只有組織能決定的 26 件事，每一項附「拿什麼去談」 | 採用團隊、PM、資安 |
| [TESTING.md](TESTING.md)                                       | 測試層級模型：哪一層守什麼、哪一層下發不了、哪一層是採用團隊自己的責任                                     | 全體               |
| [SCOPE.md](SCOPE.md)                                           | 這棵樹上每一個目錄與根層檔案是什麼                                                                         | 全體               |
| [`specs/`](specs)                                              | 框架承諾的規格原文                                                                                         | 採用團隊           |
| [SPEC-REPORT.md](SPEC-REPORT.md)                               | 業務功能的驗收規格完成率                                                                                   | PM、採用團隊       |
| [API.md](API.md)                                               | `platform/*` 每個進入點的型別形狀                                                                          | 前端               |
| [UI-SURVEY.md](UI-SURVEY.md)                                   | UI 技術選型的比較與既有約束                                                                                | 前端負責人         |
| [DECISIONS.md](DECISIONS.md)、[DECISIONS-2.md](DECISIONS-2.md) | 架構決策、實測校正與風險登記的完整理由                                                                     | 架構師、維護者     |
| [CHANGELOG.md](CHANGELOG.md)                                   | 版本沿革；SemVer 的承諾對象是 `platform/*` 的型別形狀                                                      | 全體               |
| [AGENTS.md](AGENTS.md)                                         | 給 AI agent 的契約，以及 Vite+ 工具鏈的指令對照                                                            | 全體／AI 協作      |
| [`platform/bff-contract`](platform/bff-contract)               | 13 條中間層契約條目、可覆寫的環境變數、對真實 gateway 的限制                                               | 後端／平台團隊     |
| [`tools/supply-chain`](tools/supply-chain)                     | 供應鏈盤點，以及交給資安與平台團隊的三份產生文件                                                           | 資安、平台團隊     |
| [`tools/exit-drill`](tools/exit-drill)                         | 換掉驅動層的退路與最後一次演練的證據                                                                       | 架構師、稽核       |
| [`tools/<name>/README.md`](tools)                              | 每一道閘門自己的守備範圍、失敗訊息怎麼讀、刻意不守什麼                                                     | 全體               |
| [Vite+ 官方文件](https://viteplus.dev/guide/)                  | 驅動層本身；本機副本在 `node_modules/vite-plus/docs`                                                       | 全體               |

各 package 的 API 說明放在該 package 的 `README.md` 與原始碼的 JSDoc 裡——
理由寫在它生效的地方，不集中到一份會過期的說明文件。

---

## 🤝 貢獻指南

### 提交 Issue

開 Issue 前先跑一次完整檢查（做法見 HANDOFF〈一次跑完所有檢查〉）並附上輸出。回報時請包含：

1. **重現步驟**與預期／實際行為
2. **環境**：Node.js 與 Vite+ 的版本、作業系統
3. 若是工具鏈或套件管理行為異常，附上 Vite+ 環境診斷的輸出（見 [AGENTS.md](AGENTS.md)）

### 提交 Pull Request

PR 會被兩層 CI 攔一次，請先在本機把完整檢查跑到全綠。另外有六條**不通融**的規矩：

1. **不得跨切片依賴。** 需要互動就往上到 `apps/` 組裝，或往下把契約抽到 `platform/`。
2. **改 `platform/` 的 breaking change 必須同 PR 附 codemod 並跑完全 repo**，
   否則 `tools/api-surface` 會擋下。做不到 codemod 就改成新增 API ＋ `@deprecated`。
3. **新增切片要自己補三個檔案**：`CODEOWNERS`、`apps/<app>/package.json` 的
   dependencies、`apps/<app>/src/features.ts`。產生器刻意不代勞——那正是要被 review 的部分。
4. **文件裡的數字必須推導得出來。** 現況型文件（README／HANDOFF／UI-SURVEY）由
   `tools/doc-facts` 逐句核對；改寫被登記的句子，要同步更新 `tools/doc-facts/src/facts.ts` 的樣式。
5. **閘門紅了，改的是程式碼，不是設定或門檻。** 認為門檻訂錯了，開 Issue 說明，不要在同一個 PR 裡調鬆它。
6. **`specs/` 底下的 `.feature` 由人寫。** 做不到就說做不到，不要改規格、也不要自己加上 `@待辦`。

修改 `.github/workflows/tier2-security.yml` 或任何 `tools/` 下的閘門前，
請先讀該檔開頭的理由段落。`CODEOWNERS` 已把這些路徑劃給資安共同把關，
「先問為什麼它長這樣」比「先讓它變綠」重要。

---

## 📄 開源協議

本專案採用 [MIT License](https://opensource.org/licenses/MIT) 授權，全文見 [LICENSE](LICENSE)。

MIT 宣告在 [LICENSE](LICENSE) 與根 `package.json` 的 `license` 欄位兩處，兩者須一致。
著作權人欄位目前是占位符 `@org`，對外發布前須替換為法務認可的法人全名。
底下 34 個 workspace 套件全部是 `private`、不對外發佈，因此不逐一標註授權。

上游相依的授權盤點見 [`tools/supply-chain`](tools/supply-chain)。
