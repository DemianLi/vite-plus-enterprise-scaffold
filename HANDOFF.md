# 交接清單：程式碼做不到的部分

> 腳手架本身已完成（`vpr ready` exit 0）。這份清單收的是**只有組織能做的決定** ——
> 從 `DECISIONS.md` 的風險登記簿、C13、以及各處置章節收攏而來，按**誰要做**排列，
> 因為它是拿來一段一段交出去的。
>
> 每一項都附「拿什麼去談」：那些東西**都已經備好**，不需要再做技術工作。
> 最後更新：2026-08-15。

## 先看這張表

| #   | 對象         | 事項                                        | 不做的後果                            | 上線前必須？ |
| --- | ------------ | ------------------------------------------- | ------------------------------------- | ------------ |
| 1   | 採購／稽核   | 核准 beta **版本流**、供應商登記 Cloudflare | 元件不合規；修補 SLA 形同虛設         | ✅           |
| 2   | 資安         | 原生工具鏈的**政策性**例外（121 個二進位）  | SCA 判 fail，閘門過不了               | ✅           |
| 3   | 資安         | 接受 32 個只有發佈簽章的佐證                | 同上，且覆核時會被抓                  | ✅           |
| 4   | 法務         | MPL-2.0 與 22 個無授權欄位的套件            | 授權政策掃描標記，可能上線前才爆      | ✅           |
| 5   | 平台／IT     | 內部 registry 鏡像 **467 個**套件           | CI 直接爆                             | ✅           |
| 6   | 平台／IT     | registry 設在**機器層級**，不是專案         | 封閉網路下 `vp` 第一步就往公網連      | ✅           |
| 7   | 平台／IT     | 確認 `darwin-x64`／`win32-x64` 是否要支援   | 多存兩份，或那些機器裝不起來          | ⬜           |
| 8   | 架構         | 指派 D8 同源中間層由誰提供                  | 登入、CSRF、401／403 整條路徑沒有著落 | ✅           |
| 9   | 發版流程     | 「`--capture` 在公網側完成」寫進流程        | 封閉環境升相依時對著紅燈找不到原因    | ✅           |
| 10  | 資安         | SCA 掃描把 `bingo` 標為 dev-only            | 開發期工具被當成 runtime 相依計嚴重度 | ⬜           |
| 11  | 平台（CI）   | workflow 首次在 GitHub Actions 上跑         | bootstrap 與 SBOM 工具可能要調        | ✅           |
| 12  | repo 管理者  | GitHub 設定 `platform-codemod` 標籤自動核准 | codemod PR 卡在核准地獄               | ⬜           |
| 13  | 平台（上線） | CSP 由 report-only 切成 enforce             | CSP 只是記錄，不擋任何東西            | ✅           |

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

最後一次（2026-08-15）：退到上游 **Vite 8.2.1** 建置成功、上游 Vitest **86 個測試全過**、
**應用程式原始碼一字未改**、耗時 4 秒。證據在
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

| 事項                           | 範圍                                     | 說明                                                                                     |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| **MPL-2.0**                    | `lightningcss-*` 11 個                   | 檔案層級弱著作權。此處僅作**建置期工具**、產物不含其原始碼，但多數企業授權政策會標記出來 |
| **registry 上無 license 欄位** | `@yuku-parser`／`@yuku-codegen` 共 22 個 | 上層套件 `yuku-parser` 宣告 MIT、同一個 repo，但**工具刻意不代填**                       |

第二項刻意不自動推斷的理由：**從別的套件推斷授權等於代發佈者做法律聲明**。
要嘛請上游補 `license` 欄位，要嘛由法務書面認可，不要讓它悄悄變成 MIT。

清單在 `vpr sca-dossier` 的〈授權分佈〉一節。

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

**待確認**：四個目標平台裡，`linux-x64-gnu`（CI）與 `darwin-arm64`（開發機）有依據，
**`darwin-x64` 與 `win32-x64` 是假設**。確認後請一併改
`tools/supply-chain/src/inventory.ts` 的 `TARGETS`（閘門會驗兩個方向）。

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
**請寫進流程，別讓人在封閉環境裡對著紅燈找原因。**

---

## 10. 資安 — SCA 掃描範圍

`bingo`（產生器框架）由 `tools/slice-gen` 使用，屬**建置期／開發期**相依，
不進入任何交付產物。此分類**已由閘門斷言**：`apps`／`features`／`platform`
之下沒有任何 package 宣告 `bingo` 或 `@org/slice-gen`。

納入掃描範圍時請標為 **dev-only**，與 runtime 相依分開計算嚴重度。

---

## 11–13. 其餘待辦

**11 — CI workflow 從未在 GitHub Actions 上跑過。** YAML 語法已驗證、內部每一道指令
都在本機實際跑過，但本環境無法執行 Actions。第一次推上去時預期要調的兩處：

1. **bootstrap 步驟**在內部 registry 下需設 `npm_config_registry` 與 `NODE_EXTRA_CA_CERTS`
2. **SBOM／SCA 工具**目前用 Trivy。若貴組織用 Blackduck／Snyk，這兩步要換 ——
   交付稽核的必須是**稽核認可的那個工具**的輸出

**12 — `platform-codemod` 標籤自動核准**要在 GitHub repo 設定裡開。
沒有它，codemod 產生的機械性改動會卡在各團隊的 CODEOWNERS 核准上。

**13 — CSP 由 report-only 切成 enforce** 由 gateway 執行。目前 dev 已套用 report-only，
政策的單一事實來源在 [`@org/security-headers`](platform/security-headers)。
切換前請先看一段時間的 violation 報告。

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
