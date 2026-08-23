import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { USECASE_COVERAGE_GLOB, USECASE_COVERAGE_MIN } from "@org/slice-kit/contract";

/**
 * 切片自己的 Vite 設定。**這支檔案存在的唯一理由是覆蓋率門檻**（C120）。
 *
 * ⚠️ 為什麼不放根層：`vp test` 的設定以 package 為根解析，而一個 package
 * 只要有自己的 `vite.config.ts`，根層那份的 `test` 區塊就**整塊不繼承**。
 * `apps/console` 實測過這一格：它有自己的設定，於是覆蓋率退回預設射程
 * （只把「測試載入過的檔案」放進分母），報表寫 **100%**，一個 99% 的門檻
 * 照樣通過、exit 0 —— 沒有任何錯誤訊息。門檻放根層等於對「有自己設定的
 * package」直接失效，而失效的樣子是全綠。
 *
 * ⚠️ `plugins` 這一行也是同一件事，不是複製貼上的贅字：少了它 `.vue` 不會被
 * 轉譯，畫面那支會整支從覆蓋率報表裡消失 —— `features/order` 實測，行覆蓋率
 * 從 **7.84% 變成 14.28%**，而程式碼一個字都沒改。
 */
export default defineConfig({
  plugins: [vue()],

  test: {
    coverage: {
      // ⚠️ **`enabled` 這一行才是門檻真的會跑的原因。** 覆蓋率預設是關的，
      // 只有 `--coverage` 才會開 —— 一組只在有人手動加旗標時才成立的門檻，
      // 與「沒有門檻」是同一個東西，而且長得跟全綠一樣（`spec-report` 的
      // 第四態「未執行」，C115 §二）。開著它，`vp test` 這條所有人本來就會
      // 跑的路徑就是它的執行者。
      enabled: true,

      // 每跑一次測試就印一次完整表格太吵；門檻紅的時候 vitest 會另外印出
      // 是哪一條 glob 沒過，不靠這份報表。
      reporter: ["text-summary"],

      // ⚠️ 射程不能省。v8 provider 預設**只把測試載入過的檔案放進分母** ——
      // 沒有任何規格 import 的 usecase 不是 0%，是整支不出現，於是下面那條
      // 門檻對「新寫了一個 usecase 卻沒寫規格」這件事**恰好瞎掉**（#130 §一）。
      include: ["src/**"],

      // ⚠️ glob 與數字都從契約取，不重抄字串。這條線記過三次同一句話：
      // 射程寫錯不會報錯（#130 §七）、glob 打錯不會報錯（C119）、而 glob
      // 沒有命中任何檔案時覆蓋率門檻**靜默通過、exit 0**（C120 實測）。
      thresholds: {
        [USECASE_COVERAGE_GLOB]: {
          lines: USECASE_COVERAGE_MIN,
          branches: USECASE_COVERAGE_MIN,
          functions: USECASE_COVERAGE_MIN,
          statements: USECASE_COVERAGE_MIN,
        },
      },
    },
  },
});
