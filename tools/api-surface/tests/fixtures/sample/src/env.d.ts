/**
 * `.vue` 的型別橋接。刻意**不** import `vue` —— 這個 fixture 會被複製到
 * 暫存目錄，那裡沒有 node_modules。
 *
 * 這個 shim 本身就是被測的東西之一：它讓 checker 對每個元件回報同一個型別，
 * 而 `platform/ui` 的真 shim 也是同樣的效果。元件的形狀因此不是從 checker
 * 拿的，是直接解析 SFC 得到的。
 */
declare module "*.vue" {
  const component: unknown;
  export default component;
}
