// ── 模板裡的 `$t` 是一個相依，而它不長得像相依（C68）─────────────────
//
// `$t` 由 vue-i18n augment 到 `ComponentCustomProperties` 上。少了這一行，
// 這個切片**單獨拿出來型別檢查會噴一整排 TS2339**，而在 apps/console 的
// program 裡是 0 條 —— 因為 console 的 main.ts 有 `import { createI18n }`。
//
// ⚠️ 實測過三種寫法，只有這一種有效（package.json 宣告、`/// <reference>`
// 都無效）。而這一行的另一半價值是它**是一個 import** —— 幽靈相依檢查讀
// import，所以補完之後這個相依從此有人守。
//
// ⚠️ **為什麼自己一個檔案。** 併進 env.d.ts 會讓那個檔案變成模組，
// 於是裡面的 `declare module "*.vue"` 不再是環境宣告。實測時就是這樣紅的，
// 而且**只有 tsgolint 紅、vue-tsc 全綠** —— vue-tsc 真的解析 `.vue`，
// 根本不需要那個 shim。一行 import 的位置會決定另一支工具看不看得見半個切片。
import type {} from "vue-i18n";
