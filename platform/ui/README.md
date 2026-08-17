# @org/ui

設計系統：**reka-ui 基元 ＋ Tailwind v4 樣式，元件原始碼由本 repo 擁有**（D15）。

## 為什麼元件住在這裡

shadcn 的模型是「你擁有原始碼」，所以「複製到哪」是一個必須回答的架構問題。
**D4 已經把答案決定了**：

- 複製進每個切片 → 每片各有一份 Button／Dialog，而切片禁止互相依賴，
  **沒有任何機制能讓它們收斂**。設計系統會在第二個切片出現的那天碎片化，
  而且沒有人會發現 —— 每一片自己看起來都是對的。
- 放這裡 → 走既有的 platform 治理：CODEOWNERS、api-surface 的破壞性變更閘門、
  退出演練的 alias 清單。多的是流程，不是新的架構概念。

所以這不是「選 A 或 B」，是「D4 成立的話只剩一個答案」。

## 結構

| 路徑                   | 職責                                                   |
| ---------------------- | ------------------------------------------------------ |
| `src/index.ts`         | 唯一公開契約。`tools/api-surface` 盯著這份 export 清單 |
| `src/components/`      | 元件原始碼。**改行為就是改這裡**，沒有上游可以問       |
| `src/styles/index.css` | Tailwind 入口 ＋ 設計代幣（`@theme`），分兩層          |
| `src/theme.ts`         | 各案覆寫 variant／size 的擴充點（`createUiTheme`）     |
| `src/utils/cn.ts`      | class 合併。使用端能覆蓋元件樣式的前提                 |

## 各案要換配色或形狀：改你自己的 app，不要改這裡

C62 的產品要求是「一套基礎版型，各案可以換配色／形狀／互動」。**三條軸都在
2026-08-17 接起來了**（HANDOFF #24）。前兩條靠代幣與 `createUiTheme`（下面），
第三條靠 slot —— 互動是結構不是值，代幣換不了它（見文末）。

```css
/* apps/<你的案子>/src/styles.css */
@import "@org/ui/styles.css";

@theme {
  --color-brand-600: oklch(0.55 0.18 173); /* 色票層：語意代幣跟著走 */
  --color-line: oklch(0.85 0.02 173); /* 語意層：只換這一個用途 */
  --radius-control: 0.5rem; /* 形狀 */
}
```

```ts
// apps/<你的案子>/src/main.ts —— 換整條 variant，代幣做不到的那一半
createApp(App).use(createUiTheme({ variants: { secondary: "bg-surface-hover text-fg" } }));
```

| 層   | 例                                                   | 覆寫它會影響                      |
| ---- | ---------------------------------------------------- | --------------------------------- |
| 色票 | `--color-brand-600`、`--color-danger-500`            | 所有指向它的語意代幣一起變        |
| 語意 | `--color-accent`、`--color-line`、`--radius-control` | 只有那一個用途                    |
| 組合 | `createUiTheme({ variants })`                        | 整條 class 字串，代幣換不掉的部分 |

兩層之間的間接是**活的**（實測：Tailwind 把 `var(--color-brand-600)` 原樣寫進
`:root`，不在建置期求值）。這件事由 `tools/theme-verify` 真的建置兩次去比對 ——
一支只 grep `@theme` 有沒有寫的測試量的是「有沒有寫」，不是「有沒有生效」。

⚠️ **覆寫的 class 字串必須寫在 `.ts` 或 `.vue` 裡。** `@source` 只掃這兩種副檔名，
搬進 JSON 或環境變數的話 Tailwind 掃不到、**也不會報錯**，產出的 CSS 少掉那些
類別而建置全綠 —— 與下面第一個坑同一種症狀。

⚠️ **`variant` 只能替換，不能新增。** 它是 prop 型別，開放任意字串等於讓打錯字
靜靜退回預設樣式。真的需要第五個 variant 就是 `platform/ui` 的 PR，
而那會被 `api-surface` 判成破壞性變更（下游若有自己的 `Record<UiVariant, …>`
就編不過）—— 那個代價是對的，所有案子都會拿到它，該有人看過。

## 三個踩過的坑，都留了測試

### 一、`@source` 不寫就等於沒編譯，而建置是綠的

Tailwind v4 的自動來源偵測**刻意跳過 node_modules**，而 monorepo 裡所有東西
都是透過 symlink 消費的。少了 `@source`，實測結果是：

> 建置成功、CSS 從 160 bytes 變成 **4409 bytes**、退出碼 0 ——
> **而裡面一個 utility 都沒有。** 那 4.4 kB 全是 base reset。

也就是說「CSS 變大了」不能當作它有在編譯的證據。加上 `@source` 之後
同一份程式碼產出 **12.25 kB**。

### 二、`@source` 用固定相對路徑會在退出演練裡靜靜失效

第二版寫 `@source "../../../../features"`。在這個 repo 完全正確 ——
但退出演練會把 package 複製到 `packages/ui/`，那個路徑就指向不存在的地方，
**而 Tailwind 不會為此報錯**，只是少掃一整層。

改成從根目錄往下的單一 glob，兩種佈局都成立。
`tests/styles.test.ts` 要求 `@source` **必須是能跨出本 package 的 glob**。

### 三、去 CSS 註解時會把 glob 吃掉

```
@source "../../../../**/*.{vue,ts}";
                     ↑ 這裡的 /**/ 是一個合法的 CSS 空註解
```

天真的去註解器把路徑刨掉一層，於是**測試看到的宣告與 Tailwind 看到的不是同一個東西**，
兩邊都不報錯。測試裡的去註解器因此要先認得引號字串。

## 禁止事項（由閘門強制）

| 規則                                                    | 在哪強制                                      | 為什麼                                                                       |
| ------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| 不得 import reka-ui 的 **Splitter**                     | `tools/conformance`                           | 它是 reka-ui 唯一會在執行期注入 `<style>` 的地方，被 `style-src 'self'` 擋掉 |
| 切片不得直接 import `reka-ui`／`clsx`／`tailwind-merge` | `tools/conformance`                           | 一律走 `@org/ui`，否則每個團隊各長一套設計系統                               |
| 切片**至少一處**使用 `@org/ui`                          | `tools/conformance`                           | 上一條擋「繞過」，這條擋「根本不用」——**沒有 import 也是一種發散**（C41）    |
| `index.ts` 不得 `export *`、不得轉出 reka-ui            | `tests/styles.test.ts` ＋ `tools/api-surface` | API 表面必須可枚舉，否則破壞性變更閘門看不見它守的東西                       |

「至少一處使用」那條的判定式是 `@org/slice-kit/contract` 的 `usesDesignSystem()`，
由 `tools/conformance` 與 `tools/slice-gen` 的測試**共用同一份實作** ——
產生器的模板一旦忘了 `@org/ui`，新切片就會全部從設計系統外面開始，
而那是不會有任何東西變紅的（D15 落地當下就是這個狀態，見 C41）。

## 擁有權

✅ **`@org/platform-maintainers`（由 `/platform/` 通則涵蓋）。已於 2026-08-16
正式決定，不再是暫掛** —— HANDOFF #14、`DECISIONS.md` 的 C62。

它是唯一一個所有切片都依賴的 UI package，owner 等於
「誰有權改變全公司產品的長相」—— 那不是技術問題。

⚠️ **這個決定沒有買到的東西**：歸屬清楚了，**設計與無障礙的職能沒有**。
`platform-maintainers` 是平台工程角色。HANDOFF #22 那四個行為面缺口
（焦點順序、對比度、標題階層、只靠顏色傳達狀態）靜態閘門看不見，
而現在也沒有具名的人在看。在 CODEOWNERS 加一列**買不回來** ——
同一列多個 owner 是「任一核准即可」，見 HANDOFF #25。

✅ **三條軸都接上了**（HANDOFF #24，2026-08-17）：

| 軸       | 接縫                                            | 守它的         | 守到什麼程度                     |
| -------- | ----------------------------------------------- | -------------- | -------------------------------- |
| 配色     | 兩層 `@theme` 代幣                              | `theme-verify` | **實測可換**（真的建置兩次比對） |
| 形狀     | `createUiTheme({ variants, sizes })` ＋ 代幣    | `theme-verify` | **實測可換**（同上）             |
| 互動方式 | `UiDialog` 的 `default`／`footer`／`close` slot | `api-surface`  | 只有**改了會漂移**，見下         |

⚠️ **第三列比前兩列薄，不要把三列讀成同一件事。** `theme-verify` 是真的建置
兩次去證明「換得掉」；`api-surface` 證明的是「這幾格是公開面，改了會被看到」——
**沒有任何東西證明某個案子真的能不 fork 就換掉 `UiDialog` 的互動**。
會不會夠用，第二個案子提出需求時才知道。

互動那條不是靠代幣換的，是靠**組合**：`footer` 換整組收尾動作、`close` 只換
那顆按鈕（外層仍是 reka-ui 的 `DialogClose`，鍵盤與焦點行為不變）。

⚠️ **那三個 slot 從落地那天就存在，但到 2026-08-17 為止沒有被記錄過。**
當時的限制寫著「加 `defineEmits`／`defineSlots`／`defineExpose` 會讓
`api-surface` 直接丟例外」，而那道絆線絆的是**巨集的名字**，不是公開面 ——
實測往模板加一個具名 slot、加一個 `$emit`，閘門兩次都全綠。現在 slot 與 emit
都要宣告，宣告與模板不一致會直接紅。只剩 `defineExpose` 仍然擋著
（`<script setup>` 預設封閉，那道絆線是真的）。見 C67。

⚠️ **另一個仍然開著的洞：`vp check` 不對 `.vue` 做型別檢查。** 實測
`const broken: number = "字串"` 放在 SFC 裡是 0 errors、放在 `.ts` 裡是 1 error。
所以這個 package 的元件原始碼**沒有任何型別檢查在跑**，
`api-surface` 抽 props／slot／emit 形狀是唯一看得到它們的東西 ——
而它是**原文比對**，不是型別檢查：`defineSlots` 裡寫的 `VNode[]` 沒有人在驗。
記在 HANDOFF #26。

## 開發

```bash
pnpm vp run -F @org/ui test
```
