import { defineConfig } from "vite-plus";

/**
 * C87 —— 與 `tools/conformance` 同一個成因，但這裡的窗口更刁鑽，而且還沒發作過。
 *
 * `tests/programs.test.ts` 走訪**真實的** repo：`discoverPrograms(ROOT)` 在
 * collection 期算一次、`allViews(ROOT)` 在執行期又算一次。`zz-` 切片若在這兩次
 * 之間出現或消失，「非 fixture 的 .vue 一個都不能漏」那條比的就是兩份不同時刻
 * 的清單 —— 兩邊都沒錯，但不相等。
 *
 * ⚠️ 這條**不是** C61 的 `TRANSIENT_PREFIX` 能解的：那個做法是讓數數的那一側
 * 跳過 `zz-`，而這裡兩份清單都會跳過，不一致的來源是**時刻不同**，不是認不認得。
 */
export default defineConfig({
  run: {
    tasks: {
      test: {
        command: "vp test",
        dependsOn: ["@org/slice-gen#test"],
      },
    },
  },
});
