# api-surface 的 fixture 套件

`sample/` 是一個**假的 platform 套件**，只給 `tools/api-surface` 的反向測試用。

## 為什麼需要它

`--baseline` 那條路（改基準檔的副本）能問「基準說有、現況沒有 → 會不會紅」，
但問不出反過來的那一半：**「這個重構不該讓形狀漂移」**。屬性對調、
`interface` 換成 `type`、加一行 JSDoc、改名一個私有型別 —— 這些改的是來源，
不是記錄，副本動不到。

而在 `platform/*` 上真的改再還原，是既有測試明講要避開的做法：跑到一半被中斷，
repo 就安靜地壞著。測試因此把整個 `sample/` 複製到暫存目錄再動手腳，
搭配 `--platform` 指過去。

## 兩件刻意的事

- **不是 workspace 成員。** `pnpm-workspace.yaml` 只收 `tools/*`，
  `tools/api-surface/tests/fixtures/sample` 差了三層，不會被安裝、不會被建置。
- **`tsconfig.json` 不 extends `@org/tsconfig`。** 它會被複製到暫存目錄，
  在那裡 `@org/tsconfig` 解析不到。設定因此是自足的 —— 與 `platform/*` 的
  慣例不同，是刻意的。
