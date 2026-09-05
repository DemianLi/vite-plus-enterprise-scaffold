import { DRILL_TEST_DEPENDENCIES } from "./dependencies.ts";
import { DRILL_PLUGINS } from "./plugins.ts";

/**
 * 演練 workspace 的三份設定：建置、測試、`package.json`。
 *
 * 這裡只**產生內容**，不寫檔 —— 寫到哪個目錄是 `cli.ts` 的事。C185 之前這三份
 * 字串住在 `cli.ts` 的 `writeDrillWorkspace` 裡，`--full` 又進不了沙盒（連網、分鐘級，
 * `--full --root` 由 C184 拒絕），於是下面每一條註解記的失敗都沒有反向測試：
 * vitest 那份漏掉 plugin、alias 排錯序、`vite` 裝到 catalog 那個，改前三顆變異都是零紅
 *（C185 §六）。`tests/drill-workspace.test.ts` 守的就是這三件事。
 */

// 上游對應版本。vitest 與 vite-plus 內建的是同一個版本號，因為 vite-plus 就是
// 打包上游的 vitest —— 這件事本身就是 D2 論證的一部分。
export const UPSTREAM = {
  vite: "^8.2.1",
  vue: "^3.5.41",
  "@vitejs/plugin-vue": "^6.0.8",
  vitest: "4.1.10",
};

export interface DrillAlias {
  readonly find: string;
  readonly replacement: string;
}

export interface DrillWorkspaceInput {
  /** 順序不拘：排序在這裡做，理由見 `sortAliases`。 */
  readonly aliases: readonly DrillAlias[];
  /** `runtimeDependencies()` 的結果 —— 從真樹推導，所以由 `cli.ts` 讀了傳進來。 */
  readonly dependencies: Readonly<Record<string, string>>;
  readonly catalog: Readonly<Record<string, string>>;
}

export type DrillWorkspaceFile = "vite.config.mjs" | "vitest.config.mjs" | "package.json";

/**
 * 長的排前面：alias 是「完全相符或子路徑」比對，取第一個命中的。
 * @org/slice-kit 排在 @org/slice-kit/contract 前面的話，後者會被解析成
 * .../slice-kit/src/index.ts/contract —— 錯得很安靜。
 */
function sortAliases(aliases: readonly DrillAlias[]): readonly DrillAlias[] {
  return [...aliases].sort((a, b) => b.find.length - a.find.length);
}

export function drillWorkspaceFiles(
  input: DrillWorkspaceInput,
): Readonly<Record<DrillWorkspaceFile, string>> {
  const aliasLiteral = JSON.stringify(sortAliases(input.aliases), null, 2);

  // plugin 的 import 與註冊都由 DRILL_PLUGINS 推導，不是各寫一份。
  // 兩邊分開寫的話，總有一天會有人只改到其中一邊，而少一個 plugin 的建置**不會報錯**。
  const pluginImports = DRILL_PLUGINS.map((plugin) => `${plugin.importLine}\n`).join("");
  const pluginCalls = DRILL_PLUGINS.map((plugin) => `${plugin.name}()`).join(", ");

  const dependency = (name: string): string => input.catalog[name] ?? "latest";

  return {
    "vite.config.mjs":
      `import { defineConfig } from "vite";\n` +
      pluginImports +
      `\n// 這份設定是退出演練自動產生的：上游 Vite、上游 plugin，零 vite-plus。\n` +
      `export default defineConfig({\n` +
      `  root: "app",\n` +
      `  plugins: [${pluginCalls}],\n` +
      `  resolve: { alias: ${aliasLiteral} },\n` +
      `  build: { outDir: "../dist", emptyOutDir: true, sourcemap: "hidden" },\n` +
      `});\n`,

    // ⚠️ **plugin 兩份設定都要吃 —— C148 §二 的 B 類就是這一行漏掉的後果。**
    // 第一版只有上面那份建置設定拿了 `DRILL_PLUGINS`，測試這份沒有，於是
    // `platform/ui` 的三支 `.vue` 測試在演練裡是「0 test」，而 `#206` 把它
    // 解釋成「演練刻意不裝 plugin-vue」——**帳目是對的，只有一個消費端讀了它**。
    // 這正是 `plugins.ts` 檔頭寫著要防的那個失敗模式，發生在它自己身上。
    "vitest.config.mjs":
      `import { defineConfig } from "vitest/config";\n` +
      pluginImports +
      `\nexport default defineConfig({\n` +
      `  plugins: [${pluginCalls}],\n` +
      `  resolve: { alias: ${aliasLiteral} },\n` +
      `  test: { include: ["app/tests/**/*.test.ts", "packages/*/tests/**/*.test.ts"] },\n` +
      `});\n`,

    "package.json": `${JSON.stringify(
      {
        name: "exit-drill",
        private: true,
        type: "module",
        // 由 workspace 的真實 dependencies 推導，不是寫死的清單 ——
        // 寫死的清單不會通知你它過期了（見 cli.ts 的 runtimeDependencies）。
        dependencies: input.dependencies,
        devDependencies: {
          // ⚠️ 這裡是**上游的 vite**，不是 catalog 裡被 alias 成
          // @voidzero-dev/vite-plus-core 的那個。整場演練的重點就在這一行。
          vite: UPSTREAM.vite,
          vitest: UPSTREAM.vitest,
          // plugin 的相依同樣由 DRILL_PLUGINS 推導：登記了卻沒裝，建置會炸得很難懂。
          // 上游有對應版本就用上游的（那是演練要證明的東西），否則退回 catalog。
          ...Object.fromEntries(
            DRILL_PLUGINS.map((plugin) => [
              plugin.module,
              (UPSTREAM as Record<string, string>)[plugin.module] ?? dependency(plugin.module),
            ]),
          ),
          // 測試專用的純 JS 相依。演練的最後一步是 `vitest run`，而
          // runtimeDependencies() 刻意只收 dependencies —— 那個判斷是對的
          //（devDependencies 裡裝的正是被替換掉的工具鏈），但它漏了「測試
          // 自己也有相依」這一類。帳目與理由在 dependencies.ts。
          ...Object.fromEntries(DRILL_TEST_DEPENDENCIES.map((name) => [name, dependency(name)])),
        },
      },
      null,
      2,
    )}\n`,
  };
}
