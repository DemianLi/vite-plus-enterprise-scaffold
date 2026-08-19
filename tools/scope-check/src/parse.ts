/**
 * 從 `SCOPE.md` 讀出「准許存在的」那兩份清單。
 *
 * ── 為什麼只讀表格的第一欄，不 grep 整份文件 ────────────────────────
 *
 * 整份文件裡到處都是 `` `tools/xxx` `` —— 判準那節舉例用了它、〈刻意在外的〉
 * 那節整段在講 `tools/gate-roster`、〈不涵蓋什麼〉那節提到 `.semgrep/`。
 * 用 grep 抓的話，**被當成反例寫下來的東西會變成被登記的東西**，
 * 而這道閘門就會對著「我們刻意不要的那個」說一切正常。
 *
 * 所以登記的定義很窄：**某一張「准許存在的」表格的第一欄**。散文裡怎麼提
 * 都不算數。這也讓 `SCOPE.md` 的作者知道自己在做什麼 —— 加一列才是登記，
 * 在段落裡順口提一句不是。
 */

/** 表格第一欄裡的 `` `path` ``。整列只認第一格，後面兩欄是給人讀的。 */
const FIRST_CELL = /^\|\s*`([^`]+)`\s*\|/;

/**
 * 章節標題。`SCOPE.md` 用 `## \`tools/\` —— 准許存在的` 這種寫法，
 * 而**「准許存在的」這五個字是這道閘門認得的錨點**，改掉它這裡就找不到。
 * 找不到會紅，不會安靜地當成空清單 —— 見 `check.ts` 裡那條。
 */
const HEADING = /^##\s+/;

export interface Section {
  /** 這份清單管的是哪一層（`tools` 或 `platform`）。 */
  readonly parent: string;
  /** 表格第一欄登記的路徑，原樣（含 `tools/` 前綴）。 */
  readonly listed: string[];
}

/**
 * 讀出 `## \`<parent>/\` —— 准許存在的` 那一節的表格第一欄。
 *
 * 回傳 `undefined` 代表**找不到那一節** —— 與「那一節是空的」是兩件事，
 * 呼叫端要分開處理。
 */
export function sectionFor(source: string, parent: string): Section | undefined {
  const lines = source.split("\n");
  const start = lines.findIndex(
    (line) => HEADING.test(line) && line.includes(`\`${parent}/\``) && line.includes("准許存在的"),
  );
  if (start === -1) return undefined;

  const listed: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    const match = FIRST_CELL.exec(line);
    if (match?.[1] !== undefined) listed.push(match[1]);
  }
  return { parent, listed };
}
