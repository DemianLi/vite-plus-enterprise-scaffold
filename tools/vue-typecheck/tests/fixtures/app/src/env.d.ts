// ⚠️ **這個 shim 一定要在。** 它就是 repo 裡四個 package 都有的那一份。
//
// 反向測試要問的正是「有了這個萬用宣告之後，跨元件的型別檢查還剩多少」——
// 它讓 tsgolint 對每個元件都回報同一個泛型（那是 tools/api-surface 存在的
// 理由）。fixture 少了它的話，測試證明的是一個這個 repo 裡不存在的世界。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
