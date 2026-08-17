import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";

/**
 * 跑一次 `vue-tsc` 並**把它的輸出全部分類完**。
 *
 * ── 為什麼不只 grep "error TS" ────────────────────────────────────────
 *
 * 因為 grep 不到就等於零，而「零」在這個 repo 已經騙過三次了：
 * `@source` 沒設時 Tailwind 建置成功、CSS 還變大，裡面一個 utility 都沒有；
 * `@theme` 的測試量的是「有沒有寫」不是「有沒有生效」。
 * 所以這裡的規則是：**每一行都要被認出來，認不出來就丟例外**。
 *
 * 同一次執行也帶 `--listFiles`，用途是回答「它到底看了哪些檔」——
 * 一個 `.vue` 不在清單裡，代表這份 program 根本沒讀到它，而那時候的 0 條
 * 錯誤是「沒有人在看」，不是「乾淨」。判定在 `cli.ts`。
 */

export interface Diagnostic {
  /** 診斷所在檔案。**tsconfig 層級的錯誤沒有檔案**（例如讀不到設定檔），此時為 null。 */
  readonly file: string | null;
  readonly line: number | null;
  readonly code: string;
  readonly text: string;
}

export interface RunResult {
  readonly status: number;
  readonly files: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

const WITH_LOCATION = /^(.+?)\((\d+),(\d+)\): (?:error|warning) (TS\d+): (.*)$/;
const WITHOUT_LOCATION = /^(?:error|warning) (TS\d+): (.*)$/;

export function parseOutput(output: string): { files: string[]; diagnostics: Diagnostic[] } {
  const files: string[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const line of output.split("\n")) {
    if (line.trim() === "") continue;

    // 續行：訊息太長時 tsc 會縮排接下去寫。接回上一筆，不要當成新的一行。
    if (/^\s/.test(line) && diagnostics.length > 0) {
      const last = diagnostics[diagnostics.length - 1] as Diagnostic;
      diagnostics[diagnostics.length - 1] = { ...last, text: `${last.text}\n${line.trim()}` };
      continue;
    }

    const located = WITH_LOCATION.exec(line);
    if (located !== null) {
      diagnostics.push({
        file: located[1] as string,
        line: Number(located[2]),
        code: located[4] as string,
        text: located[5] as string,
      });
      continue;
    }

    const global = WITHOUT_LOCATION.exec(line);
    if (global !== null) {
      diagnostics.push({
        file: null,
        line: null,
        code: global[1] as string,
        text: global[2] as string,
      });
      continue;
    }

    // 剩下的只能是 --listFiles 印出來的絕對路徑。不是的話就是有一種輸出
    // 這支解析器不認識 —— 那要當場知道，不能默默丟掉。
    if (isAbsolute(line) && existsSync(line)) {
      files.push(line);
      continue;
    }

    throw new Error(`vue-tsc 有一行輸出解析不了：${JSON.stringify(line)}`);
  }

  return { files, diagnostics };
}

/**
 * ⚠️ **`--listFiles` 與錯誤訊息會混在同一份 stdout 裡**，而且順序不保證。
 * 這是實測過的（10 條錯誤的 program 仍然印出完整檔案清單），所以只跑一次。
 */
export function runVueTsc(bin: string, cwd: string, tsconfig: string): RunResult {
  const result = spawnSync(process.execPath, [bin, "--noEmit", "--listFiles", "-p", tsconfig], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error !== undefined) throw result.error;
  const { files, diagnostics } = parseOutput(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return { status: result.status ?? 1, files, diagnostics };
}
