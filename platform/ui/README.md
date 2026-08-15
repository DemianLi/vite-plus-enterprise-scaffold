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
| `src/styles/index.css` | Tailwind 入口 ＋ 設計代幣（`@theme`）                  |
| `src/utils/cn.ts`      | class 合併。使用端能覆蓋元件樣式的前提                 |

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

⚠️ **CODEOWNERS 目前暫掛 `@org/platform-maintainers`，尚未由組織正式指派**（HANDOFF #14）。

它是唯一一個所有切片都依賴的 UI package，owner 等於
「誰有權改變全公司產品的長相」—— 那不是技術問題。

## 開發

```bash
pnpm vp run -F @org/ui test
```
