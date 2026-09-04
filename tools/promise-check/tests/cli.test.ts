import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
 * ⚠️ **這一支對真 repo 跑別的工具，而排程相依現在是需要的**（`vite.config.ts`）。
 *
 * C87 記著 `@org/slice-gen#test` 會在**真的** `features/` 底下建一個 `zz-` 切片，
 * 而那種切片自帶 `specs/<name>.feature`（C114）—— 看起來正好會讓下面那條
 * `spec-report --check` 間歇變紅。**那一條不會**：`tools/slice-gen/tests/e2e.test.ts`
 * 整份沒有碰過 git，而 `spec-report` 與 `promise-check` 的事實來源都是
 * `git ls-files`（C73／C98）。沒進 index 的東西，兩支都看不見。
 *
 * ⚠️⚠️ **而那個論證在 C163 之後不涵蓋全部了。** 這一支現在會執行
 * `specs/gate-thresholds.feature`，那兩個場景各起一次 `tools/threshold-check` ——
 * 它**不走 `git ls-files`**，它跑 `vp lint` 掃磁碟，於是那個 `zz-` 切片它看得見。
 * 所以修的是排程，理由逐字寫在 `tools/threshold-check/vite.config.ts`。
 *
 * ⚠️⚠️ **第三次，而破法又換了（C165）。** `spec-report --check` 從
 * `features/invoice` 進版控起會讀 `features/*​/.vitest-results.json` ——
 * 一個 **gitignore 掉的產物**。「事實來源都是 `git ls-files`」那個論證
 * 對它完全不適用：它讀的根本不是版控。在此之前報表是空的、`--check` 恆綠，
 * 所以誰先跑無所謂。
 *
 * 這段話寫在這裡，是因為下一個人會重新問一次同一個問題 —— 而上一次問的人
 * 得到的答案在當天是對的。
 */

/**
 * 版控裡有規格、而磁碟上還沒有測試結果的切片。
 *
 * ⚠️ 這是下面那條測試的**前提**，不是它要驗的東西。少了它，症狀是
 * 「`spec-report --check` 回 1」——訊息會說「還沒有測試結果」，讀起來像
 * 開發者忘了跑測試，而真正該改的可能是排程。
 *
 * ⚠️⚠️ **結果檔只有帶 `--outputFile` 的那條完整指令會產生**，`dependsOn`
 * 綁的是**跑序**不是產出：單獨 `vp run @org/promise-check#test` 永遠缺它，
 * 而那不是缺陷。所以訊息要把兩個成因分開講。
 *
 * ⚠️ 它同時是**下一片帶規格的切片**的絆線：那一片的 `#test` 沒被加進
 * `vite.config.ts` 的 `dependsOn` 時，這裡會指名說出是哪一片。
 */
function slicesMissingResults(): string[] {
  const listed = spawnSync("git", ["ls-files", "-z", "--", "features/*/specs/*.feature"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const slices = new Set(
    listed.stdout
      .split("\0")
      .filter((path) => path.length > 0)
      .map((path) => path.split("/")[1] as string),
  );
  return [...slices].filter(
    (slice) => !existsSync(join(ROOT, "features", slice, ".vitest-results.json")),
  );
}

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
  /**
   * ⚠️ **逾時放寬到 60 秒，而那不是「調鬆門檻換綠燈」。** 這一趟現在會真的跑三次
   * `tools/threshold-check`（探針一次、`specs/gate-thresholds.feature` 兩個場景各一次），
   * 每次約三秒 —— 實測整趟約 10 秒，而 vitest 的預設是 5 秒。
   * 這裡量的是「承諾成不成立」，不是「它跑多快」；真要守速度，那是另一條斷言，
   * 而且它得先有一個被裁過的預算（C147 §二 那種）。
   */
  it("版控裡的承諾全部成立時回傳 0，並說出執行過幾條", () => {
    const { status, output } = run([CLI]);

    expect(status, output).toBe(0);
    // ⚠️ 印的是**執行過**的場景數，不是規格裡寫了幾條 —— 兩者不同的那一天，
    // 差別就是「有幾條沒被跑到」。
    expect(output).toContain("個場景各執行過一次");
  }, 60_000);

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
    expect(
      slicesMissingResults(),
      "這幾片切片還沒留下測試結果。兩個成因，修法不同（C87／C165）：\n" +
        "  · 單獨跑這一支 → 結果檔只有帶 `--outputFile` 的那條完整指令會產生，" +
        "改跑 `vp run -r test -- --reporter=default --reporter=json " +
        "--outputFile=.vitest-results.json`\n" +
        "  · 完整指令下仍然缺 → 那一片的 `@org/feature-<切片>#test` 沒進 " +
        "tools/promise-check/vite.config.ts 的 dependsOn，跑序沒有被綁住",
    ).toEqual([]);

    // 真的跑一次那支工具：它自己的 `--check` 就是分界破掉時會響的那條線。
    const { status, output } = run([SPEC_REPORT_CLI, "--check"]);

    expect(status, output).toBe(0);
    expect(output, "框架承諾被算進了業務功能完成率").not.toContain(promiseFeatureName());
  });

  it("報表檔裡沒有承諾規格的功能名", () => {
    expect(readFileSync(join(ROOT, "SPEC-REPORT.md"), "utf8")).not.toContain(promiseFeatureName());
  });
});
