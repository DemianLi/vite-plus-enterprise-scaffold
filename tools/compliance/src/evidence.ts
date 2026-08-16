import { GATES } from "./map.ts";

/**
 * §16 —— 「落實執行安全維護計畫之證據」的清單。
 *
 * ── 先講這支工具**不做**什麼 ────────────────────────────────────────
 *
 * §16 要求業者保存五年的有三類：個資的蒐集處理利用紀錄、自動化機器設備的
 * 軌跡資料、以及落實執行安全維護計畫的證據。
 *
 * **前兩類前端連摸都摸不到** —— 那是資料庫、後端與基礎設施的事。
 * 第三類是唯一有交集的，而交集的形狀是**產出物**，不是政策。
 *
 * 所以這裡不訂保存期政策。誰歸檔、存哪、銷毀排程、負責人 —— 那是組織文件，
 * 要 IT 與法遵去訂，寫進 repo 只會變成一份沒有人執行的樣板。
 *
 * ⚠️ 對照表原本把 §16 寫成「腳手架欠一份保存期政策」。查完條文之後那句話
 * 是錯的 —— 那是把責任攬得比實際多。與 §11 II ⑦ 那次高估是同一個毛病的
 * 鏡像：一個把覆蓋說得太好，一個把責任說得太大，而第二種還會讓人去做
 * 不該腳手架做的事。
 *
 * ── 這支工具做的是：把清單推導出來，讓組織接得住 ────────────────────
 *
 * 交接時需要的是一句「這幾個檔案就是你們要放進保存排程的東西」。
 * 手寫那份清單的話，它會在下一個工具加進來的時候過期 —— 這個 repo 在
 * 「人抄下來的東西沒有人再推導一次」上一再栽跟頭（列舉見 tools/doc-facts）。
 */

export type Retention =
  /** 進版控。git 歷史本身就是保存機制 —— 只要 repo 活著就超過五年。 */
  | "version-control"
  /** CI artifact。GitHub 上限 90 天（公開 repo），**結構上到不了五年**。 */
  | "ci-artifact";

export interface EvidenceFile {
  readonly path: string;
  /** 這份東西證明了什麼。交接時對方要看的就是這一欄。 */
  readonly proves: string;
  readonly retention: Retention;
  /**
   * 哪一道閘門在維護它。**沒有閘門在比對的檔案，是一份沒有人在維護的檔案** ——
   * 它會在第三次相依變動之後靜靜地與現實脫節，而交接清單上還掛著它。
   *
   * ⚠️ 這個欄位是被自己的檢查逼出來的：`Gate.evidence` 是單一字串，
   * 而 `supply-chain` 實際上維護**兩份**基線（`inventory.json` 與
   * `provenance.json`）。對照表只記得住其中一份 —— 也就是說它**低估**了
   * 自己有的證據。改型別會波及 render／verify／測試，記在這裡是等價的，
   * 而且把「哪道閘門守它」寫得比原本更清楚。
   */
  readonly maintainedBy: string;
}

/**
 * 進版控的那幾份。順序照「拿給誰看」排：供應鏈 → 退出 → 執行期 → 治理。
 *
 * `renovate.json` 刻意不在這裡：它是**設定**不是證據 ——
 * 它說明我們打算怎麼因應，不記錄我們因應了什麼。
 */
export const RETENTION_EVIDENCE: readonly EvidenceFile[] = [
  {
    path: "tools/supply-chain/inventory.json",
    maintainedBy: "supply-chain",
    proves: "建置環境裡有哪些套件、哪些是原生二進位、分屬哪些家族（§11 II ③）",
    retention: "version-control",
  },
  {
    path: "tools/supply-chain/provenance.json",
    maintainedBy: "supply-chain",
    proves: "每個原生二進位的 tarball digest 與來源證明，且與 lockfile 綁定（§11 II ③）",
    retention: "version-control",
  },
  {
    path: "tools/supply-chain/dependency-health.json",
    maintainedBy: "dependency-health",
    proves: "外部直接相依的維護狀態與授權，含已寫下理由的例外（§11 II ③）",
    retention: "version-control",
  },
  {
    path: "tools/exit-drill/evidence.json",
    maintainedBy: "exit-drill",
    proves: "退出演練的日期、耗時與測試成績（D2／R1 的保單兌現紀錄）",
    retention: "version-control",
  },
  {
    path: "tools/api-surface/surface.json",
    maintainedBy: "api-surface",
    proves: "platform 公開 API 表面的基線 —— 系統變更安全性的治理面（§11 II ⑦）",
    retention: "version-control",
  },
  {
    path: "tools/compliance/COMPLIANCE.md",
    maintainedBy: "compliance",
    proves: "條號 ↔ 閘門 ↔ 證據的對照表本身（§15 稽核機制的輸入）",
    retention: "version-control",
  },
  {
    path: "sbom.cdx.json",
    maintainedBy: "trivy-sbom",
    proves: "CycloneDX 軟體物料清單（採購與資安要的那一份）",
    // ⚠️ 這一列是整份清單裡唯一的問題，而且**腳手架修不了**：
    // GitHub 的 artifact 保留上限是 90 天（公開 repo），連 400 天（私有）
    // 都到不了五年。要滿足 §16 只有兩條路，兩條都是組織的決定：
    // 進版控，或是由組織的保存系統定期取走。
    retention: "ci-artifact",
  },
];

export interface EvidenceProblem {
  readonly kind: "missing-file" | "gate-evidence-not-listed" | "listed-but-no-gate";
  readonly detail: string;
}

/**
 * 清單與現實一致嗎。
 *
 * 兩個方向都驗，理由與 `verifyMap` 相同：
 *
 *   宣告了但檔案不在 → 交接清單指向空氣（**危險**：對方以為有東西可歸檔）
 *   閘門有證據檔但清單沒收 → 清單漏了一份，而沒有人會發現
 *
 * `exists` 注入，測試才驗得到「檔案不見時會怎樣」。
 */
export function verifyEvidence(
  files: readonly EvidenceFile[],
  exists: (path: string) => boolean,
): readonly EvidenceProblem[] {
  const problems: EvidenceProblem[] = [];
  const listed = new Set(files.map((file) => file.path));

  for (const file of files) {
    // CI artifact 本來就不在工作目錄裡，不能拿「檔案不存在」判它。
    if (file.retention === "ci-artifact") continue;
    if (exists(file.path)) continue;
    problems.push({
      kind: "missing-file",
      detail: `清單列了 ${file.path}，但它不存在 —— 交接清單指向空氣。`,
    });
  }

  for (const gate of GATES) {
    // renovate.json 是設定不是證據，見 RETENTION_EVIDENCE 的說明。
    if (gate.evidence === null || gate.evidence === "renovate.json") continue;
    if (listed.has(gate.evidence)) continue;
    problems.push({
      kind: "gate-evidence-not-listed",
      detail:
        `閘門 ${gate.id} 的證據檔 ${gate.evidence} 沒有列進 §16 清單。\n` +
        "      新工具加進來時最容易漏的就是這一步 —— 而漏掉的那份不會有人發現。",
    });
  }

  const gateIds = new Set(GATES.map((gate) => gate.id));
  for (const file of files) {
    if (gateIds.has(file.maintainedBy)) continue;
    problems.push({
      kind: "listed-but-no-gate",
      detail:
        `清單說 ${file.path} 由閘門 ${file.maintainedBy} 維護，但沒有這道閘門。\n` +
        "      沒有閘門在比對的檔案，是一份沒有人在維護的檔案 —— " +
        "它會靜靜地與現實脫節，而交接清單上還掛著它。",
    });
  }

  return problems;
}

/** 交接用的表格。Markdown，直接貼進 HANDOFF 或寄給法遵。 */
export function renderEvidenceManifest(files: readonly EvidenceFile[]): string {
  const lines = [
    "| 檔案 | 證明什麼 | 保存機制 |",
    "| --- | --- | --- |",
    ...files.map(
      (file) =>
        `| \`${file.path}\` | ${file.proves} | ` +
        `${file.retention === "version-control" ? "版控（git 歷史）" : "**CI artifact（90 天）⚠️**"} |`,
    ),
  ];
  return lines.join("\n");
}
