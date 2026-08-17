// ── 模板裡的 `$t` 是一個相依，而它不長得像相依（C68）─────────────────
//
// `$t` 由 vue-i18n augment 到 `ComponentCustomProperties` 上。少了這一行，
// 這個切片**單獨拿出來型別檢查會噴一整排 TS2339**，而它在 apps/console 的
// program 裡是 0 條 —— 因為 console 的 main.ts 有 `import { createI18n }`，
// augmentation 是被那句帶進去的。同一個檔案，兩個程式，兩種結果。
//
// ⚠️ 實測過三種寫法，只有這一種有效：
//     package.json 宣告 vue-i18n           → 仍然 10 條
//     /// <reference types="vue-i18n" />   → 仍然 10 條
//     import type {} from "vue-i18n"       → 0 條
//
// 而這一行的另一半價值是**它是一個 import**：`tools/conformance` 的幽靈相依
// 檢查讀 import，所以補完之後這個相依從此有人守。在此之前它看不見 ——
// 全域屬性不是 import，那正是它躲過所有閘門的原因。
//
// ⚠️ **為什麼自己一個檔案，不併進 env.d.ts。** 併進去會讓 `env.d.ts` 從
// 全域腳本變成一個**模組**，而模組裡的 `declare module "*.vue"` 不再是環境
// 宣告 —— 於是 `routes.ts` 的 `import("./views/OrderList.vue")` 當場找不到模組。
// 實測時就是這樣紅的，而且**只有 tsgolint 紅、vue-tsc 全綠**：vue-tsc 真的
// 解析 `.vue`，根本不需要那個 shim。一行 import 的位置會決定另一支工具看不看
// 得見半個 repo。
import type {} from "vue-i18n";
