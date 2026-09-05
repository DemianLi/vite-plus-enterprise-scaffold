import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { sandbox } from "../src/testing.ts";
import { walk } from "../src/walk.ts";

let root: string;

beforeAll(() => {
  const files: Record<string, string> = {};
  for (const file of [
    "src/a.ts",
    "src/b.vue",
    "src/notes.md",
    "src/deep/c.ts",
    "node_modules/evil.ts",
    ".git/config.ts",
    "dist/bundle.ts",
    ".vite-plus/cache.ts",
  ]) {
    files[file] = "// x\n";
  }
  root = sandbox({ prefix: "gate-kit-walk-", files, lifetime: "all" }).root;
});

describe("walk", () => {
  it("回傳的是相對於 root 的路徑，不是絕對路徑", () => {
    const found = walk(root, {
      skip: ["node_modules", ".git", "dist", ".vite-plus"],
      extensions: [".ts"],
    });
    expect(found).toContain(join("src", "a.ts"));
    expect(found.every((path) => !path.startsWith("/"))).toBe(true);
  });

  it("skip 比對整個目錄名，而且會遞迴到子目錄", () => {
    const found = walk(root, {
      skip: ["node_modules", ".git", "dist", ".vite-plus"],
      extensions: [".ts"],
    });
    expect(found.sort()).toEqual([join("src", "a.ts"), join("src", "deep", "c.ts")].sort());
  });

  it("extensions 是後綴比對，空陣列＝不過濾", () => {
    const filtered = walk(root, {
      skip: ["node_modules", ".git", "dist", ".vite-plus"],
      extensions: [".vue", ".md"],
    });
    expect(filtered.sort()).toEqual([join("src", "b.vue"), join("src", "notes.md")].sort());

    const everything = walk(root, {
      skip: ["node_modules", ".git", "dist", ".vite-plus"],
      extensions: [],
    });
    expect(everything).toHaveLength(4);
  });

  /**
   * ★ 沒有這條的話，`skipDotDirs` 寫成永遠 true 或永遠 false 都不會有測試變紅 ——
   * 而八份清單裡正好有兩份靠它、六份不靠。
   */
  it("★ skipDotDirs 只影響點開頭的目錄，其餘不變", () => {
    const options = { skip: ["node_modules", "dist"], extensions: [".ts"] } as const;
    const withDots = walk(root, options);
    const withoutDots = walk(root, { ...options, skipDotDirs: true });

    expect(withDots).toContain(join(".git", "config.ts"));
    expect(withDots).toContain(join(".vite-plus", "cache.ts"));
    expect(withoutDots).not.toContain(join(".git", "config.ts"));
    expect(withoutDots).not.toContain(join(".vite-plus", "cache.ts"));
    expect(withoutDots).toContain(join("src", "a.ts"));
  });

  it("★ skip 不套用在檔案上 —— 它比對的是目錄名", () => {
    const file = join(root, "src", "dist");
    writeFileSync(file, "// 名字剛好叫 dist 的檔案\n");
    try {
      expect(walk(root, { skip: ["dist"], extensions: [] })).toContain(join("src", "dist"));
    } finally {
      rmSync(file, { force: true });
    }
  });
});
