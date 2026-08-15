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
    what: "切片契約、分層邊界、設計系統採用、擁有權（D4／D9／D12／D14／D15）",
    command: "node tools/conformance/src/cli.ts",
    evidence: null,
    negativeTest: "tools/conformance/tests/negative.test.ts",
    note: "17 條反向測試，破壞的是複製到暫存目錄的副本，repo 原始碼不被動到。",
  },
  {
    id: "bff-check",
    kind: "gate",
    what: "D8 同源中間層的 15 條行為契約（cookie 屬性、CSRF、401／403）",
    command: "./node_modules/.bin/vitest run --root tools/bff-check",
    evidence: null,
    negativeTest: "tools/bff-check/tests/negative.test.ts",
    note: "9 條反向測試，用改寫回應的 proxy 破壞行為而非程式碼，實作改寫法也不會失效。",
  },
  {
    id: "api-surface",
    kind: "gate",
    what: "platform/ 公開 API 表面的破壞性變更（D12）",
    command: "node tools/api-surface/src/cli.ts",
    evidence: "tools/api-surface/surface.json",
    negativeTest: null,
    note: "四道閘門裡唯一連零件測試都沒有的。基準線進版控，但沒有東西證明過比對會紅。",
  },
  {
    id: "supply-chain",
    kind: "gate",
    what: "相依盤點、原生家族分類、tarball digest 與 lockfile 綁定（R2–R5／R8）",
    command: "node tools/supply-chain/src/cli.ts",
    evidence: "tools/supply-chain/provenance.json",
    negativeTest: null,
    note: "46 條零件測試（parseLockfile／buildInventory），但沒有一條測「把 provenance 弄髒之後 CLI 會不會 exit 1」。",
  },
  {
    id: "exit-drill",
    kind: "gate",
    what: "D2 退出面靜態檢查、plugin 帳目、演練證據新鮮度（120 天）",
    command: "node tools/exit-drill/src/cli.ts",
    evidence: "tools/exit-drill/evidence.json",
    negativeTest: null,
    note: "39 條零件測試。證據新鮮度守衛的模式是對的，但守衛自己沒被證明過會紅。",
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
    id: "trivy-sca",
    kind: "gate",
    what: "相依套件的 HIGH／CRITICAL 漏洞，PR ＋ 每日 21:00 UTC 排程",
    command: "aquasecurity/trivy-action（.github/workflows/tier2-security.yml）",
    evidence: null,
    negativeTest: null,
    note: "唯一直接對得上 §11 II ③ 的閘門，而且有兩個已知失明模式（C33 dev 相依被抑制掃 0 個、C34 只解第一份 YAML 文件），兩者都是綠燈。",
  },
  {
    id: "trivy-sbom",
    kind: "gate",
    what: "CycloneDX SBOM 產出，並比對 component 數與 lockfile 套件數",
    command: "node tools/supply-chain/src/cli.ts --verify-sbom sbom.cdx.json",
    evidence: null,
    negativeTest: null,
    note: "SBOM 上傳為 artifact（保留 90 天），沒有進版控 —— 而 §16 要的是 5 年。",
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
    id: "csp-verify",
    kind: "gate",
    what: "用正式 CSP（enforce）服務正式建置產物，實測 violation",
    command: "node tools/csp-verify/src/cli.ts",
    evidence: null,
    negativeTest: null,
    note: "兩軸都有分卻三樣都缺：零測試、零進版控的產物、不在任何 workflow 裡。結果目前由人抄進 DECISIONS C39。",
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
    gates: ["trivy-sca", "trivy-sbom", "supply-chain", "dependency-health", "renovate"],
    coverage: "partial",
    owed: true,
    note: "這一條有兩半：**檢測**由 Trivy 做（每日 21:00 UTC 排程 —— 沒有它，三個月沒人動的專案就三個月沒掃過），**因應**由 Renovate 提出（D13 的 critical 3 天／high 14 天 SLA 要有人真的去升，才是 SLA）。⚠️ 仍只涵蓋**相依套件**：自己寫的程式碼沒有 SAST，而 eslint 的安全規則不是漏洞掃描器。",
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
    gates: [],
    coverage: "none",
    owed: true,
    note: "現行有效、前端做得到、而一條檢查都沒有。bff-mock 用的是 DEMO_ORDERS／DEMO_SHIPMENTS，方向對，但沒有規則擋住有人塞真資料進 fixture。",
  },
  {
    article: "§11 II ⑦",
    requirement: "確保系統變更之安全性",
    scope: "frontend",
    gates: ["conformance", "api-surface", "eslint-security", "csp-verify"],
    coverage: "full",
    owed: false,
    note: "治理面（切片邊界、platform API 表面）、程式碼面（XSS、eval）與執行期（CSP enforce 實測）三層。⚠️ 覆蓋是滿的，欠的是**證明** —— 四道裡只有 conformance 證明過會紅。",
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
    note: "現行有效、前端做得到、而一條檢查都沒有。適用的正是 apps/console 這種內部控制台畫面 —— 防的是客服與內部人員看到完整個資，不是防使用者看自己的資料。",
  },
  {
    article: "§12 III",
    requirement: "設定人員接觸個資之權限，並定期檢視其適當性及必要性",
    scope: "process",
    gates: ["conformance"],
    coverage: "partial",
    owed: true,
    note: "⚠️ **這一列是「有閘門、閘門也會紅、法條仍然沒被滿足」的樣本。** conformance 守的是「CODEOWNERS 有條目」，法條要的是權限設定與定期檢視；而目前那 22 條全是 Unknown owner（HANDOFF #15）—— 存在不等於生效，本機看不出來，只有 GitHub 知道。",
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
    requirement: "軌跡資料與安全維護計畫執行證據，保存五年",
    scope: "process",
    gates: [],
    coverage: "none",
    owed: true,
    note: "evidence.json 與 provenance.json 進了版控（git 歷史本身就是保存），但**沒有一份是為 §16 設計的**，也沒有寫下保存期政策。SBOM 目前是 90 天 artifact —— 差 5 年很遠。",
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
