import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

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

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

interface Layout {
  /** 會被 `git add` 的目錄（每個放一個檔案）。 */
  tracked: string[];
  /** 建出來但**不** `git add` 的目錄 —— 切分支留下的那種殘骸。 */
  untracked: string[];
  /** 會被 `git add` 的**根層檔案**（沒有斜線的那種）。 */
  rootFiles?: string[];
}

function repo(layout: Layout): string {
  const root = mkdtempSync(join(tmpdir(), "scope-check-"));
  created.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });

  for (const path of [...layout.tracked, ...layout.untracked]) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "package.json"), "{}");
  }
  for (const name of layout.rootFiles ?? []) {
    writeFileSync(join(root, name), "");
  }
  const toAdd = [...layout.tracked, ...(layout.rootFiles ?? [])];
  if (toAdd.length > 0) {
    execFileSync("git", ["add", "--", ...toAdd], { cwd: root });
  }
  return root;
}

/**
 * 照這幾份清單寫得完全正確的 `SCOPE.md`。
 *
 * ⚠️ **三節都要造。** 少了根層那一節，`sectionFor` 回 `undefined`，
 * 每一條測試都會多一個「那一節不見了」—— 那正是這道閘門該有的行為
 * （改個標題就讓整層不再被檢查是不行的），所以修的是這個造假器，不是那條斷言。
 *
 * `rootEntries` 預設 `["tools/"]`，因為多數測試只在 `tools/` 底下建東西。
 * 有建 `platform/` 的測試要自己補 —— **這個參數必須跟 `repo()` 建的東西對齊**，
 * 對不齊就會多一條紅，而那條紅是真的。
 */
function scopeDoc(
  tools: readonly string[],
  platform: readonly string[],
  rootEntries: readonly string[] = ["tools/"],
): string {
  const table = (paths: readonly string[]): string =>
    ["| 路徑 | 守什麼 | 受益者 |", "| --- | --- | --- |"]
      .concat(paths.map((path) => `| \`${path}\` | x | y |`))
      .join("\n");
  return [
    "# v1 的範疇",
    "",
    "## `tools/` —— 准許存在的",
    "",
    table(tools),
    "",
    "## `platform/` —— 准許存在的",
    "",
    table(platform),
    "",
    "## 根層 —— 准許存在的",
    "",
    table(rootEntries),
    "",
  ].join("\n");
}

const rules = (root: string, source: string): string[] =>
  checkScope(root, source).map((finding) => finding.rule);

describe("寫對的時候不該亂叫", () => {
  it("清單與版控一致就是零問題", () => {
    const root = repo({ tracked: ["tools/a", "platform/b"], untracked: [] });
    expect(
      checkScope(root, scopeDoc(["tools/a"], ["platform/b"], ["tools/", "platform/"])),
    ).toEqual([]);
  });

  it("真的 repo 現在是一致的", () => {
    // 與 CLI 重疊，而重疊是刻意的：CLI 只在 `vpr gate` 跑，這一條在
    // `vp run -r test` 跑。兩邊都要能看見同一件事變紅。
    expect(checkScope(resolve(fileURLToPath(import.meta.url), "../../../.."))).toEqual([]);
  });

  it("未追蹤的殘留目錄不算數", () => {
    // 選 git 當事實來源的首要理由。切分支時 git 刪掉被追蹤的檔案，卻留下
    // 含 `.DS_Store` 或殘留 `node_modules` 的目錄 —— 用磁碟當判準的檢查
    // 會在開發機紅、在 CI 綠。
    const root = repo({ tracked: ["tools/a"], untracked: ["tools/gate-roster", "tools/sast"] });
    expect(checkScope(root, scopeDoc(["tools/a"], []))).toEqual([]);
  });
});

describe("兩個方向都要紅", () => {
  it("版控裡有而清單沒列 —— 範疇裡悄悄多了東西", () => {
    const root = repo({ tracked: ["tools/a", "tools/newcomer"], untracked: [] });
    expect(rules(root, scopeDoc(["tools/a"], []))).toEqual(["樹上有、沒登記"]);
  });

  it("清單列了而版控裡沒有 —— 就是 tools/sast 那個病", () => {
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    expect(rules(root, scopeDoc(["tools/a", "tools/sast"], []))).toEqual(["登記了不存在的"]);
  });

  it("platform 那一層一樣兩個方向都驗", () => {
    const root = repo({ tracked: ["tools/a", "platform/real"], untracked: [] });
    expect(rules(root, scopeDoc(["tools/a"], ["platform/ghost"], ["tools/", "platform/"]))).toEqual(
      ["樹上有、沒登記", "登記了不存在的"],
    );
  });
});

describe("清單怎麼被讀出來", () => {
  it("改掉標題會紅，不會安靜地當成空清單", () => {
    // 少了這一條，改個標題就能讓整層不再被檢查 —— 而且是綠的。
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    const doc = scopeDoc(["tools/a"], []).replace("## `tools/` —— 准許存在的", "## 工具");
    expect(rules(root, doc)).toContain("那一節不見了");
  });

  it("散文裡提到的路徑不算登記", () => {
    // SCOPE.md 的〈刻意在外的〉整段在講 `tools/gate-roster`。用 grep 抓的話，
    // **被當成反例寫下來的東西會變成被登記的東西** —— 這道閘門就會對著
    // 「我們刻意不要的那個」說一切正常。
    const source = [
      "## `tools/` —— 准許存在的",
      "",
      "| 路徑 | 守什麼 | 受益者 |",
      "| --- | --- | --- |",
      "| `tools/a` | x | y |",
      "",
      "## 刻意在外的",
      "",
      "`tools/gate-roster` 守的是 CI 閘門清單，漂移傷的是維護者。",
      "",
      "## `platform/` —— 准許存在的",
      "",
      "| 路徑 | 守什麼 | 受益者 |",
      "| --- | --- | --- |",
      "",
      "## 根層 —— 准許存在的",
      "",
      "| 名字 | 這是什麼 |",
      "| --- | --- |",
      "| `tools/` | x |",
    ].join("\n");
    const root = repo({ tracked: ["tools/a", "tools/gate-roster"], untracked: [] });
    expect(rules(root, source)).toEqual(["樹上有、沒登記"]);
  });

  it("只認第一欄", () => {
    // 後面兩欄是給人讀的散文，裡面出現 `tools/xxx` 是常態
    //（`codemods` 那一列就提到 `api-surface`）。
    const source = [
      "## `tools/` —— 准許存在的",
      "",
      "| 路徑 | 守什麼 | 受益者 |",
      "| --- | --- | --- |",
      "| `tools/a` | `tools/b` 擋的就是沒附的那些 | y |",
      "",
      "## `platform/` —— 准許存在的",
      "",
      "| 路徑 | 守什麼 | 受益者 |",
      "| --- | --- | --- |",
    ].join("\n");
    expect(sectionFor(source, "tools")?.listed).toEqual(["tools/a"]);
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
    const notARepo = mkdtempSync(join(tmpdir(), "scope-check-bare-"));
    created.push(notARepo);
    mkdirSync(join(notARepo, "tools/a"), { recursive: true });
    expect(() => trackedDirectories(notARepo, "tools")).toThrow(/讀不到版控內容/);
  });
});

describe("登記了、但那一格是空的", () => {
  /**
   * 逐列指定的 `SCOPE.md` —— 用來造出「第一格有路徑、後面留白」那種列。
   * `scopeDoc()` 造不出來，它每一列都是填好的。
   */
  function docWithRows(toolsRows: readonly string[], platformRows: readonly string[]): string {
    const header = ["| 路徑 | 守什麼 | 受益者 |", "| --- | --- | --- |"];
    return [
      "# v1 的範疇",
      "",
      "## `tools/` —— 准許存在的",
      "",
      ...header,
      ...toolsRows,
      "",
      "## `platform/` —— 准許存在的",
      "",
      ...header,
      ...platformRows,
      "",
      "## 根層 —— 准許存在的",
      "",
      "| 名字 | 這是什麼 |",
      "| --- | --- |",
      "| `tools/` | x |",
      "",
    ].join("\n");
  }

  it("後面的欄位留白會紅", () => {
    // SCOPE.md 從 `v1.0.5` 就宣稱「這道閘門保證的是沒有人可以跳過那一格」，
    // 而在 C94 之前那句話是假的 —— 解析只捕捉第一格，這一列會安靜地通過。
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    expect(rules(root, docWithRows(["| `tools/a` | x |  |"], []))).toEqual([
      "登記了、但那一格是空的",
    ]);
  });

  it("中間那一欄留白一樣紅 —— 驗的不是「最後一欄」", () => {
    // 只驗最後一欄的話，「守什麼」留白就溜掉了 —— 那一列一樣是登記了沒判斷過。
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    expect(rules(root, docWithRows(["| `tools/a` |  | y |"], []))).toEqual([
      "登記了、但那一格是空的",
    ]);
  });

  it("兩張表的訊息不一樣 —— platform 沒有受益者欄，也不會有", () => {
    // 用同一句訊息會對著 `platform/` 那張表要求一個**文件自己說不該存在**的
    // 欄位（那一節明寫「逐一寫受益者沒有意義」），而下一個人只會照著補。
    const root = repo({ tracked: ["tools/a", "platform/b"], untracked: [] });
    const findings = checkScope(
      root,
      docWithRows(["| `tools/a` | x |  |"], ["| `platform/b` | x |  |"]),
    );
    const fixFor = (path: string): string =>
      findings.find((finding) => finding.detail.includes(path))?.fix ?? "";

    expect(fixFor("tools/a")).toContain("受益者是拉 v1 的團隊");
    expect(fixFor("platform/b")).toContain("是什麼");
    expect(fixFor("platform/b")).not.toContain("受益者");
  });

  it("填 `x` 就過得了 —— 那是邊界，不是漏洞", () => {
    // 「有沒有寫」機器讀得出來，「寫得對不對」讀不出來。這道閘門只買到前者，
    // 而 SCOPE.md 那一節現在把這條界線寫出來了。少了這一條，下一個人會以為
    // 它在驗內容，然後在它綠的時候不去讀那幾格。
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    expect(checkScope(root, docWithRows(["| `tools/a` | x | x |"], []))).toEqual([]);
  });
});

describe("紅燈訊息預設的讀者是誰（#66）", () => {
  /**
   * 這道閘門接在 `scripts.gate` 也就是 `vpr ready` 上，而那正是 HANDOFF 叫
   * **拉 v1 去做案子的團隊**第一個跑的東西。判定是對的，錯的是它預設讀訊息的
   * 人是這條線的維護者。
   */
  const hintFor = (root: string, source: string, rule: string): string =>
    checkScope(root, source).find((finding) => finding.rule === rule)?.fix ?? "";

  it("「樹上有、沒登記」同時對 fork 的人與上游維護者說話", () => {
    // 原本的訊息叫人「寫出**受益者是拉 v1 的團隊**那一句，寫不出來就送 `main`」——
    // 對一個 fork 了 v1 的團隊，那句話**依定義寫不出來**（他們自己就是那個團隊），
    // 而 `main` 是這個 repo 的分支，不是他們的。
    const root = repo({ tracked: ["tools/a", "platform/theirs"], untracked: [] });
    const hint = hintFor(
      root,
      scopeDoc(["tools/a"], [], ["tools/", "platform/"]),
      "樹上有、沒登記",
    );

    expect(hint).toContain("fork");
    expect(hint).toContain("寫你們自己的理由");
    expect(hint).toContain("跟你們無關");
    // 上游那一半不能因此消失 —— 判準對維護者仍然成立。
    expect(hint).toContain("受益者是拉 v1 的團隊");
  });

  it("C72 不裸寫 —— C 編號在 C70 就分岔了", () => {
    // `main` 的 C72 是另一則決策（「收回一條寫在程式碼裡的規則」）。
    // 裸寫 `C72` 在這個 repo 是有歧義的，而訊息把人送去讀錯的那一則
    // 不會有任何東西說話。
    const root = repo({ tracked: ["tools/a", "tools/newcomer"], untracked: [] });
    const hint = hintFor(root, scopeDoc(["tools/a"], []), "樹上有、沒登記");
    expect(hint).toContain("`release/v1` 的 C72");
  });

  it("「登記了、但那一格是空的」也不預設讀者", () => {
    // C94 那一條同樣叫人去填「為什麼受益者是拉 v1 的團隊」那一欄。
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    const source = [
      "# x",
      "",
      "## `tools/` —— 准許存在的",
      "",
      "| 路徑 | 守什麼 | 受益者 |",
      "| --- | --- | --- |",
      "| `tools/a` | x |  |",
      "",
      "## `platform/` —— 准許存在的",
      "",
      "| 路徑 | 是什麼 |",
      "| --- | --- |",
      "",
      "## 根層 —— 准許存在的",
      "",
      "| 名字 | 這是什麼 |",
      "| --- | --- |",
      "| `tools/` | x |",
    ].join("\n");
    expect(hintFor(root, source, "登記了、但那一格是空的")).toContain("寫你們自己的理由");
  });
});

describe("根層 —— 頂層目錄與根層檔案（#99）", () => {
  /**
   * `#94` 在 `release/v1` 上加了一個新的頂層目錄 `docs/` 與一個根層檔
   * `CONTEXT.md`，而全套閘門全綠 —— 因為射程只有 `tools/` 與 `platform/`。
   * 它的範疇論證引的正是這條縫（經過見 C93）。
   */
  it("新的頂層目錄沒登記會紅 —— 就是 #94 那件", () => {
    const root = repo({ tracked: ["tools/a", "docs/adr"], untracked: [] });
    expect(rules(root, scopeDoc(["tools/a"], []))).toEqual(["樹上有、沒登記"]);
  });

  it("新的根層檔案沒登記也會紅", () => {
    // 只抓目錄的話 `CONTEXT.md` 會溜掉，而它是 #94 溜進來的一半。
    const root = repo({ tracked: ["tools/a"], untracked: [], rootFiles: ["CONTEXT.md"] });
    expect(rules(root, scopeDoc(["tools/a"], []))).toEqual(["樹上有、沒登記"]);
  });

  it("根層也是兩個方向都驗", () => {
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    expect(rules(root, scopeDoc(["tools/a"], [], ["tools/", "docs/"]))).toEqual(["登記了不存在的"]);
  });

  it("目錄帶尾斜線、檔案不帶 —— 登記 `docs/` 蓋不掉一個叫 `docs` 的檔案", () => {
    // 少了尾斜線，一個叫 `docs` 的檔案跟一個叫 `docs` 的目錄在表上長得一模一樣，
    // 於是登記其中一個就等於把另一個也放行了。
    // ⚠️ 兩者不能同時存在（檔案系統就擋著，實測 EISDIR），所以這一條驗的是
    // **錯配**：樹上是檔案、表上登記目錄 —— 兩個方向都該紅。
    const root = repo({ tracked: ["tools/a"], untracked: [], rootFiles: ["docs"] });
    expect(rules(root, scopeDoc(["tools/a"], [], ["tools/", "docs/"]))).toEqual([
      "樹上有、沒登記",
      "登記了不存在的",
    ]);
  });

  it("根層那一節不見了會紅，不會安靜地當成空清單", () => {
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    const doc = scopeDoc(["tools/a"], []).replace("## 根層 —— 准許存在的", "## 根層的東西");
    expect(rules(root, doc)).toContain("那一節不見了");
  });

  it("根層的訊息不叫人寫「受益者是拉 v1 的團隊」—— 那一節沒有那一欄", () => {
    // 替 `LICENSE`、`.gitignore` 寫那一句是儀式不是判斷。用 tools/ 那套訊息
    // 會要求一個文件自己說不該存在的欄位，而下一個人只會照著補。
    const root = repo({ tracked: ["tools/a"], untracked: [], rootFiles: ["MY-NOTES.md"] });
    const hint =
      checkScope(root, scopeDoc(["tools/a"], [])).find((f) => f.detail.includes("MY-NOTES"))?.fix ??
      "";
    expect(hint).toContain("「這是什麼」");
    expect(hint).toContain("你們自己的清單");
    expect(hint).not.toContain("寫得出「受益者是拉 v1 的團隊」才可以進");
  });
});

describe("錨點是具名的，兩個方向都不能安靜", () => {
  it("加一節「准許存在的」而沒有人檢查它，會紅", () => {
    // 具名錨點擋住了「新增章節 = 無聲的治理範圍擴大」，但放進了相反的洞：
    // 一節 `## \`docs/\` —— 准許存在的` 看起來在治理 docs/，實際完全惰性、
    // 而且是綠的 —— 那正是 tools/sast 那個病的形狀。
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    const doc = `${scopeDoc(["tools/a"], [])}\n## \`docs/\` —— 准許存在的\n\n| 路徑 | 是什麼 |\n| --- | --- |\n| \`docs/adr\` | x |\n`;
    expect(rules(root, doc)).toEqual(["這一節沒有人在檢查"]);
  });

  it("三節正確的標題都認得，不會誤報", () => {
    const root = repo({ tracked: ["tools/a"], untracked: [] });
    expect(rules(root, scopeDoc(["tools/a"], []))).toEqual([]);
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
    const root = mkdtempSync(join(tmpdir(), "scope-check-utf8-"));
    created.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    mkdirSync(join(root, "tools/spec-report"), { recursive: true });
    writeFileSync(join(root, "tools/spec-report/訂單查詢.feature"), "");
    execFileSync("git", ["add", "--", "tools/spec-report"], { cwd: root });

    expect(trackedDirectories(root, "tools")).toEqual(["tools/spec-report"]);
  });

  it("根層的中文檔名也不帶引號", () => {
    const root = mkdtempSync(join(tmpdir(), "scope-check-utf8-root-"));
    created.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(join(root, "測試說明.md"), "");
    execFileSync("git", ["add", "--", "測試說明.md"], { cwd: root });

    expect(trackedRootEntries(root)).toEqual(["測試說明.md"]);
  });
});
