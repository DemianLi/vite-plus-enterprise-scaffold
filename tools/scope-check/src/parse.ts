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

/** 表格第一欄裡的 `` `path` ``。**登記**只認第一格，後面幾欄是給人讀的散文。 */
const FIRST_CELL = /^\|\s*`([^`]+)`\s*\|/;

/**
 * 一整列切成格子：`| a | b | c |` → `["a", "b", "c"]`。
 *
 * ⚠️ **刻意不處理跳脫的 `\|`**，而理由是**失效方向**，不是「今天沒有人這樣寫」。
 * 跳脫只會讓一格被切成兩格，而多出來的那一格要嘛是空的（→ 多紅一條，吵）、
 * 要嘛有字（→ 完全沒影響）。**它產生不出假綠。** 一條會多叫的檢查看得見、
 * 下一個人五秒內就修掉；C92 那次補引號辨識是因為那邊漏掉會**安靜地**取到半截區塊，
 * 兩件事不同，不要照抄結論。
 */
function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

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
  /**
   * 登記了、但第一格**之後**有格子是空的那些路徑。
   *
   * ── 為什麼這一欄要單獨存在 ──────────────────────────────────────────
   *
   * `SCOPE.md` 從 `v1.0.5` 起就寫著「這道閘門保證的是**沒有人可以跳過那一格**」，
   * 而在 C94 之前**那句話是假的**：這裡只捕捉第一格，把某一列的後面幾欄清空，
   * 解析照樣收下、閘門照樣綠。實測過（清空 `doc-facts` 那一列 → `listed` 還是 8 項）。
   *
   * ⚠️ 分清楚兩件事：**「有沒有寫」機器讀得出來，「寫得對不對」讀不出來。**
   * 文件把兩件事包成一句「機器讀不出來」，於是可機械化的那一半也一起沒做。
   * 這一欄只買到前者 —— 填 `x` 就過得了，而那仍然是進步：它讓「跳過」
   * 從**無聲**變成**要動手寫一個字**。
   */
  readonly skipped: string[];
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
  const skipped: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    const match = FIRST_CELL.exec(line);
    if (match?.[1] === undefined) continue;
    listed.push(match[1]);
    // 分隔列（`| --- | --- |`）進不來 —— 它沒有反引號，`FIRST_CELL` 就不匹配。
    if (
      cellsOf(line)
        .slice(1)
        .some((cell) => cell === "")
    )
      skipped.push(match[1]);
  }
  return { parent, listed, skipped };
}
