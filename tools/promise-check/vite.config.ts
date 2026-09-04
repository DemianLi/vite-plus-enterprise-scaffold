import { defineConfig } from "vite-plus";

/**
 * C163 —— 這支的 `test` 會執行 `specs/gate-thresholds.feature`，而那兩個場景
 * 各起一次 `tools/threshold-check`：**一趟掃全樹的 `vp lint`**。
 * 所以它承接了那支的排程限制，理由逐字寫在 `tools/threshold-check/vite.config.ts`。
 *
 * ⚠️ **`tests/cli.test.ts` 檔頭原本寫著「排程相依查過了：不需要 `dependsOn`」，
 * 而那句話在 C163 之後不成立了。** 當時的論證是：這一支與 `spec-report` 的事實
 * 來源都是 `git ls-files`，所以沒進 index 的 `zz-` 切片兩邊都看不見。
 * `threshold-check` 不走 `git ls-files` —— 它走 `vp lint` 掃磁碟。
 * 一個成立的論證，被一個它沒有涵蓋的新相依方推翻。
 *
 * ⚠️⚠️ **C165 —— 同一句話第三次被推翻，而這次的破法又不一樣。**
 * `tests/cli.test.ts` 對真樹跑 `spec-report --check`，而那支從
 * `features/invoice` 進版控起會讀 `features/*​/.vitest-results.json` ——
 * **一個 gitignore 掉的產物**（`.gitignore:51`）。在此之前報表是空的、
 * `--check` 恆綠，所以誰先跑無所謂；現在切片的測試沒先跑，它就回 1。
 * 事實來源是 `git ls-files` 那個論證擋不住這一種：它讀的不是版控。
 */
export default defineConfig({
  run: {
    tasks: {
      test: {
        command: "vp test",
        dependsOn: ["@org/slice-gen#test", "@org/feature-invoice#test"],
      },
    },
  },
});
