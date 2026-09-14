import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
 * `features/invoice` 進版控起會讀 `features/<name>/.vitest-results.json` ——
 * **一個 gitignore 掉的產物**（`.gitignore:51`）。在此之前報表是空的、
 * `--check` 恆綠，所以誰先跑無所謂；現在切片的測試沒先跑，它就回 1。
 * 事實來源是 `git ls-files` 那個論證擋不住這一種：它讀的不是版控。
 *
 * ⚠️⚠️ **C256 —— 那一片不再寫死。** 原本這裡是 `@org/feature-invoice#test`：
 * fork 刪掉示範切片的那一刻，整張任務圖載不起來，**任何** `vp run` 都跑不了 ——
 * 而 `tools/` 在 fork 裡被章鎖著。改成從 `spec-report` 讀的同一份清單推：
 * 版控裡帶 `specs/*.feature` 的切片。只收帶規格的，因為 `dependsOn` 指到不存在的
 * package 或任務一樣會讓任務圖載不起來（實測），而結果檔只有帶規格的切片會產出。
 */
const ROOT = join(import.meta.dirname, "../..");

function specSliceTests(): string[] {
  const listed = spawnSync("git", ["ls-files", "-z", "--", "features/*/specs/*.feature"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const dirs = new Set(
    (listed.stdout ?? "")
      .split("\0")
      .filter((path) => path.length > 0)
      .map((path) => path.split("/")[1] as string),
  );
  return [...dirs].sort().map((dir) => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "features", dir, "package.json"), "utf8"),
    ) as { name: string };
    return `${manifest.name}#test`;
  });
}

export default defineConfig({
  run: {
    tasks: {
      test: {
        command: "vp test",
        dependsOn: ["@org/slice-gen#test", ...specSliceTests()],
      },
    },
  },
});
