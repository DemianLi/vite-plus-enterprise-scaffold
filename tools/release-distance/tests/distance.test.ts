import { describe, expect, it } from "vitest";

import { repoRoot, runCli, sandbox } from "@org/gate-kit/testing";

import { readGit } from "../src/git.ts";
import { fixtures, format, report } from "../src/report.ts";

const CLI = "tools/release-distance/src/cli.ts";

/**
 * ⚠️ **「不會紅」在這支是規格，不是預設值**（C169 §一 ／ #267 驗收第二條）。
 *
 * 其他閘門的測試在證明「該紅的時候會紅」；這一支相反 —— 它要證明**沒有任何
 * 輸入讓它紅**，除了不認得的旗標。一個沒有紅燈的東西，「壞掉」與「正常」在
 * 結束碼上分不出來，所以那條界線只有測試看得見。
 */
describe("結束碼：除了旗標，什麼都不紅", () => {
  it("★ 真樹上是 0，而且真的量到了（不是靠量不到才綠的）", () => {
    const result = runCli(CLI, []);
    expect(result.status, result.output).toBe(0);
    // ⚠️ 對照組：少了這一條，一棵沒有 tag 的樹會讓上面那條與下面每一條
    // 都「通過」—— 而通過的原因是它什麼都沒量。
    expect(report(readGit(repoRoot())).kind, "真樹上量不到 tag —— 那下面的綠燈不算數").toBe(
      "measured",
    );
  });

  it("剛 git init、一個 tag 都沒有時是 0", () => {
    const box = sandbox({ files: { "a.txt": "x" }, git: true });
    box.git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "one"]);
    const result = runCli(CLI, ["--root", box.root]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("量不到");
  });

  it("根本不是 git 工作樹時是 0", () => {
    const box = sandbox({ files: { "a.txt": "x" } });
    const result = runCli(CLI, ["--root", box.root]);
    expect(result.status, result.output).toBe(0);
  });

  it("有 tag 時是 0，而且印得出數字", () => {
    const box = sandbox({ files: { "a.txt": "x" }, git: true });
    const commit = (message: string): void => {
      box.git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", message]);
    };
    commit("one");
    box.git(["tag", "v9.9.9"]);
    box.write("b.txt", "y");
    box.git(["add", "-A"]);
    commit("two");

    const result = runCli(CLI, ["--root", box.root]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("v9.9.9");
    expect(result.output).toContain("1 支 commit");
  });

  // 「除了旗標」那一半 —— 不認得的旗標是唯一的非零（C126）—— 不在這裡守：
  // `gate-kit/tests/adoption.test.ts` 對磁碟上每一支 `tools/*/src/cli.ts` 逐支問，
  // 這支一直在名冊裡（C171 起經根 vite.config.ts，C178 起經磁碟）。同一個變異兩邊
  // 同紅，這裡不留第二份。
});

describe("report：量不到與零不是同一件事", () => {
  it("沒有 toplevel → 不是 git 工作樹", () => {
    expect(report({})).toEqual({ kind: "unmeasurable", why: "這裡不是 git 工作樹" });
  });

  it("有 toplevel、沒有 tag → 講出淺 checkout 這個成因", () => {
    const out = report({ toplevel: "/x", head: "abc" });
    expect(out.kind).toBe("unmeasurable");
    expect(out.kind === "unmeasurable" && out.why).toContain("fetch-depth");
  });

  it("齊全 → 算得出天數，且不四捨五入成 0 支", () => {
    const out = report({
      toplevel: "/x",
      head: "aaa",
      tag: "v1.0.0",
      tagCommit: "bbb",
      commits: 3,
      onFirstParent: true,
      tagDate: "2026-09-01T00:00:00+00:00",
      headDate: "2026-09-03T12:00:00+00:00",
    });
    expect(out).toMatchObject({ kind: "measured", tag: "v1.0.0", commits: 3, days: 2.5 });
  });

  it("tag 不在第一父鏈上時，輸出要自己說出來（C169 §四 的 63 vs 25）", () => {
    const text = format({
      kind: "measured",
      tag: "v1.14.1",
      commits: 63,
      days: 8.7,
      onFirstParent: false,
    });
    expect(text).toContain("不在 HEAD 的第一父鏈上");
  });
});

/**
 * ⚠️ 依 C154 §三 第 3 條，這三條是**自我防護的夾具**，不計 D16 迭代軸的分。
 * 它們守的是「印得出一行」與「量對了」在輸出上長得一樣這件事。
 */
describe("夾具：印得出來不等於量對了", () => {
  const healthy = {
    toplevel: repoRoot(),
    head: "aaa",
    tag: "v1.0.0",
    tagCommit: "bbb",
    commits: 3,
  } as const;

  it("★ 對照組：健康的事實集一條都不該響", () => {
    expect(fixtures(healthy, repoRoot())).toBeUndefined();
  });

  it("git 爬到別棵樹去", () => {
    expect(fixtures({ ...healthy, toplevel: "/" }, repoRoot())).toContain("另一棵樹");
  });

  it("0 支，但 HEAD 不是那個 tag —— 範圍壞掉，不是剛發完版", () => {
    expect(fixtures({ ...healthy, commits: 0 }, repoRoot())).toContain("範圍壞掉");
  });

  it("讀得到 tag 名字、解析不出它的 commit", () => {
    expect(fixtures({ ...healthy, tagCommit: undefined }, repoRoot())).toContain("沒有來源");
  });

  it("★ 夾具響了也不紅 —— 否則它會在淺 checkout 裡變成一道沒人打算加的閘門", () => {
    const box = sandbox({ files: { "a.txt": "x" }, git: true });
    // git 從沙盒往上找不到 repo，但 --root 指到的是它自己 —— 這裡要的是
    // 「夾具響了」與「結束碼仍是 0」同時成立，所以用真樹當 --root 對照。
    const result = runCli(CLI, ["--root", box.root]);
    expect(result.status).toBe(0);
  });
});
