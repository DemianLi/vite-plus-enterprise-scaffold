# @org/gate-kit

閘門底下那一層。**這支不是閘門** —— 它沒有 `cli.ts`、不回傳退出碼、不判定任何事。

決策見 [`DECISIONS.md`](../../DECISIONS.md) 的 **C131**（為什麼有這一層）、
**C125**（進不進 `release/v1`）與 **C126**（在那條線上接滿八支）。

## 三個 export

```ts
repoRoot(): string
walk(root, { skip, skipDotDirs?, extensions }): string[]   // 相對於 root，不讀檔
parseFlags(argv, spec): { ok: true; flags } | { ok: false; message }
```

## 為什麼有這支 —— 兩次事故，兩種形狀

**① 認得的旗標打錯字。** `--roots` 打錯的時候，`conformance` 會掃真的 repo 然後
回傳 **exit 0**。11 支閘門裡只有 `pii-check` 擋得住不認得的旗標，而它那道防線是
**被一次真實事故逼出來的**（C52 拿掉 `--masking` 之後，CI 那個步驟被留下來，
頂著「個資：畫面上必須隱碼」的名字回傳綠燈，而它守的東西早就不存在了）。

教訓學到了，只套用在 11 支裡的 1 支 —— 因為沒有地方放。

**② ⚠️ 而在 `release/v1` 上量到的第二種更糟：打錯字會讓閘門去做另一件事。**
`--check` 打錯成 `--chec` 的時候，`tools/spec-report` **不會**紅 ——
它會走「沒有 `--check`」那條分支，把 `SPEC-REPORT.md` **覆寫成當下現況**，
然後回傳 exit 0。那道閘門於是從「報表過期就紅」變成「把報表改成永遠不過期」。

`.github/workflows/tier1-quality.yml` 裡那一行就是 `--check`，而
`SPEC-REPORT.md` 是拿去對外報進度的文件。**一個檢查不存在，比一個檢查失敗糟得多。**
完整量測（含 `git status` 為什麼是乾淨的）在 C125 §一。

## 三件刻意沒做的事

**跳過清單不統一。** `skip` 是參數不是預設值。八份清單互相矛盾，其中
`conformance` 最短（只有 `node_modules`／`dist`）。給它一份聯集清單會讓它
**不再讀今天讀得到的檔案** —— 一道閘門悄悄變弱，比誤報難發現得多。
這一版只把分歧收攏到同一個型別上看得見；調和要帶自己的反向測試。
⚠️ **C182 之後 `walk()` 在產品碼裡零呼叫端**（`pii-check` 是最後一個，改成問 git）——
那個「八份」是當天數的，沒有重新數，理由見 `src/walk.ts` 檔頭。

**沒有 `report()` 或 `Finding`。** 現在沒有任何一支工具產出 `Finding[]` ——
`theme-verify` 用的是一個 module-level 的可變計數器，`pii-check` 成功時印的
三行散文講的是它**抓不到什麼**，沒有泛用格式生得出來。先定義一個零實作的
型別就是「一個 adapter 等於一個假想的接縫」。等到有第一個生產者再說。

**`parseFlags` 不在內部 `process.exit`。** 被取代的實作是在函式裡直接離開，
於是那道防線只能靠起行程來測。判定回傳、列印與離開留給 adapter，
`gate-kit` 就能用純函式測完整個旗標政策**與那段措辭**。

呼叫端漏掉 `ok: false` 不會靜靜放行：沒先收窄 `.ok` 就碰 `.flags` 是型別錯誤。

## 批次擴大時的那顆地雷

`parseFlags` 的 spec **漏掉任何一個真旗標，合併當天 CI 就紅** —— 因為
「不認得就失敗」對還沒登記的真旗標一視同仁。接下一支之前先把它的旗標找齊，
⚠️ **四個來源都要掃，不是三個**：

1. 根 `package.json` 的 `scripts`（`gate`、`ready`、以及各別名）
2. `.github/workflows/tier1-quality.yml`／`tier2-security.yml`
3. ⚠️ **排程的那兩個 workflow**（`exit-drill.yml`、`supply-chain-recapture.yml`）——
   `--require-fresh` 與 `--recapture-safe` **只出現在那裡**，而下面那條絆線
   看不見它們（它只讀 `gate` ＋ `ready`）。漏掉的話是**下一次排程**才炸。
4. 該工具自己的 `tests/`（反向測試常用只有它自己知道的旗標）

## 現在的狀態：這棵樹上每一支自寫 CLI 都接上了

| 工具                                                                        | 旗標                                                                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supply-chain`                                                              | `--update` `--capture` `--capture-health` `--recapture-safe` `--manifest` `--dossier` `--airgap` `--split-lockfile <目錄>` `--verify-sbom <檔案>` |
| `compliance`                                                                | `--file <路徑>` `--evidence` `--update`                                                                                                           |
| `api-surface`                                                               | `--baseline` `--update` `--platform`                                                                                                              |
| `exit-drill`                                                                | `--full` `--require-fresh`                                                                                                                        |
| `conformance`                                                               | `--root`                                                                                                                                          |
| `pii-check`                                                                 | `--root`                                                                                                                                          |
| `theme-verify`                                                              | `--root`                                                                                                                                          |
| `spec-report`                                                               | `--check`                                                                                                                                         |
| `csp-verify`                                                                | `--print-probe`                                                                                                                                   |
| `ui-survey`                                                                 | `--csp` `--sca`                                                                                                                                   |
| `gate-roster`／`doc-facts`／`vue-typecheck`／`promise-check`／`scope-check` | （空 spec ＝ **拒絕所有旗標**）                                                                                                                   |

⚠️ **這張表是手抄的，也就是會過期** —— 它是接下一支時的起點，不是事實來源。
真正的來源是上面那四個地方。

⚠️ **而「全部接上了」這件事只有一半有絆線在守。**
`tests/adoption.test.ts` 的名冊是從 `scripts.gate` ＋ `scripts.ready` **推導**的
（不是寫死清單），所以閘門鏈上那 12 支少一支就會紅。
**`scope-check`／`csp-verify`／`ui-survey` 不在那條鏈上**（名冊的 `UNGATED`），
它們的那幾行沒有東西在守 —— 拿掉不會有人說話。
⚠️ 那不是「所以不重要」：它是這條絆線寫明的射程邊界。

## 開發

```bash
vp run -F @org/gate-kit test
```
