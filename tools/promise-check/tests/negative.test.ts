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
  return [path];
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
  it("版控裡那份規格，每一條承諾都成立", () => {
    const { findings, runs } = checkPromises(ROOT, [REAL_SPEC]);

    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
    // 每一條承諾都**真的執行過**，不是解析過就算數。
    expect(runs.length).toBeGreaterThanOrEqual(4);
  });
});

describe("承諾說謊 → 紅", () => {
  it("把「必須紅」改成「必須綠」→ 執行結果對不上", () => {
    expect(rules(patched(CROSS_SLICE_THEN, '那麼 它必須綠，訊息裡要出現 "跨切片"'))).toContain(
      "承諾誤擋",
    );
  });

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
    expect(rules(["specs/不存在的規格.feature"])).toContain("規格不見了");
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

describe("紅在別的地方 → 也要紅", () => {
  it("訊息片段對不上時不算通過", () => {
    // 閘門確實會紅（跨切片依賴），但紅的內容不是規格要求的那一段。
    // 少了這個比對，任何一種違規都能讓任何一條承諾變綠。
    expect(
      rules(patched(CROSS_SLICE_THEN, '那麼 它必須紅，訊息裡要出現 "不會出現的字"')),
    ).toContain("紅在別的地方");
  });
});
