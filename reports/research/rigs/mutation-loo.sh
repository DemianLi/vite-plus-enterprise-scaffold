#!/usr/bin/env bash
# 逐檔拿掉一支測試，看有沒有變異從「被殺」變成「存活」。
#
# 問的是：**拿掉這一支，有沒有「程式碼被改壞而測試不說話」的新缺口。**
# 這是 leave-one-out.py 的第二關 —— 那一關量「有沒有執行到」，這一關量
# 「有沒有斷言到」。覆蓋率 Δ0 而這裡掉數字的，就是承重的測試。
#
# 用法：  ./mutation-loo.sh <測試檔> [測試檔...]
#         SCOPE='tools/x/src/**/*.ts,...' ./mutation-loo.sh <測試檔>
#
# ⚠️⚠️ 三個危害，兩個會安靜地騙你：
#  1. 每跑一趟 stryker 會把 16 個 `tools/*/src/cli.ts` 的模式 755→644，
#     **內容零變更**。守它的閘門只看 index 不看工作區，所以不會紅。
#     所以每趟結束都 `git checkout -- .` 還原 —— 而那條還原路徑會覆蓋
#     工作區，這就是下面那道「工作樹必須乾淨」的前提的來源。
#  2. 分母只有 `mutate` 掃到的檔案。受測對象不在那個範圍裡的測試（例如
#     slice-gen 那兩支，受測對象是模板與產出物）**永遠 Δ0** —— 那是構造上
#     的零，不是「這支測試沒用」。
#  3. 「讓模組載不起來」的變異會被記成 Survived —— 存活數是上界不是實數。
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

[ $# -ge 1 ] || { echo "用法：$0 <測試檔> [測試檔...]" >&2; exit 2; }

if [ -n "$(git status --porcelain)" ]; then
  echo "工作樹不乾淨，拒絕執行。" >&2
  echo "這支腳本用 'git checkout -- .' 還原 stryker 改掉的檔案模式 ——" >&2
  echo "那會從 index 覆蓋工作區，吃掉未提交的修改。先 commit 或 stash。" >&2
  git status --porcelain >&2
  exit 1
fi

SCOPE="${SCOPE:-tools/promise-check/src/**/*.ts,tools/slice-gen/src/**/*.ts,tools/slice-gen/bin/**/*.ts}"
STASHED=""

restore() {                        # 中斷、失敗、正常結束都走這裡
  [ -n "$STASHED" ] && [ -e "$STASHED.off" ] && mv "$STASHED.off" "$STASHED"
  git checkout -- . 2>/dev/null
}
trap restore EXIT INT TERM

run() {
  pnpm exec stryker run --mutate "$SCOPE" --reporters json >/dev/null 2>&1
  node -e '
    const r = require("./reports/mutation/mutation.json");
    let k = 0, s = 0, n = 0, t = 0;
    for (const f of Object.values(r.files)) for (const m of f.mutants) {
      t++;
      if (m.status === "Killed" || m.status === "Timeout") k++;
      else if (m.status === "Survived") s++;
      else if (m.status === "NoCoverage") n++;
    }
    console.log(`${k} ${s} ${n} ${t}`);'
  git checkout -- . 2>/dev/null   # ⚠️ 每趟都還原，不是最後才還原：模式變更會累積
}

echo "範圍 $SCOPE"
echo "         殺 存活 無覆蓋 總數"
printf "基線     %s\n" "$(run)"
for f in "$@"; do
  [ -f "$f" ] || { echo "找不到 $f，略過" >&2; continue; }
  STASHED="$f"
  mv "$f" "$f.off"
  printf "拿掉 %-46s %s\n" "$(basename "$f")" "$(run)"
  mv "$f.off" "$f"
  STASHED=""
done
