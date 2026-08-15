# Vite+ 企業級腳手架 — 決策紀錄

> 本檔是**已建成腳手架**的交接文件，不是待辦筆記。
> D1–D14 為定案決策；C1–C35 是實作階段推翻或修正設計的紀錄（含原文與「不要照這裡做」標註）；
> R1–R9 是風險登記簿。實作順序 **1–10 全部完成**。
>
> **全部九條風險已於 2026-08-15 調查完畢**，處置分寫在〈R1／R6 調查與處置〉與
> 〈R2／R3／R4／R5／R8 調查與處置〉兩節。R7／R9 已解除，其餘七條的**技術面已完成**，
> 剩下的是只有組織能做的決定（申請例外、設定 mirror、核准版本流、指派中間層）。
>
> ⚠️ 讀 R2 與 R5 的原始敘述時請一併看處置那節：**兩條的原始數字與原始處置都被實測推翻**。
>
> **只有組織能做的部分已收攏成一份清單：[HANDOFF.md](HANDOFF.md)**（13 項，按對象排列）。
> 本檔保留完整脈絡與理由，那份是拿去交出去的。

## 已查證事實（實機驗證，2026-08-14）

- `vite-plus@0.2.9`（2026-08-12 發佈），MIT，pre-1.0 beta，約 1–2 週一版
- 內建並**鎖死版本**：oxlint `=1.77.0`、oxfmt `=0.62.0`、vitest `4.1.10`、oxlint-tsgolint
- `vp` 指令：create / migrate / dev / build / test / lint / fmt / check / pack / run / exec /
  preview / cache / config / hooks / staged / toolchain / install
- `vp install` 僅為 pnpm / npm / yarn / bun 的門面，本身非套件管理器；支援 `--save-catalog`
- 原生二進位：8 個平台 `optionalDependencies`，解壓後 **32–40 MB**
  （實測 darwin-arm64 40 MB、linux-x64-gnu 32.0 MB。原稿寫「各約 41 MB」，見 C24）
- npm 上有 **SLSA provenance attestation + 簽章**（已對 linux-x64-gnu 逐筆確認
  `predicateType: https://slsa.dev/provenance/v1`）
- **供應商已變更**：Cloudflare 於 **2026-06-04** 宣布併購 VoidZero。
  同一篇公告確認 Vite+ 已以 **MIT 開源**（原規劃是商業授權／source-available）。
  `vite-plus`、`@voidzero-dev/vite-plus-core`、8 個原生二進位的 `license` 欄位實測皆為 MIT
- 官方文件**無任何 SLA 或支援承諾** —— MIT 即無擔保。緩解措施必須自己持有（見 R1 處置）
- 「Automatic Data Tracking」＝本機任務快取的檔案讀寫指紋，**非 telemetry**
- **oxlint 1.77 共 847 條規則**。**有** `no-restricted-imports`、`no-restricted-exports`、
  `no-restricted-globals`、`import/no-relative-parent-imports`、`import/no-cycle`；
  **無** `import/no-restricted-paths`、**無** `boundaries/*`
  > ⚠️ 更正：本文件初稿誤植為「381 條、無 `no-restricted-imports`」。
  > 該數字來自只比對含命名空間前綴的規則 id 的掃描，漏掉全部 ESLint core 裸規則。
- oxlint 的 vue 規則皆為 API／生命週期類，**確認不含 `vue/no-v-html`**（樣板 XSS 規則）
- `@oxlint/plugins` 提供完整 JS 自訂規則 API（visitor 模式）；
  且 `vite.config.ts` 的 `lint.jsPlugins` 是一等公民設定
  （產生的骨架即含 `{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }`）
- `vite:monorepo` 產出 `apps/` + `packages/` + `tools/`，但 `pnpm-workspace.yaml`
  是 **glob 式**（`apps/*` 等）→ 改成 `apps/* features/* platform/*` **無衝突**
- 產生的 workspace **預設就開 catalog**（`catalogMode: prefer`）、`run.cache: true`、
  `lint.options.typeAware/typeCheck: true`、TypeScript `^7.0.2`
- `devEngines.packageManager.onFail: "download"` → **vp 會自動下載 pnpm**
  （實測自動取得 pnpm 11.21.0）
- ⚠️ **`vite` 被 npm alias 指向 `@voidzero-dev/vite-plus-core`**
  （`vite: npm:@voidzero-dev/vite-plus-core@0.2.9`）
- `vite:generator` 為**程式化**產生器：基於 `bingo`（create.bingo）+ Zod 選項綱要，
  `produce()` 回傳檔案 map — **不是**樣板複製

## 決策

### D1 — 合規把關：最嚴組合

ASVS L2 + SonarQube/Checkmarx 級 SAST + SCA 需交 SBOM + 內部 registry 鏡像。

**後果**：lint 必須雙軌；native binary 須事先申請 SCA 例外（以 SLSA provenance 為證據）；
內部 registry 必須鏡像全部 8 個平台包，且 provenance 過 proxy 會遺失，須另存來源證明；
beta 版須事先報備。

### D2 — `vp` 定位：可替換驅動層

- 應用程式 `src/` 內零 `vite-plus` import
- 邊界規則、tsconfig、ESLint config 用標準機制表達，不寫進 `vp` 專屬欄位
- CI 安全閘門（ESLint + SCA + SBOM）不經過 `vp`，直接呼叫底層工具
- `vp` 只負責：本機 dev / test / fmt / staged / 任務快取 — 皆為「沒了也能活」的功能

**理由**：企業級需存活 2–3 年，vp 為 pre-1.0 且雙週一版。

⚠️ **保單有一個破口（實測後補記）**：產生的 workspace 把 `vite` 這個套件名
**npm alias 到 `@voidzero-dev/vite-plus-core`**。所以「退回 plain Vite」不是純粹的
設定置換——要移除 alias 換回真正的 `vite`，而兩者的打包核心不同（Rolldown vs Rollup），
產出與外掛相容性可能有差異。

**因應**：退出演練必須**實際跑過一次**（移除 alias、跑完整建置與測試、比對產出），
而不是假設它會成立。建議列為每季一次的例行演練，否則這張保單是未經測試的。

✅ **已於 2026-08-15 實際執行並自動化**（`tools/exit-drill`）：退到上游 **Vite 8.2.1**
建置成功、上游 Vitest **108 個測試全過**、應用程式原始碼一字未改。
Rolldown 與 Rollup 的產出差異在本專案未造成問題（產物大小一致）。
每季排程 + 每次 gate 的退出面靜態檢查，證據進版控。詳見 R1 處置與 C23。

### D3 — repo 拓樸：單一 org monorepo

**賺到**：切片邊界由 `package.json` 依賴圖物理保證；`vp run --filter` 可只跑受影響切片。

**代價（須治理）**：

1. 共用 lockfile ＝ 共用漏洞版本，CVE 修補為全 repo 同步升級 → 需 catalog + 修補窗口流程
2. `@org/create` 角色改變：不再是「開新 repo」，而是「在 monorepo 內長出新切片」
   → 交付物 ＝ monorepo 骨架 + slice generator

### D4 — 分層：三層，切片禁互依

```
apps/        部署單位。薄殼：路由組裝、環境設定、composition root
features/    垂直切片。一片 = 一個 package，內含 UI + state + api + 自己的測試
platform/    技術底座。ui-kit / http-client / auth / config / tsconfig / eslint-config
```

依賴方向單向：`apps → features → platform`。

**硬規則**：`features/*` 之間一律禁止互相依賴。

⚠️ **初稿的「物理保證」說法過度樂觀（實測後修正）**：`package.json` 只擋得住
**裸模組名** import（`@org/feature-billing`）。它擋不住**相對路徑穿越**
（`../../billing/src/useBilling`）——Vite 直接從磁碟解析，該 import 不會出現在任何
manifest 裡，讀 manifest 的 CI 腳本**看不到**。

**因此邊界需三層防護**（好消息：oxlint 全部做得到，可放在 Tier 1 快軌）：

| 層  | 機制                                                       | 擋什麼                          | 跑在哪              |
| --- | ---------------------------------------------------------- | ------------------------------- | ------------------- |
| 1   | CI 腳本讀 workspace manifest                               | 宣告出來的跨切片依賴            | Tier 2（不可繞過）  |
| 2   | oxlint `no-restricted-imports`                             | 裸模組名跨切片 import           | Tier 1（本機即時）  |
| 3   | ~~oxlint `import/no-relative-parent-imports`~~ → **見 C1** | **相對路徑逃逸 package 根目錄** | ~~Tier 1~~ → Tier 2 |

> ⚠️ 第 3 層的機制在實作階段被推翻，改為 `tools/conformance` 的精確路徑解析。
> **不要**照本表把 `import/no-relative-parent-imports` 加回去 —— 理由見 C1。

第 2 層讓開發者在**編輯器裡當場**看到違規；第 1、3 層是繞不過的底線。

切片間溝通僅兩條合法路徑：往上到 `apps/` 組裝，或往下抽成 `platform/` 共用契約。

### D5 — lint 雙軌：職責互斥切分

| 工具                        | 規則範圍                                                                                                      | 跑在哪                           | 目標耗時 | blocking                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------- | --------------------------- |
| oxlint + oxfmt (`vp check`) | correctness / style / Vue API / 格式                                                                          | 本機 + pre-commit（只掃 staged） | < 1s     | 是（可 `--no-verify` 逃生） |
| ESLint                      | **只裝**安全規則：`eslint-plugin-security`、`no-unsanitized`、`eslint-plugin-vue` 樣板 XSS（`vue/no-v-html`） | CI only                          | 數十秒   | 是，不可繞過                |
| Sonar / Checkmarx           | 平台引擎 + 吃 ESLint 報告輸出                                                                                 | CI（可 nightly）                 | 分鐘級   | 依稽核要求                  |

**核心**：兩邊規則集零重疊 — oxlint 管對錯與風格，ESLint 只管安全。
**已知取捨**：本機看不到安全違規，須推上去才知道。

> ⚠️ 本表原在 ESLint 欄列有「`import/no-restricted-paths` 備援」。該規則
> **兩邊都不存在**（oxlint 沒有，本專案的 ESLint 設定也沒裝）。邊界防護實際是
> D4 表格的三層，與 ESLint 無關 —— ESLint 這一軌**純粹只管安全**。

### D6 — 套件管理器：pnpm ≥ 11 + catalog

**理由**（由 D1 + D3 夾出，非偏好）：

- 只有 pnpm 真正強制封鎖 `postinstall`（vp 內建說明字串明載：npm 11.x 的 allowScripts
  僅為勸告性、腳本照跑，npm 12 才強制；yarn v1 預設就跑）
- 共用 lockfile 需 catalog 集中版本，CVE 才能全 repo 同步升級
- 嚴格 `node_modules` 無 phantom deps → SBOM 不失真（npm hoisting 會使 SBOM 失真）
- `vp install` 的 `--shamefully-hoist` / `--resolution-only` / `--fix-lockfile` 皆標註 pnpm only

**配套設定**：根 `.npmrc` 指向內部 Nexus/Artifactory；CI 設 `NODE_EXTRA_CA_CERTS`。

> ⚠️ 本段原寫「`ignore-scripts=true` 打底；允許清單走 `pnpm.onlyBuiltDependencies`」，
> 實作後證實**兩點都錯**：pnpm 11 的機制是 `pnpm-workspace.yaml` 的 `allowBuilds`，
> 且設 `ignore-scripts=true` 會連允許清單一併封鎖、使機制失效。詳見 C4。

**額外查證**：`vp` 有未列於頂層 help 的 `vp pm` 指令族
（approve-builds / deny-scripts / rebuild / audit / why / patch / outdated / dedupe）。
`vp` 執行期會下載（二進位含 `VP_DOWNLOAD_TIMEOUT` 與硬編 `https://registry.npmjs.org`），
認 `HTTP_PROXY` / `HTTPS_PROXY` / `SSL_CERT_FILE` / `NODE_EXTRA_CA_CERTS`
→ 此行為須事先寫進稽核例外申請。

### D7 — 切片公開契約：單一模組描述物件

```ts
// features/order/src/index.ts
export default defineFeature({ name, routes, stores, permissions, i18n, menu });

// apps/console/src/features.ts  ← 唯一的共用檔案
export default [order, billing];
```

新增切片 ＝ 改一個檔案、加一行。全靜態 import。
`defineFeature` 住在 `platform/`，以型別把「切片該長什麼」變成編譯期強制。

**排除 `import.meta.glob` 自動掛載**：動態 glob 使 SAST 追不到進入點、tree-shaking 失效。

### D8 — 憑證架構：BFF + httpOnly cookie

token 從不進入 JS，XSS 發生也偷不走。

**後果**：

- `platform/http-client` 預設 `credentials: 'include'` + CSRF header
- BFF 必須與 SPA **同源**（走路徑前綴如 `/api/*`），否則 `SameSite` 形同虛設
- `vp dev` 的 proxy 設定必須鏡像 production 來源配置，否則本機通過、上線失敗
- 登出必須清除伺服器端 session，不只清前端

**另一條必辦**：`import.meta.env.VITE_*` 會被編譯進 bundle 明文。
`platform/config` 須用型別把此事擋在編譯期——只有明確標記為 public 的設定才准用 `VITE_` 前綴。

### D9 — slice generator：完整骨架 + 一致性檢查

**關鍵認知**：產生器只決定起點，**解決不了漂移**。真正防退化的是 CI 每次都跑的
一致性檢查（conformance check），驗證每個 `features/*`：

- `src/index.ts` 有 default export 且型別為 `Feature`
- `package.json` 依賴**不含任何其他 `features/*`**（D4 硬規則）
- 有 `*.test.ts`，覆蓋率不低於門檻
- `CODEOWNERS` 有對應條目（無 owner 的切片 ＝ 無人負責的切片）
- 不直接 import `axios`/`fetch`，一律走 `platform/http-client`

產生器產出的內容 ＝ 一致性檢查會驗的內容。

✅ **實測後可以做得比原本計畫更好**：`vite:generator` 是**程式化**產生器
（基於 `bingo` + Zod 選項綱要，`produce()` 回傳檔案 map），**不是樣板複製**。
所以產生器與一致性檢查可以 **import 同一個契約模組** —— 真正的單一事實來源，
而不是兩份會各自漂移的定義。這是 D9 的核心實作要求。

**供應鏈備註**：產生器引入第三方 `bingo`，須納入 D1 的 SCA 範圍。

一致性檢查腳本讀 workspace manifest + glob，約百餘行，不依賴 `vp`（符合 D2）。

### D10 — CI：雙層

> **原則：快取與 affected 過濾可用於品質檢查，絕不可用於安全掃描。**
> 安全掃描結果會隨時間失效，即使程式碼一字未改。新公布的 CVE 不會改變快取指紋，
> affected 過濾會判定「無影響」→ 掃描命中快取回綠燈，而專案此刻正脆弱。
> 推論：安全掃描必須有**時間觸發**，不能只有 commit 觸發。

|                 | 內容                                                          | 範圍                    | 快取 | 觸發               |
| --------------- | ------------------------------------------------------------- | ----------------------- | ---- | ------------------ |
| Tier 1 品質     | build / test / oxlint（含 D4 第 2、3 層邊界規則）/ type check | affected（見下）        | ✅   | 每次 PR            |
| Tier 2 安全閘門 | ESLint 安全規則 / SCA / SBOM / 一致性檢查 / secret 掃描       | **全量不過濾**，不經 vp | ❌   | PR ＋ **每日排程** |

⚠️ **affected 偵測要自己算（實測後修正）**：`vp run` **沒有 changed-since / git-ref 過濾器**。
實測 `vp run --help`，`--filter` 只支援套件名、目錄、與依賴圖遍歷
（`...<pattern>` ＝ 該套件及其**下游相依者**），**沒有** `--since` / `--changed` / `--affected`，
也沒有 pnpm 的 `[origin/main]` 語法。

**因應**（兩者並用）：

1. **主要提速靠任務快取**（`run.cache: true` 為產生骨架的預設）。命中快取的任務直接跳過，
   全量跑未必慢。**先量測再決定要不要做 affected**。
2. 真要 affected，自己算：`git diff --name-only origin/main` → 對應到變動的套件名單 →
   逐一餵 `vp run --filter ...<pkg>`（`...` 前綴會自動帶出所有下游相依者）。
   git 比對這一步是我們的腳本，不是 vp 的 —— 這反而**符合 D2 保單**。

兩層用不同 workflow 檔、**不共用快取金鑰**。
SBOM 從根 `pnpm-lock.yaml` 一次產出全 repo 的（D3 是共用 lockfile，分開產會得到 N 份互相矛盾的 SBOM）。

### D11 — 執行期加固：嚴格 CSP（分階段）+ hidden sourcemap

- **無 `unsafe-eval`**：Vue 3 runtime-only build 不含樣板編譯器。
  代價：執行期不得使用 `template:` 字串 → 此限制須寫進一致性檢查
- **`:style` 綁定產生 inline style 屬性**，受 `style-src-attr` 管。
  用 `style-src 'self'; style-src-attr 'unsafe-inline'`，把例外縮到只有屬性
- **`build.sourcemap: 'hidden'`**：產生 map 但不寫 `sourceMappingURL` 註解，
  map 只上傳錯誤追蹤系統、**不部署到 web server**
- **上線分兩階段**：先 `Content-Security-Policy-Report-Only` 跑 1–2 週收 violation
  （第三方 UI 元件／字型／圖表 lib 一定會有），收斂後再切 enforce。
  直接上 enforce 通常三天後被回滾，然後 CSP 在該團隊永遠不會再被提起
- ~~nonce 注入由 D8 的 BFF 負責 → 是設定，不是額外工程~~
  **⚠️ 不要照這裡做（見 C21）。** 寫這條時假設了 BFF 存在（R6 當時未解），
  而且假設了一定需要 nonce。實測後兩個假設都不成立：建置產物**零個 inline script**，
  因此靜態 CSP 標頭就夠，不需要 nonce，也就不需要任何會改寫 HTML 的中間層。
  這個前提由 `assertStaticCspCompatible()` 在每次建置守住

### D12 — platform/ 治理：管理員模式 + codemod 強制

在 D3 的單一 monorepo 裡，**`platform/` 就是腳手架本身**。

- maintainer 3–4 人，**跨團隊抽調、非專職**，只負責審查把關，不壟斷開發
- **任何人都能提 PR 改 `platform/`**，需 maintainer 核准 → 避免瓶頸也避免無主
- **breaking change 必須附 codemod**，提出者有義務在同一 PR 跑完全 repo。
  做不到 codemod 的改動，就不是 breaking change，是新 API
- 舊 API 標 `@deprecated` 保留**一個 release 週期**，一致性檢查在窗口後由 warning 轉 error
- CODEOWNERS 核准地獄的解法：codemod 產生的機械性改動走 `platform-codemod`
  標籤自動核准，人工改動才需各團隊審

> 「必須附 codemod」的真正作用不是省時間，是**讓提出 breaking change 的人自己承擔成本**，
> 藉此過濾掉九成不必要的 API 變動。

### D13 — 選型收尾

| 項目       | 決定                                          | 理由                                                                                                         |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **格式化** | **oxfmt**（`vp check` 內建）                  | 速度與整合優先，已知並接受代價 ↓                                                                             |
| 資料存取   | TanStack Query (Vue Query)                    | query key 天然可切片命名空間化（`['order', ...]`），失效／重試／錯誤處理統一收在 `platform/http-client` 之上 |
| 狀態       | Pinia，**store 定義在切片內**                 | id 用 `order/xxx` 命名空間。**不得有全域 store 目錄**——那是 D4 三層架構最常見的破口                          |
| i18n       | vue-i18n，訊息隨切片走                        | 已在 D7 契約內，掛 `order.` 前綴                                                                             |
| UI kit     | `platform/ui` **包一層**第三方                | 切片禁止直接 import 第三方 UI lib。第三方元件是 CVE 與 CSP violation 大宗，包一層才能一次換掉                |
| 修補 SLA   | critical 3 天／high 14 天／medium 下個 sprint | 對應 D10 每日排程掃描；沒有 SLA 的掃描等於沒有掃描                                                           |

**oxfmt 的已知代價**：被 `vp` 鎖死在 `=0.62.0`（比 vite-plus 本身更早期）。
格式化工具是唯一換掉就會動到每個檔案的工具——退出 vp 時將產生一次性全 repo reformat，
毀掉 `git blame` 追溯能力（該能力在稽核與事故調查有實質價值）。

**緩解措施（第一天就做，不是將來才做）**：
建立 `.git-blame-ignore-revs`，並由腳手架 setup 腳本自動設定
`git config blame.ignoreRevsFile .git-blame-ignore-revs`。
等真的要 reformat 那天再補，全員本機設定收不齊。

### D14 — 切片**內部**的分層：composable（2026-08-15 補）

前面 D1–D13 有一個共同的盲點，是在一次針對「這到底算不算 Feature-Driven」的
review 裡被指出來的：

> **這個腳手架把「切片之間」的邊界守得極嚴，對「切片之內」幾乎什麼都沒說。**

證據是 `REQUIRED_FILES` 只有四項（`package.json`／`tsconfig.json`／`README.md`／
`src/index.ts`）。`api.ts`／`store.ts`／`routes.ts`／`views/` 那套結構**只存在於
產生器的模板裡，沒有任何檢查在守** —— 誰手寫一個切片、或改了產生器，慣例就消失，
而閘門全綠。當時全 repo grep `composable` 是 **0 筆**：它不是被評估後否決的選項，
是沒被想過。

#### 決定

採用 **Vue 官方的 composable 慣例**（vuejs.org/guide/reusability/composables）作為
切片內部的分層，**有狀態的邏輯住在 `useXxx()` 裡，元件只負責呈現**。

| 位置               | 放什麼                                              |
| ------------------ | --------------------------------------------------- |
| `src/api.ts`       | 純資料存取與 query key，無響應性                    |
| `src/composables/` | `useXxx()` —— 取數、快取 key、後備值                |
| `src/store.ts`     | Pinia，跨元件共享的**使用者意圖**（篩選條件、分頁） |
| `src/views/`       | **只呈現**                                          |

照官方的三條慣例寫，每一條都有具體代價：

1. **輸入接受 ref／getter／純值，用 `toValue()` 正規化** —— 否則呼叫端得自己解
   `.value`，而傳 getter 進來會變成把函式本身當查詢條件
2. **回傳 ref 組成的普通物件** —— 回傳 `reactive()` 的話，
   `const { orders } = useOrderList()` 當場斷開響應性
3. **只在 setup 期間同步呼叫** —— 由 Vue 自己在執行期報錯，不需額外守

#### 有牙齒的只有一條

命名規則（`useXxx.ts` 且匯出同名函式）是輔助。真正的邊界是：

> **`src/views/` 底下不得直接 import `@tanstack/vue-query`、`@org/http-client`，
> 或本切片的 `api.ts`。**

禁的是**位置**不是相依 —— composable 就是要用它們。

為什麼是「禁 import」而不是「禁元件裡出現 `useQuery`」：前者是可精確判定的靜態事實，
後者要語意分析。同一個取捨見 D4 第 3 層。

#### 為什麼值得補

現在每個切片只有一個 view，內聯 `useQuery` 看不出問題。但這是**腳手架**——
產生器會被跑上幾十次，它示範什麼，團隊就長成什麼。等到同一個切片長出第二個
消費者（例如首頁的「最近訂單」小卡），那段查詢只能複製貼上，因為沒有地方放它。
複製之後兩份 queryKey 會慢慢漂移，**快取失效的時機從此對不起來，而且不會有任何
測試變紅**。

#### 反向測試

五種破壞，每一種都紅在正確的一條上：元件 import `useQuery`／元件 import `../api.ts`／
元件 import `@org/http-client`／`composables/` 放非 `useXxx` 命名的檔案／檔名與匯出名
不一致。**並驗過無偽陽性**：composable 自己 import `useQuery` 與 `api.ts` 是正確的，
不得被誤擋。

### D14 下半：Pinia 的界線

補完 composable 之後，切片裡出現了**兩個**可以放狀態的位置，卻沒有規則說哪個放什麼。
教科書級的失敗模式因此變得可能：在 store action 裡取數、把伺服器資料快取進 state。
一旦有人這樣寫，同一份資料就有兩套快取（Pinia 一套、TanStack Query 一套），
失效時機不同 —— 跟上半段要防的 queryKey 漂移是同一種病，只是換個位置發作。

#### 判準

> **這份資料如果和伺服器不一致，誰是錯的？**

| 東西                        | 誰是權威                     | 去哪                         |
| --------------------------- | ---------------------------- | ---------------------------- |
| `Order[]` 本身              | 伺服器                       | TanStack Query（composable） |
| **選取的訂單 id 清單**      | **客戶端**（伺服器沒有意見） | **Pinia**                    |
| 「選取的那幾筆 Order 物件」 | 兩者都不是 —— 它是**推導**的 | 哪裡都不放，`computed`       |
| 篩選條件 `status`／`page`   | 客戶端                       | Pinia                        |
| 送出前的表單草稿            | 客戶端                       | Pinia 或元件本地             |

一句話：**Pinia 存 id，不存 entity。**

第三列是這條界線真正要擋的東西。`selectedOrders` 看起來像狀態，其實是
`selectedIds` 與 query 資料的 join —— 存下來就是第二份快取。

#### 執行面：禁 value import，放行 `import type`

```ts
import type { Order } from "./api.ts"; // ✓ 借型別
import { fetchOrders } from "./api.ts"; // ✗ 呼叫伺服器
import { useQuery } from "@tanstack/vue-query"; // ✗
```

這個區分不是為了方便而開的例外，它**精確可判定**，而依據是本 repo 的
`verbatimModuleSyntax: true`：

- `import type { X }` → 整句被抹除，沒有執行期效果
- `import { type X }` → **仍會產出 `import "./api.ts"`**，模組實際被載入

所以把後者算成 value import 是正確的，不是偽陽性。判定方式是從命中處往回找最近的
`import`／`export`（單層量詞的正則，多行 import 也成立，不需要 parser）。

這條規則的價值在於**讓錯誤寫不出來**：拿不到 `fetchOrders`、拿不到 `useQuery`，
entity 就進不了 store。

#### 反向測試

七種情況，其中**三條偽陽性檢查比「該紅會紅」更重要** —— 誤擋 `import type` 的話，
規則第一天就會被加例外，而加過一次例外的規則半年後就不再是規則：

| 情況                                      | 期望 | 結果 |
| ----------------------------------------- | ---- | ---- |
| store value import `./api.ts`             | 紅   | ✓    |
| store 直接用 `useQuery`                   | 紅   | ✓    |
| store 直接用 `@org/http-client`           | 紅   | ✓    |
| 多行 value import                         | 紅   | ✓    |
| **`import type`（現況就長這樣）**         | 綠   | ✓    |
| **多行 `import type`**                    | 綠   | ✓    |
| **`import { type X }`**（模組真的被載入） | 紅   | ✓    |

#### 順帶釐清的一件事

這一節是從「腳手架裝 Pinia 是不是因為 Vite+ 沒有替代插件」這個問題長出來的。
**那是層級混淆**：`vite-plus` 的相依只有 oxlint／oxfmt／tsgolint／vitest／core，
指令只有 dev／build／test／lint／fmt／check／pack／run 這些，**不送任何程式碼進瀏覽器**。
它取代的是 Vite、Vitest、ESLint、Prettier、turborepo 這一排建置期工具；
Pinia 是執行期、會進 bundle 的東西。

證據就在 `tools/exit-drill`：退出時要換的清單是 `{vite, vue, @vitejs/plugin-vue, vitest}`，
**Pinia 不在裡面** —— 2026-08-15 實測退到上游 Vite 8.2.1，108 個測試全過，Pinia 一個字沒改。
那條線就是 D2 的「可替換驅動層」邊界。

不過這個問題有個真的部分：D14 上半段把伺服器狀態搬走之後，Pinia 只剩兩個各含
一兩個 `ref` 的 store。**它現在的理由變了** —— 不再是「狀態管理方案」，
而是「提供統一慣例，防止各團隊自己發明 singleton」。拿掉它的替代方案不是「沒有狀態管理」，
是有人用 module-scope ref、有人用 `provide/inject`、有人用匯出的 `reactive({})`。

（另一個已知的空白：`status`／`page` 其實更該放 `route.query`（可書籤、可分享、
上一頁行為正確），而本 repo 目前完全沒用過 `route.query`。**刻意暫不處理** ——
那會讓這兩個 store 變空，是另一個獨立的決定。）

#### 術語附註

提出這次 review 的說法是「後端的 vertical slice 在前端該叫 Feature-Driven + Composable」。
前半對，而且腳手架本來就是那個東西；後半是誤植 —— **Composable 在 Vue 3 不是架構名稱**，
是一個具體構件（Composition API 的 `useXxx()` 函式）。前端真正有這個名字的方法論是
**Feature-Sliced Design（FSD）**。

但把它當成架構要求來讀是有生產力的：它正好指到了上面那個盲點。**本節就是這個誤植
帶來的結果**，記在這裡是因為它示範了一件事——用錯的名字問對的問題，比用對的名字
問不出問題有價值。

---

### D15 — 樣式與 UI 元件庫：shadcn-vue（reka-ui ＋ Tailwind v4），元件住 `platform/ui`

C37 指出這是唯一沒有被決策過的選型面向。市調見 [`UI-SURVEY.md`](UI-SURVEY.md)，
可重跑的工具在 [`tools/ui-survey`](tools/ui-survey)。

**選擇**：reka-ui（headless、無障礙）＋ Tailwind v4（樣式），元件原始碼以
shadcn-vue 的方式複製進本 repo，**統一住在 `platform/ui`**。

### 為什麼元件的位置不是另一個選擇題

shadcn 的模型是「你擁有原始碼」，所以「複製到哪」是一個必須回答的架構問題。
而 **D4 已經把答案決定了**：

- 複製進每個切片 → 每片各有一份 Button／Dialog，而 D4 禁止切片互相依賴，
  **沒有任何機制能讓它們收斂**。設計系統會在第二個切片出現的那天碎片化。
- 抽到 `platform/ui` → 走既有的 platform 治理：CODEOWNERS、api-surface
  破壞性變更閘門、退出演練的 alias 清單。**多的是流程，不是新的架構概念。**

所以這一格不是「選 A 或 B」，是「D4 成立的話只剩一個答案」。

### 這個選擇貴在哪（已知、已量化、接受）

市調測出三條路的成本，這一條**最貴**：

|                | element-plus | reka-ui 單獨 | **本決策**                                   |
| -------------- | ------------ | ------------ | -------------------------------------------- |
| 新增套件       | +21          | +19          | **+61**                                      |
| 新增原生二進位 | 0            | 0            | **+23**                                      |
| 新家族         | —            | —            | `@tailwindcss/oxide` ×12、`lightningcss` ×11 |
| 授權旗標       | 無           | 0BSD ×1      | **MPL-2.0 ×12**、0BSD ×2                     |

選它不是因為便宜，是因為**它把成本花在可以攤提的地方**：元件原始碼在自己手上，
不會被上游的設計決定綁住；而 element-plus 省下的供應鏈成本，會在「要改一個
元件的行為卻只能覆寫 CSS」的時候一次還回去。

### 這個決策強制帶出的四件事

1. **退出演練必須登記 `@tailwindcss/vite`**（C36）。它會改變建置產物 ——
   不登記的話演練會產出一個沒有樣式的應用然後回報 pass。
   → 加進 `DRILL_PLUGINS`，不是 `DROPPED_PLUGINS`。
2. **供應鏈基線要重新擷取**，且 `--capture` 需要公網 → 封閉網路的團隊
   必須在公網那一側改完再一起送進來（HANDOFF #5／#6）。
3. **MPL-2.0 的範圍翻倍**：`@tailwindcss/node` 釘死 exact `1.32.0`，
   而 `vite-plus-core` 要 `^1.33.0` —— 範圍不相交、**無法合併**，
   於是 `lightningcss` 會有兩個版本各一組平台變體。HANDOFF #4 要重談。
4. **`checkSliceLayering` 目前管不到切片裡的 `components/`**。D14 管了
   `composables/`、`views/`、`store.ts`，元件目錄是新的破口 ——
   最需要防的是「切片自己複製一份 shadcn 元件」，那正好繞過 `platform/ui`。

### 淘汰掉的，以及為什麼值得寫下來

**PrimeVue 在 2026-06-28（v5.0.0-rc.1）改成商業授權** —— 需 license key、
以編譯後套件發佈、禁止還原原始碼。免費的 Community License 門檻是
年營收 < 100 萬美元、開發者 < 5 人。最後一個 MIT 穩定版是 4.5.5。

值得寫下來的原因不是 PrimeVue 本身，是**發現它的方式**：

- 做這份市調時搜到的四篇「2026 最佳 Vue UI 函式庫」**全部把 PrimeVue 列為企業首選**
- registry 的 `license` 欄位只寫 `SEE LICENSE IN LICENSE.md`
- **GitHub `master` 的 `LICENSE.md` 到今天仍然是純 MIT**（那份是 v4 線的）
- 只有**實際發佈的 tarball 裡那一份**寫著商業條款

這與 C 系列反覆栽的是同一件事：**中繼資料與實際內容不一致，而人只讀中繼資料。**
`@yuku-*` 那次（HANDOFF #4）是拆 tarball 才發現沒有 LICENSE 檔，這次是拆 tarball
才發現授權變了。所以 `tools/ui-survey` 的授權判定**刻意不做「MIT 放行、其他擋掉」
的二分** —— 它把非常見授權標成「去把 tarball 裡那份讀出來」，因為那才是唯一權威的來源。

同樣被淘汰的還有 **naive-ui**（CSS-in-JS 是核心機制、零 nonce 支援 → 直接撞
`style-src 'self'`）、**ant-design-vue** 與 **@headlessui/vue**（12 個月零穩定版發版）。

> 發版活躍度那張表第一版是錯的：把 `insiders`／nightly 預發版也算進去，
> 於是 `@headlessui/vue` 顯示「31 版／年」——**剛好把一個停更兩年的專案
> 顯示成最活躍的那個**。只算穩定版才反映維護狀態，已釘上測試。

### 還沒做的

實作是獨立的一輪（見 HANDOFF #14），且其中一格仍要人裁決：
**`platform/ui` 的 CODEOWNERS 由誰擔任**。那是組織問題，不是技術問題。

另外 CSP 的最終確認**必須開瀏覽器**：市調的探測掃的是已發佈的 dist，
證明「有這個能力」，不證明「執行期會發生」。

---

### D16 — 過度設計的邊界：兩軸判準（2026-08-16）

**一個東西要留在 repo 裡，至少要在一軸上有分；兩軸都是零就丟。**

| 軸       | 問題                                       | 決定什麼   |
| -------- | ------------------------------------------ | ---------- |
| **交付** | 它能不能交到評審桌上（採購／資安／法務）？ | 要產出什麼 |
| **迭代** | 上游變動時，它會不會告訴你什麼壞了？       | 什麼留下來 |

#### 為什麼需要一條明寫的判準

在這之前用的是「這東西值不值得」。那是主觀的，而主觀判準的問題不是會判錯，
是**同一個東西可以論證成任何結論**：`tools/exit-drill` 在一輪對話裡被判成
過度設計又被推翻；`tools/ui-survey` 翻了三次（過度設計 → 設計不足 → 對的能力
瞄錯目標）。三次的證據都沒變，變的只有我當下拿的尺。

迭代軸是可查的，而且這個 repo 已經有現成證據：**vitest 4 移除了
`--reporter=basic`，於是子行程啟動即失敗、失敗清單是空的 —— 而空清單和
「全綠」長得一模一樣。** 那就是「上游更新了，而閘門安靜地停止檢查」。

#### 由這條判準推出的三個結論

**① 效能審計不做。** 兩軸皆零：它沒有評審收件人，也不會在 Vite 升版時
告訴你什麼壞了。明文記下來，避免下次再被提一次。

**② `ui-survey` 的 `looksUnmaintained()` 與 `licenseNeedsReview()` 要重瞄準。**
它們正是「插件過期／授權偷改」的偵測器 —— PrimeVue 就是這樣被抓到的
（`license` 欄位變成 `SEE LICENSE IN LICENSE.md`，GitHub 上的 LICENSE.md
仍是 MIT，只有 tarball 裡那份寫著商業條款）。缺陷不在能力，在**目標**：
它掃的是五個早已選完的候選，不是實際裝的 519 個。

**③ 完全沒有東西在「提出」升級。** 沒有 Renovate、沒有 Dependabot。
整個腳手架能在升級**之後**告訴你什麼壞了，卻沒有一個東西會說「該升了」。
這是迭代軸上最大的空白。

#### 原始需求的一個前提是錯的

「必須承受得住源碼掃描和弱點掃描」—— **現行法規並未要求。**
現行《數位經濟相關產業個人資料檔案安全維護管理辦法》§11 II ③ 的原文是
「定期檢測並因應系統漏洞所造成之威脅」，沒有「源碼檢測」「弱點掃描」
「滲透測試」這三個詞。它們明文出現的地方只有兩處：證交所《上市上櫃公司
資通安全管控指引》，以及**尚未生效**的個資法 §20-1 授權子法草案中
「大型非公務機關」那一級（門檻：非中小企業**且**個資達一萬筆）。

所以 `tools/supply-chain` 那一整套在法遵上是**超前部署**，正當性來自交付軸
（HANDOFF #2／#3／#5）而不是法律。記下來是為了避免下一次有人把它當成
既有義務再論證一次。完整對照見 `tools/compliance/COMPLIANCE.md`。

---

## 風險登記簿（需組織層級行動，非技術問題）

| #   | 項目                                                                                                 | 需要誰     | 未解決的後果                                                                         |
| --- | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| R1  | ~~beta 須事先報備~~ **已降級**：授權疑慮解除、退出路徑已實測（見下節）                               | 稽核／採購 | 仍需就「beta 版本流」取得核准，但談判籌碼已具備                                      |
| R2  | ~~8 個平台原生二進位須申請 SCA 例外~~ **數字錯了**：實際 **121 個／11 家族**（見下節）               | 資安       | 申請書已可產生（`vpr sca-dossier`）。**佐證必須分兩級**：89 個有 SLSA、32 個只有簽章 |
| R3  | ~~內部 registry 須鏡像全部 8 個平台包~~ **範圍錯了**：實際 **467 個套件**，含 pnpm 自身那 19 個      | 平台／IT   | 清單已可產生（`vpr mirror-manifest`，含 sha512）。缺平台變體由閘門擋下               |
| R4  | ~~provenance 過 proxy 會遺失，須另存來源證明~~ **已解決**：digest 綁定，擷取一次即可離線驗證         | —          | 已自動化。代價是封閉環境**無法就地升相依**（見下節）                                 |
| R5  | **已證實且原處置寫錯**：`vp` 會自動下載 pnpm，且**改 `onFail` 無效、專案 `.npmrc` 也無效**（見下節） | 資安／平台 | 必須在**機器／映像檔層級**設 registry。此行為必然出現在稽核報告                      |
| R6  | ~~需要能設 cookie 的同源中間層~~ **已降級**：契約可執行、參考實作已通過（見下節）                    | 架構       | 仍需指派那一層由誰提供，但「要做到什麼」與「怎麼證明」都已成為程式碼                 |
| R7  | ~~pnpm ≥ 11 可用性~~ **已解除**：vp 自動供裝 pnpm 11.21.0                                            | —          | —                                                                                    |
| R8  | 產生器依賴第三方 `bingo`（create.bingo）**已分類**：dev-only，且該分類由閘門斷言                     | 資安       | 納入 SCA 範圍時標 dev-only，與 runtime 相依分開計嚴重度                              |
| R9  | ~~D2 的退出保單未經測試~~ **已解除**：2026-08-15 實測退到上游 Vite 8.2.1，建置與 108 個測試全過      | —          | 已自動化為每季演練 + 每次 PR 的退出面檢查（`tools/exit-drill`）                      |

---

## R1／R6 調查與處置（2026-08-15）

### R1 — beta 工具鏈的可接受性

**調查結果推翻了原本的假設。** 原本擔心的是「beta ＋ 可能的商業授權」，
實際查到的是：授權疑慮已經消失，但**供應商換人了**。

| 查到的事實                                                                                        | 對採購／稽核的意義                                                                           |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `vite-plus@0.2.9`（2026-08-12）仍是 latest；dist-tags 只有 `latest`／`alpha`／`test`，**無 1.0**  | 「不得使用非 GA 元件」的規格仍會擋下它。這一條沒有變                                         |
| 0.2.5→0.2.9 共 4 版、26 天（約 5–14 天一版）                                                      | **核准必須針對「版本流」，不能逐版核准** —— 否則 D13 的 critical 3 天修補 SLA 一開始就是死的 |
| Vite+ **原本規劃是商業授權／source-available**（免費給個人、OSS、小企業；新創收固定費、企業另議） | 這是原本 R1 最大的地雷                                                                       |
| **Cloudflare 於 2026-06-04 宣布併購 VoidZero**，該文明確寫著 Vite+ 已以 **MIT 授權開源**          | **地雷已解除。** 但供應商紀錄要寫 Cloudflare，不是 VoidZero                                  |
| 實測 `vite-plus`、`@voidzero-dev/vite-plus-core`、8 個原生二進位的 `license` 欄位皆為 MIT         | 可查證，不是靠公告                                                                           |
| 任何官方文件都**沒有** SLA 或支援承諾                                                             | MIT 意味著無擔保、無支援義務 → 緩解措施必須**自己持有**                                      |

最後一列決定了處置方式。既然沒有人有義務支援你，唯一有意義的緩解就是
**證明自己隨時可以離開**，而那正是 D2 當初的賭注、以及 R9 說從未被兌現的那張保單。

**處置：`tools/exit-drill`**（詳見該目錄的 README）。

- **靜態模式**跑在每次 gate：驗退出面沒有從兩個設定檔擴大出去
- **完整模式**每季一次：在 `os.tmpdir()` 用 npm 裝**上游** Vite／Vitest，
  產生一份不含 vite-plus 的設定，實際 build 一次、跑一次測試
- 結果寫進 `tools/exit-drill/evidence.json` 並**進版控** ——
  沒有記錄「最後一次何時跑過」的演練不是控制措施，是一段程式碼

**2026-08-15 首次實測結果**：上游 **Vite 8.2.1** 建置成功（123 modules，
產物大小與 vite-plus 建置一致），上游 Vitest **108 個測試全過**，
**應用程式原始碼一字未改**，全程 5 秒（npm cache 溫的情況）。

於是 R1 要談的東西變了：

> 不是「我們押注在一個 beta 工具鏈上」，
> 而是「我們用 beta 工具鏈，退出路徑每季實測，最後一次是 evidence.json 上的日期，
> 退到上游 Vite 可建置、測試全過」。

**仍需組織決定**：beta 版本流的事先核准（不是逐版），以及在供應商紀錄上登記 Cloudflare。

### R6 — D8 的同源中間層

原本卡在一個程式碼回答不了的問題（「你們到底有沒有那一層」）。
處置是改問一個程式碼答得了的問題：**那一層必須做到什麼，才算滿足 D8。**

**先查到一件讓 R6 便宜非常多的事**：`apps/console/dist/index.html` **零個 inline script**。

這代表 **CSP 不需要 nonce**。而不需要 nonce，就不需要一個會**逐次請求改寫 HTML** 的
中間層 —— 那是 nginx 靜態服務、CDN、S3+CloudFront 全都做不到的事，
也是「我們有 gateway」最常見的破功點。組織端的要求因此從
「準備一個會改寫 HTML 的中間層」降到「多送幾個回應標頭」。

這個前提由 `assertStaticCspCompatible()` 在**每次建置**守住
（見 C21）—— 它會靜默消失，所以不能只寫在文件裡。

**處置：三個 package。**

| 位置                    | 角色                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| `platform/bff-contract` | 可執行的**規格**：13 條契約條目、cookie 屬性、CSRF 語意、端點定義   |
| `platform/bff-mock`     | 通過該契約的**參考實作**（`node:http`，零第三方相依）               |
| `tools/bff-check`       | 驗收**執行器**：預設對 mock 跑，設 `BFF_ORIGIN` 就對真實 gateway 跑 |

兩條路徑共用同一套斷言：

- **已有 gateway** → `BFF_ORIGIN=https://gw.internal vpr bff-check`，全綠 ＝ R6 關閉，**零新程式碼**
- **沒有 gateway** → 這份規格就是驗收條件，mock 證明它是可實現的

`XSRF-TOKEN`／`X-XSRF-TOKEN` 兩個名字現在由 `@org/http-client` **從契約 import**，
不再各自定義 —— 前端與中間層對不上的話，每個非 GET 請求都會 403，而且是上線當天才發現。

**契約有牙齒**：逐一破壞 mock 的八個地方（拿掉 `HttpOnly`／`SameSite=None`／
`Path` 限縮成 `/admin`／給 CSRF cookie 加 `HttpOnly`／不檢查 CSRF／登出只清 cookie／
權限不足回 401／不送安全標頭），**每一個都讓對應條目變紅**。

**誠實的限制**：`POST /api/session` 在真實環境是 OIDC 流程的終點，無法自動走完。
所以驗收既有 gateway 時分兩半 —— 行為面用 `BFF_SESSION_VALUE` 帶真實 session 跑，
屬性面用 `BFF_SET_COOKIE_FILE` 貼上 gateway 實際回的 `Set-Cookie`。
把限制寫成兩個 env，比假裝能自動化整條 OIDC 要誠實：後者的下場是那份測試永遠紅著，
然後被人加上 skip。

**mock 不是認證伺服器**，而且刻意讓這條界線很難越過：預設拒絕在
`NODE_ENV=production` 啟動，token 取得那一段連介面都不提供。
腳手架裡一個「看起來很完整」的認證服務會被複製到 production ——
那不是假設，是各種 demo auth server 的實際下場。

**仍需組織決定**：那一層由誰提供、掛在哪。但「要做到什麼」與「怎麼證明做到了」
現在都是可以執行的程式碼，不是一場會議。

---

## R2／R3／R4／R5／R8 調查與處置（2026-08-15）

### 五條是同一個問題

登記簿把它們列成五條互不相干的事。實際上共用一個根因：
**沒有人手上有一份「這個 repo 到底拉了什麼進來」的準確清單。**
於是每一條都被迫用人腦估計，而估計全錯了 —— 錯的方向還都一樣：低估。

| 登記簿原本寫的                       | 實測                                                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| R2「8 個平台原生二進位」             | **121 個**，分屬 **11 個家族**（差 15 倍）                          |
| R2「證據：npm 上的 SLSA provenance」 | 只涵蓋 **89 個**；另 32 個沒有 provenance，**含 TypeScript 7 自己** |
| R3「須鏡像全部 8 個平台包」          | **467 個套件**，其中 19 個在 lockfile 的**第一份 YAML 文件**裡      |
| R4「須另存來源證明」                 | 不必。integrity 與 attestation digest 是同一個數字，綁定即可        |
| R5「須改 `onFail`」                  | **無效**。`onFail` 不是下載的開關                                   |

處置因此不是逐條回應，而是 `tools/supply-chain`：把清單**算出來**，
讓五條各取所需，並讓算出來的東西進版控、有閘門守著。

### R2 — 例外的申請範圍與佐證等級

11 個家族，逐一追到來源：

| 家族                            | 數量 | 來自                       | 授權        | 佐證           |
| ------------------------------- | ---- | -------------------------- | ----------- | -------------- |
| `@voidzero-dev`                 | 8    | vite-plus 本體             | MIT         | SLSA           |
| `@oxlint`／`@oxfmt`             | 38   | oxc-project/oxc            | MIT         | SLSA           |
| `@oxlint-tsgolint`              | 6    | oxc-project/tsgolint       | MIT         | SLSA           |
| `@yuku-parser`／`@yuku-codegen` | 22   | yuku-toolchain/yuku（Zig） | **無欄位**  | SLSA           |
| `@typescript`                   | 20   | microsoft/TypeScript       | Apache-2.0  | **僅發佈簽章** |
| `lightningcss`                  | 11   | parcel-bundler             | **MPL-2.0** | **僅發佈簽章** |
| `fsevents`                      | 1    | fsevents/fsevents          | MIT         | **僅發佈簽章** |
| `@pnpm`／`@reflink`             | 15   | pnpm 自身（見 R5）         | MIT         | SLSA           |

三件事因此改變了要怎麼談：

**一、`@typescript` 與 `lightningcss` 不是 vite-plus 帶來的。** TypeScript 7 自己就是
原生 Go 執行檔。所以要申請的不是「一個 beta 廠商的例外」，而是
**原生編譯工具鏈的政策** —— 一次核准，不是逐廠商申請。

**二、佐證必須分兩級。** 「證據是 SLSA provenance」對 89 個成立、對 32 個不成立。
拿那句話去申請會在覆核時當場破功。分級之後就不能再含糊。

**三、授權不是一句「都是 MIT」。** `lightningcss` 是 MPL-2.0（檔案層級弱著作權，
多數企業政策會標記出來），22 個 `@yuku-*` 在 registry 上**沒有 license 欄位**。
工具刻意**不**從上層套件推斷補上 —— 那等於代發佈者做法律聲明。兩件都要法務點頭。

申請書由 `vpr sca-dossier` 產生，數字全部從 lockfile 推導。**不要手改它**。

補償控制不是宣稱，是閘門實際驗的：467 個套件全帶 sha512、`allowBuilds` 內沒有任何
原生套件（所以那 121 個安裝時不執行任何腳本）、CI 確實傳 `--frozen-lockfile`、
lockfile 的 digest 與擷取當下一致、家族清單進版控且新家族會被擋下。

### R3 — 鏡像清單為什麼不能照著安裝結果列

R3 的失敗模式寫的是「mac 本機裝得起來、CI 的 linux-x64-gnu 直接爆」。
那不是漏了某個套件，而是**在 mac 上觀察到的安裝結果本來就不含 linux 變體** ——
pnpm 只裝符合當下平台的 optional dependency。照 `node_modules` 或 lockfile 的
`snapshots:` 區去列清單，必然只涵蓋列清單那台機器的平台。

所以 `vpr mirror-manifest` 一律讀 `packages:` 區（全平台中繼資料都在那），
輸出 467 筆的 name／version／sha512／平台／批次。閘門另外驗每個工具鏈家族都有
四個目標平台的變體 —— 少一個就紅。

> 四個目標平台裡，`linux-x64-gnu`（CI）與 `darwin-arm64`（開發機）有依據，
> `darwin-x64` 與 `win32-x64` 是**假設**，`vpr airgap` 的輸出裡標著待確認。
> 這份清單不假裝知道團隊用什麼機器。

### R4 — 不必把 attestation 搬過 proxy

登記簿的前半句對：內部 registry 幾乎都只轉發 tarball 與 metadata，
`/-/npm/v1/attestations/…` 這條 npm 專屬端點不會被鏡像。但後半句把問題想難了。

attestation 綁定來源的方式是 digest：

```
attestation.subject[0].digest.sha512   ← tarball 的 sha512（hex）
pnpm-lock.yaml 的 resolution.integrity ← 同一個 sha512（base64）
```

**這兩個是同一個數字的兩種編碼。** 只要 lockfile 的 integrity 沒變，
proxy 送來的就是被 Sigstore 簽署的那一顆。

⚠️ **兩個斷言的覆蓋範圍不同，別合併著講。** 兩者剛好都跟 121 有關：

| 斷言                                               | 涵蓋    | 何時跑      |
| -------------------------------------------------- | ------- | ----------- |
| lockfile integrity ＝ 擷取當下記下的 integrity     | **121** | 每次 gate   |
| 擷取當下的 integrity ＝ attestation subject digest | **89**  | `--capture` |

第二條才是「不必搬 attestation」的論證本體，而它**只涵蓋有 attestation 的 89 個**
（74%）。另外 32 個的補償控制是發佈簽章 ＋ digest 釘選，申請書已照這個分級寫。
把 89 講成 121 會在資安抽驗 `@typescript` 時當場破功 —— 這正是本節在防的事。

處置跟 `tools/exit-drill` 同形狀：擷取要連公網（季度）、驗證不連網（每次閘門）。
擷取下來的是 digest、來源 repo、**確切 git commit**、建置 workflow、builder。

> ⚠️ **代價寫在這裡，別讓人自己踩**：閘門在封閉環境跑得動，代價是
> **升相依無法就地完成**。改 lockfile 與跑 `--capture` 必須在還連得到公網的
> 那一側做完，兩份檔案一起進來。反過來（讓閘門自己連公網補資料）會讓它在
> 最需要它的環境裡失效。這一條要寫進發版流程。

### R5 — 原本的處置是錯的

登記簿寫「須改 `onFail` 或讓內部 mirror 供應 pnpm」。實測四種設法
（每次開乾淨的 HOME、指定尚未快取的 pnpm 版本，再看 pnpm 的 metadata 快取目錄
以哪個 host 命名 —— 那個目錄名就是它真的連到的地方）：

| 設法                           | 涵蓋套件管理器下載？ | 實測                                  |
| ------------------------------ | -------------------- | ------------------------------------- |
| 專案 `.npmrc` 的 `registry=`   | ❌ **否**            | 專案相依走內部位址，pnpm 下載仍連公網 |
| 全域 `~/.npmrc` 的 `registry=` | ✅ 是                | 停在 `GET <內部位址>/pnpm`            |
| `npm_config_registry` 環境變數 | ✅ 是                | 連 tarball URL 都走該 host            |
| `onFail: "error"`／`"ignore"`  | ❌ **否**            | 兩者都照樣下載並 exit 0               |

第一列是最該記的一條：**它會製造一種很難察覺的假象**。團隊照文件在專案裡設好
registry，專案相依確實走內部 mirror（實測會），於是所有人都相信封閉網路沒問題 ——
但 `vp` 的第一步仍往公網連。要到真的斷網那天才會發現，而那天通常是上線日。

另外，pnpm 自身那 19 個套件（`pnpm`、`@pnpm/exe` 與 7 個平台變體、`@reflink`、
`detect-libc`）住在 `pnpm-lock.yaml` 的**第一份 YAML 文件**裡，帶完整 sha512。
它們不在專案的相依樹中，是鏡像最常漏掉的一批 —— 漏掉的症狀不是某個套件裝不起來，
是 `vp` 連跑都跑不起來。清單與驗收方式見 `vpr airgap`。

### R8 — 從「要不要納入範圍」變成「分類已被斷言」

`bingo` 由 `tools/slice-gen` 使用，屬建置期／開發期相依。這個分類原本只是一句話，
現在由閘門斷言：`apps`／`features`／`platform` 之下沒有任何 package 宣告
`bingo` 或 `@org/slice-gen`。納入 SCA 掃描時標 dev-only，與 runtime 相依分開計嚴重度。

（刻意**沒有**為此新增一套 runtime／build 相依的強制分層機制 —— R8 要的是掃描範圍
的答案，不是一個新的架構軸。一條斷言就夠了。）

### 這一輪的閘門有沒有牙齒

逐一破壞七項檢查共**十種情況**，每一種都讓閘門紅在**正確的那一條**上：
移除家族分級／刪掉某平台變體／竄改 integrity／把原生套件加進 `allowBuilds`／
讓 `platform/` 依賴 `bingo`／刪掉 `inventory.json`／刪掉 `provenance.json`／
拿掉 CI 的 `--frozen-lockfile`／把排序換成 `localeCompare`／
在 lockfile 塞進未知家族的原生套件。

### 仍需組織決定

- **資安**：核准原生工具鏈的政策性例外（不是逐廠商）；接受 32 個只有發佈簽章的佐證
- **法務**：MPL-2.0（lightningcss）與 22 個無 license 欄位的 `@yuku-*`
- **平台／IT**：鏡像 467 個套件（清單已產生）；確認 `darwin-x64`／`win32-x64` 是否真的要支援；
  在**機器層級**設 registry，並用 `vpr airgap` 第 4 節的方式驗收
- **發版流程**：把「`--capture` 必須在公網側完成」寫進去

---

## 實作階段的實測修正（步驟 1–5 完成後）

骨架實際建起來並跑通全部閘門後，以下設計細節被**實作打臉並修正**。
每一條都是「照原本寫的做會壞掉」的等級，不是潤飾。

### C1 — D4 第 3 層換了機制

原設計用 oxlint `import/no-relative-parent-imports` 擋相對路徑逃逸。實測發現它太鈍：
它擋掉**所有** `../`，包含 `features/order/src/views/OrderList.vue` 匯入同一個 package 內
的 `../api.ts` —— 那完全合法。開著它等於強迫每個切片變成扁平目錄，
DX 代價高到大家會關掉它，反而製造真正的破口。

需要判斷的是「解析後是否仍在 package 根目錄內」，那要**路徑解析**而非語法比對。
已改為在 `tools/conformance` 精確實作（`checkRelativeEscapes`）。
取捨：失去編輯器即時回饋，換得零偽陽性。

### C2 — typescript-eslint 不支援 TypeScript 7（會讓 Tier 2 完全停擺）

vite-plus 的 catalog 釘 `typescript: ^7.0.2`，而 typescript-eslint 到 **8.67.0（現行最新）**
為止明確拒絕在 TS 7 上啟動，一跑就整個中止：

```
Error: typescript-eslint does not support TS 7.0.
```

追蹤：`typescript-eslint/typescript-eslint#10940`。

**因應**：`@org/eslint-config` 在自己的 dependencies 釘一份 `typescript: 6.0.3`。
pnpm 的隔離式 node_modules 讓 typescript-eslint 的 peer 解析落在該 package 範圍內，
於是它拿到 TS 6、工作區其餘部分仍是 TS 7，互不干擾。

這麼做安全，因為 Tier 2 **只把 typescript-eslint 當語法剖析器**，完全不用型別資訊
（每條安全規則都是純 AST 比對）。剖析器落後一個大版本只影響它認不認得最新語法。

### C3 — vitest 必須與 vite-plus 內部鎖定的版本完全一致

vite-plus 把 vitest 釘死在精確版本（`4.1.10`）。catalog 若用 `^` 範圍或不同版本，
node_modules 會出現兩份 vitest，測試會以難以診斷的方式失敗。**升 vite-plus 要同步改這行。**

### C4 — pnpm 11 的 build script 機制是 `allowBuilds`，不是 `onlyBuiltDependencies`

D6 原文寫「允許清單走 `pnpm.onlyBuiltDependencies`」。pnpm 11 實際使用
`pnpm-workspace.yaml` 的 `allowBuilds`（per-package boolean）。

**閘門實測有效**：首次安裝時 pnpm 直接擋下 `vue-demi` 的 postinstall 並要求明示核准
（`ERR_PNPM_IGNORED_BUILDS`）。

同時確認：**不可**在 `.npmrc` 設 `ignore-scripts=true` —— 那會連允許清單一併封鎖，
使機制失效。

### C5 — 命名撞號：`@org/feature-kit` → `@org/slice-kit`

平台層的契約套件原叫 `@org/feature-kit`，與切片的 `@org/feature-*` 命名撞號，
被自己的邊界規則誤判成跨切片依賴。已改名。

連帶修正：一致性檢查**不再用正則**判斷某依賴是不是切片，改為讀 `features/` 目錄的
實際內容建立名單。正則是猜測（有偽陽性與偽陰性），目錄清單是事實。

### C6 — `erasableSyntaxOnly` 禁用建構子參數屬性

base tsconfig 開了 `erasableSyntaxOnly`，`constructor(readonly x: T)` 這種語法被禁
（它無法只靠移除型別註記轉成 JS）。這個設定是**刻意保留**的：它保證原始碼可被任何
純型別抹除的工具處理（Node 原生 type stripping、oxc、esbuild），不綁死特定編譯器。
`@org/http-client` 的錯誤類別已改為明確欄位宣告。

### C7 — Tier 2 首次執行就抓到自身的 ReDoS

`security/detect-unsafe-regex` 命中骨架自己寫的切片名驗證正則
（`/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`，巢狀量詞 star height 2）。
已改為單層量詞 + 明確邊界檢查（`isValidSliceDir`）。**修程式碼，不是加規則例外。**

### C8 — 「不可繞過的安全閘門」原本沒人叫得動

初版把閘門寫成 `pnpm run gate`，README 也這樣教。實測發現**完全跑不動**：

- 本機無全域 `pnpm`，`vp install` 雖把 pnpm 裝成依賴，但**沒有連結 bin**
- `npx` 會被專案的 `devEngines.packageManager: pnpm` 以 `EBADDEVENGINES` 直接拒絕
- 本機也無 `corepack`

一道沒人叫得動的閘門不是閘門。已改為只依賴腳手架保證存在的東西：
`node` ＋ `node_modules/.bin`（由 `vpr` 放進 PATH）。

連帶發現 **bootstrap 死鎖**：全新 clone 沒有 `node_modules`，也就沒有 `vp`；
而在專案目錄內執行 `npx` 又會被 `devEngines` 擋死。

實測可行的唯一路徑（已在乾淨 clone 上驗證端到端）：

```bash
npx --yes --package vite-plus@0.2.9 vp -C ./project_vite_plus install
```

**必須在專案目錄之外執行**，用 `-C` 指向專案。此點與 R3／R5 相關：
在內部 registry 環境下，這個 bootstrap 抓取是第一個會斷的地方。

### C9 — 已檢視並清空全部 lint warning

先前每次執行都有 3 個 warning 未追查。實查為同一條規則
（`unicorn/no-useless-fallback-in-spread`，`?? {}` 在展開中多餘），規則判斷正確，
已修正程式碼而非加例外。**目前 0 errors 0 warnings**，
故往後任何 warning 都是新的、值得看的。

### C10 — bingo 的 `name` 選項會被內建項目蓋掉

產生器的切片名選項原本叫 `name`。bingo 把 `name` 當作內建的「repository 名稱」
並會從系統自動推斷，自訂同名選項被它覆寫，傳進 `produce` 的值不再是字串。
症狀是深處噴出 `kebab.split is not a function` —— 完全看不出根因。

已改名為 `slice`，並在 `produce` 開頭加一道明確的型別守衛，
讓將來任何選項名撞號都直接說出「該選項名與 bingo 內建撞號，請改名」。

**另一個 CLI 陷阱**：bingo 把 `--opt value` 當成布林旗標。
選項**必須**用 `--opt=value` 形式。

### C11 — `vp create <本機模板>` 以產生器所在目錄為錨點

註冊在 `create.templates` 的本機模板，`--directory` 是相對於**產生器所在的
`tools/`**，不是 repo 根目錄。直接寫 `--directory=shipment` 會產到 `tools/shipment`。

正確呼叫式（已驗證）：

```bash
vp create slice -- --directory=../features/<name> --slice=<name> --title=<顯示名> --team=@org/<team>
```

註：`vp create <template> --directory=...` 這個**外層**的 `--directory` 只支援
內建與 bundled `@org` 模板，本機模板要把它放在 `--` 之後傳給模板本身。

### C12 — 產生器的輸出必須自己就過得了 `vp check`

初版產出的 `package.json` 與 `tsconfig.json` 過不了 oxfmt
（oxfmt 對 package.json 有正規 key 順序，且短陣列收單行）。
「產完切片第一件事是修格式」會很快讓人不信任這個工具。

修法**不是**手工把樣板對齊 formatter 規則 —— 那會隨 oxfmt 版本失效。
改為在 bingo 的 `scripts` 加一道 `vp fmt .`，讓 formatter 自己跑。
key 順序也順手對齊，但那只是為了 diff 乾淨，保證來自那道 fmt。

**另補**：產生器的建議原本漏了「把切片加進 `apps/<app>/package.json` 的
dependencies」。少了這步，下一步的 import 會解析失敗 ——
pnpm 是嚴格 `node_modules`，未宣告的依賴就是 import 不到。已補上。

### C13 — CI workflow 的驗證邊界（誠實揭露）

`.github/workflows/` 的兩個 workflow：

- ✅ YAML 語法已驗證
- ✅ 內部每一道指令都在本機實際跑過
- ✅ 任務快取路徑 `node_modules/.vite/task-cache` 已確認存在（4.5 MB）
- ❌ **workflow 本身未在 GitHub Actions 上執行過** —— 本環境無法執行 Actions

第一次推上去時，預期需要調整的是：

1. **bootstrap 步驟**在內部 registry 下需設 `npm_config_registry`
   與 `NODE_EXTRA_CA_CERTS`（R3／R5）
2. **SBOM 工具**：目前用 Trivy（原生讀 `pnpm-lock.yaml`、可輸出 CycloneDX）。
   若貴組織的 SCA 是 Blackduck／Snyk，這兩步要換 ——
   交付稽核的必須是**稽核認可的那個工具**的輸出

### C14 — 第 3 層的判定是**深度相依**的，這是正確行為但容易誤解

`checkRelativeEscapes` 依路徑解析判定，因此同一個 specifier 在不同深度的檔案
有不同結果 —— 而且**兩種結果都是對的**：

| 來源檔案             | specifier            | 解析結果             | 判定   |
| -------------------- | -------------------- | -------------------- | ------ |
| `src/api.ts`         | `../../billing/x`    | `features/billing/x` | ✗ 逃逸 |
| `src/views/List.vue` | `../../billing/x`    | `<切片>/billing/x`   | ✓ 界內 |
| `src/views/List.vue` | `../../../billing/x` | `features/billing/x` | ✗ 逃逸 |

寫這段的過程本身就是證據：我第一次的反向測試注入了深度不足的 `../../`，
測試「沒抓到」，一度以為測試壞了 —— 其實是**我的測試錯了**，那個 import
確實還在切片內。用正確深度重測，立刻精準命中並印出解析後的完整路徑。

**啟示**：驗證這一層時，注入的違規必須先自己算過解析結果。
「反向測試沒失敗」不一定代表機制壞掉，也可能代表**反向測試本身無效**。

### C15 — 產生器與第 3 層之間原本沒有任何斷言連結

`contract-alignment.test.ts` 驗的是產出的**檔案清單**與 **package.json**，
完全沒有檢查產出的**原始碼**。但產生器會產出
`src/views/<Pascal>List.vue`，裡面就寫著 `from "../api.ts"` ——
正是「從巢狀目錄往上跳」的形狀。

今天安全（見 C14 的表），但沒有任何東西釘住這件事：將來有人在產生器加一層
`src/views/detail/`，就會安靜地產出過不了 Tier 2 的切片，而所有測試全綠。

已補 `tools/slice-gen/tests/boundary-alignment.test.ts`，
用**與 `tools/conformance` 完全相同**的樣式與解析邏輯掃過產生器的每個原始碼輸出。
為此把 `IMPORT_SPECIFIER_PATTERN` 與 `SOURCE_EXTENSIONS` 移進
`@org/slice-kit/contract` 供兩邊共用 —— 各持一份副本就是漂移的開始。

**另補一條治理約定**（寫在 `tools/slice-gen/README.md`）：
`tools/*` 不受切片邊界規則約束，因此沒有任何機制阻止有人從 `slice-gen`
直接 import `conformance` 的內部檔案。那會安靜地重建出 D9 要消滅的
「兩份事實來源」，而測試照樣全綠。**兩者之間唯一合法的通道是
`@org/slice-kit/contract`。**

### C16 — CI 的 action 版本我原本全憑印象寫，且幾乎全錯

只有從 vite-plus 文件抄來的 `actions/cache@v6` 是對的。實查後修正：

| 原本寫的                               | 實際       |                                |
| -------------------------------------- | ---------- | ------------------------------ |
| `actions/checkout@v5`                  | `@v7`      | ✗                              |
| `actions/setup-node@v5`                | `@v7`      | ✗                              |
| `actions/upload-artifact@v4`           | `@v7`      | ✗                              |
| `gitleaks/gitleaks-action@v2`          | `@v3`      | ✗                              |
| `aquasecurity/trivy-action@0.33.1`     | `@v0.36.0` | ✗（連 tag 格式都錯，少了 `v`） |
| `github/codeql-action/upload-sarif@v3` | `@v4`      | ✗                              |
| `actions/cache/restore@v6`             | `@v6`      | ✓（來源：vite-plus 文件）      |

全部已透過 GitHub API 逐一確認 tag 存在。
**教訓**：整份專案每個版本號都查過，唯獨 CI 這段憑印象 —— 而錯誤率是 6/7。

### C17 — CSP 政策必須是資料，而且 dev 就要套用

D11 原本只寫了目標策略字串。實作時把它做成 `@org/security-headers`，
由 **BFF、`vite dev` 中介層、測試**三方共用同一份定義。

理由：政策散在 nginx 設定、Helmet 呼叫、與文件三處的話，三者會在半年內各說各話，
**而且沒有人會發現** —— CSP 放寬是靜默的，症狀只有「某天被滲透測試開單」。

dev 套用 report-only 的效益：violation 在 production 才發現，代價是回滾；
在 staging 發現，代價是一輪部署；在**寫的當下**發現，代價是十秒鐘。

「不得放寬」的性質由測試釘住（無 `unsafe-eval`、`unsafe-inline` 只准出現在
`style-src-attr`、`frame-ancestors`/`base-uri`/`object-src` 為 `'none'`）。
反向測試：往 `script-src` 塞 `'unsafe-eval'` → **4 條測試同時變紅**。

**dev 不注入 nonce**：Vite 的模組載入方式與 production 不同，硬套只會製造一個
假的環境差異。production 的 nonce 由 BFF 注入（D8 已提供該中間層）。

### C18 — D12 的「必須附 codemod」原本沒有任何機制

那是一句寫在文件裡的話，沒有東西會在有人刪掉一個 export 時說話。

已補 `tools/api-surface`：匯入每個 `platform/*` 套件、**列舉實際 export**
（而非解析原始碼 —— 正則會漏掉 re-export 與寫法變體，漏掉就等於檢查靜默失效，
比沒有檢查更糟，因為會給人安全感），與已提交的基準比對。

- 新增 export → 相容，但基準仍須更新（否則下次比對的基礎是舊的）
- **移除或改名 → 失敗**，除非基準已登記對應的 codemod

已接進 `vpr gate` 與 Tier 2 CI。反向測試：拿掉 `@org/security-headers` 的
`buildCsp` → 精準指出並 exit 1。

**已知限制**：只涵蓋執行期的值匯出，`export type` / `export interface` 不在內。
型別的破壞性變更由 tsgolint 在各消費端當場報錯攔下 ——
monorepo 的所有消費端都在同一個 repo，這一點成立。

### C19 — 新工具立刻被自己的安全閘門擋下三次

寫完 `tools/api-surface` 與 `tools/codemods` 後，Tier 2 連續擋下：

1. **`no-unsanitized/method`** — 兩處動態 `import()`。規則是對的（動態 import
   一般是任意程式碼執行的入口）。豁免理由寫在呼叫點：路徑來自本 repo 自己的
   manifest、不接受外部輸入、且是 dev-only 工具。
2. **`security/detect-non-literal-regexp`** — 從變數組 regex。改成字面值（消除，非豁免）。
3. **`security/detect-unsafe-regex`** ×2 —— 先是反向參照（讓正則變成非正規語言），
   再是可選群組包量詞（star height 2）。定版用**交替**取代巢狀量詞。

除了第 1 項是有理由的豁免，其餘全部**改程式碼、不加例外**。

順帶踩到一個 ESLint 細節：`eslint-disable-next-line` **只作用於緊接的下一行**。
把多行說明寫在同一個註解區塊裡，指令會指到註解本身而失效。
說明要拆開放，指令單獨一行貼著程式碼。

### C20 — 閘門的接受分支原本從沒跑過

`api-surface` 的反向測試只證明了**拒絕**路徑（移除 export → exit 1）。
決定「這個移除是否被允許」的**接受**路徑（`removes` 有對應登記 → 放行）
從來沒有被執行過 —— 一個交付給資安團隊的閘門，不該有沒跑過的分支。

已補測：移除 `@org/security-headers#buildCsp` 後，
未登記 → exit 1；登記進 codemod 的 `removes` → exit 0。兩條分支皆已驗證。

**另補一條認知邊界**（寫在 `tools/codemods/README.md`）：
這道閘門保證的是「破壞性變更被看見並經過 review」，**不是「codemod 正確」**。
它只驗證登記存在與檔案存在，一個 `transform: () => null` 的空殼同樣能過關。
這是刻意不再加碼的 —— reviewer 會在同一個 PR 看到 `surface.json` 的 diff 與那個空殼，
而觸發這場 review 正是機制存在的全部目的。用更多程式碼去驗證 codemod 的語意，
是在自動化一件本來就該由人判斷的事。

### C21 — 「CSP 需要 nonce」是被假設的，實測後不成立

D11 從頭到尾假設 production 需要 per-request nonce，因此需要一個會改寫 HTML 的中間層。
**沒有人去看過建置產物。**

實際打開 `apps/console/dist/index.html`：只有 `<script type="module" src>` 與
`<link rel=stylesheet>`，**零個 inline script**。所以 nonce 不需要，CSP 可以是
一行靜態回應標頭 —— 這讓 R6 對組織端的要求整整降了一個量級。

但這是一個**會靜默消失的性質**：有人貼一段分析工具的 inline snippet、
有人加一個注入 inline script 的 plugin，前提就沒了。症狀不是建置失敗，
是上線後 CSP 擋掉自家的 script，然後有人為了讓它動而加上 `'unsafe-inline'`，
整份 CSP 當場歸零。

已改為建置期硬性失敗：`assertStaticCspCompatible()`（`writeBundle` hook）掃描
所有寫出的 HTML，抓 inline script／inline `<style>` 區塊／`on*=` 事件屬性／
`javascript:` URL。錯誤訊息刻意說明的是**組織端成本的變化**，不只是「這裡有 inline script」。

反向測試：往 `index.html` 塞一段 inline script → **建置失敗**。

一半的單元測試在驗它**不會誤報** —— 特別是 Vue 的 `:style` 產生的 style **屬性**
（那受 `style-src-attr` 管，已明確放行）。誤報一次，這個外掛就會被關掉，
結果與沒有它相同。

### C22 — 契約與參考實作放在一起會產生 package 層循環相依

初版把契約測試放在 `platform/bff-contract/tests/`，而測試需要 `@org/bff-mock`，
mock 又依賴契約 —— pnpm 當場警告 `cyclic workspace dependencies`。

修法不是加 alias 或拆常數，是**擺對位置**：契約與 mock 都是 library（`platform/`），
跑驗收的東西是執行器（`tools/`）。移到 `tools/bff-check` 之後相依關係變成
契約 ← mock、契約 ← 驗收器、mock ← 驗收器，無環。

通則：**當既有的分層慣例被違反時，循環相依通常是症狀而不是問題本身。**

### C23 — 退出演練第一次跑就被 `@org/tsconfig` 絆倒

第一次 `--full`，八個測試檔全部 `TSCONFIG_ERROR`：所有 package 的 `tsconfig.json`
都 `extends "@org/tsconfig/*.json"`，而暫存目錄裡沒有那個 package。

修法是把它一併複製過去。這**不弱化**論證：它是四份純 JSON，唯一與工具鏈沾邊的是
`types: ["vite/client"]`，上游 vite 同樣提供。

留這條紀錄的理由是它就是演練存在的意義 —— 把「理論上可以退出」變成**一份實際的步驟清單**。
沒有真的跑過，沒有人會想到這一步。一張沒兌現過的保單，跟沒有保單的差別比想像中小。

### C24 — 兩處文件與實際不符（都是抄來的預設值）

**`.npmrc`** 寫著「允許清單在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`」。
那是 pnpm 10 的欄位名，本專案用 pnpm 11 的 `allowBuilds`（C4 就修過程式碼，
但這行註解沒跟著改）。在 pnpm 11 上寫 `onlyBuiltDependencies` 會被**靜默忽略**，
也就是供應鏈允許清單失效 —— 一條錯的註解在這裡的代價不是困惑，是漏洞。

**R2 的二進位大小**原寫「各約 41 MB」。實測：darwin-arm64 解壓後 40 MB、
linux-x64-gnu 32.0 MB。已改為「32–40 MB」。申請 SCA 例外時數字要對得上。

### C25 — 三處文件宣稱 BFF 已經存在，而 R6 說它不存在

`platform/security-headers/src/vite-plugin.ts`、`apps/console/vite.config.ts`、
以及 D11 的條列，都寫著「nonce 由 D8 的 BFF 注入」「D8 已提供該中間層」。
**D8 沒有提供任何中間層** —— R6 正是在講它不存在。

這是 C17 說要消滅的失敗模式**又發生了一次**，而且是發生在描述 C17 成果的那份程式碼旁邊。
成因不難理解：D8 決定了「要有 BFF」，寫註解的時候就順手當成「有 BFF」了。

三處皆已改為指向實際狀態（C21 的結論：不需要 nonce；R6 的處置：契約 + 參考實作）。

**通則**：決策文件裡的「應該有 X」與程式碼註解裡的「X 會處理這件事」之間，
只隔一次順手。定期拿風險登記簿去對照程式碼註解，比再寫一條規則有用。

**而且它在同一輪又發生了第三次。** `tier2-security.yml` 的退出面檢查，
註解寫著「這個旗標只在時間觸發的 workflow 裡加 —— 在 PR 上因為日曆翻頁而擋人，
那種閘門會先被繞過再被忽略」，但那個 workflow 的觸發條件包含 `pull_request`，
而該步驟**沒有 `if:`** —— 也就是它正在做註解說要避免的那件事。
已改為兩個步驟，用 `github.event_name` 分流。

**再一次的通則**：斷言「這裡不會發生 X」的註解，要立刻回頭確認檔案真的不會 X。
YAML 特別容易犯 —— 條件寫在觸發區塊、行為寫在步驟，兩者離得夠遠，
遠到腦袋會自己把它們接起來。

### C26 — `pnpm-lock.yaml` 是**兩份** YAML 文件，第一版少算了 96%

`tools/supply-chain` 的第一版用 `lines.indexOf("packages:")` 找區段，
回報「本專案有 19 個套件」。實際是 467 個。

原因：`pnpm-lock.yaml` 用 `---` 分成兩份文件，各自有完整的
`importers:`／`packages:`／`snapshots:`。第一份是**套件管理器自身**的鎖
（`packageManagerDependencies`：`pnpm`、`@pnpm/exe` 與其平台二進位、`@reflink`），
第二份才是專案的。`indexOf` 找到的是第一份。

這個錯誤的可怕之處在於**輸出看起來完全正常** —— 19 個套件、格式漂亮、
沒有任何警告。一份少算 96% 的供應鏈清單比沒有清單更危險：它會被當成完整的
拿去申請例外。

修法是掃出**所有**同名區段再合併，並把文件序號留在每一筆資料上。
後者不只是為了正確：第一份文件就是 R5 的實體證據，鏡像時要單獨拉出來。

順帶抓到 `detect-libc@2.1.2` **同時出現在兩份文件裡**。若只記一個文件序號，
它會被標成「套件管理器的相依」，平台團隊照那個標記分批鏡像時，專案那批就會漏掉它。

### C27 — R2 的「8 個原生二進位」實際是 121 個，分屬 11 個家族

差 15 倍。而且「8」不是筆誤 —— 它是 `vite-plus` 的 `optionalDependencies` 數量，
抄得沒錯，只是**抄的是錯的東西**。實際進到建置環境的還有：
`@oxlint` 19、`@oxfmt` 19、`@typescript` 20（TypeScript 7 自己是原生執行檔）、
`@yuku-parser`／`@yuku-codegen` 各 11（vite-plus-core 用的 Zig parser）、
`lightningcss` 11、`@oxlint-tsgolint` 6、`fsevents` 1，以及 pnpm 自己那 15 個。

判定條件也是個陷阱：只看 `cpu` 欄位會漏掉 `fsevents`（只宣告 `os: [darwin]`）。
要 `cpu` **或** `os` **或** `libc` 取聯集。

這是 C17／C24／C25 的第四次同型錯誤：**人抄下來的數字沒有人再推導一次**。
修法也一樣：讓數字由 lockfile 推導、基線進版控、變動擋下來。

**而且這一輪順手又抓到第五次。** 交叉核對時發現 `README.md` 與本檔都寫著
「12 條契約條目」，而 `CONTRACT_ITEMS` 是 13 —— 上一輪加了 `session-cookie-path`，
文件沒跟上。**上一次也是手改的數字**，所以這次沒有再手改一遍了事：
`tools/bff-check` 多了一條測試，比對 `platform/bff-contract/README.md` 的條目表
與 `CONTRACT_ITEMS`（雙向：README 少列會紅，多列不存在的條目也會紅，兩者都實測過）。

**通則**：同一個數字在文件裡出現第二次的時候，就該讓機器去數它。
「這次改對就好」在這份 repo 已經失敗五次了。

### C28 — SLSA provenance 只涵蓋 121 個裡的 89 個

R2 寫「證據：npm 上的 SLSA provenance attestation」。逐一取回 121 個套件的
attestation 後：**89 個有，32 個沒有**。沒有的那 32 個是全部 20 個
`@typescript/typescript-*`、11 個 `lightningcss-*`、以及 `fsevents` ——
它們只有 npm 的發佈簽章，可驗發佈者但**無法回推建置來源**。

也就是說原本那句話對 74% 成立。拿它去申請例外，會在資安覆核第一次抽驗
`@typescript` 的時候當場破功 —— 而 TypeScript 恰好是最可能被抽到的那個。

修法是佐證分兩級、申請書分兩段寫。順帶記下一個實作陷阱：npm 對每個套件都會
附一份 publish attestation（`predicateType` 是 npm 自己的規格，不是 SLSA）。
把它也算成 provenance 的話，89 會變成 121，而申請書就成了假的。

### C29 — R5 的處置寫錯了：`onFail` 與專案 `.npmrc` 都無效

登記簿寫「封閉網路須改 `onFail` 或讓內部 mirror 供應 pnpm」。實測（每次開乾淨的
HOME、指定尚未快取的 pnpm 版本，再看 pnpm 的 metadata 快取目錄以哪個 host 命名）：

- `onFail: "error"` 與 `"ignore"` —— **兩者都照樣把 pnpm 抓下來並 exit 0**。
  它不是「要不要下載」的開關
- 專案 `.npmrc` 的 `registry=` —— **不涵蓋套件管理器下載**。快取目錄仍是
  `registry.npmjs.org`，而同一次執行裡專案相依確實走了設定的內部位址
- 全域 `~/.npmrc` 與 `npm_config_registry` 環境變數 —— **有效**

第二項是最該記的：它會製造一種很難察覺的假象。團隊照文件在專案裡設好 registry，
看到專案相依都走內部 mirror，於是相信封閉網路沒問題 —— 但 `vp` 的第一步仍在往
公網連。要到真的斷網那天才會發現。

**通則**：「設定 X 之後就走內部來源了」這種結論，要驗的是**每一個會發網路請求
的階段**，不是最顯眼的那個。工具鏈自我啟動的那一步最容易被跳過，因為它跑得太快、
而且成功時完全不出聲。

### C30 — `localeCompare` 讓進版控的摘要隨執行環境漂移

`inventory.json` 的陣列順序進版控，`nonNativeDigest` 直接算在排好序的字串上。
第一版用 `.sort((a, b) => a.localeCompare(b))` —— 不帶 locale 參數時它吃執行
環境的預設語系與 ICU 版本。同一份 lockfile 在開發機與 CI 上可能算出不同順序、
不同摘要，閘門報「基線漂移」而實際上什麼都沒變。

這種紅燈最傷：它不是抓到問題，是**教人忽略這道閘門**。改用 UTF-16 碼元比較，
與平台語系無關。

同一輪還有一個同類問題：`inventory.json` 也在 oxfmt 的範圍內，而它排版 JSON 的
方式與 `JSON.stringify(…, null, 2)` 不同。基線原本比對位元組，於是任何人跑一次
`vp check --fix` 都會讓閘門變紅、而紅的原因是換行位置。改成比對**解析後的內容**。

**通則**：任何進版控的衍生檔案，都要問「兩台不同的機器跑出來會不會不一樣」。
排序的在地化、JSON 的排版、路徑分隔符、時區 —— 這些都會讓閘門在錯的理由上變紅，
而在錯的理由上變紅的閘門，壽命通常不超過兩週。

### C31 — 兩個「看起來很權威的錯數字」，在同一輪被抓到

**一、mirror 容量寫成 0.0 MB。** 申請書要給平台團隊一個容量估計，
第一版用 HEAD 請求取 tarball 的 `content-length`。npm 的 tarball 走 Cloudflare，
而它**只在 GET 回應帶 `content-length`，HEAD 不帶**。結果 121 筆全部記成 0，
申請書印出「全部原生二進位：tarball 合計 **0.0 MB**」。

改用 range 請求（`Range: bytes=0-0`）從 `content-range: bytes 0-0/<total>` 讀總長，
只下載一個位元組。並且**取不到就中止擷取** —— 記成 0 會安靜地污染容量估計，
而「一個沒有人再推導一次的數字」正是這支工具存在的理由。實際數字是
tarball 合計 856 MB、解壓後 2341 MB（前者是 mirror 要存的，後者是 `node_modules` 佔的）。

**二、把 89 講成 121。** R4 的文件寫「對全部 121 個原生套件逐一驗過，0 個不符」。
實際上那裡有**兩個覆蓋範圍不同的斷言**，只是剛好都跟 121 沾邊：

- lockfile integrity ＝ 擷取當下記下的 integrity → **121 個**，每次 gate 都跑
- 擷取當下的 integrity ＝ attestation subject digest → **89 個**，只有有 attestation 的能比

第二條才是「不必搬 attestation」的論證本體，覆蓋率 74%。四處文件都寫成 121，
而它會在資安抽驗 `@typescript`（那 32 個之一）時當場破功 —— C28 才剛講完同一件事。

**通則**：一個數字在論證裡出現兩次，先確認那**真的是同一個集合**。
「都是 121」比「兩個不同的數字」更容易矇混過去，因為它讀起來一致。

### C32 — workflow 首次在 GitHub Actions 上執行，抓到三件本機看不到的事

C13 老實寫過「workflow 本身未在 Actions 上執行過」。2026-08-15 推上公開 repo 後
首次實跑：**Tier 1 一次就綠，Tier 2 紅**。三個問題，沒有一個能在本機發現：

**一、`./node_modules/.bin/vitest: No such file or directory`（exit 127）。**
根 `package.json` 從來沒宣告 `vitest`，而 `.npmrc` 設了 `node-linker=isolated` ＋
`hoist=false` —— 乾淨安裝**不會**在根 `.bin` 建立它。本機之所以跑得動，是因為
早期某次安裝留下的 symlink 一直沒被清掉。**CI 是對的，開發機是髒的。**
修法是把 `vitest: "catalog:"` 正式宣告進根 devDependencies，
而不是改成走 `vp run`（D2 要求安全閘門不得依賴可替換的驅動層）。

**二、SARIF 上傳步驟用 `if: always()`，在前面步驟被「跳過」時也會觸發。**
註解寫的意圖是對的（「即使發現漏洞而失敗，仍要上傳結果」），但 `always()`
不分「失敗」與「跳過」。實際發生的是：BFF 那步 127 → 掃描步驟被跳過 →
`trivy.sarif` 不存在 → 這一步也紅。**兩條紅訊息，只有一個真的問題**，
而蓋在上面的那條會把人帶往錯的方向。改成 `always() && hashFiles(...) != ''`。

**三、一個早就該刪掉的步驟，還在寫著已被推翻的數字。**
「留存 vite-plus 的 provenance 證明」那一步的註解寫著
「vite-plus 有 8 個平台的原生二進位（各約 41MB）」—— 兩個數字**都已經在
C24 與 C27 更正過**，這是同型錯誤的第六次。而且那個步驟本身也過時了：
它每次 CI 重抓一份 `provenance.json`（等於沒有基線）、只涵蓋 vite-plus 一個套件、
而且檔名與 `tools/supply-chain/provenance.json` 撞名但內容完全不同。整段移除。

**通則**：`if: always()` 幾乎總是比作者想的範圍大。它涵蓋的是
「失敗 ∪ 跳過 ∪ 取消」，而註解裡寫的通常只有第一種。要「即使前面失敗也做」
就得把前提也寫進條件（檔案存在、上一步真的跑過），否則它會製造第二條紅訊息，
而第二條會蓋掉第一條。

（另外一條 annotation：`retention-days` 超過方案上限會被**靜默調降**並只留一行提示。
`exit-drill.yml` 原本寫 400，實際只有 90。長期證據本來就是進版控的 `evidence.json`，
artifact 只是方便下載，已對齊上限。）

### C33 — SBOM 產出了、上傳了、全綠，而裡面有 **0 個 component**

C32 的三個問題修完後 Tier 2 全綠。下載 artifact 一看：`sbom.cdx.json` 只有 **578 bytes**，
`components` 陣列是**空的**。同一份 `pnpm-lock.yaml`，`tools/supply-chain` 數出 467 個套件，
Trivy 回報 0 個。

原因在 Trivy 輸出的第二行 —— 一行 `INFO`，不是警告：

```
INFO  Suppressing dependencies for development and testing.
      To display them, try the '--include-dev-deps' flag.
INFO  Number of language-specific files  num=1
```

它**讀到了** lockfile（`num=1`），然後把整棵相依樹當成 devDependency 抑制掉。
對一般應用專案那是合理預設。**對腳手架則是災難性的** —— 這個 repo 的工具鏈
本來就全是 dev 相依，而 R2／R3／R8 談的 121 個原生二進位正是它們。

後果不是「掃描漏了一些東西」：

> **D13 的「critical 3 天／high 14 天」修補 SLA，由一個掃描 0 個套件的閘門把關。
> 它結構上永遠不可能變紅。**

而且沒有任何一處會告訴你。綠燈、artifact 上傳成功、SARIF 上傳成功，
稽核收到一份**看起來完全正常的空 SBOM**。這是整個專案裡最危險的一個缺陷，
而它是在**全綠**的狀態下被找到的 —— 靠的是去看 artifact 的大小，不是看閘門的顏色。

**修法有兩層，缺一不可：**

1. `TRIVY_INCLUDE_DEV_DEPS=true`（兩個 Trivy 步驟都要）—— 修掉今天這個症狀
2. `vpr supply-chain --verify-sbom sbom.cdx.json` —— 修掉**這一整類**問題。
   比對 SBOM 的 component 數與 lockfile 的套件數：兩個獨立來源數同一份檔案，
   差超過一半就是有一邊瞎了。空的直接紅。
   （反向測試：0 個 → 紅、100 個 → 紅、467 個 → 綠、檔案不存在 → 紅，四種都跑過。）

只做第 1 項是不夠的：換掃描器、升版改預設值、lockfile 格式變動、掃描路徑寫錯 ——
每一種都會讓掃描器再度看不到套件，而每一種都會以綠燈呈現。

**通則**：閘門的顏色只證明它跑完了，不證明它看到了東西。
**凡是「掃描 N 個目標」的步驟，都要斷言 N > 0，而且 N 要跟一個獨立來源對得上。**
這個 repo 一路在講「綠燈不證明機制有效」，而這次的綠燈連掃描對象都沒有。

### C34 — Trivy 只讀 `pnpm-lock.yaml` 的**第一份** YAML 文件（＝ C26 的陷阱，換一個受害者）

C33 加上 `TRIVY_INCLUDE_DEV_DEPS=true` 之後，SBOM 從 0 個變成 **20 個** component。
還是遠低於 467。把 artifact 下載下來看內容，答案一目了然：

```
pnpm-lock.yaml（metadata）
exe@11.21.0            linux-arm64@11.21.0     linux-x64@11.21.0
linuxstatic-arm64      linuxstatic-x64         macos-arm64
win-arm64              win-x64                 reflink@0.1.19
reflink-darwin-arm64 … reflink-win32-x64-msvc  detect-libc@2.1.2
pnpm@11.21.0
```

**這 19 個正是 lockfile 第一份文件的全部內容** —— 套件管理器自身的鎖。
專案的 449 個套件（第二份文件）**一個都沒有**。

也就是說 Trivy 0.70.0 的 pnpm parser 對多文件 lockfile 只解第一份。
這正是 **C26** 記錄的那個陷阱：本工具第一版用 `indexOf("packages:")` 找區段，
回報「本專案有 19 個套件」。**同一個檔案、同一個錯誤答案、不同的工具。**

pnpm 在支援 `packageManagerDependencies` 之後才產生這種兩文件格式，
下游工具顯然還沒跟上。這不是設定問題，是**掃描器讀不到這個專案的 lockfile**。

**假設用實測確認過，不是推論。** 開一個一次性 workflow，同一份 lockfile 掃兩次
（run `31866799854`，已刪除該 workflow）：

```
A 原樣（兩份文件）  : 20
B 只留第二份文件    : 450
```

**修法：`vpr supply-chain --split-lockfile <dir>`**，把每一份 YAML 文件
**位元組無損**地寫成獨立的 `pnpm-lock.yaml`，各放一個子目錄；掃描器掃父目錄
就兩份都看得到。修完的實測結果：**`✓ SBOM：470 個 component（lockfile 467 個）`**。

刻意**不合併**成單一文件：合併要動 `packages:`／`snapshots:`／`importers:` 三個區段，
而一個寫錯的合併會安靜地產出一份**錯的** SBOM —— 那正是這整套機制要防的東西。
切割是無損的，合併不是。五條單元測試釘住（含「對真實 lockfile 拆出 19 + 449」）。

**這件事的份量**：如果沒有 C33 那道 `--verify-sbom` 斷言，這次會是**全綠**的 ——
20 個 component 的 SBOM 看起來完全正常，沒有人會去數它。而 D13 的修補 SLA
會由一個只看得到 pnpm 自己 19 個套件的掃描器把關。

**兩層修法各自的價值在這裡看得最清楚**：`TRIVY_INCLUDE_DEV_DEPS` 把 0 變成 20
（症狀改善、問題還在，而且更難發現）；`--verify-sbom` 才是真正擋下它的那一道。
**只修症狀會讓問題從「明顯」變成「隱蔽」。**

**通則**：工具鏈的檔案格式演進時，先問「下游還讀得懂嗎」。
lockfile、SBOM、attestation 這類**給機器讀的中介檔**最容易出這種事 ——
產生端升級了，消費端安靜地少讀一半，而兩邊都不會報錯。

### C35 — D14 做完後主動去對照文件，抓到三處，其中一處比 D14 更早

這個 repo 在「文件說 X、程式碼是 Y」上已經栽了五次（C17／C24／C25／C27／C31）。
所以 D14 落地後沒有直接宣告完成，而是回頭拿切片的 README 去對照實際結構：

**一、`features/order/README.md` 宣稱一條被刻意否決的機制。**
它寫「第 3 層：oxlint `import/no-relative-parent-imports`」，而
`vite.config.ts:55` 明寫著「**這裡刻意不用** `import/no-relative-parent-imports`」——
理由是那條規則會擋掉所有 `../`（包含同 package 內完全合法的 `../api.ts`），
偽陽性高到大家會關掉它。真正的第 3 層是 `tools/conformance` 的精確路徑解析。

**這一處與 D14 無關，它從一開始就是錯的。** 而且錯的方向最糟：它告訴讀者
有一道實際上不存在的防護，同時掩蓋了真正存在的那一道。
有趣的是**產生器的模板寫的是對的** —— 是 `order` 這個手寫的參考切片
（實作順序第 5 步）從未跟模板同步過。

**二、兩份切片 README 的結構表都沒有 `src/composables/`。** D14 造成。
開發者讀 README 會以為取數該放 `api.ts` 或元件裡 —— 而那正是閘門現在會擋的寫法。

**三、產生器的 README 模板根本沒有結構章節。** 所以每個新產生的切片，
它的 README 都不會告訴你東西該放哪。D14 在程式碼裡補上的那一層，
在開發者最先讀的那份文件裡完全不存在。

三處都已修正，`shipment` 的 README 直接由修好的模板重新產生。

**通則**：改了結構之後，要主動去讀「新人會先讀的那份文件」。
C17–C31 那五次都是被動發現的（做別的事時撞到）；這一次是主動去找，
成本是十分鐘，而第一處已經在那裡誤導人不知道多久了。

**還有一件沒做的**：這一類漂移目前**沒有機器在守**。`tools/bff-check` 有一條
比對 README 表格與 `CONTRACT_ITEMS` 的測試（C25 那輪加的），但那是因為
契約條目是可枚舉的資料。切片 README 的結構表是散文，同樣的機器檢查做不出來
而不勉強做 —— 記在這裡，是為了讓下一個人知道這裡目前只有人工紀律。

### C36 — 退出演練會在「最不能出錯的那一天」才露出假綠燈

問「這個腳手架的 CSS 框架能不能換」時撞到的，跟 CSS 沒有關係。

`tools/exit-drill --full` 不是拿 `apps/console/vite.config.ts` 去跑 —— 那份設定
`import` 了 vite-plus，而整場演練的重點就是不要它。演練的做法是先
**刪掉**那份設定（`cli.ts:241`），再**重新產生**一份。於是 plugin 清單變成
寫死在腳本裡的一行：

```
plugins: [vue()]
```

而 `apps/console/vite.config.ts` 實際註冊了**三個**。

這個洞今天不痛，因為另外兩個（`securityHeaders`、`assertStaticCspCompatible`）
一個是 dev server 中介層、一個是檢查而非轉換，丟掉都不改變產物。
**但這是巧合，不是設計。** 只要有人加一個會改變產物的 plugin ——
CSS 框架、圖片處理、i18n 訊息編譯、SVG 元件化——演練就會：
產生一份沒有它的設定 → 建置成功 → exit 0 → 寫下 `result: "pass"`。

產物是錯的，而 `evidence.json` 說它是對的。**這件事只有在真的要退出
vite-plus 那天才會被發現**，也就是最不能出錯的那一天；而那份證據正是
拿去給採購與稽核看的東西（R1 的整個論證建立在它上面）。

C33／C34 的同一條教訓，第三個受害者：**閘門的顏色只證明它跑完了，
不證明它看到了東西。**

**處置**：`tools/exit-drill/src/plugins.ts` —— 每個出現在退出面設定檔裡的
plugin 都必須登記在兩張表之一，判準只有一條：**它會不會改變建置產物？**

- `DRILL_PLUGINS` → 演練真的裝它、真的註冊它。設定檔的 import、plugin 呼叫、
  合成 `package.json` 的相依三處**全部由這張表推導**，不是各寫一份 ——
  分開寫的話總有人只改到一邊，而少一個 plugin 的建置不會報錯。
- `DROPPED_PLUGINS` → 明確寫下丟掉它為什麼不影響產物。

沒登記的一律 exit 1，訊息直接給二選一的判準。兩張表都在原始碼裡，
因此都要走 PR —— 這一格的判斷本身就是退出保證的內容。

**兩個實作上的坑，都是「安靜地錯」那一類**：

一、**只掃第一個 `plugins: [` 是錯的**。根目錄 `vite.config.ts` 裡
`lint: { plugins: ["import", …] }` 排在前面，`.exec` 會停在那裡；
日後有人在同一份檔案加上真正的 vite plugins 陣列，這道檢查會完全看不到它。
改成掃過**每一個**命中（oxlint 那個裝的是字串、後面不接 `(`，本身不誤報）。

二、**只認陣列第一層是錯的**。Vite 接受 `plugins: [[a(), b()], vue()]`，
卡死在第一層等於「把新 plugin 包一層方括號就能繞過整道閘門」。
改成只要在陣列內即可，靠括號與大括號深度排除參數。

**驗證**：21 支測試 —— 7 條「應該抓到」、**7 條偽陽性守衛**（行註解與區塊註解裡
提到的 plugin、字串裡長得像呼叫的內容、參數裡的巢狀函式、`...base` 展開、
oxlint 的字串陣列、沒有陣列時回空——都不可觸發）、5 條閘門本身、2 條對真檔案。
外加拿**真的 `apps/console/vite.config.ts`** 端到端演一次：加一個未登記的
plugin → 紅；包一層巢狀陣列想繞過 → 一樣紅；還原 → 回綠。

**通則**：任何「重新產生設定再跑一次」的驗證機制，都必須對「原本那份設定裡
有什麼」做帳。重新產生的東西天生會漏掉來源端的新增，而漏掉的後果是綠燈。

**修完之後順手重跑 `--full`，又撞到一件事，記在這裡**：演練的成績
（「86 個測試全過、耗時 4 秒」）被**手抄在三份文件的 10 個位置**，
而 `evidence.json` 裡只有 `result` 與 `durationSeconds`，沒有測試數。
這次重跑是 98 個測試、17 秒，於是那 10 處同時變成錯的。

這是 C17／C24／C25／C27／C31 的第六次：**人抄下來的數字沒有人再推導一次。**
而且它保證還會再發生 —— 每季跑一次演練就會再錯一次。

十處已改正，而且這一次**補上了機器守衛**。與 C35 的散文表格不同，這一項是
可枚舉的：演練現在把 `tests` / `testFiles` 寫進 `evidence.json`，靜態檢查
再拿三份文件去對，不一致就 exit 1（`tools/exit-drill/src/counts.ts`）。

**做這道守衛的過程本身抓到兩個 bug，兩個都是「安靜地錯」那一類**：

**一、vitest 即使輸出到 pipe 仍然上色。** 第一版撈不到摘要行，而印出來看
「明明就在那裡」—— 因為 `\u001B[2m      Tests \u001B[22m…` 的色碼終端機會吃掉。
真正發現它的不是眼睛，是那條「撈不到就當成失敗的一步」的守衛：它拒絕寫下
`tests: 0` 的假通過。**如果當初圖方便寫成 `?? 0`，evidence.json 會出現一份
「通過，0 個測試」的證據 —— 看起來完全正常，而它要拿去給稽核。**

剝色碼時刻意不把 ESC 寫進正則字面值（會觸發 `no-control-regex`）：
為了一行工具程式去關掉一條 lint 規則，是在替後來的人降低那條規則的可信度。
改成先用 ESC 切段、再比對 CSI 前綴。

**二、同一個講法在文件裡有兩種用途。** 「N tests 全過」既是演練的成績，
也是 `vp run -r test` 的成績（232）。第一版沒分辨語境，於是這道閘門
**從第一天起就對著驗證表那一列亂叫** —— 它是被自己的測試抓到的，不是被人看出來的。

分辨方式是「同一行要提到**上游**」（演練的說法一律是「退到上游 Vite／上游 Vitest」）。
取捨寫在程式碼裡：沒寫「上游」的成績會被漏掉，換來零誤報 ——
與 `vite.config.ts:55` 對 `import/no-relative-parent-imports` 做的取捨相同。
真正的保險是另一支測試：**三份文件若全都不再引用，它會紅**，
否則這道閘門會退化成「什麼都沒看到所以通過」。

### C37 —「這個應用怎麼上樣式」從來沒有被決策過

被問到「目前是不是 Tailwind + shadcn」時發現的。答案是**兩個都沒有**，
而且不是「先用預設值、之後再說」——`DECISIONS.md` 裡所有 `css` 的命中
全部是 `lightningcss`（一個遞移進來的原生二進位），**沒有一條**是關於樣式的。

D13 決定了 router、狀態、i18n、資料取用；D5／D10／D11 決定了安全與 CSP；
D6 決定了套件治理。樣式從頭到尾沒有人決定過。目前的做法是
`<style scoped>` 手寫，全部建置產物加起來 **362 bytes**。

**已於 2026-08-15 決策，見 D15。** 以下保留當時的問題描述。

這對一個以「團隊可復用」為目標的腳手架是個實質空白：第一個接手的團隊
會各自發明一套，而那件事發生之後就回不去了。**這是選型決策，需要人裁決**，
已列為交接清單第 14 項。

為了讓裁決的人不必從零開始，先把技術面查到底（2026-08-15 實測，非推測）：

| 問題                           | 實測結果                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `@tailwindcss/vite` 跑不跑得動 | **跑得動**。`vp build` exit 0，產出 4.42 kB CSS                                                               |
| 真的有編譯還是空跑             | 三個探針 utility 全部出現在產物；**未使用的 utility 不在** —— 掃描確實有選擇性                                |
| 新增多少套件                   | npm 平面樹、darwin-arm64：**+15、0 移除**（換算到 lockfile 會更多，見下）                                     |
| 要不要開 `allowBuilds`         | **不用**。全樹遞迴掃過 143 份 `package.json`，零個 pre/post/install script                                    |
| 新的原生二進位家族             | `@tailwindcss/oxide` 有 **12 個平台套件** → 家族數 11 → 12                                                    |
| `lightningcss` 會不會撞        | **會，而且無法合併**：`@tailwindcss/node` 釘死 exact `1.32.0`，vite-plus-core 要 `^1.33.0`。實測樹裡 4 份並存 |

最後一列的後果落在法務身上：交接清單第 4 項現在寫「MPL-2.0：`lightningcss-*`
11 個」，導入 Tailwind 之後會變成**兩個版本各一組**。

**另外撞到一件與 Tailwind 無關、但值得記下來的事**：測試專案用 npm 安裝時
直接 ERESOLVE 失敗 —— `@vitejs/plugin-vue` 宣告 `peer vite: ^5||^6||^7||^8`，
而 catalog 把 `vite` alias 成 `@voidzero-dev/vite-plus-core@0.2.9`，
**在整個生態的 peer range 眼裡，這個 repo 的 vite 版本就是 0.2.9**，
對不上任何一個主流 Vite plugin 的宣告。

本 repo 沒事，是因為 `pnpm-workspace.yaml` 的 `peerDependencyRules.allowAny: [vite]`
把整條 peer 檢查關掉了 —— 那幾行不是樣板，**它是這個 alias 能成立的唯一原因**。
換句話說：任何未來要導入的 Vite plugin，都要靠這條豁免才裝得起來，
而它同時也讓「plugin 宣告的 vite 版本相容性」在這個 repo 裡完全失去意義。
真正的相容性只能靠實測 —— 就像這次這樣。

### C38 — D15 實作：同一種「建置成功但產物是壞的」出現了**三次**

導入 Tailwind 的過程中，有三次建置退出碼是 0、而產物是錯的。三次的形狀完全一樣，
只是原因不同 —— 這說明 C36 抓到的不是單一 bug，是一個**類別**。

| #   | 原因                                         | 症狀                                                             | 被誰抓到                                     |
| --- | -------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| 1   | `@tailwindcss/vite` 沒登記在 `DRILL_PLUGINS` | 退出演練產出完全沒有樣式的應用                                   | C36 的 plugin 帳目（**在寫程式之前就擋下**） |
| 2   | 樣式入口沒宣告 `@source`                     | CSS 從 160 → **4409 bytes，裡面零個 utility**（全是 base reset） | 探針比對，**不是**建置紀錄                   |
| 3   | `@source` 用固定相對路徑                     | 演練把 package 搬到 `packages/ui/` 後掃不到切片，樣式少一整層    | 退出演練的測試                               |

**第 2 個最值得記住：CSS 檔案「變大了」不能當作它有在編譯的證據。**
那 4.4 kB 全是 Tailwind 的 base reset —— 一個把畫面重設成無樣式的 reset。
加上 `@source` 之後同一份程式碼產出 12.25 kB，探針才開始命中。

### 因此退出演練現在會比對產物

`compareArtifacts()`：建置完成後，比對演練的 `dist` 與**本 repo 自己的 `dist`**
的 CSS 位元組總量，低於 80% 就算失敗。這是 C33 的同一條規則 ——
**任何「掃了 N 個目標」的步驟都要對著一個獨立來源斷言 N > 0。**

反向測試（拿掉 `@source` 重跑）：**37%，紅**，訊息直接指出兩個最可能的原因。

**但要誠實說出它抓不到什麼**：把 `@source` 換回固定路徑時，比對顯示 **96%，綠** ——
因為切片只貢獻約 4% 的 CSS。那一次是被 `platform/ui/tests/styles.test.ts` 抓到的。
**分層防禦有用，單一閘門沒有一個抓得完。** 門檻用 80% 而不是相等，
是因為要求相等會讓它在無關的變動上變紅，然後被人加上 skip。

### 退出演練的第三份硬編碼清單

C36 修掉了 plugin 清單，這次輪到**執行期相依**：演練的合成 `package.json`
把 vue／vue-router／pinia／vue-i18n／@tanstack/vue-query 列死。
`@org/ui` 帶進 reka-ui／clsx／tailwind-merge 之後，演練炸在
「Rolldown failed to resolve import "clsx"」。

改成**從 `apps/console` 沿 workspace 連結走圖**推導。中間踩了一步：
第二版改成「掃所有 platform/ 與 features/」，結果把 `@org/eslint-config` 的
`typescript-eslint` 也裝了進去 —— 它宣告 `peer typescript >=4.8.4 <6.1.0`，
對上本 repo 的 TypeScript 7，npm 直接 ERESOLVE。**那個 package 演練根本用不到。**

還有兩個相關的修正：

- **`--silent` 連錯誤訊息也吞掉。** 安裝失敗時只看得到「✗ npm install」與 0 秒，
  完全無從查起。改成 `--loglevel=error`。
- **alias 不該過濾副檔名。** 原本只 alias `.ts/.js/.mjs`，於是 `@org/ui` 的
  `./styles.css` 子路徑被丟掉，建置炸在
  「Could not load .../index.ts/styles.css」—— 一個完全看不出病因的訊息。

### 三個「工具誤報在自己身上」

同一輪裡出現三次，值得並排看：

1. **一致性檢查的 CSP 規則指控契約檔違規** —— `contract.ts` 把禁用的
   `SplitterGroup` 等名稱當資料列著，而檢查掃的是整份檔案有沒有出現那個識別字。
   修法**不是**「加個例外跳過契約檔」（那會讓它對其他檔案繼續誤報），
   是改成只看**真的 import 敘述**。
2. **樣式測試比對到自己的註解** —— 那份 CSS 的註解裡就寫著
   「這裡刻意不寫任何 @apply」與「為什麼必須明寫 @source」。
3. **去 CSS 註解時把 glob 吃掉** ——

   ```
   @source "../../../../**/*.{vue,ts}";
                        ↑ 這裡的 /**/ 是一個合法的 CSS 空註解
   ```

   路徑被刨掉一層，於是**測試看到的宣告與 Tailwind 看到的不是同一個東西**，
   而兩邊都不報錯。修法是去註解時先認得引號字串 ——
   與 `tools/exit-drill` 的 plugin 解析器同一個做法。

**通則**：要比對程式碼就得先分辨程式碼與字面值。正則做不到這件事，
而它失敗的方式是安靜的。

### 其他

- **`tools/api-surface` 載不了 `.vue`**（`ERR_UNKNOWN_FILE_EXTENSION`），
  整支工具崩潰。跳過那個 package 是最糟的選項 —— 它是**所有切片都依賴的那一個**。
  加了靜態解析的後備路徑，並禁止 `export *`（靜態解析展不開，
  而 API 表面必須是可枚舉的）。
- **一支測試寫死了 `19 + 449`**（C34 留下的），加相依就紅，而紅的原因與它要守的
  東西無關。改成守**形狀**：恰好兩份文件、第二份大一個量級、兩份總和等於整份解析結果。
  那種「改數字改到麻木」的測試，某天真的漏掉一份文件時也只會被再改一次。
- **供應鏈閘門正確地擋下新家族**，要求 `FAMILY_TIERS` 補一列：
  原生二進位 121 → **144（+23）**、家族 11 → 12。**與市調預測的 +23 完全一致。**

### C39 — CSP 瀏覽器實測：正反都驗過了，而且驗的過程本身踩到兩個坑

D15 的最後一項待辦。市調的靜態探測只證明「已發佈的程式碼有注入 `<style>` 的能力」，
不證明執行期會發生 —— 這一項只能開瀏覽器。

### 一、不能用 `vp dev` 驗

dev 模式下 Vue 的 SFC 樣式是由 JS **在執行期注入 `<style>` 元素**的（HMR 需要）。
也就是說 dev **一定**會踩 `style-src 'self'`，而那些 violation
**在 production 完全不存在**。

拿 dev 驗只會得到一堆假警報，然後第一件事就是有人把 `securityHeaders` 關掉
（該外掛預設 report-only 正是為了避免這件事）。
真正的驗證只有一種形狀：**production 產物 ＋ production 政策 ＋ enforce**。

因此新增 `tools/csp-verify`：以 `buildSecurityHeaders({ reportOnly: false })`
服務 `apps/console/dist`，並把 `/api` 代理到 BFF（D8 要求同源；
跨源的話 `connect-src 'self'` 也會擋，而那同樣是假的 violation）。

### 二、「零 violation」本身不是通過

console 一片安靜也可能代表 CSP 根本沒生效。所以四個探針正反都跑
（C33 的規矩：**綠燈只證明它跑完了，不證明它看到了東西**）：

| 探針                   | 期望   | 實測                                                       |
| ---------------------- | ------ | ---------------------------------------------------------- |
| JS 注入 `<style>` 元素 | 被擋   | ✅ **被擋**（顏色維持預設，注入的規則完全沒生效）          |
| `style` **屬性**       | 生效   | ✅ `rgb(4, 5, 6)` —— Vue 的 `:style` 走這條，沒被誤擋      |
| 外部 stylesheet        | 有載入 | ✅ 2 份，畫面確實有樣式（不是「什麼都沒作用」）            |
| inline `<script>`      | 被擋   | ✅ 沒有執行 —— 且證明**不需要 nonce**（R6 的成本前提成立） |

第一項就是 reka-ui Splitter 會做的事。它被擋掉，**證實了禁用 Splitter 那條規則
不是理論上的顧慮**。

### 三、`UiDialog` 在 enforce CSP 下完整運作

要驗的就是它 —— portal、焦點鎖定、捲動鎖定是最可能踩 CSP 的組合：

- 對話框開啟：遮罩、portal、樣式全部正常，**零 violation**
- Esc 關閉：`dialogStillOpen: false`
- **焦點還給觸發的按鈕**（`BUTTON:訂單明細`）—— reka-ui 幫我們做掉的無障礙行為
- 背景捲動鎖定解除（`overflow: visible`）

⚠️ **這個驗證的邊界要說清楚**：它驗得到的只有「**實際點過**的互動路徑」。
沒被點到的元件不會產生 violation —— 所以驗收一定要手動開一次對話框，
不能只看首頁載入。靜態探測（`ui-survey --csp`）與這支是**互補的**，不是重複的。

### 四、驗的過程本身踩到兩個坑

**一、`process.exit(main())` 把伺服器殺掉了。** `server.listen()` 是非同步的，
回呼才剛註冊，`process.exit(0)` 就執行了。症狀是 curl 回「連線被拒」——
看起來像埠沒開，而不是像程式自己結束了。

**二、BFF mock 沒有 `/api/orders`。** 它是 D8 契約的參考實作（session／CSRF／
401／403），從來沒有資料端點 —— 也就是說**這個腳手架的示範應用從來沒有真的
顯示過資料**，一直停在 loading。沒有資料就沒有列表、沒有按鈕、開不了對話框，
CSP 驗收整個做不下去。

補上四筆示範訂單，並在程式碼裡寫明它**不是契約的一部分**：
正式的 gateway 不會有那一段，它在這裡是為了讓「跑起來能看見東西」成立 ——
**一個看不見東西的腳手架，第一天就會被人繞過。**

順帶把 `selectedId` 補進 order 的 store。D14 早就把它寫成
「客戶端才是權威」的範例，但一直沒有實作；現在它同時是
「**存 id 不存 entity**」在畫面上的樣子：對話框的內容由 `computed` 從列表推導，
store 裡只有一個字串。

### C40 — 去查「`platform/ui` 的 owner 該是誰」，發現整份 CODEOWNERS 一條都沒生效

HANDOFF #14 剩最後一格。去查證的時候問了 GitHub 一句：

```bash
gh api repos/DemianLi/vite-plus-enterprise-scaffold/codeowners/errors
```

**22 條，全部 `Unknown owner`。**

原因不複雜：這份腳手架裡的 `@org/*` 全是佔位符，那些團隊不存在。
但後果值得停下來看：**D12 的整套擁有權治理目前是一份文字檔。**
PR 不會自動指派審查者，保護分支的「需要 owner 核准」沒有東西可要求。

而 `tools/conformance` 驗的是**條目存在**，不是 **owner 有效**。

**存在不等於生效** —— 這是 C33 的同一個形狀（「SBOM 產出了、上傳了、全綠，
而裡面有 0 個 component」）。差別在於這一次連查都查不到：
落差只有 GitHub 知道，本機跑什麼都看不出來。

處置是**寫進 `CODEOWNERS` 的檔頭**，因為那是會被讀到的地方，
並列為交接清單第 15 項（**採用這份腳手架的第一個步驟**，不是判斷題）。

**刻意不做成 CI 閘門**：它需要 GitHub API，會因為 token 權限與速率限制而變紅，
而不是因為真的有問題 —— 與 `tools/ui-survey` 不進 gate 是同一條理由。
一道會因為無關原因變紅的閘門，最後只會被加上 skip。

### 我自己在上一輪弄壞的兩件事

**一、把「這三處」拆散了。** CODEOWNERS 有一段註解寫著
「這三處定義的是安全行為本身」，底下原本是 `security-headers`、
`bff-contract`、`bff-check`。上一輪我把 `platform/ui` 的區塊插在中間，
於是 `bff-check` 被推到一個不相干的區塊後面，而那段註解上面只剩兩個 ——
**註解說三個，底下兩個。** 這正是 C24／C25／C35 那一類，而這次是我造成的。

**二、寫了一條 no-op 卻配上九行說明。**
`/platform/ui/ @org/platform-maintainers` 與檔案上方的 `/platform/` 通則
**完全等價**。一個 no-op 本身無害，但配上一段慎重的說明之後，
它讀起來像「這裡做過一個決定」—— 而那個決定其實還沒有人做。

改成**不寫那一列**，只留註解說明為什麼刻意不寫，並把問題指向 HANDOFF。

### 順帶把問題問準了

原本 HANDOFF 寫的是「`platform/ui` 的 CODEOWNERS 由誰擔任」。
但**候選其實已經在那份檔案裡**：最下面的 `@org/team-platform-ui` 擁有
`/apps/console/`。所以真正的問題是：

> **設計系統與應用外殼，是不是同一個團隊的事？**

沿用它最省事，但那等於把「全公司產品長什麼樣」交給一個維護單一應用外殼的團隊。
這個版本的問題可以直接拿去問人；原本那個只能得到「呃，platform 那組吧」。

**通則**：交接事項要交出去之前，先自己查一次 —— 光是查證的動作，
就可能把一格「請指派一個人」變成一個有選項、有代價的具體問題，
順便撈出一個沒有人知道的失效控制。

### C41 — 產生器不知道 D15 存在，而沒有任何一道閘門會說話

D15 落地的時候只改到 `features/order`。事後盤點才發現
`tools/slice-gen` 裡 **`@org/ui` 出現 0 次** —— 模板的 view 是一顆裸 `<h1>`，
`package.json` 也沒有那個依賴。

也就是說：**每一個新產生的切片，都會從「不使用設計系統」開始。**

而且全綠。`SLICE_DESIGN_SYSTEM_IMPORTS` 擋的是「繞過 `@org/ui` 自己拼基元」，
它擋不住更常見、也更安靜的那一條路 —— **根本不用**。
一個全用裸 `<h1>`／`<table>`／自己寫的 `<style scoped>` 的切片，
一條規則都不會 violate。

一句話：**沒有 import 也是一種發散。**
D15 想避免的「每個團隊各長一套」不是靠有人偷偷 import reka-ui 發生的，
是靠沒有人 import 任何東西發生的。這是 C35 的同一個形狀（產生器與現況脫節），
方向卻更糟：產生器是**教學品**，它示範什麼，團隊就長成什麼。

### 一、先讓它真的紅，再修

順序刻意反過來：先只加規則，**不動** `features/shipment`。

```
✗ 一致性檢查未通過：1 項違規

  features/shipment
    ✗ [設計系統採用] 整個切片沒有任何一處使用 @org/ui
```

exit 1。而 `features/order` **沒有**紅 —— 規則會分辨，不是全部一起倒。

這一步只花一個指令，但它是這次唯一真正的證據：一個真的切片、
一道真的閘門、為了真的理由變紅。先修再跑只會得到綠燈，而綠燈什麼都不證明。
如果 shipment 那時**沒有**紅，就表示判定式是壞的 —— 而修完再跑永遠問不出這件事。

### 二、判準刻意寬鬆，因為緊的那個版本會誤報

第一版想只掃 `src/views/`。那是錯的，而且契約自己的註解就寫著理由：
切片本來就該有自己的呈現元件（一張只有訂單用得到的表格），
那種元件很可能住在 `src/components/`，view 只是把它擺上去 ——
只掃 views 會把一個完全正確的結構判成違規。

要證明的命題其實很小：**這個切片碰過設計系統。** 整個 `src/` 有一處就算。
碰過就不會有「整片沒有人知道 `@org/ui` 存在」的情況，而那才是真正要防的事。
一道會誤報的閘門最後只會被加上 skip，然後那個 skip 永遠不會拿掉。

**但 `import type` 不算。** 在 `verbatimModuleSyntax` 下它會被完全抹除，
執行期一個位元組都不剩 —— 畫面上不會有任何東西來自設計系統。
放行它，這條規則就變成一行就能滿足的形式。

### 三、不做豁免旗標

原本要加 `DESIGN_SYSTEM_OPT_OUT_MARKER`。拿掉了：**它會有零個使用者**。
一條永遠不會被執行的分支，就是 C40（22 條 CODEOWNERS 沒有一條生效）
與 C33（SBOM 全綠但 0 個 component）的同一個形狀 ——
它存在，而沒有人知道它有沒有用。

真的出現第一個該豁免的切片時，才是設計豁免機制的時候，
那時至少有一個呼叫端可以拿來測。失敗訊息因此直說：
**那是契約要改，不是這一片開個旗標。**

### 四、判定式住在契約裡，兩邊共用同一份

`usesDesignSystem()` 放進 `platform/slice-kit/src/contract.ts`，
`tools/conformance` 與 `tools/slice-gen` 的測試 import **同一個函式**。

理由與 `IMPORT_SPECIFIER_PATTERN` 那段註解完全相同：各持一份副本的話，
產生器改了模板就會安靜地產出過不了 Tier 2 的切片，而兩邊的測試全綠。

正反測試 10 條，每一條釘住一個具體的錯誤實作：

| 測試                       | 擋掉哪種寫法                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| 只在註解裡提到 → false     | `source.includes("@org/ui")`（模板每個檔案的註解都提到它，**每個切片都會自動通過**） |
| `@org/ui-survey` → false   | `startsWith("@org/ui")`                                                              |
| `import type` → false      | 不檢查 type-only                                                                     |
| 同檔案 type + value → true | 檢查得太粗，看到 type 就否決                                                         |

### 五、順帶示範模板自己宣稱、卻沒做的那件事

模板的 `store.ts` 註解一直寫著「存 id，不存 entity」，而 store 裡只有 `page` ——
**描述了一個它沒有示範的模式**，而讀模板的人只會照抄看得到的部分。
這是 C39 在 `features/order` 撈到的同一件事。

補上 `selectedId` + `select()`，view 用 `computed` 從列表推導那筆物件，
配 `UiButton` + `UiDialog`。一顆沒事做的按鈕比沒有按鈕教得更差。

### 六、量到的回報：設計系統落在共用 chunk

| chunk               | 大小    | 含 reka-ui |
| ------------------- | ------- | ---------- |
| `src-*.js`（共用）  | 68.3 kB | ✓          |
| `OrderList-*.js`    | 3.0 kB  | ✗          |
| `ShipmentList-*.js` | 2.1 kB  | ✗          |

第二個切片拿到完整對話框（portal、焦點鎖定、捲動鎖定）的代價是 **2 kB**，
不是再一份 reka-ui。這正是 D15 選擇「元件住 `platform/`」而不是
「複製進每個切片」時押的那一注 —— 現在它是量得到的數字，不是論證。

### 七、最後真的產一個切片出來跑

共用判定式是**機制**，不是證據。它保證兩邊讀同一份實作，
不保證「產生器現在產出的東西，拿真的閘門跑會過」。

所以最後把 `buildSliceFiles()` 的輸出真的寫進 `features/tmp-verify/`，
跑真的 `tools/conformance`，**刻意不動 CODEOWNERS**：

```
✗ 一致性檢查未通過：1 項違規

  features/tmp-verify
    ✗ [擁有權] CODEOWNERS 沒有對應條目
```

只剩這一項 —— 而它本來就該由人指派，產生器產不出來。
「設計系統採用」沒有出現。**這是一個全新切片會遇到的完整清單。**

（這支腳本目前只在工作階段的暫存區，與其他四支反向測試同樣的狀態。
把它們搬進 repo 需要先加固 —— 它們會就地竄改原始碼再還原，
跑到一半被中斷 repo 就壞著。已知的待辦。）

### 八、途中撈到的三件別的事

**一、我自己的測試犯了它在防的錯。** 寫了
`expect(store).not.toMatch(/OrderHistoryItem/)`，當場被自己的模板打臉 ——
store 的註解裡就寫著「這裡刻意不放 `OrderHistoryItem` 物件」。
**提到一個名字和使用它是兩回事**，這正是 `tools/conformance` 的
`importClauseBefore()` 在處理的同一件事
（見 `tools/conformance/src/cli.ts` 該函式上方的註解 —— 那個教訓當時只留在
原始碼裡，沒有進到這份文件，所以我在這裡又踩了一次）。
改成比對實際形狀（一個持有 entity 的 `ref<...Item`）。

**二、`api-surface --update` 產出的檔案過不了 `vp check`。**
`JSON.stringify(_, null, 2)` 一律把陣列展成多行，oxfmt 會把短陣列收成單行。
於是每一次更新基準都帶來 **29 行 diff，其中 26 行是純排版**。

後果不只是吵：**登記破壞性變更是最需要仔細看 diff 的時刻，
而那正好也是雜訊最多的時刻。** 修法是寫完立刻交給 formatter 收尾 ——
讓 formatter 當唯一權威，而不是手工去猜它的規則。
修完同一次更新是 **3 行**，且 `vp check` 直接綠。

這個教訓 `tools/slice-gen/src/files.ts` 早就寫下來了（「那道 fmt 才是保證」），
只是當時沒有人想到同一件事會在另一支工具再發生一次。

**三、把 `@org/ui` 加進 `features/shipment` 之後，它在跑起來的應用裡到不了。**
BFF mock 只有 `/api/orders`（C39 補的），沒有 `/api/shipment` ——
那個切片的畫面永遠停在 `isError` 分支，新加的 `UiButton`／`UiDialog`
**一次都不會被渲染**。

閘門會綠、測試會過、chunk 帳目也是真的，但第二個參考切片的 D15 採用
是看不到的。**這正是 C39 在訂單那邊抓到的同一件事，只是換一個切片** ——
而我差一點就用「已對齊」把它送出去。

補上 `DEMO_SHIPMENTS` 與端點，實測（登入後）：

```
/api/shipment → 200 {"items":[{"id":"SHP-2001"},…],"total":3}
/api/nope     → 404 {"error":"not_found"}
```

第二行是對照組 —— 沒有它，200 也可能只是 router 無差別回應。

### 這條規則**擋不住**什麼

- 一個切片 import 一次 `@org/ui` 應付檢查，其餘全部自己刻 ——
  判準是「碰過」，不是「處處都用」。要驗後者需要看渲染結果，那是 review 的事。
- 註解裡寫著 `from "@org/ui"` 的假 import（與現有各條檢查同一個已知邊界）。
- **「import 了但 `package.json` 沒宣告」目前全 repo 沒有任何檢查。**
  這次撞到它的反面（宣告了但沒 `install`，被 rolldown 的嚴格解析當場擋下）。
  刻意不在這裡補：那是涵蓋 `@org/http-client`、`@org/slice-kit` 的**一般性**缺口，
  只補 `@org/ui` 會讓規則讀起來比它解的問題還窄。已列入交接清單。

### C42 — 走真正的入口跑一次，撈到一個三份文件各說一套的坑

C41 的端對端只是「把 `buildSliceFiles()` 的輸出寫進 `features/` 再跑閘門」。
那還不夠 —— 而**這次是先去查了外部實務才知道不夠的**。

Nx 社群談 preset generator E2E 的那篇講的正是這件事：預設的 E2E harness
把產生器放在**與正式情況不同的環境**下跑（既有 workspace 裡當一般 generator，
而正式是透過 `create-nx-workspace` 從 npm 解析後執行），
於是**真實會爆的東西在測試裡是綠的**。他們的修法是架本地 registry 走真路徑。

對照本 repo：使用者實際跑的是

```
bin/index.ts → bingo 的 runTemplateCLI → template.ts 的 produce() → buildSliceFiles()
```

而 `tools/slice-gen` 的 **51 條測試全部直接呼叫 `buildSliceFiles()`**，
中間那兩層一次都沒被執行過。

### 第一次真的跑 `bin/index.ts`

```
■ TypeError: [slice-gen] 選項 --slice 不是字串（收到 boolean）
```

### ⚠️ 而我第一版的結論是錯的，必須先講這個

當下的判斷是「這支產生器從命令列根本不能用」。**那是誇大的。**

寫 DECISIONS 的時候順手去看 `tools/slice-gen/README.md`，
第一段就寫著：**「選項用 `--opt=value`，不能用 `--opt value`」**。
也就是說這件事**早就有人撞到並繞過了**，CLI 一直是可用的。

實測四種組合：

|                  | `--opt value` | `--opt=value` |
| ---------------- | ------------- | ------------- |
| `.refine()` 包過 | ❌ `true`     | ✅ `"hello"`  |
| 純 `z.string()`  | ✅ `"hello"`  | ✅ `"hello"`  |

用 `=` 時 `parseArgs` 直接從字面推出字串，所以繞得過。README 的規避是對的。

**如果沒有回頭去讀那個 README，這份文件現在會有一句假話。**

### 真正的發現：同一件事有三種說法，沒有一種是對的

| 位置                   | 它說原因是什麼                            | 實際                                                     |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------- |
| `produce()` 的守衛訊息 | 「選項名與 bingo 內建選項撞號」           | ✗                                                        |
| `README.md`            | 「bingo 會把 `--opt value` 當成布林旗標」 | ✗（只對 `.refine()` 過的選項成立）                       |
| ——                     |                                           | ✓ `.refine()` → `ZodEffects` → bingo 認不得 → 選項被丟掉 |

bingo 的 `zodValueToArgsOption` 只認得 ZodString／ZodBoolean／ZodLiteral
（以及會拆開內層的 ZodDefault／ZodOptional／ZodUnion），遇到 ZodEffects
就回傳 Error，於是**那個選項被整個丟出 `argsOptions`**；
接著 `parseArgs` 在 `strict: false` 下把不認識的 `--slice` 當成裸旗標。

當時 `slice` 與 `team` 有 `.refine()`、`title` 沒有 ——
**同一支 CLI 上三個選項有兩種行為，而 README 把它寫成一條通則。**

所以問題不是「壞了」，是**沒有人知道它為什麼是這樣**，
於是每一份文件各自寫下自己那次的觀察，而三份都不足以預測下一次。
下一個加 `z.enum()` 選項的人會再撞一次，而且三份說明都幫不上忙。

### 修法：把 `.refine()` 拿掉，驗證搬進 `produce()`

規則一模一樣（仍然讀契約的 `isValidSliceDir`），只是晚一步執行。
代價是互動式 prompt 當下不會擋 —— 但**兩種寫法都能用**比「擋得早」值得。

同時修掉那三份說法：

- 守衛訊息改成把**兩個**已知成因都講出來（ZodEffects 與選項名撞號）
- README 那條「不能用 `--opt value`」拿掉，改成說明真正的成因，
  並註明**將來加 `z.enum()`／`z.number()`／任何 `.refine()` 時這個坑會回來**
- `options` 上方的註解寫死「這裡每一個選項都必須是未經包裝的 `z.string()`」

⚠️ **限制沒有消失，只是現在沒有選項踩到它。** 真正擋住它的是
`tests/e2e.test.ts` —— 它刻意用 `--opt value`（空格）跑，
所以有人加回 `.refine()` 就會紅。**文件寫得再清楚也擋不住，測試可以。**

### 這支測試會紅嗎 —— 把 `.refine()` 加回去試

**13 條裡 11 條紅**，全部指著那句根因訊息。

留綠的兩條正好是該綠的：「沒有設計系統採用違規」與「清理後只剩真正的切片」。
第二條在**失敗路徑**下也過,證明清理擋得住失敗留下的殘留 ——
失敗的執行同樣會建出目錄（`promptForDirectory` 先建，`produce()` 才拋）。

### 為什麼寫真實檔案系統

Angular 的 schematics 預設是記憶體虛擬 tree，但**他們自己的 CDK schematics
把 tree 複製到真實路徑**，理由是 TypeScript compiler API 沒辦法在虛擬 tree 裡
解析原始碼。我們一樣：`tools/conformance` 讀的是真的檔案。
要驗「產出的東西過得了真的閘門」，就得讓閘門看到真的檔案。

pytest-cookies 的 `cookies.bake()` 也是同一個形狀：產到目錄、斷言、自動清理。

### 殘留物是規格的一部分

這支測試會在 `features/` 底下真的建目錄，所以三層防護：

1. `beforeAll` 先刪 —— 上一次被中斷的話這裡收拾
2. `afterAll` 再刪 —— 正常路徑
3. 最後一條測試**斷言 `features/` 只剩真正的切片**

目錄名取 `zz-` 開頭：排最後，而且一眼看得出不是真的切片。

⚠️ 順帶一個永久性質：`vp` 會回報
`@org/slice-gen#test not cached because it modified its input` ——
這支測試永遠不會被快取。對 e2e 來說是對的（它本來就該每次真的跑），
但要知道它換來的是每次約 1 秒。

### 這次真正的兩個教訓

**一、C41 的端對端是自己想出來的，C42 是查了資料才知道要做的。**
兩者的差別不是勤勞程度，是**知不知道有這個失效模式存在** ——
而那個知識在外面，不在這個 repo 裡。查一篇文章換到一個真的 bug。

**二、找到 bug 之後，差一點就把結論寫錯。**
「這支產生器從命令列根本不能用」聽起來很有力，而且與觀察到的現象一致 ——
唯一的問題是它不是真的。擋下它的不是更仔細的推理，是
**寫文件的時候順手去讀了那個模組自己的 README**。

那份 README 上一次有人撞到這件事時就寫了規避方法。
**一個已經被記下來的坑，被我當成新發現的災難** ——
如果沒回頭讀，這份文件現在會有一句假話，而且它會被後面所有人引用。

通則：**宣告一件事壞掉之前，先去看那個東西自己的文件有沒有提過。**
與 C40 那條「交接事項交出去之前先自己查一次」是同一件事的另一面。

### C47 — 把一次瀏覽器驗證變成一份會過期的證據；過期條件是指紋，不是日曆

C39 的 CSP 實測是真的、當時也是對的。問題在它之後的樣子：一段口述，
結果由人抄進這份文件。用 D16 的兩軸量：

- **交付軸**：勉強及格 —— 紀錄可以進評審資料
- **迭代軸**：掛零 —— 升 reka-ui 或改 `policy.ts` 時，它不會說話

迭代軸掛零的東西該丟。但這一項不能丟：它是 §11 II ⑦ 執行期那一層唯一的證據。
所以要做的不是丟，是把迭代軸補起來。

### 一、為什麼不裝無頭瀏覽器

要驗的東西**只有真的瀏覽器 CSP 引擎知道**。happy-dom 與 jsdom 都沒有實作 CSP ——
拿它們跑會得到一份「五個探針全過」而其實什麼都沒驗，正是這個 repo 一路在防的
那種假綠燈。而裝 Playwright 代表把瀏覽器二進位拉進 `tools/supply-chain` 的
盤點範圍（要為它們算來源證明、進 mirror 清單、分家族）。為一道閘門付這個代價，
正是 D16 要擋的那種過度設計。

形狀因此比照 `tools/exit-drill`：**人跑一次，機器守它的有效期。**

### 二、過期條件：指紋，不是日曆

直覺是給證據加一個「90 天後過期」。**不要。** 日曆過期每季紅一次，而紅的時候
通常什麼都沒變 —— 那種紅燈會被加例外關掉。這正是 `health.test.ts` 檔頭寫的
「漏報讓它沒用，誤報讓它被關掉」，而誤報那一半更常發生。

這份證據會失效的真正原因只有兩個：CSP 政策字串改了，或**會在執行期注入
`<style>`／inline script 的相依版本變了**。所以指紋 ＝ 政策字串 ＋ 一份具名的
版本清單（`FINGERPRINT_PACKAGES`，七個）。

具名是重點：加一個 UI 相依必須動那一行，於是它必然出現在 code review 裡 ——
`policy.ts` 的 `UNSAFE_INLINE_ALLOWED_IN` 用的是同一個手法。
`pinia`／`vue-router`／`@tanstack/vue-query` 刻意不在名單裡：它們改版不會動到
CSP，收進來只會逼人重跑一次結論不會變的驗證。

⚠️ **刻意不對建置產物取雜湊。** Vite 的 chunk 檔名帶內容雜湊（C39 那張表裡的
`src-*.js`、`OrderList-*.js`），任何切片的 PR 都會讓它變 —— 那道閘門會天天紅，
一週內被刪掉。

### 三、判定必須從觀測推導，不能讓人手寫

探針腳本回報的全是量到的東西（算出來的顏色、violation 陣列、樣式表規則數），
`passed` 由 `evaluate()` 推導。少了這一層，證據檔就從量測退化成主張 ——
**而主張不需要開瀏覽器就寫得出來。**

而且 `--verify` 要**再重算一次**。第一版沒有這一段，於是那句「不接受人手寫」
只在 `--record` 那一刻成立：事後把 `evidence.json` 裡的 `passed: false` 改成
`true`、或直接蓋一份全綠的 `probes` 上去，CI 照樣綠。既有的竄改測試只驗到
**清空** `probes`，沒驗到**偽造** —— 而偽造才是有動機的那一種。

比的是 `(id, passed)` 而不是整個物件：`what`／`observed` 是給人看的訊息，
改一句措辭就讓證據失效的話，那種與事實無關的紅燈一樣會被關掉。

### 四、實測：兩個「被擋下」都要有正面佐證

探針一與探針四驗的是「這件事被擋下來了」。而「被擋下來」與**「注入的程式碼
根本沒跑」在觀測上一模一樣**：兩者都是顏色沒變、script 沒執行。

所以兩條都要求同時有對應的 violation，且 `disposition === "enforce"`。
這次實測拿到的正是這個：

| 探針                   | 實測                                                     |
| ---------------------- | -------------------------------------------------------- |
| JS 注入 `<style>` 元素 | 顏色維持 `rgb(0, 0, 0)`＋`style-src-elem`（**enforce**） |
| `style` **屬性**       | `rgb(4, 5, 6)` —— 沒被誤擋，Vue 的 `:style` 走得通       |
| 外部 stylesheet        | 2 份、規則數 45／2 —— 畫面不是整個壞掉                   |
| inline `<script>`      | 沒執行＋`script-src-elem`（**enforce**）                 |
| `UiDialog` 開啟        | 0 violation、`<style>` 數量 **0 → 0**（沒有多長出來）    |

`disposition` 這個欄位是整份證據唯一機器驗得出「不是 report-only」的地方；
report-only 的事件會寫 `"report"`，畫面照常運作，那種驗證等於沒驗。

最後一列看的是**差值不是絕對值**，而這一點是被追問出來的。第一版斷言
「開對話框時 `<style>` 元素數 ＝ 0」，今天成立是因為這個建置產物靜置時就是 0。
但 Vite 只要開始內聯小 CSS（`assetsInlineLimit`）、或 Tailwind 吐出一段
critical CSS，絕對值就不是 0 —— 而那時探針會報「`<style>` 1」，讀的人會
診斷成「reka-ui 開始在執行期注入樣式」。**錯的原因**，出現在一道全部價值
都在「訊息講得出原因」的閘門上。

另外一個之前沒記下來的細節：violation 的 `effectiveDirective` 是
`style-src-elem` 與 `script-src-elem`，**不是** `style-src`／`script-src`。
瀏覽器確實把 elem 與 attr 分成兩條在判 —— 而 `style-src-attr 'unsafe-inline'`
這個精準例外能成立，靠的就是這件事。

### 五、指紋守不到的那一塊，寫在表上

瀏覽器自己也會變。若某版 Chromium 改了 `style-src-attr` 的處理方式，
政策會靜默失效而指紋不會動。這是真的洞，沒有補。

不能拿瀏覽器版本當閘門 —— Chromium 每四週發一版，那等於每四週紅一次，
回到第二節那個會被關掉的形狀。所以**記錄，不守**：證據檔留下
`Chrome 148`，人在看的時候知道這份結論是對著誰成立的。

### 六、順手修掉一個已經漂移兩次的數字

法遵對照表 §11 II ⑦ 的註記手寫著「四道裡只有 conformance 證明過會紅」。
那句話在補完 `api-surface` 的反向測試那天就過期了，這次補完 `csp-verify`
又過期一次，⑥／⑨ 做完還會再過期 —— **三次漂移，零次紅燈**。

一張自稱守著「數字會不會說謊」的表，自己的註記在說謊，是最壞的一種。
計數改由 `provenCount()` 從 `GATES` 推導，註記只留判斷。同一次也把正文裡
寫死的「8／11」換成推導值。這是 HANDOFF #7（A1：只守推導得出來的數字）
在已經看它漂移過兩次的那一處先落地。

---

### C46 — 補兩道閘門的反向測試，其中一條的失敗教了我 lockfile 的結構

D16 的對照表把 12 道閘門裡的 8 道標成「未證明會紅」，並指出優先序：
**Trivy SCA 是唯一直接對得上 §11 II ③ 的閘門**，而它有兩個已知的失明模式
（C33 dev 相依被抑制掃 0 個、C34 只解第一份 YAML 文件），兩個都是**綠燈**。

#### 證明的是守衛，不是掃描器本身

真正擋下那一整類問題的不是那兩個修法，是 `--verify-sbom` ——
它比對兩個獨立來源對同一份 lockfile 的計數。所以反向測試餵它兩份假 SBOM：
0 個 component（C33 的症狀）、20 個（C34 的症狀），兩份都必須紅。
加上一條**對照組**（正確數量放行）與一條**不得誤擋**（略少於 lockfile 仍放行）——
少了後者，第一天就會有人把門檻調到 0，那道檢查等於沒有。

⚠️ **`trivy-sca` 這一格仍然留白，而且是刻意的。** 要證明「Trivy 發現 CVE 時
CI 會紅」，需要一份帶已知 CVE 的 fixture —— 而那種 fixture 會在 CVE 被修掉
的那天因為**錯誤的理由**變綠。拿 SBOM 守衛的測試去填那一格是說謊，
而這張表的全部價值就在於不說謊。

另外補了一組**設定漂移**測試：C33 與 C34 都不是程式碼寫錯，是 workflow
少了一行。那種變更在 code review 上看起來完全無害。

#### 測試失敗教了我一件關於 lockfile 的事

驗 `--split-lockfile` 時我斷言「兩份拆出來的套件數加起來等於總數」。**紅了：520 ≠ 519。**

原因是 `detect-libc@2.1.2` **同時住在兩份 YAML 文件裡** —— pnpm 自己與專案
都用它。完整解析時被去重，拆開後被算兩次。

而這件事 repo 裡早就記著：`--manifest` 把那一類標成 `scope: "both"`，
註解寫著「分批鏡像時這一類**兩批都要進**」。我只是沒讀到。
斷言改成釘住這個結構事實本身，比原本那條「相等」有用。

#### api-surface：從零測試到 11 條

它是四道閘門裡唯一**連一條測試都沒有**的，而它守的是 D12 最硬的規則。

破壞的是**基準檔的副本**（新加的 `--baseline`），不是 `platform/` 的原始碼 ——
對閘門而言「基準說有、現況沒有」與真的刪掉一個 export 完全等價。

其中三條驗的是 codemod 這個**合法出口**沒有被繞過、也沒有被誤擋：
登記了對應 codemod 的移除要放行（誤擋這一種，規則會被整個繞過）、
登記一個不存在的 codemod 檔案要紅（否則一行 JSON 就能過關）、
登記的是**別的** export 也要紅（只看「有沒有登記」而不看「登記的是不是這一個」
是最容易寫錯的一種）。

#### 一個預期錯誤，而實際行為比較安全

我原本準備在註解裡寫「`--baseline` 路徑打錯會靜靜通過，所以 CI 永遠不要傳它」。
實測是**紅的**：空基準之下，現況的每一個 export 都算「未登記的新增」。

這是這道閘門一個不明顯的優點 —— 基準檔遺失或路徑打錯，不會表現成「檢查通過」。
已釘住，因為那正是它與其他閘門最常見的失敗模式相反的地方。

---

### C45 — 同一組判定函式，換一個掃描對象就從裝飾品變成閘門

`tools/ui-survey` 裡有兩個函式：`looksUnmaintained()` 與 `licenseNeedsReview()`。
它們的能力沒有問題 —— **PrimeVue 的商業授權就是被後者抓到的**（`license` 欄位
變成 `SEE LICENSE IN LICENSE.md`，GitHub 上的 LICENSE.md 仍是 MIT，
只有 tarball 裡那份寫著商業條款）。前者也早就修掉了會讓它反向錯的那個 bug：
第一版把預發版算進活躍度，於是 `@headlessui/vue` 顯示「31 版／年」，
**剛好把一個停更兩年的專案顯示成最活躍的**。

問題在**掃描對象**：它們掃的是五個早已選完的候選函式庫。選型做完之後，
那份名單再也不會告訴你任何事。而「我們實際裝的東西有沒有停止維護、
授權有沒有被改掉」—— 在此之前**完全沒有東西在看**。

按 D16 的兩軸判準，這既不是過度設計也不是設計不足，是**瞄錯目標**。
搬到 `tools/supply-chain`、對準 24 個外部直接相依，它就從決策期的裝飾品
變成一道閘門。

#### 範圍為什麼是 24 個而不是 519 個

從 `package.json` 推導，不是從 lockfile。lockfile 裡是整棵樹，而
「我們選了什麼」問的是我們自己寫下來的那些。用 lockfile 會把
「vue 的某個間接相依停止維護」也算成我們的選擇 —— 那不是我們能決定的事，
而那類問題屬於 Trivy 的漏洞掃描。

那 121 個原生二進位也不該逐個問：它們是 TypeScript／lightningcss／yuku 的
platform binding，維護狀態由母套件決定，問 144 次只會得到 144 份同一個答案。

#### 差點靜靜關掉一個法務正在依賴的檢查

搬過來的時候我「順手補齊」了常見寬鬆授權，把 `COMMON_LICENSES` 從 5 個
擴成 9 個 —— 其中包含 **MPL-2.0**。

而 MPL-2.0 正是 HANDOFF #4 要法務裁決的那一項。那次補齊會讓法務關心的東西
**從此不再被標記，而且不會有任何測試變紅**。現在有一條測試釘住
`licenseNeedsReview("MPL-2.0") === true` 與 `COMMON_LICENSES.length === 5`。

> 這份清單的意思不是「這些授權沒問題」，是「這些不需要每次重新問一次」。
> 兩者的差別在補清單的那一刻看起來完全一樣。

#### 第一次跑就撈到兩件事，其中一件補上了法務交接的缺口

| 撈到的                                              | 判斷                                                                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `clsx@2.1.1`，最後穩定版 2024-04-23                 | **接受並寫下理由**。239 bytes、零相依、只做字串串接 —— 「兩年沒發版」在這種套件上是「做完了」。而接受的真正理由是退場成本近乎零（`cn.ts` 一行） |
| `eslint-plugin-no-unsanitized@4.1.5` 是 **MPL-2.0** | **升級給法務。** 它不在 `vpr sca-dossier` 的〈授權分佈〉裡 —— 那一節只涵蓋 144 個**原生二進位**，一個純 JS 的直接相依對它是隱形的               |

第二件的意義超出這個套件本身：**申請書的授權分佈有一個範圍限制，
而那個限制在此之前沒有任何東西會講出來。** HANDOFF #4 的 MPL-2.0 清單
原本寫「lightningcss-* 11 個」，現在補上另外兩組。

法務核准了「11 個 lightningcss」之後，覆核時才發現還有一個沒被提到的
MPL-2.0 —— 那比一開始就講出來難處理得多。

#### 例外清單的兩條規則

`HEALTH_ACKNOWLEDGEMENTS` 寫在原始碼、每筆附理由與日期，理由與 `FAMILY_TIERS`
相同。另外有一條測試釘住：**例外不得蓋掉名單漂移**。
一個被 acknowledge 過的套件從 `package.json` 消失了仍然要報 ——
否則例外清單會從「這個狀態可以接受」變成「這個套件不用檢查」。

---

### C44 — 加了升級提案機制，並且發現「自動修好它」會蓋掉供應鏈事故

D16 的迭代軸點出最大的空白：整個腳手架能在升級**之後**告訴你什麼壞了，
卻**沒有任何東西會說「該升了」**。沒有 Renovate、沒有 Dependabot，
而 `vite-plus` 釘在 0.2.9、約 5–14 天一版。

#### catalog 裡有一組綁死的三件套，天真的設定會開三個各自壞掉的 PR

`vite-plus`、`vite`（npm alias 指向 `@voidzero-dev/vite-plus-core`）、`vitest`
必須同版。`pnpm-workspace.yaml` 的註解早就寫著：vitest 若與 vite-plus 內部
釘死的版本不一致，`node_modules` 會出現兩份 vitest，測試以難以診斷的方式失敗。

Renovate 的 `matchPackageNames` 打錯一個字**不會有任何錯誤** —— 那條規則只是
靜靜地匹配不到任何東西，而設定檔看起來完全正常。這與 `--reporter=basic` 那次
是同一個形狀：失敗的樣子和成功的樣子一模一樣。所以分組要有測試釘住，
而且要驗「分組裡的每個名字都真的在 catalog 裡」。

#### 真正的發現：把「自動修好閘門」做對，比做出來難

Renovate 的每個 PR 都改 lockfile，於是供應鏈閘門必然紅。直覺的解法是讓 CI
自己重擷一次 `provenance.json`。**那是錯的，而錯在一個不明顯的地方。**

`verifyBinding()` 回報三種不同步。其中兩種（missing／stale）就是「版本換了」，
是每個升級 PR 都會發生的事。但 `integrity-changed` 完全不同 ——
**同一個 name@version，tarball 內容物換了**。無條件自動重擷，等於用一個
bot commit 把一件該當成事故處理的事蓋掉。

而既有的防線在這裡**不夠**：`captureOne()` 只在 attestation 的 subject digest
與 lockfile 對不上時中止，但 121 個原生二進位裡有 **32 個只有發佈簽章、
沒有 SLSA provenance**（C27）。那 32 個沒有 subject digest 可比 ——
自動重擷會安靜地把新的 digest 記下來當成事實。

所以判定必須在**重擷之前**做：`isSafeToRecapture()`，而且要有一條測試釘住
「混在一堆正常升級裡的一個掉包，仍然不安全」—— 用「多數是升級」或
「第一筆是什麼」來判定的寫法都會在那裡放行，而那正是掉包會長的樣子。

#### 為什麼是 workflow_dispatch，不是自動觸發

`tools/supply-chain/` 與 `.github/` 都是 `@org/security` 共管。讓 bot 自主
提交那裡的檔案是一個**治理決定**，不該由實作者單方面做 —— 與 HANDOFF #12
的自動核准標籤同一條理由，而 bot commit 會被 rubber-stamp 這件事更糟。

`workflow_dispatch` 拿到兩邊的好處：`contents: write` 只存在於那一支
workflow（Tier 2 的權限一格都沒放寬），動作由具名的人發起，
而使用者只要按一下、不必在本機裝任何東西。它也拒絕在預設分支上執行 ——
直接推 main 等於繞過 CODEOWNERS。

#### 對照表因此多了一個型別

Renovate 補的是 §11 II ③「定期檢測**並因應**」裡從來沒人做的「因應」那一半。
但它**不擋任何東西**，硬塞進「證明過會紅」那一欄只有兩種寫法，兩種都是謊：
宣稱它有反向測試，或把它算進「8 道未證明」（一個永遠不會紅的東西被列成
待補的工作）。所以 `Gate` 多了 `kind: "gate" | "proposer"`，
而分子與分母**都**要排除 proposer —— 只排除分子的話，8／12 會看起來比
8／11 好，而好的那一格是憑空長出來的。

---

### C43 — 把反向測試從暫存區搬進 repo，兩支工具的閘門第一次證明自己有牙齒

四支反向測試一直只活在工作階段的暫存區。`DECISIONS.md` 引用它們的結果 **16 次**，
而那些腳本會隨工作階段消失 —— 也就是說**這份文件引用的證據，repo 裡不存在**。

先拆開看它們是不是同一件事。**不是**：四支腳本、四個主題、三種修法。

| 腳本                               | 驗的是誰         | 動什麼                                  | 中斷後果          |
| ---------------------------------- | ---------------- | --------------------------------------- | ----------------- |
| `negative-test`                    | **bff-contract** | 就地改 `bff-mock/server.ts`             | 原始碼壞著，安靜  |
| `negative-d14` ＋ `negative-store` | conformance      | 就地改 `features/order` 三個檔          | 同上              |
| `negative-supply-chain`            | supply-chain     | **`pnpm-lock.yaml`** ＋工具自己的原始碼 | 竄改過的 lockfile |

第三種**刻意不搬**：lockfile 是 workspace 全域的，沒辦法 scope 到暫存 root，
除非整份 workspace 複製一遍。它該留成手動腳本，不是測試。

### 一、BFF：用 proxy 破壞行為，不改原始碼

前身用字串比對去換 `server.ts` 的程式碼。那有兩個問題：中斷了 repo 就壞著，
而且 **mock 一改寫法那條反向測試就靜靜失效**（比對不到，於是什麼都沒破壞，
而測試「通過」）。

改成在真的 mock 前面架一層會改寫回應的 proxy，走的是 **`BFF_ORIGIN`** ——
契約測試本來就設計成能指向任何 origin，這裡用的是同一道門，不是新開的後門。

8 個破壞各自讓正確的條目變紅，**對照組（不破壞任何東西的 proxy）維持全綠**。
少了對照組，只要 proxy 自己寫錯，8 條都會「成功變紅」——而紅的是 proxy。

### 二、conformance 加 `--root`：為了可測試性去動正式工具的介面

「該紅會不會紅」只能靠真的弄壞一個切片證明。ROOT 寫死的話，那意味著
就地竄改 `features/order`。加了 `--root` 之後，反向測試把切片複製到暫存目錄
再破壞副本 —— **repo 的原始碼一個位元組都沒被動過**。

代價要說清楚：多一個參數、多一條解析路徑，動的是 Tier 2 閘門本身。
換到的是這支工具第一次有辦法證明自己有牙齒 —— 在那之前它只證明過「現況是綠的」。

⚠️ **刻意不做環境變數版本。** env 會被繼承到子行程，一個沒清乾淨的
`CONFORMANCE_ROOT` 會讓 CI 安靜地掃錯目錄然後回報通過。明確的旗標做不到這件事。

### 三、結果：17 ＋ 9 條，沒有一條規則是啞的

conformance 17 條（含 2 條偽陽性防護與 1 條對照組）、bff 9 條（含 1 條對照組）。
**全部符合預期** —— 沒有找到啞掉的規則。

那不是「白做」。在這之前沒有任何東西能區分「規則有效」與「規則寫錯但永遠綠」，
而這兩者在 CI 上長得一模一樣。

其中兩條 ★ 驗的是**不該紅的時候不會紅**，比「該紅會紅」更重要：
一條會誤擋的規則，第一天就會被加上例外，然後那個例外永遠不會拿掉。
`import type` 與 `import { type X }` 只差一個位置而行為完全相反 ——
前者被完全抹除，後者模組真的被載入。

### 四、途中踩到的三個坑

**一、`spawnSync` 把事件迴圈凍住。** mock 與 proxy 都活在測試的 process 裡，
而 `spawnSync` 讓事件迴圈停擺 —— 子行程打過來的請求沒有人回應，兩邊互等。
症狀是九條測試各卡滿 60 秒（**總共 545 秒**），而訊息只說「Test timed out」。

**二、`--reporter=basic` 在 vitest 4 已移除。** 子行程啟動即失敗，
於是「紅掉的條目」是空清單 —— 而空清單同時也是「全部通過」的樣子。
修法不只是換 reporter，是加一條檢查：**看不到任何一條測試就直接拋**，
因為「跑不起來」與「全綠」必須是兩種不同的結果。

**三、我在註解裡寫下理由，然後照樣斷言反面。** sandbox 原本只複製 order 一片，
而 D4 第 1 層是讀 `features/` 的實際內容建立「什麼是切片」的事實名單 ——
所以 `@org/feature-shipment` 不在名單上，跨切片那條**永遠測不出來**。
我把這個理由寫在測試的註解裡，然後斷言它會紅。改成複製兩片。

### 五、最後一條測試：repo 本身沒有被動到

看起來多餘，但它釘住的正是搬這些測試進 repo 的**唯一理由**。
跑完之後直接讀真正的 `features/order/src/store.ts`，確認沒有殘留的破壞，
並且真正的 repo 仍然是綠的。

### 驗證結果（全部實機執行）

最新一次全套（2026-08-15）：**`vpr ready` exit 0**、154 檔案格式一致、
85 檔案 0 errors 0 warnings、**332 tests / 23 檔案全過**、建置 724 modules 成功。

| 項目                                   | 結果                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `vp check`（Tier 1）                   | 0 errors 0 warnings，153 檔案格式一致（81 檔案型別與 lint 檢查）                                                       |
| `vp run -r test`                       | **332 tests 全過**（23 個測試檔）                                                                                      |
| **D15 採用規則反向測試**（C41）        | ✗→✓ 先只加規則：`features/shipment` **真的紅了**（exit 1），`features/order` 沒紅 —— 規則會分辨                        |
| **產生器輸出端對端**（C41）            | ✓ 真的產一個切片跑真的閘門 → **只剩「擁有權」一項**（該由人指派），設計系統採用通過                                    |
| **真正的 CLI 入口**（C42）             | ✗→✓ 首次執行 `bin/index.ts` 即失敗：`--slice value` 被當成裸旗標（`.refine()` → ZodEffects）。`--slice=value` 一直可用 |
| **C42 反向測試**                       | ✓ 把 `.refine()` 加回去 → **13 條紅 11 條**，且失敗路徑下清理仍然成立                                                  |
| `eslint . --max-warnings=0`（Tier 2）  | 0 problems                                                                                                             |
| 一致性檢查                             | 通過                                                                                                                   |
| 一致性檢查**反向測試**（C43）          | ✓ **已進 repo**：`tools/conformance/tests/negative.test.ts` 17 條（含 2 條偽陽性防護＋對照組），破壞的是副本           |
| BFF 契約**反向測試**（C43）            | ✓ **已進 repo**：`tools/bff-check/tests/negative.test.ts` 9 條，proxy 破壞行為、不改原始碼，對照組全綠                 |
| `vp run -r build`                      | 成功，113 modules                                                                                                      |
| D11 hidden sourcemap                   | ✓ JS 內無 `sourceMappingURL`，`.map` 確實產生                                                                          |
| D8 機密閘門                            | ✓ 加入 `VITE_API_SECRET` → **建置失敗**，訊息指向 BFF 作法                                                             |
| api-surface 雙分支                     | ✓ 未登記移除 → exit 1；登記在 `removes` → exit 0                                                                       |
| **BFF 契約**（R6）                     | ✓ 13 條契約條目全過（對 `@org/bff-mock`）                                                                              |
| **BFF 契約反向測試**                   | ✓ 破壞 mock 的 **8 個地方，每一個都讓對應條目變紅**                                                                    |
| **退出演練新鮮度分支**                 | ✓ 五條分支全跑過：過期＋旗標→1、過期無旗標→warn/0、上次失敗→1、無證據＋旗標→1、正常→0                                  |
| **靜態 CSP 前提**（C21）               | ✓ 注入 inline script → **建置失敗**；11 條單元測試（含 3 條防誤報）                                                    |
| **D2 退出面靜態檢查**                  | ✓ 在切片裡 `import "vite-plus"` → **exit 1**                                                                           |
| **D2 完整退出演練**（R1／R9）          | ✓ 上游 **Vite 8.2.1** 建置成功、上游 Vitest **108 tests 全過**、原始碼未改                                             |
| **供應鏈盤點**（R2／R3／R5／R8）       | ✓ **519 套件／144 原生／12 家族**（D15 後），四個目標平台皆有變體                                                      |
| **來源綁定**（R4）                     | ✓ **121** 個 lockfile↔擷取 integrity 一致；其中**有 attestation 的 89 個**另驗 digest 編碼等價，0 個不符               |
| **供應鏈閘門反向測試**                 | ✓ **十種破壞，每一種都紅在正確的那一條上**                                                                             |
| **退出演練 plugin 帳目**（C36）        | ✓ 認出真實設定檔的 3 個 plugin（重現 1、明示丟棄 2）                                                                   |
| **退出演練 plugin 反向測試**           | ✓ 拿真檔案演：加未登記 plugin → **紅**；包一層巢狀陣列想繞過 → **一樣紅**；還原 → 回綠                                 |
| **D15 設計系統落地**                   | ✓ Tailwind 探針全中、設計代幣進產物、**未使用的 utility 不在**（12.25 kB）                                             |
| **CODEOWNERS 實效**（C40）             | ✗ **22 條全部 Unknown owner** —— 佔位的 `@org/*` 未替換，D12 治理目前未生效                                            |
| **D15 CSP 瀏覽器實測**（C39）          | ✓ enforce 下零 violation；注入 `<style>` **被擋**、`style` 屬性生效、inline script 被擋                                |
| **UiDialog 在真實 CSP 下**             | ✓ 開啟／Esc 關閉／**焦點還給觸發按鈕**／捲動鎖定解除，全程零 violation                                                 |
| **D15 反向測試**                       | ✓ 切片直接 import reka-ui → 紅；platform/ui 用 Splitter → 紅；還原 → 回綠                                              |
| **退出演練產物比對**（C38）            | ✓ 拿掉 @source → **37%，紅**；正常 → 綠。⚠️ 96% 那種局部退化它抓不到（見 C38）                                         |
| **演練成績文件比對**（C36）            | ✓ 三份文件 vs evidence.json 一致（98 個測試）；改錯一處 → **紅**，還原 → 回綠                                          |
| **Tailwind × vite-plus 相容性**（C37） | ✓ `vp build` exit 0、4.42 kB CSS；三個探針 utility 全中，**未使用的不在**（掃描確實有選擇性）                          |
| **R5 registry 路由**                   | ✓ 四種設法實測：專案 `.npmrc` 與 `onFail` **無效**；全域 `.npmrc` 與環境變數有效                                       |

---

## 實作順序

依賴關係決定順序，不是重要性。

1. ✅ **monorepo 骨架**：pnpm workspace + catalog + `.npmrc`（內部 registry、`ignore-scripts=true`）
   - `apps/` `features/` `platform/` 三層目錄 + `.git-blame-ignore-revs`
2. ✅ **`platform/` 最小集**：`tsconfig`、`eslint-config`（只裝安全與邊界規則）、`config`（VITE_ 型別閘門）
3. ✅ **一致性檢查腳本**（D9）— 先於產生器，因為它定義契約
4. ✅ **`defineFeature` 型別與 `platform/http-client`**（含 CSRF + credentials）
5. ✅ **一個手寫的範例切片**，跑通一致性檢查
6. ✅ **slice generator**（`vite:generator`），產出內容對齊步驟 3 的檢查項
7. ✅ **Tier 1 CI**：任務快取（`vp run` 無 affected 過濾，見 D10 修正）
8. ✅ **Tier 2 CI**：全量無快取的安全閘門 + 每日排程 + SBOM 產出（未在 Actions 上實跑，見 C13）
9. ✅ **CSP report-only**：政策已成為 `@org/security-headers` 的單一事實來源，dev 已套用；正式上線的 report-only→enforce 切換由 gateway 執行
10. ✅ **codemod 基礎設施**：`tools/api-surface` 強制、`tools/codemods` 執行；`platform-codemod` 標籤自動核准待 GitHub repo 設定
11. ✅ **R6 處置**：`platform/bff-contract`（可執行規格）＋ `platform/bff-mock`（參考實作）
    ＋ `tools/bff-check`（驗收器）；`assertStaticCspCompatible()` 守住「不需要 nonce」的前提
12. ✅ **R1／R9 處置**：`tools/exit-drill` 靜態檢查進 gate、完整演練每季排程，
    證據 `evidence.json` 進版控
13. ✅ **R2／R3／R4／R5／R8 處置**：`tools/supply-chain` 從 lockfile 推導原生二進位盤點，
    `inventory.json`／`provenance.json` 進版控並進 gate 與 Tier 2；
    三份給組織的文件（SCA 例外申請書、mirror 清單、封閉網路前置條件）全部**產生**而非手寫

步驟 1–5 是「能不能成立」，6–8 是「能不能規模化」，9–10 是「能不能活過兩年」，
11–12 是「能不能通過採購與資安那一關」。
