import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpec } from "../src/spec.ts";

/**
 * CLI 這一層，以及**它與 `tools/spec-report` 的分界**。
 *
 * ── 為什麼分界要有測試 ──────────────────────────────────────────────
 *
 * 兩支工具都讀 `.feature`，但問的是不同的問題：
 *
 *   這一支      `specs/*.feature`             第一類 —— 腳手架對採用團隊的承諾
 *   spec-report `features/​*​/specs/*.feature`   第二類 —— 專案組自己的業務規格
 *
 * ⚠️ 混在一起的後果不是「多算幾條」：框架承諾會被算進**業務功能完成率**，
 * 而那份報表是拿去對外報進度的。分界現在成立，靠的是兩個 glob 不重疊 ——
 * 那種東西會在沒有人注意的時候被改掉，所以這裡有一條斷言在守。
 */

/**
 * ⚠️ **這一支對真 repo 跑別的工具，所以排程相依查過了：不需要 `dependsOn`。**
 *
 * C87 記著 `@org/slice-gen#test` 會在**真的** `features/` 底下建一個 `zz-` 切片，
 * 而那種切片自帶 `specs/<name>.feature`（C114）—— 看起來正好會讓下面那條
 * `spec-report --check` 間歇變紅。**不會**：`tools/slice-gen/tests/e2e.test.ts`
 * 整份沒有碰過 git，而 `spec-report` 與 `promise-check` 的事實來源都是
 * `git ls-files`（C73／C98）。沒進 index 的東西，兩支都看不見。
 *
 * 這句話寫在這裡，是因為下一個人會重新問一次同一個問題。
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(HERE, "../../..");
const CLI = join(ROOT, "tools/promise-check/src/cli.ts");
const SPEC_REPORT_CLI = join(ROOT, "tools/spec-report/src/cli.ts");
const REAL_SPEC = "specs/promise-1-architecture.feature";

function run(args: readonly string[]): { status: number | null; output: string } {
  const result = spawnSync("node", [...args], { cwd: ROOT, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

describe("CLI", () => {
  it("版控裡的承諾全部成立時回傳 0，並說出執行過幾條", () => {
    const { status, output } = run([CLI]);

    expect(status, output).toBe(0);
    // ⚠️ 印的是**執行過**的場景數，不是規格裡寫了幾條 —— 兩者不同的那一天，
    // 差別就是「有幾條沒被跑到」。
    expect(output).toContain("個場景各執行過一次");
  });

  it("找不到規格時回傳非零（結束碼是唯一會被 CI 讀到的東西）", () => {
    const { status, output } = run([CLI, "--spec", "specs/不存在的規格.feature"]);

    expect(status, output).not.toBe(0);
    expect(output).toContain("規格不見了");
  });
});

describe("與 tools/spec-report 的分界", () => {
  /**
   * ⚠️ 功能名從**規格檔本身**解析出來，不在這裡抄一份字串：抄的話，
   * 規格改標題的那天這兩條斷言會安靜地不再守任何東西
   * （`tripwire-must-hang-on-its-target`：斷言吃的資料要從被守的東西取）。
   */
  function promiseFeatureName(): string {
    const { scenarios } = parseSpec(REAL_SPEC, readFileSync(join(ROOT, REAL_SPEC), "utf8"));
    const feature = scenarios[0]?.feature;
    expect(feature, "規格解析不出功能名，這條斷言就沒有東西可比對").toBeDefined();
    return feature as string;
  }

  it("業務功能完成率看不到框架承諾", () => {
    // 真的跑一次那支工具：它自己的 `--check` 就是分界破掉時會響的那條線。
    const { status, output } = run([SPEC_REPORT_CLI, "--check"]);

    expect(status, output).toBe(0);
    expect(output, "框架承諾被算進了業務功能完成率").not.toContain(promiseFeatureName());
  });

  it("報表檔裡沒有承諾規格的功能名", () => {
    expect(readFileSync(join(ROOT, "SPEC-REPORT.md"), "utf8")).not.toContain(promiseFeatureName());
  });
});
