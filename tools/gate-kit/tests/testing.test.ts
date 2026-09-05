import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { repoRoot, runCli, sandbox } from "../src/testing.ts";

/**
 * harness 自己的測試。它守的是「建樹、跑、清」三件事的**政策**，因為那三件事
 * 從此只寫在一個地方 —— 這裡錯了，17 支消費端會一起錯而且方向一致。
 *
 * ⚠️ 消費端的斷言不在這裡重測。這支檔案不知道 conformance 的規則長什麼樣。
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");

describe("sandbox · 建樹", () => {
  it("files：相對路徑寫進去，中間目錄自動建", () => {
    const box = sandbox({ files: { "a/b/c.txt": "深" } });
    expect(box.read("a/b/c.txt")).toBe("深");
  });

  it("write 之後 read 讀得到新內容 —— 反向測試竄改 fixture 靠這一條", () => {
    const box = sandbox({ files: { "x.ts": "before" } });
    box.write("x.ts", "after");
    expect(box.read("x.ts")).toBe("after");
  });

  it("copy：只複製版控裡的檔，node_modules 不進來", () => {
    const box = sandbox({ copy: ["tools/gate-kit"] });
    expect(box.read("tools/gate-kit/src/root.ts")).toContain("repoRoot");
    expect(existsSync(join(box.root, "tools/gate-kit/node_modules"))).toBe(false);
  });

  it("🔴 copy 指到沒有版控檔的路徑 → 丟例外，不給一個空沙盒", () => {
    // 空沙盒與複製成功長得一樣；被測的閘門對空樹回綠是這棵樹付過學費的形狀。
    expect(() => sandbox({ copy: ["這個路徑不存在"] })).toThrow("沒有任何版控裡的檔");
  });

  it("git：init ＋ add -A，之後 ls-files 看得到 fixture", () => {
    const box = sandbox({ files: { "tracked.ts": "" }, git: true });
    expect(box.git(["ls-files"]).trim()).toBe("tracked.ts");
  });

  it("🔴 git 非零退出 → 丟例外，不回一個空字串", () => {
    const box = sandbox({ files: { f: "" } });
    expect(() => box.git(["ls-files"])).toThrow("失敗");
  });

  it("within：沙盒建在指定目錄底下（vue-typecheck 那條例外的入口）", () => {
    const parent = sandbox().root;
    const box = sandbox({ within: parent, prefix: "inner-" });
    expect(box.root.startsWith(join(parent, "inner-"))).toBe(true);
  });
});

/**
 * 清理是這支模組存在的一半理由，所以它要被**實測**，不是相信。
 * 兩條 it 刻意有順序：前一條留下路徑，後一條驗它已經不在。
 */
let leftBehind = "";

describe("sandbox · 清理", () => {
  it("（佈置）建一個沙盒，記下路徑", () => {
    leftBehind = sandbox({ files: { f: "" } }).root;
    expect(existsSync(leftBehind)).toBe(true);
  });

  it("★ 前一個 it 的沙盒在這個 it 開始前已經被清掉", () => {
    expect(leftBehind, "佈置那條沒跑到").not.toBe("");
    expect(existsSync(leftBehind)).toBe(false);
  });
});

describe("runCli", () => {
  it("四格都回，output 是 stdout 接 stderr，status 是子行程的退出碼", () => {
    const box = sandbox({
      files: {
        "cli.mjs":
          'process.stdout.write("out\\n"); process.stderr.write("err\\n"); process.exit(3);',
      },
    });
    const result = runCli(join(box.root, "cli.mjs"));
    expect(result).toEqual({ status: 3, stdout: "out\n", stderr: "err\n", output: "out\nerr\n" });
  });

  it("★ 相對路徑以 repo 根解析、cwd 是 repo 根、不補 --root", () => {
    // 三件事一條驗：閘門對「在哪裡」的假設以 repo 根為準；沙盒要走 --root 不走 cwd；
    // C126 之後八支 CLI 拒絕不認得的旗標，一個「貼心」補上的 --root 會讓不吃它的那支變紅。
    const result = runCli("tools/gate-kit/tests/fixtures/echo-argv.mjs", ["--only-this"]);
    expect(JSON.parse(result.stdout)).toEqual({ cwd: repoRoot(), argv: ["--only-this"] });
  });
});

describe("repoRoot re-export", () => {
  it("與 ./root.ts 同一個答案，測試只需要 import 一個地方", () => {
    expect(repoRoot()).toBe(resolve(HERE, "../../.."));
  });
});
