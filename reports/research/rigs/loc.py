"""體積量測：只數「實質行」—— 扣掉空行與註解。

問的是：**這批測試現在有多大，而縮小它的時候有沒有真的縮小。**

⚠️ 為什麼不是 `wc -l`：可動的那批測試檔裡，空行＋註解占 32.8%。用原始行數量，
把空行和註解清光就「減了三成」—— 分數一分不掉、測試強度一分不變。
這棵樹的註解是承重的（`describe` 標題掛著決策編號），所以那條路必須不加分。

⚠️ `expects` 是「就地掏空」的探針：刪除擋得住，掏空擋不住 —— 把十二個 `it`
併成一個 `it.each` 而順手拿掉斷言，覆蓋率（量執行不量斷言）、測試數、註解
三項全部不動。密度掉下來才看得見。而 `expect(` 是**字面量**不是執行數，
兩者會分岔，那條分岔是這個量測台最貴的一個發現 —— 見報告的 §四。

其餘五條「達標而什麼都沒改善」的路徑見 ../test-volume-30pct-2026-08-29.md 的 §二。
"""
import os

from _rig import ROOT, mutable_tests

code = blank = comment = expects = files = 0
for rel in mutable_tests():
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):        # 已被刪除的檔案不算行數
        continue
    files += 1
    inblk = False
    with open(path, encoding="utf8") as f:
        text = f.read()
    expects += text.count("expect(")
    for line in text.splitlines():   # ⚠️ 不是 split("\n") —— 那會讓每個檔的結尾換行多算一個空行
        s = line.strip()
        if not s:
            blank += 1
        elif inblk:
            comment += 1
            if "*/" in s:
                inblk = False
        elif s.startswith("/*"):
            comment += 1
            inblk = "*/" not in s
        elif s.startswith("//") or s.startswith("*"):
            comment += 1
        else:
            code += 1

for k, v in [("loc", code), ("comments", comment), ("blank", blank),
             ("expects", expects), ("files", files)]:
    print(f"METRIC {k}={v}")
