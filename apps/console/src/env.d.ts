/// <reference types="vite/client" />

// Vue 單檔元件的型別橋接。
// tsgolint（TypeScript 7）不認識 .vue 副檔名，需要這個宣告才追得到 import。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
