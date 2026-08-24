import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * 突變測試的設定 —— **它的產出是一份清單，不是一個數字**（#150）。
 *
 * 問的是覆蓋率答不了的那個問題：**那些沒有人審的測試，是不是空頭支票。**
 * 測試可以覆蓋到一行程式碼卻不斷言它的任何行為，而覆蓋率報表對這兩者印出
 * 一模一樣的數字。實測掉出過四個真缺口，**其中兩個在四維 100% 覆蓋率的
 * package 裡**（#136 → #145）。
 *
 * ── ⚠️ 這份設定**不擋任何東西**，而那是一則有論證的裁決 ──────────────
 *
 * `thresholds.break` 是 `null`（見下），閘門聚合腳本與發版前檢查一個字都沒改。
 * 理由：分數下降的原因裡至少四種與程式碼品質無關 —— 新程式碼讓分母變大、
 * 等價變異、結構性量不到的 package、時間相依的 timeout 判定。
 * **一道經常因為無關原因變紅的閘門，結局是被關掉，而被關掉的閘門連清單都產不出來。**
 *
 * ── 怎麼跑 ──────────────────────────────────────────────────────────
 *
 *   pnpm exec stryker run                          # 全樹一趟，約 1 分 30 秒
 *   pnpm exec stryker run -m 'platform/pii/src/**' # 只看一個 package，秒的量級
 *
 * ⚠️ **工作目錄必須是 repo 根**，而這不是效能選擇：runner 預設只跑「與被改動的
 * 檔案相關」的測試，所以工作目錄換掉的是**問題本身** —— 在 package 目錄跑問的是
 * 「它自己測不測自己」，在根目錄跑問的是「整棵樹裡所有執行到它的測試殺不殺得動它」。
 * 同一個 package 兩種跑法差 21 個百分點（`slice-kit` 57.07% vs 78.26%），
 * 而差額全部集中在被跨 package 消費的那一支。**腳手架的程式碼本來就是給別的
 * package 用的。**
 *
 * ⚠️ **跑完之後看一眼 `git diff --summary`。** `inPlace`（見下）還原時**不保留
 * 檔案模式** —— 九支命令列進入點的可執行位會掉，而**逐行 diff 是零**，
 * 沒有任何閘門在看檔案模式。`git checkout -- tools/` 還原得掉。
 *
 * ── 怎麼讀那份清單 ──────────────────────────────────────────────────
 *
 * **存活的 mutant 是缺口的上界，不是缺口。** 沒有工具判得出等價變異
 * （行為完全相同的改寫），而它的比例逐 package 不同 —— 現有的樣本是某個
 * package 的十個存活裡至少四個是等價的。
 * ⚠️ 上一輪犯過的錯，寫在這裡以免重犯：一個存活的 mutant 被當成真缺口寫成頭條，
 * 而它其實是等價變異 —— **從一個存活的 mutant 推論出一個缺口，而沒有去讀那支
 * 測試檔、沒有查那個選項的預設值。**
 *
 * ⚠️⚠️ **上界的第二個來源：有一整批測試，這個工具一顆都算不進去。**
 *
 * 版控裡 49 支 `.test.ts`，報表的 `testFiles` 只看得見 35 支。**14 支完全不可見**，
 * 而它們不可見的原因有三個，不是一個：
 *
 *   1. **子行程型（4 支）** —— `api-surface/negative`、`conformance/negative`、
 *      `conformance/output`、`spec-report/cli`。mutant 靠**行程內的全域**啟動，
 *      子行程繼承不到，所以子行程跑的永遠是原版程式碼 —— 那些測試對每一顆
 *      mutant 都是綠的，無論它們多強。⚠️ 實測（#157）：`file-mode.ts` 有三顆記成
 *      Survived，手工套上去跑，`output.test.ts` 當場紅；`api-surface/src/docs.ts`
 *      的三顆存活**全部**死在那支 45.5 KB 的 `negative.test.ts` 手上。
 *      ⚠️⚠️ **整包量過一次，而數字不是零頭**：`tools/conformance` 的 **237 顆存活裡，
 *      72 顆（30%）其實被 `negative.test.ts` 與 `output.test.ts` 殺得掉** ——
 *      這個 package 的清單上，三成是假訊號。逐檔的假存活率從 4% 到 57% 不等，
 *      **所以它不是一個可以拿平均值折算掉的東西**：`scan.ts` 是 8/14，
 *      `csp.ts` 是 1/28。要知道某一支的真實存活數，只能把變異套上去跑一次。
 *   2. **在三個被排除的 package 裡（5 支）** —— 射程裡本來就沒有它們的產品碼。
 *   3. **檔案內容型（5 支）** —— `console/dev-session-stripped`、`console/proxy-target`、
 *      `ui/a11y`、`ui/styles`、`doc-facts/cross-references`。實查：這五支 `import`
 *      產品碼**零次**，它們把程式碼與文件當成資料讀，而這個工具改的是被 import
 *      執行的東西。
 *
 * **這三個原因不能混成一個。** 混起來的下場是下一批用錯的理由重讀同一堆。
 *
 * ── 怎麼判一顆到底是不是缺口：差分測試，不是讀 diff ────────────────
 *
 * 把變異真的套上去，拿原版與變異版跑**同一批輸入**找分岔。找得到分岔，那個
 * 輸入直接就是新測試的內容；找不到，才敢寫「等價」。#157 用這個方法判掉
 * `platform/pii` 的六顆全部等價（4036 個輸入 × 6 個函式零分岔），理由是結構性的：
 * `keep` 恆為 1，所以 `join` 的分隔符不可能生效。
 *
 * ⚠️ **這支量測台自己會回報假的零，而 #157 那一輪踩了兩次**：第一版的 probe
 * 沒有呼叫 `trackedFiles`，於是八顆的「無分岔」其實是「那一行沒有被執行」；
 * 第二版把錯誤訊息截到 60 個字元，而其中一顆的差異正好落在第 60 字之後。
 * **對照組是唯一擋得住這件事的東西** —— 拿已知會分岔的變異（例如 #145 補掉的
 * 那四顆）餵給同一支工具，它必須當場找得出分岔，而且找出來的邊界輸入應該
 * 與當初手工挑的那些對得上。
 */
export default {
  testRunner: "vitest",

  // ⚠️ 絕對路徑是必要的，而且**要指到進入點檔案，不是 package 目錄**。
  // `.npmrc` 刻意用 isolated linker 且不 hoist（為了讓供應鏈盤點不失真），
  // runner plugin 因此在預設解析下找不到。指到 package 目錄會原樣重現
  // 「找不到任何 TestRunner plugin」，而那是一個看起來像設定錯誤的錯誤訊息。
  // `require.resolve` 走的是 package 的 exports，回傳的正是 `dist/src/index.js`。
  plugins: [require.resolve("@stryker-mutator/vitest-runner")],

  // ⚠️ 指向一個**不存在**的路徑，用來整個跳過 TypeScript 前處理器。
  // catalog 釘的 TypeScript 是原生移植版，它移除了舊的 compiler API
  // （`parseConfigFileTextToJson` 等全部 undefined），任何依賴它的工具在這條線上
  // 都會這樣死。⚠️ 代價：sandbox 內的 tsconfig `extends` 路徑不會被改寫 ——
  // 將來要 mutate 需要型別資訊的東西時，這一格要重新評估。
  tsconfigFile: "tsconfig.does-not-exist.json",

  // ⚠️ **必要，不是偏好。** 非 inPlace 會把整棵樹複製到暫存目錄，而範疇檢查那支
  // 閘門的測試拿**當前的樹**當 fixture —— 它會對 sandbox 裡多出來的檔案報幾十個
  // 違規。代價寫在檔頭（檔案模式）。
  inPlace: true,

  coverageAnalysis: "perTest",

  /**
   * ⚠️⚠️ **這一條是安全性的，不是效能的 —— 關掉它，這個工具會往版控裡寫東西。**
   *
   * 靜態 mutant（在模組載入時執行到的那些）沒有辦法歸屬到某一條測試，所以 Stryker
   * 對每一顆都**跑整套測試**。這棵樹有 **827 顆（全部的 14%），而工具自己估它們吃掉
   * 92% 的測試時間**。
   *
   * 代價不只是時間。整套測試裡有一支
   * （`tools/slice-gen/tests/e2e.test.ts`）用 `cwd: <repo 根>` spawn 真正的產生器 CLI，
   * 而它底下的 bingo 在某些情況下會跑 **`git add -A` ＋ `git commit`**。
   * **實測：不開這一條跑一趟全樹，樹上多出一個 `feat: initialized repo ✨` 的 commit，
   * 內容是整棵被注入過的樹（200 個檔），落在當時所在的分支上。**
   * ⚠️ 沒有任何閘門會看到它 —— 它是一個合法的 commit。
   *
   * 開著它，那支測試在變異階段一次都不會跑（實測：它的每一條都是 `(covered 0)`；
   * 關掉時同一條是 `(killed 20)`）。順帶全樹從 **4 分 0 秒降到 1 分 31 秒**。
   *
   * ⚠️ **代價要寫清楚**：827 顆靜態 mutant 因此**不被測試**，其中在關掉這條時有 491 顆
   * 是真的被殺掉的 —— 那 491 顆的訊號沒了。但同一批裡也有一個**假的存活**：
   * `platform/pii` 的 `granularity: "grapheme"` → `""` 會讓模組載入時丟 `RangeError`，
   * 手工套上去是「整支測試檔載不起來、零條測試跑」，而 Stryker 記成 **Survived**
   * （17 條在別的檔案裡的測試通過了，零條失敗）。**「讓模組載不起來」的變異會被記成存活。**
   */
  ignoreStatic: true,

  /**
   * 射程是一份**逐 package 的清單，不是一行 glob** —— 產品碼不是每個 package
   * 都在慣例位置：`tools/codemods` 的 `src/` 底下一支都沒有、`tools/slice-gen`
   * 多一個 `bin/`、示範應用多一支根目錄的路由檔。
   *
   * ⚠️ **射程寫錯不會報錯，它會給出一個看起來合理的數字。** 這棵樹為同一件事
   * 付過兩次學費（覆蓋率量測、突變量測），而第二次湊出的是「很低的總分配一個
   * 100% 的覆蓋分」—— 兩個數字都不刺眼。**唯一抓得到它的對照是
   * 「`Found N of M file(s)` 的 N 對得上版控裡有幾支產品碼」**，不是任何一個分數。
   * 現在的 N 是 **78**：86 支符合下面前七條的 −3（vue-typecheck）−1（config）
   * −4（security-headers）。
   *
   * ⚠️ `.vue` 不在射程裡，而**這是這份清單的效果，不是驗過工具尊重那則裁決** ——
   * 設計系統那個 package 因此只被量到一小角（27 個 SFC 一個 mutant 都沒有）。
   */
  mutate: [
    "platform/*/src/**/*.ts",
    "tools/*/src/**/*.ts",
    "features/*/src/**/*.ts",
    "apps/*/src/**/*.ts",
    "tools/codemods/*.ts",
    "tools/slice-gen/bin/**/*.ts",
    "apps/console/bff-routes.ts",

    // ── 三個排除，而三個的理由不一樣 ──────────────────────────────
    //
    // ⚠️ **排除不等於「這幾支不重要」，也不等於「這幾支沒有問題」。**
    // 它們有測試（#130 量到的行覆蓋率分別是 58.25%／66.66%／70.58%），
    // 只是這個工具照不到 —— **沒有數字不等於沒有問題。**

    // 它自己的反向測試斷言 `vue-tsc` 會吐 `TS2322`，而 Stryker 為了讓自己的
    // mutant 不製造型別錯誤，預設往原始碼插 `// @ts-nocheck` ——
    // **型別檢查被關掉，正好關掉這支閘門存在的理由**，於是它在 dry run 就紅。
    // 反方向（`disableTypeChecks: false`）試過：跑超過十分鐘沒跑完。
    "!tools/vue-typecheck/src/**/*.ts",

    // 這兩支在射程裡，會把 `apps/console/tests/proxy-target.test.ts` 拉進
    // dry run，而那支需要 `process.chdir()`（`loadEnv` 的 envDir 就是工作目錄，
    // 而 `.env` 進不了版控），runner 卻把 `pool: 'threads'` 寫死在原始碼裡。
    // ⚠️ **而 dry run 只要有一支測試紅，整趟就中止** —— 所以留著它們不是
    // 「少兩格數字」，是**整棵樹一個數字都沒有**。排除它們是其餘 18 支活下來的前提。
    "!platform/config/src/**/*.ts",
    "!platform/security-headers/src/**/*.ts",
  ],

  /**
   * ⚠️ **`break: null` 是這份設定的核心，不是預設值沒改到。**
   *
   * `high`／`low` 只決定報表上的**顏色**；`break` 才是「低於這個數字就讓命令
   * 回傳非零」的那一個。**它是 null，所以這個能力不擋任何東西。**
   *
   * 收緊之前要全部成立（#150）：三個排除的有處置、量得到的支數穩定；
   * 報告真的被看過至少一次；**等價變異的比例逐 package 量過一次**（那是門檻的
   * 實際下限）；以及**門檻設在 total 還是 covered 上** —— 走子行程的命令列
   * 進入點對 instrumentation 一律不可見，所以有的 package total 不到 6% 而
   * covered 近 77%，**total 對那些 package 是一個不可能達成的門檻**。
   */
  thresholds: { high: 80, low: 60, break: null },

  // clear-text 給 CI log 與只跑一個 package 時看；html 是那份「逐條讀」的清單；
  // json 讓「這次新出現的存活」可以用兩份報告相減算出來（#150 格 5）。
  // ⚠️ 相減的鍵**不能含絕對位置**：只在檔頭插三行註解、語意零改動，
  // 用含位置的鍵會報出一整批假的「新存活」。
  reporters: ["clear-text", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },

  /**
   * ⚠️ **增量模式刻意關著。**
   *
   * `--incremental` 存在，但它做的不是「只 mutate 改動的檔案」：mutant 照樣全數
   * 產生、dry run 照樣全跑，省的是**重測**。而它的增量檔**內嵌每支產品碼與每支
   * 測試檔的完整原始碼** ＋ 一個絕對路徑的 `projectRoot`（750 個 mutant 就 544 KB）
   * —— **那是 CI 快取的對象，不是版控的對象**。CI 不快取它的話，
   * 開著它與關著它跑出來的是同一趟全量。
   *
   * 要用它的話：`--incremental`，並且讓 CI 快取 `reports/stryker-incremental.json`。
   */
  incremental: false,
};
