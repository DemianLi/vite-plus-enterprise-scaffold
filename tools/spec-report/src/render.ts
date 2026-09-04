import type { ResolvedInstance, SpecStatus } from "./match.ts";

/**
 * 兩份輸出，**而它們是對照關係，不是同一份資料的兩種格式**。
 *
 * |            | CLI 輸出         | 報表檔                     |
 * | ---------- | ---------------- | -------------------------- |
 * | 回答       | **現在怎麼辦**   | **做到哪了**               |
 * | 讀者       | 寫程式的人、agent| 專案經理、驗收方、週報     |
 * | 內容       | 只有需要行動的   | 每一個場景實例的完整台帳   |
 * | 壽命       | 這一次執行       | 進版控，可比較兩次的差異   |
 *
 * 對照鍵 `<切片>/<功能>#<場景>[<例子>]` 是把兩者接起來的東西。
 * **CLI 是報表檔的過濾視圖，不是另一份資料。**
 */

const MARK: Record<SpecStatus, string> = {
  完成: "✅",
  擋下: "🔴",
  待辦: "⚠️",
  未執行: "❓",
};

export interface Tally {
  readonly 完成: number;
  readonly 擋下: number;
  readonly 待辦: number;
  readonly 未執行: number;
  readonly total: number;
}

export function tally(resolved: readonly ResolvedInstance[]): Tally {
  const count = (status: SpecStatus): number =>
    resolved.filter((item) => item.status === status).length;

  return {
    完成: count("完成"),
    擋下: count("擋下"),
    待辦: count("待辦"),
    未執行: count("未執行"),
    total: resolved.length,
  };
}

function rate(t: Tally): string {
  if (t.total === 0) return "—";
  return `${((t.完成 / t.total) * 100).toFixed(1)}%`;
}

function bySlice(resolved: readonly ResolvedInstance[]): Map<string, ResolvedInstance[]> {
  const groups = new Map<string, ResolvedInstance[]>();
  for (const item of resolved) {
    const list = groups.get(item.instance.slice) ?? [];
    list.push(item);
    groups.set(item.instance.slice, list);
  }
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * CLI 輸出 —— **刻意不完整**。全部列出來就沒有人看了。
 *
 * ⚠️ 待辦那一段只印鍵、不印細節：它們的細節在規格裡，而規格是人寫的，
 * 人本來就知道。印出來只會讓紅燈被淹掉。
 */
export function renderCli(resolved: readonly ResolvedInstance[], reportPath: string): string {
  if (resolved.length === 0) {
    return [
      "沒有找到任何**版控中的**驗收規格。",
      "",
      "  ⚠️ 剛用 `vp create slice` 產生切片的話 —— **先 `git add`**。",
      "     事實來源是 `git ls-files`（C73／C98 裁決過，讀磁碟會讓本機綠、CI 紅），",
      "     所以還沒進 index 的規格檔在這裡是看不見的。",
      "",
      "  既有的兩個切片刻意沒有規格（見 DECISIONS.md 的 C114 §六）——",
      "  那一種「沒有」不是錯誤。",
      "",
    ].join("\n");
  }

  const lines: string[] = [];

  for (const [slice, items] of bySlice(resolved)) {
    const t = tally(items);
    lines.push(`${slice}`, "");

    for (const status of ["未執行", "擋下"] as const) {
      const hit = items.filter((item) => item.status === status);
      if (hit.length === 0) continue;

      const why =
        status === "未執行"
          ? "規格解析得出來，但結果裡找不到它跑過 —— 接線斷了"
          : "有定義、該做了，但沒綠";
      lines.push(`  ${MARK[status]} ${status} ${hit.length} —— ${why}`);
      for (const item of hit) {
        const detail = item.failedSteps.length > 0 ? `  ← ${item.failedSteps[0]}` : "";
        lines.push(`     ${item.instance.key}${detail}`);
      }
      lines.push("");
    }

    const todo = items.filter((item) => item.status === "待辦");
    if (todo.length > 0) {
      lines.push(`  ${MARK.待辦} 待辦 ${todo.length} —— 有定義、還沒做（不擋）`);
      for (const item of todo) lines.push(`     ${item.instance.key}`);
      lines.push("");
    }

    lines.push(`  完成率 ${t.完成}/${t.total}（${rate(t)}）`, "");
  }

  lines.push(`報表：${reportPath}`, "");
  return lines.join("\n");
}

/**
 * 報表檔 —— **唯一完整來源**，進版控。
 *
 * ⚠️ **不寫時間戳。** 有了它，這份檔案每一天都與重新產生的內容不同，
 * `--check` 就永遠是紅的，於是沒有任何閘門守得住它是不是最新的 ——
 * 而一份沒有人在守、又進了版控的產出物，正是這個 repo 一再栽跟頭的東西。
 * 「什麼時候跑的」由 git 記著，那份紀錄比檔案裡的一行字可靠。
 *
 * ⚠️ **不寫失敗原因。** 原因會變（今天是斷言失敗、明天是拋錯），寫進一份會被
 * 貼進工單的文件裡，就是在製造一批會過期的句子。原因只在 CLI，
 * 因為 CLI 的壽命只有這一次執行。
 */
export function renderReport(resolved: readonly ResolvedInstance[]): string {
  const lines: string[] = [
    "# 業務功能完成率",
    "",
    "由 `tools/spec-report` 產生，**不要手改**。重新生成：",
    "",
    "```bash",
    "vp run -r test -- --reporter=default --reporter=json --outputFile=.vitest-results.json",
    "node tools/spec-report/src/cli.ts",
    "```",
    "",
    "完成率 ＝ **驗收規格的通過率**，不是覆蓋率。分母是場景的執行實例數：",
    "一個「場景:」算 1，一個「場景大綱:」按「例子:」的每一列各算 1。",
    "",
  ];

  if (resolved.length === 0) {
    lines.push(
      "目前沒有任何**版控中的**切片帶著驗收規格。",
      "",
      "既有切片刻意沒有規格（見 `DECISIONS.md` 的 C114 §六）；",
      "新切片由 `vp create slice` 產生時會自帶一份範本 —— ⚠️ 記得 `git add`，",
      "事實來源是 `git ls-files`，還沒進 index 的規格檔在這裡看不見。",
      "",
    );
    return lines.join("\n");
  }

  const groups = bySlice(resolved);

  lines.push(
    "| 切片 | 完成 | 待辦 | 擋下 | 未執行 | 完成率 |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const [slice, items] of groups) {
    const t = tally(items);
    lines.push(`| ${slice} | ${t.完成} | ${t.待辦} | ${t.擋下} | ${t.未執行} | ${rate(t)} |`);
  }

  // ⚠️ 合計只報**絕對數**，不報跨切片的百分比。一個切片的場景多，不代表它比較
  // 重要 —— 加總出來的百分比會讓小切片的完成被大切片稀釋，而那個數字看起來
  // 和切片層級的一樣可信。
  const all = tally(resolved);
  lines.push(
    `| **合計** | **${all.完成}** | **${all.待辦}** | **${all.擋下}** | **${all.未執行}** | — |`,
    "",
    "⚠️ 合計刻意不給百分比：跨切片加總會讓小切片的完成被大切片稀釋。",
    "",
  );

  for (const [slice, items] of groups) {
    const features = new Map<string, ResolvedInstance[]>();
    for (const item of items) {
      const list = features.get(item.instance.feature) ?? [];
      list.push(item);
      features.set(item.instance.feature, list);
    }

    for (const [feature, list] of features) {
      lines.push(`## ${slice} / ${feature}`, "", "| 場景實例 | 狀態 |", "| --- | --- |");
      for (const item of list) {
        const { scenario, example } = item.instance;
        const label = example === null ? scenario : `${scenario}[${example}]`;
        lines.push(`| ${label} | ${MARK[item.status]} ${item.status} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * 兩份報表的**內容**是不是同一份 —— 表格的 padding 不算差異。
 *
 * ⚠️ 這不是潔癖，是兩道閘門的互斥，而且**沒有它 `vpr ready` 兩個方向都紅**：
 * `vp check`（oxfmt，第 1 步）會把這份產出物的表格補上對齊用的空白，而這支
 * 工具產的是不帶 padding 的表格。逐位元組比的話 —— 排版過就說「報表過期」、
 * 重新產生就說「沒排版」，繞不出去。
 *
 * ⚠️ **它一直都在，只是沒有東西可以 padding。** 報表在第一個帶規格的切片
 * 進版控之前只有散文、一列表格都沒有，所以 oxfmt 與這支工具從來沒有碰過
 * 同一行。經過見 DECISIONS-2.md 的 **C165**。
 *
 * 所以分工是：**內容歸這支工具，排版歸 oxfmt。**
 *
 * ⚠️ 只有 `|` 開頭的列會被正規化，而且只動空白與分隔列的 `-` 長度 ——
 * 對齊用的 `:` 保留（`| :--- |` 與 `| --- |` 仍然算不同），因為那是語意。
 * ⚠️ 圍籬（``` ）裡面一律逐字比：那裡的 `|` 不是表格。
 */
export function sameReport(a: string, b: string): boolean {
  return normalizeTables(a) === normalizeTables(b);
}

function normalizeTables(text: string): string {
  const out: string[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    out.push(!fenced && line.trimStart().startsWith("|") ? normalizeRow(line) : line);
  }
  return out.join("\n");
}

function normalizeRow(line: string): string {
  const trimmed = line.trim();
  const inner = trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined);
  const cells = inner.split("|").map((cell) => cell.trim().replace(/^(:?)-+(:?)$/u, "$1-$2"));
  return `| ${cells.join(" | ")} |`;
}
