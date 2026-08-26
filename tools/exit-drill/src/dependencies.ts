/**
 * 退出演練的**測試相依**帳目：演練會裝什麼、明示不裝什麼。
 *
 * ── 這裡防的是哪一種失敗 ────────────────────────────────────────────
 *
 * `runtimeDependencies()` 只收 `dependencies`，理由很正當：演練要證明的是
 * 「換成上游工具鏈也跑得動」，而 devDependencies 裡裝的正是被替換掉的那些
 *（`vite-plus`、`vite`、`vitest`）。全裝進去，整場演練就不證明任何事。
 *
 * 但演練**會跑測試**（`vitest run` 是它四個步驟的最後一步），而測試有自己的
 * 相依。於是出現一個縫：
 *
 *   有人加一個測試專用的純 JS 相依（測試環境、測試工具⋯⋯），
 *   演練不知道要裝它，於是 `vitest run` 在暫存目錄裡炸掉 ——
 *   而炸掉的訊息是 `Cannot find package 'happy-dom'`，看起來像環境壞了。
 *
 * **這已經真的發生過。** `happy-dom` 與 `@vue/test-utils` 在 PR #15 隨
 * `features/order/tests/masking.test.ts`（`// @vitest-environment happy-dom`）
 * 一起進來，演練從那一刻起就是壞的。
 *
 * ── 為什麼是雙向帳目，不是「devDependencies 全裝」──────────────────
 *
 * 全裝會把 `vite-plus` 裝回去 —— 那是演練要證明不需要的東西。
 * 而「全裝但排除某幾個」把排除清單變成新的載重件：漏排一個，演練悄悄地
 * 證明得比較少；多排一個，演練悄悄地炸在下一個人手上。
 *
 * 所以照 `plugins.ts` 已經在用的形狀：每一個從 `apps/console` 走得到的
 * 非 workspace devDependency，都必須在下面兩張表之一登記。沒登記就紅。
 *
 * ── 為什麼這道檢查要留在**靜態**那一半 ──────────────────────────────
 *
 * 完整演練是每季跑一次的（`.github/workflows/exit-drill.yml`），而
 * `exit-drill.yml` 原本寫著每季就夠的理由是：
 *
 *   「會改變它的是『有人開始在原始碼裡 import vite-plus』，
 *     而那由 Tier 2 的靜態檢查每次 PR 都擋」
 *
 * **那句話被 PR #15 證偽了。** 它沒有人 import vite-plus，它只是加了一個
 * 演練不會安裝的 devDependency —— 而當時的靜態檢查看不見這一類。
 * 於是壞掉的演練躺了 19 個 PR，要到 2026-10-01 那次排程才會被發現。
 *
 * 這道檢查把那一類補進靜態那一半：**不打網路、不裝任何東西，只讀
 * package.json**（A1：只守推導得出來的）。加一個沒登記的測試相依，
 * 現在會在那個 PR 上就紅。
 */

export interface DroppedDependency {
  readonly name: string;
  readonly reason: string;
}

/**
 * 演練必須**真的安裝**的測試相依。
 *
 * 判準：**測試跑起來需要它，而它不是被替換掉的工具鏈本身。**
 * 兩者都成立才進這張表 —— 前者不成立就是白裝，後者不成立就是把演練
 * 要證明不需要的東西裝回去。
 */
export const DRILL_TEST_DEPENDENCIES: readonly string[] = [
  // `features/order/tests/masking.test.ts` 的 `// @vitest-environment happy-dom`。
  // 少了它 vitest 連 worker 都起不來，錯誤訊息是 ERR_MODULE_NOT_FOUND。
  "happy-dom",
  // 同一批測試用它掛載元件。純 JS，與工具鏈無關。
  "@vue/test-utils",
];

/**
 * 明示**不裝**的 devDependency。理由必須說明「不裝它為什麼不會讓演練說謊」。
 *
 * ⚠️ 「演練用不到」不是理由，「演練用得到但由別的地方提供」才是 ——
 * 前者三個月後沒有人分得出它是真的用不到，還是當時沒想到。
 */
export const DROPPED_TEST_DEPENDENCIES: readonly DroppedDependency[] = [
  {
    name: "@vitest/coverage-v8",
    reason:
      "**演練不跑覆蓋率。** 開啟它的是各切片自己的 `vite.config.ts`（C120），" +
      "而演練會把那幾份設定刪掉再產一份自己的 —— 理由不是「用不到」，是" +
      "**那些設定 import 的是 vite-plus，而這場演練的前提就是它不存在**。" +
      "覆蓋率門檻由 `vp run -r test` 守，那一條與「換成上游工具鏈跑不跑得動」無關。",
  },
  {
    name: "vite-plus",
    reason:
      "**整場演練要證明的就是不需要它。** 裝回去的話這四個步驟全部失去意義 —— " +
      "這一筆是這張表存在的原因，不是它的例外。",
  },
  {
    name: "vite",
    reason:
      "由 UPSTREAM.vite 提供，而且刻意是**上游的 vite**，" +
      "不是 catalog 裡被 alias 成 @voidzero-dev/vite-plus-core 的那個。",
  },
  { name: "vitest", reason: "由 UPSTREAM.vitest 提供（上游版本）。" },
  {
    name: "@vitejs/plugin-vue",
    reason: "由 DRILL_PLUGINS 推導安裝 —— 它是 plugin，帳目在 plugins.ts 那一張表。",
  },
  {
    name: "@tailwindcss/vite",
    reason: "同上，DRILL_PLUGINS 的一筆（D15 必須重現，否則產物沒有樣式）。",
  },
  {
    name: "tailwindcss",
    reason:
      "@tailwindcss/vite 的相依，npm 會遞移裝上。直接列進去只是把同一個套件寫兩次，" +
      "而版本要以 plugin 要求的為準，不是以我們宣告的為準。",
  },
  {
    name: "typescript",
    reason:
      "演練不跑 tsc。TS 轉譯由 rolldown／esbuild 做掉，`vite build` 與 `vitest run` " +
      "都不需要這個套件在場 —— 實測過：不裝它，四個步驟照樣通過。",
  },
  {
    name: "@types/node",
    reason: "只有型別宣告，執行期不載入任何東西。演練不做型別檢查，裝了也不會被讀到。",
  },
];

export interface ManifestDevDependencies {
  /** 相對於 repo 根目錄的路徑，只用在錯誤訊息上。 */
  readonly path: string;
  readonly devDependencies: Readonly<Record<string, string>>;
}

/**
 * 核對帳目。回傳錯誤訊息，空陣列＝通過。
 *
 * 收的是**已解析的內容**而不是路徑：讀檔留在 cli.ts，這裡保持純函式，
 * 才有辦法用人造資料把每一種違規都測過一次（與 accountPlugins 同一個切法）。
 */
export function accountTestDependencies(
  manifests: readonly ManifestDevDependencies[],
): readonly string[] {
  const errors: string[] = [];
  const carried = new Set(DRILL_TEST_DEPENDENCIES);
  const dropped = new Set(DROPPED_TEST_DEPENDENCIES.map((entry) => entry.name));

  // 同時登記在兩張表 ＝ 帳目自相矛盾，而且會讓上面的判準失去意義。
  for (const name of carried) {
    if (dropped.has(name)) errors.push(`測試相依 "${name}" 同時登記為「安裝」與「不裝」`);
  }

  for (const manifest of manifests) {
    for (const [name, spec] of Object.entries(manifest.devDependencies)) {
      // workspace: 的內部連結由 alias 處理，不必真的安裝。
      if (spec.startsWith("workspace:")) continue;
      if (carried.has(name) || dropped.has(name)) continue;
      errors.push(`${manifest.path} 有未登記的 devDependency：${name}`);
    }
  }

  return errors;
}
