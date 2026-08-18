import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 報告要**整份**印得出來。
 *
 * ── 這條測試在防的缺陷已經真的發生過一次 ────────────────────────────
 *
 * #53 把十幾行 `console.error` 收成「組出一個字串、一次寫出去」。
 * 那個改動在 macOS 上把 123 KB 的報告從中間切斷、只印了 38 KB ——
 * 而結束碼仍然是 1，所以 CI 是紅的、看起來完全正常，
 * 只有真的去讀報告的人會發現最後一條違規講到一半就沒了。
 *
 * 原因：寫到 pipe 的 stderr 在 macOS 上是**非同步**的（Linux 與 Windows
 * 是同步的），而 `process.exit()` 不等待未送出的那一段。修法是設
 * `process.exitCode` 讓行程自己跑完 —— 見 `src/cli.ts` 該處的註解。
 *
 * ⚠️ 這條測試必須起行程，而且**必須讓 stdio 走 pipe**。同一份程式碼在
 * 終端機（TTY）底下不會出事，所以「本機手動跑一次看起來對」證明不了任何事。
 * 這也是為什麼它沒有跟著判定一起搬進 `rules.test.ts`：
 * 它驗的正是那個「行程結束」的接縫本身。
 *
 * ⚠️ 而且報告必須**大過 pipe 的緩衝區**（64 KB）。違規數不夠多的話，
 * 整份報告一次就塞得進去，這條測試會恆綠 —— 拆解當時錄的六份輸出
 * 最大的一份 7 KB，那正是它們一字不差、卻沒抓到這個缺陷的原因。
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(HERE, "../../..");
const CLI = join(ROOT, "tools/conformance/src/cli.ts");

/** 讓報告確定超過 64 KB 的違規數。每一條約 200 位元組。 */
const VIOLATIONS = 600;

let sandbox: string | undefined;

afterEach(() => {
  if (sandbox !== undefined) rmSync(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

describe("大報告不得被截斷", () => {
  it(`${VIOLATIONS} 條違規全部印得出來，最後一條是完整的`, () => {
    const dir = mkdtempSync(join(tmpdir(), "conformance-output-"));
    sandbox = dir;
    mkdirSync(join(dir, "features"), { recursive: true });
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });

    // action 釘住那條規則是最好用的量產違規來源：一行 YAML 一條違規，
    // 而且不需要在磁碟上擺出一個能通過其他所有規則的切片。
    let workflow = "jobs:\n  a:\n    steps:\n";
    for (let i = 0; i < VIOLATIONS; i++) workflow += `      - uses: org/action-${i}@v1\n`;
    writeFileSync(join(dir, ".github/workflows/ci.yml"), workflow);

    // encoding 一給就是 pipe —— 而 pipe 正是會出事的那一種 stdio。
    const result = spawnSync("node", [CLI, "--root", dir], { cwd: ROOT, encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    expect(result.status).toBe(1);

    // 一、確定這份報告真的大過緩衝區，否則下面兩條會恆真。
    expect(Buffer.byteLength(output, "utf8")).toBeGreaterThan(64 * 1024);

    // 二、印出來的違規**條數**要對得上。截斷時開頭那幾百條照樣在、
    // 結束碼照樣是 1，所以「有沒有印完」只有數量與結尾看得出來。
    // 實測那次截斷在第 185 條左右。
    expect(output.split("✗ [").length - 1).toBe(VIOLATIONS);
    expect(output).toContain(`${VIOLATIONS} 項違規`);
    expect(output).toContain(`org/action-${VIOLATIONS - 1}@v1`);

    // 三、最後一條沒有斷在半句話上。每一組結束時會空一行，
    // 所以完整的報告一定以兩個換行收尾。
    //
    // ⚠️ 刻意不比對最後那段訊息的字面內容 —— 那會讓「有人調整了某條規則的
    // 修法說明」變成這條測試紅，而紅的訊息不會提到截斷。
    expect(output.endsWith("\n\n")).toBe(true);
  });
});
