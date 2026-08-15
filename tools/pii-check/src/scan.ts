import { basename } from "node:path";

import { scanText, type Finding } from "./detect.ts";

/**
 * 掃哪些檔案，以及「掃到零個」為什麼不算通過。
 *
 * ── 名單是宣告的，不是 glob 出來的 ──────────────────────────────────
 *
 * 一個把整個 repo 掃一遍的檢查，會在有人加一個 `.piiignore` 的那天失效，
 * 而且沒有人會發現。這裡改成反過來：**明列哪幾類檔案算「測試環境」**，
 * 每一類都寫理由。要縮小範圍就得動這個檔，於是它會出現在 code review。
 */
export interface ScanRule {
  readonly what: string;
  readonly why: string;
  readonly matches: (path: string) => boolean;
}

export const SCAN_RULES: readonly ScanRule[] = [
  {
    what: "所有 tests/ 目錄",
    why: "§11 II ⑥ 的字面對象。測試資料是最常見的『從正式環境撈一份下來』的落點。",
    matches: (path) => path.includes("/tests/"),
  },
  {
    what: "檔名含 fixture 的檔案",
    why: "fixture 就是測試資料的別名，放在哪個目錄都一樣。",
    matches: (path) => basename(path).toLowerCase().includes("fixture"),
  },
  {
    what: "platform/bff-mock 的示範資料",
    why: "跑起來看得到的那份資料。它不在 tests/ 底下，但它就是測試環境的資料 —— C39 補 DEMO_ORDERS 時走的正是這條路。",
    matches: (path) => path.startsWith("platform/bff-mock/"),
  },
  {
    what: "切片與應用的 i18n 訊息",
    why: "翻譯檔是另一個沒人會想到要看的落點：示範用的句子裡塞一個真的客戶名字與電話，不會有任何工具說話。",
    matches: (path) => path.includes("/locales/") || basename(path).startsWith("i18n."),
  },
];

/**
 * 掃到的檔案數下限。**這一行是這支工具最重要的一行。**
 *
 * 沒有它，任何讓檔案列舉壞掉的改動（換一個 glob、多一層目錄、
 * 誰在 CI 上先跑了 clean）都會表現成「零個發現 ＝ 通過」。
 * 這是 C33 的 Trivy 掃 0 個套件、C34 只解第一份 YAML 的同一個形狀。
 *
 * 數字取得比現況低一截：它防的是「掉到零」，不是「少了兩個」——
 * 訂得太貼近現況，每次刪一支測試都要來改這裡，然後有人會把它改成 0。
 */
export const MINIMUM_SCANNED = 12;

/**
 * 例外：已經人工看過、確認不是真個資的檔案。
 *
 * **必須是完整路徑，不接受 glob。** 寫成 `tools/pii-check/tests/*` 的話，
 * 之後任何一份塞進那個目錄的假資料都會自動隱形 —— 而例外清單的用途是
 * 記錄「這一份看過了」，不是「這個目錄不用看」。
 * 這與 `supply-chain` 的 HEALTH_ACKNOWLEDGEMENTS 是同一條規矩。
 */
export const EXEMPT: Readonly<Record<string, string>> = {
  "tools/pii-check/tests/detect.test.ts":
    "反向測試的對照組。裡面的身分證字號與卡號是為了證明偵測器真的會叫而刻意構造的 —— 少了它們，這支工具會在什麼都偵測不到的情況下全綠。",
};

export interface FileFinding extends Finding {
  readonly file: string;
}

export interface ScanProblem {
  readonly kind: "found" | "too-few-files" | "stale-exemption";
  readonly detail: string;
}

export interface ScanReport {
  readonly scanned: readonly string[];
  readonly findings: readonly FileFinding[];
  readonly problems: readonly ScanProblem[];
}

export function inScope(path: string): boolean {
  return SCAN_RULES.some((rule) => rule.matches(path));
}

/**
 * `files` 是**全 repo 的檔案清單**（呼叫端負責列舉），`read` 讀內容。
 * 兩個都注入，測試才驗得到「列舉壞掉時會怎樣」——
 * 那正是這支工具最需要被驗的失敗模式。
 */
export function scanRepo(files: readonly string[], read: (path: string) => string): ScanReport {
  const scanned = files.filter(inScope);
  const findings: FileFinding[] = [];
  const problems: ScanProblem[] = [];
  const exemptHits = new Map<string, number>();

  for (const file of scanned) {
    const hits = scanText(read(file));
    if (EXEMPT[file] !== undefined) {
      exemptHits.set(file, hits.length);
      continue;
    }
    for (const hit of hits) findings.push({ ...hit, file });
  }

  if (scanned.length < MINIMUM_SCANNED) {
    problems.push({
      kind: "too-few-files",
      detail:
        `只掃到 ${scanned.length} 個檔案，少於下限 ${MINIMUM_SCANNED} —— ` +
        "這比「掃到違規」更嚴重：它代表檔案列舉壞了，而零個發現不是通過。",
    });
  }

  for (const [file, reason] of Object.entries(EXEMPT)) {
    if (!scanned.includes(file)) {
      problems.push({
        kind: "stale-exemption",
        detail: `例外指向一個不在掃描範圍內的檔案：${file}（理由：${reason}）`,
      });
      continue;
    }
    // 一個「已經人工看過」的例外，如果現在什麼都偵測不到，代表兩件事之一：
    // 檔案改乾淨了（該把例外拿掉），或偵測器壞了（更嚴重）。兩種都要講。
    if ((exemptHits.get(file) ?? 0) === 0) {
      problems.push({
        kind: "stale-exemption",
        detail:
          `例外 ${file} 現在一個都偵測不到 —— 檔案改乾淨了（請刪掉這條例外），` +
          "或偵測器壞了（那更嚴重，因為其他檔案也不會被偵測到）。",
      });
    }
  }

  for (const finding of findings) {
    problems.push({
      kind: "found",
      detail: `${finding.file}:${finding.line} [${finding.kind}] ${finding.value} —— ${finding.why}`,
    });
  }

  return { scanned, findings, problems };
}
