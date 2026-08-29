"""量測台共用的三件事：根目錄、可動檔案集合、乾淨工作樹的前提。

⚠️ 這個目錄裡的東西**沒有任何機制在守**（`reports/` 在 SCOPE.md 的那一列
自己就是這樣寫的）。上游改了名字、換了旗標，這裡不會紅 —— 會安靜地量錯。
所以每一支腳本跑之前先看它的對照組還在不在，不要拿隔夜的數字下判斷。
"""
import json
import os
import subprocess

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                      cwd=os.path.dirname(os.path.abspath(__file__)),
                      capture_output=True, text=True, check=True).stdout.strip()

RIG = os.path.join(ROOT, "reports/research/rigs")


def tracked_tests():
    """版控裡 tools/ 底下的測試檔。

    ⚠️ 每次重算，不讀快照 —— 刪檔要能減分、加檔要能加分。用凍結的清單量，
    刪掉的檔案會繼續以最後一次的行數計分，而那正是要偵測的事。
    """
    out = subprocess.run(["git", "ls-files", "tools"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    return [p for p in out.split("\n") if p.endswith((".test.ts", ".spec.ts"))]


def mutable_tests():
    """扣掉 pinned.txt 之後剩下的。理由見 pinned.txt 的檔頭。"""
    pinned = {l.strip() for l in open(os.path.join(RIG, "pinned.txt"), encoding="utf8")
              if l.strip() and not l.startswith("#")}
    return [p for p in tracked_tests() if p not in pinned]


def packages():
    """tools/ 底下的 workspace 成員：(package name, 目錄)。

    ⚠️ 不能用 `git ls-files 'tools/*/package.json'` —— git 的 pathspec `*`
    會跨斜線，把 tests/fixtures/sample 那個假 package 也撈進來。所以數斜線。
    ⚠️ 也不能拿目錄名當選擇器：`vp run <目錄名>#test` 靜默 exit 0 零輸出，
    它吃的是 package name（`@org/ui`）。
    """
    out = subprocess.run(["git", "ls-files", "tools"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    pkgs = []
    for rel in out.split("\n"):
        if rel.count("/") == 2 and rel.endswith("/package.json"):
            with open(os.path.join(ROOT, rel), encoding="utf8") as f:
                pkgs.append((json.load(f)["name"], os.path.dirname(rel)))
    return pkgs


def require_clean_tree():
    """把檔案搬開再搬回來的腳本，跑之前工作樹必須是乾淨的。

    ⚠️ 這一條是「從實驗室搬回真樹」造出來的需求，不是防禦性的額外品。
    在拋棄式的 clone 裡，中途中斷留下一個 `.off` 殘骸無所謂；在這裡，
    那是使用者未提交的工作被一個量測腳本改掉。而 `mutation-loo` 的還原
    走 `git checkout -- .`（從 index 還原），乾淨樹以外的前提下它會**吃掉**
    未提交的修改。
    """
    dirty = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout.strip()
    if dirty:
        raise SystemExit(
            "工作樹不乾淨，拒絕執行。\n"
            "這支腳本會把測試檔搬開再搬回來，中途中斷會留下殘骸；\n"
            "而還原路徑會從 index 覆蓋工作區。先 commit 或 stash。\n\n" + dirty)
