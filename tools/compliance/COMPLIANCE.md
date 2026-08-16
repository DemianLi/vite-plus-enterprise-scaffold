# 法遵對照表

> **這份檔案是產生的，不要手改。** 事實來源是 `tools/compliance/src/map.ts`，
> 改完跑 `node tools/compliance/src/cli.ts --update`。
> 閘門每次都會比對它與映射是否一致 —— 手改會在下一次 CI 被打回。

對照的規範：**數位經濟相關產業個人資料檔案安全維護管理辦法（數位發展部）**

個資法 §20-1 已於民國 114 年 11 月 11 日公布，但施行日期由行政院定之而至今未定；
其授權的《個人資料檔案安全維護管理辦法》仍是 115 年 1 月 22 日的預告草案。
未生效的部分列在最後一節，不與現行義務混在一起。

## 一眼看完

- 腳手架欠、而且**完全沒有東西在守**的條號：**0**
- 存在但**沒有證明過自己會紅**的閘門：**5 / 17**
- 對不到任何條號的閘門：**3**（不是違規，見下方說明）

## 條號 → 閘門

「覆蓋」與「證明」是**兩件獨立的事**：前者問「這條被守到多少」，
後者問「守它的東西證明過自己會紅嗎」。合成一欄就會產生假的一列 ——
§12 III 正是樣本：閘門有、閘門也證明過會紅、而法條仍然沒被滿足。

| 條號     | 要求                                                               | 責任落點       | 守它的閘門                                                               | 覆蓋 | 證明過會紅 |
| -------- | ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------ | ---- | ---------- |
| §11 I    | 個資之蒐集處理利用應採適當加密，備份與傳輸各採適當保護             | 前端           | bff-check                                                                | 部分 | ✅ 已證明  |
| §11 II ① | 防火牆與入侵偵測設備之建置與更新                                   | 後端／基礎設施 | —                                                                        | 無   | — 不在範圍 |
| §11 II ② | 異常存取行為之監控與演練機制                                       | 後端／基礎設施 | —                                                                        | 無   | — 不在範圍 |
| §11 II ③ | 定期檢測並因應系統漏洞所造成之威脅                                 | 前端           | trivy-sca ⚠️、trivy-sbom、supply-chain ⚠️、dependency-health、renovate ▷ | 部分 | ◐ 部分     |
| §11 II ④ | 防毒軟體與惡意程式檢測                                             | 後端／基礎設施 | —                                                                        | 無   | — 不在範圍 |
| §11 II ⑤ | 認證機制與密碼複雜度設定                                           | 前端           | bff-check                                                                | 部分 | ✅ 已證明  |
| §11 II ⑥ | 測試環境應避免使用真實個人資料                                     | 前端           | pii-test-data                                                            | 部分 | ✅ 已證明  |
| §11 II ⑦ | 確保系統變更之安全性                                               | 前端           | conformance、api-surface、eslint-security ⚠️、sast、csp-verify           | 完整 | ◐ 部分     |
| §11 II ⑧ | 定期檢視系統之使用狀況                                             | 流程／營運     | —                                                                        | 無   | — 不在範圍 |
| §11 II ⑨ | 隱碼機制，隱藏個人資料之呈現                                       | 前端           | pii-masking                                                              | 部分 | ✅ 已證明  |
| §12 III  | 設定人員接觸個資之權限，並定期檢視其適當性及必要性                 | 流程／營運     | conformance                                                              | 部分 | ✅ 已證明  |
| §15      | 訂定安全稽核機制，定期檢查執行狀況並製作評估報告                   | 流程／營運     | compliance                                                               | 部分 | ✅ 已證明  |
| §16      | 個資處理紀錄、機器軌跡資料、安全維護計畫執行證據，保存五年         | 流程／營運     | evidence-manifest                                                        | 部分 | ✅ 已證明  |
| §18      | 資本額達一千萬元或個資達五千筆者，每十二個月至少實施及檢討改善一次 | 流程／營運     | compliance                                                               | 部分 | ✅ 已證明  |
| §8 II    | 危及正常營運或大量當事人權益之事故，七十二小時內通報               | 流程／營運     | —                                                                        | 無   | — 不在範圍 |

### 逐條註記

- **§11 I** 前端只負責傳輸面：HSTS 與 Secure cookie 由 @org/security-headers 與 D8 契約守。靜態加密是 gateway 與資料庫的事。⚠️ csp-verify 刻意不列在這裡 —— CSP 不是加密，把它掛到這條會讓覆蓋看起來比實際好。（1／1 道閘門證明過會紅）
- **§11 II ①** 基礎設施。腳手架不提供，也不該假裝提供。
- **§11 II ②** 同上。前端無從觀測。
- **§11 II ③** 這一條有兩半：**檢測**由 Trivy 做（每日 21:00 UTC 排程 —— 沒有它，三個月沒人動的專案就三個月沒掃過），**因應**由 Renovate 提出（D13 的 critical 3 天／high 14 天 SLA 要有人真的去升，才是 SLA）。⚠️ 仍只涵蓋**相依套件**：自己寫的程式碼沒有 SAST，而 eslint 的安全規則不是漏洞掃描器。（2／4 道閘門證明過會紅）
- **§11 II ④** 端點與伺服器。
- **§11 II ⑤** 契約守的是 cookie 屬性、CSRF 與 401／403 路徑。密碼複雜度在 OIDC provider，腳手架驗不到 —— 那是 HANDOFF #8 交給 gateway 的部分。（1／1 道閘門證明過會紅）
- **§11 II ⑥** 掃 tests/、fixture、bff-mock 的示範資料與 i18n 訊息。⚠️ 覆蓋是 **partial 而非 full，而且補不滿**：抓得到有校驗碼的識別碼，抓不到姓名與地址 —— 那不是實作缺口，是這類資料沒有可判定的性質。標成 full 就是重演 ⑦ 那個高估。（1／1 道閘門證明過會紅）
- **§11 II ⑦** 治理面（切片邊界、platform API 表面）、程式碼面（XSS、eval）與執行期（CSP enforce 實測）三層。⚠️ 覆蓋是滿的，欠的是**證明**。（4／5 道閘門證明過會紅）
- **§11 II ⑧** 營運面。屬於上線後的維運流程。
- **§11 II ⑨** 防的是客服與內部人員在日常作業畫面上看到完整個資，不是防使用者看自己的資料 —— 適用的正是 apps/console 這種東西。兩層：靜態層讀每一個 .vue 的模板，元件測試證明遮罩真的會遮（斷言的是**完整值在整份 HTML 裡不存在**，不是「遮罩後的字串有出現」—— 後者在沒有隱碼時也會過）。⚠️ 仍是 partial：它只守宣告過的欄位，而「哪些欄位算個資」是人填的。（1／1 道閘門證明過會紅）
- **§12 III** ⚠️ **這一列是「有閘門、閘門也會紅、法條仍然沒被滿足」的樣本。** conformance 守的是「CODEOWNERS 有條目」，法條要的是權限設定與定期檢視；而目前那 22 條全是 Unknown owner（HANDOFF #15）—— 存在不等於生效，本機看不出來，只有 GitHub 知道。（1／1 道閘門證明過會紅）
- **§15** 本表是那份「評估報告」機器可推導的那一半。人要做的另一半（每 12 個月看一次並簽名）還沒有任何機制承接。（1／1 道閘門證明過會紅）
- **§16** 條文要保存的有**三類**，而前兩類（個資的蒐集處理利用紀錄、自動化機器設備的軌跡資料）在資料庫、後端與基礎設施 —— 前端連摸都摸不到。只有第三類有交集，而交集的形狀是**產出物**不是政策。⚠️ 這一格原本寫著「腳手架欠一份保存期政策」，查完條文之後那句話是錯的 —— 誰歸檔、存哪、銷毀排程是組織文件。與 §11 II ⑦ 那次高估是同一個毛病的鏡像：一個把覆蓋說得太好，一個把責任攬得太多，而第二種還會讓人去做不該腳手架做的事。7 份證據進版控（git 歷史即保存），**唯一到不了五年的是 sbom.cdx.json** —— GitHub 的 artifact 上限 90 天，那是結構限制，兩條出路都是組織的決定。（1／1 道閘門證明過會紅）
- **§18** ⚠️ 門檻極低，中型 B2C 幾乎必然落入。目前沒有任何閘門帶 12 個月的 cadence。⚠️ exit-drill 的 120 天**刻意不列在這裡** —— 它檢討的是「退不退得回上游」，不是「安全維護計畫」。兩者都是每季，但掛上去會讓這條看起來已經有人在做。（1／1 道閘門證明過會紅）
- **§8 II** 流程，不是程式碼。屬於 HANDOFF 交給組織的部分。

## 閘門 → 證據

標 ▷ 的是**提案者**而不是閘門：它不擋任何東西，所以「反向測試」對它不適用，
上面那個 5／17 的分子與分母都不含它。

| 閘門                | 檢查什麼                                                                        | 進版控的證據                                | 反向測試                                         |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| `conformance`       | 切片契約、分層邊界、設計系統採用、擁有權（D4／D9／D12／D14／D15）               | **（無）**                                  | `tools/conformance/tests/negative.test.ts`       |
| `bff-check`         | D8 同源中間層的 15 條行為契約（cookie 屬性、CSRF、401／403）                    | **（無）**                                  | `tools/bff-check/tests/negative.test.ts`         |
| `api-surface`       | platform/ 公開 API 表面的破壞性變更（D12）                                      | `tools/api-surface/surface.json`            | `tools/api-surface/tests/negative.test.ts`       |
| `supply-chain`      | 相依盤點、原生家族分類、tarball digest 與 lockfile 綁定（R2–R5／R8）            | `tools/supply-chain/provenance.json`        | **❌ 無**                                        |
| `exit-drill`        | D2 退出面靜態檢查、plugin 帳目、演練證據新鮮度（120 天）                        | `tools/exit-drill/evidence.json`            | **❌ 無**                                        |
| `eslint-security`   | no-unsanitized、eslint-plugin-security、vue/no-v-html（D5 的安全那一半）        | **（無）**                                  | **❌ 無**                                        |
| `trivy-sca`         | 相依套件的 HIGH／CRITICAL 漏洞，PR ＋ 每日 21:00 UTC 排程                       | **（無）**                                  | **❌ 無**                                        |
| `trivy-sbom`        | CycloneDX SBOM 產出，並比對 component 數與 lockfile 套件數                      | **（無）**                                  | `tools/supply-chain/tests/sbom-negative.test.ts` |
| `gitleaks`          | 機密掃描，fetch-depth: 0 以涵蓋被後續 commit 蓋掉的機密                         | **（無）**                                  | **❌ 無**                                        |
| `csp-verify`        | 用正式 CSP（enforce）服務正式建置產物，實測 violation；CI 守實測結果的有效期    | `tools/csp-verify/evidence.json`            | `tools/csp-verify/tests/negative.test.ts`        |
| `pii-test-data`     | 測試資料裡不得有真實個資：身分證字號、Luhn 卡號、手機、指向真實網域的信箱       | **（無）**                                  | `tools/pii-check/tests/roster.test.ts`           |
| `pii-masking`       | 切片宣告為個資的欄位，在 .vue 的渲染運算式裡必須走 @org/pii 的 maskXxx()        | **（無）**                                  | `tools/pii-check/tests/masking.test.ts`          |
| `dependency-health` | 外部直接相依（24 個）的維護狀態與授權變更 —— 停更、或授權被偷偷改掉             | `tools/supply-chain/dependency-health.json` | `tools/supply-chain/tests/health.test.ts`        |
| `renovate` ▷        | 提出相依升級與安全修補 —— §11 II ③「檢測**並因應**」裡的因應那一半              | `renovate.json`                             | ▷ 不適用                                         |
| `doc-facts`         | README 與 HANDOFF 引用的數字，與 inventory.json／provenance.json 推導出來的一致 | **（無）**                                  | `tools/doc-facts/tests/facts.test.ts`            |
| `evidence-manifest` | §16 證據清單與現實一致：宣告的檔案都在，且每一份都有閘門在維護                  | **（無）**                                  | `tools/compliance/tests/evidence.test.ts`        |
| `sast`              | 源碼檢測：taint（路由參數流進 DOM sink）、執行期組程式碼、個資離開畫面          | **（無）**                                  | `tools/sast/tests/rules.test.ts`                 |
| `compliance`        | 本對照表本身：映射與檔案系統一致、且沒有列在說謊                                | `tools/compliance/COMPLIANCE.md`            | `tools/compliance/tests/negative.test.ts`        |

### 逐道註記

- **`conformance`** — `node tools/conformance/src/cli.ts`  
  17 條反向測試，破壞的是複製到暫存目錄的副本，repo 原始碼不被動到。
- **`bff-check`** — `./node_modules/.bin/vitest run --root tools/bff-check`  
  9 條反向測試，用改寫回應的 proxy 破壞行為而非程式碼，實作改寫法也不會失效。
- **`api-surface`** — `node tools/api-surface/src/cli.ts`  
  11 條反向測試。破壞的是**基準檔的副本**（`--baseline`），platform 的原始碼不用動 —— 對閘門而言「基準說有、現況沒有」與真的刪掉一個 export 完全等價。其中三條驗 codemod 這個合法出口沒有被繞過，也沒有被誤擋。
- **`supply-chain`** — `node tools/supply-chain/src/cli.ts`  
  46 條零件測試（parseLockfile／buildInventory），但沒有一條測「把 provenance 弄髒之後 CLI 會不會 exit 1」。
- **`exit-drill`** — `node tools/exit-drill/src/cli.ts`  
  39 條零件測試。證據新鮮度守衛的模式是對的，但守衛自己沒被證明過會紅。
- **`eslint-security`** — `./node_modules/.bin/eslint . --max-warnings=0`  
  存在的首要理由是 oxlint 沒有 vue/no-v-html —— Vue 專案最主要的 XSS 入口。
- **`trivy-sca`** — `aquasecurity/trivy-action（.github/workflows/tier2-security.yml）`  
  唯一直接對得上 §11 II ③ 的閘門。兩個已知失明模式（C33／C34）現在由 `trivy-sbom` 的 15 條反向測試守著，而**設定漂移**（少一行 TRIVY_INCLUDE_DEV_DEPS、拿掉 exit-code）也有測試釘住。⚠️ 但仍未證明「Trivy 發現 CVE 時 CI 會紅」—— 那需要一份帶已知 CVE 的 fixture，而那種 fixture 會在 CVE 被修掉的那天因為錯誤的理由變綠。這一格刻意留白。
- **`trivy-sbom`** — `node tools/supply-chain/src/cli.ts --verify-sbom sbom.cdx.json`  
  15 條反向測試，兩個已知失明模式各有一條：SBOM 0 個 component（C33）、只有 20 個（C34 只解第一份 YAML 文件）。⚠️ SBOM 仍只上傳為 artifact（保留 90 天）、沒有進版控 —— 而 §16 要的是 5 年。
- **`gitleaks`** — `gitleaks/gitleaks-action（.github/workflows/tier2-security.yml）`  
  第三方 action，反向測試要塞一個假機密進暫存 repo。
- **`csp-verify`** — `node tools/csp-verify/src/cli.ts --verify`  
  CSP 只有真的瀏覽器驗得了（happy-dom 與 jsdom 都沒實作 CSP），所以人跑一次、機器守有效期 —— 形狀比照 exit-drill。失效條件是**指紋**（CSP 政策字串 ＋ `FINGERPRINT_PACKAGES` 列的那些會注入執行期 <style>／script 的相依版本），不是日曆：日曆過期每季紅一次而通常什麼都沒變，那種紅燈會被關掉。`--verify` 會從原始觀測重算探針結論，手改 `passed` 不放行。⚠️ 瀏覽器自己改版時指紋不會動 —— 證據檔記錄驗證當時的瀏覽器，但刻意不守它（Chromium 每四週一版）。
- **`pii-test-data`** — `node tools/pii-check/src/cli.ts`  
  只抓**有校驗規則**的識別碼 —— 亂打的字串幾乎不可能通過校驗，所以誤報率天生就低。⚠️ **姓名抓不到**：「林佳蓉」與一個真的客戶的名字在字面上沒有任何差別，任何宣稱抓得到的實作都是在猜。所以 ⑥ 的覆蓋是 partial。第一版收信箱時沒限定頂級網域是字母，於是把 `fsevents@2.3.3` 這種 npm 套件規格當成信箱，一次報 45 條 —— 那種閘門第一天就會被關掉。
- **`pii-masking`** — `node tools/pii-check/src/cli.ts --masking`  
  宣告住在切片契約的 `personalData`，而且是**必填**的 —— 空陣列是一個答案，沒寫則代表沒有人想過這件事，兩者必須長得不一樣。只讀字面陣列、不執行切片程式碼：一道法遵閘門不該執行被它稽核的東西，否則宣告可以是算出來的，review 就看不出這個切片碰了哪些個資。⚠️ 這是靜態層，它證明原始碼裡寫了 mask，不證明遮罩真的會遮 —— 後者由 features/*/tests 的元件測試證明（與 csp-verify 的兩層分工相同）。
- **`dependency-health`** — `node tools/supply-chain/src/cli.ts（擷取：--capture-health）`  
  判定函式原本住在 UI 選型市調裡，掃的是五個早已選完的候選 —— 能力是對的（PrimeVue 的商業授權就是被它抓到的），目標是錯的。重新瞄準到實際安裝的相依之後，第一次跑就標出 clsx（兩年沒發版，已寫下理由接受）。
- **`renovate`** — `Mend Renovate App（設定：renovate.json）`  
  在它之前，整個腳手架能在升級**之後**告訴你什麼壞了，卻沒有一個東西會說「該升了」。⚠️ 它不擋任何東西，所以「證明過會紅」對它不適用（見 GateKind）。安全邊界在 `--recapture-safe`：升級 PR 造成的不同步可自動重擷，但 integrity-changed 一律拒絕 —— 那是事故不是升級。
- **`doc-facts`** — `node tools/doc-facts/src/cli.ts`  
  第一次跑就抓到 10 處過期，包括 README 那句「這些數字**全部由 pnpm-lock.yaml 推導**，不是抄的」—— 它們正是抄的。⚠️ 刻意**不守 DECISIONS.md**：那是有日期的決策日誌，「C24 當時是 467 個套件」陳述的是歷史，守它等於要求回頭改寫歷史。登記的是**整句樣式**而不是「任何 N 個 X」，因為 HANDOFF 裡的 8／22 個原生二進位是子集不是總數 —— 句子被改寫會變成 never-cited 的紅燈，失敗方向是安全的。
- **`evidence-manifest`** — `node tools/compliance/src/cli.ts --evidence`  
  它產出的是**交接用的那張表**，不是保存期政策 —— 後者是組織文件。雙向驗：宣告了但檔案不在（清單指向空氣，對方以為有東西可歸檔）、閘門有證據檔但清單沒收（漏一份而沒有人會發現）。第一次跑就抓到對照表**低估**了自己：supply-chain 實際維護兩份基線，而 Gate.evidence 只記得住一份。
- **`sast`** — `semgrep scan --config .semgrep（規則同步：node tools/sast/src/cli.ts）`  
  ⚠️ **這不是要交給稽核的那份 SAST 報告** —— 源碼檢測與弱點掃描由專業廠商執行。這裡是開發當下的守衛，目的是讓廠商報告上少幾條。與 oxlint／ESLint 零重疊：lint 看單一節點，這裡只放 taint（跨函式的資料流）與「哪些欄位是個資」—— 後者的知識只存在於 Feature.personalData，通用掃描器不會知道，所以那條規則是**產生**的。規則會不會命中由 `semgrep --test` 對 fixture 的 ruleid:／ok: 標記驗證（Tier 2）；本地測試驗的是結構，最重要的一條是**每條規則都必須有 fixture**，否則 --test 什麼都不驗而回綠。⚠️ semgrep 是 Python 工具，不在 pnpm-lock.yaml 裡 —— tools/supply-chain 看不到它。
- **`compliance`** — `node tools/compliance/src/cli.ts`  
  自己也要守自己的規則，否則這張表就是它自己記錄的那種「假的一列」。

## 對不到條號的閘門

**這不是違規清單。** 這些閘門的正當性來自另外兩件事：能不能交到評審桌上
（採購／資安／法務要的佐證），以及上游變動時它會不會講話。只是不來自法規。

分開列的理由是避免下一次有人把它們當成法定義務再論證一次。

- **`exit-drill`** — D2 退出面靜態檢查、plugin 帳目、演練證據新鮮度（120 天）
- **`gitleaks`** — 機密掃描，fetch-depth: 0 以涵蓋被後續 commit 蓋掉的機密
- **`doc-facts`** — README 與 HANDOFF 引用的數字，與 inventory.json／provenance.json 推導出來的一致

## 尚未適用（留好的介面）

兩個觸發條件任一成立就要接上：公司上市櫃，或個資法 §20-1 施行且公司同時是
「非中小企業（資本額逾一億**且**員工逾二百人）且個資達一萬筆」。

⚠️ 這幾件事**現行法規並未要求**。

- 上線前源碼檢測（SAST）—— 目前完全沒有，Trivy 只掃相依不掃自己的程式碼  
  法源：證交所《上市上櫃公司資通安全管控指引》第 18 條；安維辦法草案大型非公務機關強化義務
- 定期弱點掃描（應用層 DAST）—— 目前只有相依層  
  法源：同上
- 滲透測試 —— 目前沒有，且不是腳手架能自帶的  
  法源：同上
- 非法行為監控與日誌保存至少六個月  
  法源：安維辦法草案大型非公務機關強化義務
- 年度風險評估、年度內部稽核、指定個資保護專責人員與獨立查核人員  
  法源：安維辦法草案大型非公務機關強化義務（組織面，非腳手架範圍）
