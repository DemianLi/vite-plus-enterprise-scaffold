import { defineConfig } from "vite-plus";

/**
 * 這支 package 的 `test` 定義在這裡而不是 `package.json`，理由只有一個：
 * 它必須被別的 package 用 `dependsOn` 指名（見 `tools/conformance` 與
 * `tools/vue-typecheck` 的同名檔案），而 `dependsOn` 只認 task。
 *
 * ⚠️ 同一個名字不能同時存在於 `package.json` 的 scripts 與這裡 ——
 * 會是 `Failed to load task graph`，整批測試連跑都不會開始。
 */
export default defineConfig({
  run: {
    tasks: {
      test: {
        command: "vp test",

        // 這支的端對端測試會在**真的** `features/` 底下建一個 `zz-` 切片、
        // 跑完再刪（見 tests/e2e.test.ts 的檔頭）。會寫真 repo 的測試不可以進
        // 快取：cache hit 時 Vite Task 會把該次的產出 restore 回來，而那些產出
        // 就落在真的 `features/` 底下 —— 換來的不是間歇紅燈，是**永久殘留**，
        // 且該次根本沒跑，e2e 自己那條「features/ 只剩真正的切片」也不會紅。
        //
        // ⚠️ 實測時 vp 會自己判定「it modified its input」而略過快取，所以拿掉
        // 這一行**看起來**也是對的。這裡要的是宣告，不是靠那個判定：建了又刪、
        // 淨改變為零的那一次，自動偵測不保證還會這樣判。
        cache: false,
      },
    },
  },
});
