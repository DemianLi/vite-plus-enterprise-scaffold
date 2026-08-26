# 樣式與 UI 元件庫市調（HANDOFF #14 的決策依據）

> 調查日：**2026-08-15**。所有數字由 npm registry 與實際下載的 tarball 推導，
> 不是抄自比較文章 —— 本次調查一開始搜到的四篇「2026 最佳 Vue UI 函式庫」
> **全部把 PrimeVue 列為企業首選**，而 PrimeVue 已於 2026-06-28 改為商業授權。
>
> 重測方式全部留在本文件，可以重跑。

## 為什麼不能照抄一般的比較文章

排名文章比的是元件數、star 數、好不好看。這份腳手架的約束不在那裡：

| 本 repo 的既有約束                            | 對選型的實際意義                                                |
| --------------------------------------------- | --------------------------------------------------------------- |
| CSP `style-src 'self'`（無 nonce）            | **執行期注入 `<style>` 元素的函式庫會被瀏覽器擋掉**             |
| 建置產物零 inline script（R6 前提）           | 不能為了 UI 函式庫而引入 per-request 改寫 HTML 的中間層         |
| 供應鏈閘門（712 套件／144 原生二進位進版控）  | 每個新相依都要進盤點；新的**原生二進位家族**要 PR ＋ CODEOWNERS |
| 封閉網路（HANDOFF #5／#6）                    | 新套件必須在公網側跑 `--capture` 再一起送進來                   |
| 法務已在追 MPL-2.0 與無授權聲明（HANDOFF #4） | 新的授權類別會擴大那一項的範圍                                  |
| D4：切片禁止互相依賴                          | **複製原始碼型**的元件庫會逼出「元件放哪」的架構決定            |
| 退出演練的 plugin 帳目（C36）                 | 任何影響建置產物的 vite plugin 都要登記                         |

---

## 一、先淘汰：撞到硬約束的

| 候選                | 淘汰原因                                                                                                                                                         | 證據                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **PrimeVue v5**     | **已非開源**。v5.0.0-rc.1（2026-06-28）起 license 欄位由 `MIT` 改為 `SEE LICENSE IN LICENSE.md`，相依含 `@primeui/license-manager`                               | 見下方〈PrimeVue 授權變更〉                                                 |
| **naive-ui**        | CSS-in-JS 是**核心機制**（相依 `css-render`、`@css-render/plugin-bem`）。注入點在主 bundle `dist/index.js`，**全套件零處提及 nonce** → 直接撞 `style-src 'self'` | tarball 靜態 CSS 檔 **0** 個、`createElement("style")` 出現在 4 個主 bundle |
| **ant-design-vue**  | **12 個月零穩定版發版**（最後 4.2.6，2024-11-11）。且用 `@emotion/hash` + `stylis` → 同樣 CSS-in-JS                                                              | registry `time` 欄位                                                        |
| **radix-vue**       | 已更名為 reka-ui，**12 個月零發版**（最後 1.9.17，2025-02-28）                                                                                                   | 同上                                                                        |
| **@headlessui/vue** | 穩定版停在 1.7.23（**2024-09-09**）。之後只有 `insiders` 預發版                                                                                                  | dist-tags 只有 `latest` 與 `insiders`                                       |
| **@nuxt/ui**        | **65 個直接相依**（含整套 tiptap 編輯器、embla carousel、ai），且耦合 `@nuxt/kit`／`@nuxt/schema`                                                                | package.json                                                                |
| **Quasar**          | 自帶建置系統與 CLI，與 vite-plus 的驅動層定位衝突（D2）                                                                                                          | —                                                                           |

### PrimeVue 授權變更（法務會問，先查到底）

license 欄位的變化點：

| 版本                              | license 欄位                | 日期           |
| --------------------------------- | --------------------------- | -------------- |
| v1 – v4                           | `MIT`                       | 2019 – 2024    |
| **v4.5.5（最後一個 MIT 穩定版）** | `MIT`                       | **2026-04-08** |
| **v5.0.0-rc.1 起**                | `SEE LICENSE IN LICENSE.md` | **2026-06-28** |

**實際隨 `primevue@5.0.1` tarball 發佈的 `LICENSE.md`** 寫著：

> This package is part of **PrimeUI**, a family of commercial UI libraries by PrimeTek Informatics.
>
> Community License（免費）條件為：年營收 < 100 萬美元、開發者 < 5 人、
> 員工 < 10 人、外部資金 < 300 萬美元。
>
> A valid license key is required to use this software.
>
> This software is distributed as a compiled package. You may not reverse-engineer,
> decompile, or extract its source code…

⚠️ **一個看起來像矛盾的地方，先解釋掉**：GitHub `master` 的 `LICENSE.md` 仍是純 MIT。
廠商官網（`primeui.dev/licenses/community`，最後更新 2026-07-02）說明了原因 ——
「Open source projects are welcome to use the MIT-licensed versions of our libraries
(PrimeNG 21, **PrimeVue 4**, PrimeReact 10, and earlier)」。
**repo 上那份是 v4 線的，v5 的套件自帶另一份。** 以 tarball 內容為準。

對本 repo 的意義：**v5 不能用**（除非組織採購），v4.5.5 可用但已進入維護末期。

---

## 二、存活者

### 發版活躍度（**只計穩定版**，排除 prerelease）

| 套件           | 最新穩定版 | 日期       | 穩定版／年 |
| -------------- | ---------- | ---------- | ---------- |
| `vuetify`      | 4.1.9      | 2026-08-13 | **59**     |
| `quasar`       | 2.24.0     | 2026-08-05 | 26         |
| `element-plus` | 2.14.4     | 2026-08-07 | **23**     |
| `reka-ui`      | 2.10.2     | 2026-08-10 | **23**     |
| `tailwindcss`  | 4.3.3      | 2026-07-16 | 17         |
| `unocss`       | 66.7.5     | 2026-07-07 | 25         |
| `naive-ui`     | 2.44.1     | 2026-03-08 | 5          |

> 這張表第一版是錯的：把 `insiders`／nightly 預發版也算進去，於是
> `@headlessui/vue` 顯示「31 版/年」而它的穩定版其實兩年沒動、
> `tailwindcss` 顯示「418 版/年」。**只算穩定版才反映維護狀態。**

### CSP 相容性（本 repo 的決勝軸）

方法：下載 tarball，找 `createElement("style")`／`insertRule`／`adoptedStyleSheets`，
再讀出那些程式碼實際在做什麼。

| 套件             | 靜態 CSS      | 執行期注入        | nonce       | 判定                      | 證據層級     |
| ---------------- | ------------- | ----------------- | ----------- | ------------------------- | ------------ |
| **element-plus** | 123 檔        | **0 處**          | 不需要      | ✅ 直接相容               | **已驗證**   |
| **reka-ui**      | 0（headless） | **只有 Splitter** | ✅ **支援** | ✅ 不用 Splitter 即零注入 | **已驗證**   |
| vuetify          | 132 檔        | 主題系統          | ✅ 6 檔提及 | ⚠️ 需設定                 | 需瀏覽器實測 |
| naive-ui         | 0 檔          | 主 bundle         | ❌ 零處     | ❌ 撞 CSP                 | 需瀏覽器實測 |
| primevue v5      | 0 檔          | 12 處             | —           | （授權已淘汰）            | —            |

**reka-ui 的完整證據**（`dist/utils/style.js`，唯一的注入點）：

```js
function setGlobalCursorStyle(state, constraintFlags, nonce) {
  if (styleElement === null) {
    styleElement = document.createElement("style");
    if (nonce) styleElement.nonce = nonce; // ← 支援 nonce
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = `*{cursor: ${style}!important;}`;
}
```

只被 `Splitter/SplitterGroup.js` 使用，作用是拖曳時的全域游標。
**不使用 Splitter 元件 → 整個函式庫零執行期樣式注入。**

> ⚠️ **這個探測是什麼、不是什麼**：它證明「發佈的程式碼裡有這個能力」，
> 不證明「執行期一定會發生」—— tree-shaking 可能移除它，沒 import 的元件不會執行。
> `element-plus` 的零與 `reka-ui` 的定位是讀過原始碼的**已驗證**結論；
> `vuetify` 與 `naive-ui` 兩列只做到 grep，**選定後必須開瀏覽器套上真實 CSP 再驗一次**。

### 供應鏈成本（`npm --package-lock-only` 解析，基線含 vite-plus）

| 方案                               | 新增套件 | 新增原生二進位 | 新家族                                       | 授權旗標             |
| ---------------------------------- | -------- | -------------- | -------------------------------------------- | -------------------- |
| **vuetify**                        | **+1**   | 0              | —                                            | 無                   |
| **reka-ui**                        | **+19**  | 0              | —                                            | 0BSD ×1              |
| **element-plus**                   | **+21**  | 0              | —                                            | **無**               |
| 只加 Tailwind                      | +42      | **+23**        | `@tailwindcss/oxide` ×12、`lightningcss` ×11 | MPL-2.0 ×12          |
| reka-ui ＋ Tailwind（shadcn 組合） | **+61**  | **+23**        | 同上                                         | 0BSD ×2、MPL-2.0 ×12 |

> 基線必須含 `vite-plus`。第一版沒有，於是 npm 為了滿足 `@tailwindcss/vite` 的
> peer 把上游 vite 也裝進來，`@rolldown/binding` 的 14 個原生二進位被算成「新增」——
> 而那些本 repo 早就有。**+96／49 原生是錯的，正確是 +61／23。**

**Tailwind 那 11 個 `lightningcss` 是第二份**：`@tailwindcss/node` 釘死
exact `1.32.0`，而 `vite-plus-core` 要 `^1.33.0`，範圍不相交、無法合併。
後果直接落在 HANDOFF #4：MPL-2.0 的範圍從「11 個」變成**兩個版本各一組**。

---

## 三、三條路

### A. element-plus —— 相依型，設計系統直接拿

- ✅ CSP 零風險（已驗證：0 處注入、123 個靜態 CSS 檔）
- ✅ 供應鏈最乾淨的有樣式方案：+21 套件、**0 原生二進位、0 授權旗標**
- ✅ 活躍（23 穩定版／年，最後 2026-08-07）、MIT、80+ 元件
- ✅ 不需要新的 vite plugin → **退出演練的 plugin 帳目不用動**
- ❌ 外觀就是 Element 的樣子，客製要覆寫 CSS 變數
- ❌ 41 MB 解壓體積
- ❌ 治理方在中國（部分組織的供應商政策會過問）

### B. reka-ui ＋ 自己的 CSS —— headless，設計系統自己長

- ✅ CSP 零風險（已驗證，且唯一注入點支援 nonce 又可避開）
- ✅ 供應鏈最小的元件方案：+19 套件、0 原生二進位
- ✅ 無障礙是它的賣點（WAI-ARIA 實作），活躍（23 版／年）、MIT
- ✅ 不需要 Tailwind —— **可以配現在的 `<style scoped>` 用**
- ❌ 樣式全部自己寫，第一個元件的成本最高
- ❌ 沒有現成的設計系統，等於團隊要自己維護一套

### C. shadcn-vue（reka-ui ＋ Tailwind ＋ 複製原始碼）

- ✅ 生態最熱、範例最多、AI 工具支援最好
- ✅ 元件原始碼在自己 repo 裡，可以任意改
- ❌ **供應鏈成本是 A/B 的三倍**：+61 套件、+23 原生二進位、新家族要走 PR
- ❌ **MPL-2.0 範圍翻倍**（lightningcss 兩個版本），HANDOFF #4 要重談
- ❌ 封閉網路要重跑 `--capture`，`vpr airgap` 的平台矩陣要重算
- ❌ 需要 `@tailwindcss/vite` → **退出演練的 `DRILL_PLUGINS` 必須登記**
- ❌ **D4 的架構問題**：複製進來的元件放哪？進切片 → 設計系統碎片化且
  切片禁互依、沒有收斂機制；抽 `platform/ui` → 新增一個全體依賴的 package，
  要 CODEOWNERS、要進 api-surface、要進退出演練的 alias 清單。
  且 `checkSliceLayering` 目前**管不到**切片裡的 `components/`

> Tailwind 本身在 vite-plus 下**確認可用**（2026-08-15 實測：`vp build` exit 0、
> 4.42 kB CSS、探針 utility 全中且未使用的不會被塞進去）。技術上沒有阻礙，
> 成本全部在供應鏈與架構那一側。

---

## 四、還沒查、選定後必須做的

1. **瀏覽器實測 CSP**：套上 `@org/security-headers` 的真實政策跑一遍，
   確認沒有 violation。grep 只證明能力，不證明執行期行為。
2. ~~**無障礙驗收標準**：若組織有 WCAG 要求，element-plus 與 reka-ui 的
   實際符合度要各自驗，不能靠宣稱。~~ **這句條件句寫完就沒有再往下走，
   而它是 2026-08-16 才被發現的（HANDOFF 第 22 項）。**

   選型的部分已經沒有懸念：走的是 reka-ui，而它的 WAI-ARIA 實作是它的賣點。
   但**元件庫有無障礙 ≠ 你用它拼出來的頁面有無障礙** —— 缺 label 的表單、
   只靠顏色傳達的狀態、跳號的標題階層、不經過 reka-ui 的自寫互動，
   元件庫一個都管不到，而在那之前**沒有任何東西在守**。

   已補一道靜態閘門（`vpr a11y`，見 [HANDOFF 第 22 項](HANDOFF.md)）。
   ⚠️ 它守的是**靜態可查的那一半**，而那一半在本 repo 的寫法下幾乎是空的：
   實測對全部 `.vue` 零命中，同一批檔案用人眼讀出四個真缺陷它一個都沒報。

   ⚠️ **要哪個等級、驗收怎麼判，仍然懸著，而且刻意不在這裡寫死** ——
   以 RFP 為準。這一條與下面第 3 點不同：第 3 點是我們自己決定的，
   這一條的事實來源在契約那一側。

3. **`checkSliceLayering` 要不要管 `components/`**：三條路都會讓切片裡多出
   元件目錄，而目前沒有任何規則管它。

## 五、決策結果

**2026-08-15 決定走 C（shadcn-vue）**，元件原始碼統一住 `platform/ui`。
完整理由與強制帶出的四件實作待辦見 [`DECISIONS.md`](DECISIONS.md) 的 **D15**。

元件位置不是另一個選擇題：D4 禁止切片互依，複製進每片就沒有收斂機制，
`platform/ui` 是唯一活得下來的答案。

✅ **2026-08-16，最後一格也裁決了**：`platform/ui` 維持 `/platform/` 通則
（`@org/platform-maintainers`），CODEOWNERS 零 diff。理由與它**買不到什麼**
見 `DECISIONS.md` 的 **C62**、HANDOFF 第 14 項。

⚠️ 那次決策順帶量出一件本市調沒有問過的事：D15 選 shadcn-vue 的論證是
「元件原始碼是我們的，要改就改」—— 但這份市調從來沒有問**各案之間要不要
能長得不一樣**。實際的產品要求是「基礎共用、配色／形狀／互動逐案可換」，
而當時三條軸只有一條有接縫、且只覆蓋 16 處顏色宣告裡的 5 處。

✅ **2026-08-17 三條軸都接上了**（HANDOFF **第 24 項**，那裡附了重新推導
這些數字的指令）：配色與形狀走兩層代幣 ＋ `createUiTheme`，由
`tools/theme-verify` 實測守著；互動走 slot，由 `tools/api-surface` 守著。
**重新評估 UI 方案時，這一題仍然要一起問** —— multi-brand 的需求會改變評分，
而現在本 repo 對「可換性」有一組可以拿來當評分項的實測。

---

## 六、重跑本調查

```bash
# 授權、發版活躍度、直接相依
# 已移至 tools/supply-chain 並重新瞄準到實際相依（D16 / C45）
node tools/supply-chain/src/cli.ts --capture-health

# 執行期 <style> 注入探測
node tools/ui-survey/src/cli.ts --csp

# 供應鏈增量（基線含 vite-plus）
node tools/ui-survey/src/cli.ts --sca
```

這些數字**會過期** —— 授權會變（PrimeVue 就在 2026-06-28 變了）、專案會停止維護、
供應鏈成本會隨版本改變。**重新評估時重跑，不要重讀。**
