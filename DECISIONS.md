# Vite+ 企業級腳手架 — 決策紀錄

> ## ⚠️ 這份文件涵蓋的範圍**大於 v1.0.0**
>
> 這是一份**有日期的決策日誌**，記錄的是這個腳手架一路上做過的判斷與踩過的坑 ——
> 包含 v1.0.0 刻意不涵蓋的那些能力（無障礙、法遵對照表、供應鏈盤點、
> 退出演練、BFF 契約驗收、CSP 實測）。
>
> 那些決策仍然值得讀：**它們解釋的是「為什麼這樣做」，而理由不會因為
> 某個版本沒帶上那個能力就失效。** 但讀的時候要知道，v1.0.0 的 repo 裡
> **沒有**它們對應的程式碼與閘門 —— 那些在 `main` 分支。
>
> v1.0.0 承諾與不承諾什麼，寫在 [HANDOFF.md](HANDOFF.md)。
>
> ⚠️ 文件中出現的數字（套件數、原生二進位數、閘門數）陳述的是**當時的
> `main`**，不是 v1.0.0 的現況。v1 沒有機制在守它們 —— 那道守衛
> （`tools/doc-facts`）在 v1 只守 README 與 HANDOFF。

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
建置成功、上游 Vitest 全部測試通過、應用程式原始碼一字未改。
（成績數字刻意不抄在這裡 —— 每季重跑就會變，唯一事實來源是 `evidence.json`。）
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
>
> ⚠️ **上面那句話到 2026-08-16 為止是對的，現在要加一個限定詞：
> 「ESLint 這一軌」指的是 `@org/eslint-config` 的預設匯出。** 同一個 package
> 從那天起還有第二個匯出 `./a11y`（23 條無障礙規則），而它跑在 **Tier 1**，
> 不在上面這張表的 Tier 2 那一列裡。
>
> 兩者刻意分開，理由正是這一段：把無障礙塞進 Tier 2 的陣列，就會毀掉
> 「這條紅線亮起來就一定是安全問題」這個性質，而那個性質是 Tier 2 值得
> 存在的全部原因。詳見 C60。

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
**Pinia 不在裡面** —— 2026-08-15 實測退到上游 Vite 8.2.1，測試全部通過，Pinia 一個字沒改。
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

### D15 — 樣式與 UI 元件庫：**shadcn-vue 的模型**（reka-ui ＋ Tailwind v4），元件住 `platform/ui`

> ⚠️ **這個標題原本寫「shadcn-vue」，會讓人以為裝了它 —— 沒有。**
> `node_modules` 裡是 `reka-ui`／`clsx`／`tailwind-merge` 三個**原料**，
> 沒有 `shadcn-vue` 套件、沒有 `components.json`、沒有 CLI。採用的是它的
> **模型**（原始碼在自己手上），元件是手寫的。C70 拆解了哪一塊照它、哪一塊不照。

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

| #   | 項目                                                                                                 | 需要誰     | 未解決的後果                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| R1  | ~~beta 須事先報備~~ **已降級**：授權疑慮解除、退出路徑已實測（見下節）                               | 稽核／採購 | 仍需就「beta 版本流」取得核准，但談判籌碼已具備                                              |
| R2  | ~~8 個平台原生二進位須申請 SCA 例外~~ **數字錯了**：實際 **121 個／11 家族**（見下節）               | 資安       | 申請書已可產生（`vpr sca-dossier`）。**佐證必須分兩級**：89 個有 SLSA、32 個只有簽章         |
| R3  | ~~內部 registry 須鏡像全部 8 個平台包~~ **範圍錯了**：實際 **467 個套件**，含 pnpm 自身那 19 個      | 平台／IT   | 清單已可產生（`vpr mirror-manifest`，含 sha512）。缺平台變體由閘門擋下                       |
| R4  | ~~provenance 過 proxy 會遺失，須另存來源證明~~ **已解決**：digest 綁定，擷取一次即可離線驗證         | —          | 已自動化。代價是封閉環境**無法就地升相依**（見下節）                                         |
| R5  | **已證實且原處置寫錯**：`vp` 會自動下載 pnpm，且**改 `onFail` 無效、專案 `.npmrc` 也無效**（見下節） | 資安／平台 | 必須在**機器／映像檔層級**設 registry。此行為必然出現在稽核報告                              |
| R6  | ~~需要能設 cookie 的同源中間層~~ **已降級**：契約可執行、參考實作已通過（見下節）                    | 架構       | 仍需指派那一層由誰提供，但「要做到什麼」與「怎麼證明」都已成為程式碼                         |
| R7  | ~~pnpm ≥ 11 可用性~~ **已解除**：vp 自動供裝 pnpm 11.21.0                                            | —          | —                                                                                            |
| R8  | 產生器依賴第三方 `bingo`（create.bingo）**已分類**：dev-only，且該分類由閘門斷言                     | 資安       | 納入 SCA 範圍時標 dev-only，與 runtime 相依分開計嚴重度                                      |
| R9  | ~~D2 的退出保單未經測試~~ **已解除**：2026-08-15 實測退到上游 Vite 8.2.1，建置與測試全數通過         | —          | 已自動化為每季演練 + 每次 PR 的退出面檢查（`tools/exit-drill`）；成績以 `evidence.json` 為準 |

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
產物大小與 vite-plus 建置一致），首次實測時上游 Vitest **108 個測試全過**，
**應用程式原始碼一字未改**，全程 5 秒（npm cache 溫的情況）。

> ⚠️ 上面那個 108 是**那一天**的數字，刻意不隨演練更新 —— 它記的是首次實測，
> 不是現況。現況一律以 `evidence.json` 為準（C64 把這個例外寫進了閘門）。

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

### C52 — 拆掉兩道閘門：`pii-masking` 與 `csp-verify` 的證據機制

回報是「腳手架有點過度設計了會導致開發很難進行」。這一條記的是**拆了什麼、
為什麼是這兩道、以及失去了什麼** —— 後者要寫清楚，因為它會被下一個人拿去
回答稽核。

### 一、判準是「每次成本 × 觸發頻率」，不是「有沒有價值」

17 道閘門裡，真正擋住日常開發的其實不多。列出來之後兩道跳出來：

| 閘門          | 觸發時機                                         | 每次成本                                                        |
| ------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `pii-masking` | **每加一個切片**                                 | 要宣告 `personalData`，宣告的欄位在 `.vue` 裡必須包 `maskXxx()` |
| `csp-verify`  | 升 `reka-ui`／`vue`／`tailwindcss` 或改 CSP 政策 | ⚠️ **要人開瀏覽器跑一次** —— 所有閘門裡最高                     |

其餘的法遵閘門（`compliance`、`evidence-manifest`、`pii-test-data`）對 app
開發者幾乎不存在：它們只在改映射或寫出通過校驗的假資料時才說話。

D16 當初的兩軸（交付軸／迭代軸）問的是「該不該存在」。這次問的是不同的問題：
**「它每次要人付多少，乘上多久要付一次」** —— 一道兩軸都有分的閘門，
仍然可能貴到不值得。這是 D16 的補充，不是推翻。

### 二、拆的是機制，不是能力

兩道都刻意**留下工具本體**：

- `platform/pii` 的 `maskName()` 還在，`OrderList.vue` 也仍然呼叫它 ——
  **遮罩還在，只是沒有機制強制。**
- `tools/csp-verify` 的伺服器與 `--print-probe` 還在，零摩擦（不在任何
  workflow 裡），要驗 CSP 時隨時跑得起來。

拿掉的是 `--masking`／`--verify`／`--record` 與那份指紋證據檔。

### 三、失去的東西，寫在表上而不是註解裡

- **§11 II ⑨ 重新變成 🔴「欠、而且沒有東西在守」**。這是刻意的：
  拿掉閘門而讓對照表繼續顯示「已覆蓋」，**比沒有閘門更糟** ——
  那會讓組織以為有一個不存在的控制措施。
- **§11 II ⑦ 從「完整」降為「部分」**：治理面與程式碼面兩層還在，
  執行期那一層沒了。CSP 政策仍由 `policy.ts` 定義並有單元測試，
  但「瀏覽器裡真的是 enforce」不再有任何東西證明。
- `Feature.personalData` 從切片契約移除 —— 新切片不再需要回答
  「這個切片碰哪些個資」。那個問題本身是好的，只是現在沒有人問。

### 四、被自己的守衛擋了一次

新註記寫著「加一個切片時最重的一道摩擦」，而 `render.test.ts` 那條
「註記本文裡不得再出現手寫的閘門計數」的規則（C47 §六）當場紅了 ——
`一道` 命中了 `/[…\d]+\s*道/`。

那是誤報：「一道摩擦」不是閘門計數。但**沒有放寬那條規則**，改寫了註記 ——
一條會誤報的規則值得修，而修法不該是把它變鬆，除非誤報常到讓人想關掉它。
這是第一次誤報。

### 五、還沒拆的

`supply-chain`、`api-surface`、`doc-facts`、`dependency-health` 這四道才是
「改一行要跑三個 update 指令」的來源，而它們**都不是法遵推導出來的**。
下一輪要談的是它們。

---

### C50 — 查了條文才發現：對照表把 §16 的責任攬得比實際多

被問了一句「保存政策也是前端框架該包含的嗎」，去查了條文，答案是**不是** ——
而我的對照表寫著「腳手架**欠一份保存期政策**」。

### 一、條文實際上要保存三類，前端只碰得到一類

《數位經濟相關產業個人資料檔案安全維護管理辦法》§16 要求業者保存五年的是：

| 保存什麼                       | 誰持有             | 前端碰得到嗎 |
| ------------------------------ | ------------------ | ------------ |
| 個資之蒐集、處理或利用紀錄     | 資料庫／後端       | ❌           |
| 自動化機器設備之軌跡資料       | 系統／基礎設施 log | ❌           |
| 落實執行安全維護計畫之**證據** | 依計畫而定         | ⚠️ 部分      |

而第三類的交集形狀是**產出物**，不是政策。誰歸檔、存哪、銷毀排程、負責人 ——
那是組織文件，寫進 repo 只會變成一份沒有人執行的樣板。

### 二、這是 §11 II ⑦ 那次高估的鏡像

⑦ 那次是把**覆蓋**說得比實際好。這次是把**責任**攬得比實際多。

兩種都會讓表失去可信度，但第二種還多一個代價：**它會讓人去做不該腳手架
做的事**。一份「保存期政策」如果真的被寫進這個 repo，它會是一份沒有法律
效力、沒有人執行、而且讓組織以為問題已經解決的文件。

通則：**寫下「欠」之前，先確認那件事真的是自己欠的。**

### 三、腳手架真正該交的是清單，而清單要推導

新增 `--evidence`：把八份證據檔連同「它證明什麼」「保存機制是什麼」
輸出成一張 Markdown 表，直接交給法遵。

手寫那份清單的話，它會在下一個工具加進來的時候過期 —— 而這個 repo 在
「人抄下來的東西沒有人再推導一次」上已經栽了七次。

雙向驗，理由與 `verifyMap` 相同：宣告了但檔案不在（清單指向空氣，
對方以為有東西可歸檔）、閘門有證據檔但清單沒收（漏一份而沒有人會發現）。

### 四、第一次跑就抓到對照表**低估**了自己

反向那一半立刻報了 `inventory.json`：它不是任何閘門宣告的證據檔，
而 `supply-chain` 每次跑都在比對它。

原因是 `Gate.evidence` 是**單一字串**，而 `supply-chain` 實際維護**兩份**
基線。也就是說對照表記不住其中一份 —— 這次的方向是低估，不是高估，
但同樣是「表在說謊」。

用 `maintainedBy` 記下來而不是改型別：改 `evidence` 會波及 render／verify／
測試三處，而記在清單裡是等價的，還把「哪道閘門守它」寫得比原本更清楚。

### 五、`sbom.cdx.json` 到不了五年，而那是結構限制

GitHub 的 artifact 保留上限是 90 天（公開 repo）、400 天（私有）。
**沒有任何腳手架的改動能讓它到五年。** 兩條出路都是組織的決定：
進版控，或由組織的保存系統定期取走。

寫成 `retention: "ci-artifact"` 而不是留白 —— 交接表上那一格是
**⚠️ CI artifact（90 天）**，讀的人一眼看得到八份裡有一份不一樣。

### 六、順手：一條會因為 repo 變好而失敗的測試

`negative.test.ts` 有一條靠「把『❌ 未證明』改成『✅ 已證明』」來驗手改
會被抓到。補完 §16 之後整張表不再有任何一格是「未證明」——
於是那條測試因為**找不到要破壞的東西**而紅，而訊息看起來像閘門壞了。

**一條會因為 repo 變好而失敗的測試，下一個人只會把它刪掉。**
改成從輸出裡挑一個「比已證明差」的標記，兩種都沒有才是真的該紅。

---

### C49 — 把文件數字的守備範圍擴大，而最重要的決定是「哪幾份文件不守」

`tools/exit-drill` 已經守住一個數字（演練的測試數）。HANDOFF #7 要的是把守備
範圍擴大到其餘**推導得出來**的數字。新增 `tools/doc-facts`，第一次跑就抓到
**10 處過期**。

### 一、抓到的東西裡有一句是自嘲的

README 那一段寫著：

> 腳手架帶進來的東西比想像的多：**467 個套件，其中 121 個是平台限定的原生二進位，
> 分屬 11 個家族**。這些數字**全部由 `pnpm-lock.yaml` 推導**，不是抄的。

三個數字全部過期（現在是 519／144／12），**而最後那句話是假的** ——
它們正是抄的。那一句本身就是這道閘門要防的東西的最好例子：
一個關於「我們有機制」的宣稱，而機制不存在。

所以不只把數字改對，也把那句話改成閘門真的做得到的事。
另外 `32 個沒有 SLSA provenance` 現在是 43。

### 二、真正的設計決定：**刻意不守 `DECISIONS.md`**

直覺是「所有文件都守」。那是錯的，而且錯得很深。

`DECISIONS.md` 是一份**有日期的決策日誌**。「C24 當時是 467 個套件」
在寫下的那一刻是真的，而且**現在仍然是真的** —— 它陳述的是歷史，不是現況。
守它等於要求每次相依變動都回頭改寫歷史記錄，
而**一份被持續改寫的決策日誌，就不再是決策日誌了。**

`README` 與 `HANDOFF` 不一樣：它們用現在式描述「這個系統現在是什麼樣子」，
那種句子過期就是錯的。

（`exit-drill` 確實會檢查 `DECISIONS.md`，那是刻意的例外：
它守的那一句宣稱的是**當前**的演練成績，不是歷史。兩者不衝突。）

### 三、登記的是整句樣式，不是「任何 N 個 X」

`HANDOFF.md` 裡有「8 個原生二進位」（授權實測的那一批）與
「22 個原生二進位」（lightningcss 那一批）—— 兩個都是**子集**，都是對的。
用寬鬆樣式去比對總數，這道閘門第一天就會對著兩個正確的數字亂叫，
然後被拿掉。

所以每個事實登記的是**它被引用的那幾個句子**。代價是句子被改寫時樣式會對不上 ——
但那被做成 `never-cited` 的紅燈，**失敗方向是安全的**：
它逼人回來確認那句話還在不在，而不是靜靜地不再守它。

### 四、「13 件事」三種算法都不是

README 說 HANDOFF 收了「13 件事」。三個都說得通的算法各給出不同答案：
不重複項次 **15**、最大編號 **16**、未決項 **14**。**一個都不是 13** ——
也就是說它從來就是抄的。

選「不重複項次」並把定義寫死在登記表裡。理由是它最不會漂移：
判斷「未決」要去解析 ✅ 標記，而那個標記的寫法沒有約定 ——
第一次有人改寫成別的樣子，這個數字就會安靜地變成另一個意思。

**一個定義含糊的數字，它的守衛會被人用「改守衛」而不是「改文件」來修好。**

### 五、A1：沒有事實來源的數字不守

「四個目標平台」「每個約 4 MB」這種數字沒有 repo 內的權威來源。
硬守只能靠人再抄一次期望值進登記表 ——
那是把同一個問題換一個地方犯，而且換到一個更少人會看的地方。

### 六、為那條 regex 規則改的第四次程式碼

`(\d+)(?:–(\d+))?` 是「可選群組裡包量詞」，`security/detect-unsafe-regex`
當場擋下。改成單一字元類 `([\d–]+)` 再自己拆字串。

C19 記了前三次。累積四次之後值得說一句：**沒有一次是為了關掉那條規則，
每一次都是改程式碼。** 為了一行工具程式去加 disable 註解，
是在替後來的人降低那條規則的可信度 —— 而它已經擋下過真的問題
（C48 的 `[...value]` 拆碼點就是被同一組規則裡的另一條抓到的）。

---

### C48 — 個資的兩條現行義務：⑥ 抓得到的只有有校驗碼的東西，⑨ 靠宣告＋兩層檢查

法遵對照表上剩下三條「腳手架欠、而且完全沒有東西在守」的紅字，其中兩條是
**現行有效、前端做得到**的：⑥ 測試環境不得使用真實個人資料、⑨ 隱碼機制。
這一輪把兩條都補上，剩 §16（5 年保存）。

### 一、⑥：能抓的只有「亂打的字串幾乎不可能通過」的那幾類

偵測身分證字號（地區代號表＋加權校驗碼）、信用卡（Luhn）、手機格式、
以及指向真實網域的信箱。共同性質是**有校驗規則**，所以誤報率天生就低。

**姓名抓不到，而且補不滿。**「林佳蓉」與一個真的客戶的名字在字面上沒有任何
差別：沒有校驗碼、沒有格式、沒有可判定的性質。所以 ⑥ 的覆蓋是 `partial`，
而且那個 partial 是**結論不是待辦**。標成 full 就是重演 ⑦ 的高估。

刻意不驗統一編號：它有校驗碼、也好寫，但它是營利事業的識別碼不是個人資料，
收進來只換到誤報。

### 二、⑥ 第一次跑就報 45 條，而 43 條是同一個誤報

信箱的 regex 結尾寫成 `[\w.-]+`，於是 `fsevents@2.3.3`、`vite-plus@0.2.9`
這種 **npm 套件規格**全部被當成信箱 —— `名稱@版本` 與 `本地部分@網域`
在字面上一模一樣。

一道第一天就吐四十幾條誤報的閘門，不會有人去讀第四十六條。
它會被關掉，然後真的個資從此靜靜留在 repo 裡。
頂級網域一定是字母、版本號一定不是，加上 `[a-z]{2,}` 收尾之後 45 → 1，
而剩下那 1 條是還沒寫的測試檔。

後來又被自己的測試撞出兩個判斷錯誤，方向相反：

- `corp.example.com` 被報成真信箱。RFC 2606 保留的是**整棵子樹**，
  而那正是規範建議的寫法 —— **對著正確做法開火的檢查，會教人改用真網域。**
- 修它的時候寫成 `domain.startsWith("example.")`，於是 `example.com.tw`
  被當成保留網域放行 —— 那是一個真的、在台灣註冊得到的網域。
  這個方向是**漏報**，比前一個嚴重。

兩條都釘成測試了。

### 三、⑨：宣告必填，即使是空陣列

`Feature` 契約加一個**必填**的 `personalData: readonly string[]`。
必填是這個欄位的全部意義：選填的話，「這個切片沒有個資」與
「還沒有人想過這件事」會長得一模一樣 —— 而第二種正是需要被看見的那一種。
`features/shipment` 宣告 `[]`，並寫下為什麼。

這是同一個形狀的第四次出現（C33 掃 0 個套件、`health.test.ts` 的名單漂移、
`pii-check` 的掃描檔案數下限）：**「沒被檢查」與「檢查通過」必須看得出差別。**

讀宣告時**不執行切片程式碼**，只接受字面陣列。第一版是 `await import(...)`，
撞上 `import.meta.env.DEV` 在純 node 底下是 undefined；但真正該改的理由是
另一個：**一道法遵閘門不該執行被它稽核的東西**，否則 `personalData` 可以是
算出來的，review 就看不出這個切片碰了哪些個資。

### 四、⑨ 為什麼不是「型別包起來、自動隱碼」

想過讓 PII 欄位是一個包裝物件、`toString` 直接吐隱碼版，於是忘記處理的
預設結果是安全的。沒有採用：

1. **拿不出證據。**「忘記也安全」是好設計卻是弱證據 —— 稽核問「你怎麼證明
   它有隱碼」，指得出來的只有一份原始碼。現在的形狀有一道會紅的閘門
   與一支斷言渲染結果的元件測試。
2. **包裝物件會靜靜地漏出去。** `currency.format()`、`localeCompare`、
   `encodeURIComponent`、`JSON.stringify` 都會把它強制轉型，而轉出來的東西
   會進 TanStack 的快取與 Pinia 的狀態 —— 一個沒有任何東西會報錯的地方。

### 五、兩層，而且元件測試那一層最容易寫錯

靜態層看得到**每一個模板**，但它只證明原始碼裡寫了 `maskName(...)`；
一個回傳原值的實作可以讓它全綠。元件測試證明遮罩真的會遮，但只涵蓋被測到的元件。

元件測試最容易寫成「斷言隱碼後的字串有出現」。那條會過，而且**在沒有隱碼時
也會過** ——「林○○」與「林佳蓉」可以同時出現在畫面上（列表遮了、明細沒遮）。
真正該斷言的是**完整值在整份 HTML 裡不存在**，外加一條「畫面不是空的」對照組。

這是 C47 那個洞的同一課：檢查要重新推導觀測，不是讀一份宣告。

### 六、`api-surface` 看不見這次的破壞性變更，而那是它的結構限制

把 `personalData` 加成 `Feature` 的**必填**欄位，是對 `@org/slice-kit` 的
破壞性變更：下游任何一個既有切片都會編譯失敗。

而 `tools/api-surface` **完全沒有說話** —— 它只報了 `@org/pii` 那 7 個新 export。
原因是結構性的：`surface.json` 記的是「模組 → export **名稱**」，
而在一個匯出的 interface 上加一個必填屬性，不會改變任何名稱。

```json
"@org/slice-kit": ["defineFeature", "registerFeatures"]
```

D12 的規則是「改 platform 的破壞性變更必須附 codemod」，而這是**第一個
那個機制看不見的破壞性變更**。本 repo 的四個使用端都改好了，所以現況是一致的；
但這個腳手架是拿來被複製的 —— 下游團隊升級 `slice-kit` 時只會拿到一個型別錯誤，
沒有遷移路徑。

不在這一輪修（那是 api-surface 的一次重做，要比對型別形狀而不只是名稱）。
**記下來比默默吸收有價值**：它現在是 HANDOFF 上的一條。

### 七、加了 happy-dom 與 @vue/test-utils —— 與 C47 拒絕 Playwright 不矛盾

C47 才剛以「會把瀏覽器二進位拉進 `tools/supply-chain` 的盤點範圍」為由拒絕
Playwright，這裡卻加了兩個測試相依。差別不是程度，是類別：**純 JS，沒有平台
二進位、沒有 postinstall 下載。**

而且這次是量到的，不是論證的：加完之後供應鏈盤點回報
**原生二進位 144 → 144、家族 12 → 12**，只有非原生套件 375 → 419。
它們進 SBOM 與 `dependency-health` 的範圍，但永遠不會進原生家族分類 ——
而那正是 Playwright 貴的地方。

`environment` 用的是每支測試檔頂端的 `// @vitest-environment happy-dom`
docblock，所以**沒有新增任何設定檔**，D2 的退出面沒有擴大。

### 八、順手修掉一個對著例行變更喊事故的訊息

上面那次盤點本來是紅的，而它給的理由是：
「清單相同但 integrity 或摘要有變 —— 同一個版本號拿到了不同的內容物，
這比新增套件更該查。」

那句話只在一種情況下成立，而當時的情況不是它：我加的是**純 JS** 相依，
原生清單當然不會變。於是這道閘門對著一次再例行不過的變更喊事故 ——
而喊過兩次狼之後，真的那次就沒有人會讀了。

C44 在 provenance 那邊已經把這條線畫對了（`integrity-changed` 是事故、
`stale-record` 是例行）。這裡是同一條線，只是漏畫了。現在會分開講：
非原生套件數變了就說變了幾個，數目相同而摘要變了才是那句要查的話。

### 九、`[...value]` 拆的是碼點，不是字

隱碼函式原本用展開運算子拆字串，lint 擋了下來，而它是對的。
展開拆的是 Unicode 碼點：`José` 的分解形式是 5 個碼點 4 個字，
`keepHead(1)` 會留下一個**沒有附標的 e**，而長度也多算一個 ——
**遮罩長度會透露原字串的碼點數，留下來的那半個字還可能可讀。**

改用 `Intl.Segmenter` 的 grapheme 粒度。這是那條 lint 規則第一次在這個 repo
擋下一個真的安全問題，而不是一個排版偏好。

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
| **D2 完整退出演練**（R1／R9）          | ✓ 上游 **Vite 8.2.1** 建置成功、上游 Vitest 測試全過、原始碼未改（成績每季會變，以 `evidence.json` 為準）              |
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

### C53 — 出初版前的文件掃描，掃出一個假的 CI 步驟（2026-08-16）

要出腳手架初版送人工審查，所以把文件全掃一次。掃出來的東西比預期嚴重，
而且**兩件都是「綠燈代表沒有東西看過」的同一個形狀**——這個 repo 的招牌。

#### 一、`tier2-security.yml` 有一個什麼都沒檢查的綠色步驟

C52 拿掉了 `pii-check --masking`，但 workflow 裡那個步驟**被留了下來**：

```yaml
- name: 個資：畫面上必須隱碼
  run: node tools/pii-check/src/cli.ts --masking
```

當時那支 CLI 只找 `--root`、其餘旗標一律無視。於是這一步安靜地把 §11 II ⑥
又掃了一次、回傳 0 —— **CI 上是一個叫「個資：畫面上必須隱碼」的綠燈，
而 ⑨ 早就沒有任何東西在守。** C52 那個 PR 就是這樣全綠合進來的。

比單純的漏刪嚴重的地方在於**步驟名稱主動說了謊**。它會被截圖拿去回答
「你們有沒有在管個資呈現」。

**修的是類別，不是那一次**：CLI 改成不認得的旗標就 exit 1，並在訊息裡寫出
為什麼（否則最短的修法是把旗標加回白名單，那正好是錯的方向）。反向測試
四條，含一條對照組驗「認得的旗標照常運作」—— 少了它，一個「什麼旗標都紅」
的實作也會讓另外三條全過。

> 通則：**拿掉一個旗標時，要順著它去找所有呼叫端。**
> 而讓這件事不必靠記憶的，是「不認得就紅」——
> 沉默地忽略未知輸入，是把設定錯誤變成靜默通過的最短路徑。

#### 二、〈先看這張表〉的數字過期得最嚴重，而閘門一直是綠的

| 摘要表寫的                   | 實際 | 差  |
| ---------------------------- | ---- | --- |
| 例外（121 個二進位）         | 144  | 23  |
| 接受 32 個只有發佈簽章的佐證 | 43   | 11  |
| 鏡像 **467 個**套件          | 563  | 96  |

`tools/doc-facts` 全綠 —— 因為它登記的是**內文**裡的句子，那三句從來沒被登記。

這比內文過期糟得多：那張表是拿去開會投影的一頁，也是採購與資安
**唯一會讀完**的一頁。教訓不是「再多登記幾句」，是**登記的順序反了**：

> 新增引用時先問「這句話會不會被單獨拿出去用」。會的話優先登記。

已補上五個句子與一個新事實（`slsa`，有 provenance 的那 101 個）。
`no-slsa` 與 `slsa` 分成兩個事實而不是一個，理由寫在 `facts.ts`：
文件裡兩個數字都出現，只守一個的話另一個過期時整句話**讀起來仍然像對的**——
那比兩個都不守更糟，因為它有一半是真的。

#### 三、順帶把「HANDOFF 有幾項」這種手寫計數整段拿掉

HANDOFF 開頭原本寫「16 項裡有 5 項已處理／剩 11 項／真正只有人能裁決的是 9 項」。
項次長到 21 之後那一整段每個數字都是錯的。

總數有事實來源（`handoffItemCount` 數不重複項次），分項計數沒有。
**沒有事實來源的計數不要寫** —— 改成描述清單的形狀（判斷題 vs 還沒做完的事），
並把項次逐一列出。同樣的原則套用在第 18 項自己身上：它不再寫「登記了 N 個事實」，
改成叫人跑 `vpr doc-facts`，工具自己會印。

---

### C54 — 交接清單重評：定位敘述差點讓我們砍掉驗收要用的東西（2026-08-16）

出 `v0.1.0` 之後，拿〈先看這張表〉逐列問「這一列必須留嗎」。
給的定位是「**無金流、無個資留存的中型 B2C，最大同時上線 3000 人**」。

那個敘述指向**刪減**。照它走了兩輪之後才問出真正的定位：

> **一家接政府採購案的軟體服務公司。腳手架會被 fork 去接案，
> `platform/*` 發成內部套件供各案升級。**

而那指向**擴張**。淨結果是 **+1 列、1 列降級、0 列刪除**。

#### 一、真正的產出不是那個計數，是 11 列換掉了理由

刪了幾列是最不重要的數字。有價值的是：5／6／7／9／11／16 原本掛在
「貴組織可能是封閉網路」這個**假設**上，現在掛在「**契約有沒有要求
原始碼交付／機關端重建**」這個**可以去查的事實**上。

理由決定一列將來什麼時候可以被拿掉。掛在假設上的列，永遠沒有人能證明
它可以走 —— 那才是它們真正的成本。

#### 二、我問錯了軸，而錯的方式值得記下來

第一個根問題問的是「**CI 與開發機**能不能連公網」。答案是能，於是
五列一度被標成不適用。

**建置環境不是交付環境。** 建置在承包商辦公室，驗收在機關端，
而契約要求原始碼交付與機關端重建 —— 那正是那五列在解的東西。

教訓不是「要問得更仔細」，是**問「這個限制成立嗎」之前，先問「這個
限制是給誰的」**。同一個問題對兩個環境有兩個相反的答案。

#### 三、〈上線前必須〉那一欄一直混著兩種東西

它同時裝著「不做的話 CI 物理上會爆」（2／3／5）與「不做的話組織欠一個
義務」（19／20）。在單一產品的假設下這兩種恰好同向，所以看不出來；
定位一換就往相反方向走。

拆成**〈東西會壞〉**（技術硬性，與標案無關）與**〈標案觸發〉**（契約條件，
投標時確認）。後者是文字不是勾，因為受託者的義務是**逐案從委託機關繼承**的 ——
**這份清單不可能有一個固定的結論**，而假裝它有，就是這個 repo 一路在防的形狀。

#### 四、第 22 項：無障礙 —— 條件句寫完就沒有再往下走

`UI-SURVEY.md` 寫的是「**若**組織有 WCAG 要求…」，然後它止步於此：
不在 `eslint.config.js`、不在 `CONTROLS`、不在 `FUTURE`、不在交接清單。

選型其實選對了（reka-ui 的 WAI-ARIA 是它的賣點），但**元件庫有無障礙
≠ 你用它拼出來的頁面有無障礙**，而且沒有任何東西在守。

與 C52 拆掉的 ⑨ 隱碼是**一模一樣的形狀**：能力還在，強制它的東西沒有。
差別是 ⑨ 有 git 歷史與論證，這一項**從來沒有裝過** —— 也就是說沒有任何
一份文件會讓下一個人發現它不存在。**條件句是這個 repo 最常見的漏法。**

具體等級與法源刻意不寫死，以 RFP 為準（與第 21 項同一個處理）。

#### 五、`FUTURE` 裡的東西對這家公司已經是現在式

`map.ts` 的 `FUTURE` 說源碼掃描／弱點掃描／滲透測試「現行法規並未要求」，
法源掛的是證交所上市櫃指引。那句話**沒有錯，但它只回答了法規**。

政府採購的資安要求來自**資通安全管理法體系 ＋ 逐案契約**，而那兩個在
對照表上一次都沒出現。實際確認：**三項都是寫死的交付物。**

所以 `FUTURE` 前兩項住錯了常數。**刻意先只留註記不搬進 `CONTROLS`** ——
搬進去要為每條決定 gates／coverage／owed，而正確的值是逐案的；
隨手填一組固定值就是製造這張表最該擋下的那種假象。

順帶解開一個懸案：原始需求裡「必須承受得住源碼掃描和弱點掃描」那句話的
來源不是任何法規，**是標案契約**。它從第一天就在需求裡，因為那是他們的日常。

#### 六、SAST 的修法換了一條路，而不是把原本那條修通

源碼掃描報告由第三方或機關指定的商用工具產出，所以 repo 裡的 semgrep 是
**前置過濾器**。前置過濾器的成敗指標是**與商用工具的命中重疊率** ——
手寫汙點規則然後期待它跟商用工具撞在一起，是很差的賭注。

改用公開規則集（`p/security-audit` 等）同時解掉 PR #18 的兩個 blocker：
產生器不必再讀已被 C52 移除的 `Feature.personalData`，而公開規則集也不需要
自己寫 `--test`。價值論證也換掉：不是「讓報告少幾條」，是**廠商掃出來的
東西要在驗收期限內改完**。

#### 七、「已經栽了七次」本身是一個被抄的數字

`facts.ts` 的檔頭寫著這個 repo 在「人抄下來的數字沒有人再推導一次」上
栽了七次，而那個「七次」被抄進另外四個檔案。這一輪自己又發生一次
（〈先看這張表〉的三個數字），五份同時變成假的。

**一句在講「不要抄數字」的話，本身是一個被抄的數字。**

修法照 C53 的規則：**沒有事實來源的計數不要寫**，而且**不是加一** ——
加一還是沒有來源，等於重犯。`facts.ts` 留**列舉**（加一件就多一項，
不需要有人記得改計數），其餘四處拿掉數詞。

⚠️ `DECISIONS.md` 裡那一處**不動**，與 `doc-facts` 不守 DECISIONS.md 同一條
理由：有日期的決策日誌陳述的是歷史，改它等於改寫歷史。

---

### C55 — 幽靈依賴檢查：先乾跑量偽陽性，再決定範圍（2026-08-16）

C54 把交接清單第 16 項升成硬性（失敗現場從假設性的「退出演練」變成契約裡的
**機關端重建 —— 那是驗收現場**），當天實作。規則本身十行：掃出所有裸模組名，
比對該 package 自己的相依宣告。**真正的工作在範圍。**

#### 一、先乾跑，再接線

沒有直接寫進閘門，而是先寫一支拋棄式腳本掃過四層，看它會噴什麼。結果：

| 層                     | 命中                  | 真的嗎         |
| ---------------------- | --------------------- | -------------- |
| `features/*`、`apps/*` | 0                     | —              |
| `platform/*`           | 7（全在 `slice-kit`） | **全部偽陽性** |
| `tools/*`              | 20+                   | **全部偽陽性** |

`tools/*` 的原因很根本：**產生器與 codemod 的本職就是把程式碼當資料拿著**。
`slice-gen` 的模板、`codemods` 的 fixture、`conformance` 自己的反向測試 ——
它們字面上都含 `import ... from "pinia"`，而那是資料不是相依。

`platform/slice-kit` 的則更難堪：命中全在 `contract.ts` 的 **JSDoc** 裡，
而那些 JSDoc 正在解釋「哪些 import 該被擋」。

假如照原訂計畫直接接線，這道閘門第一天會噴 27 條、全部是假的。
**而那正是同一週才寫進第 21 項的死法**（semgrep 公開規則集的誤報風險）——
差別只在那一次是預測，這一次是實測。

#### 二、兩個排除，各自有代價，代價都寫下來

- **`tools/*` 不掃**：它們是開發期工具，不隨產物交付。掃它們是拿誤報換零收益。
- **`tests/` 不掃**：代價是**測試檔裡的幽靈依賴看不到**。

第二個可以接受的理由不是「影響小」，是**失敗方向不同**：測試少一個相依會
**當場跑不起來**，不會安靜地混到驗收那天。真正致命的是 `src/` 那一半。

⚠️ 但依第 18 項的判準，**不可以讓它看起來像被守著的**。所以那個取捨在
反向測試裡是一條**會執行的斷言**（★「`tests/` 裡把原始碼當字串資料的不得被誤擋」）：
它從綠變紅的那天代表有人改了取捨，而不是靠人記得讀那段註解。

#### 三、剝註解，是 `importClauseBefore` 那個坑的第二次

`contract.ts` 的 JSDoc 誤報與 C41 當時「掃整份檔案有沒有出現那個識別字，
結果在定義規則的檔案上誤報」是**同一個形狀**。差別在這次乾跑先撞到，
不是等閘門上線之後被人回報。

竄改驗證：把剝註解改成 no-op，★ 那條紅，**而且真正的 repo 也紅** ——
證明那個偽陽性是真的，不是為了寫測試假想出來的。

#### 四、根目錄的宣告**刻意不算**

檢查只讀該 package 自己的 `package.json`，不併入 workspace 根目錄的宣告。

這一條有專屬的反向測試，而且它是整組的核心：「本機跑得起來」最常見的原因
就是那個套件宣告在根目錄、被提升到共用的 `node_modules`。**把根目錄算進來，
這道閘門就會在它唯一該抓的那種情況上回報綠燈** —— 一道剛好對自己的目標
失明的閘門，比沒有閘門更糟。

#### 五、六條反向測試，四條標 ★

這條規則的失敗模式**不是漏抓，是亂叫**（乾跑的 27:0 就是證據）。
所以驗「不該紅的時候不會紅」的比驗「該紅會紅」的多一倍：
子路徑匯入（`@org/slice-kit/contract` → `@org/slice-kit`）、
Node 內建的**兩種寫法**（只擋 `node:` 前綴會放過裸寫的 `from "path"`）、
註解裡的範例、`tests/` 裡的字串資料。

---

### C56 — SAST 接上了，而 C54 給的做法被實測推翻（2026-08-16）

C54 第六節建議「不要自寫汙點規則，改用 semgrep 的公開規則集」，理由是
**前置過濾器的成敗指標是與商用工具的命中重疊率，而自寫規則撞上的機率低**。

那個推理聽起來合理。**它是錯的**，而且錯得很乾脆。

#### 一、乾跑量出來的數字

照 C55 立下的規矩，先在 scratchpad 的 venv 裝 semgrep，拿一份**故意寫壞的**
fixture 去測（`route.query` → `innerHTML`、open redirect、`new Function`、
字串型 `setTimeout`）：

| 規則集             | 載入規則數 | 對 fixture 的命中 |
| ------------------ | ---------- | ----------------- |
| `p/xss`            | 12         | **0**             |
| `p/security-audit` | 22         | **0**             |
| `p/owasp-top-ten`  | 76         | **0**             |
| `p/default`        | 210        | **0**             |
| PR #18 的自寫規則  | 2          | **2**             |

不是「載入失敗」——semgrep 明確報告 `Rules run: N`、`Parsed lines: ~100%`。
**規則跑了，就是不報。**

原因不神祕：公開規則集的重心在伺服器端樣板與框架，Vue SPA 的**瀏覽器端
DOM 汙點流**是它們覆蓋得最薄的一塊。而匿名使用的註冊表還只給子集
（semgrep 自己提示 `semgrep login for additional free rules`）。

**教訓不是「公開規則集沒用」，是我用「上游維護的比較好」這種一般性推理
取代了測量。** C55 才剛把「先乾跑再接線」寫下來，這次照做，然後被打臉的
是我自己的建議——這正是那條規矩存在的價值。

#### 二、附帶的好處：自寫規則是釘住的

註冊表的 `p/xxx` 是**會移動的指標**。上游改規則不需要任何 commit，
而那會讓一個一行沒改的 PR 變紅。對一個會擋 CI 的步驟，那是 D16 裡
最差的比率：每次要人付、而且付的理由指不到任何 diff。

#### 三、blocker 1 的真正原因：配對方式，不是 fixture 命名

`semgrep --test` 必須 **`cd` 進規則目錄**、且 `--config` 指向**目錄**。
從 repo 根目錄下 `--test --config .semgrep` 配對不上——**而它不會報錯**，
它印 `No unit tests found` 然後回傳 0。

實測（1.136.0）三種情況：

| 情況                   | exit                            |
| ---------------------- | ------------------------------- |
| 正常                   | 0，印 `2/2: ✓ All tests passed` |
| **fixture 不見**       | **0**，印 `No unit tests found` |
| 規則的 sink 被拿掉一個 | 1                               |

所以防呆留著，而且變成**兩道**：`No unit tests found` 要紅，**且**輸出必須
有真的「N/N tests passed」數字。少了第二道，任何讓 semgrep 靜默的改動
都會再度變成綠燈。

#### 四、fixture 自己踩了兩個坑，兩個都值得留著

- 檔頭的說明文字裡寫了 `ruleid:` 這個關鍵字，semgrep 把**註解裡的說明**
  當成真的標記去解析，報 `rule id mismatch`。**那其實是好消息**：
  它證明標記真的有在被讀。改法是說明裡不寫出那兩個關鍵字
- fixture 原本照真實寫法 `import { useRoute } from "vue-router"`，
  tsc 報 `Cannot find module`（`.semgrep/` 不是 package，沒有相依宣告）。
  **那個錯是對的**，不該用排除去消音——改成自己 `declare` 一個 stub，
  fixture 變成零相依。semgrep 的比對不解析模組，測到的東西一模一樣

#### 五、ESLint 與 oxlint 獨立確認了 fixture 是真的壞程式碼

加排除之前，`no-unsanitized/property` 與 `no-implied-eval` **各自抓到它**。
兩個與 semgrep 無關的工具同意這份 fixture 有問題——也就是說反向測試測的
不是一個假想的壞例子。這件事寫進 `eslint.config.js` 與 `vite.config.ts`
的註解裡，因為那兩處的排除單獨看起來像在關掉安全檢查。

⚠️ 順帶一個小坑：oxlint 的規則名要帶 plugin 前綴。寫 `no-implied-eval`
只會把它從 error **降成 warning**，看起來像生效了；而寫
`typescript/no-eval`（不存在）會讓整個 lint 設定建不起來，連掃都不開始。

#### 六、`p/default` 報的 26 條不是白跑的，但它們屬於另一個題目

程式碼層級一條都沒有，**全部是 CI 與供應鏈衛生**，最大的一群是
`github-actions-mutable-action-tag`（16 條）。查證屬實：本 repo 的 16 個
GitHub Action 全部以標籤釘住，而這個 repo 對 npm 相依做到 sha512＋
`--frozen-lockfile`＋digest 進版控。

**供應鏈的論證停在 npm 邊界，而執行那套論證的 CI 這一層是敞開的。**

記成 HANDOFF 第 23 項，**刻意不夾帶進 SAST 那個 PR**：它是 16 行 workflow
改動、影響每一次 CI 執行，而「要不要相信 GitHub 自家帳號」是一個信任決定。

---

### C57 — CI action 釘 SHA：改那 16 行不是重點，重點是三件互相咬住的東西（2026-08-16）

C56 順手掃出來的：本 repo 對 npm 相依做到 sha512 ＋ `--frozen-lockfile` ＋
digest 進版控每次比對，而 **8 個 GitHub Action（16 處引用）全部用標籤**。

標籤是發佈者可以移動的指標。重指之後 CI 下一次跑就執行新內容 ——
**沒有 commit、沒有 PR、沒有 diff**。而這些 action 跑在產出 SBOM 與證據檔的
那個 job 裡，拿得到 repo 與 secrets。

> **供應鏈的論證停在 npm 邊界，而執行那套論證的環境是唯一沒有被論證的一層。**

#### 一、改 16 行是快照。快照會過期

這是這一項最容易做錯的地方：把標籤換成 SHA、commit、收工 —— 然後下一個人
加一行 `uses: foo@v1`，而沒有任何東西會說話。**沒有強制機制的狀態不叫控制**
（與 C52 拆掉 csp-verify 的判準同一條）。

所以產出是三件**互相咬住**的東西：

|                                  | 做什麼                      | 少了它會怎樣                                                                                      |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `conformance` 的新規則           | `uses:` 不是 40 位 SHA 就紅 | 新加的 action 不會被擋                                                                            |
| `helpers:pinGitHubActionDigests` | 升級時把新版本也釘成 SHA    | **Renovate 會提出把 SHA 換回標籤的 PR**，閘門紅、而紅的原因是我們自己的機器人 —— 那種紅燈會被關掉 |
| 6 條反向測試                     | 證明規則有牙齒、也不誤擋    | 一條永遠綠的規則，和一條有效的規則長得一模一樣                                                    |

第二列是這次最容易漏掉的一格：**閘門與機器人可以互相打架**，
而打架的結果一定是閘門輸 —— 因為它每週紅一次而且每次都不是真的問題。

#### 二、選全釘，不選「只釘第三方」

「`actions/*` 是 GitHub 自家的，風險較低」聽起來合理，但採用它要寫下一句
**沒有到期日的信任假設**。而全釘的成本只是 16 行加一個 preset。

D16 兩軸：一次性成本低、之後由 Renovate 承擔升級，**每次要人付的接近零**。

#### 三、反向測試裡兩條特別的

- **「`@v0.36.0` 也要紅」**：看起來很精確的版本號**仍然是標籤**，
  一樣可以被重指。這一條單獨存在，是因為它最可能被當成例外放過
- **「沒有 `.github/workflows` 時不得紅」**：對照組的對照組。少了它，
  一個「找不到目錄就 fail」的實作會讓上面每一條「該紅」的測試都成功變紅 ——
  而原因是環境，不是規則

#### 四、缺口寫下來：`run:` 裡的容器映像沒有被守

那條檢查**只看 `uses:`**。SAST 兩步的 `semgrep/semgrep:1.145.0` 已一起改成
digest，但那是**手動**釘的，而「手動釘的東西」正是這條檢查存在的理由。

不補的原因不是懶：要在 shell 腳本裡認出映像參考，任何做得到那件事的正則
都會對路徑與網址誤報 —— 而一道會亂叫的閘門會被加例外，然後例外永遠不會拿掉
（C55 的同一個結論）。要補得解析 `run:` 區塊，不是逐行比對。

在補上之前，**改 workflow 裡的 `docker run` 要靠 review**，並且這句話寫在
HANDOFF 第 23 項而不是只寫在這裡。

---

### C58 — api-surface 改記型別形狀：四個「零命中」都長得像通過（2026-08-16）

HANDOFF 第 17 項的重做。舊版只比對「模組 → export 名稱」，所以
「在 `Feature` 上加一個必填欄位」—— 下游每個切片都編譯失敗的那種變更 ——
它一聲不吭。名稱一個都沒變，所以它是對的、也是瞎的。

#### 一、TypeScript 7 沒有舊的 compiler API

`ts.createProgram` 那一套在 7.0（Go 重寫）不存在，`lib/typescript.js` 這個檔案
本身就沒有了。可用的是 `typescript/unstable/sync`：一個跑在 tsgo 行程裡、
透過 IPC 溝通的真 checker。

`unstable` 是真的，升 TypeScript 大版本時這裡可能要改。付這個代價換到的是
**消費端真正看到的型別**，而不是自己解析原始碼猜出來的。實測 10 個進入點
約 130–180 ms，在 `vpr gate` 裡可以忽略。

備選是 `tsc --emitDeclarationOnly` 去比 `.d.ts`。它過不了穩定性那一關：
`.d.ts` 依定義保留型別別名的名字，改個名就漂移。

#### 二、C55 的規矩救了這一項四次

先乾跑量偽陽性，再決定範圍。這次的乾跑是**漂移測試**：把五個「消費端看不見」
的重構各做一次，看記錄下來的形狀會不會變。

| 重構             | 結果   | 處置                 |
| ---------------- | ------ | -------------------- |
| interface → type | 不漂移 | —                    |
| 屬性上加 JSDoc   | 不漂移 | —                    |
| 抽出內部型別別名 | 不漂移 | —                    |
| **屬性宣告重排** | 漂移   | 成員一律排序後才記錄 |
| **私有型別改名** | 漂移   | 改成前置條件擋在前面 |

最後一列是這次最花時間的一格。掃過**所有** `NodeBuilderFlags`
（`InTypeAlias`、`UseStructuralFallback`、`UseOnlyExternalAliasing`…），
沒有任何一個組合會把非匯出的型別展開成結構。所以規則變成
**「公開簽章不得引用沒有 export 的型別」**，補救是加一個 `export`。
全 repo 實測只有 2 個違規。

⚠️ **TypeScript 自己不禁止這件事** —— 實測 `tsc --emitDeclarationOnly`，
它把非匯出的 interface 原樣寫進 `.d.ts`，一個警告都沒有。所以這條規則寫在
工具裡並附上理由，而不是假裝它是常識。

#### 三、四個「零命中」，每一個都長得像通過

這次真正的收穫不是那些盲點，是**盲點的形狀全都一樣**：

1. `.vue` 元件 —— `declare module "*.vue"` 讓 checker 對 `UiButton` 與
   `UiDialog` 回報**同一個** `DefineComponent<Record<string, unknown>, …>`。
   加一個必填 prop，零漂移。而 `UiButton.vue` 的註解當時就寫著
   「歸 platform/ 治理（CODEOWNERS ＋ api-surface 破壞性變更閘門）」
2. class —— `typeToString` 對它只印 `typeof HttpError`。建構子加一個必填參數，
   零漂移。而那三個錯誤類別每個切片都會 catch
3. 索引簽章 —— `getPropertiesOfType` 看不到。`CookieAttributes` 被記成一個
   只有自己名字的空形狀
4. 前置檢查自己 —— tsgo 回報的宣告路徑是**小寫正規化過的**
   （`/Users/…` → `/users/…`），`startsWith(ROOT)` 永遠 false，於是
   「本地型別」一個都認不出來

第 4 個是最值得留下來的一個：那是**新寫的檢查自己回報零違規**，
而輸出與「檢查過了、沒有問題」一字不差。它被抓到只有一個原因 ——
在寫它之前先用別的方法量過「應該有 2 個」。

**沒有預期值的檢查，第一次跑出來的綠燈不能當結果。**

#### 四、出口要跟著擴充，否則閘門必輸（C57 的同一件事）

登記格式原本只有 `removes`。而催生這次重做的變更是「加一個必填欄位」——
它不移除任何東西，`removes` 登記不了。少了新的 `changes` 欄位，唯一能讓
CI 變綠的辦法是把那個變更收回去。

一道對合法變更沒有出口的閘門，最後被拿掉的是閘門。

兩個欄位的赦免範圍**分開**：`removes` 只赦免「export 不見了」，`changes` 只赦免
「形狀變了」。合成一個集合的話，一筆很久以前「我刪掉了 X」的登記，會順便讓
之後每一次「X 的形狀變了」永遠過關。

#### 五、一個反直覺的判定，寫下理由

**必填 → 選填也算破壞性。** 對「產生這個物件的人」是放寬，但對「讀這個屬性的人」
型別從 `T` 變成 `T | undefined`，在 strict 之下每一處讀取都編不過。

判準只有一條：**下游會不會編不過**。

#### 六、缺口寫下來：字面量／陣列／tuple 形態的常數

它們的型別變更被判成相容，只要求更新基準。理由是那類型別是**內容的投影**：
判成破壞性的話，每改一條設定就要人寫一份不存在的 codemod，而那種紅燈會被關掉。

⚠️ **這一格第一版寫得太寬，而寬掉的部分讓上面那條判準變成假的。**
原本的規則是「沒有任何呼叫簽章的 export 都算純資料」，於是 `@org/config` 的
`config`（一個 getter 物件，沒有呼叫簽章）也落在寬鬆側 —— 拿掉 `appTitle`
會被判成相容，而每個讀 `config.appTitle` 的消費端都編不過。

它與同一個 PR 剛修掉的 `UiButton.vue` 那句話是同一種東西：**一句不成立的
保護聲明**。差別只在一個寫在註解裡、一個寫在分類邏輯裡 —— 而後者更難發現，
因為沒有人會去讀它。

已收緊：匿名物件（`config`、`LAYERS`、`http`）改記成員、走嚴格比對，
寬鬆側只剩字面量、陣列與 tuple —— 正好是那段理由真正涵蓋的範圍。

實測留在寬鬆側的是 `CONTRACT_ITEMS` 與 `CSP_INCOMPATIBLE_MODULES` 兩筆；
它們少一個欄位仍然不會被擋，只會出現在基準檔的 diff 裡讓人看。

---

### C59 — 文件數字守衛第二輪：待辦自己指向一句不存在的話（2026-08-16）

HANDOFF 第 18 項。第一輪（C-A1）登記了 6 個事實，第二輪補到 13 個。

#### 一、先掃再分類，不要照著待辦做

那一格原本寫著「例如切片數（來源：`features/*`）」。**三份被守的文件裡
沒有任何一句在講切片數** —— 那個待辦指向一句不存在的話，而登記一個
零引用的事實只會讓閘門對著空氣紅。

改成先把三份文件裡所有「計數式」句子撈出來（`N 個／條／處／份…`），
扣掉已登記的，再逐一問「這個數字改變時，有沒有一個 repo 內的檔案會跟著變」。

補上五筆：契約條目（5 句）、workspace 套件數、workflow 的 `uses:` 引用處、
不重複 action 數、CODEOWNERS 條目數。

#### 二、補登記的當下，兩筆就是錯的

| 事實                       | 文件寫的 | 實測          |
| -------------------------- | -------- | ------------- |
| workflow 的 `uses:` 引用處 | 16       | **17**        |
| CODEOWNERS                 | 22 條    | **20 條條目** |

第一筆特別難看：那句話是 **2026-08-16 同一天**寫下的（C57／第 23 項），
而寫的人是同一個。**「我剛剛才數過」不是證據。**

#### 三、登記逼出一個歧義：同一個詞指兩件事

「16 個 action 全用可移動的標籤」講的是**引用處**，
「8 個 action（16 處引用）」講的是**不重複的 action**。

兩個事實共用一個講法時，沒有任何樣式分得開它們 —— 而這件事不是寫文件時
發現的，是**試著登記時**發現的。句子已改成「N 處引用」與「N 個 action」。

這是這道閘門一個沒被寫下來的副作用：**登記一個數字，會強迫你先把那句話
講清楚。**

#### 四、一筆從第一類降到第二類

CODEOWNERS 的「22 條 Unknown owner」來自 `gh api …/codeowners/errors` ——
**GitHub 的判定，不是 repo 裡數得出來的東西**。實測 C40 量到 22 的那個
commit，本地是 14 條條目、21 個 owner 引用：三個數字互不相等。

而它用現在式寫在〈先看這張表〉第 15 列 —— 被單獨拿出去用得最多的那一頁。

處理照第 18 項自己的判準拆兩半：**條目數**可推導 → 登記（現在 20）；
**「幾條被 GitHub 判無效」**不可推導 → 留著但標上量測日期，並明講它只能
當場跑那行指令。A1 的原則沒有變：硬守不可推導的數字，只是把同一個問題
換到一個更少人會看的地方犯。

#### 五、反向測試補的是「不得誤判鄰近句子」

這五筆的量詞（條／個／處）在這幾份文件裡到處都是。樣式寫寬一點就會對著
別的正確數字亂叫，而一道會亂叫的閘門會被拿掉。

因此每一筆都配了一組**該被忽略的鄰句**：「本 repo 自寫的 2 條」「反向測試
6 條」「22 個 `@yuku-*`」「8 個原生二進位」「lightningcss 22 個」——
全部是正確的數字，全部不得被碰到。另有一條單獨釘住「C40 那句 22 條
Unknown owner 不得被當成條目數守著」。

---

### C60 — 無障礙閘門：它的產出不是那道閘門，是「它看不見什麼」的量測（2026-08-16）

HANDOFF 第 22 項。裝的是 `eslint-plugin-vuejs-accessibility`（23 條全開成
error），跑在 Tier 1，本機是 `vpr a11y`。

#### 一、先乾跑再決定（C55），而乾跑的答案是「零」

23 條掃當時的 6 個 `.vue`：**一條都沒命中**。

零命中在這個 repo 是一個已經被燒過很多次的訊號，所以沒有直接當成通過。
兩步驗證：

1. 拿一份故意寫壞的 SFC 去測 —— **23 條裡 23 條都會開火**。工具是活的
2. 拿本 repo 實際的寫法去測 —— `<UiButton @click>`、空的
   `<RouterLink></RouterLink>`、`<h1>` 後面接 `<h4>`、只用顏色傳達的狀態、
   沒有 live region 的非同步狀態、缺 caption 的表格、沒有可及名稱的 `<nav>`：
   **九類裡它只看得到一類**（元件插槽裡的裸 `<img>`）

原因不神秘：這些規則比對的是**原生元素與屬性**，而本 repo 的互動幾乎都
包在元件裡，元件對它們是透明的。

#### 二、同一天用人眼讀同一批檔案，讀出四個真缺陷

表格沒有 `<caption>`、`<th />` 是空的、載入狀態沒有 live region（兩個切片）、
`<nav>` 沒有可及名稱也沒有略過導覽的連結。**四個閘門都沒報，四個都是真的。**

四個都在同一個 PR 修掉了 —— 不是順手，是**因為修了它們，「這道閘門看不見
什麼」才從一句常識變成一份有證據的清單**。一道剛裝上去就對著一批有缺陷的
程式碼回綠燈的閘門，如果沒有人去讀那批程式碼，會被當成「我們的無障礙沒問題」。

⚠️ 修法引進了本 repo 第一次使用的 `sr-only` / `focus:not-sr-only`，而
`platform/ui/src/styles/index.css` 開頭花了 20 行在講同一件事：**Tailwind
掃不到來源時，建置會成功、CSS 還會變大，但裡面一個 utility 都沒有**。
所以沒有靠 `vp build` exit 0 就相信 —— 直接去 `apps/console/dist/assets/*.css`
grep 過：`.sr-only`、`focus\:not-sr-only:focus` 與四個 `focus:` 變體全部在。
沒有那一步的話，失敗的樣子是表格上多出兩段本來該隱形的文字，而三份文件
仍然寫著「已修」。

略過導覽的那個連結也在瀏覽器裡跑過一次：平時是 1×1 且 `clip-path: inset(50%)`，
取得焦點後變成 128×40、白底、`clip-path: none`；啟用之後 `document.activeElement`
變成 `<main id="main">`、網址加上 `#main`、**router 不受影響**（那個 hash-only
的 history entry 沒有讓 view 重繪）。最後這件事本來只是推測。

其中 live region 那一項值得單獨記：正確的修法不是「加 `aria-live`」，
是**元素要在文字變化之前就已經在 DOM 裡**。原本的 `<p v-if="isPending">…</p>`
元素與文字同時出現，視覺上完全正確，輔具那邊很可能一個字都沒有。
所以改成永遠留著一個 `role="status"`，沒有狀態時它是空的。
**這一類「對的東西在錯的時間」，沒有任何靜態規則抓得到。**

#### 三、沒有併進 Tier 2，而理由是 Tier 2 自己寫的

`@org/eslint-config` 的預設匯出整份論證是「只管 oxlint 管不到的安全與邊界，
兩邊零重疊，所以這條紅線亮起來就一定是真的」。無障礙既不是安全也不是邊界。

而 D10 給 Tier 2 的三條規則（不快取、不過濾、要有時間觸發）只有一個理由：
**安全掃描的結果會隨時間失效**。無障礙不會 —— 沒有新公布的 CVE 會讓一個
有 alt 的 img 變成沒有 alt。所以做成同一個 package 的第二個匯出（`./a11y`）、
跑在 Tier 1。

副作用是好的：這一軌只剖析 template（`parserOptions.parser: false`），
完全不碰 typescript-eslint，也就不碰 C2 那個「為了 TS 7 不被支援而釘的
TypeScript 6.0.3」。

#### 四、「掃到零個」與「什麼都沒掃到」

兩者都是 exit 0，所以反向測試有兩條，各擋一種：規則 ID 的**集合**要對得上
（不比數量、不比 exit code），以及**repo 裡有幾個 `.vue`，閘門就要掃到幾個**。

第二條當場就有用：第一版的 `ignores` 寫了從 repo 根算起的路徑，而 flat config
的 `ignores` 是相對 basePath 比對的 —— 閘門那一側能排除、反向測試那一側排不掉。
兩邊都測才看得出來。

#### 五、等級刻意不寫死

程式碼註解、對照表、文件裡**一個 WCAG 等級都沒有**。要哪個等級、驗收怎麼判、
有沒有法定強制，以 RFP 為準（與第 21 項同一個處理）。把等級寫進註解，
等於用一句沒有來源的話去回答稽核會問的問題。

也因此它**不進** `tools/compliance` 的 `CONTROLS` 與 `FUTURE`：前者的條號全部
來自個資辦法，後者的 `source` 欄放的是法源，而等級的來源是逐案契約。
硬填一個進去就是 `map.ts` 開頭警告的那種「假的一列」。

#### 六、順手抓到的：`563` 那句話有第七個藏身處

加一個相依讓套件數從 563 變成 565，於是 `doc-facts` 紅了六句 —— 這是它的
正常運作。但改的時候發現 HANDOFF 第 23 項的對照表裡還有一句
「N 個套件全帶 sha512」（沒有尾巴的 `integrity`），而登記的樣式只咬得到
有 `integrity` 的那一句。**那個數字從來沒有被守過。**

已把樣式放寬到同時咬住兩句，**並補一條測試釘住那個放寬**。後半段是必要的：
把 `integrity` 加回樣式裡的話，`citations.length` 不變、never-cited 也不會紅
（另一句仍然對得到），那個洞會安靜地回來，而這一節還寫著它已經補好了。

順帶兩件同 species 的：`tools/conformance` 的
註解裡也抄著同一個數字（改成不寫數量 —— `doc-facts` 只守 `.md`），
以及 `doc-facts` 自己的示意註解裡躺著六個過期數字（改成寫 `N`）。

還有一個更小但更難看的：CLI 印的是「N 個句子」，而放寬樣式之後一條樣式
會咬住兩句 —— **一個在講「數字要對得上來源」的工具，自己印了一個對不上的
數字**。改成「N 個引用樣式」。

#### 七、C58 那個「寧可丟例外也不要回後備值」的決定，這次自己付了紅利

為了讓反向測試用 TypeScript 寫，一度給 `platform/eslint-config` 加了一份
`tsconfig.json`（`include: ["tests"]`）。**api-surface 當場炸掉**：那個 package
的進入點是 `src/index.js`，不在 `include` 裡，於是它不在 program 中。

如果 `extractSurface` 當初寫成「拿不到形狀就回空物件」，這件事的症狀會是
**一個 platform 進入點的 API 表面安靜地變成空的**，而閘門全綠 ——
下一個真正的破壞性變更也就跟著全綠。它選擇丟例外，所以錯誤訊息直接指到
「進入點沒被 tsconfig 的 include 涵蓋」。

修法是把那份 tsconfig 拿掉（該 package 的原始碼是 `.js`，而 base 設定沒有
`allowJs`；測試檔由根 tsconfig 涵蓋，型別檢查照跑）。順帶記下這條給下一個人：
**在一個 JS 原始碼的 platform package 裡加 tsconfig，會改變 api-surface
看它的方式。**

---

### C61 — 兩支測試搶同一個 repo，而閘門只是隨機亮紅燈（2026-08-16）

打 v0.7.0 之前在 main 上跑 `vpr ready`，`doc-facts` 的端對端測試紅了一條。
**單獨跑同一支測試是綠的。**

原因：`tools/slice-gen/tests/e2e.test.ts` 會在 `features/` 底下**真的**產生一個
切片（它必須是真的檔案，因為 `tools/conformance` 讀的是真的檔案），跑完再刪掉。
而 `vp run -r test` 是平行跑的 —— 那幾百毫秒裡，`doc-facts` 的端對端測試
spawn 真正的 CLI 去掃真正的 repo，於是 workspace 套件數是 26 而文件寫著 25。

#### 一、最糟的不是它會紅，是它**不是每次都紅**

C59 把 `workspace-packages` 加進守備範圍是在 #31，而 #31 與 #32 兩個 PR 的
CI **都碰巧綠燈通過**。也就是說這個競態已經躺了兩個版本，靠的是運氣。

一道會隨機亮紅燈的閘門，結局在 C57 已經寫過：**閘門與機器人打架，輸的是閘門。**
差別只在這次的對手不是 Renovate，是我們自己的另一支測試。而被拿掉的會是
那個真的在守數字的東西。

量過機率再修（C55）：讓 slice-gen 的測試跑著，同時反覆跑 `doc-facts` 的 CLI，
**13 次裡紅 5 次**。修好之後同一個做法 15 次全綠。
「偶爾紅」聽起來像小事，38% 不是。

#### 二、修法：讓數數的那一側認得同一個約定

slice-gen 的那支測試在自己的檔頭就寫著「目錄名刻意取 `zz-` 開頭：在
`features/` 裡排最後，而且一眼看得出不是真的切片」。約定已經存在，只是
數數的那一側不知道。加一個 `TRANSIENT_PREFIX` 讓它知道。

⚠️ 殘留物**不歸 doc-facts 管**：slice-gen 自己有一條測試斷言「清理後
`features/` 只剩真正的切片」。真的殘留時該紅的是那一條 —— 讓一道閘門去報
另一道閘門的問題，只會讓兩邊的訊息都變模糊。

#### 三、順手把三支推導函式從 `cli.ts` 搬進 `derive.ts`

`cli.ts` 最後一行是 `process.exit(main())`，**它一被 import 就跑完並結束行程**，
所以住在裡面的 `workspacePackageCount`／`actionCounts`／`codeownersEntryCount`
沒有任何辦法被單獨測到。它們因此一條測試都沒有：唯一碰得到的是「跑整支 CLI
掃整個 repo」，而那只答得出「現在是綠的」，答不出「它在什麼情況下會數錯」。

搬出來、各收一個 `root` 之後，測試指到一棵臨時目錄樹就好 —— **不動到 repo**。
這一點在這裡特別重要：本條記的就是一個「測試動到 repo，害另一支測試變紅」
的競態，而如果補的測試自己也去動 `features/`，那就是再種一個。

### C62 — 設計系統的 owner：選了唯一一個沒有 diff 的選項（2026-08-16）

HANDOFF #14 從 2026-08-15 起就剩一格：**`platform/ui` 由誰擁有。**
CODEOWNERS 自己寫著「要加就要是真的決定」，所以這一格不能由實作者填。

#### 一、問題被回答的時候換了形狀

原本的三選一是「哪一個團隊」。實際得到的答案是一句產品描述：

> 公司會有一套基礎的 UI 版型和互動方式，但是各團隊可以依不同案件需求
> 更換配色或 component 形狀或互動方式。

這不是三個選項之一，**它是在指定擁有權要沿哪條軸切**：基礎集中、變異逐案。
而 CODEOWNERS 只能沿**路徑**切，切不出這條軸 —— 那條軸在**程式碼**裡。

它同時砍掉兩個選項，不必再問：

- **交給 `@org/team-platform-ui`（外殼團隊）出局** —— 基礎是跨案共用的，
  而 `apps/console` 是逐案的。把跨案資產交給維護單一外殼的團隊是反過來的。
  這一點對接案公司特別尖銳：`platform/*` 會發成內部套件給各案升級，外殼不會。
- **另設獨立小組出局** —— HANDOFF 自己寫過「要真的有人，否則就是掛一個
  不會回應的名字」。對一份**會被 fork** 的腳手架，預設值指向一個不存在的
  團隊是最糟的失敗模式：每個 fork 都繼承一個空位。

#### 二、業界怎麼做：hybrid，而這個 repo 已經是了

查了設計系統治理的三個模型（centralized／federated／hybrid）。
[designsystems.one](https://www.designsystems.one/frameworks) 把 hybrid 列為
2026 的預設，分工是「核心團隊守基礎與治理，產品團隊貢獻專門元件與擴充」，
並把 10–50 人的組織直接對到 hybrid。

Nathan Curtis 的
[The Fallacy of Federated Design Systems](https://medium.com/@nathanacurtis/the-fallacy-of-federated-design-systems-23b9a9a05542)
給的是反面證據，而且講得很硬：純聯邦制的設計系統活下來的比例是
**「Zero. Zero. Zero percent.」** 理由是聯邦的人「不能、也不會把系統工作
排進優先序」——他們被產品的優先序驅動。聯邦制是**選配的加法**，
永遠不是主要的運作模式。

關鍵在於：**這個 repo 的 `/platform/` 通則已經是 hybrid 了。**
CODEOWNERS 的 `── platform/ 由跨團隊抽調的 maintainer 把關（D12）──` 那段寫的是
「任何人都能提 PR，但需 maintainer 核准。目的是既不製造瓶頸、也不放任無主」
——那就是「核心團隊當平台而不是守門員」的原話，只是先被寫成了中文。

所以答案不是「要不要建一個治理模型」，是**已經有了，別在它上面再疊一層**。

#### 三、那為什麼不加一條雙簽（platform-maintainers ＋ 設計）

這是原本最像樣的選項，形狀來自本檔案自己的先例：`security-headers`、
`bff-contract`、`bff-check` 都是 `@org/platform-maintainers @org/security`，
論證是「這裡定義的是標準本身，放寬它不會讓任何測試變紅」。
`platform/ui` 完全吻合 —— #22 已經量到無障礙靜態閘門在本 repo 零命中，
也就是把無障礙做差**不會有任何東西變紅**。

**它出局的理由是機制不成立，不是論證不成立。** 見 C63：GitHub 官方文件
明講同一列上多個 owner 時「任一核准即可」。加那一列買不到共簽，
只買到一個自動加進 reviewer 清單的名字 —— 而配上一段解釋它為什麼存在的
註解，讀起來會像「這裡有兩道關卡」。那正是 C40 記過的失敗模式，換個地方重演。

#### 四、決定：維持 `/platform/` 通則（CODEOWNERS 零 diff）

⚠️ **零 diff 不等於沒有決定。** 這一條存在就是為了讓「沒有動手」與
「決定不動手」在三個月後仍然分得開 —— C40 記的是相反方向的同一個錯：
一個 no-op 配上說明，讀起來像做過決定。這次是做了決定而檔案沒變，
所以決定要寫在這裡。

#### 五、A 買不到的東西（要寫下來，否則就是同一個缺陷換地方）

**無障礙仍然沒有具名負責人。** 業界的 hybrid 分工把無障礙標準明確劃在
核心團隊那一側，而 A 的核心團隊是 `platform-maintainers` —— 它是**一個
以平台工程為職能的角色**，不是設計職能。所以 A 的實際狀態是：

- 無障礙**歸屬**清楚（platform-maintainers），**職能**不清楚
- #22 那四個行為面缺口（焦點順序、對比度、標題階層、只靠顏色傳達狀態）
  靜態閘門一個都看不見，而現在也沒有一個具名的人在看
- 「設計一致性由誰把關」的答案是「沒有人專門看」——審查會是
  「程式碼對不對」而不是「這個元件該不該長這樣」

這三句是 A 的代價，不是待補的工作。要買回來的方式是**組織裡真的有設計職能**，
不是在 CODEOWNERS 加一列 —— 而那一列在 C63 之後我們知道也買不到。

#### 六、順帶產生的兩個具名缺口

回答這一格的過程量出兩件本來不知道的事，各自獨立成項：

- **HANDOFF #24** —— 「各案可以換配色／形狀／互動」目前三條軸只有一條
  有接縫，而那一條只覆蓋 16 處顏色宣告裡的 5 處。
- **HANDOFF #25** —— CODEOWNERS 的三層落差（C63）。

---

### C63 — CODEOWNERS 有三層落差，而文件只寫了中間那層（2026-08-16）

查 C62 的雙簽選項時，順著「同一列兩個 owner 到底會發生什麼」查下去，
發現這份 CODEOWNERS 距離「生效」有三道關，而文件只記了第二道。

#### 三層

| 層                                                      | 現況                                                                         | 之前寫在哪                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| 1. 分支保護／`require_code_owner_reviews`               | **沒開**（`gh api …/branches/main/protection` → `404 Branch not protected`） | ❌ 完全沒有                                      |
| 2. owner 全是 `@org/*` 佔位符 → GitHub 判 Unknown owner | 已知                                                                         | ✅ #15、C40、COMPLIANCE §12 III、CODEOWNERS 檔頭 |
| 3. 同一列多個 owner ＝ **任一核准即可**                 | 官方文件明講                                                                 | ❌ 完全沒有                                      |

第 3 層的原文（[GitHub Docs, About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)）：

> When reviews from code owners are required, an approval from **any** of the
> owners is sufficient to meet this requirement.

#### 為什麼這比「少寫了兩件事」嚴重

**12 條規則掛著 `@org/security` 當共同 owner**，而它們的註解寫的是
「所以由資安共同把關」「任何放寬都**必須經資安核可**」——
`security-headers`、`bff-contract`、`bff-check`、`supply-chain`、`compliance`、
`csp-verify`、`pii-check`、`platform/pii`、`.semgrep/`、`eslint.config.js`、
`.npmrc`、`.github/workflows/`。

在 GitHub 原生行為下那兩句話是**假的**：platform-maintainers 一個人按核准
就滿足要求，資安只會被自動加進 reviewer 清單、不會被要求。

而更麻煩的是時序：**#15 被寫成「採用這份腳手架的第一件事」**。
做完它、第 2 層拆掉之後，讀的人會非常合理地認為共簽開始生效了 ——
它不會。第 1 層和第 3 層原本連提都沒提，所以沒有任何東西會糾正這個推論。

這是 C40 那句「存在不等於生效」的第二次發作，而且這次是在**同一個檔案**裡。

#### ⚠️ 「那就拆成兩列」是行不通的

直覺的修法是把 `@a @b` 拆成兩行。**不行** —— 最後一條匹配的規則獨贏，
前面那條的 owner 被**取代**而不是合併。原生要強制兩方核准，唯一的辦法是
**兩條不同路徑各有不同 owner**，也就是把檔案拆到不同目錄，不是把 owner 拆到不同行。

#### 這**不會**推翻的東西

C44 的「Renovate 用 `workflow_dispatch` 而非自動觸發」把
「`tools/supply-chain/` 與 `.github/` 都是 `@org/security` 共管」當成理由之一。
那個決定**不受影響，而且變得更站得住** —— 共簽本來就不強制的話，
讓 bot 自主提交那些路徑只會更糟。

#### 為什麼這次不動手修

修它要動的是**組織設定**（分支保護規則）與**檔案佈局**（要強制共簽就得
拆目錄），兩件都不是實作者能單方面決定的，而且第 1 層在 `@org/*` 換掉之前
開了也沒有意義。所以照 A1 的做法：**量到、寫下、具名**，成為 HANDOFF #25。

⚠️ 這裡刻意**不加閘門**。判定「共簽有沒有生效」要打 GitHub API，
會因為 token 權限與速率限制而變紅、而不是因為真的有問題 ——
與 CODEOWNERS 檔頭第 16–17 行拒絕把 `codeowners/errors` 做成閘門同一條理由，
也與 C57 同一條理由。

### C64 — 退出演練壞了 19 個 PR，而它每季才跑一次（2026-08-16）

開始做 HANDOFF #24 時，照 #24 自己寫的第一步去驗「app 端覆寫 `@theme` 會不會
被退出演練的搬家打爆」。那一步的答案是好的（`vite build` ✓、產物同級 ✓），
但為了問它必須跑 `--full` —— **而 `--full` 一跑就失敗了，在乾淨的 main 上也一樣。**

#### 一、洞：演練跑測試，卻不裝測試的相依

`runtimeDependencies()` 只收 `dependencies`，而那個判斷是**對的** ——
devDependencies 裡裝的正是被替換掉的工具鏈（`vite-plus`、`vite`、`vitest`），
全裝進去整場演練就不證明任何事。

但它漏了一類：**測試自己也有相依**。`happy-dom` 與 `@vue/test-utils` 隨
`features/order/tests/masking.test.ts`（`// @vitest-environment happy-dom`）
在 **PR #15** 進來，而演練的最後一步正是 `vitest run`。

#### 二、為什麼躺了這麼久 —— 兩層各自合理的設計疊出一個盲區

- `evidence.json` 最後一次更新是 **PR #3**，而演練**每季跑一次**
  （`cron: 0 3 1 1,4,7,10 *`，下一次 2026-10-01）。中間 19 個 PR 的 CI 從沒跑過它。
- `vpr gate` 驗的是那份證據**還新不新**（120 天），不是它**還對不對**。
  證據寫著 `result: "pass"`、日期 1 天前 —— 完全合格。

兩層都不算做錯：季演練是刻意的成本取捨，新鮮度檢查也確實在檢查該檢查的東西。
**壞的是它們中間那句沒有人再驗證過的話**（見第三節）。

#### 三、被證偽的那句話

`exit-drill.yml` 寫著為什麼每季就夠：

> 會改變它的是「有人開始在原始碼裡 import vite-plus」，
> 而那由 Tier 2 的靜態檢查每次 PR 都擋。

**PR #15 沒有人 import vite-plus。** 它只是加了一個演練不會裝的 devDependency，
而當時的靜態那一半看不見這一類。也就是說「每季就夠」的整個論證，
建立在一個經驗上不成立的前提上。

修法因此不是只補相依清單，是**把那一類補進靜態那一半**：
`accountTestDependencies()` 照 `DRILL_PLUGINS`／`DROPPED_PLUGINS` 已經在用的
雙向帳目做同一件事 —— 每一個從 `apps/console` 走得到的非 workspace devDependency
都必須登記在「要裝」或「明示不裝」之一，沒登記就紅。不打網路、只讀
package.json（A1），所以它跑在**每次 PR**。

⚠️ 修好之後 `exit-drill.yml` 的說明改成列出**涵蓋哪三類**，並明寫
「其餘的破壞方式仍然只有季演練看得到」。原本那句話的錯不在數量，
在於**把「涵蓋了幾類」講成「涵蓋了全部」**，換一個過寬的說法只是重犯一次。

#### 四、第一個洞蓋住了第二個

補上 `happy-dom` 之後 `--full` 再跑，露出**另一個**失敗：
`platform/eslint-config/tests/a11y.test.ts`（v0.7.0，PR #32 加的）
`import { ESLint } from "eslint"`，而演練同樣不裝它。

前一個洞讓 vitest 在 worker 啟動階段就死掉，所以第二個從來沒有機會顯示出來。
**一個壞掉的閘門會遮住下一個壞掉的閘門** —— 而季排程讓兩個都沒被發現。

而第二個**修不掉**：`@org/eslint-config` 的 `dependencies` 有 `typescript-eslint`
（peer `typescript >=4.8.4 <6.1.0`）與自己釘死的 `typescript: 6.0.3`，
而後者存在的理由（C2）就是 typescript-eslint 不肯跑在 TS 7 上。
**一場以「換上游工具鏈」為前提的演練，永遠裝不起那個 package 的相依。**

#### 五、於是暴露出一個真正的範圍錯誤

追下去才發現演練有兩個不一致的集合：

|                  | 集合                              |
| ---------------- | --------------------------------- |
| **複製並跑測試** | 全部 `platform/*` ＋ `features/*` |
| **安裝相依**     | 從 `apps/console` **可達**的那些  |

差集是 `@org/eslint-config` 與 `@org/bff-mock` —— 而它們**依建構就不該在裡面**：
退出保證講的是「這個應用可以用上游 Vite 重建」，而 lint 設定與 BFF mock 都不是
應用的一部分。退出 vite-plus 之後，你的 eslint 設定不需要用上游 Vite 建得起來。

所以複製範圍收斂成可達集合。判準不寫成清單而是推導：**可達＝在保證內**，
而差集會被印出來，這樣「哪些不在保證內」不會變成一個沒有人記得的預設值。
`@org/eslint-config` 的測試仍然由 `vp run -r test` 跑，只是不在這場演練裡。

#### 六、順帶：DECISIONS.md 移出成績比對的守備範圍

演練重跑之後測試數 **108 → 146**，六處引用同時變紅，其中五處在 DECISIONS.md。

把它們改成 146 會讓「2026-08-15 實測⋯146 個測試全過」變成**假的** ——
那天是 108。這正是 `tools/doc-facts` 明白拒絕守 DECISIONS.md 的同一條理由：
**守一份有日期的決策日誌，等於要求改寫歷史。**

處理方式分兩種：

- **四處是敘述**（「Pinia 一個字沒改」才是重點），數字拿掉，指向 `evidence.json`
- **一處是真的歷史紀錄**（「2026-08-15 首次實測結果」），數字留著，
  由 `counts.ts` 的 `HISTORICAL` 豁免

「首次實測」當錨點是安全的，因為**「首次」與「最後一次」互斥**：跑過兩次以上時，
講首次的句子必然不在講現況；只跑過一次時兩個數字本來就相等。
⚠️ 它配了一條反向測試 —— 少了那四個字就照樣要被咬到。否則「首次實測」
會變成一個「不想被守就加這幾個字」的萬用出口，而閘門的出口一旦好用，
三個月後每一句都會有那四個字。

於是 `DOCUMENTS_CITING_EVIDENCE` 從三份縮成兩份（HANDOFF、exit-drill README），
並從 `cli.ts` 搬進 `counts.ts` —— `cli.ts` 最後一行是 top-level `process.exit`，
清單住在那裡就沒有任何測試驗得到它（與 C61 把推導函式搬出 `cli.ts` 同一個理由）。

#### 七、順手修掉一個每季會咬人一次的小東西

演練寫完 `evidence.json` 就印「請一併提交」，**而它寫出來的檔案過不了 `vp check`**
（`JSON.stringify(_, null, 2)` 的排版與 oxfmt 不一致）。

這在這裡特別荒謬，因為那份檔案是**每季由 maintainer 手動開 PR** 併回 main 的
（CI 刻意不給能寫 main 的 token）—— 也就是那個人每一季都會撞一次
「照工具說的做，然後 CI 紅」。

⚠️ 這是同一個教訓的**第三次**：`slice-gen/src/files.ts` 寫過（「那道 fmt 才是保證」）、
`api-surface/src/cli.ts` 又寫過一次，而這裡漏了。寫完就 `vp fmt`，失敗就 exit 1。

#### 八、這件事跟 #24 的關係

**#24 要的答案拿到了**：搬家之後 `apps/console/src/styles.css` 的
`@import "@org/ui/styles.css"` 解析得到，建置成功、產物與本 repo 同級。
但拿到它的過程證明了一件更該先修的事，所以 #24 的實作退到這個 PR 之後。

---

### C65 — 設計系統的接縫：三條軸做了兩條，而做的過程撞出三個既有的洞（2026-08-17）

HANDOFF #24 要兌現的是 C62 那句產品要求 ——「一套基礎版型，各案可以換
**配色**或 **component 形狀**或**互動方式**」。#24 量到的起點是三條軸裡
只有一條有接縫，而它覆蓋三分之一。

這一輪做完前兩條。**第三條刻意沒做**，理由在第七節。

#### 一、代幣分兩層，而且那個間接是活的

```css
--color-brand-600: oklch(…); /* 色票：純粹的顏色，不帶用途 */
--color-accent: var(--color-brand-600); /* 語意：用途，值指向色票 */
```

實測（2026-08-17）：**Tailwind 把 `var(--color-brand-600)` 原樣寫進 `:root`，
不在建置期求值。** 於是 app 端只覆寫色票時，所有指向它的語意代幣跟著變。

這給各案兩種粒度：換整套品牌就覆寫色票，只換一個用途就覆寫語意。
少了這一層，各案只能一格一格追 —— 那正是 #24 量到的狀態。

順帶量到的三件事，都影響了寫法：

- `--radius-control` 生成 `rounded-control`，`--color-muted` 生成 `text-muted`。
  **所有命名空間都一樣**（`--shadow-*`／`--font-weight-*`／`--border-width-*`／
  `--spacing-*` 全試過）。所以 `rounded-(--radius-control)` 與
  `text-(--color-muted)` 那種寫法是不一致，不是必要 —— 兩處都改掉了。
- 語意層可以引用 Tailwind 的**內建**色階（`var(--color-gray-900)`），
  而且 Tailwind 會把被引用到的內建色階一起寫進 `:root`。所以這次轉換
  **不改變任何一個像素**：元件本來就用 `gray-900`，現在只是多繞一層名字。
- 唯一刻意改變的畫面：danger 的 hover 從 `brightness-95` 改成
  `--color-danger-hover`。濾鏡是**衍生**而不是宣告 —— 深色底時它會往錯的
  方向走，而且各案換不掉。三種 hover 策略（代幣／調色盤／濾鏡）收斂成一種。

#### 二、`text-white` 是這裡最容易漏掉的一格

它不長得像調色盤，所以看起來不像缺口。但各案把 `--color-accent` 換成
淺色時，primary 按鈕上那行白字**會直接消失**，而沒有任何閘門會說話。

所以它不是 `--color-white` 的別名，而是 `--color-on-accent`／`--color-on-danger`：
有了這個名字，換色的人才知道還有一格要換。

同一節的另外兩個命名判斷：

- `bg-black/40` → `bg-overlay/40`。**色相在代幣、不透明度留在元件** ——
  `--color-overlay-40` 那種代幣會讓每換一次濃淡就多一格。
- ghost 的 hover 底色叫 `--color-surface-ghost-hover`，**刻意帶 variant 的名字**。
  它與 `--color-surface-hover` 是不同的值（ghost 沒有邊框，需要更強的對比），
  而取一個假的語意名（"subtle"？"wash"？）只會讓換的人猜錯。

#### 三、尺寸刻意不代幣化

`h-8 px-3 text-sm` 留成內建 spacing。判準是 C62 那句話裡的分界：
「一套基礎的**版型**」要集中，「配色／形狀／互動」才是各案要換的。

代幣化高度與內距會長出 `--spacing-control-sm-padding` 這種名字，
而真正想換尺寸的案子要換的是**整條規則**，不是其中一個數字。
那條路由 `createUiTheme({ sizes })` 提供 —— 這是 D16 的兩軸判準。

#### 四、擴充點只能替換，不能新增，而那個限制有代價

`createUiTheme({ variants: { secondary: "…" } })` 整條替換一個 variant 的
class 字串。**不開放新增 variant 名稱**：`variant` 是 prop 型別，
開放任意字串等於讓打錯字靜靜退回預設樣式。

⚠️ 代價要寫清楚：真的要第五個 variant 就是 `platform/ui` 的 PR，
而 `api-surface` 會把它判成**破壞性變更**。那不是誤判 —— 下游只要有自己的
`Record<UiVariant, …>`（`VARIANTS` 就是一張）或窮舉的 `switch`，
加一個成員他們當場編不過。判準只有一條：下游會不會編不過。

⚠️ 另一條寫進 `theme.ts` 檔頭的限制：**覆寫的 class 字串必須寫在 `.ts` 或
`.vue` 裡**。`@source` 只掃這兩種副檔名，搬進 JSON 或環境變數的話
Tailwind 掃不到、**也不會報錯**。所以那個介面收的是字串字面值，
不是「可以從任何地方載入的設定」。

#### 五、閘門必須真的建置，而它自己成了自己要量的東西

`tools/theme-verify` 兩半：靜態（元件不准出現原始顏色）＋建置（同一份
fixture 建兩次，比對兩份 CSS）。

建置那一半非做不可，因為 Tailwind 的失敗模式是**建置成功、CSS 甚至變大、
但裡面什麼都沒有**。而比對的必須是**解析後**的值：`--color-accent` 的宣告
文字在覆寫前後一個字都不會變。

⚠️ 這支工具在自己身上踩了兩次同一個坑：

第一版把要檢查的選擇器寫死在 `cli.ts`。`@source` 掃 `.ts`，**而 Tailwind
連註解一起掃** —— 於是那幾條規則被這支工具自己的原始碼餵活了。
實測：把元件裡的用法整條刪掉，檢查照樣全綠。

改寫時留下一句「不要把選擇器寫死在這裡」的**警告**，而那句警告裡就寫著
那個選擇器。**警告的那句話讓它警告的事情發生了。**

現在候選先用元件的實際用法濾一遍。六條斷言裡五條實測會紅，逐條列在
`tools/theme-verify/README.md`。

#### 六、C55 的乾跑：15 → 0，而 #24 記的 16 也是對的

先量再接閘門。轉換前 15 處原始顏色（`UiButton` 12、`UiDialog` 3），
轉換後 0。#24 記的是「16 處顏色宣告」—— 兩個數字都對：那 16 處裡有 1 處
（`text-(--color-muted)`）當時已經是語意層，不算違規。**15 ＝ 16 − 1。**

#### 七、為什麼互動那條軸留著

它要動的是 `tools/api-surface/src/shape.ts` 的 `SFC_UNSUPPORTED` ——
不同的工具、不同的爆炸半徑、自己的反向測試。#24 警告的是**宣稱**接縫完整，
不是分兩次交付。所以：#24 仍然開著，三軸表裡互動仍然是 ❌，
`theme-verify` 的綠燈訊息與 README 都明寫「第三條不在這裡」。

#### 八、做的過程撞出三個既有的洞

**（a）`platform/ui` 沒有宣告 `tailwindcss`，一路靠 app 剛好有。**
`src/styles/index.css` 寫著 `@import "tailwindcss"`，而那個解析發生在
`platform/ui/src/styles/` —— 在 `apps/console` 的建置裡成立，換一個
消費者就不成立。conformance 的幽靈依賴檢查**只看 JS/TS 的 import**，
CSS 的 `@import` 完全在範圍外。已補上 peer ＋ dev 宣告；那條檢查的
CSS 盲區記在 HANDOFF #26。

**（b）`api-surface` 把字面值聯集展開成 `String.prototype`。**
`type UiVariant = "primary" | …` 的每個成員都是 string，於是
`getPropertiesOfType` 回傳整套 String 方法 —— 記錄下來的是 **123 行的
`charAt`／`blink`／`fontcolor`，而 union 本身一個字都沒有記到**。

也就是說那道守衛是裝飾品：把 `"primary" | "secondary"` 改成 `"primary"`，
記錄下來的形狀**完全一樣**。與 `.vue` 的 shim 同一種瞎法，只是這次發生在
一個**看起來已經記了很多東西**的條目上 —— 123 行的成員清單讓它比真正
有守的條目更像有守。

修法是一行判斷：非物件型別在展開成員**之前**攔下來，改印聯集成員。
這條界線在同一份檔案裡已經寫過兩次（`walkNamedTypes`、`carriesSignatures`
都寫著「字面量與陣列往下走會撞到 String / Array 自己的方法」），只有
`typeShape` 漏了。修完之後既有條目**零變動**，而拿掉一個 union 成員從
「毫無反應」變成「破壞性變更」。fixture 加了一個字面值聯集，三條測試釘住。

> ⚠️ 中途還踩了一次：第一版改成 `typeToString(declared)`，而那對帶 aliasSymbol
> 的型別回傳的是**別名的名字**（`{"kind":"type","type":"UiVariant"}`）——
> 一個把自己的名字當成自己形狀的條目。改名抓得到，改內容抓不到。

**（c）`vp check` 不對 `.vue` 做型別檢查。**
發現方式是想用型別層的等式（`Exact<typeof props.variant, UiVariant>`）把
兩份 union 釘在一起，而它**什麼都沒檢查**。實測：
`const broken: number = "顯然是字串"` 放在 `.vue` 裡是 **0 errors**，
同一行放在 `.ts` 裡是 **1 error**。

於是 6 個 `.vue`（含 `platform/ui` 全部元件與應用外殼）**沒有任何型別檢查
在跑**，`api-surface` 抽 props 形狀是唯一看得到它們的東西 —— 而那支工具
存在的理由，正是 `declare module "*.vue"` 讓 checker 看不見元件。
兩件事是同一個根。這一項超出 #24 的範圍（要接 vue-tsc，而它與 TS 7 ／
tsgolint 的關係要自己查一遍），記成 HANDOFF #26。

改用**讀原始碼比對**的測試：`defineProps` 的字面值、`UiVariant`、`VARIANTS`
的鍵三份必須一致，任何一邊多或少一個成員都紅（實測過）。

> 而 `defineProps` 保持字面值、不用別名，本身也是一個決定：換成別名之後
> `api-surface` 的基準檔會退化成 `選填 UiVariant`，**union 少一個成員就
> 看不見了**。拿「少寫一次」換一道變弱的閘門是不划算的。

#### 九、順帶：本 repo 的 SAST 在自己身上開了三槍，三槍都是對的

`palette.ts` 第一版把三個色階清單 `join("|")` 拼進 `new RegExp`，
吃到 `detect-non-literal-regexp` ×3 與 `detect-unsafe-regex` ×1；
`css.ts` 的 `var()` 解析吃到 `detect-unsafe-regex`。

沒有加豁免。前者改成切詞＋查表（類別名稱的結構本來就是固定的，
不需要正則），後者把 fallback 的拆解移出正則。
**一道跑在 CI 上的檢查掛在自己的正則上，是最難解釋的那種故障。**

---

### C66 — C65 自己留下的洞：代幣改了名，6 處引用沒跟上，而剛上線的閘門全綠（2026-08-17）

C65 把 `--color-muted` 改名成 `--color-fg-muted`（理由是它是**前景**色，
而那一輪多了 `--color-surface-*`，單獨一個 muted 分不出是字還是底）。
改名本身是對的，時機也是對的 —— 趁還沒有任何一案 fork。

改掉的是宣告那一側。引用那一側留在原地 **6 處**：

```
features/order/src/views/OrderList.vue      4
features/shipment/src/views/ShipmentList.vue 1
tools/slice-gen/src/files.ts（模板）          1   ← 之後每一個新切片都會複製到
```

`apps/console` 的**實際產物**（2026-08-17 實測，不是推論）：

```css
.text-\(--color-muted\) {
  color: var(--color-muted);
}
```

而 `--color-muted` 在整份 CSS 裡**沒有任何地方宣告**。瀏覽器對這種宣告的
處理是 invalid at computed-value time —— 對 `color` 而言結果等同 `inherit`，
那五個 `<dt>` 標籤安靜地失去它們與 `<dd>` 之間的視覺區分。
不是崩潰、不是對比度不足，是**看起來只是有人忘了排版**的那種壞法。

#### 一、四道閘門都亮綠，而每一道都是「對的」

| 閘門                | 為什麼沒說話                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `vp check`          | 看不到 `class` 字串裡的東西（更何況 `.vue` 根本沒型別檢查，#26） |
| Tailwind 建置       | 它不檢查 `var()` 指到的名字存不存在，照樣把規則編出來            |
| `theme-verify` 靜態 | 只掃 `platform/ui/src/components` —— 設計系統的**供給端**        |
| `theme-verify` 建置 | 比對兩份 fixture 產物的**差異**，不問任何一份自己合不合理        |

三道自訂閘門加起來，涵蓋的是「設計系統有沒有好好定義代幣」與「覆寫會不會
生效」。**沒有一道在問「有沒有人引用了不存在的代幣」** —— 而那正是改名的
失敗模式。這道缺口出現在守設計系統的那支工具上線的**同一個 PR** 裡。

#### 二、新加的第三段：產物裡不准有懸空的 `var()`

判準只有一句：產物裡出現 `var(--x)`（**沒有 fallback**）而整份 CSS 裡
沒有任何地方宣告 `--x`。

它掃得到全 repo，靠的是 `platform/ui` 那條從 repo 根往下的 `@source` glob ——
fixture 建置會把 `features/`、甚至 `tools/` 裡的模板字串一起編進來。
實測驗過死角：**只**把產生器模板改壞（兩個切片都是好的）也會紅。

**有 fallback 的一律放行**，而這一條是量出來的不是猜的：`apps/console` 的
產物共 9 筆未宣告引用，其中 **7 筆帶 fallback，且 7 筆全部是 Tailwind 自己
寫的**（`--tw-leading`、`--default-font-feature-settings`…）。把它們算成違規
＝這道檢查上線第一天就有 7 個偽陽性，然後被加例外或關掉（C41）。
剩下 2 筆沒有 fallback，兩筆都是真缺陷。

#### 三、它看不到的那一半，寫在文件裡而不是假裝沒有

| 寫法                  | 代幣不存在時 Tailwind 會…  | 抓得到嗎 |
| --------------------- | -------------------------- | -------- |
| `text-(--沒有的代幣)` | 照樣編出規則，`var()` 懸空 | ✅       |
| `text-沒有的代幣`     | **什麼都不產生**           | ❌       |

也就是說，這次把 6 處改成正規工具類名（`text-fg-muted`）之後，
**同一個錯誤下次會更安靜**。這個代價要記下來，不能只寫「已修好」。

產生器模板那一側因此另外補了一條原始碼層的耦合（`tools/slice-gen` 的
`contract-alignment.test.ts` 直接讀 `platform/ui` 的 `@theme` 清單）——
代幣改名時它會紅。**切片那一側目前沒有**，記在 HANDOFF #24。

#### 四、C55 乾跑擋掉了一個看起來很合理的檢查

補這一段時的直覺是順手加另一條：「宣告了卻沒有任何 utility 用到的代幣」，
它會從反方向抓到同一次改名。先乾跑：**27 格宣告裡有 2 格命中**，
而其中 `--shadow-overlay` 是**真的偽陽性** —— 它有被用到，只是 Tailwind
把陰影的值直接寫進 utility，不留 `var()`。另一格 `--color-brand-50`
是色票層刻意留給各案用的，未使用完全正常。

2/27，而且判準的失敗方式是「工具自己的實作細節」。沒有加。
會誤報的閘門第一天就會被加例外，而例外永遠不會拿掉（C41）。

#### 五、第三次「量 X 的工具自己成了 X 的來源」——這次跑進了產品

那 2 筆懸空引用裡的第二筆不是 `--color-muted`，是 `--var`：

`css.ts` 與 `palette.ts` 的檔頭都寫著「第一版的 grep 認不得括號語法」，
而那句話把那個 utility **完整寫了出來**。Tailwind 連 `.ts` 的註解一起掃，
於是那句警告被編成一條真的 CSS 規則，指向一個不存在的 `--var`，
一路進到**每一支 app 的產物**。

同一個形狀在這支工具上發生第三次了（前兩次見 `tools/theme-verify/README.md`），
而三次裡有兩次發生在**說明這個坑的那段文字裡**。
現在那兩處只寫括號、不補變數名，並在旁邊寫明句子為什麼長得這麼彆扭 ——
否則下一個人會把它「順」回去。

**然後在同一輪裡發生了第四次。** 給產生器補的那條測試需要一個「不存在的代幣」
當反例，第一版寫成字面值 `text-(--color-gone)`。Tailwind 把它編了出來，
於是新加的「引用」那一段當場紅了 —— 抓到的是**寫來驗證它的那條測試**。
名字現在拆成變數再組回去（掃描器是純文字的，看不到完整的候選字）。

> 四次之後可以把規律講清楚了：**在這個 repo 裡，`.ts` 的字串與註解就是
> CSS 的來源**。「這只是註解／只是測試資料」在 Tailwind v4 底下不成立，
> 而症狀會出現在別的地方（產物、閘門），不會指回寫它的那一行。

> 這一項最該帶走的不是「記得改使用端」。是：**一道閘門上線時，要問的不只
> 「它守什麼」，還有「它守的東西有沒有使用端，而使用端歸誰守」。**
> C65 的三道檢查全部長在供給端，而改名的風險全部在使用端。

---

### C67 — 第三條軸：擋著它的那道限制，有三分之二是裝飾品（2026-08-17）

C62 那句產品要求的第三條軸是「各案可以更換**互動方式**」。C65 沒做它，
理由寫著「它要動的是 `api-surface` 的 `SFC_UNSUPPORTED`，不同的工具、
不同的爆炸半徑」。那個判斷是對的，但**它接受了一個沒有被驗證的前提**：
以為那道限制真的擋著什麼。

#### 一、先量，然後前提就沒了

`SFC_UNSUPPORTED` 原本是三個巨集：`defineEmits`、`defineSlots`、`defineExpose`，
任何一個出現在原始碼裡就丟例外。旁邊的理由寫著「元件的公開面除了 props
還有它們，只認 props 卻記成完整形狀，就是看起來有守其實沒守」。

那句話是對的。**但那道絆線綁的是「巨集的名字出現在原始碼裡」，不是公開面。**
拿 fixture 元件實測兩次：

```
在 <template> 加 <slot name="header" /> 與 <slot />   → 閘門全綠
在 <template> 加 @click="$emit('picked', label)"      → 閘門全綠
```

slot 與 emit **不需要那三個巨集就能存在**。而 `UiDialog` 從落地那天起就有
三個沒有被記錄過的 slot（`default`／`footer`／`close`），`features/order` 與
`features/shipment` 兩個切片一直在用 `#close`。

也就是說 HANDOFF #24 當時寫的那句「改了會讓 `api-surface` 直接丟例外 ——
一個明確的錯誤，不是安靜的漂移」**是假的**：安靜的漂移一直都在發生，
被擋住的只有想把它寫下來的人。

#### 二、三個裡兩個是裝飾品，判準是「能不能不經宣告就存在」

`defineExpose` 不一樣，而差別很乾淨：**`<script setup>` 預設是封閉的**，
沒有那個巨集，一個實例成員都洩不出去。它的絆線與它要擋的東西是同一件事。

| 巨集           | 沒有它，那個公開面還存在嗎 | 絆線 |
| -------------- | -------------------------- | ---- |
| `defineSlots`  | 存在（`<slot>` 就夠了）    | 裝飾 |
| `defineEmits`  | 存在（`$emit()` 就夠了）   | 裝飾 |
| `defineExpose` | **不存在**                 | 真的 |

這張表是可以在寫下那道限制的當下就填出來的 —— 需要的只是問一次
「這個東西**能不能**不經宣告就存在」。三個一起擋，是把一個真判準
套用在三個不同的東西上。

#### 三、互動這條軸換不了代幣，它是靠組合換的

配色與形狀能用代幣是因為它們是**值**。互動不是值，它是結構，所以接縫是
slot 與 emit。`UiDialog` 的三格對應三種粒度：

```
default  換內容
footer   換整組收尾動作 —— 預設是「一顆關閉鈕」，各案可以放確認／取消、
         放表單送出、或放空的
close    只換那顆按鈕本身（外層仍是 reka-ui 的 DialogClose，
         所以點擊會關閉、鍵盤與焦點行為不變）
```

⚠️ **沒有為了這條軸發明任何新 API。** 三個 slot 本來就在，這一輪做的是
讓它們**被宣告、被記錄、改了會紅**。`UiButton` 只有一個 `default` slot，
它的互動就是「被點」—— 夠不夠用要等第二個案子提需求才知道，而那時候的
差別是：加一格是一筆會被比對的公開面變更，不是一次沒有人看見的漂移。

#### 四、兩個方向都要檢查，否則只是把絆線換個位置

只加解析、不加一致性檢查的話，結果是「宣告了的守得住，沒宣告的照樣安靜地
存在」—— 和之前一樣。所以模板與宣告必須完全一致：

- 模板有、宣告沒有 → **公開面比記錄大**，改了不會漂移
- 宣告有、模板沒有 → **記錄比公開面大**，消費端照著基準檔寫
  `<template #ghost>`，內容永遠不會出現，而那是一個沒有錯誤訊息的 bug

#### 五、基準檔升到第 3 版 —— 這正是那個欄位存在的理由

宣告完四個 slot 之後，閘門報的是**四筆「新增必填成員」的破壞性變更**，
要求四份 codemod。而 `platform/` 一個位元組都沒改：那四個 slot 從第一天就
存在，變的是工具開始記它們。

`cli.ts` 對 `BASELINE_VERSION` 的說明早就寫著這種情況該升版號。另一條路
（登記一份假的 codemod 讓它變綠）是 C41 的一步到位版本。升版號之後
整份 surface 重建，diff 只有 5 行：一行版本、四行 slot。

#### 六、順帶收緊的一處：解析不了的成員從「跳過」改成「丟例外」

原本 `defineProps` 的成員切割是 `split(";")` ＋「認不出來就 `continue`」。
跳過的代價是**那個成員從此不在記錄裡**，而不在記錄裡的東西改了不會漂移 ——
又一個同樣形狀的洞，只是還沒被觸發。

切割也改成真的做括號配對（只在深度 0 的 `;` 或換行切開）：slot 的正規寫法
是方法簽章、常常連分號都不寫，而 prop 的型別裡本來就可能有分號
（`meta?: { a: string; b: number }`）。這與 `tools/theme-verify/src/css.ts`
學到的是同一件事：**切錯的那幾個成員不會報錯，它們會安靜地從記錄裡消失。**

#### 七、這一輪買不到的東西，寫清楚

`defineSlots<{ footer(): VNode[] }>()` 裡的 `VNode[]` 是**一段沒有被任何東西
檢查過的文字** —— `.vue` 沒有型別檢查（HANDOFF #26），而 `api-surface`
是原文記錄它。所以：

- 「改了會漂移」→ 真的
- 「宣告與實作相符」→ **沒有人在保證**

目前兩個元件的 slot 都不帶 payload，所以這個洞現在是零風險。
**第一個帶 payload 的 slot 出現時就不是了。**

---

### C68 — 接上 `.vue` 的型別檢查：量出來的不是缺陷數，是一個沒人看得見的相依（2026-08-17）

HANDOFF #26 記著「`vp check` 不對 `.vue` 做型別檢查」，並且要求先量再決定：
「乾跑結果是幾條？**它是不是零決定這件事是半天還是三天**」。

量出來 **16 條**。而 16 條的價值不在數量 —— 在於它們全部是**同一個根因**，
而那個根因是任何一道現有閘門都看不見的。

#### 一、先讓工具自己過關，再看數字

三個正向對照跑在前面，因為「0 條」與「一個檔案都沒讀到」印出來長得一樣，
而這個 repo 已經被那個形狀騙過三次（`@source`、`@theme`、`sr-only`）：

| 對照                                          | 結果                            |
| --------------------------------------------- | ------------------------------- |
| `<script>` 裡 `const broken: number = "字串"` | ✅ `UiDialog.vue(107,7) TS2322` |
| `<template>` 裡 `{{ title.notAMethod() }}`    | ✅ `UiDialog.vue(85,68) TS2339` |
| `--listFiles` 有沒有含 `.vue`                 | ✅ 兩個元件都在程式清單裡       |

這一條後來變成工具的一部分：`missingViews()` 每次都比對「該讀的 `.vue`」
與「vue-tsc 實際讀了哪些檔」，缺一個就紅。**綠燈必須先證明有人在看。**

#### 二、`apps/console` 的 0 條是假的乾淨

| 套件                | 錯誤數 |
| ------------------- | ------ |
| `platform/ui`       | 0      |
| `apps/console`      | 0      |
| `features/order`    | 10     |
| `features/shipment` | 6      |

第一眼會讀成「應用層乾淨、切片有問題」。`--listFiles` 顯示不是：
**`apps/console` 的程式清單裡就有 `features/order/src/views/OrderList.vue`**。
同一個檔案，在 console 的程式裡 0 條、在自己 package 的程式裡 10 條。

所以缺陷不是「有幾條錯」，是**切片單獨拿出來型別檢查不會過** ——
而這個腳手架的整個賣點就是切片會被別的團隊 fork 走。

#### 三、根因：`$t` 是一個相依，而它不長得像相依

16 條全部是 `TS2339: Property '$t' does not exist`。

`$t` 由 vue-i18n augment 到 `ComponentCustomProperties` 上。
`apps/console/src/main.ts` 有 `import { createI18n } from "vue-i18n"`，
augmentation 是被那一句帶進程式的。兩個切片的模板都在用 `$t`，
**而兩個 `package.json` 都沒宣告 vue-i18n，任何一支 `.ts` 都沒有匯入它**。
`.npmrc` 是 `node-linker=isolated` ＋ `hoist=false`，
`features/*/node_modules/vue-i18n` 與 root 都不存在。執行期能動純粹是因為
`apps/console` 的 `app.use(i18n)` 把 `$t` 掛成全域。

> ⚠️ **`tools/conformance` 的幽靈相依檢查讀的是 import，而這一個不是 import。**
> 與 #26 尾巴那個 CSS `@import "tailwindcss"` 同一類：不是那道檢查寫壞了，
> 是那類相依從來不經過它掃的那個形狀。**找到它的只有 vue-tsc。**

修法實測過三種，只有一種有效：

| 做法                                                 | 剩幾條 |
| ---------------------------------------------------- | ------ |
| 只在 `package.json` 宣告 `vue-i18n`                  | 10     |
| 再加 `/// <reference types="vue-i18n" />`            | 10     |
| `import type {} from "vue-i18n";` 放進切片的 `.d.ts` | **0**  |

而那一行的另一半價值是**它是一個 import**：補完之後，這個相依從此落在
既有幽靈相依檢查的視野裡。實測：把宣告從產生器模板拿掉，`slice-gen` 的
端對端測試（它真的跑一次一致性檢查）當場紅 —— 迴圈是閉的。

#### 四、那一行放錯檔案會把 `.vue` 的解析整個弄壞，而只有一支編譯器會說話

第一版把 import 加進 `env.d.ts`。那個檔案因此從**全域腳本變成模組**，
於是裡面的 `declare module "*.vue"` 不再是環境宣告，
`routes.ts` 的 `import("./views/OrderList.vue")` 當場找不到模組。

**而它只有 tsgolint 紅、vue-tsc 全綠** —— vue-tsc 真的解析 `.vue`，
根本不需要那個 shim。這是 C57 說的「兩支工具打架」的**具體位置**，
而且方向出乎意料：不是兩者對同一段程式碼判決不同，是**一者看得見的東西
另一者看不見**。改成獨立的 `src/i18n.d.ts`，並在產生器測試裡釘住
「`env.d.ts` 不得出現頂層 import／export」。

#### 五、代價：這個 repo 現在有兩個 TypeScript

`catalog` 的 `typescript: ^7.0.2` 是原生 Go 版，已經沒有 JS 版的 compiler API：

```
Object.keys(require("typescript")).length  → 2
typeof ts.createProgram                    → undefined
typeof ts.createLanguageService            → undefined
```

而 `vue-tsc@3` → `@volar/typescript` 需要那組 API。所以 `tools/vue-typecheck`
用具名 catalog `catalog:vue-typecheck` 拉一份 JS 版的 TypeScript 5.x。

這是一個**架構層級的決定**，不是實作細節，所以是問過才做的。三個把成本
限縮住的量測：

- ~~**分歧的上界是 0。**~~ ⚠️ **這一條當天就寫錯了，方向也反了 ——
  修正見下面的〈九〉。** 當時的量測本身沒錯（現有程式碼上 0 條分歧），
  錯的是從它推出「所以要記得定期重跑比對」。
- **供應鏈成本量得出來**：+9 個純 JS 套件（565 → 574），
  **原生二進位 144 → 144、家族 12 → 12 完全不變**。TypeScript 5.x 沒有
  平台限定的二進位，所以它不進 `tools/supply-chain` 的原生家族分類。
- **範圍刻意收窄**：`tools/vue-typecheck` 只對含 `.vue` 的 package 跑，
  `.ts` 的判決仍然只有 `vp check` 一個來源。

#### 六、`strictTemplates` 量完之後不開（C55／C41）

| 設定                                             | 基準錯誤數 |
| ------------------------------------------------ | ---------- |
| 不開                                             | 0          |
| `strictTemplates: true`                          | **2**      |
| 四個 `checkUnknown*` 全開                        | 2          |
| `strictTemplates` ＋ `checkUnknownEvents: false` | 0          |
| `strictTemplates` ＋ `checkUnknownProps: false`  | 0          |

那 2 條都是 `<UiButton @click="…">`。`UiButton` 沒宣告 `click` 事件，
靠的是 fallthrough attr 落到根 `<button>` —— 而**加 `defineEmits` 反而會
關掉 fallthrough**，變成必須手動 re-emit。也就是說那 2 條要求的「修法」
比病還糟。一道會誤報的閘門第一天就會被加例外，而例外永遠不會拿掉（C41）。

不開的代價寫清楚：抓不到「prop 名字打錯」。

#### 七、買到了什麼、沒買到什麼

在 `apps/console` 的程式裡（基準 0 條）逐一植入：

| 植入                                   | 結果                                 |
| -------------------------------------- | ------------------------------------ |
| `<UiDialog :title="123">`              | ✅ TS2322                            |
| 拿掉必填的 `:description`              | ✅ TS2345                            |
| slot payload 型別用錯                  | ✅ TS2339                            |
| `<template #nope>`（不存在的 slot 名） | ❌ 不報，開 `strictTemplates` 也不報 |

第三列**把 C67 留下的第一個殘留關掉了**：`defineSlots` 裡的 `VNode[]`
不再是「沒有人在驗的文字」。前兩列同時證明 `declare module "*.vue"`
那個 shim **沒有**蓋掉跨元件的型別檢查 —— 那是反向測試的 fixture 一定要
帶著同一份 shim 的理由。

第四列是**能力邊界不是設定沒開**：`@vue/language-core` 3.x 只有
`checkUnknownProps`／`Events`／`Components`／`Directives`／`strictVModel`
五個旋鈕，沒有 unknown slot 這一項。那一半由 `api-surface` 守（C67）：
slot 的**名單**由它比對，slot 的**型別**由這裡比對。寫成一條「不得紅」的
測試，是為了升級後它哪天突然會紅時有人知道。

#### 八、這一輪沒有做的

- **`tools/` 底下的 `.vue` 不掃。** 只有兩個 fixture，而且是刻意寫壞的。
  排除規則是路徑中段 `tests/fixtures/`，**是規則不是清單** ——
  新增 fixture 不必改程式。
- **`.vue` 的檢查與 `vp check` 沒有合併。** 合併要嘛把第二個 TypeScript
  塞進所有人的編輯器路徑，要嘛等 tsgolint 支援 SFC。現在是一道獨立閘門，
  進 `vpr gate` 與 Tier 1。

#### 九、當天留下的那句手動待辦，去查證之後發現它整句都是錯的（同日補）

上面〈五〉寫著「分歧上界 0 …… 升 vite-plus 或 TS 時要重跑這個比對」，
而那句話**在七個檔案裡各抄了一份**。要把它變成可執行的閘門之前先查證，
結果是三層都不對：

**（a）偵測那一半早就存在。** `tools/vue-typecheck` 對每一條診斷都回報，
不分副檔名。所以「vue-tsc 看到 tsgolint 沒看到的東西」這個方向**每次 commit
都在跑** —— 兩道閘門一起跑，分歧的外顯特徵就是「這道紅、`vp check` 綠」。
那句「記得重跑」從寫下的當天起就是多餘的。

**（b）`.ts` 有診斷不等於分歧。** 實測在 `theme.ts` 放一行普通型別錯誤：
兩支編譯器**都**報。所以原本打算加的「分歧告警」如果只看 vue-tsc 這一側，
會把普通型別錯誤標成工具吵架。

**（c）最關鍵的一層：分歧不是風險，是這道閘門的能力。** 造得出來的實例——

```ts
// 一支 .ts 檔
import UiButton from "./components/UiButton.vue";
h(UiButton, { variant: "根本不是 variant" });
```

`vp check` → **0 errors**；`tools/vue-typecheck` → 紅。
tsgolint 看的是 `declare module "*.vue"` 那個萬用宣告（props 是
`Record<string, unknown>`，任何 prop 都合法），vue-tsc 解析真的 SFC。

**vue-tsc 是對的那一邊。** 也就是說「一邊紅一邊綠」多半是真陽性，
而不是該去重新評估決定的訊號。原本準備寫的那則告警訊息會叫人把真缺陷
當成工具問題處理 —— 那正是 C41 說的「訊息叫人做錯的事，然後閘門被關掉」。

反方向也有一個實例，而那次是 tsgolint 對的（〈四〉那個 `env.d.ts` 變成模組）。
**兩支編譯器各自有對方看不見的東西，沒有一支涵蓋另一支** —— 這才是那個
架構決定的正確描述，而「有分歧風險、記得重跑比對」是它的錯誤描述。

做的事因此不是加一個 `--compare` 模式（那會重做兩道閘門一起做的事，
D16 兩軸都是零），而是：

1. 報告按副檔名分開。`.ts` 的診斷不再被標成「`.vue` 型別錯誤」。
2. `.ts` 那一類的修法欄直接寫「照樣修掉它，`vp check` 綠燈不代表誤報」。
3. 三條反向測試釘住這個能力，其中一條是**能力邊界**：型別不符會紅，
   **多一個不存在的 prop 不會** —— `h()` 的 props 型別是
   `Props & VNodeProps & AllowedComponentProps & ComponentCustomProps` 的交集，
   多餘屬性檢查被那個交集打掉。與模板側 `checkUnknownProps` 是同一件事的
   兩個位置，兩邊都沒有守。
4. 七份文件裡那句手動待辦全部改掉。

> ⚠️ **這一條本身是一個教訓：把量測結論寫進七個檔案之前，先問它是不是
> 已經有東西在跑。** 那句話不是過期，是**寫下當天就是錯的** ——
> 而抄了七份之後，它看起來比任何一條真的閘門都更像共識。

#### 十、兩個殘留同日關掉，而其中一個的預估完全不對（同日補）

**（一）切片側寫死顏色 —— 預估要一份 Tailwind 內建 utility 清單，實際上不用。**

#24 留下的殘留寫著「判準是『切片用到的語意 utility 必須對得上一個已宣告的
代幣』，而它需要一份 Tailwind 內建 utility 的清單來排除誤判」。

那個方向是繞遠路的。`theme-verify` 從第一天就有一支偵測器
（`findPaletteUsage`），判準是**反過來的**：不問「這個類別對不對得上代幣」，
問「這裡有沒有出現原始顏色」。把它指向 `features` 與 `apps` 就好。

乾跑：**4 處，全部真陽性，0 偽陽性。**

| 位置                                   | 寫死的           |
| -------------------------------------- | ---------------- |
| `features/order/…/OrderList.vue`       | `text-gray-900`  |
| `features/shipment/…/ShipmentList.vue` | `text-gray-900`  |
| `apps/console/src/App.vue`（略過導覽） | `focus:bg-white` |
| **`tools/slice-gen/src/files.ts`**     | `text-gray-900`  |

⚠️ **第四處是前三處的來源**：產生器模板寫死了顏色，所以每個新切片天生
帶著一個換不掉的顏色。與 D15 落地當下「模板忘了 `@org/ui`」是同一個形狀
（C41）—— 產生器是教學品，它示範什麼團隊就長成什麼。

`App.vue` 那一處更值得單獨講：略過導覽連結只寫了 `focus:bg-white`、
**沒有寫前景色**，所以文字是繼承來的。各案換成深色系的那天，那條連結
會變成白底＋淺色字 —— 一個只有鍵盤使用者會遇到、而且沒有人會回報的缺陷。
改成 `focus:bg-surface focus:text-fg`，把對比寫明而不是繼承。

判定式與 `theme-verify` **共用同一支**（`slice-gen` 新增 `@org/theme-verify`
的 devDependency，該 package 開一個 `./palette` 出口）。各持一份的話，
閘門那邊收緊而模板沒跟上，兩邊測試全綠。

**（二）CSS 的 `@import`：乾跑 0 違規，但還是接了。**

四筆 `@import`，三個 package 全都已宣告。接它的理由不是「現在有東西可抓」，
是**它要抓的那個缺陷已經真的發生過一次**（`platform/ui` 的
`@import "tailwindcss"`，靠 `apps/console` 剛好宣告才解析得到）——
D16 的迭代軸有分，交付軸沒分，一軸有分就留。

⚠️ 去註解器**必須先認得引號字串**。`@source "src/*.{vue,ts}"` 裡的 `/*`
是一個合法的 CSS 註解開頭，天真的正則會從那裡吃到下一個真註解的結尾，
把中間的 `@import` 一起吞掉，而兩邊都不報錯。

> ⚠️ **那條反向測試的第一版不會鑑別，而它「通過」了。** fixture 原本用
> `**/*`，但 `/**/` 是**自閉合**的 —— 天真版只吃掉那四個字元、吞不到下一行，
> 於是兩種實作都綠。改成 `src/*.{vue,ts}` 之後，換回天真版才真的會紅。
>
> 這是同一輪裡第二次踩到「測到一半的測試與有效的測試長得一模一樣」。
> 第一次是 C68〈九〉的那句手動待辦。**驗證測試會不會鑑別，要跟寫測試
> 一樣例行** —— 這個 repo 對閘門已經這樣要求了，對測試還沒有。

> ⚠️ 順帶：講「註解會被吃掉」的那段 JSDoc，自己因為寫了一個裸的 `*\/`
> 而被提前關掉，整個測試檔變成語法錯誤。**「量 X 的工具自己成了 X 的來源」
> 這一輪是第五次。**

---

### C69 — 無障礙：量完之後決定**不裝**那道閘門，改交付一張分工表（2026-08-17）

HANDOFF #22 有四個靜態閘門看不見的缺口。做法有三條：接 Playwright ＋ axe
（要重開 C47，把瀏覽器二進位拉進 SCA 範圍）、接 axe 跑在 happy-dom 上
（純 JS，0 原生二進位）、或不做。先量再決定（C55）。

#### 一、量到的：想買的那兩條在模擬 DOM 下是壞的

| 植入（已知答案的 fixture）           | 結果                                 |
| ------------------------------------ | ------------------------------------ |
| 對比 **1.1:1** 的文字（AA 要 4.5:1） | `incomplete`，**不是** `violations`  |
| 連結只靠顏色、沒有底線               | `incomplete`（`link-in-text-block`） |
| 標題階層跳階 h1 → h4                 | ✅ `violations`（`heading-order`）   |
| 正 `tabindex`                        | ✅ `violations`（`tabindex`）        |

⚠️ **`incomplete` 是這整件事的關鍵。** axe 回四個桶，而幾乎每份教學寫的
斷言是 `expect(violations).toHaveLength(0)` —— 那在一段對比爛到不可能通過
驗收的文字上**會亮綠燈**。這正是這個 repo 被騙過五次的形狀，
而這次的差別是：**它會發生在一道專門用來守無障礙的閘門上。**

根因查得到：`color-contrast` 需要文字節點的幾何，靠 `document.createRange()`
＋ `getBoundingClientRect()`。jsdom 沒實作 `createRange`（axe-core issue #595）。
而 **happy-dom 更糟**：實測 `createRange` **在**、`getBoundingClientRect()`
回傳 **全零** —— API 在、數字是假的，比直接沒有更難察覺。

#### 二、買得到的那一條，在元件層級沒有意義

`heading-order` 是**頁面級**性質。實測 repo 裡每個畫面只有一個 `<h1>`，
而開發期的檢查單位是元件與畫面 —— 掃孤立畫面時這條規則永遠不適用。

#### 三、還有一個不是「跳過」而是「當掉」的

DOM 裡有 `<iframe>` 時，axe 在 happy-dom 下**直接丟例外**
（`Respondable target must be a frame in the current window`）。
也就是說就算只挑幾條規則接，未來哪個元件包了 frame，閘門是**當掉**不是變紅。

#### 四、一個我差點寫進 DECISIONS 的 overclaim

第一版的結論是「axe 對元件完全沒有加分，23 條 ESLint 規則已經涵蓋」。
那是**從有偏誤的樣本推出來的**：拿來比的 fixture 是為了觸發那 23 條規則而寫的，
構造上就不含「只有 axe 抓得到」的缺陷。

能講的只有：在那份 fixture 上 axe 獨有的是 `region` 與 `select-name`，
而 `region` 是頁面級的地標規則，掃孤立元件時沒有意義。**結論不變，
但理由不同** —— 理由是「想買的那兩條壞掉」，不是「axe 沒有加分」。

> 這一輪第三次踩到「從局部量測推出過強結論」（前兩次見 C68 的〈九〉〈十〉）。
> 三次都是**在寫下結論的前一刻**才發現，而三次的表面都很有說服力。

#### 五、真正決定的那件事：CI 裡的東西**不是驗收**

無障礙標章的驗收有三段，**沒有一段在 CI 裡**：Freego（掃已部署的 URL）
→ 覆核 → 人工檢測 → 抽測。

四個缺口對到成功準則之後，分工變得很清楚：

| 缺口     | 成功準則           | 等級 | 誰判定         |
| -------- | ------------------ | ---- | -------------- |
| 對比度   | 1.4.3 對比（最低） | AA   | Freego ＋ 人工 |
| 只靠顏色 | 1.4.1 顏色的使用   | A    | Freego ＋ 人工 |
| 標題階層 | 2.4.6 標題和標籤   | AA   | Freego ＋ 人工 |
| 焦點順序 | 2.4.3 焦點順序     | A    | **只有人工**   |

⚠️ **焦點順序是 A 級（最低等級就要求），而連 Freego 都判定不了。**
也就是那一格無論在 CI 裡裝什麼都買不到 —— **Playwright 也買不到**，
它要的是人跑鍵盤。

所以 A 方案付出瀏覽器二進位進 SCA 的代價，換到的是**驗收端本來就會做、
而且做得比我們準的東西**（Freego 掃的是真正要交付的那個網站，不是孤立元件）。
D16 交付軸零分。

這與這個 repo 對源碼掃描的既有立場是同一個形狀：專業公司做交付的那份掃描，
開發期只做開源的前置過濾。無障礙的結構一模一樣。

#### 六、於是做的是一張表，不是一道閘門

`tools/compliance/ACCESSIBILITY.md`（產生的，與 `COMPLIANCE.md` 同一支工具）：

- 四條成功準則 → 驗收端由哪一段判定 → 開發期擋不擋得掉，**每一格都附量測**
- 前置過濾器實際檢查的規則清單，**從 `@org/eslint-config/a11y` 推導**（A1）
- 為什麼沒有在 CI 裡跑 axe，連同上面那五筆數字

刻意是**另一個檔案**而不是 `COMPLIANCE.md` 的一節：`map.ts` 的 `article`
明寫著只收個資法那一部，而無障礙的判定者、流程、交付產出都不同。
硬塞成同一個型別，兩邊都會變形，而變形的表會開始說謊。

自我檢查與 `verifyMap` 同方向：**宣稱有閘門守 → 那個閘門 id 必須存在**；
反方向（宣稱擋不掉卻列了閘門）也紅 —— 假的洞會讓真的洞失去意義。

#### 七、不能寫的東西

⚠️ **成功準則的總數與各等級的條數，一個都沒有寫進任何檔案。**
官方頁面兩次都是 403，次級來源彼此矛盾（12 指引 66 準則 vs 13 指引 78 準則）。
C53：沒有事實來源的計數不要寫。而這份文件是要拿去給機關看的 ——
一個編錯的數字比沒有數字糟得多。

版本假設寫成**欄位**（`ACCESSIBILITY_STANDARD`）而不是註解，理由是可查證的
硬事實：Freego 2.0「已不受理此版申請」，舊版對新標章不是活的選項。
標案若指定舊版，那個欄位會讓不符看得見。

**確認標案指定的版本是組織的動作**，與 #15 同一類，記在 HANDOFF #22。

---

### C70 — 承諾有五條，檢查只有四條：空著的那一條被另一條的證據填上了（2026-08-17）

> ⚠️ **這一條只發生在 `release/v1`。** `main` 仍然是舊形狀 —— 若要讓 `main`
> 也拿到具名槽，這幾個 commit 要 cherry-pick 回去。

#### 怎麼發現的

不是靠閘門，是靠把三份文件擺在一起讀：

| 位置           | 說了什麼                                               |
| -------------- | ------------------------------------------------------ |
| `CHANGELOG.md` | 「切片產生器與一致性檢查共用同一份契約」證明**需求 1** |
| `README.md`    | **同一句話**證明**需求 2**                             |
| `CHANGELOG.md` | 需求 2 那一行**後面是空的** —— 只有它沒有子句          |
| `HANDOFF.md`   | 「二～三」合成一節，而那節只講三軸（需求 3）           |

而 `HANDOFF.md` 開頭寫著「五條，每一條都有會失敗的檢查在守」。
**那句話是假的**，而且已經推上分支了。

這是這個 repo 記過六次的同一個形狀（閘門的名字承諾的比它斷言的多），
只是這次的載體是文件不是程式碼。**一份證據被兩條承諾引用時，
空著的那一條沒有人會發現** —— 因為兩條讀起來都有東西。

#### 量出來的第二件事：三軸中的第二軸只做了一半

`UiDialog` 的值走代幣（✓）、結構走 slot（✓），**形狀沒有接縫**：
`w-[min(32rem,92vw)] top-1/2 left-1/2 -translate-*` 寫死在模板裡。
一個要把對話框改成手機版底部滑出的案子，代幣換不掉（那不是值）、
slot 換不掉（那不是結構），只能去改 `platform/ui`。

而 `HANDOFF.md` 當時寫著「接縫是通的（下面第四條有實測證據）」。
那句話對 `UiButton` 為真、對 `UiDialog` 為假。

**沒有東西說話的原因很具體**：當時的檢查是
`readFileSync("src/components/UiButton.vue")` —— **寫死一個檔名**。
它守的不是一條規則，是一個檔案。

#### 決定

**一、`createUiTheme` 的形狀改成「元件 → 具名槽」**（breaking，附 codemod
`flatten-ui-theme-to-components`）。舊形狀 `{ variants, sizes }` 是按鈕的概念
長在全域 API 上，第二個元件沒有地方可去。

改的時機是判準本身：**tag 之前的代價是一個呼叫端，tag 之後是每一個 fork、永遠。**
同一個判準 C65 用過一次（趁沒有 fork 之前把 `--color-muted` 改名）。

**二、槽名照 reka-ui 的基元名**（`overlay`／`content`／`title`／`description`）。
那也是 shadcn-vue 的 part 名與 shadcn Figma kit 的圖層名。設計師說
「overlay 要更淡」，前端要改的那一格就叫 `overlay` —— **這條對應的成本是零**，
因為那些名字本來就在元件的 import 裡。

⚠️ 但 **variant 的名字不跟** shadcn（`default`／`destructive`）：
`primary`／`danger` 是設計稿上的通用語彙，而改它會動到 prop union ——
api-surface 的破壞性變更加上每個使用端。**槽是新的、沒有使用端，所以免費；
variant 不是。** 免費的對齊做，要付錢的不做。

**三、檢查器改成掃目錄**，四條寬版條文（見
`platform/ui/tests/component-contract.test.ts`）。

#### shadcn 這件事要講清楚

被問到「可不可以用腳手架已安裝的 shadcn」時查的：**沒有安裝。**
`node_modules` 裡有 `reka-ui`／`clsx`／`tailwind-merge`，沒有 `shadcn-vue`、
沒有 `components.json`、沒有 CLI。D15 的標題寫「shadcn-vue（reka-ui ＋ Tailwind v4）」
會讓人以為裝了 —— 內文講的是「以 shadcn-vue 的**方式**複製進本 repo」。

拆成三塊之後結論不一樣：

| 那一塊     | 決定                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 命名與解剖 | **照 shadcn**，成本零，而且詞彙有外部事實來源                                          |
| 樣式層     | **不照** —— 理由見下面那條更正                                                         |
| 元件來源   | 用它的 CLI 抄元件進來是 v1.x 補元件最快的路，但**不是 C70 的範圍**（那是內容不是接縫） |

> ### ⚠️ 更正（2026-08-17，讀完官方原始碼之後）
>
> 上面這一列原本寫著「它的答案是**你擁有原始碼，直接改它**，接案公司照做
> ＝ 20 個案子 20 份 UiButton」。**那句話是錯的**，而它已經進了 v1.0.0 的
> tag 與 PR #43。
>
> 現行 shadcn-vue 的 cva 表裡**沒有任何 Tailwind utility**，只有語意 class 名：
>
> ```ts
> variant: { default: "cn-button-variant-default", outline: "cn-button-variant-outline", … }
> ```
>
> 真正的樣式住在 `apps/v4/registry/styles/style-*.css`（官方提供八套 preset），
> 用 `@apply` 展開。**各案換樣式 ＝ 換一份 CSS，元件原始碼完全不動。**
> 官方 `customization.md` 的客製順序是「內建 variant → `class` →
> 改原始碼加 variant → wrapper」—— 改原始碼排第三，不是答案。
>
> 所以那個「20 個案子 20 份」的推論不成立，**前提錯了，結論不保留**。
>
> **不採用它的真正理由只有一句：CSS preset 沒有任何閘門在守。**
> `.cn-button-variant-defualt` 打錯一個字會產生一個永遠不匹配的 class，
> 畫面安靜地少一塊樣式 —— 正是本 repo 被騙過六次的形狀，也正是條文 ⑤
> 存在的理由。具名槽打錯字是編譯失敗。
>
> 兩邊的失敗輪廓相反，而且各自對自己的命題是對的：它的下游是任意專案、
> 沒有共用閘門，所以要選一個「不用逐元件接線」的機制；這個 repo 的命題是
> **把架構決策寫成閘門**，所以選一個「打錯字會紅」的機制。
> **不是同一題的兩個答案，不需要改設計。**
>
> 這是本輪第四次從局部證據推出過強結論（前三次記在 C65／C68／C69）。
> 共同形狀：**拿一次觀察去推一個關於外部專案「一律如此」的結論。**
> 這次的具體教訓是 —— **要引用一個上游專案的設計決定，先讀它現在的原始碼。**

#### 刻意不守的東西

**「接縫夠不夠」不是靜態事實。** 一個元件該開幾個槽是設計判斷，
交給 `CODEOWNERS` 與 PR。做成規則的話它會長成「每一塊 class 都要有槽」，
然後 `UiDialog` 那兩個排版用的 `<div>`（`mt-4`／`mt-6 flex …`）會被逼出
沒有人會覆寫的槽名 —— C41：會誤報的閘門第一天就會被加例外，
而例外永遠不會拿掉。

守得住的只有兩件事：**有沒有接縫**，以及**接縫有沒有漂**。兩件都證明過會紅
（把 `UiDialog` 那一格從 `UiThemeOverride` 拿掉 → ②③ 紅；
把 `inject` 拿掉只留預設表 → ③ 紅）。

#### 順帶修掉的一個誤判

第一版把「宣告的槽 ＝ 預設表的鍵」當成主要買點。**它其實大半是白買的** ——
`Record<X, string>` 是滿的，表少一個鍵 TypeScript 自己就會擋。
真正買到的是**跨檔案的那一段**：`UiThemeOverride` 宣告的槽 union 與元件裡
真的有表的槽對不上時，型別完全合法而新加的槽靜靜地什麼都不做。

條文留著，但理由重寫過。**買點寫錯的閘門會在下一次重構時被當成冗餘刪掉。**

---

### C71 — 閘門名冊被抄在 package.json、兩個 workflow 與 README，而沒有東西在斷言它們一致（2026-08-18）

> ⚠️ **這道閘門已於 `v1.0.3` 移出 `release/v1`。** 下面的分析全部成立，
> 但它守的東西**面向開發流程**，不在 v1 的範疇裡 —— 判準與經過見 C72。
> 這一條保留原文不改：問題是真的，發作也是真的，只是解法住在 `main`。

`v1.0.1`（PR #51）修掉一個症狀：`doc-facts` 只跑在 CI 的 Tier 2，不在
`scripts.gate` 裡，所以本機 `vpr ready` 可以全綠而推上去 CI 紅 —— 而 README
有一節就叫〈一次跑完所有檢查〉。

**成因沒動。** 同一份閘門清單被手抄在下列每一處 —— 這裡刻意不寫「N 處」，
那正好是這支工具在防的那種數字（C53）：

| 位置                             | 抄的是什麼                             |
| -------------------------------- | -------------------------------------- |
| `package.json` 的 `scripts.gate` | 本機要跑哪幾道，以及順序               |
| `package.json` 的各別名          | 每一道要能單獨跑（`vpr theme-verify`） |
| `.github/workflows/tier1-*.yml`  | Tier 1 跑哪幾道                        |
| `.github/workflows/tier2-*.yml`  | Tier 2 跑哪幾道                        |
| README〈兩層檢查〉那張表         | 讀者判斷「PR 會被什麼擋下」的那一格    |

實測 `grep -rn "scripts.gate" --include='*.ts'` **零命中** —— 沒有任何程式碼
知道那份清單存在。C52 的話在這裡完全適用：**沒有執行機制的狀態不是控制。**

#### 寫這道閘門的當下就抓到第二次發作

README 那張表的 Tier 2 那格寫著「一致性檢查 + ESLint 安全規則」，而 Tier 2
實際上還跑 `api-surface` 與 `doc-facts` —— **漏了兩道**，而且不知道漏了多久。

這一條值得記下來的地方不是「又錯一次」，是**它錯在最會被讀的那一格**。
`doc-facts` 的檔頭已經記過同一件事（摘要表最先被讀、最後被登記）。
兩次的形狀一樣：**被單獨拿出去用的那一格，守備等級反而最低。**

#### 選了「斷言一致」，不是「真的推導出去」

三條路都想過：

| 路           | 做法                                                     | 為什麼不選                                                                 |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| (a) 真推導   | `scripts.gate` 與 workflow 都改成呼叫一支執行器          | tier2 檔頭明文要求**不經過可替換的驅動層**（D2）；而且 CI 會從六格變一格   |
| (c) 產生     | 從名冊產出 `scripts.gate` 與 workflow 片段，比對已提交的 | 會把兩個 workflow 變成產生物，而那兩個檔案裡最有價值的是**載明理由的註解** |
| (b) 斷言一致 | 五份照舊手寫，加一道閘門比對它們與名冊                   | **選這條**                                                                 |

(b) 的代價很誠實：**上面那張表的每一處仍然各寫一份**，只是漂移現在會紅。這與 `doc-facts`
是同一個取捨 —— 那支工具也不去改寫 README，只是不准它過期。

#### 涵蓋範圍要自己講明白

名冊**刻意不含 semgrep 與 gitleaks**：它們只在 CI 跑（docker 映像與 GitHub
Action），本機沒有對應指令，步驟本體是二十行 shell。要納進來，名冊就得能表達
docker 參數與 `uses:` 步驟 —— 那就變成 (c)。

所以比對的強度分兩級，而且寫在工具自己的輸出裡：對 `node tools/<套件>/src/cli.ts`
與 eslint 這兩類步驟是**精確的**（少一道紅、多一道也紅）；對 docker 與 `uses:`
步驟**什麼都不說**。一道只守半個檔案的閘門，必須自己講明白守的是哪半個 ——
否則它會被當成守了全部。

#### 「刻意不接」必須與「漏接」長得不一樣

`codemods` 與 `slice-gen` 在 `tools/` 底下但不是閘門（一個改東西、一個產東西，
都不判定對錯）。少了 `UNGATED` 這份清單，完整性檢查只有兩種收場：對著它們亂叫
（於是第一天就被加例外，然後例外再也拿不掉 —— C41），或乾脆不檢查。

所以 `UNGATED` 的 `why` 是必填的。`main` 上的 `ui-survey` 就是這一類（C45）。

#### 一個差點踩到的 C41

第一版想用 `readdirSync("tools")` 數工具。**實測在這台機器上會數到 16 個，
而 workspace 成員只有 7 個** —— 多出來的九個是從 `main` 切到 `release/v1`
時留下的空目錄（git 刪掉被追蹤的檔案，但 `.DS_Store` 與殘留的 `node_modules`
連結讓目錄留著）。

那樣寫的話，這道閘門會在**開發機紅、CI 綠**。判準改成「目錄裡有 `package.json`」，
而且直接用 `doc-facts` 已經有的那條規則 —— 順手把它抽成 `workspacePackages()`，
「什麼算一個 workspace 套件」現在只有一份定義。

#### 反向測試怎麼寫的

整棵假 repo 是**從名冊長出來的**：`healthy(roster)` 產出一棵照該名冊寫得完全
正確的目錄樹，每個測試再弄壞一件事。fixture 若是手寫死的，加一道新閘門就會讓
整批測試紅，而修法是回來手抄一次 —— **由這支工具的測試示範那個動作會很難看。**

判定函式因此收 `Roster` 當參數而不是直接讀模組層的 `GATES`：「同一個套件同時
登記成閘門與不接」這一類判定，只有兩邊都能動才驗得到，而**驗不到的判定與不存在
沒有差別**。

21 條測試，其中一條當場抓到真漏洞：`run:` 的抽取樣式沒有處理
`- run: 指令`（沒有 `name:` 的步驟）。現在那兩個 workflow 每一步都有 `name:`，
所以少了它也不會出錯 —— 但那正是「現在剛好沒事」的那種洞。

#### ⚠️ 這個 C71 不是 `main` 的 C71

`release/v1` 與 `main` 的編號從 C70 起就分岔了（v1 的 C70 是〈承諾有五條，
檢查只有四條〉，`main` 的 C70 是〈第二條軸只做在一個元件上〉）。兩邊的 C71
之後也不會是同一件事。**跨分支引用 C 編號之前先確認自己在哪一條線上。**

---

### C72 — v1 的範疇判準：看它守的東西給誰看，而第一個被它擋下的是剛發出去的那道閘門（2026-08-18）

> ⚠️ **文末那句「沒有任何機制在守這份文件」已於 `v1.0.5` 不再成立**，見 C73。
> 同時該版沒有照這裡寫的用 `git ls-tree`，改用了 `git ls-files` —— 理由也在 C73。
> 這一條保留原文不改：判準本身沒有變，變的只是誰在執行它。

`v1.0.2` 發布後被問了一句：「`release/v1` 現在有沒有超出 v1 的範疇？」
查下去發現有，而且就是同一版剛加進去的 `tools/gate-roster`（C71）。

問題不在那支工具寫得好不好 —— 它抓到的漂移是真的。問題是**在那之前，
「什麼算 v1 範疇」沒有寫下來過**，所以每一次判斷都是重新發明一次。

#### 兩條看起來合理的判準，各自砍錯東西

| 判準                     | 砍錯的                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| 「不服務五條承諾就出局」 | 連 `tools/doc-facts` 一起砍 —— 而它是 Tier 2 的閘門之一，守的是 README／HANDOFF 的數字 |
| 「凡是閘門皆在內」       | `gate-roster` 留下 —— 而它守的是 CI 設定的內部一致性                                   |

定下來的是第三條：**看它守的東西給誰看。**

- **面向交付物（含文件）→ 在內。** 受益者是拉 v1 去做案子的團隊。
- **面向開發流程 → 在外。** 受益者是維護者。

判定時**必須寫得出「受益者是拉 v1 的團隊」那一句**，寫不出來就不准進。
`doc-facts` 寫得出來（README 與 HANDOFF 是交付物，團隊照著做事）；
`gate-roster` 寫不出來（閘門清單漂移，痛的是維護者）。**兩邊同時解得開的
只有這一條。**

#### 它順便解掉了自我指涉

「守範疇的機制本身算不算範疇內？」—— **算。** 因為它守的是**交付物有哪些**。
這不是把判準轉一圈套在自己身上的文字遊戲：`SCOPE.md` 紅了的時候，被擋下的是
「v1 悄悄多了一個團隊沒預期的東西」，那是拉 v1 的人的問題。

#### 代價：先發布了才想清楚

`v1.0.2` 帶著 `gate-roster` 發出去了，tag 與 GitHub Release 都在。
**不撤 tag、不改寫歷史** —— 照 C-條一貫的做法：留原文、加標註、用後續版本修正。
`v1.0.3` 只做一件事（移除），讓 CHANGELOG 上「為什麼進來又出去」是一條清楚的線。

⚠️ **搬運的順序做反了。** 原訂「先在 `main` 接好、綠了，再從 v1 移除」，
實際上先移除了，`main` 那一半還開著（issue #61）。後果是這段期間
**四份手抄的閘門清單在兩條線上都沒有機制在守**，已記在 HANDOFF〈已知的
誠實缺口〉第五條。取回程式碼的來源是 `release/v1` 歷史上的 squash commit，
不是被刪分支上的那個 —— 後者 squash 之後只靠 reflog 活著。

#### 人工跑一遍判準，逼出兩件原本看不見的事

**一、`doc-facts` 不對應五條承諾中的任何一條。**
它守的是那五條**寫下來的樣子可不可信**。原本的計畫是「在 HANDOFF 承諾表補上
它那一列」，實際去補的時候發現無論塞進哪一條都是牽強的 —— 而那正是 C70 的形狀
（同一份證據掛在兩條承諾上，空著的那一條沒有人發現）。改成在 `SCOPE.md` 給它
獨立一列並寫明理由。`tools/codemods` 則相反，它自然屬於承諾一（`api-surface`
擋下的就是沒附 codemod 的變更），補進承諾一的表。

**二、README 的目錄樹列著 `tools/sast/`，而那個目錄不在 v1 的樹上。**
`git ls-tree HEAD tools/` 沒有它 —— 自寫的汙點傳遞規則住在 `.semgrep/`，
由 Tier 2 的 workflow 用釘住 digest 的容器跑。**目錄樹裡同時有一個不存在的
項目、與一個缺席的真實項目**，不知道多久了。

第二件事說明的正是這一版存在的理由：**`doc-facts` 守的是數字，不是清單。**
一份被讀者當成「這個 repo 有什麼」的目錄樹，可以整行是假的而全套閘門照樣全綠。

#### `SCOPE.md` 刻意一個導出的數字都沒有

全部列名字，不寫「幾支工具」。`doc-facts` 的 `GUARDED` 是 `README.md` 與
`HANDOFF.md` 兩份，它的檔頭寫明：加第三份檔案的那一刻，四個地方寫著「只守
README 與 HANDOFF」的句子同時變成假的。所以 `SCOPE.md` **不進 `GUARDED`**，
而是寫成「就算沒有守衛也不會腐爛成假數字」的形狀。

⚠️ 它仍然是手抄的：**加一支工具而忘了在那裡加一列，不會有任何東西說話。**
掃 `git ls-tree` 比對的檢查排在 `v1.0.5`，而且**必須用 git tree 不能用
`readdirSync`** —— 理由 C71 已經踩過一次：這台機器上 `ls tools/` 會數到十幾個，
其中大半是切分支留下的殘骸。那樣寫會開發機紅、CI 綠。

先文件、後檢查的順序是刻意的。反過來做，補文件的動機會變成「讓閘門轉綠」，
而不是「把判準真的跑一遍」—— 上面那兩件事就是跑一遍才掉出來的。

---

### C73 — 讓 `SCOPE.md` 有牙齒：問 git 追蹤著什麼，而不是問磁碟上有什麼（2026-08-19）

> ⚠️ **這個編號在 `main` 上是另一件事**（`tools/gate-kit` 抽三個 export）。
> C70 之後兩條線的編號各自往前走，日後 backport 時**不要靠編號對齊**。

C72 把「什麼准許出現在 `release/v1` 的樹上」寫成了 `SCOPE.md`，而那一版的
文末自己承認：**它仍然是手抄的，加一支工具而忘了在那裡加一列，不會有任何
東西說話。**這一版把那句話變成假的。

先文件、後檢查的順序是刻意的（C72 已記）。這裡只補一件事：那個順序**真的
付了利息** —— 人工跑一遍判準時掉出來的兩件事（`doc-facts` 對不上任何一條
承諾、README 目錄樹列著一個從來不存在的 `tools/sast/`），沒有一件是「把閘門
寫出來讓它轉綠」會發現的。

#### 兩個方向都要紅，因為壞掉的方式有兩種

| 方向                      | 壞掉的樣子                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| 樹上有、`SCOPE.md` 沒列   | 範疇裡悄悄多了東西，而**沒有人被逼著寫那句「受益者是拉 v1 的團隊」** |
| `SCOPE.md` 列了、樹上沒有 | 清單在說謊 —— 就是 `tools/sast` 那個病，只是換了一份文件             |

只驗前者，這份文件會慢慢長出一堆早就不存在的項目，而讀它的人以為那些都在。
只驗後者，加一支工具就再也沒有人會被逼著寫那句受益者 —— 而那句話正是 C72
整條判準的執行方式。

#### 事實來源：`git ls-files`，不是 `ls-tree HEAD`，更不是 `readdirSync`

C72 寫的是「用 git tree 不要用 `readdirSync`」。`readdirSync` 那一半沒有變
（這台機器上 `ls tools/` 數得到十幾個，版控裡只有七個，其中大半是切分支留下
的殘骸 —— 用磁碟當事實來源會**開發機紅、CI 綠**）。變的是另一半：

`ls-tree HEAD` 答的是「**上一個 commit** 裡有什麼」。用它的話，新增一支工具、
`git add` 了、跑 `vpr ready` —— **是綠的**，因為那支工具還沒進 HEAD，要等
commit 完才紅。而 `vpr ready` 存在的全部理由就是「推上去之前先知道」。
`ls-files` 答的是「git **現在**追蹤著什麼」（index），staged 的新目錄當場看得見，
而未追蹤的殘骸一樣被排除在外 —— 那本來就是選 git 的首要理由。

這件事是在這支工具身上自證的：`git add tools/scope-check` 之前它自己是綠的，
`git add` 之後當場紅在「樹上有、沒登記」。

⚠️ **判準也不是「目錄裡有沒有 `package.json`」**（`gate-roster` 在 `main` 上
用的那個）。那個問的是「它是不是 workspace 成員」，這裡問的是「**版控裡多了
什麼東西**」。一個只放腳本、沒有 `package.json` 的新目錄悄悄進了 `tools/`，
正是這道閘門該說話的情況，而那個判準看不見它。

⚠️ **找不到 git 就直接失敗，不退回去掃磁碟。** 一道「找不到 git 就換個比較
寬鬆的判準」的閘門，會在最需要它的環境裡安靜地換成另一件事，而且沒有人會
發現 —— 因為它還是綠的。

#### 只認表格第一欄，因為 `SCOPE.md` 的散文裡有反例

這份文件用 `` `tools/gate-roster` `` 當**反面教材**（刻意在外的那一項）。
如果檢查是去 grep 全文的路徑，那個反例會被算成「已登記」，於是有一天
`gate-roster` 真的回到 v1 的樹上時，這道閘門是綠的。所以它只讀
〈准許存在的〉那一節底下、表格第一格的反引號內容 —— 散文提到的不算數。

同樣的道理，**那一節整個不見時是紅燈，不是「這一層沒有清單」**。把標題改掉
就能讓整層不再被檢查而且是綠的 —— 那是 C41 講的那種例外，只是偽裝成打字錯誤。

#### 這道閘門刻意不守的東西

- **README 的目錄樹。** 它只讀 `SCOPE.md`。忘了同步 README 一樣是全綠 ——
  也就是 `tools/sast` 那個病還活著，只是換了一份文件。
- **README〈兩層檢查〉那張表。** 守它的機制在 `main`（`gate-roster`），
  不在這條線上，理由見 HANDOFF〈已知的誠實缺口〉第五條。
- **「受益者是拉 v1 的團隊」那一欄寫得對不對。** 它只斷言那一欄**存在**。
  判斷仍然是人做的 —— 這道閘門買的是「每加一項都有人被迫寫下那句話」，
  不是「那句話是真的」。

#### 為什麼放 Tier 2，以及一個不能拿來當理由的理由

擺在 `doc-facts` 隔壁，因為兩者中間就是那條縫：**`doc-facts` 守數字，這一步
守清單。**理由與 `doc-facts` 同一條 —— 它跨整個 repo，不該因為「這次改動與
它無關」而被 affected 過濾跳過。

⚠️ **不是**因為 Tier 2 檔頭那三條規則。那三條的理由是「安全掃描的結果會隨
時間失效」，而 `SCOPE.md` 與版控兩邊都在 git 裡，程式碼不動它就不會失效 ——
照檔頭的判準去套，這一步該在 Tier 1。這句話寫在 workflow 的註解裡，
免得下一個人套一次判準、判定它擺錯地方，然後搬走。

⚠️ **更不能拿「每日排程會再掃一次」當理由。** GitHub 的 `schedule` 只吃
**預設分支**上的 workflow 檔：`tier2-security.yml` 那個 cron 在 `release/v1`
上是啞的（查過執行紀錄，headBranch 全部是 `main`）。這條線上唯一會觸發
Tier 2 的是 `pull_request`。順帶一提，這件事對 `doc-facts` 也一樣成立。

#### 測試跑在真的 `git init` 出來的暫存 repo 上

判定完全建立在 git 上，所以測試不能 mock git —— mock 掉之後
「未追蹤的殘骸不算數」那條會變成同義反覆（測的是假造的回傳值）。
十一條測試裡有兩條只有真 repo 驗得到：**staged 但還沒 commit 的目錄看得見**，
以及**沒有 git 就直接丟例外**。

---

### C74 — 把 `UiInput` 與它撞出來的解析缺口 backport 進 v1：一個元件證明了工具的假設比它自己以為的窄（2026-08-19）

> **這一條是 backport，不是新的判斷。** 來源是 `main` 的 `1be0c88`（PR #47），
> 那次的原始論證記在 **`main` 的 C72**。下面重述的是 v1 讀者需要的部分
> （`shape.ts` 為什麼長這樣），加上**在 v1 這條線上重新量到的數字**。
>
> ⚠️ **編號不對齊，這次尤其危險**：`main` 的 C72 是這一條，v1 的 C72 是
> 〈v1 的範疇判準〉。C70 起兩條線各走各的（見 C71 末的警告）。而 `main`
> 那份原文裡有一句「這與 **C70** 之前那道『原始碼裡出現 `defineEmits`
> 就丟例外』是同一種錯」—— 照抄過來會指到 v1 的 C70〈承諾有五條，檢查
> 只有四條〉，完全不相干。**在 v1 這條線上，那道絆線是 C67 拆掉的。**

#### 一、為什麼補一個元件要動到閘門

`UiInput` 的公開面是 `modelValue` 與 `update:modelValue`，兩樣都不經
`defineProps` —— 它用 `defineModel()`。而當時的解析器：

1. **沒有 `defineProps` 就無條件丟例外。** 訊息「找不到 `defineProps<{…}>()`」
   聽起來完全正確，指的卻是**解析器的假設**，不是元件的缺陷。
2. **`defineModel` 只認具名形式**（`defineModel<T>("name")`）。不具名形式
   產生的 `modelValue` 與 `update:modelValue` **安靜地不進 API 表面** ——
   正是這支工具檔頭說要避免的「少算」，發生在它自己身上。

也就是說：不補這個缺口就把 `UiInput` 抄進來，基準檔會看起來很完整，
而它記著的公開面比實際的少兩格。

#### 二、真正要擋的不是「沒有公開面」，是「有公開面但讀不出來」

純版型元件（`Separator`／`Skeleton`）沒有 prop、沒有 slot、沒有 emit、
沒有 model，它們是合法的 —— 而且正是 #56 那批要抄進來的東西。

所以順序是：**先把四個巨集的絆線補齊，才放行空形狀。**
⚠️ 顛倒過來的話，中間任何寫錯形式的巨集都會安靜地變成一個「合法的
零公開面元件」—— 一個比原本的例外更糟的洞。

#### 三、兩條互斥的正規式之間一定有縫

`defineModel` 原本用兩條樣式分擔具名與不具名，靠前瞻互相排除。三個縫：

| 寫法                            | 舊行為                                   |
| ------------------------------- | ---------------------------------------- |
| `defineModel<Array<string>>()`  | `<([^>]+)>` 在內層 `>` 收尾 → 整條不匹配 |
| `defineModel<T>('name')`        | 具名那條只寫了雙引號 → 落到不具名那條    |
| `defineModel({ type: String })` | 沒有型別參數 → 兩條都不匹配              |

三者症狀一模一樣：那個 model 的 prop 與 `update:` 事件不進 API 表面。
**沒有紅燈、沒有訊息、基準檔看起來很完整。**

縫的來源是「哪一條該命中」被編進了樣式本身。改成**先切出型別參數
（角括號配對），再看第一個引數是不是字串字面值**之後，兩種形式走同一條路。

#### 四、反向測試要斷言的是「為什麼紅」，不是「有沒有紅」

`main` 那次的教訓：第一輪的五條反向測試在絆線被拿掉之後**仍然會過** ——
因為那個元件的成員少了一堆，於是判成「破壞性變更」，紅燈來自另一條路。
`expect(result.red).toBe(true)` 對絆線一無所知。

> 一個檔案裡通常只有少數幾條路會通往紅燈，而它們彼此會互相掩護。
> 斷言要挑**只有這條路會印出來**的字串。

⚠️ **這一節在 v1 是複述，不是重跑。** `main` 的七次變異驗證是那條線上做的。
但複述一條「未經查證的宣稱就是失敗模式」的教訓而不查證，就是犯它 ——
所以在 v1 上實跑了一次變異：把 `typeLiteralMacro` 的
`!text.startsWith("{") || !text.endsWith("}")` 改成 `false`，
**61 條測試裡剛好 3 條紅**，而且紅的正是那三條（`defineEmits` 執行期陣列、
`defineSlots` 具名別名、`defineProps` 執行期物件）。絆線在這條線上是活的。

#### 五、v1 這條線量到的數字

|                    | 值                                     | 怎麼來的                                                                                                              |
| ------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 契約測試斷言數     | **45 → 52，零編輯**                    | `vp run --filter @org/ui test`，改動前後各跑一次。檢查是掃目錄的，所以新元件自己被撿到                                |
| `api-surface` 基準 | **98 → 100 個 export，進入點 10 不變** | `--update` 產生。⚠️ 這兩個數字與 `main` 不同（`main` 是 11／99→101），因為 v1 少一個 `@org/eslint-config/a11y` 進入點 |
| 既有元件的基準     | **逐字不變**                           | 解析器變嚴了，但 `UiButton`／`UiDialog` 兩個既有元件的形狀一格都沒動                                                  |
| README 的數字      | 98 → 100                               | 不是手改的：`doc-facts` 當場紅，指到那一句                                                                            |

#### 六、`main` 的 HANDOFF 那半沒有對應物

`1be0c88` 也改了 `HANDOFF.md`（兩條關於巨集的條列、一個 `11 個進入點／
99 個 export`）。**v1 的 `HANDOFF.md` 比 `main` 的短得多** ——
那一節在 v1 根本不存在，那個數字在 v1 也沒有被寫過。
（⚠️ 這裡原本寫了兩份檔案的行數。那兩個數字沒有事實來源、兩邊各改一次
就過期，而論證不需要它們 —— C53(c) 適用於自己。）

所以 v1 這邊的 HANDOFF 改動只有一樣：〈已知的誠實缺口〉第二條從
「只有兩個元件」改成「只有三個元件」。⚠️ **那句話沒有任何機制在守**
（`doc-facts` 守的是推導得出的計數，元件數不在 `FACTS` 裡）——
#56 每加一個元件都要手動再改一次，而漏改不會有人說話。

#### 七、代價

`api-surface` 的 SFC 解析變嚴了：具名型別別名形式的 `defineProps<Props>()`
現在會紅。兩個既有元件都不受影響，但下一個從別處抄元件進來的人
（也就是 #56）可能要改寫一次宣告。訊息裡寫了為什麼。

#### 八、review 抓出四個縫，其中一個是這次自己開的

backport 完之後跑了一次 review，四個都實測過，而且都補了反向測試：

|                                 | 症狀                                                                   | 誰開的              |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| **有 `<script>` 但不是 setup**  | Options API 的元件記成 `members: []`，**再加一個必填 prop 閘門零反應** | ⚠️ **這次自己開的** |
| 模板**文字**提到 `defineExpose` | 整支解析丟例外 —— 一個完全合法的元件進不來                             | 既有                |
| 型別參數裡的字串含 `>`          | `defineProps<{ arrow: "a>b" }>()` 被判成「不是型別參數形式」           | 既有                |
| 兩個不具名 `defineModel()`      | 基準寫進同名兩格，`compare.ts` 的 Map 拿到兩元素陣列                   | 既有                |

第一條值得單獨說：**放行空形狀的時候，舊那個「空形狀等於沒有守」的例外
剛好蓋著這一格**。第二節說「先把四個巨集的絆線補齊，才放行空形狀」——
那句話是對的，但它數漏了一種形狀：**根本沒有用那四個巨集的元件。**
拆掉一個過寬的例外時，要問的不只是「它擋對的那些有沒有人接手」，
還有「它**順手**擋掉的那些有沒有人接手」。

第二條是同一個坑的下半截：檔頭記著「讀到自己的警語然後對自己丟例外」，
當時的修法是**剝掉註解**。而模板裡的文字節點不是註解 —— 補了一半。
現在巨集只在 `<script setup>` 裡找（`scriptSetup()`），模板整塊留給
`assertDeclared`，兩件事各自有各自的來源。

⚠️ 第三條的訊息比誤報本身更糟：它叫人「改成執行期形式」，
而那**正好是這支解析禁止的方向**。誤報比漏報好，把人推向錯誤的修法不是。

**五條新的反向測試各自做過變異驗證**（把對應的絆線改成 `false` 或退回舊寫法，
確認只有那一條紅）。這是第四節那條規則的實作：拿掉絆線之後仍然會紅的斷言
是裝飾品，所以每一條斷言挑的都是**只有那條路會印出來**的字串
（`沒有 <script setup>`、`兩個同名的 prop`、…），不是 `toBe(true)`。

#### 九、一句寫在新元件裡的假話

`UiInput.vue` 的代幣對照表原本標著「漏翻的會被 `tools/theme-verify`
當場擋下」。**實測是假的**：把 `border-line` 改回上游的 `border-input`，
theme-verify 全綠。未翻譯的上游代幣既不是原始色也不是懸空引用，
`palette.ts` 現有的兩類違規都認不得它 —— 那正是 issue #57 要補的第三類。

那句話是從 `main` 逐字帶過來的，所以**兩條線上都是假的**。
改成明說「這張表是人工核對的，沒有閘門在守」，並指向 #57。
`v1.0.1` 整個版本就是在做這件事，而它顯然還沒做完。

---

### C75 — `cn()` 的位置：量完決定**不動**，而量的過程推翻了 issue 自己的成本模型（2026-08-19）

`#55` 問的是「`cn()` 在每個元件實例、每次 render 都重算一次，要不要提到
module 層」。三個選項：提到 module 層、加一層 memo、或量完發現不痛就寫下不做。

**結論是第三個，而且沒有任何程式碼改動。** 但真正有價值的不是結論，
是量出來的三件事 —— 其中兩件推翻了 issue 的前提。

#### 一、「每次 render 都重算」是假的，三個呼叫點都不是

`<script setup>` 的本體編譯成 `setup()`，**每個實例跑一次**，不是每次 render。
`computed()` 有快取，依賴沒變就不重算。實測（null renderer 數呼叫次數，
掛載後觸發 10 次重繪）：

| 形狀                                                 | 掛載時 | 之後 10 次重繪 |
| ---------------------------------------------------- | ------ | -------------- |
| `<script setup>` 本體的常數（`UiInput`／`UiDialog`） | 1 次   | **0 次**       |
| `computed()`（`UiButton`）                           | 1 次   | **0 次**       |
| **對照組**：直接寫在 render 裡（沒有 `computed` 包） | 1 次   | **10 次**      |

⚠️ 對照組那一列是重點：**「每次 render」這個形狀是存在的，只是目前沒有人
寫成那樣。** 所以這條決策守的不是「現在很快」，是「現在的三個形狀都對」。

於是 `#55` 的驗收條件（「render 次數 × `tailwind-merge` 耗時」）**沒有辦法填** ——
不是還沒量，是那個乘法的左邊是零。這裡把它記成**被推翻**，而不是留白。

#### 二、成本的計量單位不是實例數，是**相異字串數**

`tailwind-merge` 3.6.0 內建 LRU 快取，`cacheSize` 預設 **500**，
**鍵是併好的整條 class 字串**。所以一張表格有 500 個 cell 用同一個元件，
它們共用**一格**快取 —— issue 擔心的「Table 一頁上百個 cell」在這個模型下
是 1，不是 100。

相異字串的**值域上界**：`UiDialog` 1 ＋ `UiInput` 1 ＋ `UiButton` 8＝**10 格／500**。
⚠️ **是上界不是現況** —— `UiButton` 那 8 格只有在一個畫面真的用滿四種 variant
才都存在。把上界寫成「目前有幾格」，就是這個 repo 一路在拆的那種數字。
⚠️ `UiButton` 的 8 是 **4 variant × 2 size**，而且是**每一組 theme 覆寫各 8** ——
各案 provide 一份覆寫就會多出一組字串。#56 會把這個數字乘上去。

#### 三、量出來的數字

|                                                |                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| 快取命中（第二次以後）                         | **0.14 – 0.21 µs**                                                                 |
| 快取未命中（真的做一次合併）                   | **65 – 224 µs** ⚠️ 這 3.4 倍是 class 字串長度差出來的（141 vs 503 字元），不是雜訊 |
| 提到 module 層之後每個實例做的事（讀一個常數） | **0.0015 – 0.0033 µs**                                                             |
| 放進真的掛載裡量，`cn()` 的增量                | **0.26 – 0.29 µs**／實例                                                           |
| 同一個實例掛載本身                             | **約 2.8 µs** ⚠️ SSR 的數字                                                        |

⚠️ **第一次呼叫量到 2.7 – 3.5 ms，那個數字不要拿來當「未命中的成本」** ——
它含 `tailwind-merge` 一次性的設定表建構。真正的每次未命中是上表的
65 – 224 µs，兩者差快 20 倍，混在一起講會把下一個讀的人誤導。

換算：1000 個實例 × 0.29 µs ＝ **0.29 ms**，而一格畫面是 16.7 ms。

⚠️ 掛載那兩列量的是 **SSR（`renderToString`）**，不是用戶端帶真 DOM 的掛載。
用戶端會更貴 —— 也就是說 `cn()` 的佔比只會**比這裡算的更小**，結論的方向
是保守的。挑 SSR 是因為它在純 node 跑得起來，而 `setup()` 一樣是每個實例
跑一次 —— 那正是要量的那段程式碼。

#### 四、為什麼不是另外兩個選項

**不提到 module 層。** 它省下的是 0.29 µs／實例，而它**沒有消除未命中的成本，
只是把那 65 – 224 µs 從「第一個實例掛載時」搬到「import 時」** ——
搬去一個**即使那個元件整場都沒被用到也會跑**的位置。拿掛載時的 0.29 µs
換啟動時的無條件成本，方向是反的。

⚠️ 而且 `<script setup>` 裡**做不到**真正的 module 層：那個區塊整個就是
`setup()`。要提就得多開一個 `<script>` 區塊或另一個 `.ts` 檔 ——
多一層檔案結構，換 0.29 µs。

**不加 memo。** `tailwind-merge` 自己就是一層 LRU。再包一層是快取的快取，
多一份要維護的狀態、多一個會失效的地方，而它要快取的東西已經被快取了。

#### 五、量測本身踩到的坑：中位數在這裡是錯的統計量

第一版把三組**分段**量（Bare 全跑完 → Hoisted 全跑完 → Current 全跑完），
得到「Current 比 Hoisted **快 15%**」—— 一個不可能的數字。改成**交錯**
（同一輪裡三組各跑一次）之後，用中位數仍然得到「Hoisted 慢 62%」。

看分佈才知道為什麼：Hoisted 那一組最慢的一輪是 73.8 µs／實例，最快的是 2.88。
**一次 GC 停頓就足以把中位數拉走**，而要找的效應只有 0.29 µs。

> 微量測的雜訊是**單邊的** —— 沒有任何東西會讓程式跑得比它真正需要的還快。
> 所以「最小值」才是真實成本的最好估計；中位數估的是「真實成本 ＋ 這台
> 機器當下有多忙」。這與量 API 延遲時看 p50 是相反的取捨：那裡使用者真的
> 會遇到那些停頓，這裡我們問的是這段程式碼本身要花多少。

改用最小值之後，兩支獨立的量測對得起來了（單獨量 `cn()` 是 0.2 µs，
放進掛載裡量的增量是 0.26 – 0.29 µs）。**兩個數字互相對得上，才是可以寫下來的。**

#### 六、真正開著的那一面：`cn` 是 `@org/ui` 的公開 export

上面三個形狀都在 `platform/ui` 裡，而 `cn` 是對外匯出的。實測：
在 `features/order` 加一行 `import { cn } from "@org/ui"`，**`conformance` 全綠** ——
D15 的 `SLICE_DESIGN_SYSTEM_IMPORTS` 擋的是切片直接 import
`reka-ui`／`clsx`／`tailwind-merge`，而 `@org/ui` 整包是允許的。

今天 `features/`／`apps/` 裡**一個 `cn()` 呼叫都沒有**（`git ls-files` 掃過，
唯一的字串出現在 `slice-kit/src/contract.ts` 的說明文字裡）。但沒有東西
擋著切片明天在一個 render function 或 `v-for` 裡呼叫它 —— 而**那正是
issue 擔心的那個形狀**，也是這條決策唯一會失效的地方。

⚠️ **不為它加閘門。** 一條「不准在 render 裡呼叫 `cn()`」的靜態檢查認不出
「在 render 裡」（`computed(() => cn(…))` 與 `() => h("div", { class: cn(…) })`
在原始碼層長得很像），而認不準的規則第一天就會被加例外，例外永遠不會拿掉（C41）。
改成把失效條件寫在 `cn.ts` 的檔頭 —— 下一個要在切片裡用它的人會先讀到那裡。

#### 七、這條決策什麼時候過期

兩個條件，任一成立就要重量：

1. **相異 class 字串接近 500**（LRU 開始驅逐）。驅逐之後每次未命中是
   65 – 224 µs，不是 0.2 µs —— 差三個數量級。#56 每加一個元件就把這個數字
   乘上它的 variant × size 值域。
   ⚠️ **量法就是那個乘法**（寫在 `cn.ts` 的檔頭）。不收量測腳本不代表沒有
   量法 —— 手算得出來的東西不需要工具。少了這一句，只讀 DECISIONS 的人
   會看到一個沒有量法的門檻值，而最容易的反應是當它不存在。
2. **有人把 `cn()` 寫進一個真的每次 render 都跑的位置**（見第六節）。

⚠️ **不裝量測工具，也不把這次的基準腳本收進 repo。** 一個沒有人在看的
效能儀表板比沒有更糟，而三支一次性的腳本收進來之後就變成要跟著維護的東西
（它們相依 Vue 的內部渲染器與 `tailwind-merge` 的版本）。

改成把**方法**寫進 `cn.ts` 的檔頭：量什麼、用哪個統計量、對照組怎麼排。
下一次要問的人照著重寫一次比讀懂一份兩年沒跑過的腳本快 —— 而第五節那三條
（取最小值、交錯跑、兩支量測要對得上）才是真正難重新發現的部分。

---

### C76 — 一次補五個元件，而挑選標準是「會不會撞到工具」而不是「好不好抄」（2026-08-19）

`#56` 要把「能換的東西還不多」補起來。它自己寫了一條挑選原則，來自 `UiInput`
那次的教訓：**挑會用到不同巨集的，不要挑最容易的** —— 因為那一支證明了
`api-surface` 的假設比它自己以為的窄。

#### 一、這一批挑了什麼，以及每一個是為了撞什麼

| 元件                      | 巨集                                                                                 | 挑它是為了                                                            |
| ------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `UiSkeleton`              | **一個都沒有**                                                                       | C74 剛放行的**零公開面**路徑的第一個真實案例                          |
| `UiBadge`                 | `defineProps` 字面值 union ＋ `defineSlots`                                          | 最便宜的一個，用來校準 20 分鐘那個估計                                |
| `UiCheckbox`              | `defineModel<boolean>()` ＋ `defineSlots` ＋ reka-ui 雙基元                          | 第二個 `defineModel`，**型別不同**（`UiInput` 是 `string \| number`） |
| `UiTabs` ＋ `UiTabsPanel` | 多檔案 **Root ＋ Item**，`defineModel<string>()`、`defineSlots`、巢狀物件型別的 prop | `#56` 明列的第三種形狀                                                |

`UiSkeleton` 那一列值得單獨說：C74 拆掉「空形狀等於沒有守」那個例外時，
舉的例子就是 `Separator`／`Skeleton` 這種純版型元件。**這是第一個真的走那條路
的元件**，而它記進基準的是 `{ kind: "component", members: [] }`。
空清單不等於不比對 —— `compare.ts` 判的是 `members !== undefined`，
所以它日後長出來的第一個 prop 仍然會漂移。

#### 二、`defineEmits` 沒有被這一批覆蓋，而那是刻意的

`#56` 建議的三樣裡，`defineEmits`（事件）**一個都沒帶到**。理由不是忘了：

這幾個元件裡每一個「事件」都是 `update:` 那一對，而**那是 `defineModel`
自己生出來的**（`UiCheckbox` 與 `UiTabs` 的基準裡都有
`[emit update:modelValue]: void`，沒有任何 `defineEmits`）。要覆蓋
`defineEmits<{…}>()` 就得**發明一個事件**，而發明一個事件來滿足一條
「要涵蓋不同巨集」的規則，正是 C41 說的那種形式主義。

⚠️ 而且它其實已經有守：`api-surface` 的 fixture 元件用的就是
`defineEmits<{ picked: [label: string] }>()`，`negative.test.ts` 有兩條
反向測試在問它（執行期陣列形式、以及模板 emit 了沒宣告的事件）。
**解析路徑被守著，只是還沒有真實元件走它。** 兩者的差別要說清楚，
不要用「有測試」蓋掉「沒有真實案例」。

#### 三、零編輯撿到新元件：52 → 87，而且對得上乘法

契約測試（`platform/ui/tests/component-contract.test.ts`）是掃目錄的，
所以這一批**一個字都沒改測試**：

```
改動前  52 條
改動後  87 條      差 35 ＝ 5 個元件 × 每個元件 7 條
```

⚠️ 那個乘法要算出來對得上，才知道「多了 35 條」不是別的地方多出來的。
`describe.each(COMPONENTS)` 底下正好 7 條 `it`（匯出、具名槽、槽鍵、
讀自己那格、union 是字面值、模板不碰預設表、預設值在 union 裡）。

`api-surface` 基準 100 → 110 個 export（5 個元件 ＋ 5 個 `…Slot` 型別），
`UiThemeOverride` 多五個選填成員。既有三個元件的形狀**逐字不變**。

#### 四、代幣翻譯：人工核對，而且是照 `#57` 的演算法核的

`#54` 已經**實測證明**這一層沒有閘門：把 `UiInput` 的 `border-line` 改回
上游的 `border-input`，`theme-verify` 全綠。所以這一批的翻譯表是逐條手核的，
而核的方法就是 `#57` 寫的那條判準：

> shadcn 的代幣詞彙 **減去** 我們 `@theme` 裡真的宣告過的名字

手跑一次的結果：**八個元件全部零漏翻**。

⚠️ 這件事對 `#57` 是好消息也是壞消息。好消息是那道檢查裝上去不會先撞到
一堆既有違規（可以直接紅）。壞消息是**「今天全綠」正是這道檢查最容易不被裝的
理由** —— 而漏翻的代價是一格顏色永遠換不掉，沒有任何紅燈。

⚠️ 手跑的那個掃描有一個盲區：`bg-[var(--primary)]` 這種任意值寫法它看不到
（它比對的是 utility 的後綴）。實測八個元件裡**一個 `var(--` 都沒有**，
所以今天的結論成立 —— 但 `#57` 真的做的時候要把這一格補上。

#### 五、「元件數」終於有事實來源了

`platform/ui` 有幾個元件這句話寫在**三個地方**（README〈已知限制〉、
HANDOFF 承諾三、HANDOFF〈已知的誠實缺口〉第二條），而在這之前
**沒有任何東西在守**。`#54` 加一個 `UiInput` 就得手改那三處。

那是 C71 記的同一個形狀。這次登記進 `tools/doc-facts`：

- `derive.ts` 加 `uiComponentCount()`，數 `platform/ui/src/components` 底下的 `.vue`
- `facts.ts` 加 `ui-components`，兩條引用樣式
- 文件裡的中文數字改成阿拉伯數字 —— **不是為了好看，是因為推導不出來的
  數字守不住**。「三個元件」對 `\d+` 而言不存在

兩個方向都變異驗過：文件寫 9 而實際 8 → 紅；真的加一個元件而文件不動 →
**五處同時紅**（README 一處、HANDOFF 兩處，加上兩句「N 個元件都被檢查」）。
那五處正是原本各自漂移的那五處。

⚠️ **數的是 `.vue` 檔，不是 `index.ts` 的 export 數。** 兩者不相等
（`index.ts` 還匯出 `cn`、`createUiTheme` 與一堆型別），而句子講的是元件。
「元件有沒有被匯出」是另一條規則，由契約測試第 ① 條守。

#### 六、兩件沒有閘門、只能寫下來的事

`UiTabs` ／ `UiTabsPanel` 這種 Root ＋ Item 有兩個執行期才知道的失敗：

1. `UiTabsPanel` 的 `value` 與 `UiTabs` 的 `items[].value` 對不上 →
   **那個 panel 永遠不顯示**，沒有錯誤
2. `UiTabsPanel` 放在 `UiTabs` 外面 → **什麼都不渲染**（inject 不到上下文）

兩者都是「值在執行期才知道」，靜態檢查抓不到，所以寫在兩個檔案的檔頭。
⚠️ 這一類的正確處理是**寫在最近的地方**，不是硬加一道認不準的閘門 ——
認不準的規則第一天就會被加例外（C41）。

#### 八、review 抓出七個，其中三個是這一批自己開的

|                                                                                              | 誰開的             |
| -------------------------------------------------------------------------------------------- | ------------------ |
| `UiCheckbox` 的 `<Label>` 沒有 `for`、`CheckboxRoot` 沒有 `id` —— **兩者完全沒有關聯**       | 這一批             |
| `UiBadge` 的預設 `tone` 寫在模板的 `?? "neutral"` 裡，**落在契約測試的視窗外**               | 這一批             |
| `UiTabs` 不給 `v-model` 時**一個分頁都不會選中**，畫面是一片空白                             | 這一批             |
| `UiSkeleton` 檔頭說 fallthrough class「直接就對」，而 Vue 的合併是**字串串接**不是 `twMerge` | 這一批（敘述不實） |
| `UiBadge` 的版型 class 寫死在模板，各案換得掉顏色**換不掉圓角**                              | 這一批             |
| `UiCheckbox` 的 `label` 必填，但給了 slot 就用不到它                                         | 這一批             |
| `uiComponentCount` 用 `readdirSync` 問磁碟 —— **C73 逐字記過的坑**                           | 這一批             |

第一條值得單獨說：**用了 reka-ui 不等於接對了**。這個檔案開頭寫著「選 reka-ui
就是為了不要自己扛焦點、`aria-*`、與 `<label>` 的關聯」，而實測 SSR 產出是
`<button role="checkbox" aria-checked="false">` **沒有任何 accessible name**，
旁邊一個沒有 `for` 的 `<label>`。點標籤不會切換，輔具讀不到名字，
**而畫面看起來完全正常**。基元把能力給你，接線仍然是自己的責任。

第二條是第二次踩同一個形狀：把一個東西挪出檢查的視窗，而所有閘門仍然是綠的。
`withDefaults` 裡的預設值有契約測試在守（「必須是該 prop 的 union 成員之一」），
寫進模板就沒有了 —— 實測傳一個不在 union 裡的 tone，產出是**一個沒上色的標籤**，
`parts[未知鍵]` 回 `undefined`、Vue 直接丟掉那個 class，沒有錯誤也沒有紅燈。

第七條：`readdirSync` 那個坑 C73 花了一整節在論證，而三十行之後我自己又踩了。
現在改問 `git ls-files`（不是 `ls-tree HEAD`，理由同 C73），並驗過兩半：
未追蹤的 `.vue` 不算數、**staged 但還沒 commit 的算數**。

⚠️ 而 review 真正最大的收穫不在這張表裡 —— 見 **C77**：順手問了一句
「`cn("border-control border-line")` 出來是什麼」，答案是**已經上線的**
一個 bug。

#### 七、成本：`#56` 估 20 分鐘／支，實際比那個低

`#56` 依 C55 的乾跑估「第二個以後的元件約 20 分鐘」，而那次的 40 分鐘
工具坑是一次性的。這一批**沒有再撞到任何工具缺口** —— `api-surface`
第一次就把五個元件全部解析出來，包含巢狀物件型別的 prop
（`items: readonly { value: string; label: string }[]`）與零公開面那一個。

也就是說 C74 補的那些絆線**買到的東西在這一批兌現了**：
上一支元件付的 40 分鐘，這一批五支一分鐘都沒再付。

---

### C77 — 已經上線的邊框：`twMerge` 把自訂代幣分錯族，而預設按鈕從第一天起就沒有框（2026-08-19）

`#56` 的 review 在讀新元件的 class 字串時順手問了一句「`cn("border-control
border-line")` 出來是什麼」。答案是 **`"border-line"`**。

#### 一、少掉的那一格是寬度，而 preflight 是 `border: 0`

`tailwind-merge` 認得的是 Tailwind **出廠的**類別族。`border-control` 這個
名字它只能猜，而 `border-<名字>` 看起來像顏色 —— 所以它把**寬度**歸進
`border-color`，然後同族只留最後一個。

而 Tailwind 的 preflight 是 `*, ::before, ::after { border: 0 solid }`。
少了寬度 utility ＝ **`border-width: 0` ＝ 完全看不見**。

實測 `apps/console` 的建置產物裡 `.border-control{…border-width:var(--border-width-control)}`
**存在而且完全正確** —— 那一格不是沒產生，是**執行期被 `twMerge` 丟掉的**。

受影響的（全部實測過）：

|                           |                      |
| ------------------------- | -------------------- |
| `UiButton` 的 `secondary` | **預設**那個 variant |
| `UiInput`                 | 唯一的槽             |
| `UiCheckbox`              | 剛在同一個 PR 寫好的 |

也就是說**這個腳手架最常出現在畫面上的那顆按鈕，從落地那天起就沒有邊框**。

#### 二、四個分錯族的，而且錯法有兩種

|                                      | `twMerge` 以為它是 | 後果                                   |
| ------------------------------------ | ------------------ | -------------------------------------- |
| `border-control`                     | 顏色               | **少東西** —— 與 `border-line` 互斥    |
| `font-control`／`font-heading`       | 字族               | **少東西** —— 吃掉 `font-sans`         |
| `rounded-control`／`rounded-surface` | 不認得             | **多東西** —— 與 `rounded-lg` 兩個都留 |
| `shadow-overlay`                     | 不認得             | **多東西** —— 與 `shadow-xs` 兩個都留  |

「多東西」看起來無害，其實是同一件事的另一半：**兩個都留就是 CSS 順序決定**，
而 `cn.ts` 的檔頭第一段寫的就是「`twMerge` 認得類別族，同族只留最後一個 ——
這不是便利工具，它是**使用端能不能覆蓋元件樣式**這條契約成立的前提」。
分錯族的那幾格，那條契約對它們不成立。

#### 三、為什麼每一道閘門都是綠的

- **`theme-verify`** 驗的是 CSS 產物與懸空引用。這一格的 CSS 完全正確。
- **契約測試**驗的是槽有沒有接上、預設表的鍵對不對。字串內容不在它的職責裡。
- **`vue-typecheck`／`api-surface`** 看的是型別與公開面。class 字串是字串。

它落在**所有**檢查的縫裡，因為它不是「寫錯了」——是**寫對了，然後被一個
執行期的函式丟掉**。這是 `cn.ts` 自己檔頭那句話的形狀（「會看情況成功或
失敗，而且失敗時沒有錯誤，只是間距不對」）發生在它自己身上。

#### 四、修法：登記，然後從 CSS 反推來守那份登記

`extendTailwindMerge` 把四組名字登記進正確的類別族。

⚠️ 那份登記是**手寫的**（`cn.ts` 要跑在瀏覽器裡，讀不到 CSS）。手寫不是問題，
**沒有東西在守它**才是（C71）。所以 `platform/ui/tests/cn.test.ts` 從
`styles/index.css` 的 `@theme` 把代幣名推導出來，反過來問兩件事：

1. **同族的兩個放一起，後面那個要贏** —— 抓「不認得」（多東西）
2. **不同族的兩個放一起，兩個都要留** —— 抓「歸錯族」（少東西）

只有第一半的話，把所有自訂代幣通通登記進同一族也會全綠 ——
而那正好會讓 `font-control` 吃掉 `font-sans`，也就是修之前的實際情形。
**兩個方向都要問，這條規則在這個 repo 已經是第三次出現。**

變異驗過：拿掉 `border-control` 的登記 → 三條紅；把字重登記成字族
（也就是修好之前的行為）→ 三條紅。另外留一條用 `border-nonexistent`
（永遠不會被登記的名字）證明「不同族」那一組不是恆真句。

#### 五、⚠️ 這條不會自己延伸到下一個代幣

`@theme` 加一個 `--border-width-thick`，`cn.test.ts` 會**立刻紅**並且指名
「請到 `cn.ts` 的 `classGroups` 登記」。那是刻意的：登記一個名字要三十秒，
而漏登記的症狀是一格樣式安靜消失。

⚠️ 但它**只守 `@theme` 裡宣告過的代幣**。有人在元件裡直接寫一個
`shadow-[0_0_1px]` 這種任意值，`twMerge` 一樣可能分錯族而這裡看不見。
那一格沒有機制，只有這句話。

---

### C78 — 「元件補到哪裡算夠」從來沒有被定義過，所以先定義再補（2026-08-19）

要發 `v1.0.6` 之前的問題是「所有元件都做完」的邊界在哪。查了 `HANDOFF.md`、
`SCOPE.md`、`DECISIONS.md` 與 git 歷史：

> **從來沒有任何文件列過 v1 要有哪些元件。**

⚠️ 而且差一點就自己騙自己：`HANDOFF` 現在寫著「表格、下拉、日期都還沒有」，
看起來像一份當初的定義 —— **那句話是 2026-08-19 當天在 `da75ede`（#56）才寫進去的**
（`git log -S` 查得出來）。拿它當「當初的範疇」是循環論證：昨天的自己不是外部依據。

順帶查到 **`UI-SURVEY.md` 不在版控裡**，D15 連過去的連結是死的。

#### 一、唯一真的存在的依據是一句話，不是一份清單

C62 記下的產品要求原文：

> 公司會有一套基礎的 UI 版型和互動方式，但是各團隊可以依不同案件需求
> 更換配色或 component 形狀或互動方式。

那是**判準**：「基礎版型」要集中、「配色／形狀／互動」逐案換。
它決定得了**哪一類東西**該進 `platform/ui`，決定不了**幾個**。

所以這裡定一份清單，而定它的判準是：**一個典型的 CRUD 案子，第一天要不要
自己寫這個元件？** 要 → 進來；不要 → 不進。

> ⚠️ **這條判準單獨用是不夠的，而且它自己的排除清單就藏著證據** ——
> `Toast` 出去用的其實不是它（見下面那段的理由：全域接線）。
> 把留白的候選整批跑過一次之後，這裡實際在用的是**三層**，見 **C81**。

#### 二、定下來的範圍

| 批             | 元件                                                                             | 為什麼在裡面                                                 |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A · 表單       | `UiLabel`、`UiTextarea`、`UiSwitch`、`UiRadioGroup` ＋ `UiRadioItem`、`UiSelect` | 表單是 CRUD 的一半，而在此之前只有 `UiInput` 與 `UiCheckbox` |
| B · 日期       | `UiDatePicker`                                                                   | 動到相依宣告，所以單獨一批                                   |
| C · 資料與版型 | `UiTable` 家族、`UiPagination`、`UiSeparator`、`UiAlert`                         | 另一半：把資料列出來、翻頁、以及動作後的回饋                 |

**刻意不進來的**（寫下來比留白好）：`Accordion`／`Tooltip`／`Popover`／
`Combobox`／`Avatar`／`Progress`／`Toast`。判準是同一條 —— 它們是**特定畫面
需要時才加**的東西，不是每個案子第一天都要有。⚠️ `Toast` 是最接近邊界的一個：
它要一組全域的 `Provider` ＋ `Viewport` 接線，那是**應用外殼的決定**而不是元件，
所以 C 批用 `UiAlert`（就地顯示）而不是 `UiToast`。

> ⚠️ **這七個是「判準會讓人猶豫」的那幾個，不是完整的排除清單。**
> 上游型錄裡另外 46 個當時留白，已於 **C81** 整批裁決 —— 結論是
> 三個該進來（`Alert Dialog`／`Field`／`Dropdown Menu`），而它們要不要補
> 是**對本條範疇的修改**，不是本條的延伸。

#### 三、A 批每一支的判斷，而其中三支的理由不是「照抄上游」

**`UiTextarea` 不包基元，而那正是原則。** reka-ui 沒有 Textarea，因為原生
`<textarea>` 的鍵盤、選取、IME、無障礙全部是瀏覽器做的。headless 函式庫只在
**原生做不到**的地方才有價值。反過來做（每個元件都包一層）很常見，
而它多背一份相依換到零。

⚠️ 它的樣式與 `UiInput` 幾乎一樣，**刻意重複不抽共用常數**：具名槽的語意是
整條替換，抽出來會讓兩個槽在預設值上耦合、覆寫後又不耦合 ——
那種「有時一起變、有時不會」最難查。

**`UiRadioGroup` 用兩個檔案，`UiSelect` 用 `items` 陣列 —— 判準是「項目的內容
是不是任意的」。** 單選項後面常接說明、連結、或只在選中時出現的輸入框
（「其他，請說明 ___」）；下拉的選項是一行字，而在 listbox 裡放連結會壞掉
鍵盤導航。⚠️ 這一條寫下來是因為下一個 Root ＋ Item 進來時要用**判準**，
不是照抄離它最近的那一個。

**`UiSwitch` 與 `UiCheckbox` 的差別是語意不是外觀。** 核取方塊是表單的一部分、
要按送出；開關**立刻生效**。所以「同意條款」永遠是 checkbox、「深色模式」
永遠是 switch。選錯的症狀是使用者找不到送出鈕、或以為已經存檔了。
沒有閘門，只有元件檔頭那段話。

#### 四、`theme-verify` 的模型少了一類：**第三方在執行期設的自訂屬性**

`UiSelect` 一進來就把懸空引用那道檢查打紅了：
`--reka-select-trigger-width` 被 `min-w-(…)` 引用，而整份產物裡沒有人宣告它。

**檢查是對的，模型是窄的。** 那個變數由 reka-ui 的 `SelectContent`
（`position="popper"`）在開啟時以 **inline style** 寫入，好讓面板與觸發器等寬 ——
它在瀏覽器裡才存在。

修法是 `RUNTIME_PROVIDED` 登記表，而**理由是必填的字串**：

> 一個布林開關（或一句 disable 註解）下一個人只會照抄；一個要講得出
> 「誰設的、什麼時候設的」的字串，寫不出來的人會發現自己其實是在
> silence 一個真的缺陷。（C41）

⚠️ **判準很窄：只有「我們無法宣告、而且宣告了反而是錯的」才進去。**
把 `--reka-select-trigger-width` 寫進 `@theme` 會產生一個永遠被 inline style
蓋掉的死代幣 —— 比不宣告更糟，因為它看起來像可以調。

反向測試兩個方向都問，而且變異驗過：**拿掉放行 → 放行那條紅**；
**把放行放寬成 `--reka-` 前綴比對 → 「沒登記的仍然要紅」那條紅**。
第二條才是價值所在：出口如果會自己長大，reka-ui 那邊改名或我們打錯字
就再也不會紅了。

#### 五、⚠️ 給 `#57` 的一個反例：`accent` 是假朋友

`UiSelect` 的上游用 `focus:bg-accent` 做「選項 hover 的淺色底」。
**直譯過來是錯的**：本 repo 的 `--color-accent` 是**品牌主色（深色）**，
直譯會讓 hover 的選項變成深色底配深色字。這裡翻成 `focus:bg-surface-hover`。

而 `#57` 的判準（shadcn 的詞彙 **減去** 我們 `@theme` 宣告過的名字）
**認不出它** —— `accent` 兩邊都有宣告，所以減法之後它不在清單裡。

那條判準原本就是為了避免名稱碰撞的誤報而設計的，而這是它的代價：
**名字一樣但意思不同的那幾個，機器分不出來。** 這不是要改判準
（放寬會讓 `accent`、`surface` 這些一起誤報），是要把它寫進 `#57` 的
已知限制 —— 那道檢查綠燈的意思是「沒有用到我們沒有的名字」，
不是「翻譯是對的」。

#### 六、量到的

|                  |                                                         |
| ---------------- | ------------------------------------------------------- |
| 契約測試         | **100 → 142**，零編輯（42 ＝ 6 個元件 × 7 條）          |
| `api-surface`    | **110 → 122** 個 export，進入點不變                     |
| `theme-verify`   | 靜態掃描 8 → **14 個元件**，0 處原始顏色                |
| 代幣翻譯人工核對 | **14 個元件零漏翻**（照 `#57` 的判準手跑）              |
| 任意值盲區       | 14 個元件裡**一個 `var(--` 都沒有**，所以手跑的結論成立 |

#### 七、review 抓出六個，其中一個是「沒查證就寫下的理由」

|                                                    |                            |
| -------------------------------------------------- | -------------------------- |
| `UiSwitch`／`UiSelect` 把 `id` 宣告成**必填** prop | ⚠️ **理由是編的**          |
| `UiSwitch` 帶著一個**死掉的 `peer`**               | 沒有任何 `peer-*` 的兄弟   |
| `UiSelect` 的箭頭 `text-fg-muted` 寫死在模板       | 各案換不掉                 |
| `RUNTIME_PROVIDED` 沒有東西斷言它的每一筆還活著    | C71 的形狀                 |
| `UiRadioItem` 少了「兩個都不給就沒名字」那句警告   | `UiCheckbox` 有            |
| `UiSelect` 的 `placeholder` 是選填                 | 沒給就是一個只有箭頭的空框 |

第一條值得單獨說，因為它不是打錯字，是**推理錯誤**。當時寫的理由是
「這個元件是多根的，fallthrough 可能掉，所以宣告成 prop 比較保險」——
那句話從來沒有被查證。實測（拿掉宣告、模板不再綁 `:id`）：
`h(UiSwitch, { id: "c" })` 的產出**仍然是 `id="c"`**，因為 reka-ui 的基元
自己 `v-bind="$attrs"`。

而那個沒查證的理由有真的代價：`<UiSwitch v-model="dark" aria-label="深色模式" />`
**過不了型別檢查**，雖然那是完全合法、無障礙也正確的寫法。

> 「這樣比較保險」是一句**沒有失敗輪廓**的話。保險是防什麼？防的那件事
> 真的會發生嗎？兩個問題都答得出來才叫理由，答不出來就只是不安。
> 這個 repo 已經拆掉三個這種形狀的東西了（`SFC_UNSUPPORTED` 的兩個
> 裝飾品絆線、以及「空形狀等於沒有守」那個例外）。

第三條是 **C76 在 `UiBadge` 上抓過的同一個形狀，隔一個版本又發生一次**：
把樣式寫死在模板的 `class` 上，於是各案換得掉外層、換不掉那一格。
契約測試第 ⑤ 條擋的是「模板引用預設表」，擋不到「模板自己寫了一條」。
⚠️ **這個縫已經咬到兩次了。** 它不是靜態檢查抓得到的（「接縫夠不夠」是
review 的職責，`UiDialog` 的檔頭早就寫過）—— 第三次發生的話該做的不是
加閘門，是把「新元件的每一條 class 都要屬於某一格槽」寫進 review 清單。

第四條是這一輪最好的一個：新加的放行清單有「理由必填」與「出口很窄」兩條
反向測試，**但沒有任何東西斷言裡面每一筆還活著**。reka-ui 哪天改名，
新名字仍然會紅（那一半是對的），而舊那筆會永遠留著默默把出口撐大。
補的測試從**元件原始碼反查** —— 沒有人在用的名字就是該刪掉的名字。
變異驗過：塞一筆沒人用的進去，兩條測試同時紅。

---

### C79 — 日期選擇器：宣告一筆「本來就在樹裡」的相依，以及一個被自己的檔頭抓到的謊（2026-08-19）

C78 的 B 批。`UiDatePicker` 是這一輪唯一動到相依宣告的元件。

#### 一、`@internationalized/date` 不是新的供應鏈範圍

它從第一天就在樹裡 —— `reka-ui` 自己相依它（連同 `@internationalized/number`）。
這裡做的只是把「本來就在用」寫成明的：`platform/ui` 要直接 `import type { DateValue }`
才接得出型別，而 pnpm 的嚴格解析不允許引用沒宣告的相依。

|                         |                                    |
| ----------------------- | ---------------------------------- |
| 新增的 workspace 相依   | **1**（`@internationalized/date`） |
| 新增的實際套件          | **0**                              |
| `pnpm-lock.yaml` 的變動 | **6 行**（只有 importer 那一格）   |

⚠️ 版本跟著 `reka-ui` 的範圍（`^3`）。**釘死一個 exact 版本會在 reka-ui 升版時
產生第二份副本** —— 那正是 D15 記過的 `lightningcss` 兩個版本、
`MPL-2.0 範圍翻倍` 的形狀。

⚠️ v1 這條線上**沒有** `tools/exit-drill` 與 `tools/supply-chain`（它們在 `main`），
所以這裡沒有清單要跟著更新。**在 `main` 上加這一筆時要回頭看 D15 記的那四件事。**

#### 二、值的型別是 `DateValue` 而不是 `Date`，而這是最容易被「簡化」掉的一格

JS 的 `Date` 是一個**時間點**（UTC 毫秒），使用者在日曆上點的是一個**日曆日**。
兩者在跨時區時不相等：台北時間 8/19 00:30 存成 `Date` 再用 UTC 讀出來是 **8/18**。

那就是「生日差一天」這個經典 bug，而它**在開發機上永遠重現不了**
（開發者與伺服器多半同一個時區）。`CalendarDate` 沒有時間也沒有時區。

#### 三、⚠️ 檔頭寫了三件事，而元件只做到兩件

第一版的檔頭寫著：

> 日期還有**曆法、時區、地區格式**三個問題，而它們每一個自己寫都會錯。

前兩個由 `@internationalized/date` 處理。**第三個當時根本沒解** ——
`reka-ui` 的預設 locale 是 `en-US`，而我沒有開那個 prop。實測產出：

```
（沒有 locale prop）   8 / 19 / 2026
```

也就是說一個對外賣「快速換配色與元件樣式」的設計系統，**在日期欄位上
把地區格式寫死成美式**，而且各案換不掉。這與 C77 的邊框、C76 的 `UiBadge`
版型是同一個家族：**檔頭宣稱的能力比元件實際有的多一格。**

補上 `locale` prop 之後：

```
locale 預設 "zh-TW"    2026 / 8 / 19
locale="en-US"         8 / 19 / 2026
```

⚠️ **預設值刻意是 `"zh-TW"` 而不是跟著瀏覽器。** 跟著瀏覽器會讓同一份資料
在不同人的畫面上長不一樣，而政府案的表單截圖是要附在公文裡的。
要跟著使用者的話明確傳 `navigator.language` —— 那是一個決定，不該是預設。

⚠️ 刻意**沒有**開 `minValue`／`maxValue`／`isDateUnavailable`：
那三個是「這個欄位的規則」，而規則屬於表單不屬於設計系統。

#### 四、一個八格的元件把契約測試的解析器問倒了

`UiDatePickerSlot` 有八格，格式化器會把它換行：

```ts
export type UiDatePickerSlot =
  | "field"
  | …
```

而 `tests/contract.ts` 的錨點是 `` `export type ${typeName} = ` ``（**含尾空格**），
於是整個找不到。

**症狀是紅燈不是恆真** —— `block()` 當初選了丟例外而不是回 `null`，那一步救了這次。
但訊息會說「找不到區塊起點」，指向錨點而不是真正的原因：
**這支解析假設了 union 與 `=` 在同一行**，而那不是規則，只是當時的元件夠短。

⚠️ 修法帶出第二個洞：跳過換行式 union 的前導空 `|` 之後，一個怎麼也解析不出
東西的 union 會回傳**空陣列**，而呼叫端拿空集合去比另一個空集合是**恆真** ——
`block()` 那段說明防的就是這件事，只是換了一個位置重新出現。所以補了一條
「解析不出任何成員就丟」。

兩條都變異驗過：錨點退回含尾空格 → 兩條紅；拿掉空集合守衛 → 一條紅。

#### 五、量到的

|                |                                                           |
| -------------- | --------------------------------------------------------- |
| 契約測試       | **142 → 151**（7 條來自新元件、2 條是解析器的新反向測試） |
| `api-surface`  | **122 → 124** 個 export                                   |
| `theme-verify` | 靜態掃描 14 → **15 個元件**、0 處原始顏色                 |
| 具名槽         | **8 格**，目前最多的一個 —— 日期選擇器本來就是一個小應用  |

#### 六、review 抓出五個，其中三個是「寫了但永遠無效」的同一家族

|                                                    |                                                       |
| -------------------------------------------------- | ----------------------------------------------------- |
| `field` 上的三條 `aria-invalid:*` **永遠觸發不了** | `DatePickerRoot` 不渲染元素，fallthrough 到不了 field |
| `data-slot="date-picker"` **根本沒渲染出來**       | 同上，掛在 Root 上就被丟掉了                          |
| 不合法的 `locale` 會丟未捕捉的例外、整片畫面白掉   | 檔頭一字未提                                          |
| `locale` 的預設寫在模板的 `?? "zh-TW"`             | C76 才剛把 `UiBadge` 從這個寫法改掉                   |
| catalog 寫 `^3.12.3`，比 reka-ui 要的 `^3.5.0` 窄  | 註解說「跟著 reka-ui」，實際沒有                      |

前兩條是同一個原因，而那個原因值得記下來：**`DatePickerRoot` 是一個不渲染
任何元素的 provider。** 掛在它身上的屬性不會報錯、不會警告，就是消失。
實測 `out.includes('data-slot="date-picker"')` 是 `false`。

⚠️ 而那三條 `aria-invalid:*` 是**這兩個批次裡第二次**出現「寫了但永遠無效的
class」（A 批是 `UiSwitch` 的死 `peer`）。兩次的成因不同，症狀一樣：
**畫面上少一種狀態，而沒有任何東西會說話。** `theme-verify` 看得到那些
utility 產生出來、認得那些代幣，它管不到「這個選擇器永遠不會匹配」。

修法不是刪掉那三條，是**讓它們變成真的**：開一個 `invalid` prop，
把 `aria-invalid` 綁到 field 上。⚠️ `UiInput`／`UiTextarea` 不需要這個 prop，
因為它們是單根元件、fallthrough 就到位 —— **同一件事在不同結構下要不同的做法**，
所以兩邊都要寫下為什麼。

第五條是自己抓自己：註解寫「版本刻意跟著 reka-ui 的範圍」，而實際寫的是
**抄目前解到的版本**（`^3.12.3`）而不是 reka-ui 宣告的 `^3.5.0`。
寫得比它窄的話，reka-ui 哪天需要一個更舊的 3.x 就會產生第二份副本 ——
正是這一節第一段想避免的那件事。

⚠️ 順帶查到：`data-slot` 這個慣例**沒有任何消費者、也沒有任何閘門**，
而且 `UiButton` 與 `UiDialog` 從來就沒有。它是一條被寫在幾個檔頭裡、
實際上只有一半成立的約定 —— 不值得為它加閘門，但值得知道它不是契約。

---

### C80 — 表格家族與版型收尾：C78 的範圍補完，24 個元件（2026-08-19）

C78 的 C 批，也是最後一批。補完之後 C78 定的那份清單就到齊了。

#### 一、`UiTable` 是六個檔案，而 reka-ui 沒有這個基元

**沒有基元是對的。** 原生 `<table>` 的語意（`<th scope>`、列與欄的關聯）
**就是**螢幕閱讀器讀表格的方式，沒有一項需要 JavaScript 補。用
`<div role="table">` 重做一遍是常見的錯誤 —— 那要自己補 `role="row"`／
`role="cell"`／`aria-rowindex`，漏一個就是輔具讀不出結構。

判準與 `UiTextarea` 同一條（C78 §3）：**headless 函式庫只在原生做不到的
地方才有價值。** 這一輪兩支元件套用它，方向相反的結論各一次。

**為什麼是六個檔案而不是 `:columns` ＋ `:rows`：** 判準是 C78 §3 的
「項目的內容是不是任意的」。表格的儲存格是這個 repo 裡最任意的東西 ——
一格可能是文字、一顆 `UiBadge`、一組按鈕。做成資料驅動就得再發明一套
「每一欄的 render 函式」，而那會把「這一欄怎麼顯示」從使用端搬進 `platform/`。

⚠️ **資料驅動的表格（排序、分頁、虛擬捲動）是另一個產品**（data grid），
不是版型元件。真的需要時那是一個新決策，不是把這一支長大。

⚠️ 名字改了上游一處：上游用 `TableHeader` 指 `<thead>`、`TableHead` 指 `<th>`，
**兩個名字差一個字母、指的是不同層級**。這裡是 `UiTableHead`（`<thead>`）與
`UiTableHeadCell`（`<th>`）。**抄上游的詞彙是對的，抄上游的手滑不是。**

#### 二、三個「預設值就是對的」的元件

這一批有三支的價值不在樣式，在**預設值**：

|                   | 預設是什麼                                      | 少了會怎樣                                                              |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| `UiTableHeadCell` | `scope="col"`                                   | 螢幕閱讀器唸儲存格時**唸不出欄名**，而畫面完全一樣                      |
| `UiSeparator`     | `decorative`（不唸）                            | 每個排版分隔線都會被唸出來                                              |
| `UiAlert`         | `danger` → `role="alert"`，其餘 `role="status"` | 全用 `alert` 則每個「已儲存」都打斷朗讀；全用 `status` 則錯誤被排到後面 |

三個都**沒有閘門在守**，而且錯了在畫面上完全看不出來。把它們包成元件的
理由就是這個：**預設值是唯一會被大多數人接受的東西。**

`UiTableCell` 的 `numeric` 是同一條的變體：靠右對齊與 `tabular-nums`
**永遠是一起的**（靠左則小數點散開、比例字型則位數對不齊），做成一個 prop
而不是叫使用端傳兩條 class，是因為分開傳就會有人只記得其中一條。

#### 三、`UiAlert` 而不是 `UiToast`，理由是 C78 已經寫過的那一條

C78 把 `Toast` 排除，理由是它需要一組**全域的 `Provider` ＋ `Viewport`**，
而「掛在哪、疊在哪、同時最多幾個」是**應用外殼的決定**。

而 Alert 就地顯示對表單錯誤其實更好：飄在角落的 toast 是無障礙的常見痛點
（會自己消失、鍵盤到不了、螢幕閱讀器可能唸不到）。

#### 四、⚠️ 分頁的頁碼是 1-based，而多數 API 是 0-based

`v-model` 出來的第一頁是 `1`。送去後端如果是 `offset` 或 0-based 的 `page`
**要自己減一** —— 沒有閘門，而錯了的症狀是「永遠少一頁」或「第一頁看到
第二頁的資料」。

刻意**不在元件裡幫忙轉**：轉了之後 `v-model` 的值與畫面上顯示的數字就不一樣，
那比減一難查得多。

#### 五、`doc-facts` 的引用樣式跟著句子放寬，而不是改寫

「`platform/ui` **只**有 N 個元件」這句話從一句**限制**變成一句**涵蓋範圍**
（「有 24 個元件」）。`doc-facts` 當場紅在 `never-cited` —— 它拒絕讓一條
對不到任何句子的樣式繼續掛著。

樣式改成 `(?:只)?有 (\d+) 個元件` **放寬而不是改寫**：兩種語氣都還會出現，
下一個能力補完之前它又會是「只有」。

⚠️ 那個 `never-cited` 分支很值得記一筆：它擋的不是「數字錯了」，是
**「這條規則已經沒有在守任何東西了」**。多數這類工具沒有這一半，
於是句子被改寫之後檢查安靜地變成恆真。

#### 六、量到的

|                  |                                                           |
| ---------------- | --------------------------------------------------------- |
| 元件             | 15 → **24**                                               |
| 契約測試         | **151 → 214**，零編輯（63 ＝ 9 個元件 × 7 條）            |
| `api-surface`    | **124 → 142** 個 export                                   |
| `theme-verify`   | 靜態掃描 15 → **24 個元件**、0 處原始顏色                 |
| 代幣翻譯人工核對 | **24 個元件零漏翻**；任意值只有 `UiSelect` 那一個預期中的 |

#### 七、review 抓出五個，而最重的一個是 **C77 原封不動地復發**

`cn("border-b-control border-line")` → **`"border-line"`**。

C77 修的是 `border-control`，而 `tailwind-merge` 把 border-width 拆成
**十一個族**（`border-w` 加十個方向）、圓角拆成**十五個**。C77 只登記了不帶
方向的那一個，於是**同一個 bug 在多一個 `-b-` 的寫法上完全沒被修到**。

而它當場就咬到了：`UiTableHead` 的預設就是 `border-b-control border-line`，
所以**表頭根本沒有下邊框**。

⚠️ **更值得記的是閘門為什麼沒說話。** `cn.test.ts` 從 `@theme` 推導代幣名反過來
驗登記表 —— 那個設計是對的，但它**只組得出基本形式**（`border-control` 對
`border-2`），從來沒組過方向性寫法。

> 一道只檢查一半情況的閘門**比沒有閘門更危險**：它讓人以為這件事已經被守住了。
> C77 寫完之後我確實這樣以為。

修法兩邊都補：`cn.ts` 登記全部二十六個族（用迴圈產生，不手抄）；
`cn.test.ts` 把八個邊與十四個角一起組進去。變異驗過 —— 把登記退回 C77 的
版本，**九條測試紅**。

#### 八、另外四個

|                                           |                                        |
| ----------------------------------------- | -------------------------------------- |
| `UiPagination` 沒開 `show-edges`          | 跳不到第一頁，而且 `ellipsis` 槽是死的 |
| `UiTableHeadCell` 的 `scope` 預設寫在模板 | **第三次**，而這次的檢查是有牙齒的     |
| `UiSeparator` 的 `orientation` 同上       |                                        |
| `UiTableRow` 的 hover 用在表頭上          | 看起來可以點，點下去沒事               |

`show-edges` 那條：reka-ui 的預設是 `false`，而那個預設讓這個元件**有一半是壞的** ——
實測十頁、當前第 5 頁，渲染出來只有 `3 4 5 6 7`，使用者要回第一頁得連按四次
上一頁。而且因為沒有邊緣就永遠不會出現省略號，**`PaginationEllipsis` 與
`ellipsis` 槽整組是死的** —— 這幾個批次裡第三次的「寫了但永遠無效」
（`UiSwitch` 的 `peer`、`UiDatePicker` 的三條 `aria-invalid:*`）。

⚠️ `scope` 那條比前兩次嚴重。C76（`UiBadge`）與 C79（`UiDatePicker` 的 `locale`）
的預設值都寫在模板，而 `locale` 沒有 union 所以契約測試**本來就會跳過它**。
`scope` 有 union（`"col" | "row"`）—— **那道檢查真的會咬**，寫進模板就逃掉了。
打成 `"colum"` 的症狀是螢幕閱讀器唸不出欄名，而畫面完全一樣。

**同一個形狀第三次出現，代價一次比一次大。** 這不是加閘門解得掉的
（「預設值該寫在哪」對靜態檢查而言是風格），是要進 review 清單的。

---

### C81 — 把留白的候選整批裁決，而過程中發現 C78 的判準其實是三層（2026-08-19）

C78 定義了 v1 的元件範疇，但它只逐一裁決了**七個「判準會讓人猶豫」的候選**，
上游型錄裡其餘的整批留白。這一條把那批跑完，而跑的過程改變了判準本身的形狀。

⚠️ 上游清單是 **2026-08-19 當天讀 shadcn-vue 文件側邊欄的快照**（70 項；
React 版 64 項）。**這兩個數字不是關於上游的持久事實** —— 它會漂移，
本條的論證不依賴它。

#### 一、先扣掉別名：46 個名字裡有 2 個不是新候選

`Sonner` 是 `Toast` 的另一個實作（已驗證：一樣要求在應用根部掛全域
`<Toaster />`），C78 已排除 Toast，理由逐字適用。`Pin Input` 與 `Input OTP`
同理 —— 一個包 reka-ui 基元、一個從 React 版移植，同一個概念。

> **上游型錄自己就有重複。** 這是它當不了範疇規格的第三個理由 ——
> 前兩個是「會漂移」與「跨框架不同」（Vue 版有 `Number Field`／`Stepper`／
> `Tags Input`，React 版沒有）。

46 − 2 = **44 個待裁決的概念**。

#### 二、判準其實是三層，而且**只有前兩層是門檻**

C78 只寫下了一層（「典型 CRUD 第一天要不要自己寫」）。實際在用的是三層：

| 層    | 問題                                       | 作用                   |
| ----- | ------------------------------------------ | ---------------------- |
| **0** | 它是元件嗎？需不需要**應用外殼**替它接線？ | **門檻**               |
| **1** | 一個典型 CRUD 案子，第一天要不要自己寫？   | **門檻**               |
| **2** | 它如果缺了，**消費端看不看得出來**？       | **不是門檻 —— 是排序** |

**層 0 是 C78 已經在用但沒寫下來的。** 它排除 `Toast` 用的就是這一條
（「要一組全域的 Provider ＋ Viewport 接線，那是應用外殼的決定」），
而寫下來之後它一次篩掉五個：`Sidebar`（版面槽位＋折疊狀態）、
`Navigation Menu`／`Breadcrumb`（路由知識）、`Command`（全域快捷鍵＋掛載點）、
`Menubar`（版面槽位）。

> 理由不是分類潔癖：`platform/ui` 的契約是「import 進來就能用」。需要外殼
> 接線的東西**在單元測試裡是綠的、在真的應用裡是壞的**，直到有人記得去接
> 為止 —— 而那正是 v1.0.6 抓了四次的同一種缺陷（「寫了但永遠無效」）。

**⚠️ 層 2 一開始是當門檻寫的，而它立刻被自己的存貨推翻。**
第一版的措辭是「這比『第一天要不要自己寫』更能分辨東西」。拿去跑既有的
24 個元件：`UiSeparator` 過（它的檔頭正好在講看不見的那一半 ——
`decorative` 決定要不要送 `role="separator"`，自己寫 `<hr>` 的話排版線會被
唸出來），但 `UiBadge`、`UiSkeleton`、`UiTableCell` 過不了。

> **一條會把自己已經出貨的東西判成錯誤的判準，是被推翻了，不是更利了。**

改成排序之後每一格都有確定的答案，而且解釋得了現有存貨：
**層 2 決定的是「缺了算不算 bug」**，不是「能不能進來」。
`Field` 三層全過 → 缺了是**缺陷**；`Card` 過 0 和 1、卡在 2 → **可以進來但
不急，而且沒有人會受傷**；`UiBadge` 同一個形狀、已經在了 → **不是錯誤**；
`Tooltip` 過得了 2 但卡在 1 → 仍然出去。

**⚠️ 改判準就要回頭重跑既有裁決，否則就是 C80 那個形狀**（改了一半、
另一半還壞著而閘門是綠的）。C78 那七個逐一跑過三層：

|                                                                     | 卡在                                           |
| ------------------------------------------------------------------- | ---------------------------------------------- |
| `Toast`                                                             | **層 0** —— 全域 `Provider` ＋ `Viewport` 接線 |
| `Accordion`／`Tooltip`／`Popover`／`Combobox`／`Avatar`／`Progress` | **層 1**                                       |

**沒有一個翻盤。** 而其中 `Tooltip`／`Popover`／`Combobox` **過得了層 2**
（它們的鍵盤與 ARIA 那一半確實看不見）—— 那正好示範層 2 不是門檻：
過了它也進不來，因為層 1 已經擋住了。

#### 三、44 個的裁決

⚠️ **這張表自己先分錯過一次。** 第一版把 `Aspect Ratio`／`Kbd`／`Scroll Area`
和 `Card`／`Empty`／`Item`／`Spinner` 放在同一格（「缺了看得出來」7 個）——
結果一樣是不進，**理由卻是兩層**：前三個是層 1 卡住（典型 CRUD 第一天根本
用不到），後四個是層 1 過了、層 2 卡住（用得到，但各案自己寫沒有人會受傷）。

同一格裡放兩種理由，下一個人要判第 45 個候選時就會拿錯那把尺。

| 分組                                           | 數    | 裁決                                     |
| ---------------------------------------------- | ----- | ---------------------------------------- |
| 不是元件（`Data Table`／`Form`／`Typography`） | 3     | 判準空轉                                 |
| 層 0：應用外殼                                 | 5     | 不進                                     |
| 已被 `UiDialog` 的 `content` 槽涵蓋（`Sheet`） | 1     | 不進                                     |
| 既有規則直接禁止（`Resizable`）                | 1     | 不進                                     |
| 層 1：AI／對話垂直領域                         | 6     | 不進                                     |
| 層 1：特定畫面才需要                           | 21    | 不進                                     |
| 層 2：`Card`／`Empty`／`Item`／`Spinner`       | 4     | 可進但不急                               |
| **三層全過**                                   | **3** | `Alert Dialog`／`Field`／`Dropdown Menu` |

三個不需要判準就成立的：

**`Data Table` 不是元件**，是 TanStack Table ＋ `Table` 的組合教學。
⚠️ 正面說一次：**它的基材已經齊了** —— `UiTable` 家族 ＋ `UiPagination`
就是它需要的全部，缺的只有一份「怎麼接」的文件，那是 `features/` 的事。

**`Resizable` 加了會直接把閘門打紅** —— 它包的是 reka-ui 的 Splitter，
而 D15 立過全 repo 禁令（唯一會在執行期 `createElement("style")` 的地方，
被 `style-src 'self'` 擋掉），`tools/conformance` 強制、有反向測試。

**`Native Select` 卡在範疇而不是實作。** C78 §3 講過 `UiTextarea` 不包基元
（原生夠好），聽起來該用同一條放它進來 —— 但那條管的是實作，不是範疇。
範疇這一層它過不了：`UiSelect` 已經在了。

> **同一個概念的兩個實作並存，比缺一個更糟。** 每個案子每次都要選一個，
> 而**選錯沒有症狀** —— 兩個都能用、都能送出、都無障礙。沒有症狀的錯誤
> 永遠不會被修正，只會讓同一個產品裡的下拉選單長得不一樣。

#### 四、`Sheet` 不是新元件 —— 它就是 `content` 槽當初補進來的理由

`UiDialog` 的檔頭在 2026-08-17 補 `content` 槽時寫著：

> 一個要把對話框改成手機版底部滑出的案子，代幣換不掉（那不是值）、
> slot 換不掉（那不是結構），只能去改這個檔案。

`Sheet` 就是那個案子：`fixed inset-y-0 right-0 h-full w-96` 取代
`top-1/2 left-1/2 -translate-*`，焦點鎖定／Esc／外側點擊／`aria-modal`
全部原封不動。**這件事本條同時寫進了 `UiDialog` 的檔頭** —— 不寫的話
下一個人會新增一個 `UiSheet`，然後兩份無障礙接線開始各自漂移。

⚠️ `Drawer` **不同**：它包 Vaul，賣點是拖曳關閉手勢，槽換不出來，要新相依。

#### 五、三個「三層全過」的，看不見的那一半分別是什麼

**`Alert Dialog`** —— 我一開始判它是 `UiDialog` 的變體（`footer` 槽放兩顆鈕）。
讀原始碼之後不是（`reka-ui@2.10.3`，`dist/AlertDialog/AlertDialogContent.js`）：

```js
role: "alertdialog",
onPointerDownOutside: withModifiers(() => {}, ["prevent"]),
onInteractOutside:    withModifiers(() => {}, ["prevent"]),
onOpenAutoFocus: () => nextTick(() => cancelElement.value?.focus(…)),
```

輔具聽到的是 alertdialog 不是 dialog、點外面不會關、**初始焦點在「取消」**。
CRUD 的 D 就是它，而最後一項是安全設計：焦點若落在「確認」，一個 Enter
就刪掉了 —— 畫面上完全看不出差別。與 C78 §3 的 `UiSwitch` vs `UiCheckbox`
同型：**差別是語意不是外觀，而選錯的代價由使用者付。**

**`Field`** —— label ＋ 控制項 ＋ 說明 ＋ 錯誤訊息的版型與接線
（`aria-describedby` 對應、`aria-invalid` 傳遞、id 產生）。
⚠️ **證據就在 v1.0.6 裡**：`UiDatePicker` 那三條 `aria-invalid:*` 是死的
（C79），**因為沒有任何東西在設 `aria-invalid`** —— `Field` 就是設它的地方。

**`Dropdown Menu`** —— 表格每一列的「⋯」。看不見的那一半是鍵盤導航：
方向鍵、Home/End、首字母跳轉、Esc 關閉並還原焦點。
⚠️ 它要和 C78 已排除的 `Popover` 分得開，否則自相矛盾。分得開：
**`Popover` 是「放任意內容的浮層」，`Dropdown Menu` 是「一組動作」** ——
前者要把鍵盤導航讓給內容，後者要自己接管。這和 C78 §3 區分 `UiRadioGroup`
（任意內容 → 兩個檔）與 `UiSelect`（一行字 → `items` 陣列）是同一條軸。

#### 六、⚠️ 判準一寫下來就在既有元件上抓到東西：`UiSkeleton`

層 2 問「缺了消費端看不看得出來」。拿它掃既有元件時，`UiSkeleton` 是一個
**純 `<div>`**，沒有 `aria-busy`、沒有 `role="status"`、也沒有 `aria-hidden`。
它的檔頭談了 `api-surface` 的空形狀、尺寸為什麼不做 prop、動畫為什麼不進
`index.css` —— **一個字都沒提輔具**。

症狀正是層 2 描述的形狀：載入期間螢幕閱讀器**完全靜默**，然後內容突然出現。
畫面上一切正常。

⚠️ 同一個元件上還有第二條：**Tailwind v4 的 `animate-pulse` 不帶任何
`prefers-reduced-motion` 保護**（實測 `tailwindcss@4.3.3` 的 `theme.css`
與同層 CSS 全檔無此媒體查詢），所以對前庭障礙使用者是一個關不掉的閃動。

**本條刻意只記錄，不修** —— 這一條進 `release/v1` 的前提是「純文件、不擴
範疇」，加一個 `aria-busy` 就讓那句話變成假的。而「說明自己是純文件卻夾帶
行為變更」正是 `1c8f048` 在修的那種不實敘述。修法另開。

> ✅ **已修：見 C82。** 兩條都修了，而修法與這裡的描述有一處出入 ——
> `aria-busy` **不在骨架上**。WAI-ARIA 有一條 MUST 要求標在**容器**上
> （適用條件是 widget 因腳本執行或載入而缺了必須擁有的子元素，骨架正是
> 那個形狀），所以骨架拿到的是 `aria-hidden="true"`，busy 訊號歸消費端。
> 上面那句「沒有 aria-busy」描述的是症狀，不是該補的東西。

#### 七、這是對 C78 的**修改**，不是它的延伸

C78 定義了範疇，v1.0.6 就是照它出的貨。所以本條落地的是**三件補漏**
（層 0 寫進 C78、層 2 寫進 C78、`Sheet` 寫進 `UiDialog` 檔頭）——
那三件無論如何都該做，因為它們補的是既有文件的漏。

而**要不要補是產品決定**，本條不預設立場：要嘛 v1.0.7 放寬 C78 剛定下的
範疇，要嘛 C78 不動、進 post-v1 清單。

⚠️ 「補」的候選有 **7 個不是 3 個** —— 層 2 是排序不是門檻，所以層 1 之後
被放行的是七個，只是分成兩種急迫性：

- **三個是缺陷**（`Alert Dialog`／`Field`／`Dropdown Menu`）——
  缺了畫面完全正常，而它對鍵盤與輔具使用者是壞的。
- **四個是方便**（`Card`／`Empty`／`Item`／`Spinner`）——
  缺了各案自己寫一個 `<div>`，第一眼就會發現不對，然後就修好了。
  **沒有人會受傷**，所以它們排在後面，但不是被判出去。

只補三個、七個都補、或一個都不補，都是說得通的決定 —— 說不通的是
把那四個當成「已經裁掉了」。

> ✅ **三個缺陷全部補完了：`Field` 見 C84、`Alert Dialog` 見 C86、
> `Dropdown Menu` 見 C88。** 那四個「方便」的仍然是待裁決狀態，不是被裁掉。
>
> ⚠️ 三次都在同一個地方出現同一件事：**C81 給的理由對，但不足以決定 API
> 形狀**。真正決定形狀的分別是上游的 `aria-invalid` 不接線（C84）、
> `cancelElement` 由誰註冊（C86）、以及面板的名字借自觸發器（C88）——
> 三次都要讀原始碼才看得到。

---

### C82 — 修掉 C81 §六 記的那兩條，而寫條文的過程中被自己的條文抓到一次（2026-08-19）

C81 §六 在 `UiSkeleton` 上記了兩條無障礙缺陷，然後**刻意不修** ——
那個 PR 宣告自己是純文件。這條是修法。

#### 一、`aria-busy` 不在骨架上 —— 這與 C81 §六 的描述有出入

C81 §六 寫的是「沒有 `aria-busy`、沒有 `role="status"`、也沒有 `aria-hidden`」。
那句話描述的是**症狀**，照著補會補錯。

WAI-ARIA 1.2 有一條 MUST，而**它的適用條件要一起抄**：當 widget 因為腳本
執行或載入而缺了「必須擁有的子元素」時，作者必須把 `aria-busy="true"` 標在
**容器**（containing element）上。骨架正是那個形狀 —— 內容還沒到，位置先
擺著。所以骨架自己拿到的是 `aria-hidden="true"`，`aria-busy` 留給消費端。

⚠️ 規範講的是**那個情形**，不是「凡骨架皆如此」。這裡不靠它撐 —— 下面那個
論證就算沒有這條 MUST 也成立。

那為什麼不順手在骨架上送一個 `role="status"`？因為它**同時吵又空**：

|        | 為什麼不行                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **空** | live region 播報的是**它裡面的文字**。骨架是「還不存在的內容」的佔位，沒有無障礙名稱、沒有子節點 —— 註冊一個永遠沒東西可唸的 region |
| **吵** | 骨架的正常用法是一次排好幾個（標題＋三行內文＋頭像），那是 N 個 region 各自註冊                                                     |

兩件事指向同一個結論：**骨架不是訊號的發送者，它是要被藏起來的雜訊。**

⚠️ 而訊號去哪了要寫下來，否則這就只是把問題推走：**消費端的容器**。理由
不是分層好看，是**只有交換點知道載入什麼時候結束** —— 骨架自己不知道，
它沒有 prop 也沒有狀態（那正是 C74 舉它當「零公開面」例子的原因）。

⚠️ **這是一個零公開面元件的「刻意不提供」，而閘門守不到那一半。**
能證明的只有「骨架自己是 `aria-hidden`」；「使用端有沒有送 busy」不在
任何閘門的射程內。同 `theme-verify` README 那句「綠燈的意思是配色與形狀
實測可換，不是設計系統可換」—— 邊界要自己說出來。

#### 二、`motion-reduce:animate-none`：先證明那條 class 真的變成規則

C81 §六 記的第二條屬實，重測過：`tailwindcss@4.3.3` 的 `index.css`／
`theme.css`／`preflight.css`／`utilities.css` **四份全檔沒有**
`prefers-reduced-motion`（只有引擎 `dist/lib.mjs` 裡有，那是 variant 的
實作，不是預設保護）。所以 `animate-pulse` 的閃動關不掉。

修法是加 `motion-reduce:animate-none`，但**「class 寫了但執行期被丟掉」是
本 repo 栽過兩次的坑（C77／C80）**，所以這條的驗收不是讀原始碼，是編譯：

```
@media (prefers-reduced-motion: reduce) { .motion-reduce\:animate-none { animation: none } }
```

守它的斷言逐格對準這段字串。只驗 `toContain("motion-reduce")` 的話，
打成 `motion-safe:` 仍然全綠 —— 而那拼出來的是**反過來的**規則
（只在使用者「不介意動畫」時才關掉），畫面上與正確版一模一樣。

編譯器用 `tailwindcss` 自己的 `compile()`，本 package 已經依賴它
（peer ＋ dev）—— **零新增依賴**，不必為了一條斷言往 `release/v1` 的交付線
加測試依賴。

⚠️ **candidate 取自元件的預設表，不是測試裡寫死的字面值。** 寫死的話那條驗
的只是「Tailwind 認得 `motion-reduce:` 這個 variant」—— 一條與本 repo 無關
的上游事實，把元件裡的 class 刪光它照樣綠。差別在變異矩陣上看得到：改成
從預設表取之後，刪 class 與打成 `motion-safe:` 這兩個變異各紅**兩條**
（源碼一條、產物一條），而不是一條。

⚠️ 而這樣**仍然沒有**覆蓋最後一環：Tailwind 自己掃 `.vue` 檔把 candidate
抽出來的那一步（測試是把字串直接餵給 `compile()`）。那一環由 `styles.test.ts`
的 `@source` 宣告與 `theme-verify` 的 fixture 建置守著，落地時也在
`apps/console` 的產物裡實測過：

```
@media (prefers-reduced-motion:reduce){.motion-reduce\:animate-none{animation:none}}
```

（app 建置是 minify 過的，冒號後**沒有空格** —— 與 `compile()` 未 minify 的
輸出不同字串，斷言各自對準各自的那一份。）

⚠️ 保護放在 `DEFAULT_PARTS` 裡，於是**走 `UiThemeOverride` 整條替換掉這一格
的案子會連保護一起換掉**。這是「整條替換」那個設計的代價，不是疏漏：
閘門守的是預設表，覆寫在射程之外。

#### 三、⚠️ 寫條文的過程中被自己的條文抓到一次

新解析器 `defaultSlotValues` 的檔頭第一版寫著：

> `stripComments` 在這裡不是可有可無的 —— `UiSkeleton` 的檔頭含有
> `motion-reduce:animate-none` 這個字串，不去註解會讓條文被自己的說明滿足。

**那是錯的。** 拿掉 `stripComments`、同時把真的那條 class 從預設表刪掉，
條文照樣紅。真正把註解擋在外面的是另外兩層：外層只掃 `= { … }` **區塊
內部**（檔頭在邊界外），內層要求 `key: "值"` 的**形狀**。

寫下來是因為這正是本 repo 最在意的那種錯：**一個聽起來合理、與事實吻合、
但沒有被驗證過的因果**。而它一路通過了測試（那條反向測試恆真，因為人造
來源的註解也在區塊外），是變異驗證把它挖出來的。

順著挖下去還有一個**真的**破口，記成一條具名測試：

|                              | 結果                                      |
| ---------------------------- | ----------------------------------------- |
| 註解掉的舊值排在真值**前面** | 真值贏（「後出現的為準」）—— 條文正確地紅 |
| 排在真值**後面**             | 註解贏 —— 條文誤綠                        |

也就是說那條為了「不丟資料就夠」隨手定的合併規則，在這裡是**半個防線**。
沒有修（要正確處理得先分辨字串與註解，那是 `styles.test.ts` 那支去註解器
的工作量），但**先讓它有名字** —— 哪天踩到了，那條測試會直接指出是哪一層漏的。

#### 四、絆線的形狀：一條通用、一條具名，各自的理由

| 條文                                                  | 形狀         | 為什麼                                                                                                                                       |
| ----------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 預設表裡每一格動畫都要配 `motion-reduce:animate-none` | **掃全目錄** | 「有動畫」從原始碼推導得出來，下一個帶動畫的元件會被同一條抓                                                                                 |
| `UiSkeleton` 模板要有 `aria-hidden="true"`            | **具名**     | 「哪些元件是純裝飾」**推導不出來** —— 不是型別、不是槽、也不是模板結構，是設計判斷。硬要通用化只會寫出一條猜的規則，然後在第一個反例上被放寬 |

具名的代價由一條保險擋：`UiSkeleton.vue` 改名或搬走要紅，不能安靜地零執行
（同 `component-contract` 的「★ 至少掃到兩個元件」）。

還有一條守「條文還有沒有對象」：哪天最後一個動畫被拿掉，那條 `it.each`
會零次執行而全綠 —— 該讓它說話，不是留一條裝飾品在 repo 裡。

#### 五、四個變異都驗過

| 改壞什麼                          | 結果                  |
| --------------------------------- | --------------------- |
| 移除 `aria-hidden`                | 🔴 1 條               |
| 移除 `motion-reduce:animate-none` | 🔴 2 條（源碼＋產物） |
| 改成 `motion-safe:animate-none`   | 🔴 2 條（源碼＋產物） |
| `aria-hidden="false"`             | 🔴 1 條               |

最後一個不是湊數：實測過 **Vue 對非 class 屬性的 fallthrough 是「使用端
覆蓋」**（`class` 才是串接），所以 `false` 是真的會生效的值。條文因此比對
整個 `aria-hidden="true"`，不是屬性名。

那個覆蓋語意同時是**出口與風險**：單一骨架要自己當訊號時可以這樣做，
而它同樣關得掉保護。寫進元件檔頭。

---

### C83 — 測試檔的字面值一直在進使用者下載的 CSS，而且連代幣表都被汙染了（2026-08-19）

起因是驗 C82：`motion-reduce:animate-none` 到底有沒有變成規則。grep `apps/console`
的產物時順手看到旁邊有一條 `.motion-safe\:animate-none` —— **沒有任何元件寫過它**。

#### 一、Tailwind 的抽取器不解析語法，連註解都算

`platform/ui` 的 `@source "../../../../**/*.{vue,ts}"` 掃全 repo 的 `.ts`
（理由見該檔檔頭：逐層列出會被退出演練打爆）。而抽取器是**字串比對**，
不是解析器 —— 它撈出所有長得像 utility 的東西。

兩個活證據，都在正式產物裡：

| 產物裡的規則                 | 來源                                            |
| ---------------------------- | ----------------------------------------------- |
| `.motion-safe\:animate-none` | `platform/ui/tests/a11y.test.ts` 的**變異字串** |
| `.text-\(--沒有的代幣\)`     | `tools/slice-gen/tests/…` 的**註解**            |

實測差額：`apps/console` 的 CSS **27.31 → 28.15 kB**，13 條選擇器全部來自
測試檔。⚠️ 我一開始估「幾十 bytes」，**差了 30 倍** —— 沒量就報數字的代價。

#### 二、⚠️ 被汙染的不只 CSS 規則，還有代幣表

`theme-verify` 的宣告數從 204 掉到 200。逐一 diff 少掉的自訂屬性：

```
--color-blue-500     ← palette.test.ts 的 focus-visible:outline-blue-500
--font-weight-bold   ← cn.test.ts 的對照組 font-bold
```

**那是 `@theme` 輸出。** 也就是說設計系統的代幣表裡一直躺著兩格由測試字串
拉進來的 Tailwind 內建值 —— 而 `theme-verify` 是**逐格驗代幣**的工具，
它一直在驗一份含測試殘留的表。

#### 三、修法，以及為什麼這次改窄 glob 是安全的

`@source not "…/**/tests/**"` ＋ `@source not "…/**/*.test.ts"`（Tailwind 4.1+）。

⚠️ 改窄這條 glob 正是它自己檔頭警告的動作。查了 `tools/exit-drill`
（在 `main`，不在 `release/v1`）：它的複製只排除 `node_modules` 與 `dist`，
演練的 vitest include 是 `app/tests/**` ＋ `packages/*/tests/**` ——
**測試檔在演練佈局裡仍然在 `tests/` 底下**，所以排除一樣生效。

而關鍵在**失敗方向相反**：

|               | 失效時     | 後果           |
| ------------- | ---------- | -------------- |
| 原本那條 glob | 掃不到切片 | **樣式少一半** |
| 這兩條 `not`  | 排除沒生效 | 產物胖 0.84 kB |

⚠️ **退出演練抓不到這一種**：它比的是 CSS 位元組比值 ≥ 80%，而多掃的方向
是產物**變大**（比值 > 1）。所以守它的只有下面那個哨兵。

#### 四、⚠️ 放寬既有正則時差點換來一個洞 —— 而救我的是實測不是推理

`styles.test.ts` 的「@source 一律加引號」原本是 `/@source\s+([^"\s][^;]*);/`，
它把合法的 `@source not "…"` 判成沒加引號。

第一版的修法是加一個可選群組：`/@source\s+(?:not\s+)?([^"\s][^;]*);/`。
**推理是對的，跑起來照樣紅** —— 可選群組匹配不下去時正則會**回溯**成不匹配，
於是 `not` 本身變成了「那個沒加引號的路徑」。

改成先把 `not ` 正規化掉再套原正則。變異驗過三個方向：真的沒加引號→紅、
拿掉排除→紅、排除改成綁死佈局的固定路徑→紅。

#### 五、絆線放在會建置的那一邊

宣告層的檢查（`styles.test.ts`）只能守「宣告還在」。**「排除真的生效」要有
真的建置**，所以哨兵放 `theme-verify`，與既有的 `fixtures/probe.ts` 成一對：

| 探針                      | 守的方向                        |
| ------------------------- | ------------------------------- |
| `fixtures/probe.ts`       | `.ts` 裡的類別**必須**進產物    |
| `tests/excluded-probe.ts` | `tests/` 裡的類別**不准**進產物 |

⚠️ **哨兵的字面值必須住在被排除的檔案裡**，`cli.ts` 只 import 變數 ——
寫在 `src/` 底下的話它自己會被掃進產物，那條斷言就永遠紅，然後被人加 skip。

⚠️ 值挑**任意值**（`pt-[3.7391px]`）：一定合法、一定編得出規則、不可能撞名。
挑 `text-white` 那種真 utility 的話，某天有人真的用了它就會誤紅。
比對的是**宣告值** `3.7391px` 而不是選擇器 —— 選擇器在 CSS 裡是
`.pt-\[3\.7391px\]`，逸出規則是 Tailwind 的實作細節，比對它等於把斷言
綁在上游的逸出方式上。

雙向驗過：拿掉 `@source not` → 紅；把哨兵掏空 → 紅（恆真保護）。

#### 六、順帶：`theme-verify` 的 README 有一個自己的反例

README 用 `text-(--沒有的代幣)` 示範「這一段抓得到」。**它抓不到** ——
`src/css.ts` 的宣告與引用兩個正則都是 `--[a-z0-9-]+`，中文名兩邊都看不見。

而那個字串**當時真的在產物裡**（從測試註解漏進去的那條），閘門卻是綠的。
改成 ASCII（`text-(--nonexistent)`）並把正則的定義域寫進 README。
**沒有放寬正則** —— CSS 自訂屬性的實務命名就是 ASCII，放寬只會讓這道閘門
多認一種沒有人會寫的東西。同 `theme-verify` 那句「綠燈的意思是配色與形狀
實測可換，不是設計系統可換」：邊界要自己說出來。

#### 七、⚠️ 這不是純文件

交付的 CSS 少了 0.84 kB，`index.css` 是 CODEOWNERS 治理的檔案。
C81／C82 剛好在講「宣稱自己是純文件卻夾帶行為變更」，這裡不重犯。

---

### C84 — `UiField`：上游的版本不做接線，所以這一個刻意不照抄（2026-08-19）

C81 裁決出三個「三層全過」的元件，這是第一個。挑 `Field` 先，因為它補的洞
**現在就破著**。

#### 一、⚠️ 動手前發現 C81 給它的理由被上游推翻了一半

C81 §五 寫的是「`Field` 就是設 `aria-invalid` 的地方」。查了上游實際的樣子：

```vue
<Field data-invalid>
  <FieldLabel for="email">Email</FieldLabel>
  <Input id="email" aria-invalid />   <!-- ← 使用者自己寫 -->
  <FieldError>…</FieldError>
</Field>
```

**它是九個子元件的版型家族**（`FieldSet`／`FieldLegend`／`FieldGroup`／`Field`／
`FieldContent`／`FieldLabel`／`FieldTitle`／`FieldDescription`／`FieldSeparator`／
`FieldError`），而 `aria-describedby` 與 `aria-invalid` 全部手動。

照抄的話：**過不了 C81 自己的層 2**（純版型，缺了看得出來），而且那個洞一個
都沒補到。所以這一個不照抄。

#### 二、它補的兩個洞，兩份原始碼裡都已經自己承認了

| 檔頭原話                                                 | 出處                  |
| -------------------------------------------------------- | --------------------- |
| 「`for` 是**使用端的責任**，而這裡沒有任何閘門守得住它」 | `UiLabel`             |
| 三條 `aria-invalid:*` 是**死的** —— 沒有任何東西在設它   | `UiDatePicker`（C79） |

⚠️ 這比 C81 原本的理由強，因為它是 **repo 內的證據**而不是上游的行為。

#### 三、Vue 的 slot 改不了內容的 props，所以「自動接線」只有三條路

|                                       |                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 照抄上游（純版型）                    | ❌ C81 的理由會變成假的                                                                                                                                       |
| `provide`／`inject`，控制項主動接     | ❌ 要動 `UiInput`／`UiSelect`／`UiTextarea`／`UiDatePicker` 全部，讓它們長出看不見的耦合。而 `UiInput` 現在是零 prop 的，它的檔頭說「多宣告一格什麼都沒多守」 |
| **scoped slot 給一個 `control` 物件** | ✅ 值由 `UiField` 產生，綁定由使用端寫一行                                                                                                                    |

```vue
<UiField label="電子郵件" :error="errors.email" v-slot="{ control }">
  <UiInput v-model="email" v-bind="control" />
</UiField>
```

⚠️ **使用端忘了 `v-bind="control"` 的話接線還是斷的**，而且畫面正常 ——
沒有閘門守得住，只有檔頭那句話。換到的是「該有哪些值」不用再想。

#### 四、⚠️ 這是第一個 import 別的元件的元件

在此之前 `platform/ui` 裡沒有先例。用 `UiLabel` 而不是自己再包一次 reka-ui 的
`Label`，理由是**行為會漂移**：`UiLabel` 用基元是為了「按兩下不選取文字」，
自己再寫一份的話兩份哪天不一樣沒有人會發現。

⚠️ 與 C78 §3「`UiTextarea` 刻意重複不抽共用」不衝突 —— 那條講的是**樣式**
（具名槽的語意是整條替換），這裡是**行為**。所以 `UiFieldSlot` 裡刻意
**沒有 `label` 那一格**：再開一格會讓同一個東西有兩個覆寫入口。

#### 五、測試改用 SSR，而且零新增依賴

本 package 其他測試都是**讀原始碼文字**（沒有 `jsdom`／`@vue/test-utils`）。
⚠️ 但這個元件的**全部價值都在執行期算出來的 `control` 上** —— 那條 `computed`
可以整個寫錯而每一個字串斷言照樣綠。

`vue/server-renderer` 是 `vue` 自己的進入點，本 package 已經依賴 vue。
代價寫在測試檔頭：它證明的是伺服器端渲染的 HTML，不是瀏覽器算出來的
無障礙樹 —— 但屬性值與 id 對應這一層，兩者是同一件事。

#### 六、⚠️ 三個「看起來對、跑起來錯」，全部是實測抓到的

**（一）模板註解會進 SSR 產物。** 第一版把「為什麼沒有 `role="alert"`」寫成
模板註解，SSR 輸出裡就有一段中文論證：

```html
<input id="v-0" aria-describedby="v-1 v-2" aria-invalid="true" />
<!-- ⚠️ 刻意**沒有** role="alert"：錯誤透過 aria-describedby 在聚焦時… -->
```

`renderToString` 不移除註解（用戶端 production build 會）。**同 C83 的形狀**：
寫在原始碼裡的東西進了交付物。論證移到檔頭，並加一條斷言擋它。
⚠️ `UiDialog` 的模板裡也有一段，另案處理 —— **見 C85**。
而掃過一遍之後**不是一個，是四個元件五段**，所以那裡順便加了一條
掃全目錄的絆線。這裡這一條驗的是**產物**、只有 `UiField`；C85 那一條
驗的是**原始碼**、涵蓋全部 25 個。

**（二）假綠：抽取函式認得什麼，決定了斷言抓得到什麼。** 「兩個都沒有時
`aria-describedby` 不存在」那條，第一版是問「值是不是 undefined」——
變異驗證時**沒有紅**。實測 Vue 的 SSR：

```
""        → <input aria-describedby>   ← 沒有等號
undefined → <input>
false     → <input aria-invalid="false">
```

空字串渲染成 **bare attribute**，而只認 `="…"` 的正則對它是盲的。
在瀏覽器裡那等於一個指向空的引用。改成問「這個屬性在不在」。

**（三）放寬正則之前先想它會不會被 lint 擋。** 屬性解析第一版用
`/\s([a-zA-Z-]+)(?:="([^"]*)")?/`，被 `security/detect-unsafe-regex` 判成
有回溯風險（本 repo 0-warnings）。拆成兩條線性的：帶值的先收，
再把那些整段挖掉、剩下的按空白切。
⚠️ 不能直接切 —— `aria-describedby="v-1 v-2"` 的值裡有空白，會拆出假屬性名。

#### 七、`h()` 收不了 `.vue` 的具名 props —— HANDOFF #26 的具體代價

`.vue` 沒有型別檢查，tsc 看到的是 `declare module "*.vue"` 的 shim，
於是 `h(UiField, { label: "…" }, …)` 挑到最後一個 overload 而報 TS2769。
轉成 `Component` 讓 props 走寬鬆的那條，而**代價寫進測試檔頭**：
props 打錯字不會被型別擋。

#### 八、量到的

|               |                                                                     |
| ------------- | ------------------------------------------------------------------- |
| 元件          | **24 → 25**                                                         |
| `api-surface` | **142 → 144** 個 export，進入點不變、**零刪除**（minor 不是 major） |
| 新增測試      | 10 條接線斷言，**八個變異全部驗過會紅**                             |
| 新增依賴      | **0**                                                               |

#### 九、⚠️ 沒有守到的那一半

- **使用端忘了 `v-bind="control"`** —— 沒有閘門。
- **`aria-describedby` 指到的元素真的存在**這一條只驗到 `UiField` 自己
  渲染的那兩個。使用端另外塞一個 `aria-describedby` 覆蓋掉的話，
  fallthrough 是**後者贏**，而這裡看不到。

---

### C85 — 模板註解會進 SSR 產物，而它不只 `UiDialog` 一個（2026-08-19）

> ⚠️ **這個標題是錯的，見 C86 §六。** 隔天實測：`UiDialog` 的那一段寫在
> `<DialogPortal>` 裡面，而 portal 在 SSR 下整個是 `<!--v-if-->` ——
> **標題點名的那一個正好是唯一不會洩漏的**（另外三個確實會）。
> 掃描與絆線都留著，理由見 C86；錯的是把「量了 `UiField` 一個」的結論
> 推到另外四個身上。

C84 §六（一）在寫 `UiField` 時撞到這件事並修掉了自己那一個，順手記著
「`UiDialog` 的模板裡也有一段」。這一條是掃全部之後的結果 ——
**不是一個，是四個元件五段**。

#### 一、機制

`renderToString` **不移除** HTML 註解；用戶端的 production build 會。
所以差別只出現在 SSR 使用端（Nuxt 那類），而 `apps/console` 是 SPA ——
**本 repo 自己的產物看不到這個問題**，那正是它一直沒被發現的原因。

實測（C84，`UiField` 的 SSR 產出）：

```html
<input id="v-0" aria-describedby="v-1 v-2" aria-invalid="true" />
<!-- ⚠️ 刻意**沒有** role="alert"：錯誤透過 aria-describedby 在聚焦時… -->
```

⚠️ 同 C83 的形狀：**寫在原始碼裡的東西進了交付物**。C83 是測試字面值進了
CSS，這裡是設計論證進了 HTML。兩次的共同點是「本 repo 自己的建置看不到」。

#### 二、搬到哪裡，不是刪掉

| 元件           | 段數 | 內容                                                |
| -------------- | ---- | --------------------------------------------------- |
| `UiCheckbox`   | 1    | 勾勾用內嵌 SVG 而不是圖示套件（SCA 範圍）           |
| `UiDialog`     | 1    | 遮罩的色相在代幣、不透明度留在元件                  |
| `UiSelect`     | 1    | 箭頭用內嵌 SVG，且帶 `aria-hidden`                  |
| `UiDatePicker` | 2    | Root 非渲染所以屬性掛 field；分段順序由 locale 決定 |

⚠️ **每一段都放進檔頭論證上下文說得通的位置**，不是貼到檔尾。
例如 `UiDatePicker` 那兩段各自成節，而「Root 不渲染」那一段補了一句
C84 之後才想清楚的話：`theme-verify` 的靜態掃描讀的是**原始碼**，
所以第一版把 `data-slot` 放在 Root 時它看得到那個字串、閘門全綠，
只有真的渲染出來才發現不見了。

#### 三、絆線放原始碼層，而邊界要說出來

| 在哪                          | 驗什麼                                  | 廣度           |
| ----------------------------- | --------------------------------------- | -------------- |
| `field-wiring.test.ts`（C84） | **產物**裡沒有註解                      | 只有 `UiField` |
| `a11y.test.ts`（本條）        | **原始碼**的 `<template>` 裡沒有 `<!--` | **全部 25 個** |

⚠️ 原始碼層那一條擋得住「有人往模板裡寫註解」，擋不住「Vue 改變註解的
處理方式」。要驗產物就得把每個元件都渲染出來，而多數元件需要 props 才
渲染得動 —— 那是一份逐元件的 fixture，成本遠大於換到的。
**一條深、一條廣，合起來才完整。**

⚠️ 恆真保護：解析不到 `<template>` 直接紅，不是跳過 —— `undefined` 會讓
`not.toContain` 恆真。變異驗過（拿掉某個元件的 `</template>` → 紅）。

⚠️ 別跟 SSR 的 fragment 標記搞混：產物裡的 `<!--[-->` 與 `<!---->` 是 Vue
自己插的。本條讀的是原始碼，碰不到它們。

#### 四、變異

三個元件各自往模板放回一段註解 → **各紅一條**（不是全紅，證明是逐元件的）；
拿掉 `</template>` → 紅；全部還原 → 62 條綠。

---

### C86 — `Alert Dialog`：焦點保護有兩條路，而它們不對稱（2026-08-20）

C81 裁決出的三個「三層全過」補到第二個。⚠️ 過程中**推翻了自己剛寫的
C85 的標題**，見 §六。

> ⚠️ **本條有一處被 C88 更正：`emit('confirm')` 的那一刻對話框還開著**，
> 它在下一個 tick 才關。元件裡原本寫的是「已經關了」—— 結論（不要從那裡改
> `open`）不變，理由相反，而更正之後的警告更強。見 **C88 §五之二**。

#### 一、C81 §五 的四條全部對得上，但它漏了決定 API 形狀的第五條

實測 `reka-ui@2.10.3` 的 `dist/AlertDialog/AlertDialogContent.js`，C81 記的
`role: "alertdialog"`／兩條 outside 的 `prevent`／`onOpenAutoFocus` 聚焦取消鈕
一字不差。**但它沒記到那個 `cancelElement` 是誰放進去的**：

```js
// AlertDialogCancel.js
onMounted(() => {
  contentContext.onCancelElementChange(currentElement.value);
});
```

→ **沒有渲染 `AlertDialogCancel`，`cancelElement` 就是 undefined，
`?.focus()` 變 no-op。** 而畫面完全正常。

#### 二、所以沒有 `footer` 槽 —— 但拿掉逃生口就要補一格

`UiDialog` 有 `footer` 槽可以整組換掉按鈕列。這個元件**刻意不給** ——
同 C82 記下的形狀：走整條替換那一格的案子**會連保護一起換掉**。
按鈕樣式走 `UiButton` 既有的格子，這裡也不另開可覆寫的按鈕格
（一個 `hidden` 的覆寫就夠讓保護消失，而且沒有閘門看得見）。

⚠️ 代價要補回來：`UiAlertDialogSlot` 因此比 `UiDialogSlot` 多一格 `actions`。
沒有它的話，各案連「按鈕改成左右分置」都做不到。**拿掉一個逃生口就要補另一個。**

#### 三、⚠️ SSR 對包在 portal 裡的模板**一個字都驗不到**

`UiField`（C84）用 `renderToString` 驗接線，零新增相依。同一招在這裡是空的：

```
reka-ui 的 Teleport.vue：isMounted || forceMount 才渲染
useMounted() 在伺服器端 = false
→ UiDialog 在 renderToString 下的完整產出：<!--[--><!--v-if--><!--]-->
→ ctx.teleports === undefined
```

⚠️ **量到的是 `DialogPortal`，能推廣是因為它們共用同一道閘** —— reka-ui 每個
`*Portal` 都只是 `Teleport.vue` 的薄包裝，`isMounted` 那道判斷在包裝裡。
界線是 `Teleport` 不是「元件」：`UiSelect` 的箭頭在 `SelectTrigger` 裡、
`SelectPortal` 外面，所以 C85 量到它真的洩漏。**剛在 §六 講完「量一個不能
推到五個」，這裡就不要再犯一次。**

所以這是本 package 第一支跑在 DOM 環境的測試。
⚠️ **供應鏈零變化**：`happy-dom` 與 `@vue/test-utils` 本來就在 catalog 裡
（`features/order` 在用），`pnpm-lock.yaml` 只多了兩行 importer、**零個新套件**。
環境用 `// @vitest-environment happy-dom` 限在單一檔案，其餘五支維持 node。

#### 四、⚠️ 焦點保護是**兩條**路，而 B4 推翻了我自己剛寫的檔頭

`onOpenAutoFocus` **沒有** `preventDefault()`，所以 `DialogContent` 自己的
預設聚焦先跑，`nextTick` 的「聚焦取消鈕」疊在後面 —— 兩條同時存在：

| 實驗 | 設定                       | 焦點落在 | 說明                                  |
| ---- | -------------------------- | -------- | ------------------------------------- |
| A    | 真元件                     | 取消     | 註冊那條穿得過 `as-child`＋`UiButton` |
| B    | **無** Cancel、取消排前面  | 取消     | 註冊斷了，DOM 順序接住                |
| B2   | **無** Cancel、確認排前面  | **刪除** | ⚠️ 兩條都沒了就真的沒了               |
| B3   | 有 Cancel、確認排 DOM 前面 | 取消     | **兩條都在時註冊那條贏**              |
| B4   | 真元件 ＋ 槽內放一個 `<a>` | 取消     | 槽內容**不會**破壞保護                |

⚠️ 元件檔頭第一版寫著「不要在預設槽裡放可聚焦的東西，它會擋在 DOM 順序
那條路前面」——**推理是對的，實測是錯的**，因為 B3 說註冊那條壓過 DOM 順序。
已改。**寫了論證就要去量它**，同 C83 那句「先估幾十 bytes、實測 0.84 kB」。

#### 五、變異：M1 與 M2 各只紅一條，而且都不是焦點那條

| 變異                            | 紅     | 讀出來的意思                   |
| ------------------------------- | ------ | ------------------------------ |
| M1 兩顆按鈕對調                 | 1      | 焦點沒紅 —— 註冊那條接住       |
| M2 取消鈕改成普通按鈕           | 1      | 焦點沒紅 —— DOM 順序接住       |
| **M8 兩條同時拿掉**             | **3**  | ⭐ 焦點那條終於紅              |
| M3 整組改用 `Dialog` 基元       | **8**  | C81 一開始的判斷會被抓到       |
| M4 拿掉 `@click` 的 emit        | 1      |                                |
| M5 註解放在 content **外**      | 1      | 只有 C85 的原始碼絆線紅        |
| M9 註解放在 content **內**      | 2      | C85 那條 ＋ 本檔的產物那條都紅 |
| M6 預設 variant 改 `primary`    | 1      | 對照組比法有效                 |
| M7 拿掉 `data-slot`（恆真保護） | **11** |                                |

⚠️ **M1／M2 各只紅一條、而且都不是焦點那條，正是「兩條路獨立」的證據** ——
任一條斷掉使用者仍然被保護，所以焦點斷言保持綠是**對的**，不是漏抓。

⚠️ 另外兩個坑：`afterEach` 是**後註冊的先跑**，所以在 `enableAutoUnmount`
之外再加一個 `document.body.innerHTML = ""` 會在 Vue 卸載前把節點清光，
`removeFragment` 讀 `null.nextSibling` 丟例外 —— **12 條全紅**。
而不卸載的話，`document.querySelector` 每次抓到的是上一條留下的那個。

#### 六、⚠️ 更正 C85：它的標題點名的那一個，正好是唯一不會洩漏的

上面那個 portal 機制是昨天寫 C85 時不知道的。回頭量了 C85 之前的四個元件：

| 元件                 | 作者註解進 SSR 產物      |
| -------------------- | ------------------------ |
| `UiCheckbox`（勾選） | ✅ 1 段                  |
| `UiCheckbox`（未勾） | ❌ 0（Indicator 不渲染） |
| `UiSelect`           | ✅ 1 段                  |
| `UiDatePicker`       | ✅ 2 段                  |
| **`UiDialog`**       | **❌ 0**                 |

`UiDialog` 那一段寫在 `<DialogPortal>` 裡面，**SSR 下整個 portal 是 `<!--v-if-->`**。
C85 的標題是「模板註解會進 SSR 產物，而它不只 `UiDialog` 一個」——
**它點名的那一個是唯一不會的。**

⚠️ **掃描本身沒有錯，錯的是理由的普適性。** 註解不該寫在模板裡這件事仍然成立
（另外三個確實洩漏，而 portal 會不會渲染是 reka-ui 的實作細節、不是我們的保證）。
但「四個元件五段都在洩漏」這個敘述是假的，而它之所以寫得出來，是因為
**只量了 `UiField` 一個就把結論推到另外四個身上**。
同 C83 §「沒量就不要報數字」，只是這次錯在「量了一個就當量了全部」。

`a11y.test.ts` 的檔頭同步更正：它原本說產物層檢查「成本遠大於換到的」，
而對包在 `Teleport` 裡的模板那不是成本問題，**是做不到**。

#### 七、量到的

|               |                                                  |
| ------------- | ------------------------------------------------ |
| 元件          | **25 → 26**                                      |
| `api-surface` | **144 → 146** 個 export，零刪除                  |
| 新增測試      | 12 條，**九個變異全部驗過**                      |
| 新增套件      | **0**（兩個相依本來就在 catalog 與 lockfile 裡） |

#### 八、⚠️ 沒有守到的那一半

- **真實瀏覽器的焦點行為。** happy-dom 沒有可見性計算 —— 一個
  `display: none` 的取消鈕在這裡照樣「聚焦得到」。
- **`AlertDialogAction` 就是 `DialogClose`，按下去先關再說**，所以
  「確認 → async 刪除 → 中途 spinner」做不到。那是上游語意，這裡照做。
  需要那個的案子要的是表單對話框（`UiDialog` ＋ `footer` 槽），不是確認框。

---

### C87 — 兩支測試搶同一個 repo，第二次；而這次兩條斷言直接相反（2026-08-20）

C61 是同一個成因的第一次發作（`doc-facts` 數 workspace 套件數），修法是讓數數的
那一側認得 `zz-` 前綴。這次發作在 `tools/conformance`：PR #79 的 Tier 1 紅在
`tests/negative.test.ts` 最後一條，**前 30 次 CI 全綠，重跑就過**。

#### 一、為什麼 C61 的修法在這裡不成立

兩條斷言指著同一個真實根目錄，而且**要求相反的狀態**：

| 誰                              | 對真 repo 斷言                                  |
| ------------------------------- | ----------------------------------------------- |
| `conformance/tests/negative.ts` | 一致性檢查是**綠的**                            |
| `slice-gen/tests/e2e.ts`        | 一致性檢查是**紅的**（含「擁有權」與 1 項違規） |

slice-gen 那條要的就是「產出的切片過得了真的閘門，除了必須由人指派的那一項」——
它必須在真的 `features/` 底下建真的檔案，因為 `tools/conformance` 讀的是真的檔案。

⚠️ 沿用 C61 的做法（讓 conformance 也跳過 `zz-`）**會把 slice-gen 那條弄壞**：
閘門一旦略過那個切片，就不再報「擁有權」，那條斷言隨即變成恆真。
C61 能成立是因為 doc-facts 只是在數數；這裡兩邊都在對同一件事做相反的判定。

所以修的是**排程**，不是斷言。

#### 二、修法：三個 package 的 `test` 從 script 改成 task

`dependsOn` 只認 task，而 `test` 原本是 `package.json` 的 script，所以三支各加一份
`vite.config.ts`。conformance 與 vue-typecheck 都宣告 `dependsOn:
["@org/slice-gen#test"]` —— slice-gen 跑完、`afterAll` 清完，它們才開始。

⚠️ 同一個名字**不能同時**存在於 `package.json` 的 scripts 與 `run.tasks`：
會是 `Failed to load task graph`，整批測試連跑都不會開始。三支的 script 都已移除。

⚠️ `vp run --parallel` 會**忽略 task 相依**，這道防護會安靜失效。CI 跑的是
`vp run -r test`，沒有 `--parallel`。

副作用：slice-gen 紅的時候，conformance 與 vue-typecheck 整條不跑。這對上 C61
自己寫下的原則 ——「讓一道閘門去報另一道閘門的問題，只會讓兩邊的訊息都變模糊」。

#### 三、`cache: false`：拿間歇紅燈換永久殘留

slice-gen 的 task 另外宣告 `cache: false`。一支**會寫真 repo** 的測試不可以進快取：
cache hit 時 Vite Task 會把該次的產出 restore 回來，而那些產出就落在真的
`features/` 底下 —— 換來的不是間歇紅燈，是**永久殘留**，而且那次根本沒跑，
e2e 自己那條「`features/` 只剩真正的切片」也不會紅。

⚠️ 實測時 vp 會自己判定 `not cached because it modified its input` 而略過快取，
所以拿掉這一行**看起來**也是對的。這裡要的是宣告，不是靠那個判定：建了又刪、
淨改變為零的那一次，自動偵測不保證還會這樣判。

#### 四、順手把還沒發作的那一個一起關掉

`vue-typecheck/tests/programs.test.ts` 是同一個形狀，只是還沒紅過：
`discoverPrograms(ROOT)` 在 collection 期算一次、`allViews(ROOT)` 在執行期又算一次，
`zz-` 切片若在這兩次之間出現或消失，「非 fixture 的 `.vue` 一個都不能漏」比的就是
**兩份不同時刻**的清單。

⚠️ 這條連 C61 的做法都救不了：兩份清單都會跳過 `zz-`，不一致的來源是時刻不同，
不是認不認得。

（`api-surface` 掃的是 `platform/`，與 `features/` 不重疊，不需要讓開。）

#### 五、變異

順序訊號用「相依被 graph 採納」驗，不看紅不紅 —— 窗口太窄，跑一次綠什麼都不證明。
讓 `@org/slice-gen#test` 直接 `exit 1`：

| 設定                      | conformance    | vue-typecheck |
| ------------------------- | -------------- | ------------- |
| 兩支都有 `dependsOn`      | **完全不執行** | 完全不執行    |
| 拿掉 conformance 的那一條 | 出現在執行列表 | 完全不執行    |

（`--last-details` 另外印出 `@org/slice-gen#test → Cache disabled in task
configuration`，第三節那一行確實生效。）

改動前後測試條數一致：conformance 79、slice-gen 71、vue-typecheck 24。
加 package 層 `vite.config.ts` 會改變 `vp test` 找設定的來源，所以這個比對是必要的。

#### 六、分支：刻意只進 `release/v1`，而 `main` 缺這個修法

照 C78／C81 的判準這是**面向開發流程**，該進 `main`。這次刻意不那樣做：紅的那次
（#79）就發生在 `release/v1`，不修的話這條線上每個 PR 都留著一道擲銅板的閘門。

⚠️ 代價記在這裡：**`main` 沒有這個修法**，兩條線的排程層從此分岔。`main` 要補的話
三份 `vite.config.ts` 可以直接搬，但 `main` 的 `tools/` 比這裡多（`gate-roster`、
`supply-chain`、`pii-check` 等），**哪些 task 也需要讓開必須重驗一次**，不能照抄。

#### 七、順帶：兩條沒帶訊息參數的斷言

`negative.test.ts` 裡唯二沒寫成 `expect(result.red, result.output)` 的是
`:562`（對真 repo）與 `:352`（對 sandbox）。前者正是這次紅的那一條 ——
於是 CI 日誌只給得出 `expected true to be false`，查不到原因。兩條都補齊。

---

### C88 — `Dropdown Menu`：選單的名字不是自己的，而焦點落點是整頁共用的（2026-08-20）

C81 裁決出的三個「三層全過」補完最後一個。⚠️ 過程中**推翻了自己寫的三段
論證**（§四、§五、§五之二），三次都是「推理成立、實測相反」，而第三次
**連 C86 一起更正**。

#### 一、決定 API 形狀的是一行 `aria-labelledby`

C81 §五 給它的理由是鍵盤導航（方向鍵／Home/End／首字母跳轉／Esc）。
那四件事全部對得上（§三有量測）。但**決定這個元件長什麼樣的不是那四件**，
是 `DropdownMenuContent.vue` 裡的一行：

```vue
:aria-labelledby="rootContext?.triggerId"
```

面板的可及名稱**整個借自觸發器**。而 C81 對它的定義是「表格每一列的『⋯』」，
那句話最自然的實作正好是一顆**沒有名字**的按鈕：

```vue
<button>⋯</button>
<!-- 按鈕無名 → role="menu" 也一起無名 -->
```

→ 所以 `label` 是**必填 prop**，同 `UiSelect` 的 `placeholder`（C78）與
`UiAlertDialog` 的 `confirmLabel`（C86）。三個都是同一個形狀：
**一個選填就會讓元件安靜地退化成沒用的樣子的東西，不能選填。**

⚠️ 而 C81 記的那四條**沒有一條**能導出這個結論 —— 它們講的是鍵盤能不能動，
這一條講的是輔具聽不聽得到名字。**C81 的理由是對的，但它不夠。**

#### 二、名字走 `sr-only` 的文字，不走 `aria-label` —— 理由是「壞掉的方式」

> ⚠️ **這一節有兩處錯，見 C89。** 一、末段那句「內容式的名字**才**進得了
> `aria-labelledby`」是**假的** —— `aria-label` 一樣進得去，換過去之後選單的
> 名字仍然解得出來。二、「這是本 repo 對付『寫了但永遠無效』那六次用的同一招」
> 是**誤植** —— 那六次的修法是補 prop、改上游預設、進 review 清單，
> **沒有一次**是「讓它壞得看得見」。修過的理由（重排成三條、而且只有第一條
> 今天在運作）在 `UiDropdownMenu.vue` 的檔頭。

|                  | 壞掉時                             | 誰會發現       |
| ---------------- | ---------------------------------- | -------------- |
| `aria-label`     | 畫面完全正常                       | 只有輔具使用者 |
| `sr-only` 的文字 | 那行字**顯示在按鈕上**，版型當場歪 | 第一個看到的人 |

這是本 repo 對付「寫了但永遠無效」那六次用的同一招：**把安靜的缺陷換成吵鬧的缺陷**。
另外兩個理由是次要的（`aria-label` 會蓋掉內容 → WCAG 2.5.3 Label in Name；
內容式的名字才進得了上面那個 `aria-labelledby`）。

⚠️ **`sr-only` 沒有具名槽，這是刻意的。** 一句
`{ UiDropdownMenu: { label: "" } }` 就能同時把按鈕與選單變成無名，而畫面
一個像素都不變。同 C86 不給 `footer` 槽：**覆寫是整條替換，所以能被覆寫的
東西不能是保護。**

#### 三、⚠️ 打開之後焦點落在哪，不由「誰打開的」決定

上游只在「使用者正在用鍵盤」時把焦點送到第一個項目：

```js
// MenuContentImpl.vue
@entry-focus="(event) => { … if (!rootContext.isUsingKeyboardRef.value) event.preventDefault(); }"
```

而 `isUsingKeyboardRef` 來自 `useIsUsingKeyboard()`，那是
**`createSharedComposable`** —— 整頁一份、掛在 `window` 的 capture 監聽上、
由**最後一次** keydown／pointerdown 翻面。五個實驗：

| 實驗 | 怎麼打開                             | 焦點落在   |
| ---- | ------------------------------------ | ---------- |
| E1   | 掛載時就 `open: true`，沒有輸入事件  | 選單容器   |
| E2   | 關著掛載，在觸發器上按 `↓`           | **第一項** |
| E3   | 關著掛載，點觸發器                   | 選單容器   |
| E20  | 程式 `open = true`，前一個事件是滑鼠 | 選單容器   |
| E21  | 程式 `open = true`，前一個事件是鍵盤 | **第一項** |

**E20 與 E21 只差「頁面上最後一個輸入事件」，其餘完全相同**，而 E21 送的
那個鍵是 `Tab` —— 一個與這個選單毫無關係的鍵。E12 更直接：兩個選單同時
掛著時，第二個吃得到打在第一個身上的鍵盤事件。

#### 四、⚠️ 第一次自我推翻：元件檔頭把它寫成了「這個實例的性質」

第一版寫的是「**從程式碼設 `true` 與使用者按鍵打開，落點不一樣**」。
讀起來像是這個元件實例記得自己是怎麼被打開的 —— 而它記的是一個整頁共用的
布林值。E20／E21 是為了驗證那句話而設計的，結果驗掉了它。已改。

同 C86 的 B4：**寫了論證就要去量它**，而且量的時候要把「唯一的變因」真的
隔離出來 —— 那兩條測試就是這樣設計的，所以它們固化下來之後仍然是那個實驗。

#### 五、⚠️ 第二次自我推翻：`data-[highlighted]` 的理由是假的

預設表裡高亮那一格的第一版註解寫著「`focus:` 只接得到鍵盤那條，滑鼠那條
接不到」。實測：上游在指標移過項目時**同時**設 `highlightedElement`
**並且** `item.focus()`，兩者落在同一個元素上。**在這個元件的形狀下兩種
寫法等價。**

留下 `data-[highlighted]` 的真正理由改寫成兩條：與上游／shadcn 的 part 名
對齊（同 `theme.ts` 講槽名那一段），以及上游確實有一條讓兩者分家的路徑
（`onKeydownNavigation` 用 `focus: false`，給有篩選框的選單用）——
那條路這個元件現在走不到。

⚠️ 而**變異驗過：改成 `focus:` 零條紅**。記下來，不假裝它有閘門。

#### 五之二、⚠️ 第三次自我推翻：emit 的那一刻還沒關 —— 而 C86 也錯了

`emit` 的說明第一版寫著「**收到的時候選單已經關了，所以不要再去改 `open`**」。
上游的順序是：

```js
emits('select', itemSelectEvent)   // ← 使用端的處理器在這裡跑，選單還開著
await nextTick()
if (itemSelectEvent.defaultPrevented) …
else rootContext.onClose()          // ← 一個 tick 之後才關
```

實測（探針放在 `@select` 處理器**裡面**查 DOM）：**面板還在**。

⚠️ **結論相同、理由相反，而更正之後的警告更強**：不要從這裡改 `open`，
不是因為它已經關了，是因為你寫的 `open = true` **會被一個 tick 之後的
`onClose()` 安靜地蓋掉**。前者只是多餘，後者是會被吃掉的一行程式碼。

⚠️ **同一個錯 C86 也犯了**：`UiAlertDialog` 的 `confirm` 說明寫著
「對話框已經關了」，實測一樣是還開著。兩個檔案一起改了，兩支測試各加一條
把時序釘住 —— 探針**必須放在處理器裡面**，因為既有那幾條都在 `settle()`
之後查，那時確實關了，所以它們對這個錯完全無感。

變異驗過：把 emit 延到 `nextTick` 之後（也就是「已經關了」的那個世界），
兩邊各紅那一條、其餘全綠。

#### 六、`items` 陣列，而且沒有分隔線

判準同 `UiSelect`／`UiRadioGroup` 那條軸（項目內容是不是任意的，C78 §3），
而這裡多一個上游給的理由：**首字母跳轉讀的是 `textContent`**
（`useTypeahead.ts`：`item.value?.textValue ?? item.ref.textContent`）。
開放任意項目內容 ＝ 開放「在項目前面塞個徽章，然後跳轉安靜地對不上」，
而跳轉正是 C81 判它進範圍的四件事之一。

**刻意沒有分隔線。** 要它就得把 `items` 變成有辨識標籤的聯集，而那個成本
落在**每一個使用端的 `v-for`** 上，換到的是一條線。同 C86 記漏掉 `footer`
的方式記在這裡：需要的時候再開，那是新增 prop、不是破壞性變更。

#### 七、變異

| 變異                               | 紅     |                                |
| ---------------------------------- | ------ | ------------------------------ |
| M1 拿掉 `sr-only` 的名字           | **4**  | 名稱那組 ＋ 產物那組同時紅     |
| M2 名字改用 `aria-label`           | 1      | ⚠️ 只有一條 —— 見下            |
| M2b M2 且拿掉 span                 | **4**  |                                |
| **M3 拿掉 `:text-value`**          | **0**  | ⚠️ 那一行今天沒有行為          |
| M4 `align` 預設改成 `start`        | 1      |                                |
| M5 拿掉面板的 `data-slot`（恆真）  | **10** |                                |
| M6 拿掉 `:disabled`                | 2      |                                |
| M7 `danger` 改成取代而不是疊加     | 1      |                                |
| M8 emit `label` 而不是 `value`     | 1      |                                |
| M9 註解放進面板**內**              | 2      | C85 原始碼那條 ＋ 本檔產物那條 |
| M10 註解放在面板**外**（觸發器裡） | 1      | 只有 C85 那條                  |
| M11 `sr-only` 改成 `hidden`        | 3      |                                |
| **M12 高亮改用 `focus:`**          | **0**  | ⚠️ 見 §五                      |
| M13 兩個 `data-slot` 對調          | **10** |                                |

⚠️ **M2 只紅一條，而那一條是刻意為它寫的。** 換成 `aria-label` 之後
名稱仍然解得出來（`aria-labelledby` 對 `aria-label` 一樣有效），所以
「名字接得起來」那條**照樣綠**。守住這個選擇的只有那條逐字檢查
「不是 `aria-label`」的斷言 —— 也就是說 §二 那個決定**沒有行為層的閘門**，
只有一條寫死的慣例檢查。這一格必須誠實。

> ⚠️ **M2／M2b 的標籤與上面這段結論已更正，見 C89 §三。** M2 量的是
> 「**加上去**」（保留 span 再加 `aria-label`），不是「換過去」——「換過去」
> 是 M2b。上面那句話對 M2 為真，但它不是這個決定的變異。
>
> 而重量之後多出一件比它重的事：**M1 與 M2b 紅的是同一組四條** ——
> 這套測試對「名字整個消失」（真缺陷）與「名字搬到 `aria-label`」（真瀏覽器裡
> 完全正常）給出**逐字相同的判決**。M11 的 3 也因為新增的金絲雀變成 **4**。

#### 八、量到的

|               |                                                  |
| ------------- | ------------------------------------------------ |
| 元件          | **26 → 27**                                      |
| `api-surface` | **146 → 148** 個 export，零刪除                  |
| 新增測試      | 23 條 DOM ＋ 3 條產物 ＋ `UiAlertDialog` 補 1 條 |
| 新增套件      | **0**（happy-dom 那條路 C86 已經開好）           |
| 變異          | **十五個全部驗過**，其中三個零紅（見 §九）       |

#### 九、⚠️ 沒有守到的

- **`sr-only` 與 `aria-label` 的差別**（§七 M2）。只有一條慣例檢查。
- **`data-[highlighted]` 與 `focus:` 的差別**（§五 M12）。零條。
- **`:text-value`**（§七 M3）。今天等價於 `textContent`，留著是釘住日後
  在項目裡加東西時的行為。**現在是註解，將來才是行為。**
- **面板的位置。** `data-align` 是屬性、量得到；真正的座標由 floating-ui
  依版面算，而 happy-dom 沒有版面。
- **它是 modal 的**（上游預設）：整頁被 `aria-hidden`、頁面捲不動。
  對列動作來說第二點會讓人意外，但改它等於讓本 repo 與所有 shadcn 文件
  不一致。照做並寫下來。
  ⚠️ 附帶後果：**觸發器自己也在被 `aria-hidden` 的那一側**，而名字仍然
  讀得到（名稱計算會進 `aria-hidden` 子樹取字）。不要為此寫測試。

  > ⚠️ **這句已更正，見 C89 §六。** 「名字仍然讀得到」**沒有量過，而且規格上
  > 是灰區**。結論（別為它寫測試）不變，理由整個換掉：不是因為那條會紅得沒
  > 道理，是因為沒有人知道正確答案是什麼。

- **選一項就關，沒有「執行中」狀態。** 同 C86 的「兩顆按鈕都會關掉」。
- ⚠️ **C89 另外記了三條沒守到的**，見該條目 §八。

---

### C89 — 一條慣例的體檢：`sr-only` vs `aria-label`，三處更正與一個量不到的邊界（2026-08-20）

C88 §九 自己記著「`sr-only` 與 `aria-label` 的差別**只有一條慣例檢查**」。這一條
是去問那句話該不該成立。⚠️ 而問下去之後，**原本要判的那件事最快定案，三處更正
反而是主體** —— 其中一處已經印在發出去的 v1.1.0 上。

> ⚠️ **本條目用到一個記號：`規格來源，本 repo 量不到`。** 它標的是「查規格來的、
> 這個 repo 結構上量不到」的宣稱。**記號本身的立法不在這條** —— 它是一條關於
> 「記錄怎麼寫」的規矩，面向開發流程不面向交付物，照 v1 的判準落在 `main`。
> 這裡只使用它。

#### 一、根裁決：做不成行為層的閘門，而理由不是成本，是構造

今天觸發器沒有可見文字，`sr-only` 與 `aria-label` 兩種寫法算出來的可及名稱是
**同一個字串**。任何忠實實作 accname 的閘門對兩者都會綠 —— 往交付線加
`dom-accessibility-api` 換到的是一條**分辨不出差別**的測試。

⚠️ **但「不是閘門」不等於「只是風格」。** 它是 ⭐「選單的名字是從觸發器接過來的」
那條測試的**前置條件**：名字一離開 DOM 的文字內容，那條 ⭐ 就只剩「屬性在不在」
可以斷言，再也證明不到 `role="menu"` 拿到了名字。

→ 那條斷言改標成 ★ 並搬到 ⭐ 旁邊，失敗訊息改成指向後果（「上面那兩條還算不算
數」），不是指向風格。這正是本 repo 給 ★ 的角色：**保險，不是條文**。

#### 二、⚠️ 更正一：「內容式的名字**才**進得了 `aria-labelledby`」是假的

C88 §二 的理由二、以及元件檔頭的同一句。由 `aria-labelledby` 觸發的名稱遞迴會
忽略被指元素**自己的** `aria-labelledby`，但 `aria-label` 照用 —— 換過去之後
選單的名字一樣解得出來。（⚠️ **規格來源，本 repo 量不到**：page JS 沒有算可及
名稱的 API，`computedName` 只在 DevTools protocol。）

⚠️ 而 C88 §七 的 M2 註解裡**寫著正確的那一句**。同一份文件的兩節互相矛盾了
一整版沒有人撞到 —— 因為一個在講理由、一個在講變異，讀的人不會同時打開。

#### 三、⚠️ 更正二：M2 量的是「加上去」，不是「換過去」

`M2b` 的定義是「M2 且拿掉 span」→ 反推 **M2 保留了 span**。所以 C88 §七 那句
「守住這個選擇的只有那條逐字檢查」，是從**加上去**那個變異推出來的。那句話對
M2 為真，但 M2 不是這個決定的變異。四列全部重量（拆分與金絲雀之後）：

| 變異                                        | 舊    | 新    |                        |
| ------------------------------------------- | ----- | ----- | ---------------------- |
| M1 拿掉 span，不加 `aria-label`             | **4** | **4** | 組成換了，見下         |
| M2 **加上去**（保留 span ＋ `aria-label`）  | 1     | 1     | 就是那條慣例，別刪這列 |
| M2b **換過去**（拿掉 span ＋ `aria-label`） | **4** | **4** | 與 M1 **同一組四條**   |
| M11 `sr-only` 改成 `hidden`                 | 3     | **4** | 金絲雀咬到，見 §四     |

⚠️ **重量之後看到的東西比原本那句話重得多。** M1（名字整個消失，真瀏覽器裡是
真缺陷）與 M2b（名字搬到 `aria-label`，真瀏覽器裡完全正常）紅的是**同一組四條**：

```
★ candidate 真的是從元件模板取來的        （a11y，產物那組）
sr-only 真的編得出把文字挪出畫面的規則    （a11y，產物那組）
⭐ 選單的名字是從觸發器接過來的
★ 名字的載體還在 DOM 裡
```

也就是說**這套測試對「缺陷」與「非缺陷」給出逐字相同的判決**。原本 §七 寫的是
「這個決定沒有行為層的閘門」，實際狀況更強一階：**現有的紅燈根本分不出這兩件事
是哪一件。**

⚠️ 那四條會紅的原因也要寫下來：⭐ 那條的最後一步比對的是被指元素的
`textContent` —— 一個**代理**，不是可及名稱。M2b 的紅是**代理在反應**，不是
行為閘門在響。這個 repo 量不到可及名稱，所以那條 ⭐ 只能走代理；能走代理的前提，
就是 §一 說的那件事。

#### 四、金絲雀，與它咬到的第二種紅法

`sr-only` 剩下的兩個理由都是**條件成立才啟動**的，而條件今天都不成立
（WCAG 2.5.3 要等到觸發器有可見文字；「壞得吵」要等到 CSS 沒編出來，而那一種
已經有 `a11y.test.ts` 產物那三條在守）。一條沒有對象的理由會安靜地留在檔頭當
裝飾品 —— 所以掛一條 `★ 觸發器今天沒有可見文字`：把 `.sr-only` 拿掉之後，
剩下的文字必須是空的。

**它是絆線，不是缺陷偵測器** —— 同 `a11y.test.ts`「★ 真的有元件在用動畫」：
它紅的時候發生的是一個**合法的**修改，紅的意思是「回來看一眼」。

⚠️ **而它咬到了一個沒預期的東西：M11。** 把 `sr-only` 改成 `hidden`，那行字不再
在 `.sr-only` 裡，於是這條紅（3 → 4）。**它紅得有道理** —— `display: none` 的
文字算不進可及名稱，那個變異在真瀏覽器裡是真的把名字弄掉了 —— 但紅的理由與
WCAG 2.5.3 無關。所以失敗訊息寫成兩種可能，不是一種：**一條絆線有兩種紅法時，
訊息要兩種都講得出來**，否則下一個人會照著錯的那條線索去查。

#### 五、⚠️ 更正三：「那六次用的同一招」是誤植 —— 而它已經發出去了

C88 §二 那句：

> 這是本 repo 對付「寫了但永遠無效」那六次用的同一招：**把安靜的缺陷換成吵鬧的缺陷**。

去讀那幾次的修法：

| 那一次                                 | 實際的修法                                       |
| -------------------------------------- | ------------------------------------------------ |
| `UiDatePicker` 的三條 `aria-invalid:*` | 「**讓它們變成真的**」—— 開一個 `invalid` prop   |
| `UiPagination` 的 `ellipsis` 槽        | 打開上游的 `show-edges`，讓那個槽有機會出現      |
| `scope` 的預設值寫在模板               | 明講「**這不是加閘門解得掉的**」→ 進 review 清單 |

補 prop、改上游預設、進 review 清單。**沒有一次是「讓它壞得肉眼看得見」。**
那六次是這個缺陷**出現**的次數，不是這一招**用過**的次數 —— 那句話把「抓過六次
的同一種病」寫成了「用過六次的同一種藥」，等於向六個先例借了它們沒給過的權威。

⚠️ **而「六次」這個數字本身沒有名冊**：明確編號的只到第三次
（`UiSwitch` 的死 `peer`、`UiDatePicker` 的三條 `aria-invalid:*`、`UiPagination`
的 `ellipsis` 槽），C81 那裡說「v1.0.6 抓了四次」也沒附清單，到 C88 變成六次。
**這個數字是一路長大的，沒有任何一處把它列出來過。**

→ 改法是把那句話**反過來寫**，不是去補名冊：那六次做得到的（讓死的東西變成活的
／進 review 清單）**這一次做不到**，所以退而求其次選了壞得看得見的那一種，
而它只涵蓋「CSS 沒編出來」那一種壞法。反過來寫之後那個數字就不再承重 ——
它唯一的作用是借權威，拿掉權威就不需要數字。真要名冊是獨立的一件事。

⚠️ **這一段已經印在 `CHANGELOG.md` 的 v1.1.0 上**（`ca846f7`）。照 C86 更正 C85
的做法：**原處留引言，不重寫歷史**。

#### 六、⚠️ 更正四：一條建立在未量前提上的**禁令**

`UiDropdownMenu.vue` 原本寫著：選單開著時觸發器自己也被 `aria-hidden` 蓋住，
但「名稱仍然讀得到 —— 名稱計算本來就會進 `aria-hidden` 的子樹取字。**所以不要
寫一條……的測試，那條會紅，而且它紅得沒有道理**」。

那句話沒有量過，而且規格上是灰區：accname 對隱藏節點的豁免給的是「被
`aria-labelledby` **直接指到**的那個節點」，而名字要從觸發器的**子樹**取字，
子樹裡那個 `<span>` 沒有被直接指到、又繼承了 `aria-hidden`。各家瀏覽器對這一段
的處理並不一致。（⚠️ **規格來源，本 repo 量不到**。）

⚠️ **結論不變，理由整個換掉，而換完之後這條比原本重要**：一句錯話會被下一個
讀者抓到；**一條建立在未量前提上的禁令會讓他不去查**。所以措辭從「不要寫，
因為它會紅得沒道理」改成「別靠它，也別為它寫測試 —— 因為沒有人知道正確答案，
寫出來的斷言只會把一個猜測固化成條文」。

（已查：`dropdown-menu.test.ts` 那條 modal 的測試只斷言「**外面的** div 被
`aria-hidden`」，沒有靠在這個宣稱上。降級不架空任何現存斷言。）

#### 七、順帶量到的一件事：使用端的 `aria-label` 會被安靜吃掉

原本是要去驗「使用端能不能從外面繞過這個名字」，結果反過來 —— 實測
`<UiDropdownMenu aria-label="…">`：觸發器上的 `aria-label` 是 `null`，DOM 裡一個
字都沒有，**而且沒有任何警告**。成因是根節點鏈
`DropdownMenuRoot → MenuRoot → PopperRoot` 最後渲染的是 `<slot/>`，
而這裡的 slot 內容是「觸發器 ＋ portal」兩個節點的 fragment。

→ 對這個元件是好消息：`theme.ts` 那句「那個 `<span>` 是**唯一**的可及名稱來源」
從推論變成**量過的**。⚠️ 但同一句話在 `UiSwitch` 上是**會動的**（單根元件，
fallthrough 到位）—— **同一個屬性在同一個 library 裡，一個元件會動、一個安靜
消失，而且沒有警告**。形狀同 C84 §九 的 `aria-describedby`，方向相反：那條是
使用端**贏**而看不到，這條是使用端**輸**而看不到。

#### 八、⚠️ 沒有守到的

- **三處 accname 的宣稱查的是規格，不是量的**（§二、§六，以及 ⭐ 那條的代理
  性質）。本 repo 結構上量不到可及名稱，這是邊界不是疏漏 —— 但邊界要自己說出來。
- **觸發器在 `aria-hidden` 下名字讀不讀得到：不知道**（§六）。
- **`sr-only` 與 `aria-label` 的差別仍然沒有行為層的閘門**，而且現在知道它
  **不可能有**（§一）。守它的是一條 ★ 前置條件 ＋ 一條金絲雀，兩條都不是閘門。
- **使用端 `aria-label` 被安靜吃掉這件事沒有閘門**（§七），只有檔頭寫著。

#### 九、動到的

| 檔案                          |                                                              |
| ----------------------------- | ------------------------------------------------------------ |
| `DECISIONS.md`                | C88 §二／§七／§九 原處留引言 ＋ 本條目                       |
| `UiDropdownMenu.vue`          | 理由重排成三條、劃掉假的那條、禁令降級、加「誰依賴這個形狀」 |
| `theme.ts`                    | 「唯一」補上量過的證據                                       |
| `CHANGELOG.md`                | v1.1.0 那段留更正引言                                        |
| `tests/dropdown-menu.test.ts` | 拆成三條（★ 前置條件／★ 金絲雀／aria 接線）                  |
| `tests/a11y.test.ts`          | 指出正則釘的形狀不只它在用                                   |
| `tests/alert-dialog.test.ts`  | 同一個代理也在那裡，補上記號（§二 那條邊界的第二個案例）     |
| 測試                          | **393 綠**，四列變異重量                                     |

### C91 — 採用演練的三個阻斷級症狀是同一句話：補的位置在 `platform/`（2026-08-21）

> ⚠️ **這條線跳過 C90**：`main` 已經用掉那個號（〈記號：分開「量過的」與「查規格來的」〉，
> `ceca983`）。兩條線的編號從 C70 起就各走各的，但 `main` 那次是**刻意跳到 C89 後面**
> 去避開撞號 —— 這裡不把它拿回來用，同一個號指兩件事會讓所有交叉引用變成陷阱。
> 動手前查的是本機 `main`，而它落後一個 commit；`git fetch` 之後才看得到（C89 §那條
> 「開 PR 前再查一次最大號」又應驗一次）。

#### 一、三個症狀，一個成因

[#95](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/95) 的阻斷級第 2 項是三則疊起來的：

| 症狀                                      | 演練當下的繞法                             |
| ----------------------------------------- | ------------------------------------------ |
| 新切片沒有資料端點（mock 的路由寫死兩片） | 在 repo 外面自己寫一支 mock BFF            |
| `.env` 的 `BFF_ORIGIN` 設了沒有效果       | 改用真的環境變數                           |
| 跑起來的應用沒有登入畫面，mock 一律 401   | 讓自己那支 mock 對第一個請求自動發 session |

三個繞法都成立，而且都不是採用團隊該做的事。共同的形狀與那一項的頭條
（三道閘門的補救路徑假設你擁有這個 repo）是同一句話：**唯一能補的位置在
`platform/`，而那是各案不准動的地方。**

#### 二、②a 接縫的形狀 —— 順序就是設計

`BffMockOptions` 加兩格：`routes` 與 `extraPermissions`。難的不是欄位，是位置。
比對順序固定為：

```
契約端點（login／logout／session／ping／admin-ping）
  → 401 閘門
    → 注入的路由
      → 示範資料（/api/orders、/api/shipment）
        → 404
```

**在 401 之後**：放到前面的話，這道接縫同時是一條「不用登入就拿得到資料」的路，
而這個 mock 存在的全部理由是證明 D8 那條路徑走得通 —— 開一條繞過它的路等於把
它自己推翻。**在契約端點之後**：蓋得掉的話，一份「通過契約」的參考實作可以被
一行設定改成不通過，而契約測試不會知道。示範資料則刻意在後面，覆寫它們是合理需求。

變異驗過：把注入點搬到 401 閘門之前，`platform/bff-mock/tests/routes.test.ts`
紅**兩條**（「沒有 session 時回 401」與「契約端點蓋不掉」），其餘十條照樣綠 ——
那十條在改動前後都綠，它們是護欄不是驗收。

`extraPermissions` 是**追加**不是取代。取代的話，加一片切片就得把示範切片的權限碼
重列一次，而漏列的症狀是示範切片安靜地壞掉。預設值仍不含 `admin`，那是契約要驗
401 與 403 分開的前提，另有一條測試釘住它。

路徑走環境變數 `BFF_MOCK_ROUTES`（`BFF_MOCK_PORT` 已立下慣例），不走約定的
`apps/<app>/…`：`SCOPE.md` 說各案會把 `apps/` 整個換掉，讓 `platform/` 依賴一個
承諾被換掉的東西，方向是反的。

⚠️ 路由處理器**刻意不透出 node 的 `req`／`res`**。透出去的話寫路由的人可以自己
`writeHead`，於是可以繞過上面那個順序 —— 收斂成 `BffMockRequest → BffMockReply`
之後，繞不過去是型別層面的事實，不是一句「請不要這樣做」。

#### 三、②b 修的是實作，不是文件

`apps/console/vite.config.ts` 的 proxy target 讀 `process.env["BFF_ORIGIN"]`，而
`.env.example` 教的是在 `.env` 寫它 —— `.env` 的值只進到 `loadEnv` 回傳的區域變數
`env`，**從來沒有人讀它**。只改文件的話等於把 bug 寫成規格，所以改的是那一行：
`process.env` 優先，其次 `env`，再退回預設。

刻意用 `||` 而不是 `??`：`BFF_ORIGIN=` 這種空值要當成沒設，否則 proxy target 會變成
空字串 —— dev server 照常啟動，而每一個 `/api` 請求都失敗。

⚠️ 測試的儀器有一格不能省：`.env` 被 `.gitignore` 排掉（`!.env.example` 是唯一例外），
所以 fixture 由測試自己寫進暫存目錄再 `chdir` 過去。放不進版控就代表 CI 上量到的
會是另一件事。

#### 四、②c 為什麼是一顆按鈕，不是登入畫面

`platform/bff-mock` 的檔頭自己寫著它為什麼停在參考實作：「腳手架裡一個**看起來
很完整**的認證服務，會被複製到 production。」一個有帳號密碼欄位的登入頁正是那個
形狀，所以這裡只有一顆按鈕，而且它自己說明白 production 不會有這個畫面。

也刻意**不**讓 mock 自動建 session（演練那支繞法就是這樣做的）：那樣的話 D8 的
「登入 → 帶 cookie → 被 CSRF 擋 → 補標頭 → 通過」在本機永遠走不到，而它走得通
正是這整套東西存在的理由。按一下按鈕，那條路徑就真的被走了一次。

元件在 production 建置裡整個被搖掉（`import.meta.env.DEV` 三元式 ＋ 動態 import），
而守它的測試**真的建置兩次**：production 那次要找不到探針，development 那次要
找得到。只建一次的話，「產物裡沒有那串字」有一個很無聊的解釋 —— 那串字根本不存在。

#### 五、三道沒被預期到的閘門

| 閘門                              | 說了什麼                                   |
| --------------------------------- | ------------------------------------------ |
| `api-surface`                     | 公開簽章**不得引用未匯出的型別**           |
| `vp run -r test`                  | `platform/bff-mock` 根本沒有 `test` script |
| `no-unsanitized/method`（eslint） | 動態 `import()` 的引數不是字面值           |

第一道最有價值：`BffMockRoute.handle` 的簽章引用了兩個未匯出的介面，閘門要求
「把它 export 出去（它本來就出現在你的公開簽章裡，消費端沒有名字可以稱呼它），
或者行內展開」。照它說的做，於是 `BffMockRequest`／`BffMockReply` 也成了公開面。
`api-surface` 的 export 數 148 → 151，README 那一句跟著改 —— 那正是 `doc-facts`
存在的用途，不是它誤報。

第二道是**測試白寫的形狀**：這個 package 一支測試都沒有，補的測試若不加 script，
`vpr ready` 一條都不會跑而且全綠。補了之後確認 `vp run -r test` 真的多跑一支。

第三道照 `tools/codemods/run.ts` 已經立下的先例處理：`existsSync` 先確認、單獨成行的
`eslint-disable-next-line` 緊貼目標、豁免理由寫在上面（開發者自己設的環境變數、
dev-only、且那支伺服器預設拒絕在 `NODE_ENV=production` 啟動）。

#### 六、壞掉的是儀器，不是東西

搖樹那支測試第一版紅了，而**產物是對的**：命令列跑出來的 `dist/` 裡一個字都沒有。
成因是 Vite 判定 `isProduction` 看的是 `NODE_ENV || mode`，而 vitest 會把 `NODE_ENV`
設成 `"test"` —— 於是只傳 `mode: "production"` 的建置，`import.meta.env.DEV` 仍然是
`true`。

⚠️ 記在這裡的理由不是這個成因，是**失敗方向**：這次斷言的方向是「找不到」，儀器壞
就會紅，所以被抓到了。方向反過來的話（斷言「找得到」），同一個儀器故障會讓測試
安靜地通過。

#### 七、④ 只寫順序與指標

`HANDOFF.md` 從「換 CODEOWNERS」直接跳到「跑全套檢查」，中間四段（裝相依、開切片、
接資料、用元件）一段都沒有。新增的那一節只給順序與指標，唯有「接資料」寫實體內容 ——
其餘三段的答案 README 與元件原始碼已經有了，抄過來就是第五份手抄本。

⚠️ 那一節**刻意一個數字都沒有**。`doc-facts` 守的是被登記過的句子，新寫的數字不會
自動被守 —— 一句沒被登記的「有 N 個元件」，過期時沒有任何東西會說話。

⚠️ 那一節的程式碼範例第一版**過不了這個 repo 自己的閘門**：`apps/<app>/bff-routes.ts`
在 tsconfig 的 `include` 之外，但 `vp check` 照樣檢查它，而沒有標註型別的解構參數
是 TS7031。也就是說那段範例本身就是這一輪在修的那個病 ——「照文件做完，閘門紅，
而補救路徑文件沒寫」。現在的版本是逐字存成 `.ts` 檔跑過 `vp check` 的（零錯誤零告警），
而且範例裡那個 `RouteRequest` 介面連同「為什麼不能省」一起寫進去了。

#### 八、這一輪刻意沒做的

阻斷級第 1 項（三道閘門）與第 3 項（深色模式）不在這個改動裡。第 3 項另開一個
小 PR（C92）；第 1 項的形狀取決於「這棵樹怎麼知道自己是不是上游」，那是 issue #91
在問的問題，②④③ 做完再開一輪。

#### 九、動到的

| 檔案                                     |                                                             |
| ---------------------------------------- | ----------------------------------------------------------- |
| `platform/bff-mock/src/server.ts`        | `routes`／`extraPermissions`、逐段路徑比對、注入點的位置    |
| `platform/bff-mock/src/cli.ts`           | `BFF_MOCK_ROUTES` 載入 ＋ 形狀驗證 ＋ 把載到的路由印出來    |
| `platform/bff-mock/tests/routes.test.ts` | 新增（這個 package 原本零測試，`test` script 也一併補上）   |
| `apps/console/bff-routes.ts`             | 新增：取消訂單那條端點（`cancelOrder()` 原本一定 404）      |
| `apps/console/vite.config.ts`            | proxy target 改讀 `env`，`process.env` 仍優先               |
| `apps/console/src/DevSession.vue`        | 新增：dev-only 的 session 入口，production 建置裡不存在     |
| `apps/console/src/App.vue`               | 動態 import ＋ `import.meta.env.DEV`，形狀是刻意的          |
| `HANDOFF.md`                             | 新增〈從這裡到第一個能操作的畫面〉                          |
| `README.md`                              | api-surface 的 export 數 148 → 151                          |
| 測試                                     | 新增 23 條（bff-mock 12、console 11），變異驗過一次（2 紅） |

---

### C92 — 代幣一直是對的，只是沒有人把它塗上去（2026-08-21）

#### 一、量到的

[#95](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/95) 的阻斷級第 3 項：在偏好深色的機器上整個應用是**黑底黑字**。
在 `apps/console` 的 dev server 上量：

| 量的東西                     | 修之前             | 修之後               |
| ---------------------------- | ------------------ | -------------------- |
| `body` 的 `background-color` | `rgba(0, 0, 0, 0)` | `rgb(255, 255, 255)` |
| `body` 的 `color`            | `rgb(0, 0, 0)`     | `oklch(0.21 …)`      |
| `--color-surface`            | `#fff`             | `#fff`               |
| `--color-fg`                 | `oklch(21% …)`     | `oklch(21% …)`       |

後兩列是重點：**代幣一直都在，而且一直是對的**。壞的不是配色，是
「入口沒有任何一條規則把它們用在文件上」。元件各自帶底色，所以按鈕與
對話框看起來正常 —— 表格、清單、頁面本體則直接吃瀏覽器的深色畫布，
配上 Tailwind base reset 的黑字。

四道閘門全綠，而且它們沒有錯：`theme-verify` 驗的是「元件不寫原始顏色」
與「代幣換得掉」，**「有沒有人用它」不在它的問題裡**。這條縫與 `tools/sast`
那個假項目（C72 §一）是同一種：**每一道閘門都答對了自己的問題。**

#### 二、修在 `platform/ui`，不是 `apps/console`

演練當時改的是 `apps/console/src/styles.css`（那個檔案自己寫著「fork 這份
腳手架的人第一個要改的就是這個檔」，所以那是合理的選擇）。這裡不能那樣修：
`SCOPE.md` 說各案會把 `apps/` **整個換掉** —— 修在那裡等於沒修，下一個
採用團隊照樣黑底黑字。

#### 三、為什麼不補一套深色代幣

症狀是**看不見**，不是**沒有深色主題**。補整套深色配色等於替所有採用團隊
決定他們的配色，而 C62 說那是設計系統擁有者的事。這裡只用既有的語意代幣
把「應該長什麼樣」變成「真的長那樣」；要深色的案子覆寫 `--color-surface`／
`--color-fg` 即可，而那條路徑是通的（`theme-verify` 每次建置都在驗）。

#### 四、`@layer base` 不是寫作風格

Tailwind v4 走 cascade layers。寫在 layer 外面的規則**贏過所有 layered
utility** —— 於是任何人在 `<body>` 加 `class="bg-…"` 都不生效，而且沒有
任何東西會說話。包進 `base` 之後 utility 照常蓋得掉。

只塗 `body`、不塗 `html`：`html` 沒有自己的背景時 `body` 的背景會傳遞到畫布
（CSS background propagation），兩個都塗只是多一份要一起維護的宣告。

#### 五、這支測試量得到什麼、量不到什麼

`platform/ui/tests/styles.test.ts` 新增三條，量的是**宣告**：body 規則在不在、
在不在 `@layer base` 裡、引用的代幣有沒有宣告過。

⚠️ 它答不出「使用者看到的對比是多少」——那是瀏覽器的事，這個 repo 量不到
（同一條界線在 `theme-verify` 檔頭與 C89 各講過一次）。上面那張表的數字是
**手動在瀏覽器裡量的**，不是任何一支測試在守。建置後那些 `var()` 沒有懸空，
由 theme-verify 的第二段守。

#### 六、變異

| 改法                    | 紅幾條 | 哪幾條                                |
| ----------------------- | ------ | ------------------------------------- |
| 整條 body 規則拿掉      | 2      | 「同時被塗上」「用的是語意代幣」      |
| 搬到 `@layer base` 外面 | 3      | 上面兩條 ＋ 「必須在 @layer base 裡」 |

第二列是這三條各自守著不同東西的證據：少了那一條，把規則搬出 layer 這種
「畫面完全正常、而 utility 從此無效」的改動就沒有東西會說話。

`platform/ui` 測試 393 → **397**。

⚠️ 第四條是 code review 挑出來的：取 `@layer base` 區塊的那支取值器**逐字數括號，
但沒有先認引號** —— 而同一個檔案上方的 `stripCssComments` 檔頭已經為完全一樣的事
付過一次代價（`@source "…**/*.{vue,ts}"` 裡的 `{` 不是括號，**要比對程式碼就得先
分辨程式碼與字面值**）。今天 `@layer base` 裡沒有帶引號的字串，所以那一格現在不會
被用到；補起來的理由是**失效方式一樣安靜**：數錯了就取到半截區塊，而三條斷言會
對著半截區塊照常給答案。補的同時加一條變異驗過的斷言（拿掉認引號那一段 → 紅一條），
否則那段註解只是一個沒人驗過的宣稱。

#### 七、動到的

| 檔案                               |                                                         |
| ---------------------------------- | ------------------------------------------------------- |
| `platform/ui/src/styles/index.css` | `@layer base` 裡的 body 規則 ＋ 量到的數字              |
| `platform/ui/tests/styles.test.ts` | 新增〈文件本體〉四條 ＋ 認得引號的 `@layer base` 取值器 |

---

### C93 — 「沒有被治理」不等於「准許進入」：#94 撤出 release/v1（2026-08-22）

#### 一、這次審查問的問題

發版前的一次範疇審查：`v1.1.0`（`ca846f7`）到 `7cd0e5c` 這四則裡，有沒有
加進非 v1 範疇的東西。四則是 `186a18c`(C89)、`f240484`(#94)、`e030fbc`(C91)、
`7cd0e5c`(C92)。答案是一件：**`#94`**。

#### 二、判準不是「它面向誰」，是舉證責任

⚠️ **這一則的論證刻意不走「`docs/` 面向開發流程所以出局」那條路。** 那條路要贏
一場可以打的架 —— `AGENTS.md`／`CONTEXT.md` 對 fork 這份腳手架的團隊確實有用。

真正的問題在 `SCOPE.md:28`：

> 判定時**必須寫得出「受益者是拉 v1 的團隊」那一句**。寫不出來就不准進。

`#94` 沒有寫那一句。它寫的是另一句（PR 本文〈範疇〉一節）：

> `SCOPE.md:110` 明文把「根層的設定檔與文件」排除在治理之外，`scope-check`
> 也只掃 `tools/` 與 `platform/`，所以這些檔案不構成範疇衝突。

**「沒有被治理」不等於「准許進入」。** 依 `SCOPE.md` 自己的框架，沉默是舉證
責任沒有履行，不是預設通過。這條論證的好處是它不需要先判定 `docs/` 的歸屬。

#### 三、三個佐證

| #   | 事實                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一  | 被引的 `SCOPE.md:110` 是**標題**〈這份文件**不**涵蓋什麼〉，內容在 `:114`。而 `:114`「根層的設定檔與文件。」是排除清單三項裡**唯一光禿、沒理由也沒判定**的一項 —— `apps/`／`features/` 寫了「示範切片，各案會整個換掉」，`.semgrep/` 甚至明寫「**它在 v1 內**」 |
| 二  | **`docs/` 是新的頂層目錄**，`v1.1.0` 的樹上沒有它。而 `SCOPE.md` 開篇說自己「只回答一個問題：**一個目錄該不該存在於 v1 的樹上**」。就算接受 `#94` 的讀法，「根層的設定檔與文件」也涵蓋不到一個新的頂層目錄                                                      |
| 三  | **`DECISIONS.md` 對 `#94` 零條目**（`AGENTS.md`／`mattpocock`／`#94`／`docs/agents`／`CONTEXT.md`／`ADR` 全部零命中）。同範圍另外三則每則都有                                                                                                                   |

補充（不是主論證）：`README`／`HANDOFF`／`SCOPE`／`CHANGELOG` 四份交付物文件對
`docs/` 與 `CONTEXT.md` **零引用** —— 新目錄從採用團隊會讀的任何地方都到不了。

⚠️ **查掉了一個會翻掉這整則的反駁。** 「`.claude/` 和 `.github/` 早就在 v1 樹上了，
那不也是維護者的東西？」—— 查過：`.claude/` 只有 `launch.json`（dev server 埠號），
`.github/` 只有兩支 CI workflow，而 `SCOPE.md:115` 講 `.semgrep/` 時自己就引用了
`tier2-security.yml`。

⚠️ **分界不是「在哪個目錄」，是「內容在說什麼」** —— 光靠目錄位置答不了這個反駁，
因為 `.claude/` 確實是 Claude Code 專用的目錄。`launch.json` 的內容是**專案描述**
（埠號 5173、`vp run console#dev`），沒有一個字設定 agent 的行為；
`docs/agents/issue-tracker.md` 設定的是 **agent 該怎麼開 issue**。
按這條分界，`release/v1` 上**沒有**既存的「設定 agent 行為」慣例，`#94` 是第一件。

這個反駁如果成立，結論會從「`#94` 違規」變成「`SCOPE.md` 的排除清單不完整，
而 `#94` 只是暴露它的那一件」。它不成立。

#### 四、為什麼不能只撤一部分

原本談的處置是拆開：`AGENTS.md`／`CONTEXT.md` 留（fork 的人用得到），
`docs/agents/{issue-tracker,triage-labels}.md` 與 ADR-0001 撤。**讀了 diff 之後
這個選項就死了** —— `AGENTS.md` 新增的 `## Agent skills` 一節同時指向全部六個檔。
撤掉其中三個，`AGENTS.md` 就指向 `release/v1` 上不存在的檔。

那正是 `tools/scope-check` 檔頭寫的、它自己存在的理由：

> README 的目錄樹列著 `tools/sast/`，而那個目錄從來不在 v1 的樹上 ——
> 一個假的項目在最會被讀的地方待了不知道多久，而全套閘門照樣全綠。

**拆開等於交付那道閘門是為了防它而建的病。** 撤就六個一起撤。

#### 五、處置：全撤，但去處還空著

`git revert f240484`。範本是 `tools/gate-roster`：`v1.0.2` 帶過、`v1.0.3` 移除、
經過記在 C72。

⚠️ **跟 gate-roster 有一處不一樣，不要讀混：** `SCOPE.md` 說 gate-roster
「**活在 `main`**」，而 `#94` 的內容**現在哪裡都不活** —— `main` 上只有 `vp` 產生的
`AGENTS.md`，沒有 `docs/`、沒有 `CONTEXT.md`，而 `main` 正被 [#86](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/86) 凍著
（「`release/v1` 併回 `main` 之前，不再提 `main` 的更新與併線」）。

內容保留在 `f240484`，解凍後 `git cherry-pick f240484` 取得回來。
⚠️ **沒有任何機制在守這一句。** `#86` 解凍時如果沒有人記得，`#94` 的六個檔就是
永久遺失 —— 這一段話本身就是那個缺口的全部防護。

⚠️ **撤掉的不只是檔案，是一個現在還在用的能力。** `#94` 本文寫著那些檔的用途：
「`/triage`、`/to-tickets`、`/to-spec`、`/wayfinder` 讀這些」。這次撤回之後，
`docs/agents/` **在這個 repo 的任何分支上都不存在**（`main` 上只有 `vp` 產生的
`AGENTS.md`）。技能本身還在（裝在使用者層），但**接線要等 `#86` 解凍後
cherry-pick 才回得來**。

⚠️ **沒有閘門讀 `docs/agents/`，所以 `vpr ready` 與 CI 對這件事結構性地看不見** ——
全綠證明不了它沒發生。寫在這裡，是因為三週後 `/triage` 行為變了的時候，
唯一能把它接回這個 PR 的線索就是這一段。

`#94` 順帶在 GitHub 上建的四個 triage 標籤（`needs-triage`／`needs-info`／
`ready-for-agent`／`ready-for-human`）留著不動：標籤不在版控樹上，不是範疇對象。
[#87](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/87)（ADR 遷移）仍然開著，只是它引用的 ADR-0001 現在只存在於 git 歷史。

#### 六、量到兩條縫，這一輪不修

`tools/scope-check/src/check.ts:33`：`GOVERNED = ["tools", "platform"]`。

| 縫  | 什麼看不見                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------- |
| 一  | `docs/`、根層檔案、`.claude/`、`.github/`、`.semgrep/` 全在 `scope-check` 視野外。`#94` 能悄悄加一個頂層目錄而全綠，就是這條 |
| 二  | 它只比對目錄**名稱**，從不看 `SCOPE.md` 那兩張表的**描述**欄。描述說錯了、或東西變了而描述沒跟上，都不會紅                   |

跟 C92 §一、C72 §一是同一個形狀：**每一道閘門都答對了自己的問題。**
補這兩條是另一件事的大小，而且產出應該是把閘門視野補齊，不是一份手抄稽核表 ——
硬加一份清單而不加守它的機制，`SCOPE.md:17` 自己說那是在製造第五份手抄本。

#### 七、自審：`bff-mock` 的描述漂移（不是違規）

C89／C91／C92 都在 `platform/`（`SCOPE.md` 列著）、`apps/`（文件明說不治理）、
或 `doc-facts` 守著的交付物文件裡，受益者那句話寫得出來（#95 三個阻斷級症狀
就是「採用團隊第一天看不到資料」）。

⚠️ 但 `SCOPE.md` 的 `platform/bff-mock` 那一列還寫著「契約的參考實作」，而 C91
之後它同時也是一支吃使用者路由的通用 dev mock。**這是描述漂移，不是範疇違規** ——
那一列真正畫的線是「**不是認證伺服器**」，路由注入沒有越線。它是上面第二條縫的
第二個實例。

⚠️ 自審的限制：C91／C92 與這一則是同一個人寫的。這一段不能當成獨立查核。

#### 八、版號：`v1.2.0`，不是 `v1.1.1`

C91 加了採用端看得到的新能力（`BffMockOptions` 追加 `routes`／`extraPermissions`、
`DevSession` 橫幅、根層 `bff` script）。`api-surface` 148 → 151 個 export，
10 個進入點不變、零刪除零改名。新增能力 → minor。

⚠️ **不要說成「閘門判它是 minor」。** `CHANGELOG` 開頭那條規則只釘 **major**
（移除／改名／改變形狀讓閘門失敗）。minor vs patch 這一格是 SemVer 常規 ＋
`v1.1.0` 的前例，不是閘門強制出來的。講成閘門判的，會反過來把
「版號是閘門強制出來的，不是宣告」那句話弄假。

#### 九、動到的

| 檔案         |                                                                           |
| ------------ | ------------------------------------------------------------------------- |
| `AGENTS.md`  | 撤回 `## Agent skills` 一節，回到 `<!--VITE PLUS END-->` 結尾             |
| `CONTEXT.md` | 刪除                                                                      |
| `docs/`      | 整個目錄刪除（`adr/0001`、`agents/{domain,issue-tracker,triage-labels}`） |

---

### C94 — SCOPE.md 宣稱了一個閘門沒有做到的保證（2026-08-22）

#### 一、量到的

`SCOPE.md` 從 `v1.0.5` 起就寫著：

> ⚠️ **它守的是清單，不是內容。** 第三欄那句「受益者是拉 v1 的團隊」有沒有寫、
> 寫得對不對，機器讀不出來 —— 那一格仍然只有人能判斷。這道閘門保證的是
> **沒有人可以跳過那一格**。

最後那句是假的。把 `doc-facts` 那一列的後兩欄清空再解析：

|                    |                    |
| ------------------ | ------------------ |
| 原文 `listed`      | 8 項               |
| 清空後 `listed`    | **8 項**           |
| `doc-facts` 還在嗎 | **是** —— 閘門全綠 |

`parse.ts` 的 `FIRST_CELL` 只捕捉第一格，檔頭自己寫著「整列只認第一格，
後面兩欄是給人讀的」。

⚠️ **那句話把兩件事包成一句，於是可機械化的那一半也一起沒做。**
拆開來看：「**寫得對不對**機器讀不出來」是真的；「**有沒有寫**機器讀不出來」
是假的。前者只有人能判斷，後者是三行的事。

跟 README 曾經列著從來不存在的 `tools/sast/`（C72 §一）是同一種病、方向相反：
那次是**文件列了程式碼裡沒有的東西**，這次是**文件宣稱了程式碼沒做的事**。

#### 二、修程式碼，不是收回那句話

收回宣稱（把文件改成「它只保證那一列存在」）看起來比較誠實，成本也更低。
不那樣做的理由是 [#66](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/66)：它的紅燈訊息整段建立在「**你得寫出那一句**」之上。
把保證拿掉，等於把 `#66` 的前提抽掉，而 `#66` 是對的。

而且失敗方向很糟：現在加一列空白就能通過，**而這道閘門的整個賣點就是
「沒有人可以跳過那一格」**。

#### 三、兩張表的形狀不一樣，所以訊息必須分開

| 表          | 欄                                           |
| ----------- | -------------------------------------------- |
| `tools/`    | 路徑／守什麼／**為什麼受益者是拉 v1 的團隊** |
| `platform/` | 路徑／**是什麼**                             |

`platform/` 那一節的散文明寫「`platform/` 整層都是交付物本體…**逐一寫受益者
沒有意義**」。所以 `SCOPE.md:152` 那句「跳過**那一格**」字面上只指得到 `tools/`。

⚠️ **用同一句訊息會對著 `platform/` 要求一個文件自己說不該存在的欄位** ——
而下一個人只會照著補，然後那一節的散文就變成假的。訊息分兩套，`COLUMNS`
那張表就是為此存在的。

#### 四、刻意不處理跳脫的 `\|`，理由是**失效方向**

`cellsOf()` 直接 `split("|")`。跳脫只會把一格切成兩格，而多出來的那一格
要嘛是空的（→ 多紅一條，**吵**）、要嘛有字（→ 沒影響）。**它產生不出假綠。**

⚠️ **不要照抄 C92 的結論。** 那次補引號辨識是因為漏掉會**安靜地**取到半截區塊，
而三條斷言會對著半截區塊照常給答案。這裡的失效看得見，下一個人五秒內修掉。
兩件事的形狀不同 —— 「上次補了所以這次也補」是把理由換成慣性。
（實測：整個 repo 的 `.md` 目前一個跳脫管線都沒有。）

#### 五、變異

| 改法                                       | 紅幾條 | 哪幾條                   |
| ------------------------------------------ | ------ | ------------------------ |
| M1 完全不偵測（`skipped` 永遠空）          | 3      | 三條新的全紅             |
| M2 只驗最後一欄（`slice(1)`→`slice(-1)`）  | 1      | 「中間那一欄留白一樣紅」 |
| M3 兩張表用同一句訊息                      | 1      | 「兩張表的訊息不一樣」   |
| M4 連第一格一起驗（`slice(1)`→`slice(0)`） | **0**  | ——                       |
| M5 切格子時不 `trim`                       | 3      | 三條新的全紅             |
| M6 條件反過來（每一格都算「空」）          | 8      | 含「填 `x` 就過得了」    |

**M2 那一列是「驗的不是最後一欄」有獨立價值的證據**：少了它，把
`slice(1)` 收窄成只看最後一欄就沒有東西會說話，而「守什麼」留白一樣是
登記了沒判斷過。

**M4 零紅，而且它不是漏抓** —— `FIRST_CELL` 匹配成功代表第一格裡有一條
反引號路徑，所以它永遠非空，`slice(0)` 與 `slice(1)` **行為等價**。
零紅記在這裡是因為下一個人會想做同一個變異。

**M6 是為了證明第四條（負向）測試會咬。** 前五個變異都碰不到它 ——
負向斷言只有在檢查**過度**開火時才紅，而 M1–M5 全是讓它少開火或不開火。

⚠️ 真的 repo 那一條（`checkScope(repoRoot)` → `[]`）**免費接管了這道新斷言** ——
`SCOPE.md` 兩張表 18 列今天全部填滿，哪天有人加一列空的，它當場就紅。

#### 六、⚠️ 變異工具自己先給了五個假的零

第一次跑出來是**五個變異全部零紅**，而那是工具壞了，不是絆線不咬。兩個獨立的錯：

1. `vp run <pkg>#test --force` 把 `--force` 原樣丟給 vitest，vitest 不認 → **整個 run 崩掉**，
   而崩掉的輸出裡沒有 `N failed`，於是被算成 0。
2. vitest 的輸出帶 ANSI 色碼，`Tests  3 failed | 12 passed` 中間夾著跳脫序列 →
   正則對不上 → 又是 0。

**一個回報「零紅」的變異工具，跟「絆線不咬」在畫面上長得一模一樣。**
規矩：**變異表裡至少要有一列是非零的**，全零就是先去驗工具。
（第二次還加了「變異字串必須匹配到，否則直接 assert 失敗」—— 第一次的 M1
因為 prettier 把那行折成多行，`sed` 根本沒套上，而它照樣回報了一個數字。）

#### 七、這道閘門的邊界

填 `x` 就過得了。**那不是漏洞，是邊界** —— 它把「跳過」從**無聲**變成
**要動手寫一個字**，而「寫得對不對」仍然只有人能判斷。
`SCOPE.md` 那一節現在把這條界線寫出來了，少了它，下一個人會以為它在驗內容，
然後在它綠的時候不去讀那幾格。

⚠️ 射程的那一條縫（`GOVERNED` 只有 `tools/`、`platform/`）**不在這一則裡**，
開在 [#99](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/99)。刻意分開：這一則是讓既有宣稱變真，那一張是治理範圍擴大，
混在一支 PR 裡會讓上面那張變異表同時吃到兩套斷言。

#### 八、動到的

| 檔案                                    |                                      |
| --------------------------------------- | ------------------------------------ |
| `tools/scope-check/src/parse.ts`        | `cellsOf()` ＋ `Section.skipped`     |
| `tools/scope-check/src/check.ts`        | 第三個方向 ＋ `COLUMNS` 兩套訊息     |
| `SCOPE.md`                              | 改寫那段假宣稱，逐表講清楚斷言了什麼 |
| `tools/scope-check/tests/scope.test.ts` | 新增四條（11 → **15**）              |

---

### C95 — scope-check 的紅燈預設讀者是維護者，而拉 v1 的團隊也會撞到（2026-08-22）

#### 一、[#66](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/66) 說「兩種修法挑一個」，量下來不是二選一

`#66` 提了兩條路：① 紅燈訊息補第二句、分開兩種讀者；② `HANDOFF` 那句
「開案子用不到」加限定。它傾向 ①，理由是「文件沒有人在紅燈當下讀，訊息有」。

那個理由是對的，但**②不是備選，是另一個獨立的缺陷**：訊息修好之後，
那兩句話仍然是假的。所以兩條都做。

複現（臨時 git repo ＋ `checkScope`，不碰真 repo）：

```
✗ [樹上有、沒登記] `platform/their-client` 在版控裡，但 `platform/` 那張表沒有它
  → 在那張表加一列，並寫出「受益者是拉 v1 的團隊」那一句 —— 寫不出來的東西
    就不該進 `release/v1`，送 `main`（判準見 C72）。
```

對一個 fork 了 v1、要加自己共用 HTTP 包裝的團隊：「受益者是拉 v1 的團隊」
**依定義寫不出來**（他們自己就是那個團隊），而 `main` 是這個 repo 的分支。
判定是對的，錯的是**它預設讀訊息的人是誰**。

#### 二、訊息講兩種讀者，**不去判斷你是哪一種**

```
→ 在 `platform/` 那張表加一列，把「是什麼」那一格填起來。
  接下來那句話取決於你是誰：
  · **你 fork 了 v1 在做自己的案子** —— 寫你們自己的理由。這道閘門要的是
    「有人判斷過這東西該不該在樹上」，不是那六個字；「送 `main`」講的是
    這個 repo 的分支，跟你們無關。
  · **你在維護這條線、東西要送回上游** —— 寫得出「受益者是拉 v1 的團隊」
    才可以進 `release/v1`，寫不出來就送 `main`（判準見 `release/v1` 的 C72）。
```

⚠️ **刻意不去偵測「這棵樹是不是上游」。** 那是 [#91](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/91) 在問的問題，而它的答案還沒有 ——
**一個猜錯的偵測會給出看起來很確定的錯訊息，比預設一種讀者更糟。**
訊息同時對兩種人說話，這件事不需要那個答案。

⚠️ 續行縮排是 8 個空格，因為 `report.ts:50` 印的是 `      → ${fix}`（6 空格 ＋
`→ `）。實際跑 `formatReport` 對過，不是照著推的。

#### 三、兩句在交付物文件裡、對 fork 團隊而言是假的話

| 位置             | 原文                                                              | 為什麼假                                               |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| `SCOPE.md:6`     | 「要用這個腳手架開案子的團隊，你要的是 HANDOFF.md，**不是這份**」 | 他們在 `platform/` 底下加一個目錄就會被閘門送到這份    |
| `HANDOFF.md:387` | 「那份是給維護這條線的人的，**開案子用不到**」                    | 同上，而 `vpr ready` 正是 HANDOFF 叫他們第一個跑的東西 |

跟 C94 是同一種病：**交付物文件宣稱了一件程式碼會當場推翻的事。**
兩句都改成「主要是給維護者的，**但你加目錄的時候會用到**，那幾欄寫你們自己的理由」。

⚠️ 這裡**沒有**違反 `SCOPE.md:17` 那條「兩份刻意不重述對方的內容」——
兩邊加的都是**指路**（「你會被送到那裡」），不是把對方的清單抄過來。

#### 四、順帶：`C72` 是裸寫的

訊息裡原本是「判準見 C72」。⚠️ **C 編號在 C70 就分岔了**，`main` 的 C72 是
另一則決策（「收回一條寫在程式碼裡的規則」）。裸寫在這個 repo 有歧義，
而**訊息把人送去讀錯的那一則，不會有任何東西說話**。改成「`release/v1` 的 C72」，
並加一條斷言守著。

#### 五、變異

| 改法                            | 紅幾條 | 哪一條                 |
| ------------------------------- | ------ | ---------------------- |
| N1 拿掉 fork 那一半（只剩上游） | 1      | 「同時對兩種讀者說話」 |
| N2 `C72` 改回裸寫               | 1      | 「C72 不裸寫」         |
| N3 拿掉上游那一半（只剩 fork）  | 1      | 「同時對兩種讀者說話」 |
| N4 C94 那條拿掉給 fork 的括號   | 1      | 「也不預設讀者」       |

**N1 與 N3 紅同一條，而那是刻意的**：那條斷言守的是「兩半都在」，
少任何一半都該紅。分成兩個變異跑，是為了證明它**不是只看得到其中一半**——
只驗 fork 那一半的話，N3 會是零紅，而訊息會安靜地丟掉對上游維護者的判準。

⚠️ 照 C94 §六 的規矩先驗工具：這張表有非零列，而且第一次跑 N2 就**assert 失敗**
（TS 原始碼裡的反引號是跳脫的，`\`release/v1\`` 不等於 `` `release/v1` ``）——
那個 assert 正是 C94 加的，它當場擋下一個會變成假零的變異。

#### 六、這一則沒有做的

⚠️ **射程還是只有 `tools/` 與 `platform/`**（`GOVERNED` 沒動），開在 [#99](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/99)。
這一則是 `#99` 的前置：`#99` 一旦把射程擴到根層，fork 團隊加一份 `MY-NOTES.md`
就會撞到同一段訊息，而它現在講得通了。

⚠️ 但**訊息裡「在那張表加一列」對根層項目仍然說不通** —— 叫一個 fork 團隊去
`SCOPE.md` 登記自己的 `MY-NOTES.md` 是荒謬的。那一段要在 `#99` 落地時再寫一次，
而**這一則買到的是「兩種讀者」這個結構，不是那句話的最終措辭**。

#### 七、動到的

| 檔案                                    |                                                      |
| --------------------------------------- | ---------------------------------------------------- |
| `tools/scope-check/src/check.ts`        | 兩條訊息分讀者 ＋ `C72` 補限定 ＋ 檔頭記為什麼不偵測 |
| `SCOPE.md`                              | 開頭那句「不是這份」改寫                             |
| `HANDOFF.md`                            | 「開案子用不到」改寫                                 |
| `tools/scope-check/tests/scope.test.ts` | 新增三條（15 → **18**）                              |

---

### C96 — scope-check 的射程擴到根層（2026-08-22）

#### 一、量到的：`#94` 的那兩件，現在抓得到

[#99](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/99)。`GOVERNED` 原本只有 `tools`、`platform`，所以 `#94` 加一個新的頂層目錄
`docs/` 與一個根層檔 `CONTEXT.md`，全套閘門全綠 —— 而它的範疇論證引的正是
這條縫（經過見 C93）。

把 `#94` 的檔案疊回今天的樹上重跑：

```
✗ 範疇檢查未通過：2 項違規
    ✗ [樹上有、沒登記] `CONTEXT.md` 在版控裡，但〈根層 —— 准許存在的〉那張表沒有它
    ✗ [樹上有、沒登記] `docs/` 在版控裡，但〈根層 —— 准許存在的〉那張表沒有它
```

#### 二、射程怎麼取：同一條 `git ls-files`，兩種切法

`trackedRootEntries()` 是**新函式**，不是 `trackedDirectories()` 加參數。
上面那支把路徑切成 `segments[0]/segments[1]`；根層要的是「有斜線取第一段、
沒斜線整條就是一個檔」。硬塞成一個 `if`，那個分支會住在**最不該有分支的
地方** —— 決定「這道閘門看到什麼」的那一行。

⚠️ **事實來源沒有換。** 一樣是 `git ls-files`，一樣是 index 不是 HEAD、不是磁碟。
`tree.ts` 檔頭關於殘骸、staged、以及「找不到 git 就直接失敗」的論證原封不動。

⚠️ **目錄帶尾斜線，檔案不帶。** 少了它，一個叫 `docs` 的檔案跟一個叫 `docs`
的目錄在表上長得一模一樣，登記其中一個等於把另一個放行。
（兩者不能同時存在 —— 檔案系統就擋著，實測 `EISDIR`，所以測試驗的是**錯配**。）

#### 三、根層只有兩欄，刻意沒有受益者欄

替 `LICENSE`、`.gitignore`、`pnpm-lock.yaml` 寫「受益者是拉 v1 的團隊」是
**儀式不是判斷**。判準本身沒有變，仍在〈判準〉那一節。

⚠️ 所以紅燈訊息變成**三套**（C95 是兩套）。`LAYERS` 那張表把
「怎麼稱呼這張表／要填哪幾格／對 fork 的人怎麼說／對上游怎麼說」四件事
放在一起 —— 散裝的 `Record` 到第三層就開始漏。

#### 四、⚠️ 具名錨點擋住一個洞，自己開了另一個 —— 一起補掉

`#99` 定的是「`parse.ts` 加**具名特例**，不要一般化成『任何 `—— 准許存在的`
標題』」，理由是一般化會讓**新增一個章節變成一次無聲的治理範圍擴大**。

那個理由是對的。但具名之後**相反的洞就開了**：有人加一節
`## \`docs/\` —— 准許存在的`，它看起來在治理 `docs/`、底下列著一張表，
而 `GOVERNED` 沒有它 —— **完全惰性，而且是綠的**。

那正是 `tools/sast` 那個病的形狀（C72 §一）：一個假的東西待在最會被讀的
地方，全套閘門照樣全綠。所以補第四個方向：**每一節「准許存在的」都必須
對應到一個真的被檢查的層**，對不上就紅（「這一節沒有人在檢查」）。

⚠️ 這一條**不在 `#99` 的驗收清單裡**，是實作那個設計時才長出來的。
記在這裡，是因為「加了具名特例」本身讀起來很安全。

#### 五、〈這份文件不涵蓋什麼〉：「存在」與「內容」是兩件事

| 行                     | 之後                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/`／`features/`   | 底下的東西仍然不治理，但**那兩個目錄本身**登記在根層那一節                                                           |
| 「根層的設定檔與文件」 | 改成「根層項目的**內容**」，並標明 `v1.0.5` 到 C96 之間這裡是 `#94` 靠的那一行                                       |
| `.semgrep/`            | 表格與散文**兩邊都留** —— 表格是為了不紅，散文講的是「為什麼它在 v1 內卻不在那兩個目錄底下」，那個理由散文才說得清楚 |

⚠️ **`tools/` 與 `platform/` 自己也列在根層表上。** 它們是頂層目錄所以要登記；
底下有什麼由它們自己那兩張表管。**兩層各答各的問題**，這一句寫進文件了 ——
不寫的話下一個人會問「`apps/` 列在准許存在的表裡，是不是代表它底下也要登記」。

#### 六、綠燈訊息也算數

`cli.ts` 原本用 `GOVERNED.map((p) => \`${p}/\`)` 湊層名 —— 加了根層之後會印出
「根層/」，而那不是一個路徑。另一句「⚠️ 只管上面那幾層。apps/ 與 features/ …
SCOPE.md 自己說了不管」也變假了：那兩個目錄現在**登記著**，不管的是內容。

兩句都改掉。⚠️ 這道閘門剛因為兩句「說得比做得多」的話付過兩次代價（C94、C95）——
**綠燈訊息不是裝飾，它一樣是宣稱。**

#### 七、變異

| 改法                           | 紅幾條 | 性質   |
| ------------------------------ | ------ | ------ |
| P1 `GOVERNED` 拿掉根層         | 18     | 結構性 |
| P2 目錄不帶尾斜線              | 16     | 結構性 |
| P3 根層只收目錄、跳過檔案      | **4**  | 精準   |
| P4 錨點一般化                  | 19     | 結構性 |
| P5 拿掉「這一節沒有人在檢查」  | **1**  | 精準   |
| P6 根層沿用 `tools` 的兩段訊息 | **1**  | 精準   |

⚠️ **紅得寬不等於守得好。** P1／P2／P4 之所以掃掉大半套，是因為造假器
`scopeDoc()` 現在每一份文件都帶根層那一節，所以任何動到根層處理的改動都會
波及全部 —— 那證明那條路徑**吃重**，證明不了**哪一條斷言在守哪一件事**。
真正回答後者的是 P3、P5、P6。

⚠️ P1 有一個順帶的好性質：`GOVERNED` 拿掉一層、而那一節還留在文件上時，
第四個方向（§四）當場就紅。**「悄悄不再檢查某一層」也是一種病**，而它現在有藥。

照 C94 §六 的規矩：這張表有非零列，工具驗過。

#### 八、⚠️ 抓不到什麼

**名字層級的檢查對「既有檔案長出新內容」是瞎的。** `#94` 做了三件事，
這道閘門抓得到 `docs/` 與 `CONTEXT.md`，**抓不到 `AGENTS.md` 被修改**那一件
（C93 撤回的六個檔裡，那是唯一的 `MODIFIED`）。

寫死這一句，是因為一道看起來比實際嚴密的閘門會讓人不再去看 ——
C77／C81 各付過一次代價。

#### 九、動到的

| 檔案                                    |                                                               |
| --------------------------------------- | ------------------------------------------------------------- |
| `tools/scope-check/src/tree.ts`         | `trackedRootEntries()`                                        |
| `tools/scope-check/src/parse.ts`        | `ROOT` ＋ `needle()` 具名特例 ＋ `declaredSections()`         |
| `tools/scope-check/src/check.ts`        | `GOVERNED` 三層、`LAYERS` 三套訊息、第四個方向、`LAYER_LABEL` |
| `tools/scope-check/src/cli.ts`          | 綠燈訊息兩句改寫                                              |
| `SCOPE.md`                              | 新增〈根層 —— 准許存在的〉25 列 ＋ 改寫不涵蓋清單三項 ＋ 開頭 |
| `tools/scope-check/tests/scope.test.ts` | 造假器改造三節 ＋ 新增八條（18 → **26**）                     |

---

### C97 — doc-facts 的紅燈把 fork 團隊指向一個靜默解除武裝的閘門（2026-08-22）

#### 一、`#95` 第 1 項的第二格。前提是：這道閘門的紅燈本來就會被採用團隊讀到

它接在 `scripts.gate` ＝ `vpr ready` 上，而那是 `HANDOFF` 叫**拉 v1 去做案子的
團隊**第一個跑的東西。演練量到的觸發點（直接餵 `checkFacts()`，沒有碰真的樹）：

| 採用團隊做的事           | 紅幾條                                                |
| ------------------------ | ----------------------------------------------------- |
| 加第一片切片             | **2** mismatch（workspace 套件數、CODEOWNERS 條目數） |
| README 換成自己產品的    | **7** never-cited                                     |
| README ＋ HANDOFF 都換掉 | **10**（登記中的樣式全滅）                            |

第一列是**採用指南教的第一件事**。

⚠️ **跟 `scope-check`（C95）不是同一種嚴重程度。** 那道閘門要求一句 fork 團隊
依定義寫不出來的話、再送去一個不是他們的分支 —— **動作本身做不到**。
這道閘門叫他們改的是**他們自己樹上的檔案**，動作一直是做得到的。
（這一格在 `#95` 原文裡被歸成同一類，那是**高估**；再判的經過貼在 `#95`。）

#### 二、⭐ 缺的那一支通到一個洞 —— 實測

`never-cited` 的訊息問「句子被改寫了，還是那段被刪了？」，**卻只給了前者的做法**。
而後者對 fork 團隊才是常態。補上後者要說的話是「移除那個樣式」，於是我去量了
那條路的盡頭 —— 把 `workspace-packages` 的 `citations` 改成 `[]`：

```
閘門 exit=0、全綠（「8 個事實、9 個引用樣式」）        測試 29 passed
```

**一個登記在 `FACTS` 裡、看起來被守著、實際上一個字都沒守的事實，全綠。**
唯一的痕跡是樣式計數少一，而沒有人有那個基準。那正是 README 曾經列著從來
不存在的 `tools/sast/` 的形狀（C72 §一）。

⚠️ **①不補②就是把人推下去。** 所以兩條一起補 —— 形狀同 C96 §四
（具名錨點擋住一個洞、自己開了另一個，一起補掉）。

補法：零樣式的事實會紅（`kind: "unguarded"`）。**不再守一件事是可以的**，
但要移除整個 `Fact` —— 那在 diff 裡看得見，`citations: []` 看不見。

#### 三、⭐ 這條規則第一次跑就在這棵樹上抓到一個

`action-refs` 的 `citations` **只有一行註解、沒有 regex**，而那行註解寫著
「這一句…所以**只有它**被登記」—— **註解描述了一段不存在的程式碼**。
這個事實**一路空到 `v1.2.0`**，全套閘門全綠。

⚠️ **更正（見 §三之三）：原文這裡寫的是「從登記進來那天起就沒守過任何東西」，
那是假的。** 它不是生來就空的。

順帶查出它的註解三處都爛了：那句話**已經搬到 `README.md:282`**（不在 HANDOFF），
數字是 **8 處引用／6 個 action**（不是 17／8）。
**一個不守任何東西的事實，連它自己的註解爛掉都沒有東西會說。**

樣式補成 `/個 action（(\d+) 處引用）/` —— 錨在 `個 action（` 上而不是裸的
`（(\d+) 處引用）`，後者會咬到任何一句括號裡寫「N 處引用」的話。
這一句同時被 `distinct-actions` 咬著（那邊取 6、這邊取 8），
**兩個事實共用一句話是刻意的：句子被改寫時兩條一起紅。**

⚠️ 順帶暴露：測試裡那條「不得守過去式的兩句」**一直在真空通過** ——
`for (const citation of fact.citations)` 對空陣列是恆真。

#### 三之二、⚠️ 我為了修那段爛註解而寫的新註解，自己也引了一句不存在的話

同一個區塊，同一個病，**第三次**。新註解舉的例子是「摘要表那句加了刪除線的
『全用可移動的標籤』」—— 實測 grep（`17 處`／`修好之前`／`可移動的標籤`）
在 README 與 HANDOFF **零命中**。那條真空通過的測試也一樣：它的說明寫著
「同一個數字（17）在第 23 項出現三次」，而 17 現在出現**零**次。

我只更正了那段註解**過期的位置與數字**，沒有去驗它**舉的例子**還在不在。

⚠️ **為什麼三條之下那條沒有這樣漂**，差別只有一句：

```ts
expect(decisions, "DECISIONS.md 不再有歷史數字 —— 這條測試失去意義").toContain("467 個套件");
```

**一條夾具存在性斷言。** 引了外部文字的測試沒有它，就會安靜地變成在描述
一份不存在的文件。這一條補不回那種斷言（句子真的不在了），改成**明說用的是
形狀不是引文** —— 規則留著，例子不再假裝存在。

#### 三之三、⚠️ 更正：那個洞是一個**合法動作**開的，不是生來就空

寫 §三 的時候我沒有查它的歷史，就寫下「從登記進來那天起就沒守過任何東西」。
去查了（`git log -- tools/doc-facts/src/facts.ts`，逐個 commit 數那個區塊裡的
regex）：

| commit                                        | 樣式數  |
| --------------------------------------------- | ------- |
| `9a29924` 守備範圍 6 → 13 個事實              | **1**   |
| `1d1d08b` 無障礙靜態閘門                      | **1**   |
| **`49b36da` `release(v1.0.0)`：縮到五條承諾** | **0** ← |
| `1c8f048` … `1312b04`（四則）                 | 0       |
| `646cbd5` 本則                                | 1       |

`49b36da` 的 diff 是這樣的：

```diff
     citations: [
       // HANDOFF 第 23 節：「8 個 action（17 處引用）全部改成 commit SHA」——
       // 這一句講的是**現況**，所以只有它被登記。
-      /（(\d+) 處引用）/,
     ],
```

**樣式刪掉、註解留著** —— 因為它守的那句話在 v1.0.0 的縮減裡被裁掉了。
那是**對的做法做了一半**：該移除的移除了，而該一起移除的 `Fact` 留下來了。

⚠️ **這正是這條新規則叫人做的那個動作。** §二 的訊息說「那段被刪了 →
移除這個樣式」，而移除最後一個樣式就會開出這個洞。`49b36da` 因此不是一個
假想的失敗模式，是**它已經發生過一次的證據** —— 而且發生在最有理由發生的
時刻（一次範疇縮減），然後安靜地跨過八個發出去的版本。

⚠️ 這一則的教訓與 §三之二 是同一個：**我更正了一段爛註解的位置與數字，
又寫了一句沒有查過的來歷。** 一則在講「宣稱要能被驗證」的決策，
三個段落裡有兩處自己沒驗。這一條記進 `tripwire-must-hang-on-its-target`。

#### 四、訊息：哪一句該改、哪一句刻意不改

| 句子                            | 處置       | 為什麼                                                                                                       |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 「**這個 repo** 在…一再栽跟頭」 | 改一個詞   | 在 fork 的樹上那四個字指的是**他們的** repo，而栽跟頭的不是他們。改「這個腳手架」，兩棵樹上都真              |
| 「拿去跟**採購與資安**講的話」  | **刻意留** | 對一個企業採用團隊只會**更真**。C95 修的是**做不到的動作**，不是動機說明；刪掉它只會讓訊息對兩種讀者都更模糊 |
| 尾巴                            | 加一段     | 講「與上游分歧是預期的」—— 那是 `#95` 真正指認出來的代價                                                     |

⚠️ 中間那一列是**我差點犯的錯**：本來要把它當成「上游味道」一起刪掉。
已釘成一條斷言。

⚠️ 跟 C95 一樣**不去偵測「這棵樹是不是上游」** —— 那是 `#91` 在問的，
答案還沒有，而猜錯的偵測會給出看起來很確定的錯訊息。

#### 五、⚠️ 那段訊息原本沒有任何斷言在守

它是 `cli.ts` 的 `main()` 裡一段行內字串，而該檔結尾是 `process.exit(main())`
—— import 它會跑掉整個 CLI，所以測試只能 `spawnSync`；而**這段話只在失敗時印**，
這棵樹又是綠的。抽成 `facts.ts` 的 `REMEDIATION` 常數才掛得上絆線。
**住在那裡不是為了整齊，是為了讓斷言吃的資料從被守的東西取。**

#### 六、為什麼結構層那一條測試不是執行期檢查的重複

`checkFacts` 在 `documents.length === 0` 時**提早回傳** —— 一棵文件讀不到的樹上，
零樣式的事實**走不到**那個檢查。測試那條無條件成立。
N2 的四條紅同時打到兩層，就是這件事的實證。

#### 七、變異

| 改法                             | 紅幾條 | 咬到什麼                                   |
| -------------------------------- | ------ | ------------------------------------------ |
| N1 拿掉零樣式檢查                | 2      | 零樣式 → 紅、訊息要說得出「移除整個 Fact」 |
| N2 `action-refs` 樣式清空        | **4**  | 結構層 1 ＋ **閘門真的紅**（CLI 端對端 3） |
| N3 拿掉「那段被刪了」那一支      | 1      | 訊息要兩支都講                             |
| N4 拿掉 `REMEDIATION` 的 fork 段 | 2      | 「對 fork 說話」、「講分歧」               |
| N5 刪掉「採購與資安」            | 1      | 那句刻意留著的                             |
| N6 改回「這個 repo」             | 1      | 指示代名詞不得指向作者的樹                 |

⚠️ 照 C94 §六 先驗工具：**第一輪 N2／N3／N4 三條的 `assert` 就當場失敗**
（shell→python 的巢狀引號吃掉跳脫），改寫成獨立檔案才套用得上。
沒有那個 assert，這三列會是三個假的零。

#### 八、這一則刻意沒有做的

- **讓 fork 團隊登記他們自己的事實。** 那是缺功能，不是壞掉的補救路徑；
  `FACTS` 是一個陣列，要加就加。**不在 `#95` 第 1 項的射程內。**
- **解掉與上游的永久分歧。** 沒有機制解得掉（他們的樹上那些數字就是不一樣）。
  訊息說出「這是預期的」，就是 `#95` 實際指認出來的東西的全部。
- **`deriveTruth()` 的孤兒鍵不守。** 移除整個 `Fact` 會在那張手寫的 map 上留一個
  沒人用的鍵。⚠️ **不對稱**：反方向（加了 `Fact`、忘了加鍵）**已經是紅的**
  （`expected === undefined` → `never-cited`）。孤兒方向的後果是死碼，不是假綠。

#### 九、動到的檔案

| 檔案                                  |                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `tools/doc-facts/src/facts.ts`        | `unguarded` 檢查、`never-cited` 訊息兩支、`REMEDIATION`、`action-refs` 補樣式 |
| `tools/doc-facts/src/cli.ts`          | 尾巴改成 `import` 常數                                                        |
| `tools/doc-facts/tests/facts.test.ts` | 新增八條（29 → **37**）                                                       |

---

### C98 — api-surface 的事實來源是磁碟，而那條補救路徑的盡頭沒有出口（2026-08-22）

#### 一、`#95` 第 1 項的第三格，而它的病**不是**那張票寫的那一種

票上寫的是「兩支都寫進腳手架自己的 `tools/`」。那已經在 `#95` 上更正過：
`isRegistered()` 比對 `<module>#<export>`、**沒有版本鍵**，四步（建 codemod →
登記 → `run.ts` → `--update`）全在 fork 自己的樹上 —— **動作做得到，是軟的**。

這一格照 C97 定下的順序做：**先撞，再量它叫人走的那條路通到哪。**
撞出來的東西跟票上寫的不是同一件事。

#### 二、⭐ 量到的：跟著它的指示走，會走進一個沒有合法出口的紅燈

`listEntryPoints()` 用 `readdirSync(PLATFORM)` 讀磁碟。實測（`--platform` ＋
`--baseline` 指到隔離的假樹，沒有碰真的 `platform/`）：

| 步驟                                      | 結果                                            |
| ----------------------------------------- | ----------------------------------------------- |
| 磁碟上有一個沒進版控的 `platform/client/` | ✗ 紅：「1 項相容變更未登記」，叫你跑 `--update` |
| **照它說的跑 `--update`**                 | **✓ 綠**                                        |
| commit `surface.json`，CI 拿到乾淨 clone  | ✗ **「破壞性變更，但沒有對應的 codemod」**      |

最後那一格要求為一個**從來不存在於版控的 API** 寫 codemod。
⚠️ 而 `cli.ts` 的檔頭**自己命名過這一類**：基準版號不合時「那種紅燈**沒有
合法出口**（沒有 codemod 可寫），所以升版號才是正解」。它認出了那個類別，
沒認出事實來源也會製造它。

⚠️ C73 對這件事早有明文裁決：事實來源要是 `git ls-files`，「不是 `ls-tree HEAD`，
**更不是 `readdirSync`**」，理由是「用磁碟當事實來源會**開發機紅、CI 綠**」。
這裡方向**相反而且更糟：開發機綠、CI 紅，而那個紅沒有出路**。
整支工具沒有任何一處寫過為什麼用磁碟（沒有 README，檔頭也沒提）。

#### 三、修法選的是「多問一句」，不是「換掉事實來源」

⚠️ **換成 `git ls-files` 探索會弄壞 `--platform`，而那是這支工具自己的測試
逃生口** —— `tests/negative.test.ts` 把 fixture 複製到 `mkdtempSync(tmpdir())`
再指過去，而 tmpdir 不在任何 index 裡。那批負向測試會全滅。

所以：探索照舊讀磁碟，**加一道「進得了基準的東西必須在版控裡」的前置檢查**，
而紅燈給得出合法出路（`git add`，或把它移出 `platform/`）。
C73 的裁決仍然成立 —— 那次的工具**沒有注入旗標**。

⚠️ 檢查**只在 `PLATFORM === PLATFORM_DIR` 時開**：`--platform` 指到 repo 外面時，
「在不在這個 repo 的 index 裡」不是一個有意義的問題。**而那個略過必須是吵的** ——
綠燈會說「那道檢查沒有跑」。

⚠️ **刻意不 import `scope-check` 的 `tree.ts`。** 跨工具相依要過 `conformance`
的邊界規則，而 C5 的 `reason` 記著那套機制咬自己人的樣子。C96 §二 在更短的
距離上做過同一個判斷。

#### 四、⚠️ 我在修「說得比做得多」的 PR 裡，自己造了一個

第一版的綠燈寫著「每一個都驗過在版控裡」，而那句話與檢查之間**沒有任何東西
連著**。變異當場給了答案：**拿掉整段檢查 → 紅 0 條**，綠燈照樣那樣宣稱。

修法是讓訊息的數字**從檢查本身取**（`verifiedInIndex`）—— 檢查沒跑就是 `null`，
綠燈只印得出「那道檢查沒有跑」。這正是
`tripwire-must-hang-on-its-target` 那條規矩用在**訊息**上。

⚠️ 順帶：那兩個數字**單位不同**（10 個進入點 vs 9 個套件目錄，`slice-kit`
宣告兩個 subpath）。並排印會被讀成該相等，所以綠燈把理由寫進去。

#### 四之二、⭐ 只補一個方向不算補 —— C73 那張表就是這麼寫的

第一版只擋了 `disk − index`（幽靈）。**鏡像那一半是同一個病理**：
`rm -rf platform/pii`（或一次沒收乾淨的 stash／merge／`mv`）之後，
`readdirSync` 列不到它 → 沒有進入點 → 基準裡 `@org/pii` 的 export
全部變成「移除」→ **要求為一個仍然在版控裡的套件寫 codemod**。一樣沒有出口。

⚠️ **好好地移除不是這一種**：`git rm -r platform/pii` 之後兩邊一致，
那是一次**真的**破壞性變更，codemod 那條路正是為它準備的。
病的是**兩邊不一致**，不是移除本身 —— 訊息把這句話寫進去了。

⚠️ **反方向要拿磁碟的完整清單比，不是 `entryDirs`。** `platform/tsconfig`
在版控、在磁碟，而它沒有 `exports`，正當地零進入點 —— 拿它跟進入點清單比
會**每一次都誤報**（變異 M9 紅 16 條就是這個）。

實測（真樹上，`mv platform/pii` 後還原）：紅，訊息給得出兩條出路。
今天這棵樹兩個方向都是空的。

#### 四之三、⚠️ 「絆線掛在被守的東西上」這次是**接線**沒掛到

兩個方向各自接在 `cli.ts` 裡的時候，變異「把反方向那段刪掉」**紅零條**：
純函式的測試照樣全過（函式還在），而 CLI 那條路在測試環境裡**永遠不會觸發**
—— 這棵樹是乾淨的，而 `--platform` 刻意略過這道檢查。

改成 **`checkIndexAgreement()` 一支回傳一串問題**，`cli.ts` 那端是一個
**吞不掉任何方向的迴圈**。要少一個方向就得動那支函式，而它被直接測。
形狀同 `doc-facts` 的 `checkFacts()` 回傳一串 `FactProblem`。

⚠️ **具名缺口**：接線那個迴圈改成只印第一則（M11）**仍然紅零條**。
不補的理由是失敗方向：它是**吵的而且會自我修正**（看到一則、修掉、
下一次跑看到另一則），與這一則在補的「安靜然後致命」不是同一類。
要補得掛在真的 `platform/` 上同時造出兩種狀況，而被中斷時會留下殘骸
（其中一種是把 `platform/pii` 移走）—— 那個代價換這個收益不划算。

⚠️ 順帶查過 `--platform`：`parsePlatformDir` 回傳 `resolve(value)`，
所以 `--platform platform` 與尾隨斜線都會正規化成 `PLATFORM_DIR`，
不會意外落到「那道檢查沒有跑」那一支。

#### 五、⭐ 變異解析器又拿到一個假的零，形狀是新的

M2（`scopedToRepo` 永遠 true）第一次跑報**紅 0 條**。實際上是
`beforeAll` 崩掉 → 摘要行變成 `Tests 11 passed | 69 skipped` ——
**一個 `failed` 都沒有**，而解析器只找 `N failed`。

⚠️ C94 §六 的規矩要擴一格：**解析器要同時看 `skipped` 與 `Test Files ... failed`。**
「至少一列非零」那條規矩這次沒有救到我 —— 七條裡五條非零，看起來很健康。

| 改法                                   | 紅                | 咬到什麼                               |
| -------------------------------------- | ----------------- | -------------------------------------- |
| M1 拿掉整段幽靈檢查                    | 1                 | 綠燈退回「那道檢查沒有跑」             |
| M2 `scopedToRepo` 永遠 true            | setup 崩、69 skip | fixture 在 tmpdir，全部變幽靈          |
| M3 git 失敗回空集合而非丟例外          | 1                 | 「不是回報零個被追蹤」                 |
| M4 拿掉 breaking 的 fork 那一支        | 1                 | 「下游是誰」兩種讀者                   |
| M5 綠燈不講事實來源                    | 1                 | 同 M1 那條                             |
| M6 `--platform` 那支沉默略過           | 1                 | 「要講明那道檢查沒有跑」               |
| M7 只報第一個幽靈                      | 1                 | 「多個全部列出」                       |
| M8 反方向從 `checkIndexAgreement` 拿掉 | 2                 | 「消失方向會回報」、「兩個方向同時壞」 |
| M9 反方向拿 `entryDirs` 比             | **16**            | `tsconfig` 誤報 → 結構性全紅           |
| M10 拿掉「擋的不是移除」               | 1                 | 那句話                                 |
| **M11 接線只印第一則**                 | **0**             | ⚠️ 具名缺口，見 §四之三                |

⚠️ **M8 第一次跑是零**（兩個方向各自接線的那一版），M1 也是。
兩次都不是絆線沒用，是**絆線沒掛在接線上** —— 修法都是讓被守的東西
變成唯一能產出那個觀察值的來源。

#### 六、順帶：兩句對 fork 團隊是假的話

| 位置                                                                                             | 為什麼假                                                                               |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| breaking 訊息：「`platform/*` 會發成內部套件給各案升級，所以『下游』也包含不在這個 repo 裡的人」 | 一個 fork 了 v1 的團隊**就是「各案」**，不是發布方。而這句話正是這道閘門嚴厲程度的理由 |
| `surface.json` 的 `drop-a11y-config-for-v1`：「論證在 **main 的** DECISIONS.md C69」             | `main` 不是他們的分支                                                                  |

前者改成兩種讀者、**不去偵測你是哪一種**（同 C95／C97；`#91` 的答案還沒有）。
⚠️ 後者改得動，是因為查過 `--update` 寫的是 `codemods: baseline.codemods` ——
**逐字保留**，所以編輯不會被下一次更新沖掉。

#### 七、查過而**沒有**動的兩件（都是刻意的設計，不是洞）

| 探到的                                           | 為什麼不修                                                                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 空的 codemod 檔案（0 bytes）照樣赦免那筆 removal | `tools/codemods/README.md:27` 自己寫著：「這道閘門保證的是**被看見並經過 review**，不是 codemod 正確…用更多程式碼去驗證 codemod 的語意，是在自動化一件本來就該由人判斷的事」 |
| 空的 `reason` 通過                               | 落在同一句「**只**驗證登記 ＋ 檔案存在」的射程內                                                                                                                             |

⚠️ **這兩件我原本都準備當缺陷修掉，是讀了那份 README 才停手。**
第二件看起來特別像 C94 補掉的那個洞（「登記了、但那一格是空的」），
差別在於：`SCOPE.md` **宣稱**了一個保證，這裡**明說了它不保證**。

#### 八、這棵樹上還沒有幽靈 —— 查過

10 個基準進入點 ↔ 9 個有 `exports` 的版控套件（`slice-kit` 兩個 subpath、
`tsconfig` 沒有 `exports` 所以正確排除）。**這件事還沒有咬過人**，
記下來是因為它是上一則（C97 §三之三，那個空守衛跨了八個發出去的版本）的
誠實對照：同樣的類別，這次是在它發生之前補的。

#### 九、動到的檔案

| 檔案                                       |                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `tools/api-surface/src/tracked.ts`         | **新增** —— `trackedPackageDirs()`、兩個方向的純函式、`checkIndexAgreement()`、兩段紅燈訊息     |
| `tools/api-surface/src/cli.ts`             | `listEntryPoints()` 多回報 `dirs`、前置檢查、`verifiedInIndex`、綠燈兩種、breaking 訊息兩種讀者 |
| `tools/api-surface/surface.json`           | `drop-a11y-config-for-v1` 的 `reason`                                                           |
| `tools/api-surface/tests/tracked.test.ts`  | **新增** 22 條                                                                                  |
| `tools/codemods/README.md`                 | 那一列說「匯入每個 `platform/*` 套件」—— 現在會先擋                                             |
| `tools/api-surface/tests/negative.test.ts` | 新增 4 條（66 → **69**），全檔合計 **91**                                                       |

---

### C99 — 指向不存在／不是那個意思的東西（#95 非阻斷級三則，2026-08-22）

`#95` 非阻斷級六則裡性質相同的三則：**文件或訊息把人指向一個不存在、
或不是那個意思的東西。** 另外三則（元件零說明、prop 打錯不會紅、
`UiField` 包 `UiSelect` 的死 label）性質不同，分開處理。

#### 一、⭐ 兩處死鏈**從寫下的那一刻就是死的**，不是過期

| 位置            | 原文                                                  |
| --------------- | ----------------------------------------------------- |
| `README.md:95`  | 「內部 registry 環境下…（**見 HANDOFF 的 R3／R5**）」 |
| `CODEOWNERS:37` | 「或**參照 HANDOFF #25** 的三條出路」                 |

⚠️ 照 C97 §三之三 的教訓先查歷史：逐個掃 **50 個**動過 `HANDOFF.md` 的 commit，
`R3`／`R5`／`#25` **一次都沒有出現過**（`main` 那條線也沒有）。
所以它們**不是過期的引用，是指向一套這份文件從來沒有過的編號**。

處置：`README` 那處把「v1 這棵樹就只有這兩個環境變數」寫明；
`CODEOWNERS` 那處的三條出路本來就寫在同一句的括號裡，而拆目錄那條的陷阱
就在下面四行 —— 指路刪掉，指向真的存在的東西。

#### 二、⭐ 加了一道守，而它當場抓到第三處 —— 然後那一處推翻了它

`#95` 記著「沒有任何閘門在驗文件內部連結」。這一則補了一條
（`tools/doc-facts/tests/cross-references.test.ts`）。

第一版的規則是「`HANDOFF` 附近出現 `R<n>`／`#<n>` 就紅」。它抓到
`CODEOWNERS:64`：「✅ **HANDOFF #14 已於 2026-08-16 結案**（C62）」。
查歷史：**`#14` 真的存在過**（五個版本），後來被拿掉 ——
那句話陳述的是**一件過去發生的事**，不是叫人去讀哪一節。

⚠️ **這正是 `facts.ts` 整個設計的樞紐**（守現在式、刻意不守 `DECISIONS.md`
那種歷史）在交叉引用上的同一條線，而這一輪已經是第三次撞到它
（C40 那個 22、`action-refs` 的過去式句子、這一處）。

所以規則要求一個**指路動詞**（見／參照／詳見／參見）。
⚠️ **那是代理不是判斷語氣的機器** —— 有人寫「HANDOFF 的 R7 有詳細說明」就繞得過。
寫在檔頭，因為一條看起來嚴密、而縫沒說出口的規則，比一條寫明射程的更危險。

#### 三、⚠️ 那道守也咬掉了我自己的修法 —— 而那是對的

第一版的修法在兩份**交付文件**裡留了考古：「原本這裡寫著『見 HANDOFF 的
R3／R5』，而 HANDOFF 裡沒有…」。規則當場紅 —— 那段字自己就含有那個樣式。

**沒有加例外**（例外會被下一個人拿來繞），而是把考古從交付文件裡拿掉：
那本來就是這份 DECISIONS 的工作。**規則逼我把檔案寫乾淨。**

#### 四、產生器尾巴那行打架的「下一步」

`vp create slice` 印完我們的 `Be sure to:` 之後，鷹架會再印一行
`→ Next: cd features/<name> && vp run` —— 而這個 repo 的切片**不是獨立可跑的東西**
（照它做只會列出全 repo 的 task 清單）。

⚠️ **那行印在我們控制範圍外**：整個 repo grep 不到那個字串，而 `slice-gen`
**自己一行輸出都沒有**（沒有任何 `console.*`）—— 它是 `bingo` 樣板的一部分，
`suggestions` 是我們唯一講得到話的地方。加了最後一條 suggestion 點名那一行。

⚠️ **它不會緊鄰那一行。** 用 `README:127` 教的指令實測，中間隔著鷹架的十行
進度輸出。所以那段話**把那一行原樣寫出來** —— 靠位置是靠不住的。
（我第一版的註解寫的是「緊接在它前面」，那是**沒有量就寫下的因果**。）

#### 五、⚠️ 具名缺口：README 教採用者跑的那個指令，沒有任何測試在跑

`tests/e2e.test.ts` 跑的是 `tools/slice-gen/bin/index.ts`；
`README:127` 教的是 `vp create slice`。**兩條不同的入口，輸出也不同** ——
那行 `→ Next:` 只在後者出現。

這是「警告要排在 `→ Next:` 之前」那條斷言**當場紅掉**才發現的
（夾具存在性斷言，C97 §三之二 的教訓）。改成守它站得住的那一半：
**警告必須把那一行原樣寫出來。**

⚠️ **不補成 e2e 的理由**：手動實測那一次順帶改了 `pnpm-lock.yaml` 與
`tools/conformance/src/cli.ts` 的**檔案模式**（`vp install` 的副作用）。
一條會弄髒工作區的測試，代價大於它買到的東西。

#### 六、CODEOWNERS 檔頭那個 22 —— 第三個「已經寫明」的案例

演練記的是「CODEOWNERS 自己說 22 條，採用指南說 20 條，實際是 20 條」。
⚠️ **我原本要把 22 改成 20。那會毀掉一次歷史實測。**

`CODEOWNERS:10-16` 的完整上下文早就說了那個 22 是**另一種量**：
`gh api …/codeowners/errors` 量到的 Unknown owner 數，GitHub 的判定，
repo 裡推導不出來 —— 而 `facts.test.ts` 有一條斷言**專門釘住它不得被守**。

真正的缺陷只有一個：**兩者用同一個量詞「條」**，所以讀起來像互相矛盾。
處置是加一句話說明它是凍結量測、並寫明「不要更新成 20」與為什麼。

⚠️ 這是這一輪第三個「候選缺陷其實是寫明的設計決定」
（前兩個是 `tools/codemods/README.md:27` 的兩件，C98 §七）。
**動手之前先讀那個檔案自己怎麼說。**

#### 七、變異

| 改法                        | 紅  | 咬到什麼                    |
| --------------------------- | --- | --------------------------- |
| P1 拿掉那條 suggestion      | 2   | 順序、原樣寫出              |
| P2 把它移到第一條           | 1   | 「要在其他步驟之後」        |
| P3 警告不原樣寫那一行       | 1   | 「原樣寫出」                |
| P4 README 的死鏈加回去      | 1   | 交叉引用規則                |
| P5 CODEOWNERS 的死鏈加回去  | 1   | 同上                        |
| P6 樣式拿掉指路動詞         | 2   | 「歷史陳述不得被咬」＋ 誤報 |
| P7 樣式改成永不匹配         | 1   | 「規則真的咬得到那兩句」    |
| P8 HANDOFF 加一個編號式章節 | 1   | 夾具存在性斷言              |

#### 八、動到的檔案

| 檔案                                             |                                    |
| ------------------------------------------------ | ---------------------------------- |
| `README.md`                                      | `:95` 的死鏈                       |
| `CODEOWNERS`                                     | `:37` 的死鏈、`:15` 那個 22 的說明 |
| `tools/slice-gen/src/template.ts`                | 最後一條 suggestion                |
| `tools/slice-gen/tests/e2e.test.ts`              | 新增 2 條（71 → **73**）           |
| `tools/doc-facts/tests/cross-references.test.ts` | **新增** 7 條（37 → **44**）       |

---

### C100 — 27 個元件的使用說明，從基準產生而不是手寫（2026-08-22）

#### 一、`#95` 非阻斷級：**27 個元件，零份使用說明**

演練那個人要知道 `UiField` 收哪些 prop，唯一的路是打開 `.vue` 原始碼。
**那一步花掉的時間比前面所有步驟加起來還多。**

⚠️ **修法刻意不是手寫。** 手抄 27 個元件的 prop 名字，正是這個 repo
一再栽跟頭的那件事（`facts.ts` 檔頭列了六次）—— 而這一次連抄的必要都沒有：
`surface.json` 已經逐個 export 記著形狀（`tone?: "info" | "success" | "danger"`、
`[slot default]`、`[emit confirm]`），**而且由 `api-surface` 閘門守著**。

鏈條：`platform/` 原始碼 → `surface.json`（閘門守）→ 根層 `API.md`（同一道閘門守）。

⚠️ **沒有開第九支工具。** 資料是 `api-surface` 的、守它的閘門也是 ——
新開一支要加 workspace 成員、動 `doc-facts` 守著的套件數、再寫一列 `SCOPE.md`
的受益者。全部是為了一個 76 行的渲染器。

#### 二、⚠️ 這是形狀，不是用法 —— 而檔案第一段就這麼說

它回答「有哪些 export、prop 叫什麼、型別是什麼」。**不回答**「為什麼這樣設計、
怎麼接線」—— 那些寫在原始碼的檔頭註解裡，而且比它詳細得多
（演練的人自己說「原始碼的註解品質很高」）。

**宣稱得比做到的多，是這一輪反覆在修的病**，所以產出的第一段就寫明射程，
並指回 `HANDOFF.md`〈從這裡到第一個能操作的畫面〉。

#### 三、⭐ 標成 ```ts 是一個小謊，而 formatter 當場抓到

第一版把成員印在 ```ts 區塊裡。`vp check --fix` 立刻把它們當程式格式化
（`"/api"` → `"/api";`），於是每次格式化之後閘門就紅在「`API.md` 與基準對不上」。

⚠️ **那不是 formatter 壞掉，是標籤在說謊**：`[slot default]: (): VNode[]`
不是任何 TS 語句，這些是**形狀字串**不是程式。修法不是拿 `vp fmt` 收尾
（`--update` 對 `surface.json` 是那樣做的），而是**不要宣稱它是 TS**。

#### 四、⚠️ 為什麼不做成表格

要把 `tone?: "info"` 拆成「名字」「形狀」兩欄，就得找**第一個不在方括號裡的
冒號** —— 而成員裡真的有 `[emit update:open]: void`。
**一個為了排版而存在的解析器，是一個會安靜出錯的解析器。** 原樣印，錯不了。

#### 五、⭐ 我造了一個陷阱：跑一次測試就會換掉根層的 `API.md`

第一版的 `REFERENCE_PATH` **無條件**是 `ROOT/API.md`。而
`tests/negative.test.ts` 的 `beforeAll` 有一處 `--update` 是拿來 seed fixture 的
（`--platform <tmpdir>`）—— 於是**跑一次測試，repo 根層的參考就變成 fixture 的內容**。
（實測撞到：`API.md` 裡出現 `@fixture/sample`。）

修法**不是**叫測試補參數（那把陷阱留在原地等下一個人），而是
**預設路徑跟著 `--platform` 走**：不是真正的 `platform/` 又沒給 `--reference`，
就完全不碰那份參考 —— ⚠️ 而那個略過是**吵的**（綠燈會說「形狀參考那道檢查沒有跑」）。

⚠️ `--reference` 這個注入點本身也是必要的：沒有它，「漂移就紅」那道檢查
在測試環境永遠不會被觸發，唯一的驗法是去動真的 `API.md`（C98 §四之三 的同一課）。

#### 六、順帶撞到的兩個

- **TDZ**：`REFERENCE_PATH` 一開始放在 `PLATFORM` 宣告**之前**，
  `Cannot access 'PLATFORM' before initialization` —— 而症狀是
  `Tests 27 passed | 69 skipped`（C98 §五 記的那個「假零」形狀，這次一眼認得）。
- **`EntrySurface` 來自 `shape.ts` 不是 `compare.ts`** —— 測試全綠、`vp check` 才紅。
  ⚠️ vitest 不做型別檢查，**「測試綠」不等於「型別對」**。

#### 七、變異

| 改法                             | 紅     | 咬到什麼                                           |
| -------------------------------- | ------ | -------------------------------------------------- |
| Q1 拿掉漂移檢查整段              | 2      | 「手改參考 → 紅」「參考不見了」                    |
| Q2 `--update` 不寫參考           | 3      | 上面加「立刻再跑 → 綠」                            |
| Q3 區塊標回 ```ts                | **6**  | 「不得標成 ts」＋ 全套對照組（formatter 一改就漂） |
| Q4 不自己排序                    | 1      | 「排序是自己排的」                                 |
| Q5 沒有 members 時不印 `type`    | **6**  | 97／151 個 export 會消失                           |
| Q6 `REFERENCE_PATH` 無條件回根層 | **10** | 那個陷阱本身                                       |
| Q7 開頭拿掉「不是使用說明」      | 6      | 射程宣告                                           |

#### 八、動到的檔案

| 檔案                                       |                                                                |
| ------------------------------------------ | -------------------------------------------------------------- |
| `tools/api-surface/src/docs.ts`            | **新增** 渲染器                                                |
| `tools/api-surface/src/cli.ts`             | `--reference`、`--update` 一起寫、漂移檢查（放最後）、綠燈兩種 |
| `API.md`                                   | **新增**，1121 行，產生的                                      |
| `SCOPE.md`                                 | 根層那張表加一列                                               |
| `README.md`                                | 從 api-surface 那一段指過去                                    |
| `tools/api-surface/tests/docs.test.ts`     | **新增** 5 條                                                  |
| `tools/api-surface/tests/negative.test.ts` | 新增 4 條（91 → **100**）                                      |

---

### C101 — UiSelect 接不到 control，以及一個決定留著的缺口（2026-08-22）

`#95` 非阻斷級最後兩則。一則是真的程式缺陷，一則量完之後**決定留著**。

#### 一、⭐ `UiField` 包 `UiSelect` 會產生一個指向不存在元素的 `<label for>`

`UiField` 的 slot 交出 `control`（`id`／`aria-describedby`／`aria-invalid`），
使用端 `v-bind="control"` 到控制項上。`UiInput`／`UiTextarea` 是原生元素，
fallthrough 直接落到位；**`UiSelect` 接不到** —— 它的根是 `SelectRoot`，
一個提供 context 的無渲染元件，attrs 落在那裡等於掉進地上。

演練在瀏覽器裡量到：

```
labels:  {"label":"分級","for":"v-60"}
trigger: {"id":""}
document.getElementById('v-60')  →  null
```

畫面上看得到「分級」，而那個 `<label for>` **指向一個不存在的元素**，
那顆下拉沒有任何程式可讀的名稱。**滑鼠使用者完全看不出來**，
而 `vue-typecheck`／`component-contract`／`a11y` 三道全綠。

⚠️ **修法刻意不是「加一個選填 `id` prop」。** 那只接得到三格裡的一格，
而且會改動公開形狀（`api-surface` 判 `compatible` 但一樣 `exit(1)`，
連帶要重寫 `surface.json` 與剛加的 `API.md`）。
改成 `defineOptions({ inheritAttrs: false })` ＋ 把 `$attrs` 轉給 `SelectTrigger`
—— **三格一次接齊，`defineProps` 一個字都沒動**（實測 `surface.json` 與
`API.md` 零變更）。

⚠️ **本 package 第一個關掉 `inheritAttrs` 的元件**，而它有一個無聲的失敗模式：
**忘了 `v-bind="$attrs"` 就是全部 attrs 消失，而畫面完全正常。**
變異驗過（只拿掉 `v-bind`、保留 `inheritAttrs: false`）→ 紅 2 條。

⚠️ 測試走 SSR（`field-wiring.test.ts` 既有的機制），**零新增依賴** ——
`SelectTrigger` 不在 portal 裡，所以 SSR 渲染得到（`UiDialog` 那次不行，
理由見 C86）。

⚠️ 我自己寫的第二條斷言第一版是 `expect(trigger).toBeDefined()` —— **恆真**。
改成帶 `description` 與 `error` 進去，把另外兩格叫出來再驗
（`control` 沒有它們時那兩格是 `undefined`，於是「只接得到 id」的實作
也會通過一個只驗 id 的測試）。

#### 二、prop 名字打錯不會紅 —— 量完之後**決定留著**

`UiButton` 是 `variant`，`UiAlert`／`UiBadge` 是 `tone`。照前者的習慣寫
`<UiAlert variant="danger">` 全套閘門綠，而提示安靜地渲染成 info 色。

⚠️ **`vue-typecheck` 的檔頭早就寫著這個代價**（「不開 `strictTemplates` 的代價
是抓不到 prop 名字打錯」，C55／C41）。但它同一段也寫著
`@vue/language-core` 有**五個旋鈕**，而 C55 那 2 條誤報**全是 events** ——
所以「只開 `checkUnknownProps`」是一條沒被試過的路。量了：

| 開什麼                                  | 結果                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `strictTemplates`（C55）                | 2 條，都是 `<UiButton @click>`；修法會關掉 fallthrough，是真的迴歸 |
| **只開 `checkUnknownProps`**（本則）    | **28 條，全部是 `data-slot`**                                      |
| 上一列 ＋ 用型別擴充把 `data-slot` 正名 | 換成 `aria-invalid`／`aria-describedby` 那一批                     |

最後一列正是 §一 那個 `control` 物件靠 fallthrough 傳下去的東西。
⚠️ **這個元件庫的設計整體建立在 fallthrough attrs 上**，而這顆旋鈕與那個設計
衝突 —— 不是設定沒調對。結論與 C55 相同，只是量得更細。

處置照 `#95` 對非阻斷級的指示：**進〈已知的誠實缺口〉**，把兩次量測都寫進去
（「不要再量第三次」），並指出已經好一點的那一半 —— C100 產生的根層 `API.md`
現在列得出每個元件的 prop 名字。

#### 三、順帶：〈已知的誠實缺口〉那段重複兩次的文字

C88 就記過的既有缺陷（`HANDOFF.md` 兩段幾乎一樣的「要幾個才算夠」）。
移除較短的那一段，保留寫得完整的那一段。⚠️ 移除前確認過它不含
`doc-facts` 守著的任何數字，移除後閘門仍綠。

#### 四、動到的檔案

| 檔案                                      |                                               |
| ----------------------------------------- | --------------------------------------------- |
| `platform/ui/src/components/UiSelect.vue` | `inheritAttrs: false` ＋ `v-bind="$attrs"`    |
| `platform/ui/tests/field-wiring.test.ts`  | 新增 2 條（10 → **12**）                      |
| `HANDOFF.md`                              | 新增〈使用端把 prop 名字打錯…〉、移除重複段落 |
| `tools/vue-typecheck/src/cli.ts`          | 檔頭補上這次的量測                            |

---

### C102 — 「那道檢查在 `main`」是假的，而補上論證比補上那道檢查更要緊（2026-08-22）

被問「v1 定義的範圍都做完了嗎」，逐軸核的時候拿 `SCOPE.md` 的判準跑了一次
HANDOFF〈已知的誠實缺口〉第一條，結果它落在**「內」** —— 於是去查那道檢查
在 `main` 長什麼樣。**它不在那裡。**

### 一、被推翻的那半句

HANDOFF 寫著「那道檢查在 `main`，不在 v1」。實際上：

| 查什麼                                            | 結果                                                  |
| ------------------------------------------------- | ----------------------------------------------------- |
| `git ls-tree -r origin/main` 找 `pii`／`mask`     | 有 `tools/pii-check`，但它守的是 §11 II ⑥（測試資料） |
| `tools/pii-check/src/cli.ts` 檔頭                 | 「⚠️ 曾經還有一個 `--masking` 模式…**已移除**」       |
| `git grep personalData origin/main`（排除日誌）   | **零個程式碼命中** —— 全部是文件與註解裡的歷史敘述    |
| `tools/compliance` 的 `COMPLIANCE.md` 與 `map.ts` | §11 II ⑨「曾經有閘門，2026-08-16 移除（C52）」        |

也就是 **C52 拆掉的那一道**。`main` 自己三處紀錄講的都是同一件事，
抄錯的只有 v1 這一句。

⚠️ **上面那張表全部是文件與註解 —— 所以又去對了一次 git。** 一條論證主張
「位置會過期」，而它自己的日期抄自一份手維護的對照表，那就是同一個病：

```bash
git log -S 'personalData' --date=short origin/main -- platform/slice-kit tools/pii-check
```

| commit    | 日期       |                                       |
| --------- | ---------- | ------------------------------------- |
| `2721ba8` | 2026-08-16 | 建立 —— 「§11 II ⑥⑨ …欠的紅字 3 → 1」 |
| `68fce63` | 2026-08-16 | 移除 —— 「每次成本乘上觸發頻率太貴」  |

日期對得上，而且多查到一件事：**那道閘門的壽命是同一天。** 不是用了一陣子
才發現太貴，是**做出來當天就發現**。C52 §一那張成本表因此更硬 ——
它不是事後合理化。

⚠️ 這也解釋了為什麼 `main` 的 `HANDOFF:623` 寫「2026-08-16 **做** §11 II ⑨ 時
第一次撞到」、而 `COMPLIANCE.md:54` 同一天寫「**移除**」—— 兩句都對，
不是其中一句抄另一句改了動詞。**沒有對 git 的話，這裡會看起來像個矛盾。**

⚠️ **差別不是文字遊戲。**「在 `main`」對讀者的意思是**換一條分支就有** ——
那正是〈不涵蓋什麼〉整節的承諾。實際上沒有任何分支有它。一個因為法遵要求
而需要強制遮罩的案子，照這句話換去 `main`，會在那裡找不到東西。

### 二、真正的判準不是 `SCOPE.md` 那條，而缺的一直是這段

`SCOPE.md` 問「它紅了，是誰的問題被擋下來？」—— 答案是忘了替新個資欄位
遮罩的**那個團隊**，也就是拉 v1 的人。**照那條判準，它在「內」。**

擋下它的是 C52 §一的第二條判準：**每次成本 × 觸發頻率**。`pii-masking` 的
觸發時機是**每加一個切片**，而 C52 明說那是 D16 兩軸的**補充不是推翻** ——
一道兩軸都有分的閘門，仍然可能貴到不值得。

⚠️ **所以 `SCOPE.md` 的判準是必要條件，不是充分條件。** 那份文件現在寫的是
「寫不出來就不准進」—— 那句話**只擋得住寫不出來的**，讀起來卻像個充分測試。
這一格是反例：寫得出來、而且仍然不准進。

⚠️ 這一條與 C93 是同一個形狀的兩面：那次是「**沒有被治理**不等於**准許進入**」，
這次是「**通過判準**不等於**准許進入**」。判準給的是討論資格，不是門票。

### 三、對照第五條 —— 為什麼是第一條出事

同一節的第五條（閘門名冊手抄）**把判準跑完了**，白紙黑字寫著「漂移傷的是
維護者，不是拉 v1 去做案子的團隊 —— 而 v1 的範疇判準是『它守的東西給誰看』」。

第一條從來沒做過這道功課。它只陳述了一個**位置**（「在 `main`」），
而位置不是理由 —— 於是那句話同時是錯的、又沒有東西會發現它錯。

**通則：排除一件事的時候，寫下的必須是判準跑出來的結果，不是它現在放在哪。**
位置會過期（C52 就讓它過期了），判準不會。

### 四、順帶查到、但**這次不修**的一格

〈不涵蓋什麼〉的表頭寫著「下面每一項在 `main` 分支都有**完整實作**
（含閘門、反向測試與文件）」。那是**九列共用的一句斷言**，而 C52 一次拆了兩道：

| 表上那列           | `main` 的實況                                                           |
| ------------------ | ----------------------------------------------------------------------- |
| CSP 瀏覽器實測探針 | `tools/csp-verify` 的伺服器與 `--print-probe` **還在**（C52 §二 留的）  |
| 同上               | ⚠️ 但 `--record`／`--verify` 與那份指紋證據檔**已移除** —— 它不再是閘門 |

也就是說**列名是對的、表頭那句「含閘門」對這一列不成立**。
沒有一起改，是因為這次的授權範圍只有第一條；記在這裡是為了讓它下次找得到。

⚠️ **而剩下七列一個都沒有被驗過。** 「在 `main` 都有完整實作」這句話目前
**沒有任何機制在守** —— `doc-facts` 守的是數字，跨分支的存在性它看不到，
也不該看得到（那會讓 v1 的閘門相依於另一條分支的內容）。

### 五、改了什麼

| 檔案           |                                                            |
| -------------- | ---------------------------------------------------------- |
| `HANDOFF.md`   | 誠實缺口第一條：原句保留，加更正塊 ＋ 判準論證 ＋ 重建路徑 |
| `DECISIONS.md` | 本條                                                       |

⚠️ **原句沒有刪。** 照 C86／C97 §三之三 那條慣例：被推翻的話留在原地、
標明它假在哪 —— 讀者可能是循著舊版本來的，刪掉會讓他們以為自己記錯了。

---

### C103 — 拆掉一句跨分支的位置斷言，而不是逐列去審它（2026-08-22）

C102 §四 記著〈不涵蓋什麼〉的表頭有一句沒被驗過的斷言：「下面每一項在
`main` 分支都有**完整實作**（含閘門、反向測試與文件）」—— **九列共用一句**，
而 C52 一次就打破其中兩列。這一條處理它。

### 一、先查了，而查的結果讓「逐列審」變成錯的做法

原本的計畫是逐列對 `main` 驗一次，從第一列（無障礙）開始 ——
那是 HANDOFF 自己標著「政府採購案請特別注意」的一列，錯在那裡代價最大。

查了。**它是真的**：`platform/eslint-config` 有 a11y 設定、測試與
`a11y-violations.vue` fixture，`tools/compliance` 有 `ACCESSIBILITY.md`
與 `a11y.ts`／`a11y-render.ts`，而且那道 a11y eslint 在 `main` 的
`scripts.gate` 裡。**最貴的那一列站得住。**

⚠️ **而這正好說明逐列審解決不了問題。** 審完的當下就開始過期 ——
下一次 `main` 動的時候，一樣沒有任何東西會說話。逐列審只是把過期時間
往後推一次，**代價是再造九筆會過期的帳**。

### 二、真正的病：那是一句**位置**斷言

C102 §三 剛寫下的通則，套在這句話自己身上：

> 排除一件事的時候，寫下的必須是**判準跑出來的結果**，不是它**現在放在哪**。
> 位置會過期，判準不會。

「在 `main` 都有完整實作」宣稱的是**另一條分支的當下狀態**。v1 這邊沒有
任何機制看得到它 —— **而且不該有**：跨分支的存在性檢查會讓 v1 的閘門相依於
另一條分支的內容，那比一句過期的話更糟（`main` 現在還被 #86 凍著）。

### 三、改法是把兩件事拆開

| 原本混在同一句             | 拆開後                                                     |
| -------------------------- | ---------------------------------------------------------- |
| 「**刻意**不放進 v1.0.0」  | **決定** —— 不會過期，留著，而且是這一節唯一擔保的東西     |
| 「在 `main` 都有完整實作」 | **位置** —— 會過期，降級成「去 `main` 查它**現在**的樣子」 |

發作過的兩次寫在表頭（強制遮罩、CSP 探針），CSP 那一列本身也標了 ——
**列名是對的，破的是表頭那句「含閘門」。**

### 四、查到、而**刻意不寫進 HANDOFF** 的東西

九列都對 `main` 掃了一次。除了已知的兩項，還有一項形狀不同：

|                                       |                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/bff-check`                     | **沒有 `src/`** —— 只有 `contract.test.ts` 與 `negative.test.ts`。它是一組測試，不是一支 CLI 閘門，也不在 `main` 的 `scripts.gate` 裡 |
| `tools/ui-survey`、`tools/csp-verify` | 同樣不在 `scripts.gate`；`csp-verify` 連 workflow 都沒有（C52 §二 留的「零摩擦」）                                                    |

**這三筆沒有寫進 HANDOFF，是刻意的。** 寫進去就是把剛拆掉的東西再造一批 ——
九筆各自更精確、而且同樣會過期的位置斷言。它們記在這裡，因為
`DECISIONS.md` 是**有日期的日誌**，「2026-08-22 當時是這樣」陳述的是歷史，
不需要跟著 `main` 改（同 `doc-facts` 刻意不守這份檔的理由）。

⚠️ 也不去爭「一組會紅的測試算不算閘門」。那場架沒有結論，
而且**贏了也只是贏到一句一樣會過期的話**。

### 五、第一列的查證結果**有**寫進去，其餘八列沒有

不對稱是刻意的：第一列是唯一被標成「政府採購案請特別注意」的，
讀到那裡的人正要拿它做一個貴的決定。給他一個有日期的資料點、
外加一句「那是那一天的狀態」，比留白好。

其餘八列留白，理由同 §四。**這一格是判斷，不是規則** ——
下一個人可以反駁它。

### 六、⚠️ 同一個病在寫這一條的時候發作了第三次

初稿的發作實例表寫著〈誠實缺口〉第一條「在 `main`」**寫了整整半年**。
那個數字是**編的** —— C52 是 2026-08-16，今天是 2026-08-22。查了：

| commit    | 日期       |                                                        |
| --------- | ---------- | ------------------------------------------------------ |
| `68fce63` | 2026-08-16 | C52 移除 `pii-masking`                                 |
| `49b36da` | 2026-08-17 | **v1.0.0 發版**，那句「那道檢查在 `main`」寫進 HANDOFF |
| `7af5dfd` | 2026-08-22 | C102 撤掉它                                            |

**它不是逐漸過期的 —— 它出生就是假的。** 寫下那句話的時候，
那道閘門已經被移除**一天**了。存活 5 天，不是半年。

⚠️ **而 `49b36da` 這個號碼眼熟：C97 §三之三 查到的那個缺陷也在它身上**
（`action-refs` 的引用樣式被刪、註解留著）。v1.0.0 那次範圍縮減
**一次造成兩個同型缺陷**：把東西留在 `main` 的敘述寫了下去，
而東西的實際狀態沒有再查一次。

**這不是巧合，是那次操作的形狀。** 一次大規模「把 X 留在 `main`」的縮減，
會產生一批**當下就可能為假**的位置斷言 —— 而它們讀起來全都像事實陳述。
⚠️ 下一次做範圍縮減，這是第一件要查的事。

### 七、改了什麼

| 檔案           |                                                          |
| -------------- | -------------------------------------------------------- |
| `HANDOFF.md`   | 〈不涵蓋什麼〉表頭拆成兩段 ＋ 發作實例表 ＋ CSP 那列標記 |
| `DECISIONS.md` | 本條                                                     |

---

### C104 — palette 的第三類違規，判準是減出來的（#57，2026-08-23）

`tools/theme-verify/src/palette.ts` 原本擋兩類：Tailwind 內建色階、本 repo 的
色票層。第三類是**從 shadcn 抄元件時忘了翻譯的代幣** —— `--primary`／
`--muted-foreground` 這種，前兩類都抓不到它：它不是原始色，也不是色票層，
**它是一個「合法但不是我們的」名字**，而那一格顏色各案換不掉。

### 一、判準是**減出來的**，不是手抄的清單

不能寫成「shadcn 的詞彙全部擋掉」—— `accent` 兩邊剛好同名，而元件裡
`bg-accent` 用了十幾處。那樣寫會讓它們全紅，然後規則被關掉（C41 的形狀）。

**判準：shadcn 的詞彙 減去 `index.css` 的 `@theme` 裡真的宣告過的名字。**

減數由 `cli.ts` 讀 CSS 得到，不寫死在偵測器裡 —— 寫死的話，改一個代幣名就會
讓這道檢查靜靜地開始誤報或漏報，而 `--color-muted` → `--color-fg-muted`
那次改名**真的發生過**。好處是它是活的：加一個 `--color-input` 進 `@theme`
的那天，`border-input` 自動變合法，不必記得回來改這支檔案。

### 二、⚠️ 放置位置就是這一格的全部設計

`classify()` 原本的流程是「前綴檢查 → white/black → **數字後綴** → 查色階表」。
而第三類的兩種形狀都會被中間那一段丟掉：

| 寫法                     | 死在哪                                            |
| ------------------------ | ------------------------------------------------- |
| `bg-primary`             | `rest` 一個連字號都沒有 → `lastDash <= 0` 回 null |
| `bg-muted-foreground`    | 最後一段不是數字 → 回 null                        |
| 任意屬性語法切出的裸代幣 | 第一個連字號在 index 0 → `dash <= 0` 回 null      |

**放到數字後綴之後就是一道永遠跑不到的檢查** —— 綠燈，而且沒有人會發現。
這與 C97 把「零引用」檢查排在 `expected === undefined` 之前是同一件事，
所以理由寫進了程式碼註解，不只是「這次排對了」。

⚠️ 裸代幣那一格用**完整相等**而不是前綴比對：我們自己有
`--border-width-control`，shadcn 有 `--border`。前綴比對會把自己的形狀代幣
報成違規（變異 M7 實測會紅）。

### 三、⚠️ 這支檔案的檔頭警告過的坑，在擴充它的時候踩了第五次

`palette.ts` 的檔頭與 README 都寫著：**Tailwind 連註解一起掃**，所以說明
括號語法的句子「刻意只寫括號、不把變數名補進去」。

寫第二節那張表的註解時，我把那個語法寫完整了。`auditReferences` 當場紅：

```
✗ 引用了不存在的代幣
  base 建置：--primary 被 .bg-\(--primary\) 引用，但整份產物裡沒有任何地方宣告它
```

**警告的那句話讓它警告的事情發生了** —— 而且是在**擴充那道檢查本身**的改動裡。
測試裡的反例因此拆成字串拼接再組回去，並在旁邊寫明為什麼句子長得這麼彆扭。

### 四、兩份資料，失敗方向不同，所以守法不同

| 資料               | 漏／錯的後果                                  | 守法                            |
| ------------------ | --------------------------------------------- | ------------------------------- |
| `SHADCN_TOKENS`    | 漏一個 → **少擋一次**                         | 無 —— 同 `BUILTIN_RAMPS` 的理由 |
| `TRANSLATION` 目標 | 寫錯 → **把人送去一個不存在的代幣**（錯方向） | 斷言每個目標都在 `@theme` 裡    |

⚠️ **這個不對稱是這一條最容易被抄漏的地方。** 兩份都是手抄的上游知識，
看起來該用同一種待遇；但一個的失敗是漏接，另一個的失敗是**指路指到空氣**。
`--color-muted` → `--color-fg-muted` 那次改名證明後者的風險是真的。
形狀同 C97 §三之二（引用外部文字的測試要斷言那段文字還在）。

### 四之二、⚠️ 送審才抓到：訊息裡還有第二處引用，而它沒有絆線

無對應那一支訊息寫著「`secondary` 在這裡是一組 class（見 `UiButton` 的
`VARIANTS`）」。我驗過 `VARIANTS` 存在（`UiButton.vue:92`）——
**但沒驗 `secondary` 是它的一個鍵**，而 PR 說明寫的是「那個東西真的在」，
比實際驗過的強。

上一節才剛替 `TRANSLATION` 的目標掛上絆線，理由正是「引用外部東西的句子
要斷言那個東西還在」。**同一份改動裡的第二處引用漏掉了那個待遇。**

補了兩條斷言：`secondary:` 真的在那張表裡，而且它的值真的是**多個 class**
（訊息說的就是這件事，值變成單一代幣的話那句話就錯了）。

⚠️ **這一格的教訓不是「再多驗一次」，是「絆線要跟著引用走，不是跟著資料走」。**
§四 那張表分的是兩份**資料**的失敗方向；漏掉的這一處是散文裡的引用，
不在任何一份資料裡 —— 而它的失敗方向與翻譯目標**完全相同**。

### 四之三、裸名帶在 violation 上，而不是訊息端再剖析一次

`cli.ts` 原本有一支 `upstreamName()`，從 `className` 再切一次
（去 variant 前綴、取第一個連字號之後、丟掉 `/opacity`）——
**那是 `classify()` 那段剖析的第二份手抄本**。

改成 `PaletteViolation` 帶一個 `upstream` 欄位（前兩類是 `null`）。
判定與訊息因此看到的一定是同一個名字。⚠️ 同一份改動裡的 §六 才剛因為
「兩份手抄本」把 slice-gen 接回來，而這裡自己造了一份。

### 五、變異：十條，零漏網 —— 而其中五條**閘門是綠的**

| 變異                        | 測試紅 | 閘門 |
| --------------------------- | ------ | ---- |
| M1 刪掉 utility 形式的判定  | 4      | 綠   |
| M2 移到數字後綴檢查之後     | 4      | 綠   |
| M3 刪掉裸代幣那一段         | 1      | 綠   |
| M4 拿掉減法                 | 2      | 紅   |
| M5 詞彙表比對永遠成立       | 4      | 紅   |
| M6 `@theme` 解析抓不到      | 4      | 紅   |
| M7 完整相等改成前綴比對     | 1      | 紅   |
| M8 cli 傳空集合給偵測器     | **0**  | 紅   |
| M9 翻譯目標指到不存在的代幣 | 2      | 綠   |
| M10 翻譯表清空              | 2      | 綠   |

⚠️ **五條的閘門是綠的，而那不是缺陷，是這道規則的性質**：樹上今天一個未翻譯
的代幣都沒有，所以規則壞掉不會讓真的樹變紅。**這一類規則的守衛只有測試** ——
與前兩類（元件裡真的有顏色可以改壞）不同。寫下來是因為下一個人看到
「M1 閘門綠」會以為絆線沒掛上。

⚠️ **M8 是接線那一格**（測試 0 紅、閘門紅）—— 形狀同 C98 §四之三。它紅是因為
`cli.ts` 對「減數是空集合」有一條顯式的 fail，訊息說明為什麼空集合比零違規更糟。

### 六、`tools/slice-gen` 有第二份手抄的 `@theme` 解析器

它的 `contract-alignment.test.ts` 用 `findPaletteUsage` 守產生器模板
（判定式刻意與閘門共用，理由寫在那條測試上）。而它**自己也有一份**讀
`index.css` 的解析器。

新簽名需要減數，所以順手把它接到 `declaredColorTokens` 上 —— 各持一份的話，
就是這個 repo 栽過很多次的「同一件事兩份手抄本」，**而那條測試存在的全部
理由正是不要各持一份**。

### 七、⚠️ issue 自己的兩處與事實不符

| #57 寫的                            | 實況                                                             |
| ----------------------------------- | ---------------------------------------------------------------- |
| 碰撞的例子是「`accent`、`surface`」 | **shadcn 沒有 `--surface`** —— 它從來不在違規集合裡，不需要排除  |
| 對照組是「現有三個元件全綠」        | 現在是 **27 個**，而且掃描是掃目錄的 —— `vpr ready` 綠就是對照組 |

第二點不必另外做事：檢查掃的是整個 `components/` 目錄，所以對照組是免費的。
⚠️ 第一點記下來是因為它示範了**驗收條件裡的例子也會過期** ——
`surface` 那個例子看起來很具體，而它從寫下的那天起就不成立。

### 八、⚠️ 量了三次才拿到對的數字，而錯的兩次都長得像「零命中」

第一次量「樹上有沒有未翻譯的代幣」得到零。第二次也是零。**兩次都是假的** ——
`Bash` 的工作目錄在呼叫之間會保持，而前面一個 `cd tools/theme-verify` 之後，
所有相對路徑的 `git grep` 都在那個子目錄裡跑。`-- platform/ui/src` 指向一個
不存在的路徑，回報的是**乾淨的零**，不是錯誤。

⚠️ 抓到它的是一個不相干的檢查：`bg-accent` 也回報零使用，而那明顯不可能
（它是 secondary 按鈕的底色）。**一個已知非零的對照組救了這次** ——
與變異測試那條「表裡至少要有一列非零」是同一條規矩，只是這次用在量測工具上。

回到根目錄重量：真的是零命中（`--border` 那 5 處是 `--border-width-control`
的前綴誤報 ＋ 一個 `dist/` 產物）。**所以這一類今天在樹上不存在，
這道規則是預防性的** —— 也解釋了第五節那五條綠燈。

### 九、改了什麼

| 檔案                                               |                                            |
| -------------------------------------------------- | ------------------------------------------ |
| `tools/theme-verify/src/palette.ts`                | 第三類的詞彙、翻譯表、減法、兩種形狀的判定 |
| `tools/theme-verify/src/cli.ts`                    | 讀 `@theme`、空集合直接紅、兩支訊息函式    |
| `tools/theme-verify/tests/palette.test.ts`         | 新增 11 條（10 → **21**，實跑量的）        |
| `tools/slice-gen/tests/contract-alignment.test.ts` | 接上同一支解析器                           |
| `tools/theme-verify/README.md`                     | 三類違規那一節、斷言表 9 → 12              |

---

### C105 — 「移除與 v1 無關的東西」量下去是零，真正在樹上的是**被拆掉的方向留下的殘跡**（2026-08-23）

**要求是「把 v1.5.0 裡與 v1 範疇無關的都移除，包括不是 bug、已經知道而且刻意
留著的東西」。**照字面去找，四個讀法有三個是死路，而第四個一開始不在清單上。

#### 一、前三個讀法各自死在什麼地方

| 讀法                       | 量到什麼                                                           | 結果                                           |
| -------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| 目錄層（不合 SCOPE.md 的） | `git ls-files` ＝ 8 支 `tools/` ＋ 10 個 `platform/`，**逐列相符** | **零** —— `scope-check` 就是守這個             |
| 套件層（`@org/pii` 之類）  | 移掉 `@org/pii` ＝ 7 個 export ＋ 1 個進入點消失                   | `api-surface` 紅 → **major**，與釘死的版號相衝 |
| 根層維護者面向的檔案       | 三個候選查完（見 §二）                                             | **三個都判在內**                               |

⚠️ **`ls tools/` 看到 18 個是切分支殘骸**，版控裡只有 8 個。這一則從頭到尾
用 `git ls-files`，理由與 C73 同一條。

#### 二、我在這一輪判錯三次，三次都是**先給建議再查引用**

| 判錯的                   | 我當時的理由                     | 查完之後                                                                                                                     |
| ------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`              | 「`vp` 產生的樣板，維護者面向」  | **C93 §二 白紙黑字**：「`AGENTS.md`／`CONTEXT.md` 對 fork 這份腳手架的團隊確實有用」；README 交付表把它列在「全體／AI 協作」 |
| `.git-blame-ignore-revs` | 「`git blame` 是維護動作」       | D13 寫的受益場景是**稽核與事故調查**，那是採用團隊的稽核；而且它**一個 commit 都還沒有** —— 是預先備妥的空殼                 |
| `DECISIONS.md`           | 「8947 行，自稱涵蓋範圍大於 v1」 | 拆掉它 = **782 處 C／D／R 引用**變成死連結，其中 **268 處在交付的程式碼自己裡**（`D8` 被引 54 次、`D15` 51 次）              |

**通則：一個建議在還沒查完引用關係之前，不是建議，是猜測。**
三次都是同一個順序錯誤 —— 我先把判準套在檔案的**描述**上，而不是套在
**誰在用它**上。

⚠️ **`DECISIONS.md` 那一項另有一個發現**：它不是一種東西，是三種。
`C` 號是有日期的修訂考古，`D` 號是產品架構決策，`R` 號是風險。交付的程式碼
引用的 268 處裡有 **130 處是 `D` 號**、22 處是 `R6` —— `platform/bff-contract`
整份契約就是 D8 的實作，註解一路指回去。**按「維護者面向」整份拆掉，
會把架構決策的定義一起拆走。**

#### 三、〈誠實缺口〉第五條的歸屬，我也判反了

我判它維護者面向，理由是內文寫「加一道閘門時四處要一起改」。
但 `SCOPE.md` 開頭第 9 行自己寫著：

> ⚠️ **但你在 `platform/` 或 `tools/` 底下加目錄的時候會被送到這裡**

**加閘門的人就包含拉 v1 的團隊。** 那個四份手抄的陷阱會絆到他們，所以那一條
留下來，只拆掉裡面那段講另一條分支的位置斷言。

⚠️ 這是 C102 §三那條通則的**第二次應用**，而方向相反：那一次是「排除一件事
要寫判準不要寫位置」，這一次是「**判定一件事的歸屬，要看誰會踩到它，
不是看它的敘述聽起來像對誰講的**」。

#### 四、真正在樹上的東西，分兩類，只有一類非刪不可

**甲-live —— 在設定或指示一個不存在的東西：**

| 位置                                   | 是什麼                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `CODEOWNERS` 5 條                      | owner 規則指向 `/tools/{bff-check,supply-chain,compliance,csp-verify,pii-check}/` —— **GitHub 真的會拿去指派審查者** |
| `renovate.json` 3 處                   | `needs-exit-drill` 標籤：Renovate 會真的貼上去，叫人跑一個這條線上沒有的演練                                         |
| `.gitignore` 1 行                      | 忽略一支不在的工具的產物                                                                                             |
| `platform/bff-contract/README.md` 2 行 | 給出 `vpr bff-check` 的**完整可複製指令**，貼上去是 command not found                                                |

**甲-stale —— 只是註解裡指名缺席的工具**，約 20 處。它們不做任何事。

⚠️ **兩者的差別是可驗證的：甲-live 拿掉之後有東西的行為會變（審查者指派、
PR 標籤、被忽略的檔案），甲-stale 拿掉之後只有讀者看到的字變。**
先前那份清單把兩者混在一起報，是把「壞掉的設定」與「過期的敘述」當成同一件事。

⚠️ **✅ 先報乾淨的那一半**：`package.json` 的七道閘門鏈與兩個 workflow 的活步驟
**零處指向缺席工具**。閘門本身沒有殘跡 —— 會壞的是它們周邊的設定。

#### 五、刻意**沒有**刪的，各自的理由

| 沒刪的                                            | 理由                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform/pii` 本體（7 個 export）                | ⚠️ **「v1 不做個資遮罩」是假的** —— `OrderList.vue` 第 109 行正在跑 `maskName()`。v1 做遮罩，沒有的是**強制你去用**的那道閘門                                |
| `tools/sast` 的引用（`scope-check`、workflow）    | `tools/sast` **從來沒存在過** —— 那是 README 列了一個不存在的目錄，是**這條線自己的缺陷**，也是那道閘門存在的理由；`check.ts:225` 更是閘門的**紅燈訊息本體** |
| `scope-check/tests`、`slice-kit/tests` 的死工具名 | 那是**反例測資**：`@org/ui-survey` 那一行證明的是「用 `startsWith` 做命名空間檢查會誤判」，換成假名字這條測試就變成看不出理由的儀式                          |
| `tools/codemods/drop-a11y-config-for-v1.ts`       | 在這個 repo 裡是 no-op，但它的檔頭寫明存在理由是**下游**：從 v0.x 升上來的案子，自己的 `eslint.config.js` 可能還引用著它                                     |
| `DECISIONS.md`                                    | §二                                                                                                                                                          |

#### 六、版號：判準跑出來是 patch，而要求釘的是 minor

要移的東西**沒有任何閘門讀**，一棵乾淨的樹升上來零紅燈。照 CHANGELOG 開頭
那條判準（**升上來會不會壞**，不是「改了什麼」）跑出來就是 **patch**。

⚠️ 這一則值得記，是因為它與 `v1.4.1` 是同一個形狀而更難看出來：
**這一版改了 21 個檔案、刪掉一整節缺口與一整節 README，數量上比很多 minor 版
都大** —— 而它仍然是 patch，因為判準問的不是那個。

#### 七、這一版改了什麼

| 檔案                                                 | 改什麼                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `CODEOWNERS`                                         | 5 條死路徑條目 ＋ 3 段對應註解（20 → **15** 條）                                                            |
| `HANDOFF.md`                                         | 缺口一與缺口六整節移除、缺口重新編號、〈不涵蓋〉的撤回考古與帶日期的跨分支查證段移除、`CODEOWNERS` 數字同步 |
| `README.md`                                          | 7 處 `main` 位置斷言、個資遮罩那一條、驗收器那一段                                                          |
| `SCOPE.md`                                           | 〈刻意在外的〉改寫成不指名缺席工具、`platform/pii` 那一格                                                   |
| `renovate.json`／`.gitignore`／`bff-contract/README` | 甲-live 其餘三項                                                                                            |
| 9 個 `src/`／`tests/` 檔案                           | 甲-stale 的註解                                                                                             |

⚠️ **`doc-facts` 的 `codeowners-entries` 與 `HANDOFF.md` 的引用處在同一個
commit 一起改** —— 分兩次就是一次紅燈。這道連動是先查出來的，不是撞到的。

---

### C106 — 「歸零」宣稱的是掃過的範圍，不是樹（2026-08-23）

`v1.5.1` 的 CHANGELOG 寫著「交付文件裡剩下的跨分支位置斷言：`HANDOFF.md`
18 → 0，`README.md` 7 → 0」。**那兩個數字都是真的，而那句話仍然誤導。**

全樹重掃，`` `main` `` 還有 **16 處**（`DECISIONS.md` 的 73 處是刻意不動的）——
散在 `tools/` 的 `src/` 與 `tests/` 裡。**我掃的是兩份交付文件，宣稱的卻是
「交付文件裡剩下的」** —— 而讀者會把它讀成「這件事處理完了」。

#### 一、四處是真殘跡，其餘十二處不是

| 位置                                                       | 處數 | 判定                                                                                                                                          |
| ---------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/codemods/drop-a11y-config-for-v1.ts`                | 2    | ⚠️ **真殘跡** —— 對**下游採用者**說「需要無障礙的案子要用 `main` 那條線」。這支 codemod 會跑在**別人的樹上**，那句話在那裡是純粹的位置斷言    |
| `tools/doc-facts/tests/{cross-references,facts}.test.ts`   | 2    | ⚠️ **真殘跡** —— 註解裡斷言「`main` 那條線也沒有」                                                                                            |
| `tools/scope-check/src/check.ts`                           | 6    | ❌ **閘門的紅燈訊息本體**：其中兩處正是在教採用團隊「『送 `main`』講的是這個 repo 的分支，跟你們無關」（C93／C96 的產出）。拿掉會把訊息弱回去 |
| `tools/scope-check/tests/scope.test.ts`                    | 3    | ❌ 在斷言上面那個訊息，跟著訊息走                                                                                                             |
| `tools/doc-facts/src/derive.ts`、`scope-check/src/tree.ts` | 2    | ❌ 描述**情境**（「一台從 `main` 切到 `release/v1` 的機器上」），不是位置斷言                                                                 |
| `SCOPE.md:36`                                              | 1    | ❌ 判準本身，文件開頭已聲明那一欄是給上游用的                                                                                                 |

#### 二、判別法：**這句話會不會出現在別人的樹上**

`check.ts` 的訊息與 `SCOPE.md` 的判準都提到 `main`，但它們**談論**那條分支
與**指路過去**是兩件事。真殘跡的共同形狀是：**它叫讀者去另一條分支拿東西，
而讀者手上沒有那條分支。**

⚠️ codemod 那兩處特別值得記：它是這次唯一**會被複製到別人樹上執行**的檔案，
所以位置斷言在那裡最貴 —— 而我在 C105 §五 判它「留」的時候，
只查了「它為什麼存在」，**沒有查它的檔頭寫了什麼**。同一個順序錯誤
（[[check-usage-before-recommending]]）的第四次。

#### 三、通則

> **報告一個數字歸零時，掃描的範圍必須與宣稱的範圍逐字相符。**
> 「`HANDOFF.md` 18 → 0」是可驗證的；「交付文件裡剩下的」是一個**沒有被
> 界定過的集合**，而我沒有掃完它。

⚠️ 這與 C102 §三 是同一族但不同條：那一條講**寫下的內容**（要寫判準不要寫
位置），這一條講**宣稱的範圍**（掃兩個檔案不能說成掃完一類東西）。

### C107 — 借外部座標排出測試層級，而**對應不上的那七支，對應不上的原因是同一個**（2026-08-23）

`tools/` 底下每一支閘門都是被一次具體事故逼出來的，論證各自寫在 C 編號裡。
那個長法讓每一道都有理由，卻讓整體**沒有形狀** —— 全綠時它說的是「沒有人破壞
既有結構」，不是「這東西做對了事」。這一則記的是借一組外部座標把既有機制排進去
的結果，以及據此下的刪除裁決。

新增 `TESTING.md`（正確性那條軸），`SCOPE.md` 登記一列。

#### 一、座標借的是層次，不是數值

來源是 Robert C. Martin 2026 年 6–7 月在 X 的公開討論串：五層流水線
（約束／單元／驗收／QA／週期性手動）加一個檢查測試本身的元層（突變測試）。

⚠️ **他在同一批討論裡撤回了對數值的背書**：那些門檻出自他自己幾十年的判斷力，
照抄數字是「下一個性質完全不同的賭注」；他並且公開懷疑全部疊上去會不會太重。
所以 `TESTING.md` **一個門檻值都不定** —— 借座標可以，借信心不行。

#### 二、兩個意外收穫

| 發現                   | 內容                                                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 依賴方向早就做完了     | 那組座標把「分層邊界」當成要新增的閘門；`tools/conformance` 不但有，而且更細（相對路徑逃逸、幽靈依賴都在管）                                                                                                                                                                           |
| 元層已經在跑，只是手工 | `.semgrep/rules.ts` 是故意寫壞的 fixture；`api-surface/tests/negative.test.ts` 自稱反向測試、用兩種破壞法斷言閘門會紅；`vue-typecheck/tests/negative.test.ts` 檔頭寫明「先讓 fixture 壞掉，再證明這支工具會說話」—— **刻意注入錯誤看閘門會不會紅，就是突變測試**。缺的是機械化與覆蓋面 |

第二項把 Stryker 從「必要」降級為「選配」：元層不是空的，是手工的。

#### 三、真正的缺口只有一個

**層 3 驗收規格，v1 完全沒有。** 它是五層裡唯一在回答「什麼叫做對」的一層。
最接近的既有物是契約測試，但那些斷言的是**機制有沒有生效**，不是**這門生意
認為什麼叫正確**，而且沒有一份是人打算逐字讀的。

⚠️ **這一層缺席，是「閘門全綠仍然不能讓人相信」的直接原因** —— 前兩層與元層
全部建立在「規格寫對了」的前提上，而樹上沒有一份寫下來的規格。

#### 四、七支對應不上，而原因**完全相同**

`api-surface`（跨版本相容）、`codemods`（遷移工具）、`theme-verify`（可替換性）、
`doc-facts`（文件斷言為真）、`scope-check`（範疇治理）、`slice-gen`（產生器與
檢查器讀同一份契約）、Tier 2 安全整條。

> 借來的座標在回答「怎麼在不讀 diff 的前提下相信程式碼是對的」。它不處理安全、
> 供應鏈、文件真實性、跨版本相容、可替換性 —— **拿它去判這些機制的生死，
> 等於拿尺去量溫度。**

而那五個維度全部是**「腳手架」這個身分特有的**：一般專案不需要證明自己的
README 沒說謊，也不需要證明下游換得掉配色；交付給多個項目組的腳手架需要。

#### 五、裁決：刪四留三

| 裁決     | 對象                                                    |
| -------- | ------------------------------------------------------- |
| **待刪** | `api-surface`、`codemods`、`slice-gen`、Tier 2 安全整條 |
| 留       | `theme-verify`、`doc-facts`、`scope-check`              |

⚠️ **這個裁決已在 C109 反轉，四項全部改判「留」。** 反轉的理由不是異議終於
被接受，是**判準換了**：從「對不對應五層」換成「它服務第一類還是第二類」。
本節保留原樣，因為當時的判斷過程比結論有用。

⚠️ **記下異議，因為它與裁決同時存在**：本則的分析主張七支的去留不該由一把
測試的尺來判，並且 `doc-facts` 與 `scope-check` 一旦刪除，**將失去發現自己
刪錯了的能力**。裁決保留了那兩支，異議的其餘部分未被採納 —— 寫在這裡是為了
讓 `v2.0.0` 之後回頭看的人知道當時兩種判斷都在檯面上。

#### 六、刪除的連帶清單（`v2.0.0` 執行，**這一版一支都沒刪**）

| 連帶                      | 內容                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 承諾的前提                | README 明寫「`platform/` 的 breaking change 必須附 codemod」是**五條承諾共同的前提**，由 `api-surface` 執行。兩支一起刪，那個前提沒有機制                                                                                  |
| `API.md`                  | 由 `api-surface` 產生、同一道閘門守著它與基準對得上。工具刪掉後它變成**無主的手抄本**                                                                                                                                      |
| 承諾五                    | Tier 2 是它的實現。依 Q18 的裁決，承諾要跟著修訂 —— 現成的措辭先例是 `platform/pii` 的「在 v1 是慣例，不是機制」                                                                                                           |
| C87 的排程相依            | `dependsOn` 讓開的正是 `slice-gen#test`。那支刪掉，相依要跟著拆                                                                                                                                                            |
| `SCOPE.md` 的 `tools/` 表 | 三列要移除，`scope-check` 會驗這件事一致                                                                                                                                                                                   |
| **`TESTING.md` 自己**     | ⚠️ 它的〈層 1〉表列著 `eslint.config.js`、〈元層〉引著 `api-surface` 的反向測試 —— 四支一刪，那兩處當場變假。而 `scope-check` 只守它的**存在**、`doc-facts` 不守它：**沒有任何機制會紅**。這一列漏掉就等於安排一次靜默腐爛 |

#### 七、⚠️ 一次更正，以及元層那一格的裁決

**更正：`eslint.config.js` 一度被誤列在〈層 1 約束〉。** 初稿把它排進層 1，
理由是它形式上也是「機械化擋、不靠人」，於是產生一個假衝突（同一個檔案在
兩張表上得到相反裁決）。查 `platform/eslint-config` 的檔頭才確定：它**只**管
oxlint 管不到的安全與邊界，刻意零重疊、刻意不 extend 任何 recommended preset。
**層 1 問的是「程式碼有沒有纏成一團」，安全規則不回答那個問題。**

⚠️ 這次誤列的成因值得記：判斷用的是**形式**（機械化、不靠人），而這組座標
切的是**它回答什麼問題**。形式相同、問題不同的東西，會被排進錯的層。
更正之後層 1 更空了 —— 只剩 `vp check`、`conformance`、`vue-typecheck`，
而複雜度那一格的缺席因此更清楚。

⚠️ Tier 2 刪除仍要動 `package.json` 的 `gate` 鏈與 `tier2-security.yml`
（兩者都指著 `eslint.config.js`），只是那是連帶清單的事，不是層級衝突。

**元層那一格：刪除會把它挖空，裁決是同時補上機械版。**
§二 把機械化突變測試從必要降為選配，靠的是「元層已經在跑，只是手工」。
支撐那句話的三處裡，**兩處在待刪清單上**（`.semgrep/` 屬 Tier 2、
`api-surface/tests/negative.test.ts` 隨整支工具走），刪完只剩
`vue-typecheck` 一處 —— **降級的條件在刪除的那一刻消失。**

⚠️ **所以「選配」是對現況說的，不是對 `v2.0.0` 之後說的。** 裁決：
`v2.0.0` 執行刪除的同時，機械化突變測試**升回必要**，與刪除同一個 PR。
理由是內在一致性 —— 刪這幾支的依據是「對應不上五層座標」，而突變測試
正是那組座標的元層本體。**用同一把尺刪掉手工版，就得補上機械版**，
否則等於拿五層當理由刪東西，卻不補五層要求的東西。

⚠️ **這讓可行性實測變成 `v2.0.0` 的阻斷項，不是選配的調查** —— 跑不起來的話，
刪除的前提就不成立，整個裁決要重議。**實測已經做完，結果見 C108：跑得起來，
而阻斷不是這裡原本預期的那個。**

⚠️ **本則初稿在這一格寫過一句假的話**：「module-alias 會破壞 Stryker 的
sandbox，而這條線有要在多處同步的 path alias」。那是照方法來源的警告寫的，
**沒有實測** —— 而這條線的 `tsconfig.json` 根本沒有 `paths`。更正見 C108 §一。

⚠️ 通則：**裁決是按「機制對不對應五層」逐支下的，而被刪的東西同時是
別的層的支撐點。** 逐支判斷看不見這種耦合，要整張表一起看才看得到。

#### 八、順序：先文件、後檢查

這一版只發文件（`TESTING.md` ＋ `SCOPE.md` 登記），刪除與層 3 各自獨立 PR。
沿用 `v1.0.4 → v1.0.5` 已驗證的順序 —— 反過來做，補設定的動機會變成
「讓閘門轉綠」而不是「把判準真的跑一遍」。

### C108 — Stryker 可行性實測：跑得起來，而**阻斷不是文件警告的那個**（2026-08-23）

C107 §七 把可行性列為 `v2.0.0` 的阻斷項。實測在 worktree 隔離下跑完
（`platform/slice-kit`，純 TS，四個 src 檔）。

#### 一、⚠️ 先更正 C107 §七 的一句假話

初稿寫「module-alias 會破壞 Stryker 的 sandbox，而這條線有要在多處同步的
path alias」。**兩個半句都不成立**：`tsconfig.json` 只有五個 compilerOptions，
**沒有 `paths`**；`vite.config.ts` 也沒有 alias；切片內部走相對路徑帶 `.ts`
副檔名（`moduleResolution: nodenext` ＋ `allowImportingTsExtensions`）。

⚠️ **那句話是照方法來源的警告抄的，沒有查樹。** 借來的座標會連同它的
**風險清單**一起借過來，而風險清單跟門檻值一樣是別人專案的產物 ——
[[check-usage-before-recommending]] 的同一個形狀：先查它在不在，再說它會不會壞。

#### 二、三個數字

| 量的東西     | 結果                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| 能不能跑起來 | **可以**，繞過兩個阻斷之後                                                               |
| 初始分數     | **58.66%**（covered 60.00%）：105 killed／70 survived／4 no-cov／**0 errors／0 timeout** |
| 全跑時間     | **6.0s**（三次量測 6.8／6.1／6.0 取最小值；179 個 mutant、concurrency 4）                |

分數三次完全一致（確定性）。分檔：`register.ts` 95.83%、`define-feature.ts`
53.16%、`contract.ts` 52.63%。

#### 三、兩個真阻斷，都有繞法

| 阻斷                                        | 症狀                                                                                                  | 繞法                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **TypeScript 7 的 API 不相容**              | `TypeError: ts.parseConfigFileTextToJson is not a function`，發生在 sandbox 的 `TSConfigPreprocessor` | `"tsconfigFile": "tsconfig.does-not-exist.json"` —— 前處理器整個跳過 |
| **`node-linker=isolated` ＋ `hoist=false`** | `Cannot find TestRunner plugin "vitest"`（根目錄裝的 runner 在 package 目錄看不見）                   | `plugins` 用絕對路徑指向 runner                                      |

⚠️ **第一個的根因值得記**：catalog 釘的是 `typescript: ^7.0.2`，而 TS 7 是原生
移植版 —— `parseConfigFileTextToJson`、`readConfigFile`、`parseJsonConfigFileContent`、
`createProgram` **全部 `undefined`**。任何依賴舊 compiler API 的工具在這條線上
都會這樣死，Stryker 只是第一個撞到的。

⚠️ **第二個不是 bug，是 D6 的設計在起作用**：`.npmrc` 刻意不 hoist、用 isolated
linker 保 SBOM 不失真。**「沒有 phantom dependency」的代價，就是外部工具要被
明確告知路徑。**

⚠️ **繞法一的沉默取捨**：跳過 `TSConfigPreprocessor` 等於 sandbox 內的 tsconfig
`extends` 路徑不會被改寫。對 vitest（不做型別檢查）無害，但這一格將來若要
mutate 需要型別資訊的東西，要重新評估。

#### 四、兩個對裁決有直接影響的發現

**其一 —— 方法來源的起手值會讓第一次跑就紅。** 那份整理建議 break 門檻 **60**，
實測 **58.66**。照抄 60，CI 第一天就紅，而紅的原因不是程式碼變差。
**這是「借層次不借數值」最乾淨的實例**，與 C107 §一 是同一條。

**其二 —— 存活的 mutant 裡有一個是真缺口**：

```
[Survived] ArrowFunction  platform/slice-kit/src/register.ts:51:25
-   names: features.map((f) => f.name),
+   names: features.map(() => undefined),
```

四個測試跑過這一行、全部通過 —— **覆蓋到了，但沒有任何一條斷言 `names` 的
內容**。手工反向測試守的是閘門自己，守不到產品碼裡這種空頭斷言。
⚠️ 這一條就是元層存在的理由的實物證據，而它是**這次實測順手掉出來的**，
不是設計出來的例子。

（另一個存活的 `if (import.meta.env.DEV) → if (true)` 是合理存活，
DEV 分支本來就測不到。）

#### 五、外推與結論

`platform/` 的純 TS src 共 20 個檔（`slice-kit` 佔 4，`.vue` 依 C107 的裁決
不 mutate）。密度相近的話，全 `platform` 約在**數十秒**量級 —— **放得進 PR CI，
不必降級成 nightly。**

> **結論：C107 §七 的阻斷項解除，`v2.0.0` 刪除裁決的前提成立。**

⚠️ 仍未驗的一項：C87 的 `dependsOn` 排程互斥在 sandbox 裡會不會被尊重。
這次的目標 `slice-kit` 不涉及 `conformance`／`slice-gen`，**所以這一格是繞過去
的，不是驗過的** —— 真正 mutate 到那兩支的範圍時要重驗。

#### 六、實測環境

worktree 隔離（`spike/stryker`）。⚠️ **worktree 給的是檔案系統隔離，不是 git
隔離** —— `.git` 是一個指回主 repo 的檔案，`git remote -v` 照樣是真的 origin。
對「裝套件不污染主樹」這個目的足夠，對「模擬外部團隊 clone」不足夠（見 #95）。

⚠️ 兩件順帶確認的好消息：`vp add` **自動把新套件寫成 `catalog:` 引用**
（D6 不需要手動遵守）；`@stryker-mutator/vitest-runner@10` 的 peer 是
`vitest >=2.0.0`，涵蓋被釘死的 4.1.10。

### C109 — 兩類測試：借來的座標整個只描述其中一類，而刪除裁決是用它量出來的（2026-08-23）

C107 借五層座標排出測試層級，並據此裁決刪四留三。這一則記的是一個**更好的
判準**取代它，以及那個取代帶來的裁決反轉。

#### 一、二分：框架測試 ／ 交付的測試設施

|              | **第一類 · 框架測試**                                                   | **第二類 · 交付的測試設施**                    |
| ------------ | ----------------------------------------------------------------------- | ---------------------------------------------- |
| 誰維護       | 腳手架團隊                                                              | 腳手架團隊建，**專案組使用**                   |
| 守什麼       | 腳手架自身沒有壞                                                        | 專案組交付的業務是對的                         |
| 對象         | `platform/*`、`tools/*` —— 每個案子都要重搭一次、所以被抽出來共用的東西 | `features/*`、`apps/*` —— 各案自己的業務       |
| 成功長什麼樣 | 升級平台不會打斷任何一個案子                                            | **專案成員只要補 TDD，就量得出業務功能完成率** |

⚠️ **第二類不是「腳手架的測試」，是「腳手架交付的測試能力」。** 這個分別是
整則的關鍵：第一類壞了痛的是維護者；**第二類缺了，一百個專案組各自用各自的
方式補，而「開箱即用」變成一句空話。**

#### 二、⚠️ 借來的座標整個只描述第一類

那組五層在回答的是「**一個團隊**怎麼在不讀 diff 的前提下相信**自己的**程式碼」。
它從頭到尾沒有處理「我做的東西要交給一百個團隊用」—— 不是因為那不重要，
是因為那不是它的題目。

**所以拿它去判第二類機制的生死，等於拿尺去量溫度。** C107 §四 已經寫出過
這句話，但當時歸因錯了：那一則說原因是「座標不處理安全／供應鏈／文件真實性／
跨版本相容／可替換性」——**那是症狀的列舉，不是病因。** 病因是它只描述第一類。

#### 三、裁決反轉：四項全部改判「留」

| 待刪的              | 用五層的尺                   | 用兩類的框架                                                                                                            |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `tools/slice-gen`   | 「一致性機制，不是測試層」   | **第二類的入口** —— 它產生的切片自帶 `tests/` 與一支測試，`files.ts` 註解寫著「沒有測試的切片＝沒有人能安全重構的切片」 |
| `tools/api-surface` | 「跨版本相容，五層沒這維度」 | **第二類** —— SCOPE.md 原話：「平台一改就打斷每一個切片，這道閘門是他們的保險」                                         |
| `tools/codemods`    | 「修復工具，不是閘門」       | **第二類** —— 升級平台時不必逐處手改                                                                                    |
| Tier 2 安全整條     | 「安全不在五層的題目裡」     | **第二類** —— 專案組寫業務時的前置過濾                                                                                  |

⚠️ **`slice-gen` 那一列最值得記。** 「專案成員只需要補 TDD」這句話，目前**唯一**
的實現就是它產生的那支測試骨架。用五層的尺，它是「一致性機制」所以出局；
用兩類的框架，刪掉它等於把第二類的入口拆了 —— **而第二類正是這整件事的目的。**

#### 四、⚠️ `v2.0.0` 取消

C107 §六 的連帶清單、§七 的元層裁決（刪除時把突變測試升回必要），前提都是
那四項要刪。**四項全留，`v2.0.0` 沒有內容了。**

⚠️ 但 C108 的實測結果**不作廢**：突變測試的可行性、兩個真阻斷與繞法、
`register.ts` 那個真缺口，那些是量出來的事實，與刪不刪無關。機械化突變測試
從「`v2.0.0` 的必要項」變回「第一類的選配缺口」，排在層 3 之後。

#### 五、完成率的量法：驗收規格的通過率

第二類要成立的那句話是「專案成員只需要補 TDD，就能測出**業務功能完成率**」。

**覆蓋率量的是「程式碼被跑過」，回答不了「功能做完了沒有」。** 能回答後者的是
層 3：專案組用自然語言寫下「這個功能叫做對是什麼樣子」，跑起來，綠幾條就是
完成幾條。

⚠️ **分工必須寫死，否則第二類會變成第一類的翻版**：

> **腳手架交付的是設施與範本**（runner、testing API、`.feature` 骨架、通過率
> 的計算方式）；**規格的內容由專案組自己寫** —— 只有他們知道自己的生意認為
> 什麼叫正確。

⚠️ 這也是「人與智能體協作」的落點：**規格是人寫給 agent 讀的需求，通過率是
agent 交回給人的進度。** 人審的是規格（什麼叫做對），不是 diff（它怎麼寫的）。

#### 六、層 3 第一批的順序改了

C107 §三 把層 3 的缺口指出來，而 v1.6.0 的初版計畫是「對腳手架自己的五條承諾
各寫一條規格」。用兩類重排之後那個順序是錯的：

|                              | 買到什麼                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| 對腳手架承諾寫規格（第一類） | **新的可讀層** —— 人讀規格不必讀閘門實作。⚠️ 但閘門本來就在驗那些承諾，**不是新的驗證能力** |
| 第二類的完成率設施           | **目前沒有任何東西在做的事**                                                                |

**所以第二類的設施排在前面。**

⚠️ 草擬第一批規格時另外發現：五條承諾裡只有兩條真正適合寫成層 3
（分工架構、換配色）；元件公開面那條是**設計師與前端共用詞彙的協定**，
它的「對」在人的溝通裡；資安前置過濾那條寫出來會變成「跑 SAST 並斷言命中」——
**那是閘門的反向測試，是元層不是層 3。**

#### 七、`AGENTS.md`：履行 C93 要求的那一句

C93 撤出 `#94` 的主論證不是「agent 行為設定一律不准」，而是**舉證責任沒履行**：

> 判定時必須寫得出「受益者是拉 v1 的團隊」那一句。寫不出來就不准進。
> —— `SCOPE.md`，C93 §二 引

⚠️ C93 §二 自己留了門：「那條路要贏一場可以打的架 —— `AGENTS.md`／`CONTEXT.md`
對 fork 這份腳手架的團隊確實有用。」它撤 `#94` 是因為那個 PR 寫的是另一句
（「沒有被治理所以不衝突」），而**沉默不是預設通過**。

**這一則履行那個舉證責任：**

> **受益者是拉 v1 的團隊。** 這一節寫的是**他們的 agent** 在**他們的 repo** 裡
> 要遵守的規則 —— 任務結束前必須讓閘門全綠，且**不得修改設定或門檻來達成**。
> 它紅了，擋下的是「專案組的 agent 把門檻改掉讓測試變綠」，而那件事發生在
> 他們的樹上、痛的是他們。

⚠️ **與 `#94` 的分別要講清楚，否則這則就是在替自己開後門**：`#94` 加的是
`docs/agents/issue-tracker.md`（**agent 該怎麼在這個 repo 開 issue** —— 維護者的
流程），還新增了一個從交付文件到不了的頂層目錄；這一節加的是**下發給採用團隊
的 agent 契約**，內容是「不准改門檻」，而門檻是交付物的一部分。
**分界仍然是 C93 §三 那一條：不是在哪個目錄，是內容在說什麼。**

### C110 — 完成率設施的最小實測：機制成立，而草稿的三個假設有兩個會讓它做不出來（2026-08-23）

C109 §五 把「業務功能完成率」定義成驗收規格的通過率，並指定 runner 用
`@amiceli/vitest-cucumber`（跑在既有 Vitest 裡，不養第二套）。這一則記的是
動 `slice-gen` 模板之前的最小實測 —— 模板是第二類的入口，改壞了每個新切片
都跟著壞。

worktree 隔離，`@amiceli/vitest-cucumber@7.0.0`（peer `vitest ^4.0.4`，
這條線釘死的 4.1.10 落在範圍內）。

#### 一、五件事全部驗過，含反向測試

| 要驗的                                             | 結果                                   |
| -------------------------------------------------- | -------------------------------------- |
| 中文關鍵字（功能／場景／場景大綱／假設／當／那麼） | ✅ **但 `# language:` 標頭本身不生效** |
| 中文步驟文字                                       | ✅                                     |
| 場景大綱 ＋ 例子表格參數                           | ✅ 展開成多個實例，各自重跑背景        |
| 背景 ＋ 資料表（Data Table）                       | ✅ 整張表餵進 step                     |
| `@待辦` 標籤過濾                                   | ✅ **但作法與草稿不同**                |

**反向測試**：把一個未標 `@待辦` 的斷言改壞 → 該檔紅（`1 failed | 8 passed`）。
**三態成立**：待辦跳過不擋、該做了沒綠就擋 —— 這正是 C109 要的那兩種顏色。

#### 二、⚠️ 三個假設要修，其中兩個是阻斷級

| #   | 草稿寫的                                           | 實測                                                                                                                                                                                                            |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一  | `.feature` 寫 `# language: zh-TW` 就會用中文關鍵字 | ❌ **標頭本身不生效** —— 只寫標頭會 `TypeError: Cannot read properties of undefined (reading 'getScenario')`，parser 根本沒解析出 Feature。必須在程式裡 `setVitestCucumberConfiguration({ language: "zh-TW" })` |
| 二  | 標了 `@待辦` 的場景「不在接線檔裡出現」            | ❌ **會噴 `ScenarioNotCalledError`** —— runner 要求每個解析出來的場景都要有接線。正解是 `excludeTags: ["待辦"]`：被排除的場景不進解析結果，也就不要求接線                                                       |
| 三  | 用 `scenario.tags` 讀標籤                          | ❌ `tags` 是 `{}`，`_tags`／`getTags` 都是 `undefined`。要用 **`scenario.matchTags([...])`**                                                                                                                    |

⚠️ **前兩點合起來有一個結論**：那一行設定是**必要條件**，而且每一支接線檔都要有 ——
**所以它必須由 `slice-gen` 模板生成，不能靠專案組記得寫。** 這讓 C109 §三
「`slice-gen` 是第二類的入口」從一個歸類變成一個硬需求。

#### 三、分母的算法（對應 C109 §五 與使用者定義的計數規則）

```
不帶條件時列出全部訂單 | 實例 1 | 待辦 false
依狀態篩選             | 實例 2 | 待辦 false   ← 場景大綱按例子列展開
依金額區間篩選         | 實例 1 | 待辦 true
分母 4 / 待辦 1 / 應執行 3
```

`loadFeature`（**不設** `excludeTags`）→ 走訪 `feature.scenarii` → `ScenarioOutline`
取 `examples.length`、`Scenario` 取 1 → `matchTags(["待辦"])` 分類。

⚠️ **報表工具要載兩次**：一次不過濾（算分母、列待辦），一次過濾（跑該跑的）。
**兩次的差集就是待辦清單**，也是 CLI 與報表檔那個對照鍵的來源。

#### 四、還沒驗的三件

| 沒驗的                                                             | 為什麼要緊                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `vp run -r test` 撿不撿得到 `tests/specs/*.spec.ts`                | 這次是直接呼叫 vitest 跑的。撿不到的話，規格不會進 `vpr ready`                          |
| `.feature` 放 `features/<切片>/specs/` 時 `conformance` 會不會抱怨 | 那是切片底下的新目錄，而切片契約有目錄結構的規則                                        |
| 報表工具進 `SCOPE.md` 的 `tools/` 表                               | 那張表要求寫得出「為什麼受益者是拉 v1 的團隊」—— 這一句寫得出來：**他們拿它對外報進度** |

#### 五、⚠️ 這一則與 C108 是同一個形狀

C108 更正的是「照方法來源的風險清單抄，沒有查樹」；這一則更正的是
「照套件的常識假設寫，沒有跑過」。**兩次都是在文件即將定案前才驗，
而兩次都驗出了阻斷級的錯誤。**

> **通則：一份會被別人照著做的文件，裡面每一個「照著做就會動」的斷言，
> 都要有一次真的跑過。** 這條比「先文件後檢查」更前面 —— 那條講的是
> 判準的順序，這條講的是**斷言的舉證**。

### C111 — 三件前置驗完，而其中一件驗出一個**現存的**跨工具 bug：中文檔名（2026-08-23）

C110 列了三件「還沒驗」的事，動 `slice-gen` 模板之前要清掉。三件都驗完了，
第三件的過程中撞出一個與規格設施無關、但這條線遲早會踩的既有缺陷。

#### 一、`vp run` 撿得到規格，但路徑是 **package 相對**

`vp run @org/feature-order#test` 撿到了 `tests/specs/*.spec.ts`，與既有測試
一起跑、一起計數。

⚠️ **但 vitest 的 cwd 是 package 目錄，不是 monorepo root。**
草稿寫的 `loadFeature("features/order/specs/...")` 會噴
`feature file ... does not exist`；正確寫法是 `loadFeature("specs/...")`。
⚠️ 這是 C110 那批假設的**第四個**——同樣是「照著先前能跑的情境寫」，
而先前那次是從 root 手動呼叫 vitest 跑的。

#### 二、`conformance` 接受兩個新目錄，而且**確實在看**

`features/<切片>/specs/`（`.feature` 檔）與 `src/usecases/`（純 TS）都不會讓
一致性檢查抱怨。⚠️ 「沒有抱怨」不等於「有在看」，所以做了反向測試：在
`src/usecases/` 放一個相對路徑逃逸 → **紅**，訊息精確指到那個檔案。

⚠️ **但幽靈依賴檢查只掃 `src/`，不掃 `tests/`。** 接線檔 import
`@amiceli/vitest-cucumber` 而切片的 `package.json` 沒宣告它 —— **那是一個
phantom dependency，閘門看不到**。同一個 import 搬進 `src/` 就當場紅，
訊息把代價寫得很清楚：

> 現在能跑是靠 workspace 根目錄的提升或間接相依 —— 那在乾淨重建
> （退出演練、單獨發佈、機關端依原始碼重建）時不成立

**所以 `slice-gen` 模板必須把 runner 加進切片的 `devDependencies`**，
不能靠根目錄提升。至於要不要把幽靈依賴檢查擴大到 `tests/`，那會擋下既有
程式碼，是另一版的事。

#### 三、`scope-check` 對新工具目錄照常紅，登記後綠

`tools/spec-report` 未登記 → `[樹上有、沒登記]`，訊息要求填「守什麼」與
「為什麼受益者是拉 v1 的團隊」兩格。那一句寫得出來：
**他們拿它對外報進度 —— 規格是他們寫的，完成率是他們要交的。**

#### 四、⚠️ 撞出來的既有缺陷：`git ls-files` 會引號化非 ASCII 路徑

驗第三件時出現一個看不懂的違規：

```
✗ [樹上有、沒登記] `"features/ 在版控裡，但〈根層〉那張表沒有它
```

`"features/` 帶著一個引號。原因不是 parser 壞了 —— 是 **git 對含非 ASCII 的
路徑會加引號並做八進位轉義**：

```
"features/order/tests/specs/\350\250\202\345\226\256\346\237\245\350\251\242.spec.ts"
```

第一段於是變成 `"features/`，與表上的 `features/` 對不起來 → **誤報違規**。
`git -c core.quotepath=false ls-files` 輸出正常（實測）。

⚠️ **這與規格設施無關，是一個現存缺陷。** 它今天沒發作，只因為樹上還沒有
任何中文檔名的檔案 —— **而這條線的規格檔會是中文的**。

⚠️ **影響範圍不只一支**：`git ls-files` 的呼叫點在 `scope-check`（`tree.ts`
兩處）、`api-surface`、`doc-facts`。三支都要修。

⚠️ **修法不進 `v1.6.0`。** 那一版的 CHANGELOG 宣稱「只新增文件，一支工具、
一條規則、一個門檻都沒有動」—— 把程式碼修進去，那句話當場變假，
而這正是 `v1.0.3` 與 `v1.5.1` 各付過一次代價的病。**修在 `v1.6.1`（patch）。**

#### 五、通則：**前置驗證要在真實的執行方式下做**

C110 的實測是從 monorepo root 手動呼叫 vitest 跑的，所以路徑假設是對的 ——
在那個情境下。換成專案組真正會用的 `vp run <pkg>#test`，第一件事就是路徑錯。

> **「能跑」要指明是在什麼底下能跑。** 一個在維護者的手動指令下能跑、
> 在採用團隊的標準指令下不能跑的東西，對第二類而言就是不能跑。

### C112 — `git ls-files` 會引號化非 ASCII 路徑，而同一個修法在這個 repo 早有先例（2026-08-23）

C111 §四 記下這個缺陷，並把修法排進 `v1.6.1`。這一則是修完之後的紀錄。

#### 一、症狀：一個看不懂、而且沒有合法出口的紅燈

```
✗ [樹上有、沒登記] `"features/ 在版控裡，但〈根層〉那張表沒有它
```

`"features/` 帶著一個引號。**git 對含非 ASCII 的路徑會加引號並做八進位轉義**：

```
"features/order/specs/\350\250\202\345\226\256\346\237\245\350\251\242.spec.ts"
```

第一段於是變成 `"features/`，與表上的 `features/` 對不起來 → 閘門對一個
**登記過的**目錄報「沒登記」。⚠️ **那種紅燈沒有合法出口** —— 照訊息去補一列
`"features/` 也不會綠，因為下一次路徑轉義的內容還會變。

#### 二、為什麼是 `-z`，不是 `core.quotepath=false`

兩個都能關掉八進位轉義，實測都有效。選 `-z` 的理由：

| 作法                   | 對非 ASCII | 對含引號／換行的檔名    |
| ---------------------- | ---------- | ----------------------- |
| `core.quotepath=false` | ✅ 不轉義  | ❌ 仍會加引號           |
| `-z`                   | ✅         | ✅ NUL 分隔，完全不轉義 |

⚠️ **`-z` 之後不要再 `.trim()`** —— NUL 已經是明確的分隔，trim 會弄壞前後帶
空白的檔名。三處都一併拿掉了。

#### 三、⚠️ 這個修法在這個 repo 早就有先例，只是沒有傳播

`tools/api-surface/src/tracked.ts` **本來就寫著 `["ls-files", "-z", ...]`**，
配 `split("\0")`。所以這條線一直有一支工具是安全的 —— 但那支的檔頭
**沒有寫下為什麼**（它整段在論證「為什麼是 `ls-files` 而不是 `readdirSync`」，
沒有一個字提到轉義）。

> **一個正確的作法如果沒有寫下理由，它就只是那一支工具的習慣，
> 不會變成這條線的作法。** 另外兩支照著「顯而易見」的寫法寫，於是帶著缺陷。

所以這次除了改程式碼，也把理由寫進 `tree.ts` 的檔頭 —— 下一支要讀版控內容的
工具，看得到為什麼。

#### 四、改了哪裡

| 位置                                             | 改動                                   |
| ------------------------------------------------ | -------------------------------------- |
| `scope-check/src/tree.ts` · `trackedDirectories` | 加 `-z`、`split("\0")`、拿掉 `.trim()` |
| `scope-check/src/tree.ts` · `trackedRootEntries` | 同上                                   |
| `doc-facts/src/derive.ts` · `uiComponentCount`   | 同上（`.vue` 的計數會漏掉中文檔名）    |
| `api-surface/src/tracked.ts`                     | **無需改動** —— 早就是 `-z`            |

#### 五、反向測試

`tools/scope-check/tests/scope.test.ts` 新增〈非 ASCII 的路徑〉兩條：
含中文檔名的目錄、根層的中文檔名。

⚠️ **兩條都實測過「拿掉 `-z` 就會紅」**（`2 failed | 26 passed`），
還原後 28 全過 —— **絆線掛在被守的對象上，不是裝飾性斷言。**

#### 六、⚠️ 順帶修掉 `v1.6.0` 帶出去的格式問題，以及那次是怎麼漏的

`v1.6.0` 發布時 `vp check` 是紅的 —— 五個 markdown 檔的表格未對齊，而
`tier1-quality.yml` 的第一步就是 `vp check`，**那個 commit 的 Tier 1 CI 是失敗的**。

驗證時跑了 `vpr gate` 七道、`eslint . --max-warnings=0`、`vp run -r test`，
**唯獨漏了 `vp check`**。

> **「七道閘門全綠」不等於「`ready` 全綠」。** `vpr ready` ＝ `vp check` ＋
> 全套測試 ＋ 建置 ＋ `vpr gate`。逐項跑閘門時最容易漏掉的，正是**不在
> `tools/` 底下的那一項** —— 因為它不在那張表上，而注意力跟著表走。

⚠️ 第二個錯：**合併 PR 之前沒有看 CI 狀態**。那次的紅燈在 GitHub 上是查得到的
（`gh run list`），而合併前沒查。

修法是 `vp check --fix`，改動全部是表格分隔線長度與一個尾部空行，
`git diff -w` 確認零語意改動。

#### 七、為什麼是 patch

判準是「升上來會不會壞」。這條線目前的樹上**沒有任何非 ASCII 檔名**，
所以三處的輸出一字不變；改動買到的是「將來放進中文檔名時不會誤報」。
`platform/*` 的型別形狀零變更，`surface.json`／`API.md` 零變更。

⚠️ **而這個修必須排在 `slice-gen` 模板之前** —— 規格檔是中文檔名，
一放進樹裡就會踩到。

⚠️ **後記（C114）：那個觸發條件沒有發生。** 模板最後用的是 kebab 檔名
（`specs/<切片>.feature`），中文放在 `功能:` 那一行 —— 因為 `--title` 是顯示名，
可能含空白與斜線，拿它當檔名是不安全的。C112 的修仍然是對的，但它現在是
**防禦性的**，不是被這一版逼出來的。**把「將要發生」寫成「已經發生」很容易，
所以回頭修正它。**

---

### C114 — `slice-gen` 交付驗收規格設施，而它差一點交付一個永遠不會執行的檔案（2026-08-23）

TESTING.md 第六節那張缺口表的第一列（層 3 · 完成率，第二類）。這一則是把
設施做進 `slice-gen` 的紀錄 —— 以及實作過程中被實測推翻的四個假設。

#### 一、交付了什麼

產生器現在多產五個檔案，構成第二類測試的整條線：

| 產出                                 | 是什麼                                               |
| ------------------------------------ | ---------------------------------------------------- |
| `specs/<切片>.feature`               | **需求**，人寫的。與 `src/` 平行，不在 `tests/` 底下 |
| `src/ports.ts`                       | 介面。usecase 只認得它，不認得 HTTP                  |
| `src/usecases/query-<切片>.ts`       | **業務規則**，純 TS 零框架。規格打這一層             |
| `tests/specs/<切片>.spec.ts`         | 接線，把規格的中文句子接到 usecase 上                |
| `tests/support/in-memory-gateway.ts` | 規格用的假資料來源                                   |

**產出的切片開箱即綠**（實測：`vp run @org/feature-probe#test` → 20 條，
其中 15 條來自規格；`vp check` exit=0）。

#### 二、⚠️ 阻斷級：草稿的檔名會讓整份規格一條都不被執行

草稿把接線檔叫 `tests/specs/<名>.steps.ts`。**vitest 的預設 include 只收
`*.test.*` 與 `*.spec.*`**，而這條線的根層 `vite.config.ts` 沒有覆寫
`test.include`（grep 過，零命中）。

實測用兩支**必紅**的檔案當探針，同時丟進 `features/order/tests/specs/`：

| 探針             | 結果                          |
| ---------------- | ----------------------------- |
| `probe.spec.ts`  | 🔴 紅（對照組，證明探針有效） |
| `probe.steps.ts` | **連出現在輸出裡都沒有**      |

`Test Files 1 failed | 2 passed (3)` —— 三個檔案裡沒有 `.steps.ts` 那個。

⚠️ **失敗的形狀是全綠。** runner 靜默不跑、既有的 `tests/*.test.ts` 繼續綠、
完成率讀的是一個從來沒有被執行過的檔案。這是本 repo 記錄過六次的
「寫了但永遠無效」，而這一次會被**複製到每一個專案組的樹上**。

⚠️ **對照組是這次量得準的原因。** 只放 `.steps.ts` 的話，看到的是「全綠」——
而那正好是缺陷的症狀，會被讀成「沒問題」。

#### 三、⚠️ usecase 必須在畫面真的會走到的路徑上

新增一層純 TS 業務邏輯，最容易的做法是把它擺在既有的
`views → composables → api.ts` 旁邊。那樣**規格驗的東西與畫面跑的東西是兩條路**：
規格全綠而畫面壞掉，沒有任何閘門看得見。

所以模板產出的鏈是 `views → composables → usecases → ports → api.ts`，
composable 的 `queryFn` 呼叫 usecase，規格也打 usecase，只是換一個 gateway。

**實測的對照**（把 usecase 裡的篩選拿掉）：

| 測試                        | 反應       |
| --------------------------- | ---------- |
| 規格（`probe.spec.ts`）     | 🔴 紅 5 條 |
| 切片契約（`probe.test.ts`） | ✅ 全綠    |

⚠️ **右邊那一欄才是重點** —— 它證明規格買到的是既有測試看不見的東西。
只看左欄的話，證明的只是「規格會紅」。

#### 四、場景大綱的步驟表達式有兩種寫法，而 C110 沒有量到這件事

C110 的實測結果寫著「場景大綱 ＋ 例子表格參數 ✅」，草稿據此寫成 `{number}`。
實際跑起來是 `StepAbleStepExpressionError: No step match`。

runner 比對的是**還沒展開**的那一行：

| `.feature` 原文         | 接線要寫              | 為什麼                      |
| ----------------------- | --------------------- | --------------------------- |
| `以關鍵字 "<關鍵字>" …` | `以關鍵字 {string} …` | 帶引號，配得上 `{string}`   |
| `應該列出 <筆數> 筆`    | `應該列出 <筆數> 筆`  | 不帶引號，`{number}` 配不上 |

⚠️ **同一個場景大綱裡兩種寫法並存**，判別點是 `.feature` 原文有沒有引號。
兩種寫反都是當場報錯（`No step match`／`does not exist`），**不會安靜跳過** ——
所以這個坑會吵，與 §二 那個是相反的性質。

⚠️ **一則「✅」的實測紀錄不等於那個形狀被驗過。** C110 驗的是它自己當時寫的
接線，草稿裡那個 `{number}` 從來沒有跑過 —— 而它讀起來與實測結論一致。

#### 五、上游型別把兩個可選欄位標成必填

`setVitestCucumberConfiguration` 的 `VitestCucumberOptions` 要求
`predefinedSteps` 與 `mappedExamples`，而**同一份型別檔裡的
`getVitestCucumberConfiguration` 自己把這兩個 `Omit` 掉** —— 作者本意顯然是可選。

少了它們，產出的切片第一次跑 `vp check` 就是 TS2739。所以模板帶著
`predefinedSteps: []` 與 `mappedExamples: {}` 兩個空值，並在註解裡寫明
**這兩行是上游型別的缺陷，不是我們需要的設定**。

⚠️ **這一格是 `vp check` 抓到的，不是測試抓到的。** 產生器的測試只讀字串，
不做型別檢查 —— 「產出過不了自己專案的 check」這一類，只有真的產一個切片
跑一次才看得到。

#### 六、契約只加常數，**不動 `REQUIRED_FILES`**

`SPECS_DIR`／`USECASES_DIR`／`STEPS_GLOB`／`USECASE_FORBIDDEN_IMPORTS`／`TODO_TAG`
進契約，但 `REQUIRED_FILES` 一個字沒動。

理由是 D14 已經立下的先例：`COMPOSABLES_DIR`／`VIEWS_DIR`／`STORE_FILE`
也都不在 `REQUIRED_FILES` 裡 —— **契約宣告形狀，`REQUIRED_FILES` 是更窄的
「必須存在」清單**。加進去會讓 `features/order` 與 `features/shipment` 當場紅，
而且**那種紅燈沒有合法出口**（既有切片沒有規格，補一份假的規格不是修法）。
這也是 TESTING.md 自己寫的「第一次先設寬到不擋任何既有程式碼」。

⚠️ **代價要講明白**：`assertCoversContract` 驗的是「產生器 ⊇ 契約」，**不驗反向**。
所以新產的檔案沒有任何東西在守「它必須存在」—— 守它們的只有
`tools/slice-gen/tests/` 裡的斷言。一條 scoped 到「已經有 `specs/` 的切片」的
conformance 規則是下一版的事，不是這一版的。

#### 七、順手補掉一個一直開著的洞：`catalog:` 的名字沒有人在守

既有斷言只驗「版本協定合法」（`catalog:` 開頭就算過），**沒有人在驗那個名字
真的登記在 `pnpm-workspace.yaml` 的 catalog 裡**。

差別在失敗的時機：協定寫錯是產生器測試當場紅；名字沒登記是**產出的切片在
別人機器上 install 才炸**，而那時人已經不在這個 repo 的上下文裡了。

⚠️ **這條不是為了新的 runner 才加的** —— 它守的是模板宣告的每一個 `catalog:`。
加 runner 的時候才發現這個洞一直開著。

#### 八、⚠️ 我自己造了一個假零，而隔壁的註解就寫著那個教訓

第一版的「規格示範了三態的 `@待辦` 那一態」寫成
`expect(feature).toContain("@待辦")` —— **變異回報零**：把標籤整行刪掉，測試全綠。

因為那份 `.feature` 的說明註解裡到處寫著「@待辦」三個字。**提到一個名字和
使用它是兩回事** —— 而同一個檔案裡，store 那條斷言的註解逐字寫著這句話，
還記著它「當場被自己的模板打臉」。**讀過那句話，然後犯了同一個錯。**

修法是比對**標籤那一行的形狀**（Gherkin 標籤必須自成一行）：
`/^\s*@待辦\s*$/m`。

#### 九、變異表

七條新斷言逐一造變異，全部非零：

| 變異                       | 紅  | 性質                      |
| -------------------------- | --- | ------------------------- |
| M1 接線檔改名 `.steps.ts`  | 3   | §二 那個靜默失效          |
| M2 拿掉 `predefinedSteps`  | 1   | §五 的 TS2739             |
| M3 composable 繞過 usecase | 1   | §三 的活路徑              |
| M4 catalog 移除 runner     | 1   | §七 的洞                  |
| M5 usecase 引進框架        | 1   | 純度                      |
| M6 `.feature` 拿掉 `@待辦` | 1   | ⚠️ 第一版是 **0**，見 §八 |
| M7 規格搬進 `tests/`       | 2   | 位置（需求不是測試）      |

§十一 那支測試的四條變異（跑真 parser 的那些）：

| 變異                    | 紅                            |
| ----------------------- | ----------------------------- |
| N1 `功能:` → `Feature:` | 整個 suite 爆（parser throw） |
| N2 例子少一列           | 1                             |
| N3 拿掉 `@待辦`         | 2                             |
| N4 拿掉背景             | 1                             |

⚠️ **N1 的紅法與其他三條不同** —— `loadFeatureFromText` 在 `describe` 外層跑，
解析失敗就是整個檔案 collect 不起來，不是某條斷言紅。那正是 C110 §一 記下的
那個 `TypeError`，只是這次它守在 CI 裡。

⚠️ **M5／M6 的斷言後來改寫過，兩條都重量過**（Tier 2 的
`security/detect-non-literal-regexp` 擋下動態 `RegExp`，改成字串比對與逐行掃描）——
數字不變，但**改測試會改動變異表，不能只重量沒動到的那幾列**（C89 §五）。

⚠️ **M1 紅 3 條是結構性的**（路徑、內容、上游型別三條斷言都讀那個檔案），
證明的是路徑吃重，不是那條絆線守得比較好 —— 與 C96 §七 同一種讀法。

#### 十一、⚠️ 字串斷言擋不住上游變 —— 所以讓真的 parser 在 CI 裡跑模板的規格

§六 決定不補既有兩個切片的規格，後果是**沒有任何 CI 執行過一個 Gherkin 場景**：
那 15 條只在一個丟棄的切片上、在一台機器上跑過一次。runner 出個 7.1 改掉
`predefinedSteps` 的形狀、或 vitest 改掉 include 預設，樹照樣全綠，而破掉的
東西落在第一個產切片的專案組手上 —— 又是同一個形狀。

補法是 `tests/spec-template.test.ts`：把模板產出的 `.feature` **原文**餵進
`loadFeatureFromText`（同一個 parser、同一組中文關鍵字），斷言解析得出 Feature、
場景大綱按例子列展開、以及待辦與該做的分得開。不產切片、不開 tmpdir、
不用 install，跑在 CI 每一次。

⚠️ **它不執行場景**（那需要 `describeFeature` 與接線），驗的是「規格解析得出來、
分母數得對」。執行那一半仍然只在產出的切片上。這條界線要講明白，不然下一個人
會以為場景在 CI 裡跑過。

⚠️ **順帶關掉一個沒被注意到的洞**：runner 原本只在 catalog 裡、沒有任何 package
在用，所以**它不在 `pnpm-lock.yaml` 裡** —— 而 `tools/supply-chain` 的盤點是
從 lockfile 推導的。一個對每個產出切片都是硬需求的東西，對 SBOM、mirror 清單、
封閉網路前置條件**全部隱形**。這支測試讓它成為 `tools/slice-gen` 的真 devDependency，
於是進了 lockfile。

#### 十二、還沒做的

- **`tools/spec-report`** —— 現在跑得出「綠幾條」，但沒有工具把它彙總成一個數字、
  也沒有東西列出待辦清單。分母的算法 C110 已經驗過（`loadFeature` 載兩次取差集），
  而 §十一 那支測試已經把它實作過一遍（在斷言裡）—— 缺的是那支 CLI 與報表檔。
  ⚠️ 它進 `tools/` 就要進 `SCOPE.md` 的表。
- **既有兩個切片沒有規格**（`order`／`shipment`）。刻意不補 —— 見 §六。
  ⚠️ 代價由 §十一 部分補上，但**場景的執行**仍然只發生在產出的切片上。
- **契約第四條沒有機制在守**（agent 不得改 `specs/`、不得自己加 `@待辦`）。
  已寫進 `AGENTS.md` 與產出切片的 README，擋它的只有那句話與人讀規格的 diff。

### C115 — 完成率報表：三態不夠用，缺的那一格與全綠長得一模一樣（2026-08-23）

C114 §十二 列的第一件欠項。`tools/spec-report` 讀規格與測試結果，
產出 `SPEC-REPORT.md` 並印出需要行動的部分。

#### 一、兩份輸出，而它們是**對照關係**

|        | CLI 輸出          | 報表檔                   |
| ------ | ----------------- | ------------------------ |
| 回答   | **現在怎麼辦**    | **做到哪了**             |
| 讀者   | 寫程式的人、agent | 專案經理、驗收方、週報   |
| 內容   | 只有需要行動的    | 每一個場景實例的完整台帳 |
| 壽命   | 這一次執行        | 進版控，可比較兩次的差異 |
| 完整性 | **刻意不完整**    | **唯一完整來源**         |

對照鍵 `<切片>/<功能>#<場景>[<例子>]` 把兩者接起來。
**CLI 是報表檔的過濾視圖，不是另一份資料。**

⚠️ **報表檔不寫失敗原因**（原因會變，而它會被貼進工單）、**不寫時間戳**
（有了它，檔案每天都與重新產生的內容不同，`--check` 永遠紅，於是沒有任何閘門
守得住它是不是最新的 —— 而一份沒有人在守、又進了版控的產出物，正是這個 repo
一再栽跟頭的東西）。

#### 二、⚠️ 三態不夠用 —— 第四態「未執行」

使用者定的是三態：完成／擋下／待辦。做下去才發現少一格：
**「規格解析得出來，但結果裡找不到它跑過」**。

⚠️ **它的症狀與全綠一模一樣**，而 C114 §二 那個 `.steps.ts` 正好會產生它 ——
接線檔沒被 vitest 收集時，`vp run <pkg>#test` 是**綠的**。把「找不到」算成完成
或安靜跳過，就是把那個洞原樣重建在一份拿去對外報進度的文件裡。

**它擋**（非零退出）。實測：把產出切片的 `probe.spec.ts` 改名成 `probe.steps.ts`
→ 測試全綠，而報表 `未執行 4 / 完成率 0.0%`、exit=1。

#### 三、⚠️ 「完成」這一態只從執行結果來

有一條看起來很划算的捷徑：三態的「該做了沒綠就擋」已經由 vitest 強制，所以樹綠的
時候「擋下」必定為 0，於是 **完成 ＝ 全部 − 待辦** —— 純解析規格就算得出來。

**那條不能走。** 從靜態資料產生的話，報表會對每一個沒標 `@待辦` 的場景寫「完成」，
**包括此刻正在紅的那些**，而且檔案裡沒有任何東西能分辨「跑的時候樹是綠的」與
「根本沒有人查過」。那正是 `tools/doc-facts` 整支工具存在的理由。

⚠️ 讀不到某個切片的結果檔時，它的場景一律判「未執行」—— 不是完成、也不是跳過。
**這比原本設計的「缺 `--results` 就 exit 2」更好**：工具照樣產出報表，而報表
自己說得出哪些沒被驗過。

#### 四、不自己跑 vitest

TESTING.md 的「不養第二套 runner」也適用於「不重跑一次」：跨套件測試在這條線上
已經有排程相依（C87 用 `dependsOn` 讓開），自己 spawn 一次就是在 `vpr gate`
已經跑過的地方再撞一次同一個問題。

實測出串接的形狀：**相對路徑的 `--outputFile` 會落在各 package 自己的目錄**
（`vp run -r test -- --reporter=json --outputFile=.vitest-results.json`），
所以 19 個 package 各留一份、互不覆蓋。工具只讀有規格的那幾個切片的那一份。

#### 五、⚠️ 對照鍵靠 parser 自己的替換函式，不靠我們重現一份

場景大綱的每一列要分得開，靠的是步驟標題：

```
.feature   當 以關鍵字 "<關鍵字>" 查詢資料
vitest     當 以關鍵字 "A" 查詢資料          ← 值被代進去了
```

代入走 `ScenarioOutline.getStepTitle(step, example)`。實測它產出的字串與 vitest
`--reporter=json` 的 `title` **逐字相同**，而 `Step.title` 是**原文關鍵字**
（「當」「那麼」「並且」，不是正規化成英文）。

⚠️ **原本打算自己重現 Gherkin 的參數替換** —— 那條規則屬於上游，重現就是漂移的
開始。查了型別才發現官方就提供了。**先讀型別再動手，省掉一個自造的維護負擔。**

⚠️ 而 `ancestorTitles` 只到場景層級（三個例子列共用同一個標題）——
**執行結果那一側沒有例子列的識別**，所以步驟標題是唯一的接縫。
兩列的值完全相同時分不開，那時它們跑的本來就是同一組輸入，狀態相同是對的。

#### 六、⚠️ 端對端實測撞到一個使用者體驗缺陷：還沒 `git add`

`vp create slice` 產完切片、規格檔就在磁碟上，跑這支工具卻說「沒有找到任何規格」——
因為事實來源是 `git ls-files`（C73／C98 裁決過）。

⚠️ **失敗的形狀是一個假的綠**：0/0、exit=0、什麼都不擋。第一次用的人只會覺得
工具壞了。

**修的是訊息不是事實來源** —— 與 C95／C98 同一個做法：訊息自己說出這個出口
（「剛用 `vp create slice` 產生切片的話，先 `git add`」）。換成讀磁碟會換來
C98 記過的那個更糟的失敗：本機綠、CI 乾淨 clone 之後紅。

#### 七、⚠️ 「未執行」有兩個成因，修法**相反** —— 訊息必須分得開

|                    | 意思         | 修法                         |
| ------------------ | ------------ | ---------------------------- |
| 結果檔根本不在     | 你還沒跑測試 | 去跑測試                     |
| 結果檔在、場景不在 | **接線斷了** | 檢查副檔名／檔名（C114 §二） |

第一版兩種都印「先跑一次測試留下結果」。⚠️ **對第二種來說那是把人送去錯的方向** ——
他會跑出一片綠然後更困惑，因為那個缺陷的症狀就是測試全綠。C95 修過同一種病。

⚠️ **同一個形狀在這一則裡出現了第二次，而且是在我剛修完第一次之後。**
`--check` 比對不一致時**在印出狀態之前就 return**，於是某個場景紅了的時候，
畫面上只有「報表過期了，重新產生一次」—— 紅的那幾條一個字都沒有。那個人會照做、
產出一份記著 🔴 的報表、commit，然後在**下一次執行**才看到真正的失敗。

修法是把狀態的輸出移到 `--check` 之前，並讓不一致的訊息說得出兩種成因。
**寫下「兩個成因、相反的修法、同一句話」這條教訓，擋不住同一個模式在隔壁重演；
擋住它的是別人來讀這段程式碼。**

#### 八、變異表

| 變異                          | 紅  | 性質                   |
| ----------------------------- | --- | ---------------------- |
| P1 未執行改判成完成           | 5   | §二 那一格             |
| P2 未執行改判成擋下           | 1   | 判定順序（先判沒跑完） |
| P3 報表加時間戳               | 1   | §一 的可 gate 性       |
| P4 合計給百分比               | 1   | 跨切片稀釋             |
| P5 報表寫失敗原因             | 1   | 會過期的句子           |
| P6 CLI 印待辦細節             | 1   | 紅燈被淹掉             |
| P7 場景大綱不展開             | 11  | 結構性 —— 分母的定義   |
| P8 對照鍵拿掉例子列           | 1   | 兩份輸出接不起來       |
| P9 `--check` 早退             | 3   | §七 的第二例           |
| P10 提示拿掉 default reporter | 1   | §十一                  |

⚠️ P7 紅 11 條是結構性的（分母的定義被所有斷言吃到），證明路徑吃重，
證明不了那一條守得比較好 —— 與 C96 §七、C114 §九 同一種讀法。

#### 九、接進 CI 的位置，以及為什麼不是重複的閘門

`--check` 掛在 **Tier 1 的測試之後**（`.vitest-results.json` 跨 workflow 拿不到），
並進了根層的 `ready` script。

⚠️ **它與測試不是重複的閘門**：測試看不見「規格一條都沒跑」，而那正是這一步
唯一守得住的東西。

⚠️ 代價是根層的 `test` 那一步多了
`--reporter=default --reporter=json --outputFile=.vitest-results.json`，
於是每個 package 多產一個檔案（已進 `.gitignore`）。**那個 `default` 不是多餘的，
見 §十一。**

#### 十一、⚠️ 差一點把整個 repo 的失敗診斷弄瞎

接 CI 的第一版寫的是 `vp run -r test -- --reporter=json --outputFile=…`。
**json reporter 會取代主控台輸出，不是加上去。** 實測（故意弄紅一條斷言）：

| 旗標                                 | 紅燈在畫面上長什麼樣                             |
| ------------------------------------ | ------------------------------------------------ |
| `--reporter=json`                    | `vp run: N failed` —— **就這樣，連測試名都沒有** |
| `--reporter=default --reporter=json` | 測試名 ＋ AssertionError ＋ 差異 ＋ 檔案行號     |

兩種寫法的 `outputFile` 都正常產出。

⚠️ **這個缺陷傷的不是規格那一種失敗，是這條線每一次測試失敗的診斷路徑** ——
而它已經寫進 `.github/workflows/tier1-quality.yml` 與根層的 `ready`。

⚠️ **`vpr ready` exit=0 抓不到它**：一次全綠的執行沒有失敗輸出可以弄丟。
它是被人讀 diff 時發現的，而發現的線索是我自己稍早的兩份 log —— 加了旗標之後
`grep 'FAIL|failed'` 只撈得到一行統計，而我當時得跑 `vp run --last-details`
才知道是哪幾個 package 紅的。**那個不方便就是證據，只是當下沒有認出來。**

#### 十二、⚠️ 上游的一個打包缺陷，每個專案組 install 都會看到

```
[WARN] Failed to create bin at …/node_modules/.bin/vitest-cucumber.
       ENOENT: … @amiceli/vitest-cucumber/dist/cli-generate.js
```

`@amiceli/vitest-cucumber@7.0.0` 的 `package.json` 宣告了一個 bin 指向
`dist/cli-generate.js`，而**發佈的 tarball 裡沒有那個檔案**。

只是 WARN、不擋、不影響任何功能（這條線用的是它的 API 不是它的 CLI）。
但**每個產出的切片都會裝這個套件**，所以每個專案組 `vp install` 都會看到兩行，
而第一個看到的人會以為自己裝壞了。寫在 `tools/slice-gen/README.md` 裡。

⚠️ **這兩行就在我第一次 `vp install` 的 log 裡，而我只看了 exit code。**
與 §十一 同一種：證據在自己的輸出裡，當下沒有認出來。**exit=0 不等於輸出裡沒東西。**

#### 十三、還沒做的

- **fixture 會漂移。** `tools/spec-report/tests/fixture.ts` 的規格形狀必須跟著
  `slice-gen` 的模板走，而**擋它的只有那個檔案裡的一段話**。刻意不 import
  `@org/slice-gen`：那會讓兩支工具直接耦合，而 slice-gen 的 README 明講產生器與
  檢查器之間只准經由契約溝通。⚠️ 這一格是敞著的。
- **報表現在是空的**（沒有任何切片有規格），所以 `--check` 目前恆綠。
  第一個真的寫規格的切片出現之前，這條閘門證明不了自己。
- **語言寫死 `zh-TW`**（`collect.ts` 的 `SPEC_LANGUAGE`）。模板生成的就是它；
  換語言要連 `slice-gen` 的模板一起換。

---

### C116 — 一個 diff 是 0 行的改動溜進了發出去的版本，而沒有閘門在看它（2026-08-23）

`v1.7.0` 發版前跑 `git diff --stat v1.6.1..HEAD` 看到一列：

```
 tools/conformance/src/cli.ts | 0
```

`git diff --summary` 才說得出它是什麼：`mode change 100644 => 100755`。

#### 一、它為什麼躲得過所有東西

**diff 是 0 行。** `vp check`、全套測試、七道閘門、三道 CI —— 沒有一個在看檔案模式。
而 `git status --short` 對它顯示的是 ` M`，與任何一般修改長得一樣。

⚠️ **C99 記過同一件事**（採用演練順帶留下的兩個非預期改動之一），
C114 發版前抓到過一次並還原。**這是第三次，而這一次它進了 `723beb1`。**

#### 二、成因與判準

`vp install` 與 `vp create` 都會動它。而樹上本來就不一致：七支 `cli.ts`
**全部有 shebang、六支宣告了 `bin`**，模式卻是五支 `100644`、兩支 `100755`
（`conformance` 與 `theme-verify`）。

⚠️ **所以「哪個模式才對」這個問題，樹自己沒有答案。** 這一版只做**還原**
（回到 `v1.6.1` 的 `100644`），不統一 —— 統一是另一件事，而且要先問清楚
pnpm 建 bin symlink 時到底依不依賴那個位。

#### 三、還沒做的

- **沒有閘門在看檔案模式。** 補一條很便宜（`git ls-files -s` 讀得到），
  但它會立刻對 `theme-verify` 那支紅 —— 而那支從第一天就是 `755`。
  **先決定判準，再寫檢查**（`v1.0.4 → v1.0.5` 那個順序）。
- ⚠️ 在那之前，**發版前 `git diff --stat` 看到 `| 0` 的那一列就要用
  `--summary` 追一次**。這是目前唯一在守它的東西。

---

### C117 — 判準的兩句話會分岔，而照字面讀它會恆真：五層 × 兩類剩下四格的落點（2026-08-23）

`TESTING.md` §六 的缺口表，層 3 · 完成率已由 C114／C115 填掉，剩下四格：
**層 3 框架承諾、層 1 複雜度、層 2 覆蓋率下限、元層機械化**。要動它們之前
得先答一個問題：**每一格落 `release/v1` 還是送 `main`。**

判的時候判準自己出了問題，而那件事比四個落點重要。

#### 一、兩句話單獨看各自都對，合起來看會分岔

`SCOPE.md` 判準那一節有兩句話：

- **標題**：「**看它守的東西給誰看**」
- **節內的問法**：「這東西紅了，是誰的問題被擋下來？」

⚠️ **問法照字面可以讀成「誰受害」，而那樣讀，這四格全部自動通過。**
腳手架壞掉，受害的永遠是拉 v1 的團隊 —— 判準退化成一句廢話，
而它退化的時候**看起來還是在運作**（每一格都寫得出一句漂亮的受益者）。

**問法必須透過標題讀**：「守的東西」指的是**被守的那個對象是不是交付物**，
不是它壞掉時誰受害。C72 原文的反例對本來就證明了這一點 ——
`doc-facts` **進**（守 README／HANDOFF 的數字，那是交付物）、
`gate-roster` **出**（守 CI 設定的內部一致性）。⚠️ 閘門清單漂移，
專案組**也會**被誤導，它照樣出局。

⚠️ **C72 定了標題那一句，也給了反例對，但沒有寫下「問法要透過標題讀」。**
這一則補的是那個接縫，不是補一句沒有說過的話。

#### 二、四格的落點

| 格                  | 落點                       | 論證                                                                         |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| **層 1 複雜度**     | `release/v1`               | 規則隨 `platform/eslint-config` **下發**，專案組寫的 `features/*` 就在射程裡 |
| **層 2 覆蓋率下限** | **分裂**                   | 第二類那組 → v1；**第一類那組 → `main`**                                     |
| **元層機械化**      | `release/v1`               | fork 之後 `platform/*` 的測試**就是他們的測試**                              |
| **層 3 框架承諾**   | `release/v1`，**形狀改變** | 承諾寫在 `HANDOFF.md`，是交付物 —— 但**規格必須是唯一來源**，見 §四          |

#### 三、層 1：閘門不問，不等於判準通過

複雜度規則加進**既有的** `platform/eslint-config`，**不新增目錄** ——
`tools/scope-check` 根本不會問。⚠️ 這正是 C93 的形狀：**「沒有被治理」不等於
「准許進入」**。所以那句受益者還是要寫下來，而它寫得出來。

#### 四、層 3 框架承諾：規格是唯一來源，不是第二份抄本

`TESTING.md` 說這一格「**不是新的驗證能力**」—— 閘門本來就在驗那些承諾。
⚠️ **那意思是：一份描述閘門行為的規格，就是閘門的第二份手抄本**，而
`SCOPE.md` 開頭警告的正是這個（`v1.0.3` 付過代價）。

選的是「**閘門讀規格，規格是唯一來源**」。

- 否決「接受它是抄本，另加機制斷言一致」—— 那是「加一份清單而不加守它的
  機制」的變形，`SCOPE.md` 明文說那是在製造第五份手抄本。
- 否決「判出局」—— 太早。`TESTING.md` §五 記過「用五層的尺量第二類的機制」
  差點刪掉 `slice-gen` 那次（C109 反轉）。

⚠️ **這個選擇把這一格從「寫文件」變成「重寫閘門」**，是四格裡最大的一塊。
**代價是明知而選的**，不是估錯。

#### 五、同一個對象，落點相反 —— 差別在守的東西

層 2 與元層的對象都是 `platform/*`，而落點相反。

- **覆蓋率門檻**守的是一個數字達不達標 —— 那是**維護者的紀律**，不是交付物。
- **突變測試**守的是「**這些測試是不是假的**」—— 而假測試會讓 fork 的人
  以為平台有保障。

`tools/scope-check` 的先例支撐後者：`TESTING.md` §五 判它「第一類 ＋ 第二類」，
理由是「fork 之後那張表就是他們自己的清單」；`SCOPE.md` 開頭也明文對拉 v1 的
團隊說「那幾欄寫你們自己的理由就好」。同一句話套在測試上成立。

⚠️ **拒絕過一條看起來好走的路**：層 2 整格留 v1，論證沿用 `tools/api-surface`
的「平台一改就打斷每一個切片，這道閘門是他們的保險」。**寫不順** ——
`api-surface` 守的是**型別形狀**（交付物本身的形狀），覆蓋率守的是**測試夠不夠**。
硬套就是把 §一 剛擋掉的「誰受害」讀法從側門放回來。

#### 六、代價與還沒做的

- **層 2 那一格 v1 只設得了一半的門檻**（第二類那組）。第一類那組寫成裁決，
  實作等 #86 解凍。難看，但那是判準誠實跑出來的結果。
- ⚠️ **元層落 v1 的直接後果**：Stryker 設定是**根層檔案**，而 `SCOPE.md` 根層表
  的事實來源是 `git ls-files` —— 檔案一進版控就要有一列。那一列是該格的工作，
  不是之後才發現的意外。
- **這一則只判落點，四格一個都還沒做。** 票在 #129／#130／#131／#132／#133，
  地圖是 #127。

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
