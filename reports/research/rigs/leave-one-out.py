"""逐檔拿掉一支測試，看覆蓋率有沒有掉。掉 0 的是「冗餘候選」。

問的是：**拿掉這一支，有沒有東西因此測不到了。**

⚠️⚠️ 這是**篩子不是判準**。覆蓋率量的是「有沒有執行到」，不是「有沒有斷言」，
所以掉 0 只代表別的測試也走過同幾行 —— 那是冗餘的**必要條件，不是充分條件**。
實測的反例：`promise-check/tests/probe.test.ts` 覆蓋率 Δ0，而拿掉它有 18 顆
變異從「被殺」變成「存活」。第二關是 `mutation-loo.sh`，第三關是人去讀那個檔。

⚠️ 三支測試拿掉會讓**別的測試失敗**（`gate-roster`／`pii-check`／`ui-survey`
之間有共用狀態）—— 輸出的 `rc != 0` 就是那件事，不要把它讀成「覆蓋率沒掉」。
"""
import json
import os
import subprocess
import sys

from _rig import ROOT, mutable_tests, require_clean_tree

require_clean_tree()
os.chdir(ROOT)


def pkg_of(rel):
    d = "/".join(rel.split("/")[:2])
    with open(os.path.join(d, "package.json"), encoding="utf8") as f:
        return json.load(f)["name"], d


def cov(name, d):
    f = os.path.join(d, "coverage", "coverage-summary.json")
    if os.path.exists(f):
        os.remove(f)
    r = subprocess.run(["vp", "run", f"{name}#test", "--", "--coverage",
                        "--coverage.reporter=json-summary",
                        "--coverage.include=src/**", "--coverage.include=*.ts"],
                       capture_output=True, text=True)
    if not os.path.exists(f):
        return None, r.returncode
    with open(f, encoding="utf8") as fh:
        t = json.load(fh)["total"]
    p = t["statements"]["pct"]
    return (None if p == "Unknown" else p), r.returncode


out = {}
files = mutable_tests()
for i, rel in enumerate(files, 1):
    name, d = pkg_of(rel)
    base, _ = cov(name, d)
    os.rename(rel, rel + ".off")
    try:                              # 中斷也要還原 —— 這裡是使用者的樹，不是拋棄式 clone
        after, rc = cov(name, d)
    finally:
        os.rename(rel + ".off", rel)
    out[rel] = {"pkg": name, "base": base, "after": after, "rc": rc}
    delta = "?" if base is None or after is None else round(base - after, 2)
    print(f"[{i:2d}/{len(files)}] {rel}  {base} → {after}  Δ{delta}"
          f"{'  ⚠️ 測試失敗' if rc != 0 else ''}", file=sys.stderr, flush=True)

# 進度走 stderr、結果走 stdout：這支腳本刻意不往樹上寫檔案。
# 寫進去的話，第二趟會被自己上一趟的產物擋在 require_clean_tree() 外面。
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
print()
