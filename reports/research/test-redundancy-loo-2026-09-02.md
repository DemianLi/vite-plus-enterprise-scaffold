# 78 支測試裡有沒有一支是多餘的 —— 留一法重跑，以及量測台自己過期的那一天

> 基準 commit：`55b7655`（2026-09-02）。對照基準：`04677b5`（2026-08-29，
> [`test-volume-30pct-2026-08-29.md`](test-volume-30pct-2026-08-29.md) §七）。
>
> ⚠️ **這份不產出「該加／該刪哪一支閘門」的結論** —— C137 §一 明文禁止，兩個方向都禁。
> 它產出的是「哪些測試被什麼儀器量過、哪些沒有」。

## 一句話的答案

**量得到的 35 支裡，可裁的是 0 支。** 而 78 支裡有 **43 支這兩個儀器都照不到** ——
它們不在可裁清單上，是因為**沒有被量過**，不是因為承重。

⚠️⚠️ 而重跑撞出兩件與本題同等重要的事：**基準報告的分母 32 是錯的（實為 35），
它的那次「自我更正」把對的數字改成了錯的**；以及 **C141 的閘門讓留一法多了
第四種紅燈成因，而量測台的檔頭只寫了第一種。**

## 一、射程：78 支拆成四區，這把尺量得到 35 支

| 分區                          |   支數 | 第一關（覆蓋率） | 第二關（突變）                 | 成因                                                   |
| ----------------------------- | -----: | ---------------- | ------------------------------ | ------------------------------------------------------ |
| `tools/` 未釘住               | **35** | ✅ 跑了          | 逐支判                         |                                                        |
| `tools/` 釘住（`pinned.txt`） | **20** | ❌ 構造性盲      | ⚠️ **15 支看得見／5 支不可見** | 19 支 `spawn` 子行程；第 20 支受測對象在 `platform/`   |
| `platform/`                   | **16** | ❌ 射程外        | 部分排除                       | `_rig.py` 的 `tracked_tests()` 是 `git ls-files tools` |
| `apps/` ＋ `features/`        |  **7** | ❌ 射程外        | 部分排除                       | 第二類（示範切片），不同歸屬                           |
|                               | **78** |                  |                                |                                                        |

⚠️⚠️ **「釘住的 20 支兩關同時是啞的」是錯的，本稿撤回這個說法**（§八 有實測）。
覆蓋率對它們構造上是盲的，但**第二關看得見其中 15 支** —— 20 支裡有 14 支
`import` 產品碼 ≥1（`conformance/rules` 有 13 個），那些**行程內**的斷言照樣殺得動變異。
`stryker.config.mjs` 自己用粗體寫著「**這三個原因不能混成一個**」，而我一開始就混了。

⚠️ 而 `tools/conformance` 的 237 顆存活裡 **72 顆（30%）其實被兩支子行程測試殺得掉**
—— 那是**反方向**的證據：stryker 有它們在射程裡，只是把擊殺**歸錯屬**。

## 二、對照組（跑之前）

| 檢查                                | 方向     | 結果                                                      |
| ----------------------------------- | -------- | --------------------------------------------------------- |
| `pinned.txt` 20 條路徑是否都指得到  | —        | ✅ 0 條失效                                               |
| `probe.test.ts` 應在 mutable 集合內 | 已知非零 | ✅ True                                                   |
| 釘住的 `conformance/rules` 應不在   | 已知為零 | ✅ False                                                  |
| 檔案集合 vs `04677b5`               | —        | ✅ 逐檔相同，35＝35，零增零減                             |
| `pinned.txt` 檔頭「前 19 支 spawn」 | 已知非零 | ✅ 實查 19/20 有 `spawn`，第 20 支是 `bff-check/contract` |

## 三、第一關 · 覆蓋率留一法（35 支全跑）

**35 ＝ 25（下降）＋ 5（弄壞別人）＋ 5（Δ0）**

### Δ0 —— 冗餘的**必要**條件

| 檔案（`tools/` 起）                                                       |  行 | import 產品碼 |  基線 | 拿掉後 |       Δ |
| ------------------------------------------------------------------------- | --: | ------------: | ----: | -----: | ------: |
| `doc-facts/tests/decision-ids.test.ts`                                    | 219 |             0 | 63.63 |  63.63 | **0.0** |
| `promise-check/tests/probe.test.ts`                                       |  58 |             1 |  81.1 |   81.1 | **0.0** |
| `slice-gen/tests/boundary-alignment.test.ts`                              | 101 |             3 | 66.66 |  66.66 | **0.0** |
| `slice-gen/tests/spec-template.test.ts`                                   |  78 |             1 | 66.66 |  66.66 | **0.0** |
| `supply-chain/tests/renovate.test.ts`                                     | 127 |             0 |  29.5 |   29.5 | **0.0** |
| ⚠️ **Δ0 是冗餘的必要條件，不是充分條件。** 上一輪的直接反例就在這張表上： |
| `probe.test.ts` 覆蓋率 Δ0，而拿掉它有 18 顆變異從「被殺」變成「存活」。   |

### 紅 —— 拿掉會讓**別的測試失敗**

| 檔案（`tools/` 起）                                                            |  行 | import 產品碼 |  基線 | 拿掉後 |         Δ |
| ------------------------------------------------------------------------------ | --: | ------------: | ----: | -----: | --------: |
| `doc-facts/tests/cross-references.test.ts`                                     |  97 |             0 | 63.63 |      — |     **—** |
| `doc-facts/tests/derive.test.ts`                                               | 132 |             1 | 63.63 |      — |     **—** |
| `gate-roster/tests/roster.test.ts`                                             | 440 |             2 | 80.73 |      0 | **80.73** |
| `pii-check/tests/detect.test.ts`                                               | 153 |             2 | 76.14 |      — |     **—** |
| `ui-survey/tests/survey.test.ts`                                               |  78 |             2 | 11.53 |      0 | **11.53** |
| ⚠️ **`rc != 0` 的那幾列什麼都沒說** —— 不能讀成「覆蓋率沒掉」。                |
| `gate-roster` 與 `ui-survey` 那兩列的 `0` 是測試整支沒跑起來，不是覆蓋率歸零。 |

### Δ>0 —— 拿掉會讓覆蓋率下降

| 檔案（`tools/` 起）                              |  行 | import 產品碼 |  基線 | 拿掉後 |         Δ |
| ------------------------------------------------ | --: | ------------: | ----: | -----: | --------: |
| `api-surface/tests/docs.test.ts`                 |  75 |             1 |  5.84 |   4.19 |  **1.65** |
| `codemods/tests/flatten-ui-theme.test.ts`        |  99 |             1 | 59.01 |   6.01 |  **53.0** |
| `codemods/tests/rename-feature-kit.test.ts`      |  74 |             1 | 59.01 |     53 |  **6.01** |
| `compliance/tests/a11y.test.ts`                  | 133 |             3 | 63.67 |  49.43 | **14.24** |
| `compliance/tests/render.test.ts`                | 216 |             2 | 63.67 |   36.7 | **26.97** |
| `conformance/tests/report.test.ts`               | 103 |             2 | 66.74 |  63.27 |  **3.47** |
| `exit-drill/tests/counts.test.ts`                | 174 |             1 |    33 |  25.78 |  **7.22** |
| `exit-drill/tests/dependency-accounting.test.ts` |  87 |             1 |    33 |  29.88 |  **3.12** |
| `exit-drill/tests/expected-failures.test.ts`     | 175 |             1 |    33 |  28.12 |  **4.88** |
| `exit-drill/tests/plugin-accounting.test.ts`     | 171 |             1 |    33 |  18.16 | **14.84** |
| `exit-drill/tests/tree-fingerprint.test.ts`      |  77 |             1 |    33 |  30.07 |  **2.93** |
| `gate-kit/tests/root.test.ts`                    |  21 |             1 |   100 |   97.5 |   **2.5** |
| `gate-kit/tests/walk.test.ts`                    |  89 |             1 |   100 |     65 |    **35** |
| `promise-check/tests/negative.test.ts`           | 190 |             1 |  81.1 |  37.79 | **43.31** |
| `promise-check/tests/spec.test.ts`               | 103 |             1 |  81.1 |  76.77 |  **4.33** |
| `slice-gen/tests/contract-alignment.test.ts`     | 603 |             6 | 66.66 |  51.51 | **15.15** |
| `spec-report/tests/report.test.ts`               | 171 |             4 | 60.51 |   2.05 | **58.46** |
| `supply-chain/tests/health.test.ts`              | 255 |             1 |  29.5 |  23.11 |  **6.39** |
| `supply-chain/tests/inventory.test.ts`           | 174 |             2 |  29.5 |  20.68 |  **8.82** |
| `supply-chain/tests/lockfile.test.ts`            | 235 |             1 |  29.5 |  29.11 |  **0.39** |
| `supply-chain/tests/provenance.test.ts`          | 266 |             3 |  29.5 |  24.39 |  **5.11** |
| `theme-verify/tests/css.test.ts`                 | 181 |             1 | 41.06 |     21 | **20.06** |
| `theme-verify/tests/palette.test.ts`             | 237 |             1 | 41.06 |  20.06 |  **21.0** |
| `vue-typecheck/tests/negative.test.ts`           | 304 |             2 | 57.62 |   30.5 | **27.12** |
| `vue-typecheck/tests/programs.test.ts`           |  79 |             1 | 57.62 |  29.66 | **27.96** |

## 四、⚠️⚠️ 基準報告的分母是錯的，而它的自我更正把對的改成錯的

[`test-volume-30pct-2026-08-29.md`](test-volume-30pct-2026-08-29.md) §七 寫「32 支全跑」，
並附一則自我更正：

> ⚠️ 這一欄原本寫 27，是算錯的（27＋3＋5＝35，而**只有 32 支**）

**「只有 32 支」是錯的。** `mutable_tests()` 在 `04677b5` 上回的就是 35
（`git ls-files tools` 的 55 支測試 − `pinned.txt` 的 20 條，而那時的 `pinned.txt`
也是 20 條），檔案集合與今天**逐檔相同**。

三桶的位移完全對得上，而且每一格都有名字：

| 分桶     |   基準 |   今天 | 位移                                  |
| -------- | -----: | -----: | ------------------------------------- |
| 下降     | **27** |     25 | `derive` → 紅、`decision-ids` → Δ0    |
| 弄壞別人 |      3 |  **5** | ＋`cross-references`、＋`derive`      |
| Δ0       |      5 |      5 | −`cross-references`、＋`decision-ids` |
| 合計     | **35** | **35** |                                       |

**被更正掉的那個 27 是對的。** 那次更正拿一個沒被量過的前提（「只有 32 支」）
去改一個量出來的數字。

⚠️ 這是這棵樹記錄過的形狀再一次：**散文裡的計數沒有機制在守**，而
「27＋3＋5＝35」這個算式本身當時就在指著正確答案。

## 五、⚠️⚠️ 第四種紅燈成因：C141 讀了整份索引

`leave-one-out.py` 的檔頭把紅燈解釋成共用狀態：

> 三支測試拿掉會讓**別的測試失敗**（`gate-roster`／`pii-check`／`ui-survey`
> 之間有共用狀態）

**新增的兩支不是那個成因。** 實測重現（把 `derive.test.ts` 搬開再跑 `@org/doc-facts#test`）：

```
FAIL tests/decision-ids.test.ts > 🔴 版控裡沒有指不到的 C／D／R 編號
Error: ENOENT: no such file or directory,
       open '.../tools/doc-facts/tests/derive.test.ts'
  ❯ tests/decision-ids.test.ts:191:43
```

`decision-ids.test.ts`（C141）走 `git ls-files` 再逐檔 `readFileSync`。
**任何一支被追蹤的檔案從工作區搬走，它就 ENOENT。**

而 C141 是 `20a152a`（2026-08-30）—— **基準 `04677b5` 的隔天**。
基準那一趟量的是一棵還沒有這道閘門的樹。

⚠️ **通則**：一道「掃描整份索引」的閘門，會讓任何「把檔案搬開再搬回來」的量測台
在它自己的 package 內失效。而失效的樣子是紅燈，不是假的零 —— 這次算走運。

## 六、第二關 · 突變測試留一法

### 對照組（已知非零）—— 逐格重現

```
範圍 tools/promise-check/src, tools/slice-gen/src, tools/slice-gen/bin
         殺  存活  無覆蓋  總數
基線     300  122   146    673
拿掉 probe.test.ts   282  140   146    673
```

**與 `04677b5` 的凍結表逐格相同**（300→282、122→140、−18）。第二關的儀器沒有壞。

### 唯一的新候選：`doc-facts/decision-ids`

```
範圍 tools/doc-facts/src/**/*.ts
         殺  存活  無覆蓋  總數
基線     129  26    77     392
拿掉 decision-ids.test.ts      129  26    77     392
拿掉 cross-references.test.ts  129  26    77     392
```

⚠️⚠️ **這兩個零是空的，而空的零跟真的零長得一模一樣。** 查那一趟的 `testFiles`：

```
testFiles seen: 3
   tools/doc-facts/tests/derive.test.ts
   tools/doc-facts/tests/facts.test.ts
   tools/gate-roster/tests/roster.test.ts
```

**`decision-ids.test.ts` 與 `cross-references.test.ts` 從頭到尾沒有被執行。**
不是「拿掉它們什麼都沒變」，是「它們本來就不在那一趟裡」。

成因是同一個結構性質：兩支的 `import` 產品碼**零次**，所以 runner 判它們
與被 mutate 的檔案無關。而 `stryker.config.mjs` 用的正是這條判準 ——
它明列的五支「檔案內容型」不可見測試裡就有 `doc-facts/cross-references`。

**`decision-ids` 是同一類，這份稿子把它補進那份清單。**

## 七、⚠️ 兩個被推翻的假設，記在這裡

跑第二關之前我提過兩版假設，**兩版都錯**，而擋下它們的是對照組：

1. **「C141 讓第二關整支壞掉」** —— 錯。`stryker.config.mjs` 檔頭寫著
   runner 預設只跑「與被改動的檔案相關」的測試；實查那一趟只有 8 支
   測試檔進場，`doc-facts` 根本沒進去。
2. **收窄版「射程落在 `doc-facts` 時會中止」** —— 也錯。`decision-ids`
   與 `cross-references` 因為 `import` 產品碼零次，連「相關」都算不上，
   於是永遠不會被拉進 dry run。

⚠️ **讓它們對兩個儀器都隱形的那個性質，同時讓它們傷不到量測台。**
這不是設計出來的，是量出來才知道的。

## 八、43 支測不到的，逐支理由

### `pinned.txt` 的 20 支 —— 第一關啞，⚠️ **第二關看得見 15 支**

「看得見」＝ 全樹跑一趟 `pnpm exec stryker run`（`55b7655`，78 支版控測試）之後，
它出現在報表的 `testFiles` 裡。

| 檔案（`tools/` 起）                                                   |   行 | import 產品碼 | spawn 子行程 |   第二關   |
| --------------------------------------------------------------------- | ---: | ------------: | :----------: | :--------: |
| `api-surface/tests/negative.test.ts`                                  | 1329 |             0 |      ✅      |   不可見   |
| `api-surface/tests/tracked.test.ts`                                   |  218 |             1 |      ✅      | **看得見** |
| `bff-check/tests/contract.test.ts`                                    |  307 |             0 |      ❌      | **看得見** |
| `bff-check/tests/negative.test.ts`                                    |  314 |             0 |      ✅      | **看得見** |
| `compliance/tests/evidence.test.ts`                                   |  155 |             2 |      ✅      | **看得見** |
| `compliance/tests/negative.test.ts`                                   |  261 |             2 |      ✅      | **看得見** |
| `conformance/tests/negative.test.ts`                                  |  567 |             2 |      ✅      |   不可見   |
| `conformance/tests/output.test.ts`                                    |  122 |             0 |      ✅      |   不可見   |
| `conformance/tests/rules.test.ts`                                     |  590 |            13 |      ✅      | **看得見** |
| `doc-facts/tests/facts.test.ts`                                       |  416 |             1 |      ✅      | **看得見** |
| `gate-kit/tests/adoption.test.ts`                                     |   70 |             0 |      ✅      |   不可見   |
| `gate-kit/tests/flags.test.ts`                                        |  108 |             1 |      ✅      | **看得見** |
| `pii-check/tests/roster.test.ts`                                      |  218 |             2 |      ✅      | **看得見** |
| `promise-check/tests/cli.test.ts`                                     |   90 |             1 |      ✅      | **看得見** |
| `promise-check/tests/sandbox.test.ts`                                 |  160 |             1 |      ✅      | **看得見** |
| `scope-check/tests/scope.test.ts`                                     |  627 |             3 |      ✅      | **看得見** |
| `slice-gen/tests/coverage-gate.test.ts`                               |  156 |             2 |      ✅      | **看得見** |
| `slice-gen/tests/e2e.test.ts`                                         |  218 |             0 |      ✅      | **看得見** |
| `spec-report/tests/cli.test.ts`                                       |  190 |             1 |      ✅      |   不可見   |
| `supply-chain/tests/sbom-negative.test.ts`                            |  208 |             1 |      ✅      | **看得見** |
| **20 支裡只有 5 支對第二關不可見。** 其餘 15 支的行程內斷言在射程裡。 |

⚠️ **我一開始寫成 20 支全啞，那是照 `stryker.config.mjs` 檔頭的列舉推的，而那份
列舉的基數是 49 支（今天 78 支）—— 它過期了。** 用實測取代它：

|                   | 檔頭寫的（49 支時） | 實測（78 支，`55b7655`） |
| ----------------- | ------------------: | -----------------------: |
| 版控裡 `.test.ts` |                  49 |                   **78** |
| stryker 看得見    |                  35 |                   **60** |
| 完全不可見        |                  14 |                   **18** |

### 今天不可見的 18 支（全樹，不只 `tools/`）

| 檔案                                                 |   行 | import 產品碼 |
| ---------------------------------------------------- | ---: | ------------: |
| `apps/console/tests/dev-session-stripped.test.ts`    |   92 |             0 |
| `apps/console/tests/proxy-target.test.ts`            |   78 |             0 |
| `platform/config/tests/env-gate.test.ts`             |   62 |             1 |
| `platform/eslint-config/tests/a11y.test.ts`          |  170 |             0 |
| `platform/security-headers/tests/policy.test.ts`     |  147 |             1 |
| `platform/security-headers/tests/static-csp.test.ts` |   92 |             1 |
| `platform/ui/tests/a11y.test.ts`                     |  390 |             1 |
| `platform/ui/tests/styles.test.ts`                   |  339 |             0 |
| `tools/api-surface/tests/negative.test.ts`           | 1329 |             0 |
| `tools/conformance/tests/negative.test.ts`           |  567 |             2 |
| `tools/conformance/tests/output.test.ts`             |  122 |             0 |
| `tools/doc-facts/tests/cross-references.test.ts`     |   97 |             0 |
| `tools/doc-facts/tests/decision-ids.test.ts`         |  219 |             0 |
| `tools/gate-kit/tests/adoption.test.ts`              |   70 |             0 |
| `tools/spec-report/tests/cli.test.ts`                |  190 |             1 |
| `tools/supply-chain/tests/renovate.test.ts`          |  127 |             0 |
| `tools/vue-typecheck/tests/negative.test.ts`         |  304 |             2 |
| `tools/vue-typecheck/tests/programs.test.ts`         |   79 |             1 |

**對照組兩個方向都命中**：`promise-check/probe`（已知承重，18 顆）在可見清單裡 ✅；
`doc-facts/decision-ids`（本稿 §六 判為構造性不可見）不在 ✅。

⚠️ **釘住的意思是「不列入分母」，不是「這些測試沒價值」** —— 它們是這棵樹上
唯一在跑真正 CLI 的東西。⚠️ 而 `bff-check/contract` 是唯一沒有 `spawn` 的那一支，
它被釘的理由不同（受測對象在 `platform/`）。

### `platform/` 16 支 ＋ 第二類 7 支 —— 這把尺的射程外

| 檔案                                                                                  | 分區     |  行 | import 產品碼 |
| ------------------------------------------------------------------------------------- | -------- | --: | ------------: |
| `apps/console/tests/bff-routes.test.ts`                                               | 第二類   | 129 |             2 |
| `apps/console/tests/composition-root.test.ts`                                         | 第二類   |  75 |             1 |
| `apps/console/tests/dev-session-stripped.test.ts`                                     | 第二類   |  92 |             0 |
| `apps/console/tests/proxy-target.test.ts`                                             | 第二類   |  78 |             0 |
| `features/order/tests/masking.test.ts`                                                | 第二類   |  79 |             0 |
| `features/order/tests/order.test.ts`                                                  | 第二類   |  57 |             2 |
| `features/shipment/tests/shipment.test.ts`                                            | 第二類   |  45 |             2 |
| `platform/bff-mock/tests/routes.test.ts`                                              | platform | 227 |             1 |
| `platform/config/tests/env-gate.test.ts`                                              | platform |  62 |             1 |
| `platform/eslint-config/tests/a11y.test.ts`                                           | platform | 170 |             0 |
| `platform/http-client/tests/boundary.test.ts`                                         | platform |  60 |             1 |
| `platform/pii/tests/mask.test.ts`                                                     | platform | 201 |             1 |
| `platform/security-headers/tests/policy.test.ts`                                      | platform | 147 |             1 |
| `platform/security-headers/tests/static-csp.test.ts`                                  | platform |  92 |             1 |
| `platform/slice-kit/tests/define-feature.test.ts`                                     | platform | 206 |             3 |
| `platform/slice-kit/tests/design-system.test.ts`                                      | platform | 102 |             1 |
| `platform/ui/tests/a11y.test.ts`                                                      | platform | 390 |             1 |
| `platform/ui/tests/alert-dialog.test.ts`                                              | platform | 316 |             1 |
| `platform/ui/tests/cn.test.ts`                                                        | platform | 161 |             1 |
| `platform/ui/tests/component-contract.test.ts`                                        | platform | 308 |             4 |
| `platform/ui/tests/dropdown-menu.test.ts`                                             | platform | 505 |             1 |
| `platform/ui/tests/field-wiring.test.ts`                                              | platform | 297 |             2 |
| `platform/ui/tests/styles.test.ts`                                                    | platform | 339 |             0 |
| ⚠️ **第二關對這 23 支不是全盲，但也不是全亮。** `stryker.config.mjs` 的三個排除       |
| （`tools/vue-typecheck/src`、`platform/config/src`、`platform/security-headers/src`） |
| 各有各的理由，而檔頭自己寫著「**排除不等於這幾支沒有問題**」。                        |
| `platform/eslint-config/tests/a11y.test.ts` 與 `platform/ui/tests/styles.test.ts`     |
| `import` 產品碼零次，屬第 §六 節那一類。                                              |

⚠️ **第二類那 7 支不是腳手架的臃腫。** 它們是示範切片，歸屬是採用團隊。
拿「腳手架該不該瘦身」的判準去量它們是套錯對象。

## 九、給第三關的證據欄 —— ⚠️ **D16 的分我不打**

量測台自己寫著**第三關是人**，而 D16 兩軸是**判準**不是證據（C142）。
所以下面列的是**事實**，不是分數：斷言對象是什麼、它落在哪裡、以及兩個儀器
對它說了什麼。**「② 壞法安不安靜」要讀那支測試才答得出來，本稿一律標「未判」。**

| Δ0 候選                        | 斷言對象                                           | 斷言對象的位置                                                    | 壞法安不安靜                                      | 兩個儀器                             |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| `promise-check/probe`          | `promise-check` 自己的 `src/`                      | 本地 `src/`                                                       | **未判（需人讀該檔）**                            | 覆蓋率零、突變**看得見**：18 顆      |
| `slice-gen/boundary-alignment` | 產生器**輸出**過不過得了 D4 第 2／3 層 ESLint 規則 | **本地 `src/` 之外**（ESLint 規則集）                             | 該檔自己寫了：上游改規則 → 產出物在專案組手上才壞 | 覆蓋率零、突變構造性零               |
| `slice-gen/spec-template`      | 模板產出的 `.feature` 餵進**真的 parser**          | **本地 `src/` 之外**（runner 的 `predefinedSteps`、中文關鍵字表） | 該檔自己寫了：上游改形狀 → 字串斷言全綠           | 覆蓋率零、突變構造性零               |
| `doc-facts/cross-references`   | `HANDOFF.md` 等文件的交叉引用（C99）               | **本地 `src/` 之外**（文件）                                      | **未判（需人讀該檔）**                            | 覆蓋率：現在是紅不是零；突變：不可見 |
| `doc-facts/decision-ids`       | 版控裡全部 C／D／R 編號指不指得到（C141）          | **本地 `src/` 之外**（整份索引）                                  | **未判（需人讀該檔）**                            | 覆蓋率零、突變**不可見**             |
| `supply-chain/renovate`        | `renovate.json`、`pnpm-workspace.yaml`             | **本地 `src/` 之外**（設定檔）                                    | **未判（需人讀該檔）**                            | 覆蓋率零、突變**不可見**             |

⚠️ **「未判」與「否」不是同一格。** 這棵樹為「三態不夠用、第四態長得像全綠」
付過學費，所以這一欄不用 `—`。

⚠️ **五支的斷言對象都不在本地 `src/`。** 判準套在儀器看得見的東西上，
答案會很漂亮而且是錯的 —— 這是本題第二次量到同一件事。

## 十、結論

1. **量得到的 35 支裡，可裁的是 0 支。** 25 支動覆蓋率、5 支拿掉會讓別人紅、
   5 支 Δ0 而五支都有承重理由或結構性盲區。
2. **另外 43 支沒有被量過。** 它們不在可裁清單上不是因為承重。
3. **這兩件事合起來不構成「一支都不能刪」的證明** —— 它構成的是
   「**這兩個儀器答不出 43/78**」。

## 十一、射程與不做的事

- 結論適用範圍是 `tools/` 未釘住的 35 支。
- ⚠️ **不產出「該加／該刪哪一支閘門」的結論**（C137 §一，兩個方向都禁）。
- ⚠️ **不改任何門檻、不動 `specs/`**（AGENTS.md 規則二、規則四）。
- ⚠️ 本文修正了 [`test-volume-30pct-2026-08-29.md`](test-volume-30pct-2026-08-29.md)
  §七 的分母，**但沒有回頭去改那份稿子** —— 凍結的報告是那一天的結論。
- ⚠️⚠️ **這份稿子本身在 C141 閘門之外。** `decision-ids.test.ts` 的
  `OUT_OF_SCOPE = "reports/"` 讓 `reports/` 底下的檔案永遠不被掃 —— 進不進版控都一樣。
  所以 `pnpm gate` 退出 0 **對本文的 C／D／R 編號一個字都沒說**。
  查它的是一支手寫的 Python（**比閘門更嚴**：沒有 `OUT_OF_SCOPE` 過濾），
  引用的 5 個編號（C99、C137、C141、D4、D16）**全部指得到**。
- ✅ **四處文件與量到的事實脫節，已補**（原稿寫「不動它們」，人裁了要補）：
  1. `leave-one-out.py` 的檔頭少列一種紅燈成因（§五）—— 已補第二種成因，
     並拿掉會過期的「三支」。
  2. `stryker.config.mjs` 的「檔案內容型」清單少列 `decision-ids`（§六）—— 已補。
  3. `stryker.config.mjs` 檔頭的「49 支／35 可見／14 不可見」→ **78／60／18**（§八）。
  4. 同檔的「九支命令列進入點的可執行位會掉」→ 實測 **16 個**。
     ⚠️ **四處都只動註解，零行程式碼**（`git diff -U0` 驗過：新增的非註解行 0 行）。
     ⚠️⚠️ **刻意沒做的一件事：三個成因各自的支數（4／5／5）沒有重新推導。**
     判「檔案內容型」要看 `import` 的是不是**產品碼**，而「路徑以 `.` 開頭」這個
     粗判準會把 `./contract.ts` 這種**測試自己的輔助檔**算成產品碼 ——
     `platform/ui/tests/a11y.test.ts` 實際就是這樣，一判就翻。
     **重推導要人做，不是換一個 regex。**
- ⚠️ **直接跑 `pnpm exec stryker run` 會留下 16 個 755→644 的模式翻轉，逐行 diff 是零。**
  本次實測到了，用 `git checkout -- tools/` 還原、`git diff --summary` 驗空。
  走 `mutation-loo.sh` 不會有這個問題（它每趟都還原）。
- ⚠️ **這份未追蹤的稿子讓 `require_clean_tree()` 從現在起拒絕執行。**
  量測台要再跑，先 commit 或 stash。

## 跑法

```bash
python3 reports/research/rigs/leave-one-out.py > /tmp/loo.json     # 進度走 stderr
bash reports/research/rigs/mutation-loo.sh tools/promise-check/tests/probe.test.ts
SCOPE='tools/doc-facts/src/**/*.ts' bash reports/research/rigs/mutation-loo.sh \
  tools/doc-facts/tests/decision-ids.test.ts tools/doc-facts/tests/cross-references.test.ts
```

⚠️ 跑完 `rm -f stryker-setup-*.js`，並用 `git diff --summary`（**不是** `git status`）
驗檔案模式沒有殘留。這一趟實測：兩者皆空。

## 十二、留下什麼、它守什麼 —— 逐項的帳

> 這一節是本稿的**結論表**。所有數字都量自 `55b7655`。
> ⚠️ 它列的是「留下什麼、為什麼」，**不是**「該加／該刪哪一支閘門」（C137 §一）。

### A. 測試用套件（真正的 npm 套件）

| 套件                                       |           裝在幾個 package | 層                  | 守的失敗模式                                          | 移除的話                          |
| ------------------------------------------ | -------------------------: | ------------------- | ----------------------------------------------------- | --------------------------------- |
| `vitest`                                   |                     **30** | 層 2 ＋ 層 3 的載體 | 實作細節對不對；並且是層 3 的執行器                   | ⛔ 78 支測試同時消失。唯一 runner |
| `@vitest/coverage-v8`                      |                          4 | 層 2 度量           | 「有沒有**執行到**」                                  | ⛔ 第一關留一法失去儀器           |
| `@amiceli/vitest-cucumber`                 | 3（＋由 `slice-gen` 下發） | **層 3 驗收**       | **「什麼叫做對」**                                    | ⛔ 層 3 唯一載體                  |
| `happy-dom`                                |                          2 | 層 2（DOM）         | reka Teleport 在 SSR 下是空的、emit 早於關閉一個 tick | ⛔ 無替代                         |
| `@stryker-mutator/core` ＋ `vitest-runner` |                  1（根層） | **元層**            | 「斷言是不是空頭支票」                                | ⛔ 唯一機制                       |
| `vue-tsc`                                  |                          1 | 層 1 約束           | `.vue` 的型別破口                                     | ⛔ 唯一機制                       |

⚠️ `@amiceli/vitest-cucumber` **同時是第一類與第二類** —— `slice-gen/src/files.ts`
會把它產進切片，所以它也是下發給採用團隊的東西。

⚠️ 突變測試那一格要小心：**它的產出是一份清單，不是一個分數**
（`thresholds.break` 是 `null`）。所以「我們過門檻了」推不出「可以移除它」。

### B. Tier 1／Tier 2 的閘門

`gate-roster` 自己報的：**16 道閘門（Tier 1 6 道、Tier 2 10 道）、5 個刻意不接的工具**。

| Tier | 工具                            | 守的類型                                  | 是不是 npm 測試套件 |
| ---- | ------------------------------- | ----------------------------------------- | ------------------- |
| 1    | `gate-roster`                   | 閘門名冊自己有沒有漂移                    | 否                  |
| 1    | `scope-check`                   | `SCOPE.md` 與版控一致                     | 否                  |
| 1    | `vp check`（oxlint ＋ oxfmt）   | 層 1 約束：四個複雜度維度、格式           | 否                  |
| 1    | `vue-typecheck`                 | `.vue` 型別（4 program／31 SFC）          | 是（`vue-tsc`）     |
| 1    | `theme-verify`                  | 設計代幣：0 處原始顏色、200 格宣告        | 否                  |
| 1    | `spec-report --check`           | **完成率＝規格通過率**（層 3 的回報）     | 否                  |
| 2    | `eslint` ＋ 6 個 plugin／parser | 注入面、XSS sink、a11y                    | **是**（7 個）      |
| 2    | `conformance`                   | 一致性 ＋ 版控檔案模式（398 檔）          | 否                  |
| 2    | `api-surface`                   | `platform/` API 形狀無破壞（11／159）     | 否                  |
| 2    | `bff-check`                     | BFF 契約                                  | 否                  |
| 2    | `exit-drill`                    | **D2 退出面未擴大** ＋ 演練證據新鮮度     | 否                  |
| 2    | `supply-chain`                  | 712 套件／144 原生二進位／12 家族／4 平台 | 否                  |
| 2    | `compliance`                    | 法遵對照表 ＋ 無障礙分工                  | 否                  |
| 2    | `pii-check`                     | 測試環境無真實個資（103 檔）              | 否                  |
| 2    | `doc-facts`                     | 文件數字與事實一致 ＋ C／D／R 編號指得到  | 否                  |
| 2    | `promise-check`                 | **承諾成立**（1 條承諾／4 場景）          | 否                  |

⚠️ **Tier 1＋2 引入的「測試套件」只有 ESLint 那 7 個，其餘 12 支是自寫 CLI。**
⚠️ `semgrep` 與 `gitleaks` 不在名冊裡 —— `gate-roster` 對那幾步什麼都沒說。
⚠️ `pii-check` **姓名抓不到**，這條的覆蓋是部分不是完整。

### C. 可移除的：0

| 候選                        | 為什麼不移除                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| 15 支安全 package 的測試    | 它們是「閘門沒壞」的**證據**，跑在既有 runner 上。移除＝閘門變成無人驗證 |
| 35 支量得到的 `tools/` 測試 | 25 動覆蓋率、5 拿掉會讓別人紅、5 支 Δ0 而五支全部承重或構造性盲          |
| 43 支量不到的               | ⚠️ **沒有被量過**，不是「證明沒問題」。裁它們需要新儀器，不是新判準      |
| 上表 A 的六個套件           | 逐項：移除之後某個失敗模式**沒有人在守，且無替代機制**                   |

**移除的充要條件是「移除之後某個失敗模式沒有人在守，且無替代機制」——
逐項套下去，一項都不成立。**
