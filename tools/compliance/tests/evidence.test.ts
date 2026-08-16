import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GATES } from "../src/map.ts";
import {
  RETENTION_EVIDENCE,
  renderEvidenceManifest,
  verifyEvidence,
  type EvidenceFile,
} from "../src/evidence.ts";

/**
 * §16 證據清單的**反向測試**。
 *
 * ── 這張清單失效的方式有兩種，而且方向相反 ──────────────────────────
 *
 * **指向空氣**：清單列了一個不存在的檔案。交接對象照著它去建保存排程，
 * 排程裡就有一格永遠是空的 —— 而且沒有人會發現，因為誰都不會去 `ls`。
 *
 * **漏收一份**：新工具產出了證據檔，但沒有列進清單。那份東西不會進保存
 * 排程，五年後要調閱時才發現不在。
 *
 * 第二種比較常發生（加工具的人不會想到要來改這裡），第一種比較危險。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CLI = join(ROOT, "tools/compliance/src/cli.ts");

const FILE: EvidenceFile = {
  path: "tools/demo/evidence.json",
  maintainedBy: "compliance",
  proves: "示範",
  retention: "version-control",
};

const always = () => true;
const never = () => false;

describe("對照組", () => {
  it("★ 真的清單對真的檔案系統 → 零問題", () => {
    const problems = verifyEvidence(RETENTION_EVIDENCE, (path) => existsSync(join(ROOT, path)));
    expect(problems.map((problem) => problem.detail).join("\n")).toBe("");
  });

  it("清單不是空的 —— 空清單當然零問題，那是假綠燈", () => {
    expect(RETENTION_EVIDENCE.length).toBeGreaterThan(5);
  });
});

describe("🔴 指向空氣", () => {
  it("宣告的檔案不存在 → 紅", () => {
    expect(verifyEvidence([FILE], never).map((problem) => problem.kind)).toContain("missing-file");
  });

  it("★ CI artifact 不受這條約束 —— 它本來就不在工作目錄裡", () => {
    // 少了這個例外，sbom.cdx.json 會讓這道閘門永遠紅，
    // 而永遠紅的閘門會被關掉。
    const artifact: EvidenceFile = { ...FILE, path: "sbom.cdx.json", retention: "ci-artifact" };
    expect(verifyEvidence([artifact], never).map((problem) => problem.kind)).not.toContain(
      "missing-file",
    );
  });
});

describe("🔴 漏收一份", () => {
  it("閘門有證據檔但清單沒收 → 紅", () => {
    // 這是加新工具時最容易漏的一步。
    const problems = verifyEvidence([], always);
    const kinds = problems.map((problem) => problem.kind);
    expect(kinds).toContain("gate-evidence-not-listed");
  });

  it("★ renovate.json 刻意不算證據 —— 它是設定", () => {
    // 它說明我們打算怎麼因應，不記錄我們因應了什麼。
    const problems = verifyEvidence([], always);
    expect(problems.some((problem) => problem.detail.includes("renovate.json"))).toBe(false);
  });
});

describe("🔴 沒有閘門在維護的檔案", () => {
  it("maintainedBy 指向不存在的閘門 → 紅", () => {
    // 沒有閘門在比對的檔案會靜靜地與現實脫節，而清單上還掛著它。
    const orphan: EvidenceFile = { ...FILE, maintainedBy: "does-not-exist" };
    const problems = verifyEvidence([orphan], always);
    expect(problems.map((problem) => problem.kind)).toContain("listed-but-no-gate");
  });

  it("★ 清單裡每一份都指向真的閘門", () => {
    const ids = new Set(GATES.map((gate) => gate.id));
    for (const file of RETENTION_EVIDENCE) {
      expect(ids, `${file.path} 的 maintainedBy`).toContain(file.maintainedBy);
    }
  });

  it("★ supply-chain 維護兩份基線 —— Gate.evidence 只記得住一份", () => {
    // 這個欄位是被自己的檢查逼出來的：對照表**低估**了自己有的證據。
    const bySupplyChain = RETENTION_EVIDENCE.filter((file) => file.maintainedBy === "supply-chain");
    expect(bySupplyChain.map((file) => file.path).sort()).toEqual([
      "tools/supply-chain/inventory.json",
      "tools/supply-chain/provenance.json",
    ]);
  });
});

describe("交接用的表格", () => {
  it("每一份都寫了「證明什麼」—— 那是對方唯一會看的一欄", () => {
    for (const file of RETENTION_EVIDENCE) {
      expect(file.proves.length, file.path).toBeGreaterThan(10);
    }
  });

  it("🔴 到不了五年的那一份要標得出來", () => {
    // sbom.cdx.json 是唯一一份，而它是結構限制不是疏漏。
    // 表格裡不標的話，交接對象會以為整份清單都由 git 保存。
    //
    // ⚠️ 刻意不寫「以為 N 份都由 git 保存」——第一版寫了「八份」，
    // 而 C52 拿掉 csp-verify 的證據檔之後那個數字就錯了。
    // 註解裡的手寫計數沒有任何東西在守，寫了就是在等它過期。
    const table = renderEvidenceManifest(RETENTION_EVIDENCE);
    expect(table).toContain("CI artifact（90 天）⚠️");
    expect(table).toContain("sbom.cdx.json");
  });

  it("★ 目前只有一份到不了五年", () => {
    const short = RETENTION_EVIDENCE.filter((file) => file.retention === "ci-artifact");
    expect(short.map((file) => file.path)).toEqual(["sbom.cdx.json"]);
  });
});

describe("CLI", () => {
  function run() {
    return spawnSync("node", [CLI, "--evidence"], { cwd: ROOT, encoding: "utf8" });
  }

  it("--evidence 在這個 repo 是綠的", () => {
    const result = run();
    expect(result.status, `${result.stdout ?? ""}${result.stderr ?? ""}`).toBe(0);
  });

  it("★ 輸出要講出 §16 的三類裡只涵蓋一類", () => {
    // 少了這句，這張表會被讀成「§16 已經滿足」——
    // 而前兩類在後端與基礎設施，前端碰不到。
    expect(run().stdout).toContain("只涵蓋第三類");
  });

  it("★ 也要講出「證據跟著 repo 走」這個風險", () => {
    // git 是保存機制，但 repo 被刪或歷史被重寫，證據就沒了。
    // 那是組織要接的風險，不寫出來等於沒交接。
    expect(run().stdout).toContain("repo 被刪");
  });
});
