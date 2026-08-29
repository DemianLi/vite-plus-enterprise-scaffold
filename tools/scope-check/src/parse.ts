/**
 * 從 `SCOPE.md` 讀出「准許存在的」那兩份清單。
 *
 * ── 為什麼只讀表格的第一欄，不 grep 整份文件 ────────────────────────
 *
 * 整份文件裡到處都是 `` `tools/xxx` `` —— 判準那節舉例用了它、散文段落
 * 可以整段在講某一道檢查、〈不涵蓋什麼〉那節提到 `.semgrep/`。
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

/** 根層那一節的鍵。它沒有目錄前綴，所以標題長得跟另外兩節不一樣。 */
export const ROOT = "根層";

/**
 * 某一層在標題裡怎麼被認出來。
 *
 * ⚠️ **這是具名特例，刻意不一般化成「任何 `—— 准許存在的` 標題」。**
 * 這個檔案上面那整段在講**登記的定義為什麼要窄**（「散文裡怎麼提都不算數」）。
 * 一般化錨點會讓同一件事在章節層級重演：**新增一個章節就變成一次無聲的
 * 治理範圍擴大** —— 有人加一節 `## docs/ —— 准許存在的`，這道閘門就開始
 * 管一個沒有人決定過要管的東西，而且是綠的。
 *
 * 每一層的納入都該是**改這個函式**，也就是一次寫得出來、看得見的決定。
 */
function needle(parent: string): string {
  return parent === ROOT ? ROOT : `\`${parent}/\``;
}

export interface Row {
  /** 第一格裡的路徑，原樣。 */
  readonly path: string;
  /** 整列切出來的格子，**含第一格**。 */
  readonly cells: readonly string[];
}

export interface Section {
  /** 這份清單管的是哪一層（`platform` 或根層）。 */
  readonly parent: string;
  /** 表格第一欄登記的路徑，原樣（含 `platform/` 前綴）。 */
  readonly listed: string[];
  /**
   * 每一列的格子原樣。
   *
   * ── 為什麼是原樣的格子，不是一份「哪幾列沒填」的清單（C143）──────────
   *
   * C94 之前這裡只捕捉第一格：`SCOPE.md` 從 `v1.0.5` 起就寫著「這道閘門保證的是
   * **沒有人可以跳過那一格**」，而實測（清空 `doc-facts` 那一列 → `listed` 還是
   * 8 項）證明那句話是假的。C94 補了一份 `skipped`，判準是「第一格之後有空格子」。
   *
   * 那份清單**對每一層都一樣**，而根層從 C143 起不是了：它的第三格是「桶」，
   * 有自己的值域（`check.ts` 的 `BUCKETS`），空與「不是那四個之一」要分給不同
   * 的規則、給不同的 `fix`。判準留在這裡就得在解析層知道有幾層、哪一格特別，
   * 而這個檔案上面那整段講的正是**解析要窄**。
   *
   * ⚠️ 所以這裡只切格子，**「哪幾格算該填的」整個交給 `check.ts`**。
   *
   * ⚠️ 分清楚兩件事：**「有沒有寫」機器讀得出來，「寫得對不對」讀不出來。**
   * 文件把兩件事包成一句「機器讀不出來」，於是可機械化的那一半也一起沒做。
   * 買到的只有前者 —— 填 `x` 就過得了，而那仍然是進步：它讓「跳過」
   * 從**無聲**變成**要動手寫一個字**。
   */
  readonly rows: readonly Row[];
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
    (line) => HEADING.test(line) && line.includes(needle(parent)) && line.includes("准許存在的"),
  );
  if (start === -1) return undefined;

  const listed: string[] = [];
  const rows: Row[] = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    const match = FIRST_CELL.exec(line);
    if (match?.[1] === undefined) continue;
    listed.push(match[1]);
    // 分隔列（`| --- | --- |`）進不來 —— 它沒有反引號，`FIRST_CELL` 就不匹配。
    rows.push({ path: match[1], cells: cellsOf(line) });
  }
  return { parent, listed, rows };
}

/**
 * 這份文件裡所有寫著「准許存在的」的章節標題，原樣。
 *
 * ── 為什麼需要它 ────────────────────────────────────────────────────
 *
 * `needle()` 是具名特例，這擋住了「**新增一個章節 = 無聲的治理範圍擴大**」。
 * 但它同時放進了相反的洞：有人加一節 `## \`docs/\` —— 准許存在的`，
 * 那一節**看起來在治理 `docs/`**、下面列著一張表、而 `GOVERNED` 沒有它，
 * 於是它**完全惰性，而且是綠的**。
 *
 * 那正是 `tools/sast` 那個病的形狀：一個假的東西待在最會被讀的地方，
 * 而全套閘門照樣全綠。所以錨點窄之外還要再驗一次：
 * **每一節「准許存在的」都必須對應到一個真的被檢查的層。**
 */
export function declaredSections(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => HEADING.test(line) && line.includes("准許存在的"))
    .map((line) => line.replace(HEADING, "").trim());
}

/** 這個標題是不是那一層的。給 `check.ts` 反查「這一節有沒有人在檢查」用。 */
export function headingIsFor(heading: string, parent: string): boolean {
  return heading.includes(needle(parent));
}
