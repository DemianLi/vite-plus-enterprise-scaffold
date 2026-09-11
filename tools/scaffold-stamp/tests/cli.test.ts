import { symlinkSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { repoRoot, runCli, sandbox, type Sandbox } from "@org/gate-kit/testing";

import { FORK_MARKER } from "@org/fork-select";

const CLI = "tools/scaffold-stamp/src/cli.ts";

/**
 * 一棵最小的樹：根層兩份設定照抄真的（生效設定那一格要真的跑 `vp lint --print-config`），
 * 其餘是假的。`node_modules` 連回真樹 —— 同 `threshold-check` 的農場，沙盒建在 tmpdir，
 * 不建在 repo 裡（建在 repo 裡會讓那座農場間歇紅）。
 */
function tree(): Sandbox {
  const box = sandbox({
    prefix: "scaffold-stamp-",
    copy: ["vite.config.ts", "vite.scaffold.ts"],
    files: {
      ".gitignore": "node_modules\n",
      "package.json": JSON.stringify({
        type: "module",
        scripts: {
          gate: "vp run --no-cache gate:select",
          "ready:fork": "vp check && vp run test",
          conformance: "node tools/conformance/src/cli.ts",
          dev: "vp dev",
        },
      }),
      "tools/conformance/src/cli.ts": "export {};\n",
      "platform/ui/index.ts": "export const x = 1;\n",
      ".github/workflows/tier1.yml": "name: tier1\n",
      "features/order/src/api.ts": "export {};\n",
    },
    git: true,
  });
  symlinkSync(join(repoRoot(), "node_modules"), join(box.root, "node_modules"));
  return box;
}

function stamped(): Sandbox {
  const box = tree();
  const result = runCli(CLI, ["--update", "--root", box.root]);
  expect(result.status, result.output).toBe(0);
  return box;
}

function asFork(box: Sandbox): Sandbox {
  box.write(FORK_MARKER, "");
  return box;
}

const check = (box: Sandbox) => runCli(CLI, ["--root", box.root]);

describe("CLI", { timeout: 60_000 }, () => {
  it("上游蓋完章 → 綠，而且真的讀到生效設定", () => {
    const result = check(stamped());
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("✓ 腳手架的章相符（上游：4 個檔、3 條 script；生效設定");
  });

  it("⚠️ 還沒 git add 的新檔：--update 照樣寫章，但要點名它們", () => {
    // 這支工具自己的 8 支檔就是這樣第一次紅的：先重算、後 add，commit 之後閘門紅（C220 §三（五））。
    const box = tree();
    box.write("tools/y/src/new.ts", "export {};\n");
    const result = runCli(CLI, ["--update", "--root", box.root]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("還沒 git add 的檔不在章裡");
    expect(result.output).toContain("tools/y/src/new.ts");
  });

  it("🔴 fork 不得蓋章", () => {
    const result = runCli(CLI, ["--update", "--root", asFork(tree()).root]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("fork 不得蓋章");
  });

  it("🔴 fork 改了腳手架的檔 → 紅，訊息叫他還原而不是重算章", () => {
    const box = asFork(stamped());
    box.write("platform/ui/index.ts", "export const x = 2;\n");
    const result = check(box);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("腳手架的檔被改了：platform/ui/index.ts");
    expect(result.output).toContain("還原它們");
    expect(result.output).not.toContain("vpr scaffold-stamp-update");
  });

  it("🔴 上游改了腳手架的檔沒重算 → 紅，訊息叫他重算", () => {
    const box = stamped();
    box.write("platform/ui/index.ts", "export const x = 2;\n");
    const result = check(box);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("vpr scaffold-stamp-update");
  });

  it("🔴 fork 在 tools/ 加自己的工具 → 紅；放在 team-tools/ → 綠（Q33 的兩格對照）", () => {
    const inTools = asFork(stamped());
    inTools.write("tools/x/package.json", "{}\n");
    inTools.git(["add", "-A"]);
    expect(check(inTools).output).toContain("章裡沒有這個檔：tools/x/package.json");

    const outside = asFork(stamped());
    outside.write("team-tools/x/package.json", "{}\n");
    outside.git(["add", "-A"]);
    const result = check(outside);
    expect(result.status, result.output).toBe(0);
  });

  it("🔴 fork 在根層 spread 之後把 no-eval 關掉 → 紅，而 vite.scaffold.ts 一個位元組都沒動", () => {
    const box = asFork(stamped());
    box.write(
      "vite.config.ts",
      box
        .read("vite.config.ts")
        .replace("...scaffoldLint.rules,", '...scaffoldLint.rules,\n      "no-eval": "off",'),
    );
    const result = check(box);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("腳手架的規則被蓋掉了：no-eval");
    expect(result.output).not.toContain("腳手架的檔被改了");
  });
});
