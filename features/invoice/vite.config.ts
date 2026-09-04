import { defineConfig, lazyPlugins } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { USECASE_COVERAGE_GLOB, USECASE_COVERAGE_MIN } from "@org/slice-kit/contract";

/**
 * 切片自己的 Vite 設定。**這支檔案存在的唯一理由是覆蓋率門檻**（C120）。
 *
 * 門檻只收在 `src/usecases/**` 上，因為那是規格打的那一層：一行沒被走過的
 * usecase 就是一個沒有規格在驗的 usecase。切片整體**不設數字** ——
 * `src/views/**` 佔行分母的 40%、函式分母的 45%，而 `.vue` 只算
 * `<script setup>`（template 一行都不進分母），一個套在整包上的數字會被
 * 那件事帶著走。
 *
 * ⚠️ 為什麼不放腳手架根層：`vp test` 的設定以 package 為根解析，而一個
 * package 只要有自己的 `vite.config.ts`，根層那份的 `test` 區塊就**整塊
 * 不繼承**。所以這支檔案**不能刪** —— 刪掉之後門檻不會報錯，它會安靜地
 * 不存在。
 *
 * ⚠️ `plugins` 這一行不是贅字：少了它 `.vue` 不會被轉譯，畫面那支會整支
 * 從覆蓋率報表裡消失（實測：行覆蓋率不降反升，而程式碼一個字都沒改）。
 */
export default defineConfig({
  plugins: lazyPlugins(() => [vue()]),

  // ── 覆蓋率的產物落在 package 底下，而 `vp run` 會把它算成輸入（C120）──
  //
  // ⚠️ 不宣告這一段的話，這支 task **永遠不會 cache**：v8 provider 每跑一次
  // 都會讀寫 `coverage/.tmp/coverage-N.json`，而 `vp run` 的自動追蹤看到
  // 「讀了自己寫的檔案」就判定不可快取（實測訊息：`Not cached: read and
  // wrote 'coverage/.tmp/coverage-0.json'`）。任務快取是 Tier 1 的主要提速
  // 手段（D10），而這件事會發生在**每一個**切片上。
  //
  // ⚠️ 換 `reportsDirectory` 沒有用 —— 只要落在 repo 之內都會被追蹤
  // （`node_modules/` 底下、`node_modules/.vite/` 底下都實測過，一樣不 cache）。
  //
  // ⚠️ 所以 `test` 從 `package.json` 的 scripts **搬到這裡**：同一個名字不能
  // 同時存在於兩邊，會是 `Failed to load task graph`，整批測試連跑都不會開始
  // （同 `tools/slice-gen/vite.config.ts` 的那條註解）。
  run: {
    tasks: {
      test: {
        command: "vp test",
        input: [{ auto: true }, "!coverage/**"],
        output: ["coverage/**"],
      },
    },
  },

  test: {
    coverage: {
      // ⚠️ **`enabled` 這一行才是門檻真的會跑的原因。** 覆蓋率預設是關的，
      // 只有 `--coverage` 才會開 —— 一組只在有人手動加旗標時才成立的門檻，
      // 與「沒有門檻」是同一個東西，而且長得跟全綠一樣。開著它，`vp test`
      // 這條所有人本來就會跑的路徑就是它的執行者。
      enabled: true,

      // 每跑一次測試就印一次完整表格太吵；門檻紅的時候 vitest 會另外印出
      // 是哪一條 glob 沒過，不靠這份報表。
      reporter: ["text-summary"],

      // ⚠️ 射程不能省。v8 provider 預設**只把測試載入過的檔案放進分母** ——
      // 沒有任何規格 import 的 usecase 不是 0%，是整支不出現，於是下面那條
      // 門檻對「新寫了一個 usecase 卻沒寫規格」這件事恰好瞎掉。
      include: ["src/**"],

      // ⚠️ glob 與數字都從契約取，不要改成字面值：glob 沒有命中任何檔案時，
      // 覆蓋率門檻**靜默通過、exit 0**，與打錯字完全同形。
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
