# Vite+ 企業級腳手架 — 決策紀錄

> 本檔是**已建成腳手架**的交接文件，不是待辦筆記。
> D1–D14 為定案決策；C1–C34 是實作階段推翻或修正設計的紀錄（含原文與「不要照這裡做」標註）；
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
建置成功、上游 Vitest **86 個測試全過**、應用程式原始碼一字未改。
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

#### 術語附註

提出這次 review 的說法是「後端的 vertical slice 在前端該叫 Feature-Driven + Composable」。
前半對，而且腳手架本來就是那個東西；後半是誤植 —— **Composable 在 Vue 3 不是架構名稱**，
是一個具體構件（Composition API 的 `useXxx()` 函式）。前端真正有這個名字的方法論是
**Feature-Sliced Design（FSD）**。

但把它當成架構要求來讀是有生產力的：它正好指到了上面那個盲點。**本節就是這個誤植
帶來的結果**，記在這裡是因為它示範了一件事——用錯的名字問對的問題，比用對的名字
問不出問題有價值。

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
| R9  | ~~D2 的退出保單未經測試~~ **已解除**：2026-08-15 實測退到上游 Vite 8.2.1，建置與 86 個測試全過       | —          | 已自動化為每季演練 + 每次 PR 的退出面檢查（`tools/exit-drill`）                      |

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
產物大小與 vite-plus 建置一致），上游 Vitest **86 個測試全過**，
**應用程式原始碼一字未改**，全程 4 秒（npm cache 溫的情況）。

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

### 驗證結果（全部實機執行）

最新一次全套（2026-08-15）：**`vpr ready` exit 0**、122 檔案格式一致、
63 檔案 0 errors 0 warnings、**202 tests / 15 檔案全過**、建置 110 modules 成功。

| 項目                                  | 結果                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `vp check`（Tier 1）                  | 0 errors 0 warnings，122 檔案格式一致                                                                    |
| `vp run -r test`                      | **202 tests 全過**（15 個測試檔）                                                                        |
| `eslint . --max-warnings=0`（Tier 2） | 0 problems                                                                                               |
| 一致性檢查                            | 通過                                                                                                     |
| 一致性檢查**反向測試**                | 故意破壞的切片 → **抓到 9 項違規，exit 1**                                                               |
| 邊界規則反向測試                      | 跨切片 import、axios、相對路徑逃逸 → **三種全部命中**                                                    |
| `vp run -r build`                     | 成功，110 modules                                                                                        |
| D11 hidden sourcemap                  | ✓ JS 內無 `sourceMappingURL`，`.map` 確實產生                                                            |
| D8 機密閘門                           | ✓ 加入 `VITE_API_SECRET` → **建置失敗**，訊息指向 BFF 作法                                               |
| api-surface 雙分支                    | ✓ 未登記移除 → exit 1；登記在 `removes` → exit 0                                                         |
| **BFF 契約**（R6）                    | ✓ 13 條契約條目全過（對 `@org/bff-mock`）                                                                |
| **BFF 契約反向測試**                  | ✓ 破壞 mock 的 **8 個地方，每一個都讓對應條目變紅**                                                      |
| **退出演練新鮮度分支**                | ✓ 五條分支全跑過：過期＋旗標→1、過期無旗標→warn/0、上次失敗→1、無證據＋旗標→1、正常→0                    |
| **靜態 CSP 前提**（C21）              | ✓ 注入 inline script → **建置失敗**；11 條單元測試（含 3 條防誤報）                                      |
| **D2 退出面靜態檢查**                 | ✓ 在切片裡 `import "vite-plus"` → **exit 1**                                                             |
| **D2 完整退出演練**（R1／R9）         | ✓ 上游 **Vite 8.2.1** 建置成功、上游 Vitest **86 tests 全過**、原始碼未改                                |
| **供應鏈盤點**（R2／R3／R5／R8）      | ✓ 467 套件／121 原生／11 家族，四個目標平台皆有變體                                                      |
| **來源綁定**（R4）                    | ✓ **121** 個 lockfile↔擷取 integrity 一致；其中**有 attestation 的 89 個**另驗 digest 編碼等價，0 個不符 |
| **供應鏈閘門反向測試**                | ✓ **十種破壞，每一種都紅在正確的那一條上**                                                               |
| **R5 registry 路由**                  | ✓ 四種設法實測：專案 `.npmrc` 與 `onFail` **無效**；全域 `.npmrc` 與環境變數有效                         |

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
