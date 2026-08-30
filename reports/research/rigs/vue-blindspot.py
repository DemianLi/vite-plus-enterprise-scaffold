#!/usr/bin/env python3
"""逐支 .vue 量「四條複雜度規則看不見多少」，以及邏輯落在 template 還是 script。

⚠️ 這支腳本不是閘門，刻意不在 `tools/` 底下，也不得接進 `gate`／`ready`
（`reports/research/rigs/README.md` 的規矩，對這一支一字不改地成立）。

它回答 C120 §一 指定的那個先決問題 ——「元件的邏輯有相當一部分在 template 裡嗎」
—— 因為那一格的門檻要先答這個，不是先答一個數字。

## 對照組（拿數字下判斷之前先確認它們還有反應）

1. **已知非零**：`platform/ui/src/components/UiAlertDialog.vue` 有具名函式，
   `funcs` 必須 > 0。它變成 0 就是 `FUNC_RE` 對不上了。
2. **已知為零**：fixture 目錄整批排除之後，`files` 不得包含 `/fixtures/`。
   ⚠️ 沒有這一條的話，`tools/*/tests/fixtures/` 的假元件會灌進分母。
3. **母體**：`files` 的數量必須等於 `git ls-files '*.vue'` 扣掉 fixture 的數量。
   ⚠️ 讀磁碟會把未進 index 的檔算進來（C73／C98 裁過同一件事）。

## 已知限制

- 區塊切割用正則不是真的 SFC parser。⚠️ 失效方向：巢狀 `</script>` 字串會早收，
  症狀是**行數偏低**——它產生不出偏高的假象，所以不會讓盲區看起來比實際小。
- template 的「邏輯」用指令與插值計數當代理。⚠️ **它是代理不是量測**，
  C135 §二 記過用代理指標判分類的下場。這裡只拿它做**排序**，不下門檻。
"""

import re
import subprocess
import sys
from pathlib import Path

COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.S)
COMMENT_LINE = re.compile(r"^\s*//.*$", re.M)

BLOCK = lambda tag: re.compile(rf"<{tag}[^>]*>(.*?)</{tag}>", re.S)
SCRIPT = re.compile(r"<script[^>]*setup[^>]*>(.*?)</script>", re.S)
FUNC_RE = re.compile(r"(\bfunction\s+\w|\)\s*=>|\bconst\s+\w+\s*=\s*\()")
# template 裡的邏輯：條件、迴圈、三元、插值裡的呼叫
TPL_LOGIC = re.compile(r"\bv-if\b|\bv-else-if\b|\bv-else\b|\bv-for\b|\?.*?:|\{\{[^}]*\(")
PROPS = re.compile(r"defineProps<\s*\{(.*?)\}\s*>|defineProps\(\s*\{(.*?)\}\s*\)", re.S)


def nonblank(text: str) -> int:
    return len([line for line in text.split("\n") if line.strip()])


def nonblank_code(text: str) -> int:
    """扣掉註解之後的非空行。

    ⚠️ **這一格是本量測台最要緊的一欄，理由是實測**：`UiDropdownMenu.vue`
    的 `<script setup>` 有 269 非空行，其中 **210 行是註解（78%）**。
    不扣註解的話，「盲區有多大」量到的是**這棵樹的註解密度**，不是複雜度
    —— 而 `vite.config.ts` 自己就寫著這條線的註解密度遠高於一般專案。

    ⚠️ 失效方向：字串裡的 `//`（例如網址）會被誤刪成註解，症狀是
    **code 行數偏低**。它讓盲區看起來比實際**小**，所以拿它論證
    「盲區很大」是安全的，論證「盲區很小」不安全。
    """
    stripped = COMMENT_LINE.sub("", COMMENT_BLOCK.sub("", text))
    return len([line for line in stripped.split("\n") if line.strip()])


def top_level_props(body: str) -> int:
    """`defineProps` 裡**最外層**的屬性個數。

    ⚠️ **第一版數錯了，記在這裡**：原本用「這一行有沒有冒號」，於是
    `UiDropdownMenu.vue` 的 `items: readonly { value; label; disabled; variant }[]`
    把 4 個巢狀屬性也算進來，量到 8 —— 而 `vue/max-props` 的門檻是 5，
    閘門卻是綠的。**那個矛盾就是抓到錯誤的地方**：不是規則沒開火，是計數器錯了。

    對照組（每次跑都驗）：`vue/max-props` 今天全樹通過，所以**正確的計數
    必須每一個檔都 <= 5**。任何一個檔算出 6 就是這支函式又壞了。
    """
    depth = 0
    count = 0
    for line in body.split("\n"):
        stripped = COMMENT_LINE.sub("", line).strip()
        if depth == 0 and re.match(r"^\w+\??\s*:", stripped):
            count += 1
        depth += stripped.count("{") + stripped.count("[") - stripped.count("}") - stripped.count("]")
    return count


def survey(root: Path):
    listed = subprocess.run(
        ["git", "ls-files", "*.vue"], cwd=root, capture_output=True, text=True, check=True
    ).stdout.split("\n")
    rows = []
    for rel in listed:
        if not rel or "/fixtures/" in rel:
            continue
        src = (root / rel).read_text(encoding="utf-8")
        script = SCRIPT.search(src)
        body = script.group(1) if script else ""
        tpl = BLOCK("template").search(src)
        tpl_body = tpl.group(1) if tpl else ""
        props = PROPS.search(body)
        prop_body = (props.group(1) or props.group(2) or "") if props else ""
        rows.append(
            {
                "file": rel,
                "script": nonblank(body),
                "code": nonblank_code(body),
                "template": nonblank(tpl_body),
                "funcs": len(FUNC_RE.findall(body)),
                "tplLogic": len(TPL_LOGIC.findall(tpl_body)),
                "props": top_level_props(prop_body),
            }
        )
    return rows


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    rows = survey(root)

    # ── 對照組 ────────────────────────────────────────────────────────
    known = [r for r in rows if r["file"].endswith("UiAlertDialog.vue")]
    assert known and known[0]["funcs"] > 0, "對照組 1 失效：已知有函式的檔量到 0"
    assert not any("/fixtures/" in r["file"] for r in rows), "對照組 2 失效：fixture 混進母體"
    total = subprocess.run(
        ["git", "ls-files", "*.vue"], cwd=root, capture_output=True, text=True, check=True
    ).stdout.split("\n")
    expected = len([f for f in total if f and "/fixtures/" not in f])
    assert len(rows) == expected, f"對照組 3 失效：母體 {len(rows)} != git ls-files {expected}"
    # 對照組 4（已知非零的差值）：這棵樹註解很多，剝除必須真的少掉東西。
    # ⚠️ 沒有這一條的話，正則失效會回報「註解 0%」而那與「真的沒有註解」長得一樣。
    assert sum(r["script"] - r["code"] for r in rows) > 0, "對照組 4 失效：註解剝除沒有效果"
    # 對照組 5（拿閘門當事實來源）：`vue/max-props` 門檻 5，今天全樹綠，
    # 所以正確的計數不可能有任何一個檔 > 5。⚠️ 第一版就是被這一條抓到的。
    over = [(r["file"], r["props"]) for r in rows if r["props"] > 5]
    assert not over, f"對照組 5 失效：閘門說綠而這裡算出 >5 —— {over}"

    blind = [r for r in rows if r["funcs"] == 0]
    print(f"母體：{len(rows)} 個非 fixture 的 .vue（對照組五條全數通過）")
    print(f"  <script setup> 非空行合計 {sum(r['script'] for r in rows)}"
          f"，⚠️ 扣掉註解只剩 {sum(r['code'] for r in rows)}"
          f"（註解佔 {100 - 100 * sum(r['code'] for r in rows) // sum(r['script'] for r in rows)}%）")
    print(f"  <template>     非空行合計 {sum(r['template'] for r in rows)}")
    print(f"  ⚠️ 零函式（四條規則一行都看不見）：{len(blind)} 個檔，"
          f"合計 {sum(r['script'] for r in blind)} 行 script，"
          f"⚠️ 扣掉註解只剩 {sum(r['code'] for r in blind)} 行")
    print()
    print(f"{'script':>7} {'code':>6} {'tmpl':>6} {'func':>5} {'tplLogic':>9} {'props':>6}  檔案")
    for r in sorted(rows, key=lambda r: -r["script"]):
        flag = "⚠️" if r["funcs"] == 0 else "  "
        print(f"{r['script']:>7} {r['code']:>6} {r['template']:>6} {r['funcs']:>5} "
              f"{r['tplLogic']:>9} {r['props']:>6} {flag} {r['file']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
