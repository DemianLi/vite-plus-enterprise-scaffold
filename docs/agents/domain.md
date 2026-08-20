# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── apps/ features/ platform/ tools/     ← 本 repo 沒有 src/，程式碼住在這四個 workspace
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

---

## ⚠️ 過渡期：`CONTEXT.md` 與 `docs/adr/` 是**骨架**，還不是事實來源

上面那份佈局今天**在磁碟上存在，但內容尚未遷入**。實際情形是：

| 這份文件說的 | 今天的權威來源                                                                                      | 狀態                       |
| ------------ | --------------------------------------------------------------------------------------------------- | -------------------------- |
| `docs/adr/`  | [`DECISIONS.md`](../../DECISIONS.md) 的 89 條 `C<n>` 條目（7230 行）                                | **骨架已立、內容未遷**     |
| `CONTEXT.md` | 散在 [`README.md`](../../README.md)、[`HANDOFF.md`](../../HANDOFF.md)、[`SCOPE.md`](../../SCOPE.md) | **骨架已立、詞彙表待抄錄** |

**在遷移完成之前，探索這個 repo 要讀的是中間那一欄。**
[`CONTEXT.md`](../../CONTEXT.md) 與 [`docs/adr/`](../adr/) 讀得到，但它們今天
只放骨架與遷移計畫本身 —— **不要因為它們存在就以為決策紀錄已經在裡面**。
不在。決策紀錄有 439KB，全部還在 `DECISIONS.md`。

範圍、成本（745 次交叉引用）、兩個 `doc-facts` 約束與驗收條件，見
[ADR-0001](../adr/0001-migrate-decisions-to-adr.md)。

### 另外三份根層文件，各有各的軸

讀之前先知道哪份回答什麼，否則會去錯地方：

- **[`SCOPE.md`](../../SCOPE.md)** —— 軸是**目錄**：「這個目錄准不准出現在
  `release/v1` 的樹上？」由 `tools/scope-check` 守著。
- **[`HANDOFF.md`](../../HANDOFF.md)** —— 軸是**能力**：「我的案子需要 X，
  該用哪條分支？」含〈已知的誠實缺口〉。
- **[`CHANGELOG.md`](../../CHANGELOG.md)** —— 軸是**時間**：哪個版本動了什麼。

⚠️ `README.md` 與 `HANDOFF.md` 由 `tools/doc-facts` 守著（其餘根層文件沒有）。
改動這兩份裡的數字，要對得上 repo 的事實來源，否則閘門會紅。

### 遷移本身是一項長期工作

「把 `DECISIONS.md` 抄成 `docs/adr/` 的新格式、驗證、然後刪掉原檔」是刻意
排進長期開發的工作項，不是隨手的重構。**這一段在遷移完成、原檔刪除的那天
一併刪掉** —— 留著一段描述已不存在之過渡狀態的文字，就是 `SCOPE.md` 開頭
警告的那種手抄本。
