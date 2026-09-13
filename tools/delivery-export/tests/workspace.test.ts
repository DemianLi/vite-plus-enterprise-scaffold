import { describe, expect, it } from "vitest";

import { repoRoot } from "@org/gate-kit/testing";

import {
  closure,
  type Member,
  trackedFiles,
  workspaceGlobs,
  workspaceMembers,
} from "../src/workspace.ts";

const ROOT = repoRoot();

function member(
  dir: string,
  deps: Record<string, string> = {},
  devDeps: Record<string, string> = {},
): Member {
  return {
    dir,
    manifest: { name: `@org/${dir.split("/")[1]}`, dependencies: deps, devDependencies: devDeps },
  };
}

describe("白名單從相依圖推（C231 §四.2）", () => {
  // ⚠️ 真樹這一條只斷言 fork 裡也成立的性質：這支工具下發，它的測試在 fork 照跑，而 fork 會增刪
  // 切片。今天推出來的那 11 個（platform 那八個與 C231 手列的一致）是量測，記在 C248 §三。
  it("真樹：apps／features 全數出門、tools 一個都不出門、platform 至少走到一個", () => {
    const members = workspaceMembers(ROOT, trackedFiles(ROOT));
    const dirs = closure(members).map((m) => m.dir);
    const entries = members.filter((m) => /^(apps|features)\//.test(m.dir)).map((m) => m.dir);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(dirs).toContain(entry);
    expect(dirs.filter((dir) => dir.startsWith("tools/"))).toEqual([]);
    expect(dirs.some((dir) => dir.startsWith("platform/"))).toBe(true);
  });

  it("沿 devDependencies 也走：只以 devDep 被引用的那一個照樣出門", () => {
    const members = [
      member("apps/x", { "@org/p1": "workspace:*" }),
      member("platform/p1", {}, { "@org/p2": "workspace:*" }),
      member("platform/p2"),
      member("platform/p3"),
    ];
    expect(closure(members).map((m) => m.dir)).toEqual(["apps/x", "platform/p1", "platform/p2"]);
  });

  it("★ 拿掉一筆相依，集合跟著變小 —— 只驗「等於今天」的斷言在推導壞掉時照樣綠", () => {
    const members = [
      member("apps/x", { "@org/p1": "workspace:*" }),
      member("platform/p1"),
      member("platform/p2"),
    ];
    expect(closure(members).map((m) => m.dir)).toEqual(["apps/x", "platform/p1"]);
    const without = [member("apps/x"), member("platform/p1"), member("platform/p2")];
    expect(closure(without).map((m) => m.dir)).toEqual(["apps/x"]);
  });

  it("workspaceGlobs 只讀 packages: 那一段，註解與別段不算", () => {
    const yaml = [
      "packages:",
      "  - apps/*",
      "  # - old/*",
      '  - "tools/*"',
      "",
      "catalog:",
      "  - not/*",
    ].join("\n");
    expect(workspaceGlobs(yaml)).toEqual(["apps/*", "tools/*"]);
  });
});
