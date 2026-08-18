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
 * **所以檢查的涵蓋範圍要說清楚：** 對 `node tools/<套件>/src/cli.ts` 與 eslint
 * 兩類步驟，比對是**精確的**（少一道紅、多一道也紅）；對 docker 與 `uses:`
 * 步驟，這道閘門**什麼都不說**。一道只守半個檔案的閘門，必須自己講明白
 * 守的是哪半個。
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
    id: "eslint",
    label: "ESLint 安全規則",
    command: "eslint . --max-warnings=0",
    ciCommand: "./node_modules/.bin/eslint . --max-warnings=0",
    tiers: ["tier2"],
    why: "只裝安全規則，與 oxlint 零重疊。存在的首要理由是 oxlint 沒有 vue/no-v-html（D5）。",
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
];
