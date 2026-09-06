import vue from "@vitejs/plugin-vue";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * 突變測試那一趟 vitest 用的設定 —— 與 `stryker.config.mjs` 成對，只有那一支會讀它。
 *
 * 它存在的理由只有一個：`stryker.config.mjs` 的 `inPlace: true` 會把產品碼**就地**改寫成
 * 插樁版（每支 136 個檔、一萬多顆 mutant 的開關），而這棵樹有幾支測試讀的不是 import 進來的
 * 模組，是**磁碟上的真樹** —— 它們在插樁後看到的是一棵不一樣的樹，於是在乾跑就紅，
 * 而 Stryker 的乾跑只要一支紅，整趟一顆 mutant 都不跑（C168 §八、#307）。
 *
 * ⚠️ 名單是**實證的，不是盤出來的**：從零排除開始，紅一支加一支，直到乾跑綠；然後逐支
 * 拿掉，每一支拿掉都要重新紅（2026-09-07，`fbdc901`，四趟各紅在自己那一條）。
 * 「掃 `spawnSync`／`runCli`」那種盤法兩個方向都不對 —— 22 支直接 spawn 的測試裡 19 支
 * 對插樁**無感**（子行程讀到的是插樁檔，而沒有 mutant 被啟動，行為就是原版），而真正紅的
 * 四支裡有一支不在那 22 支裡：它的 spawn 藏在產品碼（`promise-check` 執行規格、規格再跑
 * `threshold-check`），測試檔本身一個 `child_process` 都沒 import。
 *
 * ⚠️ 排除不等於「這幾支不重要」。它們對 Stryker 本來就**看不見**（子行程型，見
 * `stryker.config.mjs` 檔頭「上界的第二個來源」）—— 排掉它們不少一顆殺數，實測同一個檔
 * 兩種設定 97.53% 對 97.53%。
 *
 * ⚠️ **沒有閘門守「一支新測試讀真樹而沒列在這裡」** —— 那只會在下一次跑 stryker 的乾跑紅。
 * 有守的是反方向：這裡列的每一支都要存在（改名、刪掉會讓排除靜默失效），見
 * `tools/gate-kit/tests/stryker-config.test.ts`。
 */
export const REAL_TREE_OBSERVERS = [
  // 對真樹算 `platform/` 的公開型別，插樁讓推導型別變寬（`X` → `X | undefined`），
  // 「沒動過的東西是綠的」那條對照組當場紅。
  "tools/api-surface/tests/negative.test.ts",
  // 兩支都執行版控裡的真規格，規格裡跑 `threshold-check`，插樁檔的複雜度過門檻 → 紅。
  "tools/promise-check/tests/negative.test.ts",
  "tools/promise-check/tests/cli.test.ts",
  // 數每支 `cli.ts` 讀 `process.argv` 恰好一次（C180）；插樁把那個運算式複製進 mutant 開關，
  // 讀到的是 N 次。
  "tools/gate-kit/tests/adoption.test.ts",
] as const;

export default defineConfig({
  plugins: [vue()],
  test: {
    exclude: [...configDefaults.exclude, "**/fixtures/**", ...REAL_TREE_OBSERVERS],
  },
});
