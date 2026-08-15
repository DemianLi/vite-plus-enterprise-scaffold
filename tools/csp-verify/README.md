# @org/csp-verify

用**正式的 CSP（enforce）**服務**正式的建置產物**，供瀏覽器實測。
D15 的最後一項驗收，也是 R6 那條「靜態 CSP 標頭就夠」的實地確認。

## 為什麼不能用 `vp dev` 驗 CSP

dev 模式下 Vue 的 SFC 樣式是由 JS **在執行期注入 `<style>` 元素**的（HMR 需要它）。
也就是說 dev 一定會踩 `style-src 'self'` —— 而那些 violation
**在 production 完全不存在**。

拿 dev 驗只會得到一堆假警報，然後第一件事就是有人把 `securityHeaders` 外掛關掉。
（`securityHeaders()` 預設 report-only 正是為了避免這件事。）

真正的驗證只有一種形狀：**production 產物 ＋ production 政策 ＋ enforce**。

## 用法

```bash
./node_modules/.bin/vp run -F @org/console build   # 驗的必須是要部署的那一份
./node_modules/.bin/vpr bff                        # /api 會被代理過去
./node_modules/.bin/vpr csp-verify                 # http://localhost:4173
```

`/api` 走代理而不是讓瀏覽器跨源打過去：D8 要求 BFF 與 SPA 同源，
跨源的話 `connect-src 'self'` 也會擋 —— 而那是個**假的** violation。

## 「沒有 violation」不能直接當成通過

console 一片安靜也可能代表 CSP 根本沒生效。所以驗收要跑四項，
正反都要（C33 的規矩：**綠燈只證明它跑完了**）：

| 探針                   | 期望       | 證明什麼                                                          |
| ---------------------- | ---------- | ----------------------------------------------------------------- |
| JS 注入 `<style>` 元素 | **被擋**   | `style-src 'self'` 真的在 enforce                                 |
| `style` **屬性**       | **生效**   | `style-src-attr 'unsafe-inline'` 沒被誤擋（Vue 的 `:style` 靠它） |
| 外部 stylesheet        | **有載入** | 畫面真的有樣式，不是「什麼都沒作用」                              |
| inline `<script>`      | **被擋**   | `script-src 'self'` 生效，且不需要 nonce                          |

2026-08-15 的實測結果全部符合，見 `DECISIONS.md` 的 C39。

## 驗得到什麼、驗不到什麼

**驗得到**：載入、渲染、以及你在瀏覽器裡**實際點過**的互動路徑。

**驗不到沒被點到的元件。** `UiDialog` 的 violation 只有在對話框真的打開時才會出現 ——
所以驗收一定要**手動開一次對話框**，不能只看首頁載入。

`tools/ui-survey --csp` 的靜態探測與這支是**互補的**：
前者掃已發佈的 dist 找出「有這個能力」的程式碼，後者證明「執行期實際發生了什麼」。
兩個都需要。
