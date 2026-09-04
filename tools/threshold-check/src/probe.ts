import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectSlots, floorSource, type Slot } from "./config.ts";
import { parseDiagnostics, type ParsedDiagnostics } from "./diagnostics.ts";

/**
 * 跑探針：拿一份門檻被壓到地板的 lint 設定，量出每一格的實測最大值。
 *
 * ── ⚠️ 為什麼不照票面說的去改 `vite.config.ts` ──────────────────────
 *
 * `#226` 的〈重跑〉那一節寫的是「先備份、就地改 `vite.config.ts`、量完還原、
 * 以 sha256 回讀」。**人手動量一次可以這樣，一道每次 `vpr gate` 都跑的閘門不行**
 * —— 那等於每一趟閘門都對一個版控追蹤中的檔案寫兩次，而中途被砍掉時
 * 樹上會留著一份被改過的設定，沒有任何東西會說。
 *
 * 這裡改用**符號連結農場**：在暫存目錄裡把 repo 根層的每一個項目連過去，
 * 只有 `vite.config.ts` 是實體檔（壓到地板的那一份），然後在那裡跑 `vp lint`。
 * **真樹一個位元都沒被碰過。**
 *
 * ⚠️ 這一招成不成立完全靠一件事：oxlint 走得進符號連結，而且掃到的檔案集合
 * 與真樹**一模一樣**。走不進去的話它會掃到零個檔、回綠 —— 十一格全部「量不到」。
 * 所以 `compareFileSets` 是必要的夾具，不是保險（C154 §三 第 3 條）。
 *
 * ⚠️ **不連 `.git`。** 連過去的話，任何在農場裡動到 git 的東西都會打到真的
 * 版控目錄上。代價是 oxlint 的忽略規則要能在沒有 `.git` 的情況下照常運作 ——
 * 而那件事同樣由 `compareFileSets` 在守，不是靠相信。
 *
 * ── ⚠️ 兩個 root，而它們刻意不是同一個 ──────────────────────────────
 *
 * `toolRoot` 是這支工具跑在哪（`vp` 的位置、被 lint 的那棵樹）；
 * `targetRoot` 是**被驗的那份 `vite.config.ts` 住在哪**。C127 §一 判過這條線：
 * `--root` 指的是**被驗的對象**，不是「這支工具跑在哪」—— 而這裡被驗的對象
 * 就是那幾格門檻的數字，樹是量它們用的素材。
 *
 * 所以基準那一趟也走農場：農場裡放**目標的設定原封不動**，量出它宣告了
 * 哪幾格、各是多少；探針那一趟放同一份設定壓到地板的版本。
 *
 * ⚠️ **`realFiles` 仍然量真樹（`toolRoot`），不是農場。** 換成「兩個農場互比」
 * 的話，`compareFileSets` 那條夾具問的就從「符號連結農場有沒有重現這棵樹」
 * 變成「兩個農場同不同意」—— 恆真，而且它是這一招唯一的地基。
 */

const SKIP = new Set([".git", "vite.config.ts"]);

export interface ProbeOutcome {
  readonly realSlots: readonly Slot[];
  readonly probeSlots: readonly Slot[];
  readonly parsed: ParsedDiagnostics;
  /** 真樹與農場各自掃到的檔案清單，已排序。 */
  readonly realFiles: readonly string[];
  readonly probeFiles: readonly string[];
  /** 原始碼裡被改寫的門檻格數。與 `realSlots.length` 對不上就是萃取漏了。 */
  readonly rewritten: number;
}

export class ProbeError extends Error {}

function lintBin(root: string): string {
  const local = join(root, "node_modules", ".bin", "vp");
  return existsSync(local) ? local : "vp";
}

/**
 * ⚠️ `maxBuffer` 一定要調大。地板設定下全樹會報出四千多條診斷，
 * JSON 有數 MB —— Node 的預設是 1 MB，超過就靜靜地把輸出截斷成
 * 「解析失敗」，而那長得跟「這棵樹很乾淨」一模一樣。
 */
function runLint(
  root: string,
  cwd: string,
  args: readonly string[],
): { stdout: string; stderr: string } {
  const result = spawnSync(lintBin(root), ["lint", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error !== undefined) throw new ProbeError(`跑不起來 vp lint：${result.error.message}`);
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** `--print-config` 與 `--debug=files` 走哪一條輸出串流是上游的事，兩條都收。 */
function bothStreams({ stdout, stderr }: { stdout: string; stderr: string }): string {
  return stdout.trim().length > 0 ? stdout : stderr;
}

function printConfig(root: string, cwd: string): unknown {
  const text = bothStreams(runLint(root, cwd, ["--print-config"]));
  const at = text.indexOf("{");
  if (at === -1) throw new ProbeError(`vp lint --print-config 沒有給出 JSON（${cwd}）`);
  try {
    return JSON.parse(text.slice(at)) as unknown;
  } catch (cause) {
    throw new ProbeError(`vp lint --print-config 的輸出不是 JSON（${cwd}）：${String(cause)}`);
  }
}

function fileList(root: string, cwd: string): string[] {
  return bothStreams(runLint(root, cwd, ["--debug=files"]))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

/**
 * 農場的清理。**逐項 `unlink` 再 `rmdir`，不用遞迴刪除。**
 *
 * ⚠️ 這個目錄裡除了 `vite.config.ts` 之外全是指向真樹的符號連結，
 * 而「遞迴刪除會不會跟著連結走進去」是一個我不想賭的問題。
 * 逐項刪的話，刪錯的上限是這個暫存目錄本身。
 *
 * ⚠️ **整段吞例外**：它跑在 `finally` 裡，這裡丟出去會把正在飛的那個
 * `ProbeError` 蓋掉 —— 一句「輸出不是 JSON」會變成一個看不懂的 ENOTEMPTY。
 * 掃不乾淨的代價是暫存目錄裡留下一個空殼，那比掉一則診斷便宜。
 */
function tearDown(farm: string): void {
  try {
    for (const entry of readdirSync(farm)) {
      const path = join(farm, entry);
      if (lstatSync(path).isSymbolicLink() || lstatSync(path).isFile()) unlinkSync(path);
    }
    rmdirSync(farm);
  } catch {
    /* 見上 */
  }
}

/**
 * 開一座農場：`toolRoot` 的每一項連過去，`vite.config.ts` 換成 `config`。
 *
 * ⚠️ 一定要 `finally` 收掉 —— 中途丟錯時留下的是一個裝滿符號連結的暫存目錄，
 * 而那些連結指著真樹。
 */
function withFarm<T>(toolRoot: string, config: string, body: (farm: string) => T): T {
  const farm = mkdtempSync(join(tmpdir(), "threshold-check-"));
  try {
    for (const entry of readdirSync(toolRoot)) {
      if (SKIP.has(entry)) continue;
      symlinkSync(join(toolRoot, entry), join(farm, entry));
    }
    writeFileSync(join(farm, "vite.config.ts"), config);
    return body(farm);
  } finally {
    tearDown(farm);
  }
}

/**
 * @param toolRoot 這支工具跑在哪：`vp` 的位置，以及被 lint 的那棵樹。
 * @param targetRoot 被驗的那份 `vite.config.ts` 住在哪。⚠️ 預設就是 `toolRoot`，
 *   而 `vpr gate` 上跑的永遠是那條路徑 —— 兩者不同的只有承諾檢查那條。
 */
export function probe(toolRoot: string, targetRoot: string = toolRoot): ProbeOutcome {
  const configPath = join(targetRoot, "vite.config.ts");
  // ⚠️ 說得出是哪個目錄。少了這一句，`--root` 指錯地方的症狀是一個 ENOENT，
  // 而那長得像「這支工具壞了」，不像「你給的那棵樹裡沒有設定檔」。
  if (!existsSync(configPath)) throw new ProbeError(`${targetRoot} 底下沒有 vite.config.ts`);

  const source = readFileSync(configPath, "utf8");
  const floored = floorSource(source);

  // 基準：目標的設定原封不動。⚠️ 走農場而不是直接量 `targetRoot`，因為
  // 那個目錄可能只有一份設定檔（承諾檢查的沙盒就是），`vp lint` 在那裡
  // 掃不到任何東西 —— 而掃不到與「這棵樹很乾淨」長得一樣。
  const realSlots = withFarm(toolRoot, source, (farm) => collectSlots(printConfig(toolRoot, farm)));
  const realFiles = fileList(toolRoot, toolRoot);

  return withFarm(toolRoot, floored.text, (farm) => {
    const probeSlots = collectSlots(printConfig(toolRoot, farm));
    const probeFiles = fileList(toolRoot, farm);

    const raw = runLint(toolRoot, farm, ["-f", "json"]).stdout;
    let payload: unknown;
    try {
      payload = JSON.parse(raw) as unknown;
    } catch (cause) {
      throw new ProbeError(`探針那趟 lint 的輸出不是 JSON：${String(cause)}`);
    }

    return {
      realSlots,
      probeSlots,
      parsed: parseDiagnostics(payload),
      realFiles,
      probeFiles,
      rewritten: floored.count,
    };
  });
}
