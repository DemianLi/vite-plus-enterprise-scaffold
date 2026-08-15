import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXEMPT, MINIMUM_SCANNED, SCAN_RULES, inScope, scanRepo } from "../src/scan.ts";
import { scanText } from "../src/detect.ts";

/**
 * 掃描範圍與例外機制的**反向測試**。
 *
 * ── 這支檔案刻意不在 EXEMPT 裡 ──────────────────────────────────────
 *
 * 所以它一個字面上的身分證字號都不能有。下面用字串拼接繞開偵測器
 *（`"A1" + "00000001"` 在檔案裡不是連續的字串，regex 撿不到），
 * 而第一條測試就是驗**那個拼接真的組得出會被抓到的值** ——
 * 少了它，這整支測試可能在餵一堆偵測不到的東西而全綠。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CLI = join(ROOT, "tools/pii-check/src/cli.ts");

/** 拼出來的，不是寫死的。理由見檔頭。 */
const VALID_ID = `A1${"00000001"}`;

describe("拼接出來的樣本真的會被偵測到", () => {
  it("★ 這條先過，下面才有意義", () => {
    expect(scanText(VALID_ID).map((finding) => finding.kind)).toContain("national-id");
  });

  it("而這支檔案自己不在例外清單裡 —— 它必須是乾淨的", () => {
    expect(Object.keys(EXEMPT)).not.toContain("tools/pii-check/tests/roster.test.ts");
  });
});

describe("掃描範圍：宣告的，不是 glob 出來的", () => {
  it("tests/ 底下的檔案在範圍內", () => {
    expect(inScope("features/order/tests/order.test.ts")).toBe(true);
  });

  it("檔名含 fixture 的在範圍內，不管放在哪", () => {
    expect(inScope("features/order/src/order.fixture.json")).toBe(true);
  });

  it("bff-mock 的示範資料在範圍內 —— 它不在 tests/ 底下", () => {
    expect(inScope("platform/bff-mock/src/server.ts")).toBe(true);
  });

  it("i18n 訊息在範圍內 —— 沒人會想到要看的那個落點", () => {
    expect(inScope("features/order/src/locales/zh-TW.json")).toBe(true);
  });

  it("★ 一般原始碼不在範圍內", () => {
    // 正式程式碼裡出現個資是另一條規則的事（⑨）。把它也收進來
    // 只會讓這道閘門對著自己的業務邏輯開火。
    expect(inScope("features/order/src/api.ts")).toBe(false);
    expect(inScope("platform/ui/src/components/UiDialog.vue")).toBe(false);
  });

  it("每一條規則都寫了理由", () => {
    for (const rule of SCAN_RULES) {
      expect(rule.why.length, `${rule.what} 沒寫理由`).toBeGreaterThan(20);
    }
  });
});

describe("🔴 掃到零個檔案不是通過", () => {
  it("檔案列舉壞掉 → 紅（這條是整支工具最重要的一條）", () => {
    // 沒有它，任何讓列舉壞掉的改動都會表現成「零個發現 ＝ 通過」——
    // C33 的 Trivy 掃 0 個套件、C34 只解第一份 YAML 的同一個形狀。
    const report = scanRepo([], () => "");
    expect(report.problems.map((problem) => problem.kind)).toContain("too-few-files");
  });

  it("只掃到少少幾個也是紅", () => {
    const files = ["a/tests/one.test.ts", "b/tests/two.test.ts"];
    const report = scanRepo(files, () => "乾淨的內容");
    expect(report.problems.map((problem) => problem.kind)).toContain("too-few-files");
  });

  it("★ 下限訂得比現況低一截，不是貼著現況", () => {
    // 貼著現況的話，每刪一支測試都要來改這個數字，然後有人會把它改成 0。
    const actual = spawnSync("node", [CLI], { cwd: ROOT, encoding: "utf8" });
    const scanned = /掃了 (\d+) 個檔案/.exec(actual.stdout ?? "")?.[1];
    expect(scanned, `工具沒有回報掃了幾個：\n${actual.stdout}${actual.stderr}`).toBeDefined();
    expect(Number(scanned)).toBeGreaterThan(MINIMUM_SCANNED);
  });
});

describe("例外：記錄「這一份看過了」，不是「這個目錄不用看」", () => {
  const files = Array.from({ length: MINIMUM_SCANNED }, (_, at) => `p${at}/tests/a.test.ts`);

  it("被豁免的檔案不報", () => {
    const exempt = Object.keys(EXEMPT)[0] as string;
    const report = scanRepo([...files, exempt], (path) => (path === exempt ? VALID_ID : "乾淨"));
    expect(report.findings).toEqual([]);
  });

  it("🔴 沒被豁免的檔案照報", () => {
    const report = scanRepo(files, (path) => (path === files[0] ? VALID_ID : "乾淨"));
    expect(report.findings.map((finding) => finding.kind)).toContain("national-id");
  });

  it("🔴 例外指向掃不到的檔案 → 紅", () => {
    // 檔案改名或搬走之後，例外會靜靜地不再對應任何東西 ——
    // 而清單上還掛著一條，看起來像「已經處理過」。
    const report = scanRepo(files, () => "乾淨");
    expect(report.problems.map((problem) => problem.kind)).toContain("stale-exemption");
  });

  it("🔴 例外的檔案現在一個都偵測不到 → 紅", () => {
    // 兩種可能，兩種都要講：檔案改乾淨了（該刪例外），
    // 或**偵測器壞了**（那更嚴重 —— 其他檔案也不會被偵測到）。
    const exempt = Object.keys(EXEMPT)[0] as string;
    const report = scanRepo([...files, exempt], () => "乾淨");
    const stale = report.problems.filter((problem) => problem.kind === "stale-exemption");
    expect(stale).toHaveLength(1);
    expect(stale[0]?.detail).toContain("偵測器壞了");
  });
});

describe("CLI 端對端", () => {
  it("這個 repo 現在是乾淨的", () => {
    const result = spawnSync("node", [CLI], { cwd: ROOT, encoding: "utf8" });
    expect(result.status, `${result.stdout ?? ""}${result.stderr ?? ""}`).toBe(0);
  });

  it("★ 通過訊息要講出偵測不到什麼 —— 否則綠燈會被讀成「沒有個資」", () => {
    const result = spawnSync("node", [CLI], { cwd: ROOT, encoding: "utf8" });
    expect(result.stdout).toContain("姓名抓不到");
  });

  it("🔴 塞一筆真的進去 → 紅", () => {
    const dir = mkdtempSync(join(tmpdir(), "pii-check-"));
    try {
      // 湊滿下限，否則會先被 too-few-files 擋下 —— 那樣就不算證明「偵測得到」。
      for (let at = 0; at <= MINIMUM_SCANNED; at += 1) {
        mkdirSync(join(dir, `p${at}`, "tests"), { recursive: true });
        writeFileSync(join(dir, `p${at}`, "tests", "a.test.ts"), "// 乾淨\n");
      }
      writeFileSync(join(dir, "p0", "tests", "a.test.ts"), `const id = "${VALID_ID}";\n`);
      // 例外指向的檔案在這個暫存 repo 裡不存在，stale-exemption 一定會有一條；
      // 這裡驗的是**另外那一條**確實出現了。
      const result = spawnSync("node", [CLI, "--root", dir], { cwd: ROOT, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("national-id");
      expect(result.stderr).toContain("p0/tests/a.test.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
