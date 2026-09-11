/**
 * 腳手架那一半的 lint 設定（C219，實作 C215 §六 與 §十）。
 *
 * 根層 `vite.config.ts` 是**團隊的**；這一支是**腳手架的**。fork 之後不改它，升級時
 * 它跟著合併上游一起進來 —— 兩邊各改各的檔，合併就不會撞在同一行。
 *
 * ⚠️ 本檔的複雜度門檻**只管腳手架自己的碼**（`tools/`、`platform/`），而根層必須把
 * `scaffoldOverrides` 排在 `overrides` 的**最後**：oxlint 的 override 後者蓋前者，排在
 * 前面的話團隊的測試碼門檻會蓋掉這裡。團隊把根層的數字收緊，腳手架的碼不會因此紅 ——
 * 那是他們改不了的碼，而 AGENTS.md 規則二不准他們為了綠燈把數字調回去（C219 §二）。
 *
 * ⚠️ **本檔不 import `vite-plus`**：下面幾個型別是本地的結構型別，真正的檢查發生在根層
 * `defineConfig` 收下它們的那一格。退出面（D2）因此仍然只有兩個設定檔。
 *
 * ⚠️ 門檻一律寫成 `["error", { <選項>: <數字> }]`，一條規則一行。`threshold-check` 只量
 * **本檔**的門檻（C219 §四：根層那一組是給 fork 的起始值，不入棘輪）—— 本檔每一格壓到
 * 地板再量，而兩份的格數都要數（`tools/threshold-check/src/config.ts` 的 `RULE_LINE`）；
 * 換一種寫法，那道閘門報的是「量測台自己壞了」，不會安靜地漏掉。
 */

type Severity = "allow" | "off" | "warn" | "error" | "deny";
type Rule = Severity | [Severity, ...unknown[]];
type Rules = Record<string, Rule>;
type Plugin = "import" | "typescript" | "unicorn" | "oxc" | "vue" | "promise";

interface Override {
  files: string[];
  rules: Rules;
}

/** 腳手架的外掛、規則與選項。根層 spread 進去，團隊的規則寫在它後面。 */
export const scaffoldLint: {
  plugins: Plugin[];
  rules: Rules;
  options: { typeAware: boolean; typeCheck: boolean };
} = {
  plugins: ["import", "typescript", "unicorn", "oxc", "vue", "promise"],

  rules: {
    // D11 — CSP 無 unsafe-eval 的前提：執行期不得有任何 eval 語意。
    "no-eval": "error",
    "no-implied-eval": "error",
    // 循環依賴會讓切片邊界在執行期失效，且使 SAST 的資料流分析失準。
    "import/no-cycle": "error",
  },

  options: {
    typeAware: true,
    typeCheck: true,
  },
};

/** ⚠️ 根層要把這一串排在自己的 override **之後**（見檔頭）。 */
export const scaffoldOverrides: Override[] = [
  {
    // ── 層 1 複雜度：腳手架自己的產品碼（C119）──────────────────────
    //
    // 擋的是「agent 把自己纏進去、最後得人下場解」的程式碼。這一格屬於
    // 「對錯與風格」，因此落在 oxlint 而不是 eslint.config.js —— 那一軌是
    // Tier 2 安全閘門，複雜度不是安全，塞進去會稀釋它的身分，而且紅燈
    // 會分不出是「有 XSS」還是「函式太長」。
    //
    // ⚠️ 這幾個數字**不是理想值，是觀測到的最大值**。定法（TESTING.md
    // 〈校準〉）是：第一次先設寬到不擋任何既有程式碼，每一次它真的擋下
    // 一件事就記一則 C 編號，收緊時附上那些 C 編號當論證。
    //
    // ⚠️⚠️ **C147 補了那個定法缺的另一半方向**：觀測最大值是**上界，不是
    // 錨點**。最大值**下降**時（有人把那支極端值重構掉了），這幾個數字
    // **必須跟著降，而且不需要論證** —— 降它擋不下任何今天存在的東西。
    // 往上仍然要一則 C 編號。理由是實測：門檻設在 max 就擋下 0 個函式，
    // 於是「擋下一件事才記 C 編號」那個條件**永遠不會成立**，而至今記錄
    // 在案的四次移動全部是往上。⚠️ **「降」那一半自 C162（#226）起有閘門在守**
    // （`vpr threshold-check`：實測 max 低於這裡的數字就紅，訊息帶著該降到多少）；
    // ⚠️ **「抬」那一半仍然沒有機制在守，而且刻意** —— 抬要一則 C 編號，靠人。
    // 照抄外部建議
    // 值的代價 C108 已經付過 —— CI 第一天紅，而紅的原因不是程式碼變差。
    // 所以這裡取「剛好不擋」而不是「max + 一個憑空的餘裕」：任何 +N 都
    // 是沒有論證的數字，而 max 本身有 —— 它是這棵樹此刻的形狀。
    //
    // ⚠️ 行數含空行與註解（oxlint 預設，無 skipComments 選項）。這條線的
    // 註解密度遠高於一般專案，函式內的註解會直接灌進 max-lines-per-function。
    //
    // ⚠️ 認知複雜度那一格是空的，不是漏掉。oxlint 1.81 仍然沒有這條規則
    // （`cognitive-complexity`、`sonarjs/*`、`oxc/cognitive-complexity`
    // 三種寫法都不存在，用 --print-config 逐一驗過）。唯一的來源是
    // eslint-plugin-sonarjs，而那要嘛新增一條相依到 Tier 2 安全閘門、
    // 要嘛為了一個維度另養一軌。⚠️ 下面的 complexity 是**循環**複雜度，
    // 是替代不是填滿：`slice-gen/src/files.ts` 的 buildSliceFiles 841 行、
    // 認知複雜度 0（#129 §五）—— 四個維度不互為代理。
    // ⚠️ **這四個數字在 `release/v1` 併回來的那天重新校準過**（C133 §八）。
    // 舊值（185／5／6／36）是 `release/v1` 那棵樹的觀測最大值，而那棵樹是
    // 這棵的子集 —— 併線帶回七支工具之後，`supply-chain` 的 `captureOne`
    // （循環複雜度 39）與 `exit-drill` 的 `runFull`（239 行）超出舊值。
    //
    // ⚠️ **這不是為了讓 CI 變綠而調鬆。** C119 定的方法就是「先設寬到不擋
    // 任何既有程式碼，每擋下一件事就記一則 C 編號，收緊時附上那些 C 編號當
    // 論證」—— 舊值從來不是「這棵樹的最大值」，它是**另一棵樹**的最大值。
    // 照抄它等於在第一天就擋下七支從來沒有被這條規則量過的工具，而它們
    // 一行都沒有改。C108 已經付過那筆學費（照抄外部建議值，CI 第一天紅，
    // 而紅的原因不是程式碼變差）。
    //
    // ⚠️ 239 那個數字裡有這次併線加進 `runFull` 的一段註解（切片自帶的
    // `vite.config.ts` 要在演練裡刪掉，否則下一次排程會壞）。行數含註解是
    // oxlint 的預設，沒有 skipComments 選項 —— 這一格的代價寫在上面。
    //
    // ⚠️⚠️ **239 → 199（#226）**：`runFull` 被別人為了別的目的重構短了，
    // 而依上面 C147 §二，最大值下降時這個數字**必須跟著降、不需要論證**。
    // 當時的量法：十一個門檻各減一跑一次 `vp lint`（只有這一格一個違規都報不出
    // 來 ⇒ 只有它過期），再把它壓到 120 讀出真實分佈 —— 199（`exit-drill` 的
    // `runFull`）、185（`theme-verify`）、175（`bff-mock`）、161（`supply-chain`）。
    // ⚠️ **上面那一段是這個數字怎麼來的，不是今天那道閘門怎麼跑的** ——
    // `threshold-check` 用的是「壓到地板一次量完」，理由見它的 `src/config.ts`。
    // ⚠️ 它高了 40 行而安靜了 15 支 commit，而**當時是人回頭查才發現的**；
    // C162（#226）之後這一格由 `vpr threshold-check` 守著。
    // ⚠️ **199 → 185（C185）**：`runFull` 的組證據與產設定抽成純函式後剩 184 行，
    // 極端值換成 `theme-verify` 的 185 —— 這次是閘門自己報的，不是人回頭查的。
    //
    // ⚠️ **C219 之前這幾個數字在根層、管整棵樹**；上面這段歷史量的是整棵樹，
    // 而那幾支極端值全在 `tools/`，所以數字搬過來一個都不用改。
    files: ["tools/**", "platform/**"],
    rules: {
      "max-lines-per-function": ["error", { max: 185 }],
      "max-depth": ["error", { max: 5 }],
      "max-params": ["error", { max: 6 }],
      complexity: ["error", { max: 39 }],

      // ⚠️ `<script setup>` 的 module 層在上面四條裡**一行都看不見**（只有
      // max-depth 例外，它不限函式）。platform/ui 的 24 個零函式 .vue、
      // 合計 1992 行 script，在四維分佈裡是 0 —— 表上乾淨是因為量不到，
      // 不是因為程式碼乾淨（#129 §六）。這條把「參數個數」換成 props 補回
      // 一格；區塊行數那一格 oxlint 沒有對應規則（vue/max-lines-per-block
      // 不存在），仍然空著。
      "vue/max-props": ["error", { maxProps: 5 }],
    },
  },
  {
    // ── 層 1 複雜度：腳手架自己的測試碼是另一組數字（C119）─────────
    //
    // TESTING.md §六 已經承諾「兩類的門檻要分開設，而且不是同一組
    // 數字」。這裡不是為了寬鬆才分 —— 兩類的形狀差法不只一種：
    // 測試碼在巢狀深度與循環複雜度上比產品碼**乾淨得多**（89% 的
    // 測試函式 depth 0），但在函式大小上有一條產品碼沒有的長尾
    // （describe／it 的 callback，最大 455 行）。用同一組數字，
    // 會在一個維度太鬆、另一個維度把人卡死。
    //
    // ⚠️ 這一條的 files 若寫錯，症狀是**測試碼安靜地套用產品碼門檻**，
    // 而不是報錯 —— oxlint 對 glob 沒中一樣 exit 0。反向測試見 C119。
    // ⚠️ 它必須排在上一條之後：`tools/**` 也命中測試檔，後者蓋前者。
    files: [
      "tools/**/tests/**",
      "tools/**/*.test.*",
      "tools/**/*.spec.*",
      "tools/**/fixtures/**",
      "platform/**/tests/**",
      "platform/**/*.test.*",
      "platform/**/*.spec.*",
      "platform/**/fixtures/**",
    ],
    rules: {
      // ⚠️ `complexity` 同樣在併線那天從 11 校準到 15（C133 §八）：
      // `tools/bff-check/tests/negative.test.ts` 起一台 mock 伺服器，
      // 而那個 handler 是這棵樹上最複雜的測試函式。它在 `release/v1`
      // 上不存在，所以 11 那個數字從來沒有量過它。
      "max-lines-per-function": ["error", { max: 455 }],
      "max-depth": ["error", { max: 3 }],
      "max-params": ["error", { max: 4 }],
      complexity: ["error", { max: 15 }],
      "vue/max-props": ["error", { maxProps: 2 }],
    },
  },
  {
    // ── 唯一一個 per-file 放行（C119）──────────────────────────
    //
    // buildSliceFiles 841 行，佔 files.ts（858 行）的 98%，主體是一個
    // 回傳大物件的 return，值全是切片模板字串。它的認知複雜度是 0。
    //
    // ⚠️ 不把全域門檻抬到 841 的理由：那個數字是次高值（185）的 4.5 倍，
    // 抬上去等於這條規則對其餘所有產品碼形同不存在。孤立的極端值用
    // per-file 放行隔離，連續分佈用觀測 max —— 兩者都滿足「不擋任何
    // 既有程式碼」，但只有前者留下一條還在守東西的線。
    //
    // ⚠️ 這一行是**債，不是豁免**。它擋下的第一件事就是收緊的論證起點。
    //
    // ⚠️ **它已經擋下第一件事了**（C120）：模板多產一支 `vite.config.ts`，
    // 841 → 850。那次的處置留在樹上 —— 那支模板一個 `options` 的值都不用，
    // 所以被提到 `buildSliceFiles` 外面當 module 層常數（見 files.ts 的
    // `VITE_CONFIG`），函式只長 8 行而不是 47 行。**這條線每被推高一次，
    // 就是一次要寫下來的帳**，不是改個數字就算了。
    //
    // 850 → 843（C172）：範本測試刪了十條 import 時就已經驗過的斷言。
    // 降是 `threshold-check` 的「門檻過期」規則要求的（C147 §二）。
    // ⚠️ 它必須排在「腳手架的產品碼」那一條之後，理由同上。
    files: ["tools/slice-gen/src/files.ts"],
    rules: {
      "max-lines-per-function": ["error", { max: 843 }],
    },
  },
  {
    // ── SAST 規則的 fixture ────────────────────────────────────
    // `.semgrep/rules.ts` 裡的程式碼是**故意寫壞的**，用來證明
    // semgrep 的規則真的會命中（見該檔案的檔頭）。它不進任何建置。
    //
    // ⚠️ 加這條之前，oxlint 的 no-implied-eval 與 ESLint 的
    // no-unsanitized/property 各自獨立地抓到了它 —— 那正好確認
    // 這份 fixture 是真的壞程式碼，不是一個假想的壞例子。
    // ⚠️ 規則名要帶 plugin 前綴。不帶的話它從 error 降成 warning
    // 而不是關掉 —— 看起來像生效了，其實只是換一種顏色。
    files: [".semgrep/**"],
    rules: {
      "no-eval": "off",
      "no-implied-eval": "off",
      // ⚠️ 只有這一條有 typescript/ 版本；寫 `typescript/no-eval` 會讓
      // 整個 lint 設定建不起來（Rule not found），連掃都不會開始。
      "typescript/no-implied-eval": "off",
    },
  },
  {
    // ── D4 邊界防護第 2 層 ─────────────────────────────────────
    // 第 1 層（manifest）與第 3 層（相對路徑逃逸）在 tools/conformance，
    // 跑 Tier 2、繞不過。這一層跑本機，讓最常見的違規在編輯器裡當場現形。
    files: ["features/*/**"],
    rules: {
      // 擋裸模組名的跨切片 import，以及繞過 @org/http-client 的行為（D8）。
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@org/feature-*", "**/features/*", "axios", "ky", "got", "superagent"],
        },
      ],

      // ⚠️ 這裡**刻意不用** import/no-relative-parent-imports。
      //
      // 初版用了它來擋「相對路徑逃逸 package 根目錄」，實測後發現它太鈍：
      // 它擋掉的是**所有** `../`，包含 src/views/OrderList.vue 匯入同一個
      // package 內的 `../api.ts` —— 那是完全合法的內部結構。
      // 開著它等於強迫每個切片變成扁平目錄，DX 代價高到大家會去關掉它，
      // 那才是真正的破口。
      //
      // 真正需要的是「解析後是否仍在 package 根目錄內」，這需要路徑解析而非
      // 語法比對。已改為在 tools/conformance 精確實作（見該檔的
      // checkRelativeEscapes）。取捨：失去編輯器即時回饋，換得零偽陽性。
    },
  },
];
