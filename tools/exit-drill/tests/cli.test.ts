import { describe, expect, it } from "vitest";

import { runCli, sandbox, type Sandbox } from "@org/gate-kit/testing";

import type { Evidence } from "../src/freshness.ts";

const CLI = "tools/exit-drill/src/cli.ts";

/**
 * 這支 CLI 在 C184 之前**沒有任何測試 spawn 它**：六支測試檔全是純函式，而退出面掃描
 *（這道閘門存在的理由）零反向測試 —— 把 `leaks.push` 刪掉，改前變異零紅（C184 §六 M1）。
 * `--root` 是為了這一格開的，不是為了彈性（同 `tools/conformance` 檔頭那段話）。
 *
 * 副本走 `copy:`（版控檔）不走手寫：plugin 帳目與相依帳目在靜態半前面，一份手拼的
 * 副本會先紅在那兩關，而那不是這裡要問的。
 */
const TREE = ["apps/console", "platform", "features", "vite.config.ts"];

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** 通過前兩關（存在、pass）而**沒有** `treeHash` 的證據：走到指紋時判 `unrecorded`。 */
function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    lastRun: daysAgo(1),
    result: "pass",
    replaced: { "vite-plus": "0.0.0" },
    upstream: {},
    exitSurface: ["vite.config.ts", "apps/console/vite.config.ts"],
    durationSeconds: 1,
    tests: 1,
    testFiles: 1,
    expectedFailures: 0,
    note: "fixture",
    ...overrides,
  };
}

function copy(options: { evidence?: Evidence | null; git?: boolean } = {}): Sandbox {
  const files: Record<string, string> = {};
  if (options.evidence !== null) {
    files["tools/exit-drill/evidence.json"] = JSON.stringify(options.evidence ?? evidence());
  }
  return sandbox({ copy: TREE, files, git: options.git ?? true, prefix: "exit-drill-" });
}

describe("退出面掃描 —— 這道閘門的第一條反向測試", () => {
  it("★ 副本裡一支切片 import 了 vite-plus：紅，而且點名那個檔", () => {
    const box = copy();
    box.write("features/zzz/src/leak.ts", 'import { defineConfig } from "vite-plus";\n');
    const result = runCli(CLI, ["--root", box.root]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("退出面擴大");
    expect(result.output).toContain("features/zzz/src/leak.ts");
  });

  it("對照組：乾淨的副本走完四關，結束碼 0", () => {
    const result = runCli(CLI, ["--root", copy().root]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("✓ D2 退出面未擴大");
    expect(result.output).toContain("✓ plugin 帳目相符");
    expect(result.output).toContain("✓ 測試相依帳目相符");
  });
});

describe("--require-fresh 從旗標到判斷表的那一行傳遞（C183 §三 承認的零）", () => {
  it("★ 證據 121 天：不帶旗標 0，帶旗標 1 —— 同一份副本兩個答案", () => {
    const box = copy({ evidence: evidence({ lastRun: daysAgo(121) }) });
    const lenient = runCli(CLI, ["--root", box.root]);
    expect(lenient.status, lenient.output).toBe(0);
    expect(lenient.output).toContain("已過期");
    expect(lenient.output).toContain("上限 120 天");

    const strict = runCli(CLI, ["--root", box.root, "--require-fresh"]);
    expect(strict.status, strict.output).toBe(1);
    expect(strict.output).toContain("已過期");
  });

  it("沒有證據檔：不帶旗標 warn 而 0，帶旗標 1", () => {
    const box = copy({ evidence: null });
    const lenient = runCli(CLI, ["--root", box.root]);
    expect(lenient.status, lenient.output).toBe(0);
    expect(lenient.output).toContain("尚未跑過完整退出演練");

    const strict = runCli(CLI, ["--root", box.root, "--require-fresh"]);
    expect(strict.status, strict.output).toBe(1);
  });

  it("舊格式（沒有 treeHash）：指紋真的經過副本的 git ls-files，判 unrecorded", () => {
    const box = copy();
    const lenient = runCli(CLI, ["--root", box.root]);
    expect(lenient.status, lenient.output).toBe(0);
    expect(lenient.output).toContain("沒有記樹的指紋");

    const strict = runCli(CLI, ["--root", box.root, "--require-fresh"]);
    expect(strict.status, strict.output).toBe(1);
    expect(strict.output).toContain("沒有記樹的指紋");
  });
});

describe("指紋的清單走版控（C149）—— 副本不是 git 時列舉壞了，兩種旗標都紅", () => {
  it("非 git 副本：0 個檔案 → empty → 1，`--require-fresh` 與否無關", () => {
    // C149 為「列舉本身壞了」寫的那則紅燈，CLI 層在這之前一次都沒到過。
    const box = copy({ git: false });
    for (const args of [[], ["--require-fresh"]]) {
      const result = runCli(CLI, ["--root", box.root, ...args]);
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain("0 個檔案");
    }
  });
});

describe("--full 只跑真樹", () => {
  it("與 --root 一起給：紅，一句話說為什麼", () => {
    const result = runCli(CLI, ["--full", "--root", copy().root]);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("--full 只跑真樹");
  });
});
