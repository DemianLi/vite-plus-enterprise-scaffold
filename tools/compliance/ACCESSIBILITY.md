# 無障礙：驗收端與開發端的分工

> **這份檔案是產生的，不要手改。** 事實來源是 `tools/compliance/src/a11y.ts`，
> 改完跑 `node tools/compliance/src/cli.ts --update`。

對照的規範：**網站無障礙規範 110.07（對應 WCAG 2.1）**

政府機關網站新設或改版被要求的等級：**AA 以上**（立法院決議）。

## 這份文件回答的**不是**「我們達標了嗎」

達標與否由驗收端判定，而驗收端有三段，**沒有一段在 CI 裡**：

```
① 軟體檢測（Freego，掃已部署的 URL）
② 登錄申請 ＋ 自我檢測 → Freego 覆核
③ 人工檢測（專家跑鍵盤與螢幕閱讀器）→ 抽測
```

這份表回答的是：**送檢之前，哪幾格開發期就擋得掉、哪幾格結構上擋不掉。**

後者不是缺陷，是必須由人工或委外承接的部分。把它寫下來，
比裝一道假裝守得到的閘門有價值 —— 一道會回報「零問題」而其實什麼都沒檢查的閘門，
會讓所有人以為那一格有人在看。

## 成功準則 → 誰判定 → 開發期擋不擋得掉

⚠️ **這張表刻意只收 HANDOFF #22 點名的四格，不是 AA 的完整清單。**
完整對照需要規範原文（逐條的編號、名稱、等級），而那是組織輸入 ——
理由與「不寫沒有事實來源的計數」寫在 `src/a11y.ts` 的檔頭。

| 成功準則 | 名稱         | 等級 | 驗收端由誰判定   | 開發期    | 守它的    |
| -------- | ------------ | ---- | ---------------- | --------- | --------- |
| 1.4.1    | 顏色的使用   | A    | Freego、人工檢測 | ❌ 擋不掉 | —         |
| 1.4.3    | 對比（最低） | AA   | Freego、人工檢測 | ❌ 擋不掉 | —         |
| 2.4.3    | 焦點順序     | A    | 人工檢測         | ⚠️ 部分   | a11y-lint |
| 2.4.6    | 標題和標籤   | AA   | Freego、人工檢測 | ⚠️ 部分   | a11y-lint |

### 逐條註記

- **1.4.1 顏色的使用（A）** 開發期**擋不掉**，而且是量出來的：axe 的對應規則 `link-in-text-block` 在模擬 DOM（happy-dom）下落在 `incomplete` —— 規則跑了但判定不了。天真的 `expect(violations).toHaveLength(0)` 會在這種情況下亮綠燈，也就是「什麼都沒檢查」與「沒有問題」印出來一樣。
- **1.4.3 對比（最低）（AA）** 文字至少 4.5:1、大尺寸文字至少 3:1。開發期**擋不掉**：axe 的 `color-contrast` 需要 computed style 與文字節點幾何，而模擬 DOM 沒有排版。實測 happy-dom 有 `document.createRange()`，但 `getBoundingClientRect()` 回傳全零 —— **API 在、數字是假的**，這比直接沒有更難察覺。實測一段對比 1.1:1 的文字：落在 `incomplete`，不是 `violations`。
- **2.4.3 焦點順序（A）** ⚠️ **這一條連 Freego 都判定不了，是人工檢測項目。** 開發期只擋得到最粗的那一種：`vuejs-accessibility/tabindex-no-positive`（正 tabindex）。真正的失效方式 ——「DOM 順序與視覺順序不一致」「對話框的焦點沒有真的鎖住」—— 需要真瀏覽器跑鍵盤，**任何靜態或模擬 DOM 的做法都買不到**。
- **2.4.6 標題和標籤（AA）** 標籤那一半開發期擋得到（`form-control-has-label`、`label-has-for`、`heading-has-content`）。**標題階層那一半擋不到**：階層是頁面級性質，而開發期的檢查單位是元件與畫面 —— 實測 repo 裡每個畫面只有一個 `<h1>`，axe 的 `heading-order` 掃孤立畫面時永遠不適用。

## 開發期的前置過濾器實際檢查什麼

`platform/eslint-config/src/a11y.js`，跑在 Tier 1 的每一次 CI 上。
下面這份清單是**從那份設定推導的**，不是抄本 —— 升級外掛時新規則會自動進來。

⚠️ 這裡刻意**不**宣稱每條規則對應哪一條成功準則。那個對照需要規範原文，
而猜一個對照寫進交付文件，比不寫更糟。

共 23 條：

- `vuejs-accessibility/alt-text`
- `vuejs-accessibility/anchor-has-content`
- `vuejs-accessibility/aria-props`
- `vuejs-accessibility/aria-role`
- `vuejs-accessibility/aria-unsupported-elements`
- `vuejs-accessibility/click-events-have-key-events`
- `vuejs-accessibility/form-control-has-label`
- `vuejs-accessibility/heading-has-content`
- `vuejs-accessibility/iframe-has-title`
- `vuejs-accessibility/interactive-supports-focus`
- `vuejs-accessibility/label-has-for`
- `vuejs-accessibility/media-has-caption`
- `vuejs-accessibility/mouse-events-have-key-events`
- `vuejs-accessibility/no-access-key`
- `vuejs-accessibility/no-aria-hidden-on-focusable`
- `vuejs-accessibility/no-autofocus`
- `vuejs-accessibility/no-distracting-elements`
- `vuejs-accessibility/no-onchange`
- `vuejs-accessibility/no-redundant-roles`
- `vuejs-accessibility/no-role-presentation-on-focusable`
- `vuejs-accessibility/no-static-element-interactions`
- `vuejs-accessibility/role-has-required-aria-props`
- `vuejs-accessibility/tabindex-no-positive`

## 為什麼沒有在 CI 裡跑 axe-core

量過，結論是負面的（C69）：

| 量到的                                 | 結果                                     |
| -------------------------------------- | ---------------------------------------- |
| `color-contrast` 對一段 1.1:1 的文字   | 落在 `incomplete`，**不是** `violations` |
| `link-in-text-block`                   | 同樣落在 `incomplete`                    |
| `heading-order` 掃孤立畫面             | 永遠不適用（每個畫面只有一個 `<h1>`）    |
| DOM 裡有 `<iframe>`                    | axe **直接丟例外**，不是跳過             |
| happy-dom 的 `getBoundingClientRect()` | API 在，回傳全零                         |

也就是說：真正想買的兩條（1.4.1、1.4.3）在模擬 DOM 下是壞的，
而買得到的那條在元件層級沒有意義。

要讓 `color-contrast` 真的判定得了就得跑真瀏覽器，而 Vitest 的文件明寫
**CI 要跑 browser mode 就得裝 playwright 或 webdriverio** —— 也就是把瀏覽器
二進位拉進供應鏈盤點範圍。那個代價換到的東西 **Freego 在驗收時本來就會做**，
而且掃的是真正要交付的那個網站，比掃孤立元件更準。

> ⚠️ 這一段量測自己也踩到同一個坑：掃 `UiDialog` 得到「0 violations」，
> 而它在 teleport stub 底下只 render 了 81 個字元 —— **掃描對象是空的**。
> 那個綠燈是假的，而它長得跟真的一模一樣。
