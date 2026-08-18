# @org/gate-kit

閘門底下那一層。**這支不是閘門** —— 它沒有 `cli.ts`、不回傳退出碼、不判定任何事。

決策見 [`DECISIONS.md`](../../DECISIONS.md) 的 **C73**。

## 三個 export

```ts
repoRoot(): string
walk(root, { skip, skipDotDirs?, extensions }): string[]   // 相對於 root，不讀檔
parseFlags(argv, spec): { ok: true; flags } | { ok: false; message }
```

## 為什麼有這支

`--roots` 打錯字的時候，`conformance` 會掃真的 repo 然後回傳 **exit 0**。
11 支閘門裡只有 `pii-check` 擋得住不認得的旗標，而它那道防線是
**被一次真實事故逼出來的**（C52 拿掉 `--masking` 之後，CI 那個步驟被留下來，
頂著「個資：畫面上必須隱碼」的名字回傳綠燈，而它守的東西早就不存在了）。

教訓學到了，只套用在 11 支裡的 1 支 —— 因為沒有地方放。

## 三件刻意沒做的事

**跳過清單不統一。** `skip` 是參數不是預設值。八份清單互相矛盾，其中
`conformance` 最短（只有 `node_modules`／`dist`）。給它一份聯集清單會讓它
**不再讀今天讀得到的檔案** —— 一道閘門悄悄變弱，比誤報難發現得多。
這一版只把分歧收攏到同一個型別上看得見；調和要帶自己的反向測試。

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
三個來源都要掃：根 `package.json` 的 `scripts`、`.github/workflows/*.yml`、
以及該工具自己的 `tests/`（反向測試常用只有它自己知道的旗標）。

目前在用的全集：

| 工具           | 旗標                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `supply-chain` | `--capture-health` `--dossier` `--manifest` `--airgap` `--recapture-safe` `--split-lockfile` `--verify-sbom` |
| `compliance`   | `--file` `--evidence` `--update`                                                                             |
| `api-surface`  | `--baseline` `--update` `--platform`                                                                         |
| `exit-drill`   | `--full` `--require-fresh`                                                                                   |
| `conformance`  | `--root`                                                                                                     |
| `csp-verify`   | `--print-probe`                                                                                              |
| `pii-check`    | `--root` ✅ 已接                                                                                             |
| `theme-verify` | （沒有）✅ 已接                                                                                              |

⚠️ 這張表是**手抄的**，也就是會過期 —— 它是接下一支時的起點，不是事實來源。
真正的來源是上面那三個地方。

## 開發

```bash
vp run -F @org/gate-kit test
```
