# @org/ui-survey

UI／樣式選型的市調工具。產出 [`UI-SURVEY.md`](../../UI-SURVEY.md) 裡的每一個數字，
決策結果是 [`DECISIONS.md`](../../DECISIONS.md) 的 **D15**。

## 為什麼選型要有一支工具

「為什麼不用 PrimeVue？」半年後會被問第二次。那時候一份靜態文件只能被相信，
不能被重驗 —— 而這些數字**保證會過期**：

- **授權會變。** PrimeVue 在 2026-06-28（v5.0.0-rc.1）從 MIT 改成商業授權。
- **專案會停更。** `ant-design-vue` 與 `@headlessui/vue` 都是 12 個月零穩定版。
- **供應鏈成本會隨版本改變。**

與 `vpr sca-dossier`／`vpr mirror-manifest` 同一個原則：
**給外部團隊看的數字一律由機器算，不是抄的。**

## 三個子命令

```bash
node tools/ui-survey/src/cli.ts --registry   # 授權、發版活躍度、直接相依
node tools/ui-survey/src/cli.ts --csp        # 執行期 <style> 注入探測
node tools/ui-survey/src/cli.ts --sca        # 供應鏈增量
```

⚠️ **全部需要公網，而且刻意不進 gate。** 這是決策期的工具，不是閘門 ——
排進 CI 只會讓 CI 在 registry 抖動時變紅，而它守不住任何東西。

## CSP 探測：本 repo 的決勝軸

一般的 UI 函式庫比較文章比元件數與好不好看。這支工具比的是
`@org/security-headers` 的政策擋不擋得住它：

| 政策                             | 意義                                    |
| -------------------------------- | --------------------------------------- |
| `style-src 'self'`               | 靜態 stylesheet ✅                      |
| `style-src-attr 'unsafe-inline'` | Vue 的 `:style`（屬性）✅               |
| —                                | **執行期插入的 `<style>` 元素 ❌ 被擋** |

CSS-in-JS 的函式庫（naive-ui 的 `css-render`、ant-design-vue 的 emotion）
核心機制就是第三項，而沒有一篇比較文章提過這件事。

判定分四級而不是二分，因為「注入 8 處」與「注入在核心路徑」意義完全不同：

| 判定          | 意思                                                |
| ------------- | --------------------------------------------------- |
| `clean`       | 零注入                                              |
| `avoidable`   | 注入集中在單一可以不用的元件（reka-ui 的 Splitter） |
| `needs-nonce` | 注入在核心路徑但支援 nonce → R6 的成本級距往上跳    |
| `blocked`     | 注入在核心路徑且零 nonce 支援                       |

> ⚠️ 探測掃的是**已發佈的 dist**，證明「有這個能力」，
> **不證明執行期會發生** —— tree-shaking 可能移除它，沒 import 的元件不會執行。
> 選定之後必須開瀏覽器套上真實政策再驗一次。

## 授權判定為什麼不是二分

它**不做**「MIT 放行、其他擋掉」。非常見授權會被標成
「**去把實際發佈的 tarball 裡那份讀出來**」，因為那才是唯一權威的來源：

PrimeVue 的 registry `license` 欄位只寫 `SEE LICENSE IN LICENSE.md`，
而 **GitHub `master` 的 `LICENSE.md` 到今天仍然是純 MIT**（那份是 v4 線的）。
只有 tarball 裡那一份寫著商業條款。

這與 `@yuku-*` 那次（HANDOFF #4）是同一個失敗模式：
**中繼資料與實際內容不一致，而人只讀中繼資料。**

## 兩個第一版就算錯的地方（都釘了測試）

**一、發版活躍度必須只算穩定版。** 把 `insiders`／nightly 預發版也算進去，
`@headlessui/vue` 會顯示「31 版/年」—— 而它的穩定版停在 2024-09-09。
錯的方向剛好是**把停更兩年的專案顯示成最活躍的那個**。

**二、供應鏈基線必須含 `vite-plus`。** 少了它，npm 為了滿足
`@tailwindcss/vite` 的 peer 會把上游 vite 也裝進來，`@rolldown/binding`
的 14 個原生二進位被算成「新增」—— 而那些本 repo 早就有。
錯誤結果是 +96 套件／49 原生，正確是 **+61／23**。

兩者都在 `tests/survey.test.ts` 裡有測試釘住。

## 開發

```bash
pnpm vp run -F @org/ui-survey test
```
