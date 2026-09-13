export interface Rule {
  readonly label: string;
  /** 一支檔裡命中幾處。 */
  readonly count: (content: string) => number;
}

export interface ScannedFile {
  readonly path: string;
  readonly content: string;
}

export interface RuleResult {
  readonly label: string;
  readonly hits: number;
  readonly files: readonly string[];
}

export interface ScanResult {
  readonly scanned: number;
  readonly total: number;
  readonly rules: readonly RuleResult[];
  /** 每支檔命中幾處，多的排前面。 */
  readonly byFile: readonly (readonly [string, number])[];
}

function literal(pattern: RegExp): (content: string) => number {
  return (content) => [...content.matchAll(pattern)].length;
}

const WORD_CHAR = /\w/;

/**
 * 從樹上推出來的詞（工具名、文件名）逐字比，不拼成正則：拼出來的正則正是 Tier 2
 * `security/detect-non-literal-regexp` 擋的形狀。前後要是非英數字元才算（等同 `\b`）；
 * 同一個位置有好幾個詞命中（`DECISIONS` 與 `DECISIONS-2`）只算一處。
 */
function words(label: string, list: readonly string[]): (content: string) => number {
  if (list.length === 0) {
    // 空詞表掃出零處，與「乾淨」長得一樣 —— 那是推導它的來源讀不到東西，不是樹上沒有痕跡。
    throw new Error(`痕跡詞表「${label}」是空的 —— 推導它的來源讀不到東西`);
  }
  return (content) => {
    const longest = new Map<number, number>();
    for (const word of list) {
      for (let at = content.indexOf(word); at !== -1; at = content.indexOf(word, at + 1)) {
        const before = content[at - 1] ?? "";
        const after = content[at + word.length] ?? "";
        if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) continue;
        longest.set(at, Math.max(longest.get(at) ?? 0, word.length));
      }
    }
    let count = 0;
    let end = -1;
    for (const [at, length] of [...longest].sort((a, b) => a[0] - b[0])) {
      if (at < end) continue;
      count++;
      end = at + length;
    }
    return count;
  };
}

/**
 * 內部文件名連裸寫一起抓：匯出那棵樹上寫 `HANDOFF` 的有 12 處，帶 `.md` 的只有 1 處（C248 §三）。
 * ⚠️ 例外是一般詞 —— `API` 裸寫的 8 處全是業務用法（「API key」「API 表面」），要帶 `.md` 才算。
 * 加一個名字進來要附同樣的量測。
 */
export const AMBIGUOUS_DOC_STEMS: ReadonlySet<string> = new Set(["API"]);

function docWords(docNames: readonly string[]): string[] {
  return docNames.map((name) => {
    const stem = name.replace(/\.md$/, "");
    return AMBIGUOUS_DOC_STEMS.has(stem) ? name : stem;
  });
}

/**
 * C231 §三 那張詞表，加上 Q111 收進來的題號。
 *
 * 工具名與內部文件名**從樹上推**，不手列：`toolNames` 是 `tools/*` 的目錄名，
 * `docNames` 是根層不出門的 `.md`。手列的話，下一支新工具的名字會安靜地不在表上。
 */
export function traceRules(input: {
  readonly toolNames: readonly string[];
  readonly docNames: readonly string[];
}): Rule[] {
  return [
    { label: "裁決編號 C／D／R ＋ 數字", count: literal(/\b[CDR]\d+\b/g) },
    { label: "題號 Q ＋ 數字", count: literal(/\bQ\d+\b/g) },
    { label: "工具名（tools/ 的目錄名）", count: words("工具名", input.toolNames) },
    { label: "閘門", count: literal(/閘門/g) },
    { label: "vitest／cucumber／coverage", count: literal(/vitest|cucumber|coverage/gi) },
    { label: "tools/", count: literal(/\btools\//g) },
    { label: "內部文件名", count: words("內部文件名", docWords(input.docNames)) },
    { label: "Tier 1／Tier 2", count: literal(/\bTier\s*[12]\b/gi) },
    { label: "stryker／突變／變異／mutation", count: literal(/stryker|突變|變異|mutation/gi) },
    { label: "vpr", count: literal(/\bvpr\b/g) },
    { label: "腳手架／scaffold", count: literal(/腳手架|scaffold/gi) },
  ];
}

export function scan(files: readonly ScannedFile[], rules: readonly Rule[]): ScanResult {
  // 零支檔掃出零處，與「乾淨」長得一模一樣（C185 的恆綠就是這個形狀）。
  if (files.length === 0) throw new Error("痕跡掃描拿到零支檔 —— 那不是乾淨，是沒有掃");

  const perFile = new Map<string, number>();
  const results = rules.map((rule) => {
    let hits = 0;
    const matched: string[] = [];
    for (const file of files) {
      const count = rule.count(file.content);
      if (count === 0) continue;
      hits += count;
      matched.push(file.path);
      perFile.set(file.path, (perFile.get(file.path) ?? 0) + count);
    }
    return { label: rule.label, hits, files: matched };
  });

  return {
    scanned: files.length,
    total: results.reduce((sum, rule) => sum + rule.hits, 0),
    rules: results,
    byFile: [...perFile].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

export function formatScan(result: ScanResult): string {
  const width = Math.max(...result.rules.map((rule) => rule.label.length));
  const lines = [
    `痕跡掃描：${result.scanned} 支檔，命中 ${result.total} 處、${result.byFile.length} 支檔`,
    "",
  ];
  for (const rule of result.rules) {
    lines.push(
      `  ${rule.label.padEnd(width)}  ${String(rule.hits).padStart(4)} 處  ${String(rule.files.length).padStart(3)} 檔`,
    );
  }
  if (result.byFile.length > 0) {
    lines.push("", "  逐檔：");
    for (const [path, count] of result.byFile)
      lines.push(`    ${String(count).padStart(4)}  ${path}`);
  }
  return lines.join("\n");
}

/**
 * 掃描的判定。**今天預設只報數**（C231 §六 ①：掃描今天必紅）；`--fail-on-trace` 是 ④ 接線時
 * 要走的那條，任一命中就不留產物。兩條路都由測試走過，免得接線那天才發現只有報數被跑過。
 */
export function verdict(
  result: ScanResult,
  failOnTrace: boolean,
): { readonly ok: boolean; readonly message: string } {
  if (result.total === 0) return { ok: true, message: "✓ 痕跡掃描零命中" };
  if (failOnTrace)
    return { ok: false, message: `✗ 痕跡掃描命中 ${result.total} 處 —— 匯出失敗，產物已刪除` };
  return {
    ok: true,
    message: `⚠️ 痕跡掃描命中 ${result.total} 處（只報數，C231 ② ③ 清完後由 ④ 改成判定）`,
  };
}
