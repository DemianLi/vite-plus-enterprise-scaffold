# @org/gate-kit

閘門底下那一層。**這支不是閘門** —— 它沒有 `cli.ts`、不回傳退出碼、不判定任何事。

裁決見 [`DECISIONS.md`](../../DECISIONS.md) 的 **C125**（進不進這條線）與 **C126**（接上去）。

## 一個 export

```ts
parseFlags(argv, spec): { ok: true; flags } | { ok: false; message }
```

## 為什麼有這支

`--check` 打錯成 `--chec` 的時候，`tools/spec-report` **不會**紅 ——
它會走「沒有 `--check`」那條分支，把 `SPEC-REPORT.md` **覆寫成當下現況**，
然後回傳 exit 0。那道閘門於是從「報表過期就紅」變成「把報表改成永遠不過期」。

`.github/workflows/tier1-quality.yml` 裡那一行就是 `--check`，而
`SPEC-REPORT.md` 是拿去對外報進度的文件。**一個檢查不存在，比一個檢查失敗糟得多。**

完整量測（含 `git status` 為什麼是乾淨的）在 C125 §一。

## ⚠️ 這條線刻意只帶 `parseFlags`

`main` 上的 `@org/gate-kit` 有三個 export，這裡只有一個。**兩件事刻意留在外面**：

- **`repoRoot()`** —— 它是 `resolve(fileURLToPath(import.meta.url), "../../../..")`，
  也就是 C124 量到的那個病（閘門看不見我給它的那份副本）。搬進來等於把
  〈閘門指不到副本〉制度化。⚠️ 它與 `parseFlags` 關的**不是同一道門**：
  前者是「認得的旗標收下了卻不用」，後者是「不認得的旗標被吞掉」。
- **`walk`** —— 不在這個問題的範圍，這條線沒有量過需不需要它。

## ⚠️ `src/flags.ts` 與 `main` 上那一份**逐字相同**，這是刻意的

`release/v1` 併回 `main` 的時候，逐字相同的檔案是零衝突；改一個字就會變成
`add/add` 衝突。而 [#159](../../DECISIONS.md) 記著那次併線**零衝突刪掉 65 個檔
與 13 個 CI 步驟**，兩道核對都看不見 —— 所以這裡寧可要一個**看得見的**衝突。

⚠️ **後果是它的註解會提到這條線上不存在的東西**（`tools/pii-check`、
卡片 C 的閘門名冊）。那是 `main` 的歷史，不是這裡的錯誤 —— 那段歷史正是
`parseFlags` 存在的理由，改寫它等於把理由抹掉。`tests/flags.test.ts` 同理。

## 開發

```bash
vp run @org/gate-kit#test
```

⚠️ 有一條測試**沒有斷言**，它的斷言是「編譯得過」：沒先收窄 `.ok` 就碰
`.flags` 是型別錯誤。那是這個設計唯一的失敗模式，而 `vp check` 會擋。
