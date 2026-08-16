# @org/monorepo

以 [Vite+](https://viteplus.dev) 為驅動層、Vue 3 為應用層的企業級 vertical-slice monorepo 骨架。

完整的決策理由與風險登記見 [DECISIONS.md](DECISIONS.md)。這份 README 只講怎麼用。

> **要上線前先看 [HANDOFF.md](HANDOFF.md)** —— 那裡收的是程式碼做不到、
> 只有組織能決定的 18 件事（採購／資安／法務／平台／架構），每一項都附「拿什麼去談」。

## 快速開始

**全新 clone 的第一道指令**（此時還沒有 `node_modules`，也就沒有 `vp`）：

```bash
npx --yes --package vite-plus@0.2.9 vp -C ./<repo-dir> install
```

> ⚠️ 這行**必須在專案目錄之外**執行，用 `-C` 指向專案。
> 原因：專案的 `package.json` 宣告了 `devEngines.packageManager: pnpm`，
> 而 `npx` 底層是 npm —— 在專案目錄內執行會被 npm 以 `EBADDEVENGINES` 直接拒絕。
> 這條路徑已實測驗證（見 DECISIONS.md 的 C8）。
>
> 有全域 `pnpm` 或 `corepack` 的環境可改用 `pnpm install`；本機兩者皆無時走上面那行。
> 內部 registry 環境下，這個 bootstrap 抓取是**第一個會斷的地方**（見 R3／R5）。

裝完之後 `node_modules/.bin` 就有 `vp`、`vpr`、`eslint`，後續一律用它們：

```bash
cp apps/console/.env.example apps/console/.env && ./node_modules/.bin/vp run console#dev
```

開發時另開一個 terminal 跑 BFF（`/api` proxy 的另一端；沒有它，登入、CSRF、
401／403 這整條路徑在本機走不通）：

```bash
./node_modules/.bin/vpr bff
```

> `@org/bff-mock` **不是認證伺服器**：沒有 OIDC、沒有使用者目錄、session 存在記憶體裡。
> 它的用途是讓 D8 的整條路徑從第一天就跑得通，以及證明 `@org/bff-contract` 是可實現的。
> 正式環境請用組織的 gateway，並用契約驗收它（見下方〈D8 中間層〉）。

## 三層結構

```
apps/        部署單位。薄殼：路由組裝、環境設定、composition root
features/    垂直切片。一片 = 一個 package：
             src/api.ts（純資料存取）→ src/composables/（useXxx，有狀態的邏輯）
             → src/views/（只呈現）＋ src/store.ts（Pinia）＋ 自己的測試
platform/    技術底座。slice-kit / http-client / config / security-headers /
             bff-contract / bff-mock / ui / pii / tsconfig / eslint-config
tools/       建置與治理腳本。conformance / api-surface / codemods / slice-gen /
             bff-check / exit-drill / supply-chain / csp-verify /
             compliance / pii-check / doc-facts / ui-survey
```

依賴方向**只准單向**：`apps → features → platform`。

**切片之間一律禁止互相依賴。** 需要互動時只有兩條合法路徑：往上到 `apps/` 層組裝，
或往下把共用契約抽到 `platform/`。

## 兩層檢查

|                       | 內容                         | 指令       | 何時跑                    |
| --------------------- | ---------------------------- | ---------- | ------------------------- |
| **Tier 1 — 品質**     | oxlint + oxfmt + 型別檢查    | `vp check` | 本機、pre-commit、每次 PR |
| **Tier 2 — 安全閘門** | 一致性檢查 + ESLint 安全規則 | `vpr gate` | 每次 PR **＋ 每日排程**   |

> 指令刻意**不用** `pnpm run` / `npx`：本專案不保證環境有全域 pnpm，
> 而 `npx` 會被 `devEngines` 擋下。`vpr` 是 vite-plus 的 script runner，
> 由 `vp install` 一併提供，且會把 `node_modules/.bin` 放進 PATH。
>
> CI 應**直接呼叫底層執行檔**（`node tools/conformance/src/cli.ts`、
> `node_modules/.bin/eslint . --max-warnings=0`），不經 `vp` —— 這是 D2 保單的要求：
> 安全閘門不得依賴可替換的驅動層。

Tier 2 刻意**全量、不快取、不經 `vp`**。原因是安全掃描的結果會隨時間失效，
即使程式碼一字未改——新公布的 CVE 不會改變任何快取指紋，affected 過濾會判定
「無影響」，於是命中快取回綠燈，而專案此刻正是脆弱的。

一次跑完所有檢查：

```bash
./node_modules/.bin/vpr ready
```

## 新增一個切片

```bash
./node_modules/.bin/vp create slice -- --directory=../features/<name> --slice=<name> --title=<顯示名> --team=@org/<team>
```

兩個必須照做的細節（錯了都會以難懂的方式失敗，理由見 [tools/slice-gen](tools/slice-gen)）：

- 選項要用 `--opt=value`，**不能**用 `--opt value`
- `--directory` 要寫成 `../features/<name>`

產完後照畫面印出的三個步驟做：加 `CODEOWNERS` 條目、把切片加進
`apps/<app>/package.json` 的 dependencies 與 `src/features.ts`、跑 `vp install`。

> 產生器**刻意不自動改**那三個檔案。它們決定權責歸屬、依賴圖、系統由哪些切片組成 ——
> 都是 code review 一定會看的共用檔案。自動塞進去等於繞過那道 review，
> 而那正是這些檔案存在的理由。

## CI

| Workflow                                                     | 內容                                                                                                 | 快取              | 觸發                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------- | ------------------------ |
| [`tier1-quality.yml`](.github/workflows/tier1-quality.yml)   | `vp check` / test / build                                                                            | ✅ 任務快取       | PR、push to main         |
| [`tier2-security.yml`](.github/workflows/tier2-security.yml) | 一致性檢查 / API 表面 / BFF 契約 / 退出面 / **供應鏈盤點** / ESLint 安全規則 / gitleaks / SBOM / SCA | ❌ **一格都沒有** | PR **＋ 每日 21:00 UTC** |
| [`exit-drill.yml`](.github/workflows/exit-drill.yml)         | D2 退出演練（上游 Vite 實際重建一次）                                                                | ❌                | **每季** + 手動          |

Tier 2 的三條規則——不快取、不做 affected 過濾、必須有時間觸發——是刻意的。
改動前請先讀該檔開頭的理由；`CODEOWNERS` 也把它劃給資安共同把關。

> **已在 GitHub Actions 上實跑**（2026-08-15）：Tier 1 一次就綠；Tier 2 首跑紅，
> 抓到三個本機看不到的問題並已修掉（見 DECISIONS.md 的 C32）。
>
> ⚠️ 仍有兩處只有在貴組織的環境才驗得了：bootstrap 步驟在內部 registry 下需設
> `npm_config_registry` 與 `NODE_EXTRA_CA_CERTS`，以及 SBOM 工具
> （若貴組織用 Blackduck／Snyk 而非 Trivy，交付稽核的必須是稽核認可的那個工具的輸出）。

## 邊界怎麼守

切片邊界有三層防護，因為單一層都有各自守不住的縫：

| 層  | 機制                                      | 擋什麼                                         | 跑在哪               |
| --- | ----------------------------------------- | ---------------------------------------------- | -------------------- |
| 1   | `tools/conformance` 讀 workspace manifest | 宣告出來的跨切片依賴                           | Tier 2               |
| 2   | oxlint `no-restricted-imports`            | 裸模組名跨切片 import、繞過 `@org/http-client` | Tier 1（編輯器即時） |
| 3   | `tools/conformance` 精確路徑解析          | 相對路徑逃逸切片根目錄                         | Tier 2               |

切片**之內**還有第四層（D14）：`src/views/` 不得直接 import `@tanstack/vue-query`、
`@org/http-client` 或本切片的 `api.ts` —— 取數一律走 `src/composables/useXxx.ts`。
禁的是**位置**不是相依，composable 本來就要用它們。理由與反向測試見 DECISIONS.md 的 D14。

第 3 層之所以不用 lint 規則：`import/no-relative-parent-imports` 擋掉的是**所有** `../`，
連 `src/views/X.vue` 匯入同 package 的 `../api.ts` 都擋，偽陽性高到大家會關掉它。
詳見 `tools/conformance/src/cli.ts` 的 `checkRelativeEscapes`。

## 改 `platform/` 的規矩

`platform/` 就是腳手架本身：改它等於同時改動所有切片、所有團隊。因此——

> **breaking change 必須附 codemod，且由提出者在同一個 PR 跑完全 repo。**

這條規則有機制強制：[`tools/api-surface`](tools/api-surface) 會匯入每個 `platform/*`
套件、列舉實際 export 並與已提交的基準比對。**移除或改名就讓閘門失敗**，
除非基準已登記對應的 codemod。

做不到 codemod 的改動，就不是 breaking change，是**新 API**——新增 export、
把舊的標 `@deprecated` 保留一個 release 週期。

流程與寫 codemod 的三條硬規則見 [tools/codemods](tools/codemods)。

## 安全預設值

這些不是建議，是已經內建在骨架裡、且有測試釘住的行為：

- **憑證不進 JS**：`@org/http-client` 沒有、也不會有任何 token 存取介面。
  認證走 BFF 設的 httpOnly cookie，配 double-submit CSRF。
- **機密不進 bundle**：`VITE_*` 只允許白名單內的公開設定。加了看起來像機密的變數，
  **建置直接失敗**（試試在 `.env` 加一行 `VITE_API_SECRET=x`）。
- **sourcemap 產但不部署**：`build.sourcemap: 'hidden'`。部署流程只上傳 `.map`
  到錯誤追蹤系統，不放 web server。
- **build script 預設全封鎖**：允許清單在 `pnpm-workspace.yaml` 的 `allowBuilds`，
  每一筆都要寫明審查理由。
- **XSS**：`vue/no-v-html` 由 Tier 2 強制（oxlint 沒有這條規則）。
- **CSP 是資料，不是設定檔字串**：政策定義在 [`@org/security-headers`](platform/security-headers)，
  由 BFF、`vite dev` 中介層、測試三方共用同一份。`dev` 已套用 report-only，
  violation 在開發當下就出現。「不得放寬」的性質（無 `unsafe-eval`、
  `unsafe-inline` 只准出現在 `style-src-attr`）有測試釘住。
- **CSP 不需要 nonce，而且這件事被守著**：建置產物零個 inline script，
  所以 CSP 可以是一行靜態回應標頭。一旦有人加進 inline script，
  `assertStaticCspCompatible()` 讓**建置直接失敗** —— 因為那會讓組織端的需求
  從「多送幾個標頭」跳到「要有一個逐次請求改寫 HTML 的中間層」。

## D8 中間層（BFF／gateway）

那一層不在腳手架裡 —— 它是組織既有的 gateway。腳手架提供的是**它必須做到什麼**，
以及**怎麼證明做到了**：

```bash
./node_modules/.bin/vpr bff-check                                    # 對參考實作
BFF_ORIGIN=https://gateway.internal ./node_modules/.bin/vpr bff-check  # 對真實 gateway
```

全綠代表這一層滿足 D8。13 條契約條目、可覆寫的 env、以及對真實 gateway 的
誠實限制（OIDC 那段無法自動化）見 [`platform/bff-contract`](platform/bff-contract)。

## 換掉 `vite-plus` 的退路

D2 選了「可替換的驅動層」，而那張保單**是被實測過的**，不是一句話：

```bash
./node_modules/.bin/vpr exit-drill    # 用上游 Vite/Vitest 實際重建一次
```

最後一次結果在 [`tools/exit-drill/evidence.json`](tools/exit-drill/evidence.json)（進版控，
是拿給稽核看的東西）。每次 gate 另外跑一個幾秒鐘的靜態檢查，
確保退出面沒有從兩個設定檔擴大出去。詳見 [tools/exit-drill](tools/exit-drill)。

## 供應鏈：拿去給資安與平台團隊的三份文件

腳手架帶進來的東西比想像的多：**563 個套件，其中 144 個是平台限定的原生二進位，
分屬 12 個家族**（不只 `vite-plus` —— TypeScript 7 自己就是原生執行檔，
`lightningcss` 是 MPL-2.0）。

這幾個數字由 `pnpm-lock.yaml` 推導進 `inventory.json`，再由
[`tools/doc-facts`](tools/doc-facts) 逐句核對這一段有沒有跟上 ——
上一版這裡寫著「**全部由 pnpm-lock.yaml 推導**，不是抄的」，
而它們**正是抄的**，而且已經過期（467／121／11）。那句話是被自己描述的機制抓到的。

```bash
./node_modules/.bin/vpr sca-dossier      # → 資安：SCA 例外申請書
./node_modules/.bin/vpr mirror-manifest  # → 平台：含 sha512 的鏡像清單
./node_modules/.bin/vpr airgap           # → 平台：封閉網路前置條件與驗收方式
```

三份都是**產生**的，不是寫的。基線
[`inventory.json`](tools/supply-chain/inventory.json) 與來源證明
[`provenance.json`](tools/supply-chain/provenance.json) 進版控，每次 gate 與 Tier 2 比對——
新的原生工具鏈進到建置環境時會被擋下，直到有人分類它。

⚠️ 兩件反直覺、實測出來的事：**專案 `.npmrc` 的 `registry=` 不涵蓋 `vp` 自動下載
pnpm 那一步**（要設在機器層級），而**封閉環境無法就地升相依**（`--capture` 必須
在公網側完成）。兩者都在 `vpr airgap` 的輸出裡。詳見 [tools/supply-chain](tools/supply-chain)。

## 已知限制

- `vite-plus` 是 **0.2.x（beta）**，約 1–2 週一版，且**無 SLA／支援承諾**（MIT）。
  緩解是上面那道退出演練。授權疑慮已解除（Cloudflare 併購後 Vite+ 為 MIT），
  但供應商紀錄要寫 Cloudflare。詳見 DECISIONS.md 的 R1。
- `typescript-eslint` 不支援 TypeScript 7，Tier 2 因此在 `@org/eslint-config`
  內自帶一份 TypeScript 6.0.3。上游支援後即可移除。
- `vp run` **沒有** changed-since 過濾器。affected 偵測若要做，得自己算 git diff。
  目前靠任務快取提速（實測 4/5 命中）。
- 144 個原生二進位裡有 **43 個沒有 SLSA provenance**（含全部 20 個
  `@typescript/typescript-*`），只有 npm 的發佈簽章。這不是本腳手架能修的，
  但 SCA 例外申請書必須把它分開列 —— `vpr sca-dossier` 已經這麼做。
- 22 個 `@yuku-*` 在 registry 上**沒有 license 欄位**。上層套件宣告 MIT、同一個 repo，
  但工具刻意不代填 —— 需要法務確認或請上游補。
