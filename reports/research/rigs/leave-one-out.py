"""逐檔拿掉一支測試，看覆蓋率有沒有掉。掉 0 的是「冗餘候選」。

問的是：**拿掉這一支，有沒有東西因此測不到了。**

⚠️⚠️ 這是**篩子不是判準**。覆蓋率量的是「有沒有執行到」，不是「有沒有斷言」，
所以掉 0 只代表別的測試也走過同幾行 —— 那是冗餘的**必要條件，不是充分條件**。
實測的反例：`promise-check/tests/probe.test.ts` 覆蓋率 Δ0，而拿掉它有 18 顆
變異從「被殺」變成「存活」。第二關是 `mutation-loo.sh`，第三關是人去讀那個檔。

⚠️ 有測試拿掉會讓**別的測試失敗** —— 輸出的 `rc != 0` 就是那件事，
不要把它讀成「覆蓋率沒掉」。⚠️ **這裡刻意不寫「N 支」**：那是一個會過期的數字，
而它已經過期過一次（2026-08-29 是 3 支，2026-09-02 是 5 支）。

⚠️⚠️ **成因不只一種，而原本這裡只寫了第一種：**

  1. **共用狀態** —— `gate-roster`／`pii-check`／`ui-survey` 之間不是獨立的。
  2. **有閘門在掃整份索引**（2026-09-02 才發現）—— `doc-facts/tests/decision-ids.test.ts`
     （C141，`20a152a`）走 `git ls-files` 再逐檔 `readFileSync`，所以**任何**被追蹤
     的檔案從工作區搬走，它就 ENOENT。這支腳本正是靠搬檔案工作的。
     實測：拿掉 `doc-facts` 底下任何一支測試，它都紅。

     ⚠️ 通則：**一道掃描整份索引的閘門，會讓「把檔案搬開再搬回來」的量測台在它
     自己的 package 內失效。** 失效的樣子是紅燈不是假的零 —— 這次算走運。

  經過與逐支的數字見 ../test-redundancy-loo-2026-09-02.md 的 §五。
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
