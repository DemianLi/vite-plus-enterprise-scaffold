import { h, type VNode } from "vue";

import Child from "./Child.vue";

/**
 * `.ts` 消費 `.vue` —— **這一格是 `vp check` 的盲區**。
 *
 * `env.d.ts` 的 `declare module "*.vue"` 把每個元件的 props 都說成
 * `Record<string, unknown>`，所以 tsgolint 對任何 prop 都放行。
 * vue-tsc 解析真的 SFC，看得到 `label: string; count: number`。
 *
 * 反向測試把下面這行的 `count` 改成字串，證明這道閘門抓得到 ——
 * 而同一行在 `vp check` 底下是 0 errors（實測過，見 C68 補述）。
 */
export function renderChild(): VNode {
  return h(Child, { label: "hi", count: 1 });
}
