import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { repoRoot, runCli, sandbox } from "@org/gate-kit/testing";

import { FORK_MARKER, SELECTABLE, sideOf, targetScript } from "../src/select.ts";

const CLI = "tools/fork-select/src/cli.ts";

describe("辨別子（C217 §三）", () => {
  it("沒有標記檔＝上游", () => {
    expect(sideOf(sandbox({ prefix: "fork-select-" }).root)).toBe("upstream");
  });

  it("有標記檔＝fork", () => {
    const box = sandbox({ prefix: "fork-select-", files: { [FORK_MARKER]: "我們是 fork\n" } });
    expect(sideOf(box.root)).toBe("fork");
  });

  it("⚠️ 空檔也是 fork —— 內容不參與判定（C217 §十）", () => {
    // 內容一旦被讀，「空的標記檔」就會被判成上游，而那個方向是安靜的：
    // fork 跑了全部 15 道，紅在它不該管的東西上，而沒有任何訊息說為什麼。
    const box = sandbox({ prefix: "fork-select-", files: { [FORK_MARKER]: "" } });
    expect(sideOf(box.root)).toBe("fork");
  });

  // ⚠️ 刻意沒有「真的 repo 是上游」這一條：這個 package 下發，它的測試在 fork 裡也跑，
  // 而 fork 本來就有標記檔 —— 寫了 fork 就永遠紅。「上游不得有標記」由 tier1 那一步守
  // （C217 §八），不由測試守。
});

describe("選到的 script", () => {
  it("每個名字各有上游與 fork 兩條", () => {
    const targets = SELECTABLE.flatMap((name) =>
      (["upstream", "fork"] as const).map((side) => targetScript(name, side)),
    );
    expect(targets).toEqual(["gate:upstream", "gate:fork", "ready:upstream", "ready:fork"]);
  });

  it("真的 package.json 裡四條都在，而 gate／ready 經過 --no-cache 那一層交給選擇器", () => {
    const scripts = (
      JSON.parse(readFileSync(join(repoRoot(), "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    for (const name of SELECTABLE) {
      // ⚠️ 少了 `--no-cache` 那一層，`vpr gate` 開不起巢狀的 vp（見 cli.ts 檔頭）。
      expect(scripts[name], name).toBe(`vp run --no-cache ${name}:select`);
      expect(scripts[`${name}:select`], `${name}:select`).toBe(`node ${CLI} --script ${name}`);
      for (const side of ["upstream", "fork"] as const) {
        expect(scripts[targetScript(name, side)], `${name}:${side}`).toBeDefined();
      }
    }
  });
});

describe("呼叫方式錯了就紅", () => {
  it("沒給 --script", () => {
    const result = runCli(CLI, []);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("--script");
  });

  it("選擇器接不起來的名字", () => {
    const result = runCli(CLI, ["--script", "test"]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("「test」");
  });
});
