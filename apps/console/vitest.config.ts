import viteConfig from "./vite.config.ts";

/**
 * 測試設定，與建置設定分開放 —— 這支不跟著交付匯出出門（C250），`vite.config.ts` 會。
 *
 * vitest 有這支就讀這支，所以建置那一半從 `vite.config.ts` 拿、只加覆蓋率的射程。
 * ⚠️ 射程不能改成 test script 的旗標：`--coverage.include=…` 之後再加一個 `--coverage`，
 * 後面那個會把整個 coverage 設定蓋回預設，報表安靜地回到「只算測試載入過的檔」的假滿分
 * （C250 §四 實測：23/72 → 23/23）。
 *
 * ⚠️ 刻意不 import `vite-plus`（`defineConfig`／`mergeConfig`）：D2 的退出面只准各 package 的
 * `vite.config.ts` 碰它，`exit-drill` 靜態那一關會紅（C250 §五）。`vite.config.ts` 回傳的物件
 * 沒有 `test`，所以淺層展開就夠。
 *
 * 射程為什麼是這兩項、為什麼不設門檻：C120 §四。
 */
export default (env: Parameters<typeof viteConfig>[0]) => ({
  ...viteConfig(env),
  test: { coverage: { include: ["src/**", "bff-routes.ts"] } },
});
