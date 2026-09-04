import { describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { runCli, sandbox } from "@org/gate-kit/testing";

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
 * ⚠️ **而且它只在 macOS 上抓得到那個回歸。** pipe 的寫入在 Linux 與 Windows
 * 上是同步的，所以在 CI（`tier2-security.yml` 跑 Linux）上，有沒有人把
 * `process.exit(1)` 加回去，這條都是綠的。
 *
 * 這件事寫在這裡而不是拿掉測試，是因為它斷言的行為在每個平台上都該成立 ——
 * 但**別把 CI 綠燈當成這條規則被守住了**。真正會踩到的人是在 macOS 上開發、
 * 第一次把這道閘門指向自己 repo 的那個 fork 團隊，而那也正是報告最大的一次。
 *
 * ⚠️ 而且報告必須**大過 pipe 的緩衝區**（64 KB）。違規數不夠多的話，
 * 整份報告一次就塞得進去，這條測試會恆綠 —— 拆解當時錄的六份輸出
 * 最大的一份 7 KB，那正是它們一字不差、卻沒抓到這個缺陷的原因。
 */

const CLI = "tools/conformance/src/cli.ts";

/** 讓報告確定超過 64 KB 的違規數。每一條約 200 位元組。 */
const VIOLATIONS = 600;

describe("大報告不得被截斷", () => {
  it(`${VIOLATIONS} 條違規全部印得出來，最後一條是完整的`, () => {
    // action 釘住那條規則是最好用的量產違規來源：一行 YAML 一條違規，
    // 而且不需要在磁碟上擺出一個能通過其他所有規則的切片。
    let workflow = "jobs:\n  a:\n    steps:\n";
    for (let i = 0; i < VIOLATIONS; i++) workflow += `      - uses: org/action-${i}@v1\n`;
    const box = sandbox({
      prefix: "conformance-output-",
      files: { ".github/workflows/ci.yml": workflow },
    });
    mkdirSync(join(box.root, "features"), { recursive: true });

    // runCli 給了 encoding，所以 stdio 是 pipe —— 而 pipe 正是會出事的那一種 stdio。
    const result = runCli(CLI, ["--root", box.root]);
    const output = result.output;

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

/**
 * 檔案模式那條規則**接上了沒有**。
 *
 * ⚠️ 這條測試存在的理由很窄，而它補的是一個真的洞：那條規則
 * **刻意不在 `--root` 底下跑**（副本不是版控，見 `rules/file-mode.ts` 的檔頭），
 * 而 `--root` 正是這支工具唯一的端對端反向測試機制。也就是說
 * `negative.test.ts` 的每一條都證明不了它有被接進 `cli.ts` ——
 * 把那一行刪掉，判定的八條測試照樣全綠。
 *
 * 所以這裡驗的不是判定（那在 `rules.test.ts`），是**接線**：
 * 不帶 `--root` 跑一次，輸出必須說它查過了。
 */
describe("檔案模式那條規則要真的被接進 cli.ts", () => {
  it("不帶 --root 跑，輸出要說它查過版控模式", () => {
    const output = runCli(CLI).output;
    // ⚠️ 斷言的是那個**數字**，不是那句話 —— 一句寫死的話在呼叫被刪掉之後
    // 照樣印得出來（第一版就是這樣寫的，而那條測試是恆真的）。
    const examined = /含版控檔案模式：(\d+) 個版控檔案/.exec(output)?.[1];
    expect(Number(examined)).toBeGreaterThan(100);
  });

  it("★ 帶 --root 跑，要明說它沒查（安靜跳過與查過是同一個畫面）", () => {
    const dir = sandbox({ prefix: "conformance-wiring-" }).root;
    mkdirSync(join(dir, "features"), { recursive: true });
    expect(runCli(CLI, ["--root", dir]).output).toContain("--root 之下**沒有**檢查檔案模式");
  });
});
