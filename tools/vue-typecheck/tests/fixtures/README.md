# 反向測試的 fixture

`app/` 是一份**乾淨的**假應用：`Parent.vue` 用 `Child.vue`，中間跨過
prop、帶 payload 的 slot、以及事件三種公開面。

## 為什麼 fixture 是乾淨的，壞的版本在測試裡才生出來

因為壞掉的 `.vue` 一旦簽進 repo，就會被**別的**閘門看到 ——
`eslint`（Tier 2）、無障礙那一輪、`vp check` 的格式化。
於是這份 fixture 的維護成本會變成「每加一道閘門就要多開一個例外」，
而例外永遠不會拿掉（C41）。

所以做法跟 `tools/api-surface` 一樣：**乾淨的簽進來，測試複製一份、當場改壞、
跑完刪掉**。改壞的方式寫在測試裡，是可讀的資料而不是一份靜態的壞檔案。

## 為什麼副本放在這個目錄底下，不放 `os.tmpdir()`

`vue-tsc` 要解析 `vue` 這個模組。放在 repo 外面的話，往上找不到
`tools/vue-typecheck/node_modules/vue`（`.npmrc` 是 `node-linker=isolated`，
沒有提升）。放這裡，Node 的解析自然走到本 package 的 `node_modules`。

副本目錄名一律是 `.tmp-*`，已經進 `.gitignore`。
`tests/fixtures/` 整層被 `tools/vue-typecheck` 排除在型別檢查與這道閘門之外，
所以副本存在的那幾秒鐘也不會被自己掃到。

## `env.d.ts` 裡的 `declare module "*.vue"` 不能拿掉

那是 repo 裡四個 package 都有的同一份 shim，而反向測試要問的正是
「有了這個萬用宣告，跨元件的型別檢查還剩多少」。拿掉它，測試證明的是一個
這個 repo 裡不存在的世界。
