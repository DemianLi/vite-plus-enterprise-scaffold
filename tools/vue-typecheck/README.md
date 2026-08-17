# @org/vue-typecheck

`.vue` 的型別檢查。**補的是 `vp check` 完全沒有覆蓋的一塊**（HANDOFF #26／C68）。

```bash
node tools/vue-typecheck/src/cli.ts
```

## 為什麼需要它

`vp check` 的型別那一段是 oxlint 的 tsgolint，**它不看 `.vue`**。實測：

| 同一行 `const broken: number = "顯然是字串"` | 結果         |
| -------------------------------------------- | ------------ |
| 放進 `.vue` 的 `<script setup>`              | **0 errors** |
| 放進 `.ts`                                   | 1 error      |

也就是說 2026-08-17 之前，設計系統的元件原始碼**一行型別檢查都沒有跑過**。

## 乾跑量到的東西，比「有幾條錯」重要

16 條，而 16 條全部是 `TS2339: Property '$t' does not exist`：兩個切片的模板
用 `$t`，而兩個 `package.json` 都沒宣告 `vue-i18n`。

⚠️ **那是一個幽靈相依，而現有的幽靈相依檢查看不見它** ——
`tools/conformance` 讀的是 import，全域屬性不是 import。找到它的只有這一支。

⚠️ **`apps/console` 當時報 0 條，而那是假的乾淨。** 它的程式清單裡就有
`features/order/src/views/OrderList.vue` —— 同一個檔案在 console 的程式裡
0 條、在自己 package 的程式裡 10 條。**缺陷不是「有幾條錯」，是切片單獨
拿出來型別檢查不會過**，而這個腳手架的賣點就是切片會被別的團隊 fork 走。

## 三段設計

### 一、推導要檢查哪些 program（`src/programs.ts`）

從檔案系統找 `.vue`，往上找最近的 `package.json`，那就是它的 program。
**不寫清單** —— 寫死的話新增一個切片會安靜地不被檢查，而閘門仍然全綠（A1）。

排除規則是路徑中段 `tests/fixtures/`，**是規則不是清單**。那底下的 `.vue`
是刻意寫壞的（無障礙規則的、形狀抽取器的、本 package 自己的），
不排除的話這道閘門第一天就對著它們紅，然後它會被加例外（C41）。

一個 `.vue` 找不到 package，或它的 package 沒有 `tsconfig.json` → **丟例外**，
不跳過。「跳過」在這裡的症狀正是這支工具存在的理由。

### 二、跑，並且把輸出全部分類完（`src/run.ts`）

同一次執行帶 `--noEmit --listFiles`（實測：有錯誤時檔案清單照印）。
**每一行都要被認出來，認不出來就丟例外** —— grep 不到就等於零，
而「零」在這個 repo 已經騙過三次。

### 三、先證明有在看，才給判決（`missingViews`）

每份 program 都比對「該讀的 `.vue`」與「vue-tsc 實際讀了哪些檔」，缺一個就紅。

> **「0 條錯誤」與「一個檔案都沒讀到」印出來長得一模一樣。**
> `@source` 沒設時 Tailwind 建置成功、CSS 甚至變大，裡面一個 utility 都沒有。
> 這一列就是為了那個形狀不要再發生第四次。

## 買得到與買不到

| 植入（跑在基準 0 條的 program 上）  | 結果                     |
| ----------------------------------- | ------------------------ |
| `<script setup>` 裡的型別錯誤       | ✅ 紅                    |
| `<template>` 運算式的型別錯誤       | ✅ 紅                    |
| 跨元件的 prop 型別不符／缺必填 prop | ✅ 紅                    |
| **slot payload 的型別用錯**         | ✅ 紅（關掉 #24 的殘留） |
| `<template #不存在的slot>`          | ❌ **不紅**              |

最後一列是**能力邊界不是設定沒開**：`@vue/language-core` 3.x 只有
`checkUnknownProps`／`Events`／`Components`／`Directives`／`strictVModel`
五個旋鈕，沒有 unknown slot 這一項。那一半由 `tools/api-surface` 守
（slot／emit 的**名單**，C67）—— 這裡守型別，那裡守名單。
反向測試把它寫成一條「不得紅」，為的是升級後它哪天突然會紅時有人知道。

前三列同時證明 `declare module "*.vue"` 那個 shim **沒有**蓋掉跨元件的
型別檢查 —— 那是 fixture 一定要帶著同一份 shim 的理由。

## 刻意不開 `strictTemplates`

| 設定                                             | 基準錯誤數 |
| ------------------------------------------------ | ---------- |
| 不開                                             | 0          |
| `strictTemplates: true`                          | **2**      |
| `strictTemplates` ＋ `checkUnknownEvents: false` | 0          |
| `strictTemplates` ＋ `checkUnknownProps: false`  | 0          |

那 2 條都是 `<UiButton @click="…">`。`UiButton` 沒宣告 `click`，靠的是
fallthrough attr 落到根 `<button>` —— 而**加 `defineEmits` 反而會關掉
fallthrough**，變成必須手動 re-emit。「修法」比病還糟（C41／C55）。

代價寫清楚：抓不到 prop 名字打錯。

## ⚠️ 這個 repo 因此有兩個 TypeScript

```
require("typescript").version              → 7.0.2（原生 Go）
Object.keys(require("typescript")).length  → 2
typeof ts.createProgram                    → undefined
```

`vue-tsc@3` → `@volar/typescript` 需要 JS 版的 compiler API，所以本 package
用具名 catalog `catalog:vue-typecheck` 拉一份 TypeScript 5.x。

**兩支編譯器對同一份程式碼給出不同判決的話，這道閘門會被關掉（C57）。**
把成本框住的三個量測：

- **分歧上界 0**：vue-tsc 在 TS 5.9 下把四份 program 裡的每一支 `.ts` 都
  檢查了，產出 0 條 tsgolint 沒有的診斷。**升 vite-plus 或 TS 時要重跑。**
- **供應鏈 +9 個純 JS 套件**，原生二進位 144 → 144、家族 12 → 12 不變。
- **範圍收窄**：只對含 `.vue` 的 package 跑，`.ts` 的判決仍然只有 `vp check`。

已經撞到一次的實例：把 `import type {} from "vue-i18n";` 加進 `env.d.ts`，
那個檔案就從全域腳本變成模組，裡面的 `declare module "*.vue"` 不再是環境宣告
——**而只有 tsgolint 紅、vue-tsc 全綠**（vue-tsc 真的解析 `.vue`，不需要 shim）。
方向出乎意料：不是兩者判決不同，是一者看得見的東西另一者看不見。

### 那第二個 TypeScript 要不要進退出演練的帳目？不用，而且是有理由的

C64 的先例值得先講：`happy-dom` 沒登記，完整演練從 PR #15 起就是壞的，
19 個 PR 沒有人知道 —— 那是「測試相依帳目」那一項存在的原因。

`tools/exit-drill` 的帳目範圍是**從 `apps/console` 走得到的 manifest**
（`reachableManifests()`），因為演練複製並跑測試的就是那一批。
`@org/vue-typecheck` 沒有任何 package 依賴它（`vpr gate` 是按路徑呼叫的），
所以它**不在可達集合裡**，`vue-tsc` 與那份 TS 5.x 也就不該進帳目。

判準不是「它是不是 devDependency」，是**演練會不會跑到它**。
哪天 `apps/console` 真的依賴了這支工具，帳目那道檢查會自己說話。

## 開發

```bash
./node_modules/.bin/vp -C tools/vue-typecheck test
```

反向測試會把 `tests/fixtures/app` 複製一份、當場改壞、跑完刪掉 ——
壞掉的 `.vue` 簽進 repo 會被別的閘門看到，然後這份 fixture 的維護成本
會變成「每加一道閘門就多開一個例外」。細節在 `tests/fixtures/README.md`。
