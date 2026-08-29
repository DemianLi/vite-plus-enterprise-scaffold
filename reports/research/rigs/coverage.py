"""逐 package 量 tools/ 的覆蓋率，輸出 JSON：{pkg: {stmts, lines}}。

問的是：**這個 package 的產品碼有幾成被測試走過。**

⚠️ `--coverage.include=src/**` 不是排版偏好，是這個數字有沒有意義的分野。
沒有它，分母只含「被載入過的」檔案 —— 刪掉一支測試，它的受測對象整支從分母
消失，覆蓋率一動也不動（`gate-kit` 實測 100% → 100%）。釘死之後同一個刪除
動作是 100% → 65%。⚠️ 第二個 include 是給 `codemods` 的：它的程式碼在
package 根層而不在 `src/`，只給第一條的話它回報 "Unknown"。

⚠️ 這個數字有兩個構造上的盲區，都會回報一個漂亮的零或漂亮的滿分：
  1. 子行程跑的 CLI 一律 0% —— 覆蓋率工具看不進 `spawn` 出去的行程。
  2. 受測對象不在本地 `src/` 的測試（讀 `HANDOFF.md`、讀 `renovate.json`
     的那幾支）永遠 Δ0 —— 它們沒有 `import ../src`。
兩個盲區加起來讓四支承重的測試被讀成零。見報告的 §七。
"""
import json
import os
import subprocess
import sys

from _rig import ROOT, packages

result = {}
for name, d in packages():
    summary = os.path.join(ROOT, d, "coverage", "coverage-summary.json")
    if os.path.exists(summary):
        os.remove(summary)          # 不刪的話，這一趟沒跑起來會讀到上一趟的數字
    subprocess.run(["vp", "run", f"{name}#test", "--", "--coverage",
                    "--coverage.reporter=json-summary",
                    "--coverage.include=src/**", "--coverage.include=*.ts"],
                   cwd=ROOT, capture_output=True, text=True)
    if not os.path.exists(summary):
        result[name] = None         # 這個 package 量不到覆蓋率
        continue
    with open(summary, encoding="utf8") as f:
        total = json.load(f)["total"]
    pct = total["statements"]["pct"]
    result[name] = None if pct == "Unknown" else {
        "stmts": pct, "lines": total["lines"]["pct"]}

json.dump(result, sys.stdout, ensure_ascii=False, indent=1, sort_keys=True)
print()
