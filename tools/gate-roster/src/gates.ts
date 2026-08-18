/**
 * 這個 repo 有哪些閘門、每一道在哪裡跑。
 *
 * ── 為什麼需要這份資料 ──────────────────────────────────────────────
 *
 * 在這之前，同一份閘門名冊被手抄在下列每一處：
 *
 *   - `package.json` 的 `scripts.gate`（跑哪幾道，以及順序）
 *   - `package.json` 的各別名（每一道要能單獨跑，例如 `vpr theme-verify`）
 *   - `.github/workflows/tier1-quality.yml`
 *   - `.github/workflows/tier2-security.yml`
 *   - README〈兩層檢查〉那張表
 *
 * **而沒有任何東西在斷言它們一致。**
 *
 * ⚠️ 上面是**列舉**，刻意不寫「N 處」—— 一句在講「不要抄清單」的話，
 * 本身不該是一個會過期的數字（C53）。加一處就多一行。
 *
 * 這不是假想的風險，它已經發作過兩次：
 *
 *   ① `doc-facts` 一度只在 tier2 裡，不在 `scripts.gate` 裡 —— 於是本機
 *      `vpr ready` 可以全綠而推上去 CI 紅，而 README 有一節就叫
 *      〈一次跑完所有檢查〉。（PR #51 修掉了這一次發作。）
 *   ② README 那張表的 Tier 2 那格寫著「一致性檢查 + ESLint 安全規則」，
 *      而 tier2 實際上還跑 `api-surface` 與 `doc-facts` —— **漏了兩道**。
 *      這一條是寫這份名冊的時候才發現的，也就是說它錯了一段時間而沒人知道。
 *
 * 兩次的形狀一樣：**一份到處都有副本的清單，改動時只有人記得改其中幾處。**
 * PR #51 修的是①這一次，沒修這一類（C41）。這份資料修的是這一類。
 *
 * ── 這份名冊涵蓋什麼、刻意不涵蓋什麼 ────────────────────────────────
 *
 * 涵蓋：**本 repo 自己寫的、而且本機跑得起來的檢查。** 也就是 `tools/` 底下
 * 那幾支 CLI，加上 eslint。
 *
 * ⚠️ **刻意不含 semgrep 與 gitleaks。** 它們只在 CI 跑（一個是 docker 映像、
 * 一個是 GitHub Action），本機沒有對應指令，而且它們的步驟是二十行的 shell。
 * 要把它們放進來，這份資料就得能表達 docker 參數與 `uses:` 步驟 —— 那等於
 * 讓 `gates.ts` 變成 workflow 產生器，而那條路會把 workflow 裡那些**載明理由的
 * 註解**（tier2 檔頭那三條規則、SAST 為什麼用自寫規則）變成產生器的樣板。
 * 那些註解是那兩個檔案裡最有價值的東西。
 *
 * **所以檢查的涵蓋範圍要說清楚：** 對 `node tools/<套件>/src/cli.ts`、
 * `vitest run --root tools/<套件>` 與 eslint 三類步驟，比對是**精確的**
 *（少一道紅、多一道也紅）；對 docker 與 `uses:` 步驟，這道閘門**什麼都不說**。
 * 一道只守半個檔案的閘門，必須自己講明白守的是哪半個。
 *
 * ── main 上多出來的三種形狀（C74）────────────────────────────────────
 *
 * 這份資料原本寫在 `release/v1`，那裡每一支 `tools/*` 都是一支 CLI、
 * 每一道閘門在 CI 剛好跑一次、而且每一道都在 `scripts.gate` 裡。
 * **`main` 三件都不成立**，所以多了三個欄位，每一個都**強制寫理由**：
 *
 *   1. `variants` —— 同一支工具在 CI 用不同參數跑第二次
 *      （`--require-fresh`、`--evidence`、`--verify-sbom`…）。
 *   2. `notInGateScript` —— 這道閘門刻意不進 `scripts.gate`。
 *   3. 沒有 `src/cli.ts` 的閘門（`bff-check` 是一包測試）——
 *      靠 `ciCommand` 表達，而 `GATE_SHAPED` 因此要認得 `vitest run --root`。
 *
 * ⚠️ **還有第三個 workflow：`exit-drill.yml`（每季排程的完整演練）。**
 * 這道閘門只讀 tier1 與 tier2 兩個檔案，**對它什麼都不說**。沒有把它納進來，
 * 是因為它跑的是 `--full`，那不是 PR 上的閘門，而名冊的 tier 模型只有兩層 ——
 * 硬塞會讓 `Tier` 變成「tier1 | tier2 | 每季」，而第三個值只有一個成員。
 * 這是這道閘門守備範圍的第二個洞，與 semgrep／gitleaks 那個並列。
 *
 * ⚠️ 三個欄位都是**字串**不是布林，那是刻意的：一個 `skipCheck: true`
 * 只會讓檢查閉嘴，而下一個人看不出來為什麼；一句必填的理由是可以被反駁的。
 * 「加例外的第一天就會有人加第二個，然後例外再也拿不掉」（C41）——
 * 擋住那件事的不是不准加，是**加了就得說得出口**。
 */

/** 閘門跑在哪一層。分層的理由見兩個 workflow 的檔頭。 */
export type Tier = "tier1" | "tier2";

export interface Gate {
  /**
   * 閘門代號。對 `tools/` 底下的閘門，它同時是 `package.json` 裡那個
   * 單獨跑的 script 別名（`vpr conformance`）。
   */
  readonly id: string;
  /**
   * 人看的名字。用在 README 的〈兩層檢查〉那張表，也用在 workflow 的
   * `name:`（後者是慣例，這道閘門不強制 —— 步驟名字寫錯不會造成假綠燈）。
   */
  readonly label: string;
  /**
   * 實作所在的 `tools/` 套件名。沒有這個欄位代表它不是本 repo 寫的
   *（例如 eslint），因此不參與「每個 `tools/*` 都要登記」那條檢查。
   */
  readonly pkg?: string;
  /** `vpr gate` 裡跑的那一行。 */
  readonly command: string;
  /**
   * workflow 裡跑的那一行，沒寫的話同 `command`。
   *
   * ⚠️ 只有 eslint 需要它，而那個差異是**刻意的**：CI 直接呼叫
   * `./node_modules/.bin/eslint`，不經過 `vpr`。D2 保單要求安全閘門獨立於
   * 可替換的驅動層 —— vite-plus 是 0.2.x beta，哪天換掉它，這道閘門必須
   * 原封不動繼續運作。理由的完整版在 tier2-security.yml 的檔頭。
   */
  readonly ciCommand?: string;
  readonly tiers: readonly Tier[];
  /** 為什麼有這道閘門、以及為什麼在那一層。 */
  readonly why: string;
  /**
   * 同一支工具在 workflow 裡**用不同參數跑的其他次**。
   *
   * 少了這個欄位，那些行會被報成「workflow 多一道」—— 而它們是對的。
   * ⚠️ `why` 必填：同一支工具多跑一次，是最容易悄悄長出來的東西。
   */
  readonly variants?: readonly Variant[];
  /**
   * 這道閘門**刻意不在 `scripts.gate` 裡**，這裡寫為什麼。
   *
   * 只有一種情況成立：本機已經有別的東西涵蓋它（`bff-check` 的測試由
   * `vp run -r test` 跑到）。**別名仍然必須有** —— 少一個別名不會造成
   * 假綠燈，但會讓文件裡那行指令不存在。
   */
  readonly notInGateScript?: string;
}

/** 同一支工具在 workflow 裡的另一次呼叫。 */
export interface Variant {
  /** workflow 裡那一行的完整指令（含參數）。 */
  readonly command: string;
  /** 為什麼要多跑這一次。**必填**。 */
  readonly why: string;
}

/**
 * 順序就是 `scripts.gate` 的執行順序，而且是有意義的：**便宜的排前面。**
 * 名冊檢查只讀幾個檔案，是全部裡面最快的，所以它第一個跑 —— 設定不一致
 * 這件事，你會希望在花三十秒跑型別檢查**之前**就知道。
 */
export const GATES: readonly Gate[] = [
  {
    id: "gate-roster",
    label: "閘門名冊一致",
    pkg: "gate-roster",
    command: "node tools/gate-roster/src/cli.ts",
    tiers: ["tier1"],
    why:
      "四份名冊（scripts.gate、兩個 workflow、README 那張表）必須對得上。" +
      "在 Tier 1 而不是 Tier 2 的理由與 theme-verify 同一條：Tier 2 的三條規則" +
      "只為了「安全掃描的結果會隨時間失效」，而「名冊有沒有對齊」不會隨時間失效。",
  },
  {
    id: "conformance",
    label: "一致性檢查",
    pkg: "conformance",
    command: "node tools/conformance/src/cli.ts",
    tiers: ["tier2"],
    why: "切片契約與邊界（D4 第 1、3 層 / D9）。",
  },
  {
    id: "api-surface",
    label: "platform API 表面檢查",
    pkg: "api-surface",
    command: "node tools/api-surface/src/cli.ts",
    tiers: ["tier2"],
    why: "platform/ 的破壞性變更必須附 codemod（D12）—— 這一步讓那條規則有牙齒。",
  },
  {
    id: "vue-typecheck",
    label: ".vue 型別檢查",
    pkg: "vue-typecheck",
    command: "node tools/vue-typecheck/src/cli.ts",
    tiers: ["tier1"],
    why: "vp check 的 tsgolint 不看 SFC，設計系統的元件原始碼會整片沒被型別檢查（C68）。",
  },
  {
    id: "theme-verify",
    label: "設計系統接縫",
    pkg: "theme-verify",
    command: "node tools/theme-verify/src/cli.ts",
    tiers: ["tier1"],
    why: "配色與形狀兩條軸實測可換（HANDOFF #24 / C62）。不會隨時間失效，所以在 Tier 1。",
  },
  {
    // ⚠️ id 不是 `exit-drill`：那個別名已經有意思了 ——「跑完整演練」
    // （`--full`，數分鐘、連網、每季一次），README 與 cli.ts 的訊息都這樣引用它。
    // 閘門跑的是**另一件事**：只驗退出面，不建置。給它自己的名字，
    // 而不是搶走一個已經有意義的名字然後去改四處文件。
    id: "exit-surface",
    label: "D2 退出面檢查",
    pkg: "exit-drill",
    command: "node tools/exit-drill/src/cli.ts",
    tiers: ["tier2"],
    why:
      "D2 保單：驅動層必須換得掉，而退出面收斂在兩個設定檔（R1／R9）。" +
      "PR 上只驗退出面本身 —— 完整演練每季跑一次（C64），一次要二十分鐘，" +
      "掛在每個 PR 上只會讓人想辦法繞過它。",
    variants: [
      {
        command: "node tools/exit-drill/src/cli.ts --require-fresh",
        why:
          "排程才跑：連證據檔的新鮮度一起驗。放在 PR 上會讓「證據過期」變成" +
          "與這次改動無關的紅燈，而那種紅燈會被習慣性忽略。",
      },
    ],
  },
  {
    id: "supply-chain",
    label: "供應鏈盤點",
    pkg: "supply-chain",
    command: "node tools/supply-chain/src/cli.ts",
    tiers: ["tier2"],
    why: "原生二進位盤點與來源綁定（R2／R3／R4／R5／R8）。inventory.json 進版控，漂移會紅。",
    variants: [
      {
        command: "node tools/supply-chain/src/cli.ts --split-lockfile .scan",
        why:
          "**這一步不是判定，是準備**：把 lockfile 拆成 Trivy 讀得懂的形狀。" +
          "它長得像閘門只是因為它也是這支 CLI 的一個模式 —— 它不會擋下任何東西。",
      },
      {
        command: "node tools/supply-chain/src/cli.ts --verify-sbom sbom.cdx.json",
        why:
          "SBOM 產出之後驗它的完整性。與主判定分開是因為它要等 Trivy 先產出檔案，" +
          "在另一個 job 裡。",
      },
    ],
  },
  {
    id: "compliance",
    label: "法遵對照表",
    pkg: "compliance",
    command: "node tools/compliance/src/cli.ts",
    tiers: ["tier2"],
    why: "個資法對照表與條文覆蓋（D13）。表是產生的，人改了原始碼而沒重產就紅。",
    variants: [
      {
        command: "node tools/compliance/src/cli.ts --evidence",
        why:
          "§16 證據保存清單 —— 與對照表**共用實作、判定的是不同的東西**。" +
          "分成兩步是為了 CI 上「哪一個紅了」一眼看得到。",
      },
    ],
  },
  {
    id: "pii",
    label: "測試環境個資檢查",
    pkg: "pii-check",
    command: "node tools/pii-check/src/cli.ts",
    tiers: ["tier2"],
    why:
      "§11 II ⑥ 測試環境不得使用真實個資。抓得到有校驗碼的識別碼，抓不到姓名（C52）。" +
      "⚠️ 別名叫 `pii` 而套件叫 `pii-check` —— id 對別名、pkg 對目錄，兩者刻意分開。",
  },
  {
    id: "doc-facts",
    label: "文件數字與事實來源一致",
    pkg: "doc-facts",
    command: "node tools/doc-facts/src/cli.ts",
    tiers: ["tier2"],
    why:
      "文件裡的數字 vs. repo 內部事實來源（A1）。在 Tier 2 是因為它跨整個 repo，" +
      "不該因為「這次改動與它無關」而被過濾掉。",
  },
  {
    id: "bff-check",
    label: "BFF 契約驗收",
    pkg: "bff-check",
    command: "vp run -F @org/bff-check test",
    ciCommand: "./node_modules/.bin/vitest run --root tools/bff-check",
    tiers: ["tier2"],
    why:
      "R6 處置：BFF 契約是可執行規格，這一步證明參考實作真的滿足它。" +
      "⚠️ 這個套件**沒有 src/cli.ts**，它就是一包測試 —— 名冊裡唯一一個這種形狀。",
    notInGateScript:
      "本機由 `vp run -r test` 跑到（它是 workspace 成員，測試會被掃到）。" +
      "放進 scripts.gate 等於同一批測試在 `vpr ready` 裡跑兩次。" +
      "CI 上它是獨立一步，理由是 GitHub 一步一格顯示 —— 混在全 repo 測試裡，" +
      "「契約破了」與「某個切片的單元測試壞了」會長得一樣。",
  },
  {
    id: "eslint",
    label: "ESLint 安全規則",
    command: "eslint . --max-warnings=0",
    ciCommand: "./node_modules/.bin/eslint . --max-warnings=0",
    tiers: ["tier2"],
    why: "只裝安全規則，與 oxlint 零重疊。存在的首要理由是 oxlint 沒有 vue/no-v-html（D5）。",
  },
  {
    id: "a11y",
    label: "無障礙靜態檢查",
    command: "eslint --config platform/eslint-config/src/a11y.js . --max-warnings=0",
    ciCommand:
      "./node_modules/.bin/eslint --config platform/eslint-config/src/a11y.js . --max-warnings=0",
    tiers: ["tier1"],
    why:
      "AA 的靜態可測部分（C60／C69）。在 Tier 1 是因為它量的是原始碼本身，" +
      "不會隨時間失效 —— 而且它刻意**只**是前置過濾器，驗收仍然是 Freego ＋ 人工。",
  },
];

export interface Ungated {
  /** `tools/` 底下的套件名。 */
  readonly pkg: string;
  /** 為什麼它不是閘門。**必填**，而且要寫得讓下一個人不必重新推導一次。 */
  readonly why: string;
}

/**
 * `tools/` 底下、**刻意不當閘門**的那幾個。
 *
 * 這份清單存在的理由是讓「漏接」與「刻意不接」長得不一樣。少了它，
 * 完整性檢查只有兩種收場：對著 `codemods` 亂叫（於是第一天就被加例外，
 * 然後例外再也拿不掉 —— C41），或是乾脆不檢查。
 *
 * 加一支新工具而不想讓它進閘門？寫在這裡，**連理由一起寫**。
 */
export const UNGATED: readonly Ungated[] = [
  {
    pkg: "codemods",
    why:
      "codemod 執行器與歷史遷移（D12）。它是**改東西的**，不是**檢查東西的** —— " +
      "把它放進閘門等於每次 CI 都對 repo 跑一次遷移。它的正確性由自己的測試守。",
  },
  {
    pkg: "slice-gen",
    why:
      "切片產生器（`keywords: vite-plus-generator`）。同理：它產生檔案，不判定對錯。" +
      "「它產出來的東西合不合契約」由 conformance 守，而且它的 e2e 測試會真的產一片再去跑 conformance。",
  },
  {
    pkg: "gate-kit",
    why:
      "**它是 library，不是閘門**（C73）—— 沒有 cli.ts，只導出 repoRoot／walk／parseFlags。" +
      "閘門底下那一層抽出來的東西，被 pii-check 等幾支消費。" +
      "它壞了會讓消費它的閘門紅，那就是它被驗到的方式。",
  },
  {
    pkg: "csp-verify",
    why:
      "**要人開瀏覽器**：它起一台伺服器、用正式 CSP 服務正式建置產物，由人點過互動路徑。" +
      "曾經有 --record／--verify 把結果寫成證據檔並用指紋守有效期，**已移除**（C52）—— " +
      "升 reka-ui／vue／tailwindcss 就紅，而修復要人開瀏覽器跑一次，" +
      "那是所有閘門裡每次成本最高的一道。留著它零摩擦，要驗時隨時跑得起來；" +
      "失去的是「有沒有人真的驗過」這個問題的機器答案。",
  },
  {
    pkg: "ui-survey",
    why:
      "**選型市調，不是判定**（D15 / #49）。它算的是候選 UI 方案的授權、維護狀態、" +
      "供應鏈成本 —— 那些數字會過期，但過期不代表這個 repo 壞了。" +
      "把它掛進閘門等於每次 PR 都因為別人的專案改了授權而紅。重新評估時重跑，不要重讀。",
  },
];
