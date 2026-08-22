import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PHANTOM_REMEDIATION, phantomEntryPoints, trackedPackageDirs } from "../src/tracked.ts";

/**
 * 「進得了基準的東西必須在版控裡」（C98）。
 *
 * ⚠️ 用**臨時的 git repo**，不碰真的樹 —— 這道檢查刻意只在 `PLATFORM` 是真正的
 * `platform/` 時開（見 `tracked.ts` 檔頭），所以 `--platform` 那條測試路徑
 * 印不出它。而在真 `platform/` 底下造一個假目錄去測，被中斷時會留下殘骸，
 * 讓所有人的閘門紅在一個不存在的問題上。`scope-check` 的測試用同一個做法。
 */
function repo(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "api-surface-tracked-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function pkg(root: string, name: string): void {
  mkdirSync(join(root, "platform", name, "src"), { recursive: true });
  writeFileSync(join(root, "platform", name, "package.json"), '{ "name": "@x/a" }');
  writeFileSync(join(root, "platform", name, "src/index.ts"), "export const a = 1;\n");
}

describe("trackedPackageDirs：問 index，不問磁碟", () => {
  it("🔴 磁碟上有、版控裡沒有 → 不在集合裡", () => {
    const { root, cleanup } = repo();
    try {
      pkg(root, "ghost");
      expect(trackedPackageDirs(root, join(root, "platform"))).toEqual(new Set());
    } finally {
      cleanup();
    }
  });

  it("★ staged 就算數（不必先 commit）—— C73 選 index 而不是 HEAD 的首要理由", () => {
    /**
     * `ls-tree HEAD` 答的是「上一個 commit 裡有什麼」。用它的話，新增一個套件、
     * `git add` 了、跑 `vpr ready` —— 是綠的，要等 commit 完才紅。
     * 而 `vpr ready` 存在的全部理由就是「推上去之前先知道」。
     */
    const { root, cleanup } = repo();
    try {
      pkg(root, "staged");
      execFileSync("git", ["add", "platform/staged"], { cwd: root, stdio: "ignore" });
      expect(trackedPackageDirs(root, join(root, "platform"))).toEqual(new Set(["staged"]));
    } finally {
      cleanup();
    }
  });

  it("★ 只認 platform/<name>/package.json 那一層", () => {
    // 套件內部的 package.json（例如 node_modules 或巢狀 workspace）不是進入點。
    const { root, cleanup } = repo();
    try {
      pkg(root, "real");
      mkdirSync(join(root, "platform/real/nested/deep"), { recursive: true });
      writeFileSync(join(root, "platform/real/nested/deep/package.json"), "{}");
      execFileSync("git", ["add", "platform"], { cwd: root, stdio: "ignore" });
      expect(trackedPackageDirs(root, join(root, "platform"))).toEqual(new Set(["real"]));
    } finally {
      cleanup();
    }
  });

  it("🔴 git 答不出來 → 丟例外，**不是**回報「零個被追蹤」", () => {
    /**
     * ⚠️ 這是這一則最重要的一條。回報空集合的話，每一個進入點都會變成幽靈，
     * 閘門紅一整片 —— 而真正壞掉的是儀器。`scope-check/tree.ts` 對同一件事
     * 有同一條規矩，`doc-facts` 的 `no-documents` 也是（「零個不符不是通過」）。
     */
    const root = mkdtempSync(join(tmpdir(), "api-surface-nogit-"));
    try {
      mkdirSync(join(root, "platform"), { recursive: true });
      expect(() => trackedPackageDirs(root, join(root, "platform"))).toThrow(/git ls-files/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("phantomEntryPoints", () => {
  it("🔴 磁碟上有、版控裡沒有的會被指出來", () => {
    expect(phantomEntryPoints(["a", "ghost", "b"], new Set(["a", "b"]))).toEqual(["ghost"]);
  });

  it("★ 全部都在版控裡 → 空陣列", () => {
    expect(phantomEntryPoints(["a", "b"], new Set(["a", "b", "unused"]))).toEqual([]);
  });

  it("★ 多個幽靈全部列出，不是只報第一個", () => {
    // 只報第一個的話，清完一個要再跑一次才知道還有 —— 而每一次都是一段
    // 「跑 --update 就綠了」的誘惑。
    expect(phantomEntryPoints(["z", "a"], new Set())).toEqual(["a", "z"]);
  });
});

describe("紅燈訊息", () => {
  it("★ 要說得出那條路的盡頭是什麼", () => {
    // 只說「不在版控裡」的話，讀的人的下一個動作就是跑 --update（它會變綠）。
    expect(PHANTOM_REMEDIATION).toContain("--update");
    expect(PHANTOM_REMEDIATION).toContain("沒有合法出口");
  });

  it("★ 要給得出合法出路，而且兩條都要有", () => {
    expect(PHANTOM_REMEDIATION, "沒講 git add").toContain("git add");
    expect(PHANTOM_REMEDIATION, "沒講移出 platform/").toContain("移出");
  });

  it("🔴 要講明 staged 就算數", () => {
    // 不講的話，讀的人會先 commit 才重跑 —— 而 vpr ready 的用途是推上去之前先知道。
    expect(PHANTOM_REMEDIATION).toContain("staged");
  });

  it("🔴 要講明 .gitignore 不是出路", () => {
    // 最直覺的錯誤動作：把它加進 .gitignore。那不會讓它離開磁碟，
    // 而這道檢查看的是版控 —— 加了照樣紅，而且理由看起來莫名其妙。
    expect(PHANTOM_REMEDIATION).toContain(".gitignore");
  });
});
