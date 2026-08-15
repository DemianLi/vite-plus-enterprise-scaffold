import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLockfile } from "../src/lockfile.ts";

/**
 * 供應鏈閘門的**反向測試**，優先補的是守著 Trivy 的那一道。
 *
 * ── 為什麼從這裡開始 ────────────────────────────────────────────────
 *
 * `tools/compliance` 的對照表指出：Trivy SCA 是**唯一**直接對得上
 * 《數位經濟辦法》§11 II ③「定期檢測並因應系統漏洞」的閘門。
 * 而它有兩個已知的失明模式，兩個都是**綠燈狀態下掃 0 個套件**：
 *
 *   C33  `TRIVY_INCLUDE_DEV_DEPS` 沒設 → Trivy 印一行 INFO 然後給出 0 個 component。
 *        這個 repo 是腳手架，工具鏈全是 dev 相依，抑制掉等於什麼都沒掃。
 *   C34  `pnpm-lock.yaml` 是**兩份 YAML 文件**，Trivy 只解第一份（pnpm 自己的 19 個）。
 *
 * 真正擋下這一整類問題的不是那兩個修法，是 `--verify-sbom` ——
 * 它比對兩個獨立來源對同一份 lockfile 的計數。**而它自己從沒被證明過會紅。**
 *
 * ── 這支測試沒有證明什麼 ────────────────────────────────────────────
 *
 * 它**不**證明 Trivy 發現 CVE 時會讓 CI 紅。那需要一份帶已知 CVE 的
 * fixture ＋ CI 裡真的跑 Trivy，而那種 fixture 會在 CVE 被修掉的那天
 * 因為錯誤的理由變綠。對照表上 `trivy-sca` 因此仍然是「未證明」——
 * 那一格是誠實的，不要拿這支測試去填它。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CLI = join(ROOT, "tools/supply-chain/src/cli.ts");
const WORKFLOW = join(ROOT, ".github/workflows/tier2-security.yml");

/** lockfile 實際有幾個套件。SBOM 的門檻由它推導，不寫死。 */
const LOCK_PACKAGES = parseLockfile(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8")).packages
  .length;

let sandbox: string | undefined;

afterEach(() => {
  if (sandbox !== undefined) rmSync(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "supply-chain-negative-"));
  sandbox = dir;
  return dir;
}

interface Result {
  readonly red: boolean;
  readonly output: string;
}

function run(args: readonly string[]): Result {
  const result = spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
  return { red: result.status !== 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** 寫一份只有 component 數有意義的 CycloneDX 骨架。 */
function writeSbom(dir: string, componentCount: number): string {
  const path = join(dir, "sbom.cdx.json");
  writeFileSync(
    path,
    JSON.stringify({
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      components: Array.from({ length: componentCount }, (_, index) => ({
        type: "library",
        name: `pkg-${index}`,
        version: "1.0.0",
      })),
    }),
  );
  return path;
}

describe("SBOM 完整性檢查：Trivy 的兩個失明模式", () => {
  it("🔴 C33 的症狀 —— 掃描器抑制了 dev 相依，SBOM 是空的 → 紅", () => {
    const result = run(["--verify-sbom", writeSbom(makeSandbox(), 0)]);

    expect(result.red, `空 SBOM 竟然過了 —— D13 的修補 SLA 沒有東西在把關\n${result.output}`).toBe(
      true,
    );
    // 訊息必須指出**原因**，否則看到紅燈的人會以為是掃描器壞了。
    expect(result.output).toContain("devDependency");
  });

  it("🔴 C34 的症狀 —— 只解到 lockfile 的第一份文件（19 個）→ 紅", () => {
    const result = run(["--verify-sbom", writeSbom(makeSandbox(), 20)]);

    expect(result.red, `只掃到 20 個竟然過了\n${result.output}`).toBe(true);
    expect(result.output).toContain("明顯少於");
  });

  it("★ 數量正確時放行（對照組）", () => {
    const result = run(["--verify-sbom", writeSbom(makeSandbox(), LOCK_PACKAGES)]);
    expect(result.red, result.output).toBe(false);
  });

  it("★ 略少於 lockfile 不得誤擋 —— 掃描器與本工具的計數本來就不會完全一致", () => {
    // 誤擋這一種，第一天就會有人把門檻調到 0，於是這道檢查等於沒有。
    const result = run(["--verify-sbom", writeSbom(makeSandbox(), LOCK_PACKAGES - 5)]);
    expect(result.red, `誤擋 —— 這道檢查會被調鬆然後廢掉\n${result.output}`).toBe(false);
  });

  it("SBOM 檔案不存在 → 紅（綠燈但沒有 SBOM，比紅燈更糟）", () => {
    const result = run(["--verify-sbom", join(makeSandbox(), "nope.json")]);

    expect(result.red).toBe(true);
    expect(result.output).toContain("找不到 SBOM");
  });

  it("--verify-sbom 後面沒接路徑 → 紅", () => {
    expect(run(["--verify-sbom"]).red).toBe(true);
  });
});

describe("--split-lockfile：C34 的修法本身要能被驗", () => {
  it("拆出兩份文件，各自是一個掃描器認得的目錄", () => {
    const dir = makeSandbox();
    const result = run(["--split-lockfile", dir]);

    expect(result.red, result.output).toBe(false);
    expect(readdirSync(dir).sort()).toEqual(["doc1", "doc2"]);
    for (const doc of ["doc1", "doc2"]) {
      expect(existsSync(join(dir, doc, "pnpm-lock.yaml"))).toBe(true);
      // 有些掃描器要看到 package.json 才認定這是個 JS 專案。
      expect(existsSync(join(dir, doc, "package.json"))).toBe(true);
    }
  });

  it("🔴 第二份文件才是專案的相依 —— 只拆出第一份等於沒解決 C34", () => {
    const dir = makeSandbox();
    run(["--split-lockfile", dir]);

    const first = parseLockfile(readFileSync(join(dir, "doc1/pnpm-lock.yaml"), "utf8")).packages
      .length;
    const second = parseLockfile(readFileSync(join(dir, "doc2/pnpm-lock.yaml"), "utf8")).packages
      .length;

    // doc1 是 pnpm 自己（R5，十幾個），doc2 是專案的相依樹（五百多個）。
    // 這一條釘住的正是 C34 的症狀：只看到第一份時是 19 個。
    expect(first).toBeLessThan(50);
    expect(second).toBeGreaterThan(400);

    // ⚠️ 拆開後的和**比去重後的總數多**，而不是相等 ——
    // 有套件同時住在兩份文件裡（目前是 detect-libc，pnpm 自己與專案都用它）。
    // 這正是 `--manifest` 把那一類標成 `both`、註明「分批鏡像時兩批都要進」的原因。
    // 第一版寫成相等，於是這條測試紅了 —— 紅得對，它抓到的是我對 lockfile 的誤解。
    const inBothDocuments = first + second - LOCK_PACKAGES;
    expect(inBothDocuments).toBeGreaterThanOrEqual(0);
    expect(inBothDocuments).toBeLessThan(first);
  });

  it("--split-lockfile 後面沒接目錄 → 紅", () => {
    expect(run(["--split-lockfile"]).red).toBe(true);
  });
});

/**
 * C33 與 C34 都不是程式碼寫錯，是 **workflow 少了一行設定**。
 * 那種變更在 code review 上看起來完全無害，而後果是掃描器安靜地失明。
 *
 * 所以這幾條驗的是設定沒有漂掉。它們不是「反向測試」——
 * 反向測試證明閘門會紅，這幾條證明**閘門還在**。
 */
describe("Tier 2 workflow 的設定沒有漂掉", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");

  it("兩個 Trivy 步驟都設了 TRIVY_INCLUDE_DEV_DEPS", () => {
    // 少了它，SBOM 與漏洞掃描都會回綠燈而掃 0 個套件（C33）。
    const occurrences = workflow.split('TRIVY_INCLUDE_DEV_DEPS: "true"').length - 1;
    expect(occurrences, "SBOM 與 SCA 兩步都需要這一行").toBe(2);
  });

  it("SCA 掃描發現漏洞時會讓 job 失敗", () => {
    expect(workflow).toContain('exit-code: "1"');
    expect(workflow).toContain("severity: HIGH,CRITICAL");
  });

  it("掃的是拆開後的目錄，不是原始 lockfile", () => {
    expect(workflow).toContain("--split-lockfile .scan");
    expect(workflow).toContain("scan-ref: .scan");
  });

  it("🔴 --verify-sbom 那一步必須留著 —— 它才是真正擋下這一類問題的東西", () => {
    // TRIVY_INCLUDE_DEV_DEPS 只把 0 變成 20，問題還在但更難發現。
    expect(workflow).toContain("--verify-sbom sbom.cdx.json");
  });

  it("每日排程還在 —— 沒有它，三個月沒人動的專案就三個月沒掃過", () => {
    expect(workflow).toContain('cron: "0 21 * * *"');
  });
});

describe("repo 本身沒有被動到", () => {
  it("跑完之後供應鏈閘門仍然是綠的", () => {
    run(["--verify-sbom", writeSbom(makeSandbox(), 0)]);
    expect(run([]).red, "反向測試把 repo 弄壞了").toBe(false);
  });
});
