/// <reference types="vite/client" />

// Vue 單檔元件的型別橋接：tsgolint 不認識 .vue 副檔名。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
