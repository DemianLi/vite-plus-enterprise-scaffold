/// <reference types="vite/client" />

// Vue 單檔元件的型別橋接（見 apps/console/src/env.d.ts 的說明）。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
