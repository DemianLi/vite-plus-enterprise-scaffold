import { defineConfig } from "vite-plus";

/**
 * C163 —— 這支的 `test` 會**起子行程跑一趟 `vp lint` 掃全樹**，所以它與
 * `@org/slice-gen#test` 在設計上互斥，排程層必須把它們分開（形狀與 C87 同一條，
 * 見 `tools/conformance/vite.config.ts`）。
 *
 * 差別在**為什麼**互斥。C87 那兩支各自對真 repo 斷言，衝突在結果；這裡的衝突在
 * **量測期間那棵樹不能動**：`src/probe.ts` 分兩次取檔案清單（一次真樹、一次農場），
 * 而 slice-gen 的端對端測試會在真的 `features/` 底下建一個 `zz-` 切片再刪掉。
 * 那幾百毫秒剛好落在兩次之間的話，兩份清單就對不上 —— 而那條夾具的紅燈是
 * **「量測台自己壞了」**，一則指向這支工具、與真正原因無關的訊息。
 *
 * ⚠️ 症狀是**間歇性**的，所以它不會在寫下來的那天被抓到。
 *
 * ⚠️ `vp run --parallel` 會忽略 task 相依，這道防護會安靜失效。
 * CI 跑的是 `vp run -r test`（見 .github/workflows/tier1-quality.yml），沒有 --parallel。
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
