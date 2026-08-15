# @org/exit-drill

D2 那張「可替換驅動層」保單的兌現測試。這是 R1 的技術答案，也關掉 R9。

## R1 不是技術問題，但技術能改變它的性質

R1 是「`vite-plus@0.2.x` 是 beta，稽核／採購會不會放行」。程式碼決定不了這件事。
但它決定了你**拿什麼去談**：

> 沒有這支：「我們押注在一個 beta 工具鏈上，出事再說。」
>
> 有這支：「我們用 beta 工具鏈。退出路徑每季實測一次，最後一次是
> `evidence.json` 上的日期，耗時 17 秒，退到上游 Vite 8.2.1 可建置、98 個測試全過，
> 應用程式原始碼一字未改。」

第二種說法採購會接受，第一種不會 —— 差別不在風險大小，在於風險**是否被證明是有界的**。

D2 當初選「可替換的驅動層」，賭的就是這件事。而 R9 說得很直接：那張保單
**從未被兌現測試過**，所以它到目前為止只是一句話。現在不是了。

## 兩種模式

```bash
node tools/exit-drill/src/cli.ts          # 靜態：幾秒鐘、不連網、跑在每次 gate
```

驗**退出面有沒有擴大**：除了 `vite.config.ts` 與 `apps/*/vite.config.ts` 以外，
沒有任何原始碼 import `vite-plus` 或 `@voidzero-dev/*`。

這是**真的會腐化的那一半**。有人在切片裡 import 一個 vite-plus 的 helper，
退出成本就從「改兩個設定檔」變成「改幾十個檔案」，而且沒有人會發現 ——
直到真的要退出的那天。

```bash
vpr exit-drill                            # 完整：數分鐘、連網、每季一次
```

在 `os.tmpdir()` 開一個乾淨目錄，複製應用與各層原始碼，產生一份**不含 vite-plus**
的 Vite 設定，用 npm 裝上游 `vite` / `vitest`，實際 build 一次、跑一次測試，
然後把結果寫進 `evidence.json`。

## evidence.json 為什麼要進版控

一個沒有記錄「最後一次何時跑過」的演練不是控制措施，是一段程式碼。
`evidence.json` 進 git，跟 `surface.json` 一樣 —— **那份檔案就是拿給稽核看的東西**。

靜態模式會順便檢查它的新鮮度（上限 120 天）：

- 在 gate 與 **PR 上的 Tier 2**：過期只 warn，不擋。因為擋一個 PR 的理由是
  「日曆翻頁了」，那種閘門會被人繞過，然後連 warn 都不再有人看
- 在 **排程觸發**的 Tier 2：加 `--require-fresh`，過期就 fail。時間觸發的閘門才該管時間

> ⚠️ `tier2-security.yml` 靠 `if: github.event_name != 'pull_request'` 分這兩條路。
> **這個條件不能拿掉** —— 沒有它，`--require-fresh` 會套到每個 PR 上，
> 正好變成上面說要避免的那件事。
>
> 這也是「CI 不自動 push evidence.json」的代價，值得寫清楚：最壞情況是
> 10/1 跑完、次季 1/1 才再跑，中間 92 天，對上 120 天的有效期 ——
> 也就是 maintainer 有**約 28 天**的餘裕把演練產生的 `evidence.json` 開 PR 併回 main。
> 超過那個窗口，排程的 Tier 2 會開始 fail（PR 不受影響）。
>
> 換掉這個代價的方式是給 workflow 一個能寫 main 的 token，而那本身是一條
> 需要向資安解釋的攻擊路徑。這裡選擇留下 28 天的人工窗口。

## plugin 帳目：演練「重現了什麼」

`--full` **不是**拿 `apps/console/vite.config.ts` 去跑 —— 那份設定 `import` 了
vite-plus，而整場演練的重點就是不要它。演練會先刪掉它，再**重新產生**一份。

於是 plugin 清單變成寫死在這個 repo 裡的東西，而由此長出一個安靜的失敗模式：

> 有人加了一個會改變**建置產物**的 plugin（CSS 框架、圖片處理、i18n 訊息編譯、
> SVG 元件化⋯⋯），演練不知道它存在，於是產生一份沒有它的設定、
> 建置成功、exit 0、寫下 `result: "pass"`。
>
> **產物是錯的，而 `evidence.json` 說它是對的** —— 那份檔案正是拿去給稽核看的東西。
> 而這件事只有在真的要退出的那天才會被發現。

因此每個出現在退出面設定檔裡的 plugin 都必須登記在
[`src/plugins.ts`](src/plugins.ts) 的兩張表之一。判準只有一條：

**這個 plugin 會不會改變建置產物？**

| 表                | 意思                      | 演練的行為                                             |
| ----------------- | ------------------------- | ------------------------------------------------------ |
| `DRILL_PLUGINS`   | 會改變產物 → **必須重現** | 真的裝它、真的註冊它。import／呼叫／相依三處全由它推導 |
| `DROPPED_PLUGINS` | 不改變產物 → 明示丟掉     | 必須寫明「丟掉它為什麼不影響產物」                     |

沒登記的一律 exit 1。目前是重現 1 個（`vue`）、明示丟棄 2 個
（`securityHeaders` 只掛 dev server 中介層、`assertStaticCspCompatible` 是檢查
而非轉換 —— 兩個都不改產物一個位元組）。

> 這條規則**今天不痛是巧合，不是設計**。加 plugin 的那天它才會擋人，
> 而那正是它該擋人的時候。兩張表都在原始碼裡，因此都要走 PR。

## 演練涵蓋什麼、不涵蓋什麼

**涵蓋**：`apps/console` 用上游 Vite 建置成功；`platform/*` 與 `features/*` 的
全部測試用上游 Vitest 通過。也就是**應用程式原始碼與工具鏈無關**這個具體主張。

**不涵蓋**：oxlint／oxfmt／tsgolint 的替代品（那是 `vp check`，退出時要換成
ESLint＋Prettier＋tsc，是已知的工作量，不是未知的風險）、monorepo 任務快取、
`vp create`。這些都是**開發期**的東西 —— 退出時損失的是速度與便利，不是可交付性。

這個界線是刻意的。演練要證明的是「產品出得去」，不是「什麼都不會變」。
一場宣稱涵蓋一切的演練，最後會因為維護成本太高而沒有人跑。

## 第一次跑就絆倒的那件事

`@org/tsconfig`。所有 package 的 `tsconfig.json` 都 `extends "@org/tsconfig/*.json"`，
而暫存目錄裡沒有它 —— 八個測試檔全部 `TSCONFIG_ERROR`。

修法是把那個 package 一併複製過去。這**不弱化**論證：它是四份純 JSON，
唯一與工具鏈沾邊的是 `types: ["vite/client"]`，而上游 vite 同樣提供該型別。

留下這段紀錄是因為它就是演練的用途 —— 把「理論上可以退出」變成一份**實際的步驟清單**。
沒跑過的話，這一步不會有人想到。

## 為什麼 npm 跑在專案目錄之外

本 repo 的 `devEngines.packageManager` 指定 pnpm，npm 在專案目錄裡會直接以
`EBADDEVENGINES` 中止（實測，見 `DECISIONS.md` 的 C8）。所以工作目錄開在
`os.tmpdir()`，而不是 repo 底下的暫存資料夾。
