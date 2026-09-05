import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { repoRoot } from "@org/gate-kit";
import { runCli, sandbox } from "@org/gate-kit/testing";

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

const ROOT = repoRoot();
const CLI = "tools/pii-check/src/cli.ts";

/**
 * ★ `repoRoot()` 穿過 pnpm 的 symlink 之後仍然落在 repo 根。
 *
 * workspace 的每個相依都是 `node_modules/@org/gate-kit -> ../../../gate-kit`
 * 的軟連結。Node 解析時若回報的是**連結路徑**而不是真實路徑，
 * `import.meta.url` 會落在 `node_modules` 底下，`../../../..` 就會算到別的
 * 地方 —— 而錯的那個根仍然是一個存在的目錄，掃起來不會拋錯，只是掃錯東西
 * 然後回報綠燈。這條測試住在這裡而不是 gate-kit 裡，因為只有真的宣告了
 * 相依的 package 才有那個 symlink 可穿。
 */
describe("repoRoot 穿過 workspace symlink", () => {
  it("★ 與這個檔案自己推導出來的根相同", () => {
    expect(ROOT).toBe(resolve(fileURLToPath(import.meta.url), "../../../.."));
  });
});

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
    const actual = runCli(CLI);
    const scanned = /掃了 (\d+) 個檔案/.exec(actual.stdout)?.[1];
    expect(scanned, `工具沒有回報掃了幾個：\n${actual.output}`).toBeDefined();
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
    const result = runCli(CLI);
    expect(result.status, result.output).toBe(0);
  });

  it("★ 通過訊息要講出偵測不到什麼 —— 否則綠燈會被讀成「沒有個資」", () => {
    expect(runCli(CLI).stdout).toContain("姓名抓不到");
  });

  it("🔴 塞一筆真的進去 → 紅", () => {
    const box = sandbox({ prefix: "pii-check-" });
    // 湊滿下限，否則會先被 too-few-files 擋下 —— 那樣就不算證明「偵測得到」。
    for (let at = 0; at <= MINIMUM_SCANNED; at += 1) {
      box.write(`p${at}/tests/a.test.ts`, "// 乾淨\n");
    }
    box.write("p0/tests/a.test.ts", `const id = "${VALID_ID}";\n`);
    // 例外指向的檔案在這個暫存 repo 裡不存在，stale-exemption 一定會有一條；
    // 這裡驗的是**另外那一條**確實出現了。
    const result = runCli(CLI, ["--root", box.root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("national-id");
    expect(result.stderr).toContain("p0/tests/a.test.ts");
  });
});

/**
 * 不認得的旗標必須紅 —— 這條是被一次真實事故逼出來的。
 *
 * C52 拿掉 `--masking` 之後，`tier2-security.yml` 裡那個步驟被留了下來。
 * 當時這支 CLI 只找 `--root`、其餘無視，於是那一步安靜地把 ⑥ 又掃了一次、
 * 回傳 0 —— CI 上是一個叫「個資：畫面上必須隱碼」的綠燈，而 ⑨ 早就沒有
 * 任何東西在守。PR 就是這樣全綠合進來的。
 *
 * 修的是**類別**不是那一次：下一個被拿掉的旗標會用一模一樣的方式溜過去。
 */
describe("🔴 不認得的旗標", () => {
  it("`--masking`（已移除）→ 紅，不得靜靜當成一次普通掃描", () => {
    const result = runCli(CLI, ["--masking"]);
    expect(result.status, `仍然綠燈 —— 被拿掉的旗標又會在 CI 裡假裝成一道檢查`).toBe(1);
    expect(result.stderr).toContain("--masking");
  });

  it("任何沒見過的旗標都一樣 → 紅", () => {
    expect(runCli(CLI, ["--nope"]).status).toBe(1);
  });

  it("★ 訊息要說得出「為什麼這會紅」，不只是「不認得」", () => {
    // 讀到這條訊息的人多半正在 CI 上看紅燈。少了原因，
    // 最短的修法是把旗標加回 KNOWN_FLAGS —— 那正好是錯的方向。
    expect(runCli(CLI, ["--masking"]).stderr).toContain("綠燈");
  });

  it("★ 對照組：認得的旗標照常運作", () => {
    // 少了這條，一個「什麼旗標都紅」的實作也會讓上面三條全過。
    const box = sandbox({ prefix: "pii-check-flag-" });
    for (let at = 0; at <= MINIMUM_SCANNED; at += 1) {
      box.write(`p${at}/tests/a.test.ts`, "// 乾淨\n");
    }
    expect(runCli(CLI, ["--root", box.root]).stderr).not.toContain("不認得的旗標");
  });
});
