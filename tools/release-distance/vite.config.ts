import { defineConfig } from "vite-plus";

/**
 * `test` 是 task 不是 script，理由與根 `vite.config.ts` 的 `release-distance` task
 * 同一條（C171 §九）：`tests/distance.test.ts` 的對照組讀的是 git 的 ref
 * （真樹上看不看得到 tag），不是檔案。根層 `run.cache: true` 的自動資料追蹤
 * 看不見它，`"test": "vp test"` 第一趟之後會永遠 cache hit —— 實測：`vp run test`
 * 在別的 package 第二趟印「cache hit, 765ms saved」。
 *
 * ⚠️ 一份重播的綠與一份真的綠在輸出上一模一樣。C179 §三。
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
