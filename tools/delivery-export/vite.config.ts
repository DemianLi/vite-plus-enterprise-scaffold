import { defineConfig } from "vite-plus";

/**
 * `test` 是 task 不是 script：`tests/workspace.test.ts` 對真樹推白名單，而成員清單
 * 來自 `git ls-files`，根層 `run.cache: true` 的自動追蹤看不見它 —— 寫成
 * `"test": "vp test"` 會在第一趟之後永遠重播（C179 §三，同 `tools/release-distance`）。
 */
export default defineConfig({
  run: {
    tasks: {
      test: {
        command: "vp test",
        cache: false,
      },
    },
  },
});
