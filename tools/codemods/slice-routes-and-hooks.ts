import type { Codemod } from "./run.ts";

/**
 * 切片契約的兩處改名（C240，Q89–Q91）：
 *
 *   `import type { RouteRecordRaw } from "vue-router"` → `import type { SliceRoute } from "@org/slice-kit"`
 *   `COMPOSABLES_DIR`／`isValidComposableFile`／`composableFunctionName`
 *     → `HOOKS_DIR`／`isValidHookFile`／`hookFunctionName`
 *
 * ── 它遷移的是什麼、不是什麼 ────────────────────────────────────────
 *
 * 遷移的是**契約的型別與名字**：切片的 `routes.ts` 標註、工具對契約常數的引用。
 * 不遷移的是**框架**：`component: () => import("./views/X.vue")` 要換成 React 的畫面，
 * 那是改寫一整個切片，不是改名。套完之後型別檢查會在每一條 `.vue` 路由上紅 ——
 * 那一紅指的正是還沒改寫的畫面，是對的。
 *
 * ── 為什麼只認得那一種 import 寫法 ────────────────────────────────────
 *
 * `RouteRecordRaw` 是 vue-router 的名字，在同一句 import 裡可能跟著 `createRouter`
 * 之類的執行期名字（`import { createRouter, type RouteRecordRaw } from "vue-router"`）。
 * 那種句子拆開要語意分析，而拆錯的結果是編不過或安靜地多一個 import。
 * 所以這裡只改「單獨 type-only import 它」的那一種 —— 腳手架的產生器與示範切片
 * 全是這種寫法；別的寫法原樣留下，讓型別檢查指出來給人改。
 *
 * ── 冪等性 ──────────────────────────────────────────────────────────
 *
 * 舊名改完就不存在，重跑是 no-op。
 */

const ROUTE_IMPORT = /import type \{ RouteRecordRaw \} from ["']vue-router["'];/;
const ROUTE_IDENTIFIER = /\bRouteRecordRaw\b/g;

const RENAMES: readonly (readonly [RegExp, string])[] = [
  [/\bCOMPOSABLES_DIR\b/g, "HOOKS_DIR"],
  [/\bisValidComposableFile\b/g, "isValidHookFile"],
  [/\bcomposableFunctionName\b/g, "hookFunctionName"],
];

const codemod: Codemod = {
  description:
    "RouteRecordRaw → SliceRoute；COMPOSABLES_DIR／isValidComposableFile／composableFunctionName → hook 的名字",

  transform(source) {
    let next = source;

    if (ROUTE_IMPORT.test(next)) {
      next = next
        .replace(ROUTE_IMPORT, 'import type { SliceRoute } from "@org/slice-kit";')
        .replace(ROUTE_IDENTIFIER, "SliceRoute");
    }

    for (const [pattern, replacement] of RENAMES) next = next.replace(pattern, replacement);

    return next === source ? null : next;
  },
};

export default codemod;
