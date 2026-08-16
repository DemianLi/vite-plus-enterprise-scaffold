# 🧱 @org/monorepo

> **把架構決策寫成閘門，而不是寫成規範文件。**
> 以 [Vite+](https://viteplus.dev) 為驅動層、Vue 3 為應用層的企業級 vertical-slice monorepo 骨架。

<!-- 徽章占位符：請把 <ORG>/<REPO> 換成實際的 GitHub 路徑後啟用 -->

[![Tier 1 — Quality](https://img.shields.io/github/actions/workflow/status/<ORG>/<REPO>/tier1-quality.yml?branch=main&label=tier1%20quality)](.github/workflows/tier1-quality.yml)
[![Tier 2 — Security](https://img.shields.io/github/actions/workflow/status/<ORG>/<REPO>/tier2-security.yml?branch=main&label=tier2%20security)](.github/workflows/tier2-security.yml)
[![Exit Drill](https://img.shields.io/github/actions/workflow/status/<ORG>/<REPO>/exit-drill.yml?label=exit%20drill)](.github/workflows/exit-drill.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22.18.0-339933)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.21.0-F69220)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#-開源協議)

> ℹ️ **NPM 版本徽章刻意留空**：本 repo 是 `"private": true` 的 workspace 根，
> 不發佈到 registry，因此沒有可以指向的套件版本。若日後有 `platform/*` 套件對外發佈，
> 再為**該套件**加上 `![npm](https://img.shields.io/npm/v/<pkg>)`。

---

## 專案簡介

大型前端專案真正的痛點不是「怎麼寫元件」，而是**架構規範會腐爛**——切片邊界靠 code review 守、
供應鏈清單靠人抄、「不要把 token 放進 localStorage」靠口頭約定，三個月後全部失效而且沒有人會發現。

這個骨架把那些規範**全部改寫成會失敗的檢查**：跨切片 import 讓建置紅燈、
看起來像機密的環境變數讓建置直接失敗、文件裡抄來的數字對不上事實來源就擋下 PR。
適用於**多團隊並行開發、需要通過資安與稽核的企業內部系統**。

- 完整的決策理由與風險登記 → [DECISIONS.md](DECISIONS.md)
- 上線前必讀 → [HANDOFF.md](HANDOFF.md)，那裡收的是程式碼做不到、
  只有組織能決定的 25 件事（採購／資安／法務／平台／架構），每一項都附「拿什麼去談」
- UI 技術選型的三方比較 → [UI-SURVEY.md](UI-SURVEY.md)

---

## ✨ 核心特性

- **垂直切片架構（Vertical Slice）** — 一片功能 ＝ 一個 package，自帶 API／composables／views／store／測試。
  依賴方向**單向**：`apps → features → platform`，**切片之間一律禁止互相依賴**。
- **邊界由三層機制守著，不是靠 review** — workspace manifest 檢查、oxlint `no-restricted-imports`
  即時提示、相對路徑逃逸的精確路徑解析，各自補上另外兩層守不住的縫。
- **兩層檢查、職責分離** — Tier 1 品質（快、有快取、編輯器即時）與 Tier 2 安全閘門
  （**全量、不快取、不經驅動層、每日排程**）。
- **安全預設值是內建行為，不是建議** — 憑證不進 JS、機密不進 bundle、sourcemap 產但不部署、
  build script 預設全封鎖、CSP 以資料形式由三方共用。**每一條都有測試釘住**。
- **驅動層可替換，而且被實測過** — `vpr exit-drill` 會用上游 Vite/Vitest 實際重建一次，
  證據進版控，拿得出去給稽核看。
- **`platform/` 的 breaking change 必須附 codemod** — `tools/api-surface` 比對每個進入點的
  **型別形狀**（連 interface 成員、class 建構子、`.vue` 的 props 都算），
  **移除、改名、或改變形狀就讓閘門失敗**。
- **供應鏈是產生的，不是寫的** — SCA 例外申請書、含 sha512 的鏡像清單、封閉網路前置條件，
  三份文件由 `pnpm-lock.yaml` 推導。
- **文件裡的數字被機器核對** — `tools/doc-facts` 逐句比對現況型文件的數字與事實來源，
  抄來的、過期的當場紅燈。
- **全 TypeScript、契約優先** — 切片對外只有一個 `defineFeature()` 出口，
  全靜態 import（SAST 追得到、bundler tree-shake 得掉、CODEOWNERS 管得住）。

---

## 📦 安裝指南

> ⚠️ **本節刻意不提供 `npm install` 與 `yarn add`。**
> `package.json` 宣告了 `devEngines.packageManager: pnpm`，在專案目錄內用 npm／npx
> 會被 **`EBADDEVENGINES` 直接拒絕**——這條路徑已實測驗證（DECISIONS.md 的 C8）。
> 下面三條是**真的能跑通**的路徑。

**環境需求**：Node.js `>= 22.18.0`、pnpm `11.21.0`

```bash
# 方式一（推薦）：環境已有全域 pnpm
pnpm install
```

```bash
# 方式二：用 corepack 取得指定版本的 pnpm
corepack enable && corepack prepare pnpm@11.21.0 --activate && pnpm install
```

```bash
# 方式三：全新 clone、機器上既沒有 pnpm 也沒有 corepack 時的 bootstrap
# 注意：必須在「專案目錄之外」執行，用 -C 指向專案
npx --yes --package vite-plus@0.2.9 vp -C ./<repo-dir> install
```

> 內部 registry 環境下，這個 bootstrap 抓取是**第一個會斷的地方**（見 HANDOFF 的 R3／R5）：
> 需另外設定 `npm_config_registry` 與 `NODE_EXTRA_CA_CERTS`。

裝完之後 `node_modules/.bin` 就有 `vp`、`vpr`、`eslint`，**後續一律用它們**：

```bash
cp apps/console/.env.example apps/console/.env
./node_modules/.bin/vp run console#dev
```

開發時另開一個 terminal 跑 BFF（`/api` proxy 的另一端；沒有它，登入、CSRF、
401／403 這整條路徑在本機走不通）：

```bash
./node_modules/.bin/vpr bff
```

> `@org/bff-mock` **不是認證伺服器**：沒有 OIDC、沒有使用者目錄、session 存在記憶體裡。
> 它的用途是讓 D8 的整條路徑從第一天就跑得通，以及證明 `@org/bff-contract` 是可實現的。
> 正式環境請用組織的 gateway，並用契約驗收它（見〈D8 中間層〉）。

---

## 🛠️ 快速上手

### 1 分鐘：新增一個切片並掛上系統

```bash
./node_modules/.bin/vp create slice -- \
  --directory=../features/<name> --slice=<name> --title=<顯示名> --team=@org/<team>
```

> 兩個必須照做的細節（錯了都會以難懂的方式失敗，理由見 [tools/slice-gen](tools/slice-gen)）：
> 選項要用 `--opt=value`，**不能**用 `--opt value`；`--directory` 要寫成 `../features/<name>`。

切片對外**只有一個**公開契約（D7）——`features/<name>/src/index.ts`：

```typescript
import { defineFeature } from "@org/slice-kit";

import { routes } from "./routes.ts";

export default defineFeature({
  name: "order", // 同時是路由／store／i18n／權限碼的命名空間前綴

  routes,

  permissions: ["order:read", "order:cancel"], // 必須全部以 `order:` 開頭

  i18n: {
    "zh-TW": { order: { title: "訂單管理" } }, // 頂層是 locale，其下只准有 `order`
    en: { order: { title: "Orders" } },
  },

  menu: [
    { labelKey: "order.title", routeName: "order/list", order: 10, permissions: ["order:read"] },
  ],
});

export type { Order, OrderListQuery, OrderListResponse } from "./api.ts";
```

掛上系統就是**改一個檔案、加一行**——`apps/console/src/features.ts`：

```typescript
import type { Feature } from "@org/slice-kit";

import order from "@org/feature-order";
import shipment from "@org/feature-shipment";

/** ★ 全系統唯一知道有哪些切片的檔案（D7）。 */
export const features: readonly Feature[] = [order, shipment];
```

> 不需要改 `router/index.ts`、`store/index.ts`、`i18n/index.ts`、`permissions.ts`——
> 那種設計會讓四個團隊同時開發變成四份 merge conflict。
> 命名空間隔離在**執行期**驗到底，dev 模式當場拋錯。

產完後照畫面印出的三個步驟做：加 `CODEOWNERS` 條目、把切片加進
`apps/<app>/package.json` 的 dependencies 與 `src/features.ts`、跑 `vp install`。
產生器**刻意不自動改**那三個檔案——它們決定權責歸屬、依賴圖、系統由哪些切片組成，
都是 code review 一定會看的共用檔案。

### 切片內部的取數路徑（D14）

```typescript
// features/order/src/api.ts —— 純資料存取，禁止直接 import axios/fetch
import { http } from "@org/http-client";
export function fetchOrders(query: OrderListQuery = {}): Promise<OrderListResponse> {
  /* … */
}

// features/order/src/composables/useOrderList.ts —— 有狀態的邏輯
export function useOrderList(query: MaybeRefOrGetter<OrderListQuery>): UseOrderListResult {
  /* … */
}

// features/order/src/views/OrderList.vue —— 只呈現，只准 import 上面那支 composable
```

> `src/views/` 不得直接 import `@tanstack/vue-query`、`@org/http-client` 或本切片的 `api.ts`。
> 禁的是**位置**不是相依，composable 本來就要用它們。

### 一次跑完所有檢查

```bash
./node_modules/.bin/vpr ready
```

---

## 📂 專案資料夾結構

```text
.
├── apps/                     部署單位。薄殼：路由組裝、環境設定、composition root
│   └── console/              主控台應用（唯一知道有哪些切片的地方：src/features.ts）
│
├── features/                 垂直切片。一片 ＝ 一個 package，彼此之間禁止互相依賴
│   ├── order/                訂單切片（示範用：api.ts / composables / views / store.ts）
│   └── shipment/             出貨切片
│
├── platform/                 技術底座。所有切片共用，改動等於同時改動所有團隊
│   ├── slice-kit/            defineFeature() 切片契約，命名空間在執行期驗到底
│   ├── http-client/          唯一合法的 HTTP 出口；沒有、也不會有 token 存取介面
│   ├── config/               環境設定；VITE_* 白名單，像機密的變數讓建置失敗
│   ├── security-headers/     CSP 以「資料」定義，由 BFF／dev 中介層／測試三方共用
│   ├── bff-contract/         中間層必須做到什麼（13 條契約條目）＋怎麼證明做到了
│   ├── bff-mock/             契約的參考實作；不是認證伺服器，session 存在記憶體裡
│   ├── ui/                   共用 UI 元件層
│   ├── pii/                  個資欄位的標註與遮罩基礎設施
│   ├── tsconfig/             共用 TypeScript 設定
│   └── eslint-config/        兩份 ESLint 設定：Tier 2 安全規則集，與 Tier 1 的無障礙規則集
│
├── tools/                    建置與治理腳本。每一支都是一道會失敗的閘門
│   ├── conformance/          切片邊界一致性檢查（宣告依賴＋相對路徑逃逸）
│   ├── api-surface/          platform/* 的型別形狀與基準比對，改名或改形狀即失敗
│   ├── codemods/             breaking change 必附的遷移腳本
│   ├── slice-gen/            切片產生器（vp create slice）
│   ├── bff-check/            對參考實作或真實 gateway 驗收 D8 契約
│   ├── exit-drill/           D2 退出演練：用上游 Vite/Vitest 實際重建一次
│   ├── supply-chain/         套件盤點、SCA 例外申請書、鏡像清單、封閉網路前置條件
│   ├── csp-verify/           CSP 探針；探針由工具產生，不讓人照抄
│   ├── sast/                 開發期源碼掃描
│   ├── compliance/           控制項與證據的對應表
│   ├── pii-check/            個資外洩路徑檢查
│   ├── doc-facts/            文件裡的數字 vs. repo 內部事實來源
│   └── ui-survey/            UI-SURVEY.md 的資料來源
│
├── .github/workflows/        CI：tier1-quality / tier2-security / exit-drill / supply-chain-recapture
├── DECISIONS.md              決策日誌與風險登記（有日期，刻意不被 doc-facts 守）
├── HANDOFF.md                只有組織能決定的事項，附「拿什麼去談」
├── UI-SURVEY.md              UI 技術選型的三方比較
└── vite.config.ts            驅動層設定（退出面刻意收斂在兩個設定檔）
```

依賴方向**只准單向**：`apps → features → platform`。
切片需要互動時只有兩條合法路徑：往上到 `apps/` 層組裝，或往下把共用契約抽到 `platform/`。

---

## 兩層檢查

|                       | 內容                                       | 指令                   | 何時跑                    |
| --------------------- | ------------------------------------------ | ---------------------- | ------------------------- |
| **Tier 1 — 品質**     | oxlint + oxfmt + 型別檢查 + 無障礙靜態檢查 | `vp check`、`vpr a11y` | 本機、pre-commit、每次 PR |
| **Tier 2 — 安全閘門** | 一致性檢查 + ESLint 安全規則               | `vpr gate`             | 每次 PR **＋ 每日排程**   |

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

### CI

| Workflow                                                     | 內容                                                                                                 | 快取              | 觸發                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------- | ------------------------ |
| [`tier1-quality.yml`](.github/workflows/tier1-quality.yml)   | `vp check` / test / build / **無障礙靜態檢查**                                                       | ✅ 任務快取       | PR、push to main         |
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

---

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

---

## 改 `platform/` 的規矩

`platform/` 就是腳手架本身：改它等於同時改動所有切片、所有團隊。因此——

> **breaking change 必須附 codemod，且由提出者在同一個 PR 跑完全 repo。**

這條規則有機制強制：[`tools/api-surface`](tools/api-surface) 用 TypeScript 的
checker 抽出每個 `platform/*` 進入點的**型別形狀**，與已提交的基準比對。
**移除、改名、或改變形狀就讓閘門失敗**，除非基準已登記對應的 codemod。

「形狀」的意思是連 `interface` 的成員、class 的建構子、`.vue` 元件的 props
都在比對範圍內——在一個匯出的 interface 上加一個必填欄位，下游每一個
既有切片都會編譯失敗，而那正是這道閘門要抓的東西。判準只有一條：
**下游會不會編不過。**

做不到 codemod 的改動，就不是 breaking change，是**新 API**——新增 export、
新增選填成員、把舊的標 `@deprecated` 保留一個 release 週期。

⚠️ 隨之而來的一條限制：**公開簽章不得引用沒有 `export` 的型別**。
理由與實測寫在 `tools/api-surface/src/shape.ts`；補救是加一個 `export`。

流程與寫 codemod 的三條硬規則見 [tools/codemods](tools/codemods)。

---

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

---

## D8 中間層（BFF／gateway）

那一層不在腳手架裡 —— 它是組織既有的 gateway。腳手架提供的是**它必須做到什麼**，
以及**怎麼證明做到了**：

```bash
./node_modules/.bin/vpr bff-check                                    # 對參考實作
BFF_ORIGIN=https://gateway.internal ./node_modules/.bin/vpr bff-check  # 對真實 gateway
```

全綠代表這一層滿足 D8。13 條契約條目、可覆寫的 env、以及對真實 gateway 的
誠實限制（OIDC 那段無法自動化）見 [`platform/bff-contract`](platform/bff-contract)。

---

## 換掉 `vite-plus` 的退路

D2 選了「可替換的驅動層」，而那張保單**是被實測過的**，不是一句話：

```bash
./node_modules/.bin/vpr exit-drill    # 用上游 Vite/Vitest 實際重建一次
```

最後一次結果在 [`tools/exit-drill/evidence.json`](tools/exit-drill/evidence.json)（進版控，
是拿給稽核看的東西）。每次 gate 另外跑一個幾秒鐘的靜態檢查，
確保退出面沒有從兩個設定檔擴大出去。詳見 [tools/exit-drill](tools/exit-drill)。

---

## 供應鏈：拿去給資安與平台團隊的三份文件

腳手架帶進來的東西比想像的多：**565 個套件，其中 144 個是平台限定的原生二進位，
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

---

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
- **無障礙只守得到靜態可查的那一半，而那一半在這種寫法下幾乎是空的。**
  `vpr a11y` 對本 repo 的正常結果是**零個發現**，那不代表頁面可用：規則比對的是
  原生元素與屬性，而本 repo 的互動幾乎都包在元件裡（`UiButton`／`RouterLink`／
  `DialogRoot`），元件對它們是透明的。實測同一批 `.vue` 用人眼讀出四個真缺陷、
  它一個都沒報（那四個已修）。看不見的那一類具名列在
  [HANDOFF 第 22 項](HANDOFF.md)，要哪個等級以 RFP 為準。

---

## 📖 完整文件

這份 README 只講**怎麼用**。要知道**為什麼這樣設計**，去下面這幾份：

| 文件                                             | 內容                                                           | 讀者               |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------ |
| [DECISIONS.md](DECISIONS.md)                     | 每一項架構決策（D-）、實測校正（C-）與風險登記（R-）的完整理由 | 架構師、後續維護者 |
| [HANDOFF.md](HANDOFF.md)                         | 程式碼做不到、只有組織能決定的事項，每一項附「拿什麼去談」     | PM、採購、資安     |
| [UI-SURVEY.md](UI-SURVEY.md)                     | UI 技術選型的三方比較與既有約束                                | 前端負責人         |
| [`platform/bff-contract`](platform/bff-contract) | 13 條中間層契約條目、可覆寫的 env、對真實 gateway 的誠實限制   | 後端／平台團隊     |
| [`tools/<name>/README.md`](tools)                | 每一道閘門自己的守備範圍、失敗訊息怎麼讀、刻意不守什麼         | 全體               |
| [AGENTS.md](AGENTS.md)                           | Vite+ 工具鏈的指令對照（`vp` 內建命令 vs. `vp run` 腳本）      | 全體／AI 協作      |
| [Vite+ 官方文件](https://viteplus.dev/guide/)    | 驅動層本身；本機副本在 `node_modules/vite-plus/docs`           | 全體               |

各層的 API 說明就放在該 package 的 `README.md` 與原始碼的 JSDoc 裡——
本 repo 的慣例是**理由寫在它生效的地方**，不集中到一份會過期的說明文件。

---

## 🤝 貢獻指南

### 提交 Issue

開 Issue 前請先跑一次 `./node_modules/.bin/vpr ready` 並附上輸出。回報時請包含：

1. **重現步驟**與預期／實際行為
2. **環境**：`node -v`、`./node_modules/.bin/vp --version`、作業系統
3. 若是工具鏈或套件管理行為異常，附上 `./node_modules/.bin/vp env doctor` 的輸出

### 提交 Pull Request

```bash
git switch -c feat/<slice-or-area>-<簡短描述>
# ...改動...
./node_modules/.bin/vpr ready     # vp check + test + build + gate，必須全綠
git commit -m "feat(<scope>): <做了什麼>"
```

PR 會被兩層 CI 攔一次，請先在本機過。另外有四條**不通融**的規矩：

1. **不得跨切片依賴。** 需要互動就往上到 `apps/` 組裝，或往下把契約抽到 `platform/`。
2. **改 `platform/` 的 breaking change 必須同 PR 附 codemod 並跑完全 repo**，
   否則 `tools/api-surface` 會擋下。做不到 codemod 就改成新增 API ＋ `@deprecated`。
3. **新增切片要自己補三個檔案**：`CODEOWNERS`、`apps/<app>/package.json` 的
   dependencies、`apps/<app>/src/features.ts`。產生器刻意不代勞——那正是要被 review 的部分。
4. **文件裡的數字必須推導得出來。** 現況型文件（README／HANDOFF／UI-SURVEY）由
   `tools/doc-facts` 逐句核對；改寫被登記的句子會變成 `never-cited` 紅燈，
   請同步更新 `tools/doc-facts/src/facts.ts` 的樣式。

> 修改 `.github/workflows/tier2-security.yml` 或任何 `tools/` 下的閘門前，
> 請先讀該檔開頭的理由段落。`CODEOWNERS` 已把這些路徑劃給資安共同把關，
> 「先問為什麼它長這樣」比「先讓它變綠」重要。

---

## 📄 開源協議

本專案採用 [MIT License](https://opensource.org/licenses/MIT) 授權，全文見 [LICENSE](LICENSE)。

```
MIT License

Copyright (c) 2026 @org

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```

> ⚠️ **著作權人那一行 `@org` 是占位符。** 本 workspace 根是 `"private": true`
> 的內部骨架，MIT 宣告目前只在 [LICENSE](LICENSE) 與根 `package.json` 的
> `"license": "MIT"` 兩處，兩者必須一致。正式對外前請把 `@org` 換成
> **法務認可的法人全名**——這是組織的決定，不是這份 README 能代為認定的。
> 底下 25 個 workspace 套件全部是 `private`、不發佈，因此刻意不逐一標註授權。

上游相依的授權另計——`vite-plus` 為 MIT（Cloudflare 併購後），`lightningcss` 為 MPL-2.0，
另有 22 個 `@yuku-*` 在 registry 上沒有 license 欄位。完整盤點見 `vpr sca-dossier`。
