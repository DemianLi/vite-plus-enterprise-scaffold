/**
 * 法遵對照的**事實來源**：條號 ↔ 閘門 ↔ 證據 ↔ 有沒有證明過會紅。
 *
 * ── 為什麼這份映射寫在原始碼裡，而不是 JSON 或 Markdown ──────────────
 *
 * 與 `tools/supply-chain` 的 `FAMILY_TIERS` 同一個理由：「這道閘門守的是
 * 哪一條」是**判斷**，判斷要在 PR 上被看見。放進 JSON 它就變成沒有人審的資料，
 * 放進 Markdown 它會在下一次改動閘門時安靜地過期。
 *
 * ── 這張表最重要的欄位是最後一欄 ────────────────────────────────────
 *
 * `negativeTest` 回答的是稽核桌上唯一會被問的那句話：
 *
 *     「你怎麼知道這個檢查真的有在檢查？」
 *
 * 「我們有 46 條測試」不是答案 —— 那證明零件對。
 * 「有一條測試會故意把它弄壞，而它會紅」才是答案。
 *
 * 所以這一欄**允許是 null**，而且 null 會照樣印在表上。一份把洞藏起來的
 * 對照表比沒有對照表更危險：空的那一格至少誠實，假的那一列會讓人以為有守。
 *
 * ── ⚠️ `note` 裡不寫測試條數（2026-08-16）─────────────────────────────
 *
 * 這一節是被上面那句話自己抓到的。
 *
 * 原本六個 `note` 都以「N 條反向測試」開頭。實測之後：**五個是對的，
 * 一個是錯的** —— 而錯的那個是 supply-chain 的「46 條」。也就是上面那句
 * 「『我們有 46 條測試』不是答案」拿來當反例的數字，**正好就是這個檔案
 * 自己寫在下面、而且是六個裡唯一錯掉的那一個**。
 *
 * 對的那五個是**碰巧**：沒有任何東西在維持它們。它們會在下次有人加一條
 * 測試的時候安靜地變錯，而 `note` 是印在交給稽核的那張表上的。
 *
 * 靜態數 `it(` 不能用：好幾支測試用 `for` 迴圈產生案例，數出來會少算 ——
 * 一個**低估自己**的數字比高估更容易被相信。
 *
 * 所以拿掉數詞，照 C53：**沒有事實來源的計數不要寫**。留下來的是這一欄
 * 真正該回答的東西 —— **那些測試破壞的是什麼、涵蓋了哪些失明模式**。
 * 「零」是例外，它留著：`supply-chain` 的「沒有一條測…」正是這一欄的重點。
 *
 * ── 為什麼不是每一條法規都該有閘門 ──────────────────────────────────
 *
 * §11 II 的防火牆、入侵偵測、防毒，是後端與基礎設施的事。把它們列成
 * 「前端沒做到」會讓這張表變成一份永遠補不完的清單，而真正的兩個洞
 * （⑥ 測試環境不得用真個資、⑨ 隱碼機制）會淹沒在裡面。
 * 所以 `scope` 是必填的：它把「不該我做」和「該我做但沒做」分開。
 */

/** 這條要求落在誰身上。決定它會不會被算進「前端的洞」。 */
export type Scope = "frontend" | "backend" | "process";

/**
 * 這個東西**會不會擋人**。
 *
 * ⚠️ 這個欄位是為了不說謊而存在的。Renovate 補的是 §11 II ③「定期檢測
 * **並因應**」裡的「因應」那一半 —— 它提出升級，但它不擋任何東西。
 * 硬把它塞進「證明過會紅」那一欄，只有兩種寫法：宣稱有反向測試（謊），
 * 或算進「8 道未證明」（把一個永遠不會紅的東西列成待補的洞，同樣是謊）。
 */
export type GateKind = "gate" | "proposer";

export interface Gate {
  readonly id: string;
  readonly kind: GateKind;
  /** 這道閘門實際在檢查什麼。 */
  readonly what: string;
  /** 怎麼跑它。稽核會要求現場重現。 */
  readonly command: string;
  /** 進版控的證據檔；null = 這道閘門不留下任何可交付的東西。 */
  readonly evidence: string | null;
  /** 證明「該紅的時候會紅」的那支測試；null = 尚未證明。 */
  readonly negativeTest: string | null;
  readonly note: string;
}

/** 閘門守到這條的多少。與「閘門會不會紅」是兩件事，混在一起就會產生假的一列。 */
export type Coverage = "none" | "partial" | "full";

export interface Control {
  /** 條號。目前全部來自現行有效的《數位經濟相關產業個人資料檔案安全維護管理辦法》。 */
  readonly article: string;
  readonly requirement: string;
  readonly scope: Scope;
  /** 守這條的閘門 id；空陣列 = 沒有任何東西在守。 */
  readonly gates: readonly string[];
  /**
   * ⚠️ 這個欄位與 `gates` 是**獨立**的判斷，不能從它推導。
   *
   * §12 III 是最好的例子：`conformance` 守它、而且證明過會紅，所以第一版
   * 顯示「✅ 已證明」—— 但它守的是「CODEOWNERS 有條目」，法條要的是
   * 「權限設定並定期檢視」。而且目前那 22 條全是 Unknown owner。
   *
   * ⚠️ 2026-08-16 又查出那道落差是**三層**不是一層（C63）——「換掉佔位符」
   * 只拆掉中間那層。細節在該列的 note，不在這裡重寫一次。
   *
   * **有閘門、閘門也會紅、法條仍然沒被滿足** —— 這三件事同時為真，
   * 而只有一欄的表沒辦法講出來。那正是這張表最該擋下的那種假象。
   */
  readonly coverage: Coverage;
  /**
   * 腳手架該做而還沒做。
   *
   * 與 `scope` 分開的理由：§16（證據保存五年）責任落在流程面，但**腳手架
   * 欠它一份保存期政策**；§11 II ① 的防火牆同樣不是前端的事，而腳手架
   * 什麼都不欠。兩者若都只看 `scope`，會一起被標成「不在範圍」。
   */
  readonly owed: boolean;
  readonly note: string;
}

/**
 * 現行有效的規範。
 *
 * ⚠️ 刻意**只列這一部**。個資法 §20-1 已於民國 114 年 11 月 11 日公布，
 * 但「施行日期由行政院定之」而至今未定；其授權的《個人資料檔案安全維護
 * 管理辦法》仍是 115 年 1 月 22 日的預告草案。
 *
 * 把還沒生效的條文混進這張表，會讓「我們達標了嗎」變成無法回答的問題 ——
 * 未生效的部分列在 `FUTURE` 裡，兩者不混。
 */
export const REGULATION = "數位經濟相關產業個人資料檔案安全維護管理辦法（數位發展部）";

export const GATES: readonly Gate[] = [
  {
    id: "conformance",
    kind: "gate",
    what: "切片契約、分層邊界、設計系統採用、擁有權、幽靈依賴、CI action 以 SHA 釘住（D4／D9／D12／D14／D15）",
    command: "node tools/conformance/src/cli.ts",
    evidence: null,
    negativeTest: "tools/conformance/tests/negative.test.ts",
    note: "反向測試破壞的是複製到暫存目錄的副本，repo 原始碼不被動到。⚠️ 幽靈依賴那條（2026-08-16 加）**刻意不掃 `tools/*` 與 `tests/`** —— 產生器與測試的本職就是把程式碼當資料拿著，乾跑時那兩處噴出 20 幾條全數偽陽性。範圍窄而準，勝過寬而吵。⚠️ 「CI action 以 SHA 釘住」那條（同日加）**只看 `uses:`**，`run:` 裡的容器映像不在範圍 —— 要在 shell 腳本裡認出映像參考，任何做得到的正則都會對路徑與網址誤報。映像目前是手動用 digest 釘的，而「手動釘的東西」正是那條檢查存在的理由，缺口記在 HANDOFF 第 23 項。",
  },
  {
    id: "bff-check",
    kind: "gate",
    what: "D8 同源中間層的 15 條行為契約（cookie 屬性、CSRF、401／403）",
    command: "./node_modules/.bin/vitest run --root tools/bff-check",
    evidence: null,
    negativeTest: "tools/bff-check/tests/negative.test.ts",
    note: "反向測試用改寫回應的 proxy 破壞行為而非程式碼，實作改寫法也不會失效。",
  },
  {
    id: "api-surface",
    kind: "gate",
    what: "platform/ 公開 API 的破壞性變更：export 名稱＋**型別形狀**（D12）",
    command: "node tools/api-surface/src/cli.ts",
    evidence: "tools/api-surface/surface.json",
    negativeTest: "tools/api-surface/tests/negative.test.ts",
    note: "2026-08-16 從「只比對 export 名稱」重做成「比對型別形狀」—— 舊版對「interface 加一個必填欄位」完全不會說話，而那是下游唯一真的會編不過的那種變更。反向測試分兩路：**改基準檔的副本**（`--baseline`）問「該紅的會不會紅」，**改 fixture 套件的原始碼**（`--platform`）問反過來的「這個重構不該漂移」；兩路都不用動 platform 的原始碼。另有幾條驗 codemod 這個合法出口沒有被繞過，也沒有被誤擋 —— 包含形狀變更用的 `changes` 登記。",
  },
  {
    id: "supply-chain",
    kind: "gate",
    what: "相依盤點、原生家族分類、tarball digest 與 lockfile 綁定（R2–R5／R8）",
    command: "node tools/supply-chain/src/cli.ts",
    evidence: "tools/supply-chain/provenance.json",
    negativeTest: null,
    note: "parseLockfile／buildInventory 有零件測試，但**沒有一條**測「把 provenance 弄髒之後 CLI 會不會 exit 1」。",
  },
  {
    id: "exit-drill",
    kind: "gate",
    what: "D2 退出面靜態檢查、plugin 帳目、**測試相依帳目**、演練證據新鮮度（120 天）",
    command: "node tools/exit-drill/src/cli.ts",
    evidence: "tools/exit-drill/evidence.json",
    negativeTest: null,
    note: "有零件測試。⚠️ 2026-08-16 加了第三項「測試相依帳目」（C64），而且是補一個**真的已經發生**的洞：完整演練每季才跑一次，`happy-dom` 從 PR #15 起就沒被安裝、演練從那時起就是壞的，19 個 PR 沒有人知道。該項已實測會紅（注入未登記的 devDependency → exit 1）。⚠️ 這一欄仍記 null：那是整道閘門四項的總和，而證據新鮮度守衛自己仍未被證明過會紅 —— 只證明了其中一項就把整格標成已證明，正是這張表最該擋下的事。",
  },
  {
    id: "theme-verify",
    kind: "gate",
    what: "設計系統接縫：元件只准用語意代幣（靜態）＋ 產物零懸空代幣引用（引用）＋ 各案覆寫代幣真的會進到產物（建置兩次比對）（D15／C62）",
    command: "node tools/theme-verify/src/cli.ts",
    evidence: null,
    negativeTest: "tools/theme-verify/tests/palette.test.ts",
    note: "2026-08-17 加（HANDOFF #24）。守的是 C62 那句產品要求的**前兩條軸** —— 配色與 component 形狀；**第三條（互動方式）完全不在範圍**，它被 `api-surface` 的 `SFC_UNSUPPORTED` 主動擋著。綠燈的意思是「兩條軸實測可換」，不是「設計系統可換」。⚠️ 建置那一段（比對兩份產出的 CSS）是真的跑 Tailwind，因為它的失敗模式是**建置成功、CSS 還變大、但一個 utility 都沒有** —— 只讀 CSS 檔驗不到。九條斷言裡八條實測會紅，逐條列在 `tools/theme-verify/README.md`；「覆寫零附帶影響」那條未測，破壞它得改 Tailwind 本身。⚠️ 「引用」那一段是同日稍晚補的，補的是**這道閘門自己上線那個 PR 留下的缺陷**：代幣改名，6 處使用端沒跟上，而前兩段只掃 `platform/ui` 所以全綠（C66）。它有死角：括號寫法的懸空引用抓得到，正規工具類名對應的代幣被刪掉時 Tailwind 什麼都不產生，抓不到 —— 那一半在切片上目前沒有守，記在 HANDOFF #24。⚠️ 這一欄只放得下一個路徑，指的是靜態那一段；「引用」那一段的零件測試是 `tools/theme-verify/tests/css.test.ts`（六條，含「帶 fallback 的不算違規」與「解析不到東西時要紅」）。建置那一段的紅燈是手動實測的，沒有自動化的反向測試 —— 兩次真建置放進單元測試會讓這道閘門的成本翻倍。",
  },
  {
    id: "eslint-security",
    kind: "gate",
    what: "no-unsanitized、eslint-plugin-security、vue/no-v-html（D5 的安全那一半）",
    command: "./node_modules/.bin/eslint . --max-warnings=0",
    evidence: null,
    negativeTest: null,
    note: "存在的首要理由是 oxlint 沒有 vue/no-v-html —— Vue 專案最主要的 XSS 入口。",
  },
  {
    id: "a11y-lint",
    kind: "gate",
    what: "Vue 模板的靜態無障礙檢查：原生元素與屬性（缺 alt、缺 label、角色錯用、只有滑鼠事件）",
    command:
      "./node_modules/.bin/eslint --config platform/eslint-config/src/a11y.js . --max-warnings=0",
    evidence: null,
    negativeTest: "platform/eslint-config/tests/a11y.test.ts",
    note: "⚠️ 這道閘門對本 repo 的正常結果是**零個發現，而模板是有缺陷的**。它比對的是原生元素與屬性，而本 repo 的互動幾乎都包在元件裡（UiButton／RouterLink／DialogRoot）—— 元件對它是透明的。實測：同一批 `.vue` 用人眼讀出四個真缺陷（表格沒有 caption、`<th />` 是空的、載入狀態沒有 live region、`<nav>` 沒有可及名稱），它一個都沒報；那四個已在加這道閘門的同一個 PR 修掉。所以它覆蓋的是**靜態可查的那一半**，看不見的那一類具名列在 HANDOFF 第 22 項 —— 不要用這個綠燈取代它。反向測試拿一份故意寫壞的 SFC，斷言**每一條被啟用的規則都確實對它開火**（比的是規則 ID 的集合，不是數量、也不是 exit code）；另有一條比對「repo 裡有幾個 `.vue`」與「閘門掃到幾個」，因為「掃到零個」與「什麼都沒掃到」在 CI 上長得一模一樣。⚠️ 要哪個等級、驗收怎麼判，**以 RFP 為準**，這裡與工具設定裡都刻意不寫死。",
  },
  {
    id: "trivy-sca",
    kind: "gate",
    what: "相依套件的 HIGH／CRITICAL 漏洞，PR ＋ 每日 21:00 UTC 排程",
    command: "aquasecurity/trivy-action（.github/workflows/tier2-security.yml）",
    evidence: null,
    negativeTest: null,
    note: "唯一直接對得上 §11 II ③ 的閘門。兩個已知失明模式（C33／C34）現在由 `trivy-sbom` 的反向測試守著，而**設定漂移**（少一行 TRIVY_INCLUDE_DEV_DEPS、拿掉 exit-code）也有測試釘住。⚠️ 但仍未證明「Trivy 發現 CVE 時 CI 會紅」—— 那需要一份帶已知 CVE 的 fixture，而那種 fixture 會在 CVE 被修掉的那天因為錯誤的理由變綠。這一格刻意留白。",
  },
  {
    id: "trivy-sbom",
    kind: "gate",
    what: "CycloneDX SBOM 產出，並比對 component 數與 lockfile 套件數",
    command: "node tools/supply-chain/src/cli.ts --verify-sbom sbom.cdx.json",
    evidence: null,
    negativeTest: "tools/supply-chain/tests/sbom-negative.test.ts",
    note: "反向測試涵蓋兩個已知失明模式，各有一條：SBOM 0 個 component（C33）、只有 20 個（C34 只解第一份 YAML 文件）。⚠️ SBOM 仍只上傳為 artifact（保留 90 天）、沒有進版控 —— 而 §16 要的是 5 年。",
  },
  {
    id: "sast",
    kind: "gate",
    what: "跨函式的汙點傳遞（路由參數 → DOM sink）與執行期組程式碼 —— lint 看不到的那一類",
    command:
      "semgrep scan --config .semgrep/rules.yml --exclude .semgrep（.github/workflows/tier2-security.yml）",
    evidence: null,
    negativeTest: ".semgrep/rules.ts",
    note: "⚠️ **這不是交給機關的那份 SAST 報告** —— 那份由第三方或機關指定的商用工具產出，是標案交付物。這裡是開發當下的前置過濾器：把「驗收前才知道」變成「開發當下就知道」。規則自寫而非用公開規則集，是實測決定的（C56）：拿故意寫壞的 fixture 去測，p/xss、p/security-audit、p/owasp-top-ten、p/default 四組共 210 條規則**全部命中 0**，兩條自寫規則命中 2 —— 公開規則集的重心在伺服器端，Vue SPA 的瀏覽器端 DOM 汙點流覆蓋得最薄。反向測試就是 `rules.ts` 本身（semgrep 的 fixture 格式），含一條對照組：同一個汙點來源流進 `textContent` 不得被報，否則「看到 route.query 就報」的爛規則也會通過。⚠️ `semgrep --test` 在**找不到 fixture 時回傳 0**，所以 workflow 有兩道防呆：`No unit tests found` 要紅，且輸出必須有真的「N/N tests passed」數字。",
  },
  {
    id: "gitleaks",
    kind: "gate",
    what: "機密掃描，fetch-depth: 0 以涵蓋被後續 commit 蓋掉的機密",
    command: "gitleaks/gitleaks-action（.github/workflows/tier2-security.yml）",
    evidence: null,
    negativeTest: null,
    note: "第三方 action，反向測試要塞一個假機密進暫存 repo。",
  },
  {
    id: "pii-test-data",
    kind: "gate",
    what: "測試資料裡不得有真實個資：身分證字號、Luhn 卡號、手機、指向真實網域的信箱",
    command: "node tools/pii-check/src/cli.ts",
    evidence: null,
    negativeTest: "tools/pii-check/tests/roster.test.ts",
    note: "只抓**有校驗規則**的識別碼 —— 亂打的字串幾乎不可能通過校驗，所以誤報率天生就低。⚠️ **姓名抓不到**：「林佳蓉」與一個真的客戶的名字在字面上沒有任何差別，任何宣稱抓得到的實作都是在猜。所以 ⑥ 的覆蓋是 partial。第一版收信箱時沒限定頂級網域是字母，於是把 `fsevents@2.3.3` 這種 npm 套件規格當成信箱，一次報 45 條 —— 那種閘門第一天就會被關掉。",
  },
  {
    id: "dependency-health",
    kind: "gate",
    what: "外部直接相依（24 個）的維護狀態與授權變更 —— 停更、或授權被偷偷改掉",
    command: "node tools/supply-chain/src/cli.ts（擷取：--capture-health）",
    evidence: "tools/supply-chain/dependency-health.json",
    negativeTest: "tools/supply-chain/tests/health.test.ts",
    note: "判定函式原本住在 UI 選型市調裡，掃的是五個早已選完的候選 —— 能力是對的（PrimeVue 的商業授權就是被它抓到的），目標是錯的。重新瞄準到實際安裝的相依之後，第一次跑就標出 clsx（兩年沒發版，已寫下理由接受）。",
  },
  {
    id: "renovate",
    kind: "proposer",
    what: "提出相依升級與安全修補 —— §11 II ③「檢測**並因應**」裡的因應那一半",
    command: "Mend Renovate App（設定：renovate.json）",
    evidence: "renovate.json",
    negativeTest: null,
    note: "在它之前，整個腳手架能在升級**之後**告訴你什麼壞了，卻沒有一個東西會說「該升了」。⚠️ 它不擋任何東西，所以「證明過會紅」對它不適用（見 GateKind）。安全邊界在 `--recapture-safe`：升級 PR 造成的不同步可自動重擷，但 integrity-changed 一律拒絕 —— 那是事故不是升級。",
  },
  {
    id: "doc-facts",
    kind: "gate",
    what: "現況文件引用的數字，與 repo 內部事實來源推導出來的一致（事實來源與守哪幾份文件見 doc-facts 的 FACTS／GUARDED）",
    command: "node tools/doc-facts/src/cli.ts",
    evidence: null,
    negativeTest: "tools/doc-facts/tests/facts.test.ts",
    note: "第一次跑就抓到 10 處過期，包括 README 那句「這些數字**全部由 pnpm-lock.yaml 推導**，不是抄的」—— 它們正是抄的。⚠️ 刻意**不守 DECISIONS.md**：那是有日期的決策日誌，「C24 當時是 467 個套件」陳述的是歷史，守它等於要求回頭改寫歷史。登記的是**整句樣式**而不是「任何 N 個 X」，因為 HANDOFF 裡的 8／22 個原生二進位是子集不是總數 —— 句子被改寫會變成 never-cited 的紅燈，失敗方向是安全的。2026-08-16 第二輪擴大時，補登記的當下又有兩個數字是錯的，其中一個是**同一天寫下的** —— 而登記還逼出一個歧義：「N 個 action」在兩處分別指引用處與不重複 action，兩個事實共用一個講法就沒有樣式分得開它們（C59）。",
  },
  {
    id: "evidence-manifest",
    kind: "gate",
    what: "§16 證據清單與現實一致：宣告的檔案都在，且每一份都有閘門在維護",
    command: "node tools/compliance/src/cli.ts --evidence",
    evidence: null,
    negativeTest: "tools/compliance/tests/evidence.test.ts",
    note: "它產出的是**交接用的那張表**，不是保存期政策 —— 後者是組織文件。雙向驗：宣告了但檔案不在（清單指向空氣，對方以為有東西可歸檔）、閘門有證據檔但清單沒收（漏一份而沒有人會發現）。第一次跑就抓到對照表**低估**了自己：supply-chain 實際維護兩份基線，而 Gate.evidence 只記得住一份。",
  },
  {
    id: "compliance",
    kind: "gate",
    what: "本對照表本身：映射與檔案系統一致、且沒有列在說謊",
    command: "node tools/compliance/src/cli.ts",
    evidence: "tools/compliance/COMPLIANCE.md",
    negativeTest: "tools/compliance/tests/negative.test.ts",
    note: "自己也要守自己的規則，否則這張表就是它自己記錄的那種「假的一列」。",
  },
];

export const CONTROLS: readonly Control[] = [
  {
    article: "§11 I",
    requirement: "個資之蒐集處理利用應採適當加密，備份與傳輸各採適當保護",
    scope: "frontend",
    gates: ["bff-check"],
    coverage: "partial",
    owed: false,
    note: "前端只負責傳輸面：HSTS 與 Secure cookie 由 @org/security-headers 與 D8 契約守。靜態加密是 gateway 與資料庫的事。⚠️ csp-verify 刻意不列在這裡 —— CSP 不是加密，把它掛到這條會讓覆蓋看起來比實際好。",
  },
  {
    article: "§11 II ①",
    requirement: "防火牆與入侵偵測設備之建置與更新",
    scope: "backend",
    gates: [],
    coverage: "none",
    owed: false,
    note: "基礎設施。腳手架不提供，也不該假裝提供。",
  },
  {
    article: "§11 II ②",
    requirement: "異常存取行為之監控與演練機制",
    scope: "backend",
    gates: [],
    coverage: "none",
    owed: false,
    note: "同上。前端無從觀測。",
  },
  {
    article: "§11 II ③",
    requirement: "定期檢測並因應系統漏洞所造成之威脅",
    scope: "frontend",
    gates: ["trivy-sca", "trivy-sbom", "supply-chain", "dependency-health", "renovate", "sast"],
    coverage: "partial",
    owed: true,
    note: "這一條有兩半：**檢測**由 Trivy 做（每日 21:00 UTC 排程 —— 沒有它，三個月沒人動的專案就三個月沒掃過），**因應**由 Renovate 提出（D13 的 critical 3 天／high 14 天 SLA 要有人真的去升，才是 SLA）。⚠️ 這一格原本寫著「自己寫的程式碼沒有 SAST」—— **2026-08-16 起不再成立**（見 `sast` 閘門）。但覆蓋仍是 partial 而不是 full，而且理由要說清楚：repo 裡的 semgrep 是**前置過濾器**，只有兩條規則、守的是汙點傳遞與執行期組程式碼；真正要交付的源碼掃描報告由第三方或機關指定的商用工具產出。**把這一格標成 full 就是重演 §11 II ⑦ 那次高估。**",
  },
  {
    article: "§11 II ④",
    requirement: "防毒軟體與惡意程式檢測",
    scope: "backend",
    gates: [],
    coverage: "none",
    owed: false,
    note: "端點與伺服器。",
  },
  {
    article: "§11 II ⑤",
    requirement: "認證機制與密碼複雜度設定",
    scope: "frontend",
    gates: ["bff-check"],
    coverage: "partial",
    owed: false,
    note: "契約守的是 cookie 屬性、CSRF 與 401／403 路徑。密碼複雜度在 OIDC provider，腳手架驗不到 —— 那是 HANDOFF #8 交給 gateway 的部分。",
  },
  {
    article: "§11 II ⑥",
    requirement: "測試環境應避免使用真實個人資料",
    scope: "frontend",
    gates: ["pii-test-data"],
    coverage: "partial",
    owed: false,
    note: "掃 tests/、fixture、bff-mock 的示範資料與 i18n 訊息。⚠️ 覆蓋是 **partial 而非 full，而且補不滿**：抓得到有校驗碼的識別碼，抓不到姓名與地址 —— 那不是實作缺口，是這類資料沒有可判定的性質。標成 full 就是重演 ⑦ 那個高估。",
  },
  {
    article: "§11 II ⑦",
    requirement: "確保系統變更之安全性",
    scope: "frontend",
    gates: ["conformance", "api-surface", "eslint-security"],
    coverage: "partial",
    owed: false,
    note: "治理面（切片邊界、platform API 表面）與程式碼面（XSS、eval）兩層。⚠️ **執行期那一層已移除**（C52）—— csp-verify 的證據檔與指紋機制拿掉了，工具本身還在但不在任何 workflow 裡。覆蓋因此從完整降為部分：CSP 政策仍由 policy.ts 定義並有單元測試，但「瀏覽器裡真的是 enforce」沒有任何東西在證明。",
  },
  {
    article: "§11 II ⑧",
    requirement: "定期檢視系統之使用狀況",
    scope: "process",
    gates: [],
    coverage: "none",
    owed: false,
    note: "營運面。屬於上線後的維運流程。",
  },
  {
    article: "§11 II ⑨",
    requirement: "隱碼機制，隱藏個人資料之呈現",
    scope: "frontend",
    gates: [],
    coverage: "none",
    owed: true,
    note: "⚠️ **曾經有閘門，2026-08-16 移除**（C52）：它要求每個新切片宣告 personalData、而宣告的欄位在 .vue 裡必須包 maskXxx()，那是加一個切片時最重的那一項摩擦。`platform/pii` 的遮罩函式仍在、`OrderList.vue` 也仍然呼叫 —— **遮罩還在，只是沒有機制強制**，新加的欄位不會有任何東西說話。這一格重新變紅是刻意的：拿掉閘門而讓表繼續顯示「已覆蓋」，比沒有閘門更糟。",
  },
  {
    article: "§12 III",
    requirement: "設定人員接觸個資之權限，並定期檢視其適當性及必要性",
    scope: "process",
    gates: ["conformance"],
    coverage: "partial",
    owed: true,
    note: "⚠️ **這一列是「有閘門、閘門也會紅、法條仍然沒被滿足」的樣本。** conformance 守的是「CODEOWNERS 有條目」，法條要的是權限設定與定期檢視。而「有條目」距離「有生效」有**三層**（2026-08-16 查證，C63／HANDOFF #25）：① 分支保護的 require_code_owner_reviews 沒開（實測 404 Branch not protected）；② owner 全是 @org/* 佔位符，GitHub 判 Unknown owner（HANDOFF #15）；③ 同一列多個 owner 是**任一核准即可**，所以那 12 條「資安共同把關」在原生行為下不強制資安。⚠️ 做完 #15 只拆掉第 ② 層 —— 三層都在，本機一層都看不出來。",
  },
  {
    article: "§15",
    requirement: "訂定安全稽核機制，定期檢查執行狀況並製作評估報告",
    scope: "process",
    gates: ["compliance"],
    coverage: "partial",
    owed: true,
    note: "本表是那份「評估報告」機器可推導的那一半。人要做的另一半（每 12 個月看一次並簽名）還沒有任何機制承接。",
  },
  {
    article: "§16",
    requirement: "個資處理紀錄、機器軌跡資料、安全維護計畫執行證據，保存五年",
    scope: "process",
    gates: ["evidence-manifest"],
    coverage: "partial",
    owed: false,
    note: "條文要保存的有**三類**，而前兩類（個資的蒐集處理利用紀錄、自動化機器設備的軌跡資料）在資料庫、後端與基礎設施 —— 前端連摸都摸不到。只有第三類有交集，而交集的形狀是**產出物**不是政策。⚠️ 這一格原本寫著「腳手架欠一份保存期政策」，查完條文之後那句話是錯的 —— 誰歸檔、存哪、銷毀排程是組織文件。與 §11 II ⑦ 那次高估是同一個毛病的鏡像：一個把覆蓋說得太好，一個把責任攬得太多，而第二種還會讓人去做不該腳手架做的事。7 份證據進版控（git 歷史即保存），**唯一到不了五年的是 sbom.cdx.json** —— GitHub 的 artifact 上限 90 天，那是結構限制，兩條出路都是組織的決定。",
  },
  {
    article: "§18",
    requirement: "資本額達一千萬元或個資達五千筆者，每十二個月至少實施及檢討改善一次",
    scope: "process",
    gates: ["compliance"],
    coverage: "partial",
    owed: true,
    note: "⚠️ 門檻極低，中型 B2C 幾乎必然落入。目前沒有任何閘門帶 12 個月的 cadence。⚠️ exit-drill 的 120 天**刻意不列在這裡** —— 它檢討的是「退不退得回上游」，不是「安全維護計畫」。兩者都是每季，但掛上去會讓這條看起來已經有人在做。",
  },
  {
    article: "§8 II",
    requirement: "危及正常營運或大量當事人權益之事故，七十二小時內通報",
    scope: "process",
    gates: [],
    coverage: "none",
    owed: false,
    note: "流程，不是程式碼。屬於 HANDOFF 交給組織的部分。",
  },
];

/**
 * 尚未適用，但已經知道要什麼 —— 這就是 Q3 說的「按 A 蓋、按 B 留介面」的介面。
 *
 * 兩個觸發條件任一成立就要接上：公司上市櫃，或個資法 §20-1 施行且公司
 * 同時是「非中小企業（資本額逾一億**且**員工逾二百人）且個資達一萬筆」。
 *
 * ⚠️ 這三件事**現行法規並未要求**。原始需求裡的「必須承受得住源碼掃描與
 * 弱點掃描」，法源在這裡而不在現行辦法裡 —— 記下來是為了避免下一次有人
 * 把它當成既有義務再論證一次。
 *
 * ── ⚠️ 但這張表的取數來源本身可能不完整（2026-08-16 發現）──────────────
 *
 * 上面那句「現行法規並未要求」是對的，而且**仍然是對的** —— 但它只回答了
 * 「法規要不要」，沒有回答「**契約要不要**」。
 *
 * 這份腳手架的實際使用情境是**政府採購接案**（見 HANDOFF 開頭的重評），
 * 而那一側的資安要求主要來自**資通安全管理法體系 ＋ 逐案契約條款**，
 * 兩者在這張表上一次都沒有出現。實際確認的結果是：**源碼掃描、弱點掃描／
 * 滲透測試、原始碼交付，在手上的標案裡都是寫死的交付物。**
 *
 * 也就是說 `FUTURE` 的前兩項對這家公司**已經是現在式**，而它們住在一個
 * 叫 `FUTURE` 的常數裡。這正是本檔開頭警告的那種「假的一列」——
 * 差別只在假的不是覆蓋率，是**時態**。
 *
 * 刻意先只留這段註記而不搬進 `CONTROLS`：搬進去要為每一條決定 gates／
 * coverage／owed，而正確的值是**逐案**的（受託者義務從委託機關繼承）——
 * 隨手填一組固定值，就會製造這張表最該擋下的那種假象。
 * 待辦與判斷所需的事實記在 HANDOFF 第 21／22 項。
 */
export const FUTURE: readonly { readonly item: string; readonly source: string }[] = [
  {
    item: "上線前源碼檢測（SAST）—— 目前完全沒有，Trivy 只掃相依不掃自己的程式碼",
    source: "證交所《上市上櫃公司資通安全管控指引》第 18 條；安維辦法草案大型非公務機關強化義務",
  },
  {
    item: "定期弱點掃描（應用層 DAST）—— 目前只有相依層",
    source: "同上",
  },
  {
    item: "滲透測試 —— 目前沒有，且不是腳手架能自帶的",
    source: "同上",
  },
  {
    item: "非法行為監控與日誌保存至少六個月",
    source: "安維辦法草案大型非公務機關強化義務",
  },
  {
    item: "年度風險評估、年度內部稽核、指定個資保護專責人員與獨立查核人員",
    source: "安維辦法草案大型非公務機關強化義務（組織面，非腳手架範圍）",
  },
];
