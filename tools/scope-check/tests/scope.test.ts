import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { repoRoot, sandbox } from "@org/gate-kit/testing";

import { checkScope } from "../src/check.ts";
import { sectionFor } from "../src/parse.ts";
import { trackedDirectories, trackedRootEntries } from "../src/tree.ts";

/**
 * 反向測試：每一種不一致都要真的變紅。
 *
 * ⚠️ **假 repo 是真的 git repo。** 這道閘門的判定完全建立在「git 追蹤著什麼」
 * 上，用假的檔案系統驗它等於驗了另一件事。`git init` 一個臨時目錄很便宜，
 * 而且它讓「未追蹤的殘骸不算數」這條**真的**驗得到 —— 那是選 git 的首要理由，
 * 用 mock 的話那一條會變成同義反覆。
 *
 * ⚠️ 一律指到臨時目錄，不碰真的 repo。
 */

interface Layout {
  /** 會被 `git add` 的目錄（每個放一個檔案）。 */
  tracked: string[];
  /** 建出來但**不** `git add` 的目錄 —— 切分支留下的那種殘骸。 */
  untracked: string[];
  /** 會被 `git add` 的**根層檔案**（沒有斜線的那種）。 */
  rootFiles?: string[];
}

function repo(layout: Layout): string {
  const box = sandbox({ prefix: "scope-check-" });
  box.git(["init", "-q"]);

  for (const path of [...layout.tracked, ...layout.untracked]) {
    box.write(join(path, "package.json"), "{}");
  }
  for (const name of layout.rootFiles ?? []) {
    box.write(name, "");
  }
  const toAdd = [...layout.tracked, ...(layout.rootFiles ?? [])];
  if (toAdd.length > 0) {
    box.git(["add", "--", ...toAdd]);
  }
  return box.root;
}

/**
 * 照這幾份清單寫得完全正確的 `SCOPE.md`。
 *
 * ⚠️ **兩節都要造。** 少了根層那一節，`sectionFor` 回 `undefined`，
 * 每一條測試都會多一個「那一節不見了」—— 那正是這道閘門該有的行為
 * （改個標題就讓整層不再被檢查是不行的），所以修的是這個造假器，不是那條斷言。
 *
 * ⚠️ **刻意不造 `tools/` 那一節。** C136 §四 把那一層交給了 `gate-roster`，
 * `GOVERNED` 裡沒有它 —— 造一節出來的話 `declaredSections` 會抓到一個沒有人
 * 檢查的「准許存在的」章節，每一條測試都會多一條紅，而那條紅是真的。
 *
 * `rootEntries` 預設 `["platform/"]`，因為多數測試只在 `platform/` 底下建東西。
 * **這個參數必須跟 `repo()` 建的東西對齊**，對不齊就會多一條紅。
 */
function scopeDoc(
  platform: readonly string[],
  rootEntries: readonly string[] = ["platform/"],
): string {
  // ⚠️ **兩層的表不能共用一支造假器**（C143）。根層有第三欄「桶」而
  // `platform/` 沒有 —— 共用會讓 `platform/` 憑空長出一欄，於是那一層的
  // 測試驗的是一張樹上不存在的表。
  const platformTable = (paths: readonly string[]): string =>
    ["| 路徑 | 是什麼 |", "| --- | --- |"]
      .concat(paths.map((path) => `| \`${path}\` | x |`))
      .join("\n");
  const rootTable = (paths: readonly string[]): string =>
    ["| 名字 | 這是什麼 | 桶 |", "| --- | --- | --- |"]
      .concat(paths.map((path) => `| \`${path}\` | x | 無關 |`))
      .join("\n");
  return [
    "# 這棵樹上有什麼",
    "",
    "## `platform/` —— 准許存在的",
    "",
    platformTable(platform),
    "",
    "## 根層 —— 准許存在的",
    "",
    rootTable(rootEntries),
    "",
  ].join("\n");
}

const rules = (root: string, source: string): string[] =>
  checkScope(root, source).map((finding) => finding.rule);

describe("寫對的時候不該亂叫", () => {
  it("清單與版控一致就是零問題", () => {
    const root = repo({ tracked: ["tools/a", "platform/b"], untracked: [] });
    // ⚠️ `tools/a` 只需要根層那一列 —— `tools/` 這一層本身不再被這道閘門檢查
    // （C136 §四 交給了 gate-roster），但它仍然是一個**頂層目錄**。
    expect(checkScope(root, scopeDoc(["platform/b"], ["tools/", "platform/"]))).toEqual([]);
  });

  it("★ 真的 repo：零問題（C136）", () => {
    /**
     * ⚠️ **這一條的斷言換過兩次，而第二次是 C136 這一則本身。**
     *
     * 併線那天它從「零問題」換成「只有『樹上有、沒登記』一個方向」——
     * `SCOPE.md` 是 `release/v1` 的快照而 `main` 是超集，實測 10 項。
     * 那個紅是「邊界還沒定義」的表現，不是工具壞了，而當時那條註解自己寫著：
     * **「一項都沒有 —— 邊界定義好了就把這條測試改回零問題」**。
     *
     * C136 定義了它：`tools/` 那一層交給 `gate-roster`（§四），根層補上缺的
     * 兩列。**所以現在改回零問題。**
     *
     * ⚠️ 這條斷言比「只有一個方向」強得多，而那是刻意的：它同時守住兩個方向，
     * 包括當初抓到 `tools/sast` 的那個（登記了版控裡沒有的東西）。
     */
    expect(checkScope(repoRoot())).toEqual([]);
  });

  it("未追蹤的殘留目錄不算數", () => {
    // 選 git 當事實來源的首要理由。切分支時 git 刪掉被追蹤的檔案，卻留下
    // 含 `.DS_Store` 或殘留 `node_modules` 的目錄 —— 用磁碟當判準的檢查
    // 會在開發機紅、在 CI 綠。
    const root = repo({
      tracked: ["platform/a"],
      untracked: ["platform/leftover", "platform/sast"],
    });
    expect(checkScope(root, scopeDoc(["platform/a"]))).toEqual([]);
  });
});

describe("兩個方向都要紅", () => {
  it("版控裡有而清單沒列 —— 樹上悄悄多了東西", () => {
    const root = repo({ tracked: ["platform/a", "platform/newcomer"], untracked: [] });
    expect(rules(root, scopeDoc(["platform/a"]))).toEqual(["樹上有、沒登記"]);
  });

  it("清單列了而版控裡沒有 —— 就是 tools/sast 那個病", () => {
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    expect(rules(root, scopeDoc(["platform/a", "platform/sast"]))).toEqual(["登記了不存在的"]);
  });

  it("同一層兩個方向會一起報，不是報一個就停", () => {
    const root = repo({ tracked: ["platform/real"], untracked: [] });
    expect(rules(root, scopeDoc(["platform/ghost"]))).toEqual(["樹上有、沒登記", "登記了不存在的"]);
  });

  it("⚠️ `tools/` 那一層不再被這道閘門檢查（C136 §四）", () => {
    // 交棒給 gate-roster：它斷言每一個 tools/* workspace 成員都在 GATES 或
    // UNGATED 裡、why 必填。這裡補一張表只會造出第二份手抄本，而兩道機制
    // 互不斷言 —— 漂移時兩邊都是綠的。
    // ⚠️ 但 `tools/` 作為**頂層目錄**仍然要登記在根層那一節。
    const root = repo({ tracked: ["tools/a", "tools/whatever"], untracked: [] });
    expect(checkScope(root, scopeDoc([], ["tools/"]))).toEqual([]);
  });
});

describe("清單怎麼被讀出來", () => {
  it("改掉標題會紅，不會安靜地當成空清單", () => {
    // 少了這一條，改個標題就能讓整層不再被檢查 —— 而且是綠的。
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    const doc = scopeDoc(["platform/a"]).replace("## `platform/` —— 准許存在的", "## 平台");
    expect(rules(root, doc)).toContain("那一節不見了");
  });

  it("散文裡提到的路徑不算登記", () => {
    // 一節非清單的散文（`SCOPE.md` 曾有的〈刻意在外的〉就是這個形狀，C136 §六
    // 已撤除）整段在講 `tools/gate-roster`。用 grep 抓的話，
    // **被當成反例寫下來的東西會變成被登記的東西** —— 這道閘門就會對著
    // 「我們刻意不要的那個」說一切正常。
    const source = [
      "## `platform/` —— 准許存在的",
      "",
      "| 路徑 | 是什麼 |",
      "| --- | --- |",
      "| `platform/a` | x |",
      "",
      "## 一節散文",
      "",
      "`platform/leftover` 是某次遷移剩下的，這裡只是提到它。",
      "",
      "## 根層 —— 准許存在的",
      "",
      "| 名字 | 這是什麼 | 桶 |",
      "| --- | --- | --- |",
      // ⚠️ 這一列是造假器自己塞的，**它必須是完全合格的一列** ——
      // 少了桶那一格，這個 describe 底下每一條 `toEqual([...])` 都會多一條
      // 「沒有指名桶」，而那條紅是造假器造的，不是被測的東西造的。
      "| `platform/` | x | 無關 |",
    ].join("\n");
    const root = repo({ tracked: ["platform/a", "platform/leftover"], untracked: [] });
    expect(rules(root, source)).toEqual(["樹上有、沒登記"]);
  });

  it("只認第一欄", () => {
    // 後面兩欄是給人讀的散文，裡面出現 `tools/xxx` 是常態
    //（`codemods` 那一列就提到 `api-surface`）。
    const source = [
      "## `platform/` —— 准許存在的",
      "",
      "| 路徑 | 是什麼 | 備註 |",
      "| --- | --- | --- |",
      "| `platform/a` | `platform/b` 直接依賴它 | y |",
      "",
      "## 根層 —— 准許存在的",
      "",
      "| 名字 | 這是什麼 |",
      "| --- | --- |",
    ].join("\n");
    expect(sectionFor(source, "platform")?.listed).toEqual(["platform/a"]);
  });
});

describe("版控是唯一的事實來源", () => {
  it("staged 但還沒 commit 的目錄看得見", () => {
    // `git ls-tree HEAD` 在這裡會回空的 —— 那樣的話「新增一支工具、add 了、
    // 跑 vpr ready」是綠的，要等 commit 完才紅，而那時候人已經走了。
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    expect(trackedDirectories(root, "tools")).toEqual(["tools/a"]);
  });

  it("沒有 git 就直接失敗，不退回去掃磁碟", () => {
    // 一道「找不到 git 就換個比較寬鬆的判準」的閘門，會在最需要它的環境裡
    // 安靜地換成另一件事 —— 而且沒有人會發現，因為它還是綠的。
    const notARepo = sandbox({ prefix: "scope-check-bare-" }).root;
    mkdirSync(join(notARepo, "tools/a"), { recursive: true });
    expect(() => trackedDirectories(notARepo, "tools")).toThrow(/讀不到版控內容/);
  });
});

describe("登記了、但那一格是空的", () => {
  /**
   * 逐列指定的 `SCOPE.md` —— 用來造出「第一格有路徑、後面留白」那種列。
   * `scopeDoc()` 造不出來，它每一列都是填好的。
   */
  function docWithRows(platformRows: readonly string[], rootRows: readonly string[] = []): string {
    return [
      "# 這棵樹上有什麼",
      "",
      "## `platform/` —— 准許存在的",
      "",
      "| 路徑 | 是什麼 | 備註 |",
      "| --- | --- | --- |",
      ...platformRows,
      "",
      "## 根層 —— 准許存在的",
      "",
      "| 名字 | 這是什麼 | 桶 |",
      "| --- | --- | --- |",
      // ⚠️ 這一列是造假器自己塞的，**它必須是完全合格的一列** ——
      // 少了桶那一格，這個 describe 底下每一條 `toEqual([...])` 都會多一條
      // 「沒有指名桶」，而那條紅是造假器造的，不是被測的東西造的。
      "| `platform/` | x | 無關 |",
      ...rootRows,
      "",
    ].join("\n");
  }

  it("後面的欄位留白會紅", () => {
    // SCOPE.md 從 `v1.0.5` 就宣稱「這道閘門保證的是沒有人可以跳過那一格」，
    // 而在 C94 之前那句話是假的 —— 解析只捕捉第一格，這一列會安靜地通過。
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    expect(rules(root, docWithRows(["| `platform/a` | x |  |"]))).toEqual([
      "登記了、但那一格是空的",
    ]);
  });

  it("中間那一欄留白一樣紅 —— 驗的不是「最後一欄」", () => {
    // 只驗最後一欄的話，「是什麼」留白就溜掉了 —— 那一列一樣是登記了沒判斷過。
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    expect(rules(root, docWithRows(["| `platform/a` |  | y |"]))).toEqual([
      "登記了、但那一格是空的",
    ]);
  });

  it("兩張表的訊息不一樣 —— 兩層要填的格子不同", () => {
    // 用同一句訊息會對著根層那張表要求一個**文件自己說不該存在**的受益者欄
    // （替 `LICENSE` 寫那一句是儀式不是判斷），而下一個人只會照著補。
    const root = repo({ tracked: ["platform/b"], untracked: [], rootFiles: ["MY-NOTES.md"] });
    const findings = checkScope(
      root,
      docWithRows(["| `platform/b` | x |  |"], ["| `MY-NOTES.md` |  | 無關 |"]),
    );
    const fixFor = (path: string): string =>
      findings.find((finding) => finding.detail.includes(path))?.fix ?? "";

    expect(fixFor("platform/b")).toContain("「是什麼」");
    expect(fixFor("MY-NOTES.md")).toContain("「這是什麼」");
    expect(fixFor("MY-NOTES.md")).toContain("你們自己的清單");
    // ⚠️ 兩層都不叫人寫那六個字 —— C136 §三 之後那個要求已經沒有後果。
    expect(fixFor("platform/b")).not.toContain("受益者");
    expect(fixFor("MY-NOTES.md")).not.toContain("受益者");
  });

  it("填 `x` 就過得了 —— 那是邊界，不是漏洞", () => {
    // 「有沒有寫」機器讀得出來，「寫得對不對」讀不出來。這道閘門只買到前者，
    // 而 SCOPE.md 那一節現在把這條界線寫出來了。少了這一條，下一個人會以為
    // 它在驗內容，然後在它綠的時候不去讀那幾格。
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    expect(checkScope(root, docWithRows(["| `platform/a` | x | x |"]))).toEqual([]);
  });
});

describe("紅燈訊息只有一種讀者了（#66 → C136 §五）", () => {
  /**
   * C95 把訊息拆成兩半：對 fork 了 v1 的團隊說「寫你們自己的理由」，對上游
   * 維護者說「寫得出受益者是拉 v1 的團隊才可以進，寫不出來就送 `main`」。
   *
   * ⚠️ **那個分岔的唯一內容是後面那句要求**，而 C136 §三 判定它沒有後果了
   * （兩條線併回一條之後「送 `main`」＝「留在原地」）。於是兩種人要做的事
   * 一模一樣：加一列，寫一句它是什麼。留著兩半會變成一個**沒有差別的分類**。
   */
  const hintFor = (root: string, source: string, rule: string): string =>
    checkScope(root, source).find((finding) => finding.rule === rule)?.fix ?? "";

  it("★ 訊息不再要求那六個字，也不再叫人送 `main`", () => {
    /**
     * ⚠️ 這是這一組裡唯一會**安靜地**失守的斷言。訊息裡留著那句要求不會讓
     * 任何測試變紅 —— 它只會讓一個 fork 了 v1 的團隊照著寫一句他們依定義
     * 寫不出來的話，或者去找一條不存在的分支。
     */
    const root = repo({ tracked: ["platform/a", "platform/newcomer"], untracked: [] });
    const hint = hintFor(root, scopeDoc(["platform/a"]), "樹上有、沒登記");

    expect(hint, "還在要求那六個字").not.toContain("受益者是拉 v1 的團隊");
    expect(hint, "還在叫人送一條不存在的分支").not.toContain("送 `main`");
    expect(hint, "還在叫人先判斷自己是哪一種讀者").not.toContain("取決於你是誰");
  });

  it("★ 訊息要說出「綠了不代表可以」—— 拿掉判準節之後特別需要", () => {
    /**
     * ⚠️ 文件裡已經沒有判準節在暗示還有第二關，而一個綠掉的閘門很容易被讀成
     * 「所以這東西可以在這裡」。**不可以**（C93：沒有被治理 ≠ 准許進入）。
     * 這一句是 C93 在使用現場的那句話。
     */
    const root = repo({ tracked: ["platform/a", "platform/newcomer"], untracked: [] });
    const hint = hintFor(root, scopeDoc(["platform/a"]), "樹上有、沒登記");
    expect(hint, "沒有說出它不判准不准").toContain("不判准不准");
    expect(hint, "訊息沒有把人指到裁決上").toContain("C136");
  });

  it("訊息仍然告訴人要做什麼、要填哪一格", () => {
    const root = repo({ tracked: ["platform/a", "platform/newcomer"], untracked: [] });
    const hint = hintFor(root, scopeDoc(["platform/a"]), "樹上有、沒登記");
    expect(hint).toContain("加一列");
    expect(hint).toContain("「是什麼」");
    // fork 的團隊仍然被明確接住 —— 交棒拿掉的是要求，不是他們。
    expect(hint).toContain("寫你們自己的理由");
  });

  it("「登記了、但那一格是空的」也不預設讀者", () => {
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    const source = [
      "# x",
      "",
      "## `platform/` —— 准許存在的",
      "",
      "| 路徑 | 是什麼 | 備註 |",
      "| --- | --- | --- |",
      "| `platform/a` | x |  |",
      "",
      "## 根層 —— 准許存在的",
      "",
      "| 名字 | 這是什麼 | 桶 |",
      "| --- | --- | --- |",
      // ⚠️ 這一列是造假器自己塞的，**它必須是完全合格的一列** ——
      // 少了桶那一格，這個 describe 底下每一條 `toEqual([...])` 都會多一條
      // 「沒有指名桶」，而那條紅是造假器造的，不是被測的東西造的。
      "| `platform/` | x | 無關 |",
    ].join("\n");
    const hint = hintFor(root, source, "登記了、但那一格是空的");
    expect(hint).toContain("寫你們自己的理由");
    expect(hint).not.toContain("受益者是拉 v1 的團隊");
  });
});

describe("根層 —— 頂層目錄與根層檔案（#99）", () => {
  /**
   * `#94` 在 `release/v1` 上加了一個新的頂層目錄 `docs/` 與一個根層檔
   * `CONTEXT.md`，而全套閘門全綠 —— 因為射程只有 `tools/` 與 `platform/`。
   * 它的範疇論證引的正是這條縫（經過見 C93）。
   *
   * ⚠️ **這一節現在是這道閘門唯一獨有的那一半**（C136 §四）：`tools/` 交給了
   * `gate-roster`，而根層**沒有第二個機制**。`#87` 要造的 `docs/adr/` 與
   * `CONTEXT.md` 正是這裡答的。⚠️ 但「這裡答得出來」不等於「答案是可以」。
   */
  it("新的頂層目錄沒登記會紅 —— 就是 #94 那件", () => {
    const root = repo({ tracked: ["platform/a", "docs/adr"], untracked: [] });
    expect(rules(root, scopeDoc(["platform/a"]))).toEqual(["樹上有、沒登記"]);
  });

  it("新的根層檔案沒登記也會紅", () => {
    // 只抓目錄的話 `CONTEXT.md` 會溜掉，而它是 #94 溜進來的一半。
    const root = repo({ tracked: ["platform/a"], untracked: [], rootFiles: ["CONTEXT.md"] });
    expect(rules(root, scopeDoc(["platform/a"]))).toEqual(["樹上有、沒登記"]);
  });

  it("根層也是兩個方向都驗", () => {
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    expect(rules(root, scopeDoc(["platform/a"], ["platform/", "docs/"]))).toEqual([
      "登記了不存在的",
    ]);
  });

  it("目錄帶尾斜線、檔案不帶 —— 登記 `docs/` 蓋不掉一個叫 `docs` 的檔案", () => {
    // 少了尾斜線，一個叫 `docs` 的檔案跟一個叫 `docs` 的目錄在表上長得一模一樣，
    // 於是登記其中一個就等於把另一個也放行了。
    // ⚠️ 兩者不能同時存在（檔案系統就擋著，實測 EISDIR），所以這一條驗的是
    // **錯配**：樹上是檔案、表上登記目錄 —— 兩個方向都該紅。
    const root = repo({ tracked: ["platform/a"], untracked: [], rootFiles: ["docs"] });
    expect(rules(root, scopeDoc(["platform/a"], ["platform/", "docs/"]))).toEqual([
      "樹上有、沒登記",
      "登記了不存在的",
    ]);
  });

  it("根層那一節不見了會紅，不會安靜地當成空清單", () => {
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    const doc = scopeDoc(["platform/a"]).replace("## 根層 —— 准許存在的", "## 根層的東西");
    expect(rules(root, doc)).toContain("那一節不見了");
  });

  it("根層的訊息不叫人寫「受益者是拉 v1 的團隊」—— 那一節沒有那一欄", () => {
    // 替 `LICENSE`、`.gitignore` 寫那一句是儀式不是判斷。用另一層的訊息會
    // 要求一個文件自己說不該存在的欄位，而下一個人只會照著補。
    const root = repo({ tracked: ["platform/a"], untracked: [], rootFiles: ["MY-NOTES.md"] });
    const hint =
      checkScope(root, scopeDoc(["platform/a"])).find((f) => f.detail.includes("MY-NOTES"))?.fix ??
      "";
    expect(hint).toContain("「這是什麼」");
    expect(hint).toContain("你們自己的清單");
    expect(hint).not.toContain("受益者");
  });
});

describe("錨點是具名的，兩個方向都不能安靜", () => {
  it("加一節「准許存在的」而沒有人檢查它，會紅", () => {
    // 具名錨點擋住了「新增章節 = 無聲的治理範圍擴大」，但放進了相反的洞：
    // 一節 `## \`docs/\` —— 准許存在的` 看起來在治理 docs/，實際完全惰性、
    // 而且是綠的 —— 那正是 tools/sast 那個病的形狀。
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    const doc = `${scopeDoc(["platform/a"])}\n## \`docs/\` —— 准許存在的\n\n| 路徑 | 是什麼 |\n| --- | --- |\n| \`docs/adr\` | x |\n`;
    expect(rules(root, doc)).toEqual(["這一節沒有人在檢查"]);
  });

  it("⚠️ 留著一節 `tools/` 的清單也會紅 —— 交棒之後它就是一個沒人檢查的章節", () => {
    // C136 §四 把 tools/ 交給 gate-roster。如果只把 GOVERNED 拿掉、SCOPE.md
    // 那一節的標題留著，這道閘門會換一種紅法 —— 而不是變綠。
    // 撤掉那一節（而不是只改一個常數）是裁決的一部分，這一條守著它。
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    const doc = `${scopeDoc(["platform/a"])}\n## \`tools/\` —— 准許存在的\n\n| 路徑 | 守什麼 |\n| --- | --- |\n| \`tools/a\` | x |\n`;
    expect(rules(root, doc)).toEqual(["這一節沒有人在檢查"]);
  });

  it("兩節正確的標題都認得，不會誤報", () => {
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    expect(rules(root, scopeDoc(["platform/a"]))).toEqual([]);
  });
});

describe("非 ASCII 的路徑（C112）", () => {
  /**
   * ⚠️ **這一組守的是 `-z`。** 拿掉它，`git ls-files` 會把含非 ASCII 的路徑
   * 加引號並做八進位轉義：
   *
   *     "tools/spec-report/\350\250\202\345\226\256.feature"
   *
   * 第一段於是變成 `"tools`（帶著那個引號），而閘門會對一個**登記過的**目錄
   * 報「樹上有、沒登記」—— 一個看不懂、而且沒有合法出口的紅燈。
   *
   * ⚠️ 這兩條在修掉之前是**真的會失敗**的（實測），不是預防性斷言。
   */
  it("含中文檔名的目錄，路徑不帶引號", () => {
    const box = sandbox({ prefix: "scope-check-utf8-" });
    box.git(["init", "-q"]);
    box.write("tools/spec-report/訂單查詢.feature", "");
    box.git(["add", "--", "tools/spec-report"]);

    expect(trackedDirectories(box.root, "tools")).toEqual(["tools/spec-report"]);
  });

  it("根層的中文檔名也不帶引號", () => {
    const box = sandbox({ prefix: "scope-check-utf8-root-" });
    box.git(["init", "-q"]);
    box.write("測試說明.md", "");
    box.git(["add", "--", "測試說明.md"]);

    expect(trackedRootEntries(box.root)).toEqual(["測試說明.md"]);
  });
});

describe("根層要指名桶（C143）", () => {
  /**
   * 根層那一節逐列指定，`platform/` 那一節寫成正確的最小樣子。
   *
   * ⚠️ **這裡不用 `scopeDoc()`** —— 那支每一列都幫你填好桶，而這個 describe
   * 要驗的正是沒填、填錯的時候會怎樣。
   */
  function bucketDoc(rootRows: readonly string[]): string {
    return [
      "# 這棵樹上有什麼",
      "",
      "## `platform/` —— 准許存在的",
      "",
      "| 路徑 | 是什麼 |",
      "| --- | --- |",
      "| `platform/a` | x |",
      "",
      "## 根層 —— 准許存在的",
      "",
      "| 名字 | 這是什麼 | 桶 |",
      "| --- | --- | --- |",
      "| `platform/` | x | 正交 |",
      ...rootRows,
      "",
    ].join("\n");
  }

  const withNotes = (): string =>
    repo({ tracked: ["platform/a"], untracked: [], rootFiles: ["MY-NOTES.md"] });

  /**
   * ── 這四條就是 C143 §七 那四條變異列 ────────────────────────────────
   *
   * ⚠️ **第 4 條（「把這條規則拿掉，第 1 條要變綠」）不是另一條測試，
   * 它是第 1 條用 `toEqual` 而不是 `toContain` 寫出來的那個形狀。**
   * 精確相等同時斷言了兩件事：這一列會紅、而且**沒有別的東西在紅** ——
   * 所以拿掉這條規則之後那個陣列就是空的。
   *
   * 用 `toContain` 寫的話這條變異紅零條：桶那一格空著，C94 的
   * 「登記了、但那一格是空的」也會叫，於是紅的到底是誰就分不出來 ——
   * 而那正是 `check.ts` 的 `Layer.bucketColumn` 把兩條規則分開的理由。
   */
  it("① 桶那一格留空會紅，而且只有這一條紅", () => {
    expect(rules(withNotes(), bucketDoc(["| `MY-NOTES.md` | 專案筆記 |  |"]))).toEqual([
      "沒有指名桶",
    ]);
  });

  it("① 連那一格都沒有一樣紅 —— 「留空」有兩種寫法", () => {
    // 少打一個 `|` 就變成這一種，而它比空格子更容易溜過去：這一列看起來
    // 完全正常，只是短了一格。
    expect(rules(withNotes(), bucketDoc(["| `MY-NOTES.md` | 專案筆記 |"]))).toEqual(["沒有指名桶"]);
  });

  it("② 桶名不在那四個裡會紅", () => {
    expect(rules(withNotes(), bucketDoc(["| `MY-NOTES.md` | 專案筆記 | 雜項 |"]))).toEqual([
      "桶名不在那四個裡",
    ]);
  });

  it("③ 四個桶各一列、都填對就是綠的", () => {
    const root = repo({
      tracked: ["platform/a"],
      untracked: [],
      rootFiles: ["A.md", "B.md", "C.md", "D.md"],
    });
    expect(
      checkScope(
        root,
        bucketDoc([
          "| `A.md` | x | 正典 |",
          "| `B.md` | x | 正交 |",
          "| `C.md` | x | 過渡豁免 |",
          "| `D.md` | x | 無關 |",
        ]),
      ),
    ).toEqual([]);
  });

  it("⚠️ 桶那一格不歸「登記了、但那一格是空的」管 —— 兩條規則不重疊", () => {
    // 兩條都管同一格的話，第 4 條變異（拿掉桶那條 → 要變綠）就證明不了。
    // ⚠️ 這不是放寬：那一格從「非空」升級成「必須是那四個之一」。
    const findings = checkScope(withNotes(), bucketDoc(["| `MY-NOTES.md` | 專案筆記 |  |"]));
    expect(findings.map((finding) => finding.rule)).not.toContain("登記了、但那一格是空的");
  });

  it("⚠️ 「這是什麼」留空仍然歸 C94 那條管", () => {
    // 排除的只有桶那一格。少了這一條，「不重疊」會被實作成「根層整列不驗空格」，
    // 而那才是真的放寬 —— C94 買到的東西會安靜地消失。
    expect(rules(withNotes(), bucketDoc(["| `MY-NOTES.md` |  | 無關 |"]))).toEqual([
      "登記了、但那一格是空的",
    ]);
  });

  it("`platform/` 那一層不要求桶 —— 它的表只有兩欄", () => {
    // 兩層共用一個判準的話，`platform/` 會被要求一欄它的表上沒有的東西，
    // 而下一個人只會照著補 —— 那一節的散文就跟著變成假的（同 C136 §五）。
    const root = repo({ tracked: ["platform/a"], untracked: [] });
    expect(checkScope(root, bucketDoc([]))).toEqual([]);
  });

  it("填錯桶名的訊息叫人改那一列，不是叫人往 `BUCKETS` 加一個", () => {
    // 一個可以被受檢者自己加值域的欄位，量到的只是它自己（AGENTS.md 規則二）。
    const fix =
      checkScope(withNotes(), bucketDoc(["| `MY-NOTES.md` | 專案筆記 | 雜項 |"]))[0]?.fix ?? "";
    expect(fix).toContain("BUCKETS");
    expect(fix).toContain("停下來告訴人");
  });

  it("⚠️ 填了一個桶不代表填對了 —— 這道閘門看不出來", () => {
    // C143 §八：一列填了「正交」而它其實是正典，不會有任何東西變紅。
    // 這一條把那個界線釘成可執行的，免得下一個人在它綠的時候不去讀那一格。
    expect(
      checkScope(withNotes(), bucketDoc(["| `MY-NOTES.md` | 決策日誌第三卷 | 無關 |"])),
    ).toEqual([]);
  });
});
