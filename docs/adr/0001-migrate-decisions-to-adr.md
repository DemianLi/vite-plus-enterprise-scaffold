# ADR-0001 —— 把 `DECISIONS.md` 遷移成 `docs/adr/`

- **狀態**：已接受，**未開工**
- **日期**：2026-08-20
- **起因**：`/setup-matt-pocock-skills` 選定單一 context 佈局
- **追蹤**：[issue #87](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/87)

---

## 脈絡

`docs/agents/domain.md` 宣告這個 repo 的領域文件佈局是「根層 `CONTEXT.md` +
`docs/adr/`」。**那是目標，不是現況。** 今天決策紀錄住在
[`DECISIONS.md`](../../DECISIONS.md)：89 條 `### C<n> — 標題` 的條目、7230 行。

兩份並存的期間，正是 [`SCOPE.md`](../../SCOPE.md) 開頭警告的狀態 ——
「加一份清單而不加守它的機制，是在製造第五份手抄本」，而那條警告帶著
`v1.0.3` 的傷疤。所以這件事有終點：**原檔要刪掉**。不刪，就只是多了一份。

---

## 決策

把 `DECISIONS.md` 的 89 條條目拆成 `docs/adr/NNNN-<slug>.md`，把散在
`README`／`HANDOFF`／`SCOPE` 的領域詞彙整併進根層 `CONTEXT.md`，驗證，
然後**刪除原檔**。

---

## 成本在哪裡 —— 不是抄寫

| 項目                                    | 量     |
| --------------------------------------- | ------ |
| `### C<n>` 條目                         | 89     |
| `DECISIONS.md` **內部**的 C 編號互引    | 441 次 |
| **其他 84 個受版控檔案**裡的 C 編號引用 | 304 次 |

條目一旦拆成獨立檔案，這 **745 次交叉引用**每一個都要重新接。而且引用它們的
不只文件 —— `tools/scope-check/src/tree.ts`、`tools/doc-facts/src/cli.ts`、
`tools/api-surface/tests/negative.test.ts` 這些**程式與測試的註解**都在引 C 編號。

---

## 約束 —— 做之前一定要知道的兩件事

**一、新格式必須保住「不被 `doc-facts` 守」這個性質。**
`tools/doc-facts` 刻意把 `DECISIONS.md` 排除在外，理由寫在
`tools/doc-facts/src/cli.ts`：那是**有日期的決策日誌**，
「『C24 當時是 467 個套件』陳述的是歷史，守它等於要求改寫歷史」。
拆成 ADR 之後如果不小心讓它落進 `GUARDED`，等於要求改寫歷史。

**二、`README.md` 與 `HANDOFF.md` 有被 `doc-facts` 守。**
`GUARDED = ["README.md", "HANDOFF.md"]`。把領域內容搬出這兩份，會動到
被斷言的數字，閘門會紅。搬之前先看 `tools/doc-facts/src/facts.ts` 斷言了什麼。

---

## 驗收條件

**兩條都成立才算完成：**

1. `DECISIONS.md` 已刪除，745 次交叉引用全部改指新位置，六道閘門全綠。
2. 下面**三處**過渡期文字一併刪除 —— 少刪一處，這條就沒過：
   - `docs/agents/domain.md` 的 `⚠️ 過渡期` 整節
   - [`CONTEXT.md`](../../CONTEXT.md) 開頭的骨架警語，與詞彙表的〈查證狀態〉欄
   - [`AGENTS.md`](../../AGENTS.md) `## Agent skills` → `### Domain docs` 底下的 ⚠️ 兩段

⚠️ 第 2 條沒有任何機制守著 —— 今天沒有工具會因為「過渡期段落還留著」而紅。
把它寫成驗收條件，是這件事唯一的保險。留著一段描述已不存在之過渡狀態的文字，
就是這份 ADR 開頭說的那種手抄本。

---

## 排程

刻意排在 `release/v1` 穩定版之後。理由見
[issue #86](https://github.com/DemianLi/vite-plus-enterprise-scaffold/issues/86)：
v1 要先做出穩定版讓其他團隊開始系統開發。
