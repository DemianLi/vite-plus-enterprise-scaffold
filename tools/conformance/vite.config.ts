import { defineConfig } from "vite-plus";

/**
 * C87 —— 這支的 `test` 與 `@org/slice-gen#test` **在設計上互斥**，所以排程層
 * 必須把它們分開。
 *
 * `tests/negative.test.ts` 最後一條對**真實的** repo 根目錄斷言
 * `runConformance(ROOT).red === false`。而 slice-gen 的端對端測試在真的
 * `features/` 底下建 `zz-slice-gen-e2e` 的那幾百毫秒裡，真實 repo 的一致性檢查
 * **是刻意紅的** —— slice-gen 自己有一條斷言它含「擁有權」與「1 項違規」。
 *
 * 兩條都是對的，而且都必須對真 repo 斷言（各自檔頭寫著理由）。所以修的是
 * 排程，不是斷言：讓 slice-gen 跑完、`afterAll` 清完，這裡才開始。
 *
 * ⚠️ `vp run --parallel` 會**忽略 task 相依**，這道防護會安靜失效。CI 跑的是
 * `vp run -r test`（見 .github/workflows/tier1-quality.yml），沒有 --parallel。
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
