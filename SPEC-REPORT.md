# 業務功能完成率

由 `tools/spec-report` 產生，**不要手改**。重新生成：

```bash
vp run -r test -- --reporter=default --reporter=json --outputFile=.vitest-results.json
node tools/spec-report/src/cli.ts
```

完成率 ＝ **驗收規格的通過率**，不是覆蓋率。分母是場景的執行實例數：
一個「場景:」算 1，一個「場景大綱:」按「例子:」的每一列各算 1。

目前沒有任何**版控中的**切片帶著驗收規格。

既有切片刻意沒有規格（見 `DECISIONS.md` 的 C114 §六）；
新切片由 `vp create slice` 產生時會自帶一份範本 —— ⚠️ 記得 `git add`，
事實來源是 `git ls-files`，還沒進 index 的規格檔在這裡看不見。
