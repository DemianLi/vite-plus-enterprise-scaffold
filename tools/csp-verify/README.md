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

## 重驗一次（需要人開瀏覽器）

```bash
./node_modules/.bin/vp run -F @org/console build   # 驗的必須是要部署的那一份
./node_modules/.bin/vpr bff                        # /api 會被代理過去
node tools/csp-verify/src/cli.ts                   # http://localhost:4173
node tools/csp-verify/src/cli.ts --print-probe > /tmp/probe.js
```

開 http://localhost:4173、登入，把 `probe.js` 貼進 console，
把印出來的 JSON 存成 `capture.json`，然後：

```bash
node tools/csp-verify/src/cli.ts --record capture.json
```

`/api` 走代理而不是讓瀏覽器跨源打過去：D8 要求 BFF 與 SPA 同源，
跨源的話 `connect-src 'self'` 也會擋 —— 而那是個**假的** violation。

## CI 守的是有效期，不是 CSP

```bash
node tools/csp-verify/src/cli.ts --verify
```

CSP 只有真的瀏覽器 CSP 引擎驗得了（happy-dom 與 jsdom 都沒實作它，
拿它們跑會得到一份「全部通過」而什麼都沒驗），而裝 Playwright 等於把瀏覽器
二進位拉進 `tools/supply-chain` 的盤點範圍。所以形狀比照 `tools/exit-drill`：
**人跑一次，機器守它的有效期。**

失效條件是**指紋**，不是日曆 —— 日曆過期每季紅一次而通常什麼都沒變，
那種紅燈會被關掉。指紋 ＝ CSP 政策字串 ＋ `FINGERPRINT_PACKAGES` 列的那些
會在執行期注入 `<style>`／script 的相依版本。改 `policy.ts`、
升 `reka-ui`／`vue`／`tailwindcss`，這道閘門就會紅並要求重驗。

⚠️ **瀏覽器自己改版時指紋不會動。** 這是真的洞，沒有補：Chromium 每四週發一版，
拿它當閘門等於每四週紅一次。證據檔記錄驗證當時的瀏覽器（`Chrome 148`），
讓人知道結論是對著誰成立的。

## 「沒有 violation」不能直接當成通過

console 一片安靜也可能代表 CSP 根本沒生效。所以探針有五項，
正反都要（C33 的規矩：**綠燈只證明它跑完了**）：

| 探針                   | 期望             | 證明什麼                                                          |
| ---------------------- | ---------------- | ----------------------------------------------------------------- |
| JS 注入 `<style>` 元素 | **被擋**         | `style-src 'self'` 真的在 enforce                                 |
| `style` **屬性**       | **生效**         | `style-src-attr 'unsafe-inline'` 沒被誤擋（Vue 的 `:style` 靠它） |
| 外部 stylesheet        | **有載入**       | 畫面真的有樣式，不是「什麼都沒作用」                              |
| inline `<script>`      | **被擋**         | `script-src 'self'` 生效，且不需要 nonce                          |
| `UiDialog` 開啟        | **零 violation** | 對話框在 enforce 下完整運作，且沒有執行期注入的 `<style>`         |

前兩項與後兩項的差別要說清楚：**「被擋」與「注入的程式碼根本沒跑」在觀測上
一模一樣**。所以判定要求同時有對應的 violation，而且 `disposition === "enforce"` ——
那是整份證據唯一機器驗得出「不是 report-only」的地方。

`passed` 一律由 `evaluate()` 從原始觀測推導，**不接受人手寫**：
少了這一層，證據檔就從量測退化成主張，而主張不用開瀏覽器就寫得出來。

而且 `--verify` 會**再重算一次**。只在 `--record` 那一刻推導等於沒有推導 ——
事後把 `evidence.json` 裡的 `passed: false` 改成 `true` 就能讓 CI 變綠，
那樣這道閘門就變成它自己在防的那個東西。

實測結果在 `evidence.json`（進版控），論證見 `DECISIONS.md` 的 C39 與 C47。

## 驗得到什麼、驗不到什麼

**驗得到**：載入、渲染、以及你在瀏覽器裡**實際點過**的互動路徑。

**驗不到沒被點到的元件。** `UiDialog` 的 violation 只有在對話框真的打開時才會出現 ——
探針腳本因此會逐一按下畫面上的按鈕直到出現 `[role="dialog"]`，
而「對話框有打開」是那一條探針的**前提**：沒打開的話，「零 violation」
只代表沒有東西跑過。

`tools/ui-survey --csp` 的靜態探測與這支是**互補的**：
前者掃已發佈的 dist 找出「有這個能力」的程式碼，後者證明「執行期實際發生了什麼」。
兩個都需要。
