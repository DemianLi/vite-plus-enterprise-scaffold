# 交接清單：程式碼做不到的部分

> 腳手架本身已完成（`vpr ready` exit 0）。這份清單收的是**只有組織能做的決定** ——
> 從 `DECISIONS.md` 的風險登記簿、C13、以及各處置章節收攏而來，按**誰要做**排列，
> 因為它是拿來一段一段交出去的。
>
> 每一項都附「拿什麼去談」：那些東西**都已經備好**，不需要再做技術工作。
> 最後更新：2026-08-15。
>
> **14 項裡有 5 項已由技術面處理掉或降級**（4／7／9／12／14）—— 那幾項原本被歸成
> 「組織的事」，但其中有一半是技術能做的：把事實查到底、把成本量化、
> 讓工具在失敗當下自己講清楚。剩下的 9 項是真正只有人能裁決的。
>
> 第 14 項（樣式策略）當天新增、當天決策完畢（D15）——
> 它不是被降級的，是**從來沒有被提出過**。剩下的只有一格 CODEOWNERS 指派。

## 先看這張表

| #   | 對象         | 事項                                                   | 不做的後果                                            | 上線前必須？ |
| --- | ------------ | ------------------------------------------------------ | ----------------------------------------------------- | ------------ |
| 1   | 採購／稽核   | 核准 beta **版本流**、供應商登記 Cloudflare            | 元件不合規；修補 SLA 形同虛設                         | ✅           |
| 2   | 資安         | 原生工具鏈的**政策性**例外（121 個二進位）             | SCA 判 fail，閘門過不了                               | ✅           |
| 3   | 資安         | 接受 32 個只有發佈簽章的佐證                           | 同上，且覆核時會被抓                                  | ✅           |
| 4   | 法務         | MPL-2.0 ＋ 22 個**完全無授權聲明**的套件               | 授權政策掃描標記，可能上線前才爆                      | ✅           |
| 5   | 平台／IT     | 內部 registry 鏡像 **467 個**套件                      | CI 直接爆                                             | ✅           |
| 6   | 平台／IT     | registry 設在**機器層級**，不是專案                    | 封閉網路下 `vp` 第一步就往公網連                      | ✅           |
| 7   | 平台／IT     | 確認 `darwin-x64`／`win32-x64` 是否要支援              | 多存兩份，或那些機器裝不起來                          | ⬜           |
| 8   | 架構         | 指派 D8 同源中間層由誰提供                             | 登入、CSRF、401／403 整條路徑沒有著落                 | ✅           |
| 9   | 發版流程     | 「`--capture` 在公網側完成」寫進流程                   | ~~對著紅燈找不到原因~~ 閘門現在會自己講，但流程仍該寫 | ⬜           |
| 10  | 資安         | SCA 掃描把 `bingo` 標為 dev-only                       | 開發期工具被當成 runtime 相依計嚴重度                 | ⬜           |
| 11  | 平台（CI）   | 內部 registry 下的 bootstrap ＋ SBOM 工具              | 私有網路下抓不到相依；SBOM 非稽核認可                 | ✅           |
| 12  | repo 管理者  | 自動核准要不要開（標籤已建）**安全決定**               | 開錯會讓 CODEOWNERS 整套失效                          | ⬜           |
| 13  | 平台（上線） | CSP 由 report-only 切成 enforce                        | CSP 只是記錄，不擋任何東西                            | ✅           |
| 14  | 架構／設計   | ~~樣式策略選型~~ **已決策（D15）**，剩 CODEOWNERS 指派 | 元件庫沒有負責人，破壞性變更沒人擋                    | ⬜           |

---

## 1. 採購／稽核 — beta 版本流的事先核准

**要決定的**

- 核准的對象是**版本流**（`vite-plus@0.2.x`），**不是逐版**。
  0.2.5→0.2.9 共 4 版、26 天，約 5–14 天一版。逐版核准會讓 D13 的
  **critical 3 天修補 SLA 一開始就是死的**
- 供應商紀錄登記 **Cloudflare**，不是 VoidZero（2026-06-04 併購）

**拿什麼去談**

授權疑慮已解除：`vite-plus`、core、8 個原生二進位的 `license` 欄位實測皆為 MIT。
但 **MIT 意味著無擔保、無支援義務**，官方文件沒有任何 SLA。所以緩解措施只能自己持有——
而它已經存在：

```bash
./node_modules/.bin/vpr exit-drill    # 每季一次，證據進版控
```

最後一次（2026-08-15）：退到上游 **Vite 8.2.1** 建置成功、上游 Vitest **108 個測試全過**、
**應用程式原始碼一字未改**、耗時 5 秒。證據在
[`tools/exit-drill/evidence.json`](tools/exit-drill/evidence.json)。

> 說法的差別：不是「我們押注在 beta 上，出事再說」，
> 而是「退出路徑每季實測，最後一次是 evidence.json 上的日期」。
> 第二種採購會接受 —— 差別不在風險大小，在於風險**是否被證明是有界的**。

---

## 2–3. 資安 — 原生二進位的 SCA 例外

**要決定的**

- 核准 **121 個平台原生二進位、11 個家族**的例外。建議按**政策**核准
  （「原生編譯的工具鏈套件」），不是逐廠商 —— 因為 `@typescript`（TypeScript 7 自己）
  與 `lightningcss` **都不是 vite-plus 帶來的**，是整個前端工具鏈原生化的結果
- 接受佐證**分兩級**：89 個有 SLSA provenance（可回推到來源 repo 的確切 commit），
  32 個只有 npm 發佈簽章（可驗發佈者，無法回推建置來源）

**拿什麼去談**

```bash
./node_modules/.bin/vpr sca-dossier
```

申請書全部由 `pnpm-lock.yaml` 推導，**不要手改**。內容含逐家族明細、佐證等級、
授權分佈、容量，以及四項**由閘門實際斷言**（非宣稱）的補償控制：

- 467 個套件全帶 sha512 integrity，CI 以 `--frozen-lockfile` 安裝
- `allowBuilds` 內沒有任何原生套件 → 那 121 個在安裝時不執行任何腳本
- lockfile 的 digest 與擷取當下一致，每次 gate 比對
- 家族清單進版控，新家族出現時閘門擋下並要求人工分類

> ⚠️ 32 個沒有 provenance 的那批含**全部 20 個 `@typescript/typescript-*`**。
> 若沿用舊說法「證據是 SLSA provenance」，覆核抽驗 TypeScript 時會當場破功。

---

## 4. 法務 — 兩件授權問題

| 事項                 | 範圍                                     | 說明                                                                                     |
| -------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| **MPL-2.0**          | `lightningcss-*` 11 個                   | 檔案層級弱著作權。此處僅作**建置期工具**、產物不含其原始碼，但多數企業授權政策會標記出來 |
| **完全沒有授權聲明** | `@yuku-parser`／`@yuku-codegen` 共 22 個 | 見下方查證結果 —— 比「registry 上沒填」更嚴重                                            |

#### `@yuku-*` 的實際情況（2026-08-15 逐一查證，不是推測）

拆開 `@yuku-parser/binding-linux-x64-gnu@0.5.48` 的 tarball，裡面**只有兩個檔案**：

```
package/package.json      321 B   ← 沒有 license 欄位
package/yuku-parser.node  3.8 MB  ← 原生二進位
```

**沒有 LICENSE 檔。** 而且上層套件 `yuku-parser@0.5.48` 的 tarball 同樣**沒有 LICENSE 檔**
（只有 package.json／README.md／binding.js／decode.js／index.d.ts／index.js／walk.js），
它僅在 package.json 的 metadata 字串宣告 `MIT`。

所以要向法務問的問題是明確的，不是「請確認一下」：

> 22 個原生二進位（每個約 4 MB）進入我們的建置環境，**發佈的成品裡沒有任何授權文字**。
> 唯一的授權宣告是母套件 metadata 的一個字串。這樣可以接受嗎？
> 還是要求上游（`github.com/yuku-toolchain/yuku`）在 binding 套件補上 `license` 欄位與 LICENSE 檔？

順帶一提，這 22 個是 `@voidzero-dev/vite-plus-core` 拉進來的（Zig 寫的 JS/TS parser），
**不是我們直接選用的相依** —— 換句話說這是 vite-plus 的供應鏈帶進來的問題。

工具刻意**不**從母套件推斷授權填進申請書：**從別的套件推斷授權等於代發佈者做法律聲明。**

清單在 `vpr sca-dossier` 的〈授權分佈〉一節（記為 `UNKNOWN`，22 個）。

---

## 5–7. 平台／IT — 內部 registry 與封閉網路

**要做的**

```bash
./node_modules/.bin/vpr mirror-manifest   # 467 筆，含 sha512，可直接餵給鏡像工具
./node_modules/.bin/vpr airgap            # 前置條件、平台矩陣、驗收方式
```

三個容易踩的點：

**① 鏡像清單不能照著安裝結果列。** `pnpm` 只裝符合當下平台的 optional dependency，
所以照 `node_modules` 或 lockfile 的 `snapshots:` 區產出的清單，
**必然只涵蓋產清單那台機器的平台** —— 那正是「mac 裝得起來、CI 的 linux-x64-gnu 直接爆」。
`vpr mirror-manifest` 讀的是 `packages:` 區（全平台中繼資料）。

**② 有一批不在專案的相依樹裡。** `pnpm`、`@pnpm/exe` 與 7 個平台變體、`@reflink`、
`detect-libc` 共 **19 個**，住在 `pnpm-lock.yaml` 的**第一份 YAML 文件**。
它們是 `vp` 為了啟動自己而取得的。漏掉的症狀不是某個套件裝不起來，
是 **`vp` 連跑都跑不起來**。

**③ registry 一定要設在機器／映像檔層級。** 實測四種設法：

| 設法                               | 涵蓋 `vp` 下載 pnpm？       |
| ---------------------------------- | --------------------------- |
| 專案 `.npmrc` 的 `registry=`       | ❌ **否**                   |
| 全域 `~/.npmrc` 的 `registry=`     | ✅ 是                       |
| `npm_config_registry` 環境變數     | ✅ 是（CI 用這個）          |
| `devEngines.packageManager.onFail` | ❌ **否**（不是下載的開關） |

第一列會製造一種很難察覺的假象：專案相依確實走了內部 mirror，於是全隊都相信
封閉網路沒問題 —— 但 `vp` 的第一步仍在往公網連，要到真的斷網那天才會發現。

**容量**：原生二進位部分 tarball 合計 **856 MB**（mirror 要存的），
解壓後 **2341 MB**（開發機與 CI 的 `node_modules` 佔的）。

**驗收**（在真的連不到公網的機器上，用乾淨的 HOME）：

```bash
HOME=$(mktemp -d) npm_config_registry=https://<內部位址>/ vp install --frozen-lockfile
```

乾淨的 HOME 是重點 —— 開發機上的 pnpm 快取會讓這個測試假性通過。

**待確認，而且現在有價目了**：四個目標平台裡，`linux-x64-gnu`（CI）與 `darwin-arm64`（開發機）
有依據，**`darwin-x64` 與 `win32-x64` 是假設**。`vpr airgap` 的〈要鏡像到哪些平台〉
現在會列出每個平台各要多存多少 —— 例如 `darwin-x64` 是 10 個套件、49 MB。

這樣「要不要支援 Intel Mac」就變成一個帶價目的決定，而不是憑印象回答的問題。
確認後請一併改 `tools/supply-chain/src/inventory.ts` 的 `TARGETS`（閘門會驗兩個方向）。

---

## 8. 架構 — D8 同源中間層由誰提供

**要決定的**：那一層掛在哪、由誰維運。腳手架不提供它 —— 它是組織既有的 gateway。

**已經備好的**：它必須做到什麼（13 條可執行契約），以及怎麼證明做到了。

```bash
# 已經有 gateway：
BFF_ORIGIN=https://gateway.internal ./node_modules/.bin/vpr bff-check
# 全綠 = R6 關閉，不需要新程式碼

# 還沒有：照 platform/bff-contract 的規格蓋，platform/bff-mock 是已通過它的參考實作
```

**好消息是它比原本想的便宜一個量級**：建置產物**零個 inline script**，
所以 **CSP 不需要 nonce**。不需要 nonce 就不需要逐次請求改寫 HTML 的中間層 ——
組織端的要求從「準備一個會改寫 HTML 的東西」降到「多送幾個回應標頭」。
這個前提由 `assertStaticCspCompatible()` 在每次建置守著。

**誠實的限制**：`POST /api/session` 在真實環境是 OIDC 授權碼流程的終點，無法自動走完。
驗收時屬性面（HttpOnly／Secure／SameSite／Path）用 `BFF_SET_COOKIE_FILE` 貼上
gateway 實際回的 `Set-Cookie`，行為面用 `BFF_SESSION_VALUE` 帶一組真實 session。

---

## 9. 發版流程 — 一條硬性限制要寫進去

> **封閉環境裡無法就地升相依。**
> 改 `pnpm-lock.yaml` 與跑 `vpr supply-chain --capture` 必須在**還連得到公網的那一側**
> 做完，兩份檔案一起隨變更進到封閉環境。

原因：供應鏈閘門在 `provenance.json` 與 lockfile 對不上時直接失敗，
而重新擷取需要 `registry.npmjs.org`。

這是設計的結果不是缺陷 —— 反過來讓閘門自己連公網補資料，它就會在最需要它的環境裡失效。

**閘門現在會在紅燈當下自己講完這段**（2026-08-15 補）。原本它只說「跑 --capture
（需連得到 registry.npmjs.org）」，而在封閉網路裡看到那行的人會去跑一個永遠不可能
成功的指令，然後懷疑是網路設定壞了。現在三條失敗路徑都會附上「這件事不能在這裡做」。

**但流程文件仍該寫。** 錯誤訊息教的是「現在該怎麼辦」，流程要回答的是
「誰在什麼時候做、產出的兩個檔案怎麼一起進來」—— 那是工具講不了的。

---

## 10. 資安 — SCA 掃描範圍

`bingo`（產生器框架）由 `tools/slice-gen` 使用，屬**建置期／開發期**相依，
不進入任何交付產物。此分類**已由閘門斷言**：`apps`／`features`／`platform`
之下沒有任何 package 宣告 `bingo` 或 `@org/slice-gen`。

納入掃描範圍時請標為 **dev-only**，與 runtime 相依分開計算嚴重度。

---

## 11–13. 其餘待辦

**11 — CI 已在 GitHub Actions 上實跑過了**（2026-08-15，公開 repo）。
Tier 1 一次就綠；Tier 2 首跑紅，抓到三個本機看不到的問題，**都已修掉**
（根 `package.json` 漏宣告 `vitest`、`if: always()` 涵蓋範圍過大、
一個過時且寫著錯誤數字的 provenance 步驟）—— 詳見 `DECISIONS.md` 的 C32。

**剩下兩處仍需貴組織的環境才驗得了**：

1. **bootstrap 步驟**在內部 registry 下需設 `npm_config_registry` 與 `NODE_EXTRA_CA_CERTS`
   （公網環境驗不出來，因為它預設就通）
2. **SBOM／SCA 工具**目前用 Trivy。若貴組織用 Blackduck／Snyk，這兩步要換 ——
   交付稽核的必須是**稽核認可的那個工具**的輸出。
   **換工具時務必先驗這兩件事**（Trivy 兩件都中了，見 C33／C34）：

   | 要驗什麼                              | Trivy 的情況                           |
   | ------------------------------------- | -------------------------------------- |
   | 會不會把 dev 相依整批抑制掉？         | **會**。預設抑制 → SBOM 0 個 component |
   | 讀不讀得到多文件的 `pnpm-lock.yaml`？ | **讀不到**。只解第一份 → 只看到 19 個  |

   驗法不必靠人記得：閘門裡的 `vpr supply-chain --verify-sbom` 會比對
   SBOM 的 component 數與 lockfile 的套件數，任一種失明都會變紅。
   **換工具時保留這道檢查，比換對工具更重要。**

**12 — `platform-codemod` 標籤已建好**（2026-08-15）。剩下的是**自動核准要不要開、怎麼開**，
而那是一個**放寬 review 的安全決定**，不該由實作者單方面做。

要決定的是這件事：

> GitHub 的 **triage** 權限就能貼標籤。所以「貼上 `platform-codemod` 就自動核准」
> 等於**任何有 triage 權限的人都能繞過 CODEOWNERS**，包含繞過 `@org/security`
> 共同持有的那幾條路徑（`eslint.config.js`、`.npmrc`、`.github/workflows/`、
> `platform/security-headers/`、`tools/supply-chain/`）。

三個選項，成本與風險差很多：

| 做法                                       | 風險                                           |
| ------------------------------------------ | ---------------------------------------------- |
| 直接自動核准帶標籤的 PR                    | **等同把 CODEOWNERS 變成建議**。不建議         |
| 自動核准，但**排除資安共管的路徑**         | 可接受。需要在 workflow 裡維護一份路徑排除清單 |
| 不自動核准，改成把標籤當**優先審查的訊號** | 零風險，但沒解決核准地獄                       |

若選第二種，workflow 還必須確認**貼標籤的人不是 PR 作者**，否則作者自己貼自己過。

**這一項我刻意沒有實作**：它不是技術難題，是「要放寬多少 review」的組織決定，
而錯誤的版本會安靜地讓前面所有 CODEOWNERS 設計失效。

**13 — CSP 由 report-only 切成 enforce** 由 gateway 執行。目前 dev 已套用 report-only，
政策的單一事實來源在 [`@org/security-headers`](platform/security-headers)。
切換前請先看一段時間的 violation 報告。

---

## 14. 架構／設計 — 樣式策略 ✅ 已決策（2026-08-15）

**決策：shadcn-vue（reka-ui ＋ Tailwind v4），元件原始碼住 `platform/ui`。**
完整理由見 [`DECISIONS.md`](DECISIONS.md) 的 **D15**，市調見
[`UI-SURVEY.md`](UI-SURVEY.md)，可重跑的工具在 [`tools/ui-survey`](tools/ui-survey)。

```bash
node tools/ui-survey/src/cli.ts --registry   # 授權與維護狀態
node tools/ui-survey/src/cli.ts --csp        # 執行期 <style> 注入探測
node tools/ui-survey/src/cli.ts --sca        # 供應鏈增量
```

### 仍然要人決定的一格

**`platform/ui` 的 CODEOWNERS 由誰擔任。**

它會是**唯一一個所有切片都依賴的 UI package**，所以它的 owner 等於
「誰有權改變全公司產品的長相」。這不是技術問題。

建議：與 `platform/` 其餘套件同一組（`@org/platform-maintainers`），
或另設一個設計系統小組。兩種都可以，但**不能沒有** ——
沒有 owner 的 platform 套件會讓 api-surface 的破壞性變更閘門沒有人回應。

### 實作待辦 ✅ 已完成（2026-08-15，見 C38）

| #   | 事項                                     | 狀態                                                                                  |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | `@tailwindcss/vite` 加進 `DRILL_PLUGINS` | ✅ 已登記，並補上**產物比對**（反向測試：拿掉 @source → 37%，紅）                     |
| 2   | 重跑 `vpr supply-chain --capture`        | ✅ 519 套件／144 原生／12 家族。新家族 `@tailwindcss` 已分類為 toolchain              |
| 3   | 新增 `platform/ui` package               | ✅ CODEOWNERS（暫掛）、api-surface（9 進入點／65 export）、退出演練 alias 都已接上    |
| 4   | 擋住「切片自己拼一套設計系統」           | ✅ 擋的是 **import 而非目錄**（理由見契約）；另加全 repo 禁用 reka-ui Splitter（CSP） |
| 5   | 瀏覽器實測 CSP                           | ⬜ **仍未做** —— 探測掃的是已發佈的 dist，證明「有這個能力」，不證明執行期會發生      |

### 會連動到本清單其他項的兩件事

- **第 4 項（法務）範圍會變大**：MPL-2.0 從「`lightningcss-*` 11 個」
  變成**兩個版本各一組**。`@tailwindcss/node` 釘死 exact `1.32.0`，
  而 `vite-plus-core` 要 `^1.33.0` —— 範圍不相交，無法合併。
- **第 5／6 項（封閉網路）**：新套件必須在**連得到公網那一側**跑
  `--capture` 再一起送進來。閘門刻意不自己連公網補資料。

### 為什麼沒有選比較便宜的那條

element-plus 只要 +21 套件、0 原生二進位、0 授權旗標，CSP 也已驗證零風險。
選了比較貴的一條，是因為成本花在**可以攤提的地方**：元件原始碼在自己手上。
完整的三方比較留在 `UI-SURVEY.md`，包含被淘汰者的理由 ——
其中 **PrimeVue 已於 2026-06-28 改為商業授權**，而市面上的比較文章
到今天仍然把它列為企業首選。

---

## 拿去給誰、跑哪一行

| 對象          | 指令                             | 產出                                   |
| ------------- | -------------------------------- | -------------------------------------- |
| 資安          | `vpr sca-dossier`                | SCA 例外申請書（含補償控制與佐證分級） |
| 法務          | `vpr sca-dossier`                | 同上的〈授權分佈〉一節                 |
| 平台／IT      | `vpr mirror-manifest`            | 467 筆鏡像清單，含 sha512              |
| 平台／IT      | `vpr airgap`                     | 封閉網路前置條件、平台矩陣、驗收方式   |
| 稽核          | `tools/exit-drill/evidence.json` | 退出演練證據（進版控）                 |
| 架構／gateway | `vpr bff-check`                  | D8 中間層的 13 條驗收條目              |

前四項都是**產生**的，不是寫的 —— 這份 repo 在同一個地方犯過五次錯
（人抄下來的數字沒有人再推導一次），所以給外部團隊的數字一律由機器算。
細節見 `DECISIONS.md` 的 C17／C24／C25／C27／C31。
