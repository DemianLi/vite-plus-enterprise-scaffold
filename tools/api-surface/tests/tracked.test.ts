import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { type Sandbox, sandbox } from "@org/gate-kit/testing";

import {
  PHANTOM_REMEDIATION,
  VANISHED_REMEDIATION,
  phantomEntryPoints,
  checkIndexAgreement,
  trackedPackageDirs,
  vanishedPackageDirs,
} from "../src/tracked.ts";

/**
 * 「進得了基準的東西必須在版控裡」（C98）。
 *
 * ⚠️ 用**臨時的 git repo**，不碰真的樹 —— 這道檢查刻意只在 `PLATFORM` 是真正的
 * `platform/` 時開（見 `tracked.ts` 檔頭），所以 `--platform` 那條測試路徑
 * 印不出它。而在真 `platform/` 底下造一個假目錄去測，被中斷時會留下殘骸，
 * 讓所有人的閘門紅在一個不存在的問題上。`scope-check` 的測試用同一個做法。
 */
function repo(): Sandbox {
  const box = sandbox({ prefix: "api-surface-tracked-" });
  box.git(["init", "-q"]);
  return box;
}

function pkg(root: string, name: string): void {
  mkdirSync(join(root, "platform", name, "src"), { recursive: true });
  writeFileSync(join(root, "platform", name, "package.json"), '{ "name": "@x/a" }');
  writeFileSync(join(root, "platform", name, "src/index.ts"), "export const a = 1;\n");
}

describe("trackedPackageDirs：問 index，不問磁碟", () => {
  it("🔴 磁碟上有、版控裡沒有 → 不在集合裡", () => {
    const { root } = repo();
    pkg(root, "ghost");
    expect(trackedPackageDirs(root, join(root, "platform"))).toEqual(new Set());
  });

  it("★ staged 就算數（不必先 commit）—— C73 選 index 而不是 HEAD 的首要理由", () => {
    /**
     * `ls-tree HEAD` 答的是「上一個 commit 裡有什麼」。用它的話，新增一個套件、
     * `git add` 了、跑 `vpr ready` —— 是綠的，要等 commit 完才紅。
     * 而 `vpr ready` 存在的全部理由就是「推上去之前先知道」。
     */
    const box = repo();
    pkg(box.root, "staged");
    box.git(["add", "platform/staged"]);
    expect(trackedPackageDirs(box.root, join(box.root, "platform"))).toEqual(new Set(["staged"]));
  });

  it("★ 只認 platform/<name>/package.json 那一層", () => {
    // 套件內部的 package.json（例如 node_modules 或巢狀 workspace）不是進入點。
    const box = repo();
    pkg(box.root, "real");
    box.write("platform/real/nested/deep/package.json", "{}");
    box.git(["add", "platform"]);
    expect(trackedPackageDirs(box.root, join(box.root, "platform"))).toEqual(new Set(["real"]));
  });

  it("🔴 git 答不出來 → 丟例外，**不是**回報「零個被追蹤」", () => {
    /**
     * ⚠️ 這是這一則最重要的一條。回報空集合的話，每一個進入點都會變成幽靈，
     * 閘門紅一整片 —— 而真正壞掉的是儀器。`scope-check/tree.ts` 對同一件事
     * 有同一條規矩，`doc-facts` 的 `no-documents` 也是（「零個不符不是通過」）。
     */
    const { root } = sandbox({ prefix: "api-surface-nogit-" });
    mkdirSync(join(root, "platform"), { recursive: true });
    expect(() => trackedPackageDirs(root, join(root, "platform"))).toThrow(/git ls-files/);
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

describe("vanishedPackageDirs：反方向（C73「兩個方向都要驗」）", () => {
  it("🔴 版控裡有、磁碟上沒有 → 指出來", () => {
    /**
     * 鏡像的病理：`rm -rf platform/pii` 之後它列不進進入點，基準裡它的 export
     * 全部變成「移除」→ 破壞性變更 → 要求為一個**仍然在版控裡**的套件寫 codemod。
     * 一樣沒有合法出口。
     */
    expect(vanishedPackageDirs(new Set(["pii", "ui"]), ["ui"])).toEqual(["pii"]);
  });

  it("★ 兩邊一致 → 空陣列（好好地 git rm 不該被擋）", () => {
    // ⚠️ 這道檢查擋的**不是移除**，是兩邊不一致。`git rm -r` 之後 index 與磁碟
    // 都沒有它，這裡就該放行 —— 那是一次真的破壞性變更，codemod 那條路為它準備的。
    expect(vanishedPackageDirs(new Set(["ui"]), ["ui"])).toEqual([]);
  });

  it("🔴 磁碟清單要餵完整的，不是「有貢獻進入點的那些」", () => {
    /**
     * ⚠️ 這條釘的是一個會**每次都誤報**的寫法。`platform/tsconfig` 在版控裡、
     * 在磁碟上，而它沒有 `exports`，所以正當地貢獻零個進入點 ——
     * 拿它跟進入點清單比，它會每一次都被判成「消失了」。
     */
    expect(vanishedPackageDirs(new Set(["tsconfig"]), ["tsconfig"])).toEqual([]);
  });

  it("★ 多個全部列出、且排序穩定", () => {
    expect(vanishedPackageDirs(new Set(["z", "a"]), [])).toEqual(["a", "z"]);
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

  it("★ 反方向的訊息要把兩條出路都給出來", () => {
    expect(VANISHED_REMEDIATION, "沒講怎麼拿回來").toContain("git restore");
    expect(VANISHED_REMEDIATION, "沒講真的要移除該怎麼做").toContain("git rm");
  });

  it("🔴 反方向的訊息要講明「擋的不是移除」", () => {
    // 不講的話，讀的人會以為這道閘門在阻止他刪套件 —— 而它擋的是
    // index 與磁碟不一致。好好地 `git rm` 之後走 codemod 那條路才是對的。
    expect(VANISHED_REMEDIATION).toContain("擋的不是移除");
  });

  it("🔴 要講明 .gitignore 不是出路", () => {
    // 最直覺的錯誤動作：把它加進 .gitignore。那不會讓它離開磁碟，
    // 而這道檢查看的是版控 —— 加了照樣紅，而且理由看起來莫名其妙。
    expect(PHANTOM_REMEDIATION).toContain(".gitignore");
  });
});

describe("checkIndexAgreement：兩個方向都要在同一支裡", () => {
  /**
   * ⚠️ 這一組守的是**接線**，不是那兩個純函式。
   *
   * 兩個方向各自接在 `cli.ts` 裡的時候，變異「把反方向那段刪掉」**紅零條** ——
   * 純函式的測試照樣全過（函式還在），而 CLI 那條路在測試環境裡永遠不會觸發：
   * 這棵樹是乾淨的，而 `--platform` 刻意略過這道檢查。
   *
   * 合成一支之後，少一個方向就得動這支函式，而它在這裡被直接測。
   */
  it("🔴 幽靈方向會回報", () => {
    const out = checkIndexAgreement(["ghost"], new Set(), ["ghost"]);
    expect(out.map((p) => p.kind)).toEqual(["phantom"]);
  });

  it("🔴 消失方向會回報", () => {
    const out = checkIndexAgreement([], new Set(["pii"]), []);
    expect(out.map((p) => p.kind)).toEqual(["vanished"]);
  });

  it("🔴 兩個方向同時壞 → 兩則都回報，不是只報第一個", () => {
    // 只報一個的話，清完一邊要再跑一次才知道還有另一邊。
    const out = checkIndexAgreement(["ghost"], new Set(["pii"]), ["ghost"]);
    expect(out.map((p) => p.kind)).toEqual(["phantom", "vanished"]);
  });

  it("★ 兩邊一致 → 零則", () => {
    expect(checkIndexAgreement(["ui"], new Set(["ui", "tsconfig"]), ["ui", "tsconfig"])).toEqual(
      [],
    );
  });

  it("★ 每一則都帶得出自己的標題與做法", () => {
    // cli.ts 那端是一個泛用迴圈，不認得 kind —— 訊息要由這裡帶過去。
    for (const problem of checkIndexAgreement(["ghost"], new Set(["pii"]), ["ghost"])) {
      expect(problem.headline, problem.kind).not.toBe("");
      expect(problem.remediation, problem.kind).toContain("兩條出路");
    }
  });
});
