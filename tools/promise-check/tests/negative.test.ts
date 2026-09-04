import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkPromises } from "../src/check.ts";

/**
 * 這道閘門的**反向測試**：改壞規格，確認它會紅。
 *
 * ── 為什麼一個方向不夠 ──────────────────────────────────────────────
 *
 * 「把承諾改成假的 → 紅」只證明它讀了那句話。**最常見的失效模式不是
 * 說謊，是沒被讀到**：規格檔改名、場景被刪、「假設」句改寫之後接不上。
 * 那幾種的共同症狀是**閘門全綠而承諾一條都沒驗**，而全綠與真的守住了
 * 長得一模一樣。
 *
 * 這個 repo 已經在兩處付過同一筆學費，兩處都寫在原始碼裡：
 *
 *   `tools/doc-facts` 的 `unguarded` —— 清空 citations 讓閘門靜默解除武裝（C97）
 *   `tools/spec-report` 的第四態 ❓ —— 測試全綠而場景一條都沒跑（C115）
 *
 * 所以下面分三組：**說謊會紅**、**沒被讀到會紅**、**紅在別的地方也會紅**。
 *
 * ── 為什麼用 `--spec` 而不是改真的規格檔 ────────────────────────────
 *
 * 改壞的規格寫在暫存目錄，被檢查的 repo 仍然是真的這一棵 ——
 * `specs/` 底下那份**一個位元組都不會被動到**。形狀與
 * `tools/conformance/tests/negative.test.ts`（改副本，不改 repo）同一條。
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(HERE, "../../..");
const REAL_SPEC = "specs/promise-1-architecture.feature";
/**
 * 另一份**沒有被改壞**的規格，每一次呼叫都要一起餵進去。
 *
 * ⚠️ 不是陪襯：`BREAKAGES` 是一張全樹共用的表，而孤兒檢查問的是「這張表裡
 * 有沒有哪一條沒有人用」。只餵一份規格的話，另一份的破壞手法會**全部變成
 * 孤兒**，`checkPromises` 在接線那一關就回頭 —— 下面每一條「該紅在執行結果上」
 * 的斷言都會拿到兩則〈孤兒接線〉，而那與它們要守的東西無關。
 *
 * ⚠️ 代價是這支測試檔會真的跑 `tools/threshold-check`（每趟約三秒）。
 * 拿一份假的去頂替省不掉：假的規格得指名某一道真的閘門，而它一旦跑起來，
 * 省下的就又回來了。
 *
 * ⚠️⚠️ **這一份必須是綠的。** 它紅的那天，下面每一條的紅燈都會指向錯的地方 ——
 * 那些斷言問的是「promise-1 被改壞了會不會被抓到」，而報告上會多出一批
 * 與它們無關的 finding。先跑 `node tools/promise-check/src/cli.ts` 看是哪一份紅。
 */
const OTHER_SPEC = "specs/gate-thresholds.feature";

/**
 * 會真的跑到閘門的那幾條要放寬逾時。
 *
 * ⚠️ **這不是「調鬆門檻換綠燈」**：這裡量的是「改壞規格會不會被抓到」，
 * 不是「它跑多快」。`tools/threshold-check` 每趟約三秒，而 vitest 的預設是五秒 ——
 * 不放寬的話，紅燈說的會是逾時，而那則訊息指向錯的地方。
 * 真要守速度，那是另一條斷言，而且得先有一個被裁過的預算。
 */
const EXECUTES = 60_000;

let sandbox: string | undefined;

afterEach(() => {
  if (sandbox !== undefined) rmSync(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

/**
 * 把真規格改一處，寫到暫存目錄。
 *
 * ⚠️ 找不到錨點就**丟錯**：那代表這條反向測試其實什麼都沒改壞，
 * 而它會「通過」。
 */
function patched(from: string, to: string): string[] {
  const source = readFileSync(join(ROOT, REAL_SPEC), "utf8");
  if (!source.includes(from)) {
    throw new Error(
      `[negative] 規格裡找不到要改的片段：${from}\n  規格改寫了，跟著更新這裡的錨點。`,
    );
  }
  sandbox = mkdtempSync(join(tmpdir(), "promise-negative-"));
  const path = join(sandbox, "patched.feature");
  writeFileSync(path, source.replace(from, to));
  return [path, OTHER_SPEC];
}

function rules(specs: readonly string[]): string[] {
  return checkPromises(ROOT, specs).findings.map((finding) => finding.rule);
}

const CROSS_SLICE_THEN = '那麼 它必須紅，訊息裡要出現 "跨切片依賴"';

describe("★ 真規格本身是綠的", () => {
  /**
   * ⚠️ 這一條必須先過，否則下面每一條都沒有意義 —— 只要接線壞了，
   * 所有「該紅」的測試都會「成功變紅」，而原因是環境壞了。
   */
  it(
    "版控裡那份規格，每一條承諾都成立",
    () => {
      const { findings, runs } = checkPromises(ROOT, [REAL_SPEC, OTHER_SPEC]);

      expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
      // 每一條承諾都**真的執行過**，不是解析過就算數。
      expect(runs.length).toBeGreaterThanOrEqual(4);
    },
    EXECUTES,
  );
});

describe("承諾說謊 → 紅", () => {
  it(
    "把「必須紅」改成「必須綠」→ 執行結果對不上",
    () => {
      expect(rules(patched(CROSS_SLICE_THEN, '那麼 它必須綠，訊息裡要出現 "跨切片"'))).toContain(
        "承諾誤擋",
      );
    },
    EXECUTES,
  );

  it("把對照組的「必須綠」改成「必須紅」→ 沒有對照組", () => {
    // ⚠️ 這一條與上一條方向相反：對照組被改掉之後，**沙盒壞了也不會有人發現**。
    expect(
      rules(
        patched('那麼 它必須綠，訊息裡要出現 "2 個切片"', '那麼 它必須紅，訊息裡要出現 "2 個切片"'),
      ),
    ).toContain("沒有對照組");
  });
});

describe("規格沒被讀到 → 紅（這一組才是重點）", () => {
  it("整個場景被刪掉 → 孤兒接線", () => {
    const removed = patched(
      `  場景: 一片切片相依另一片切片時，這道邊界會擋下來\n    假設 一片切片的 package.json 宣告了對另一片切片的相依\n    當 跑 tools/conformance\n    ${CROSS_SLICE_THEN}\n`,
      "",
    );
    expect(rules(removed)).toContain("孤兒接線");
  });

  it("「假設」那一句被改寫 → 接不上，而且原本那條變孤兒", () => {
    const result = rules(
      patched(
        "假設 一片切片的 package.json 宣告了對另一片切片的相依",
        "假設 一片切片的 package.json 宣告了對另外一片切片的相依",
      ),
    );
    expect(result).toContain("沒有接線");
    expect(result, "改寫等於刪掉再加一條，兩個方向都要說話").toContain("孤兒接線");
  });

  it("規格檔改名或被刪 → 規格不見了", () => {
    expect(rules(["specs/不存在的規格.feature", OTHER_SPEC])).toContain("規格不見了");
  });

  it("一份規格都沒有 → 沒有規格（不是「沒事可做」）", () => {
    expect(rules([])).toContain("沒有規格");
  });
});

describe("承諾綁到一道沒有在跑的閘門 → 紅", () => {
  it("指名一支不存在的閘門", () => {
    expect(rules(patched("當 跑 tools/conformance", "當 跑 tools/不存在"))).toContain("閘門不存在");
  });

  /**
   * ⚠️ **這一條補的正是 HANDOFF 那句「承諾與閘門對不對得上，只有人讀得出來」。**
   *
   * `tools/spec-report` 真的存在、也真的有 CLI —— 它只是**不在** `scripts.gate`
   * 那條鏈上（它接在 `vpr ready` 的最後一步）。承諾綁到一道不會被執行的閘門，
   * 那條承諾在 `vpr gate` 上是空的，而靜態比對「這支工具存在嗎」看不出差別。
   */
  it("指名一支存在、但沒有接在 scripts.gate 上的工具", () => {
    expect(rules(patched("當 跑 tools/conformance", "當 跑 tools/spec-report"))).toContain(
      "閘門沒有接上",
    );
  });
});

describe("承諾綁到一道看不見副本的閘門 → 紅", () => {
  /**
   * ⚠️ **這一組守的是探針有沒有接進 `checkPromises`**，不是探針本身
   * （那在 `tests/probe.test.ts`，連同它的假閘門對照組）。
   *
   * `tools/doc-facts` 真的存在、也真的在 `scripts.gate` 上 —— 它只是
   * **看不見那份副本**。承諾綁到它的話，每一次「照規格弄壞副本」之後跑的都是
   * **沒有被弄壞的真樹**。
   *
   * ⚠️ **這一格原本用的是 `tools/scope-check`，併線那天換掉**（C133 §五）：
   * 那支工具在 `main` 上進了名冊的 `UNGATED`（`SCOPE.md` 對超集樹會滿江紅），
   * 於是它不再在 `scripts.gate` 上 —— 先開火的變成〈閘門沒有接上〉，
   * 而這一條要守的是**下一關**。⚠️ 這正是下面那個 ⚠️ 說的情況真的發生了一次，
   * 只是原因不是「它宣告了 `--root`」。**換一支的時候，兩個條件都要重新確認。**
   *
   * ⚠️ **C126 之後它的機制變了，判定沒變**：在那之前它靜默忽略 `--root`
   * （C123 §一）；現在它接了 `parseFlags` 而沒有宣告 `--root`，所以**拒絕**它
   * —— 兩趟都失敗、訊息相同，探針一樣判「看不見」。
   *
   * ⚠️ 少了這一格，那個症狀會長成〈承諾沒有牙齒〉—— 而那則訊息給的兩條
   * 修法（修閘門／改規格）都不是真正的原因，其中一條還能靠改規格變綠。
   *
   * ⚠️ `tools/doc-facts` 哪天**宣告**了 `--root`，這一條會安靜地不再守任何
   * 東西。那天是好消息，換一支還沒宣告、而且**在閘門鏈上**的閘門就好 ——
   * 但要記得換。
   */
  it(
    "指名一支存在、在 gate 上、卻看不見副本的閘門",
    () => {
      expect(rules(patched("當 跑 tools/conformance", "當 跑 tools/doc-facts"))).toContain(
        "閘門指不到副本",
      );
    },
    EXECUTES,
  );
});

describe("紅在別的地方 → 也要紅", () => {
  it(
    "訊息片段對不上時不算通過",
    () => {
      // 閘門確實會紅（跨切片依賴），但紅的內容不是規格要求的那一段。
      // 少了這個比對，任何一種違規都能讓任何一條承諾變綠。
      expect(
        rules(patched(CROSS_SLICE_THEN, '那麼 它必須紅，訊息裡要出現 "不會出現的字"')),
      ).toContain("紅在別的地方");
    },
    EXECUTES,
  );
});
