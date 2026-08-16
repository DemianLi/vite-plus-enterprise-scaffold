import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FACTS, checkFacts, handoffItemCount, type Fact } from "../src/facts.ts";

/**
 * 文件數字守衛的**反向測試**。
 *
 * 這道閘門判錯的兩個方向都會讓它失效，而且方式相反：
 *
 *   - 漏報：數字過期而沒人發現 —— 那正是它存在的理由，已經栽過不只一次
 *   - 誤報：對著子集的數字亂叫（HANDOFF 有「8 個原生二進位」是授權實測的那一批）
 *     於是有人把它從 workflow 拿掉
 *
 * 標 ★ 的驗的是**不該紅的時候不會紅**。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CLI = join(ROOT, "tools/doc-facts/src/cli.ts");

const FACT: Fact = {
  id: "demo",
  describe: "示範數字",
  source: "沒有這個檔案",
  citations: [/共 (\d+) 個示範/],
};

function docs(source: string, path = "README.md") {
  return [{ path, source }];
}

describe("checkFacts：該紅的時候會紅", () => {
  it("🔴 數字對不上 → 紅", () => {
    const problems = checkFacts(docs("這裡共 3 個示範。"), { demo: 5 }, [FACT]);
    expect(problems.map((problem) => problem.kind)).toContain("mismatch");
    expect(problems[0]?.detail).toContain("寫著 3");
    // 訊息要指得出來源，否則看到紅燈的人不知道該信哪一個數字。
    expect(problems[0]?.detail).toContain("沒有這個檔案");
  });

  it("★ 數字對得上 → 零問題", () => {
    expect(checkFacts(docs("這裡共 5 個示範。"), { demo: 5 }, [FACT])).toEqual([]);
  });

  it("🔴 句子被改寫、樣式對不到 → 紅（不是靜靜不守）", () => {
    // 這是這支工具最容易失效的方式：有人改寫了那句話，樣式從此對不到任何東西，
    // 而閘門一直全綠。失敗方向必須是安全的。
    const problems = checkFacts(docs("這裡有五個示範。"), { demo: 5 }, [FACT]);
    expect(problems.map((problem) => problem.kind)).toContain("never-cited");
  });

  it("🔴 多個樣式時，只要有一個對不到就紅 —— 不是「至少有一個對得到」", () => {
    // 第一版是逐個事實計數，於是一個事實有兩個引用時，刪掉其中一句
    // 總數仍然是 1，閘門照樣綠 —— 這個機制的一半當場失效。
    const twoWays: Fact = {
      ...FACT,
      citations: [/共 (\d+) 個示範/, /另一句寫 (\d+) 個/],
    };
    const problems = checkFacts(docs("這裡共 5 個示範。"), { demo: 5 }, [twoWays]);
    const stale = problems.filter((problem) => problem.kind === "never-cited");
    expect(stale).toHaveLength(1);
    expect(stale[0]?.detail).toContain("另一句寫");
  });

  it("🔴 事實來源讀不出值 → 紅", () => {
    const problems = checkFacts(docs("這裡共 5 個示範。"), {}, [FACT]);
    expect(problems.map((problem) => problem.kind)).toContain("never-cited");
  });

  it("🔴 一份文件都沒讀到 → 紅", () => {
    // 零份文件當然零個不符。C33 的形狀。
    expect(checkFacts([], { demo: 5 }, [FACT]).map((problem) => problem.kind)).toEqual([
      "no-documents",
    ]);
  });

  it("同一個事實在多份文件裡各報一次", () => {
    const problems = checkFacts(
      [
        { path: "README.md", source: "共 3 個示範" },
        { path: "HANDOFF.md", source: "共 4 個示範" },
      ],
      { demo: 5 },
      [FACT],
    );
    expect(problems.filter((problem) => problem.kind === "mismatch")).toHaveLength(2);
  });
});

describe("★ 子集的數字不得被誤判成總數", () => {
  it("HANDOFF 裡「8 個原生二進位」是授權實測的那一批，不是總數", () => {
    // 用寬鬆樣式（任何「N 個原生二進位」）去比對總數的話，
    // 這道閘門第一天就會對著兩個正確的數字亂叫。
    const native = FACTS.find((fact) => fact.id === "native") as Fact;
    const subsetLines = [
      "授權疑慮已解除：`vite-plus`、core、8 個原生二進位的 `license` 欄位實測皆為 MIT。",
      "> 22 個原生二進位（每個約 4 MB）進入我們的建置環境",
    ];
    for (const line of subsetLines) {
      for (const citation of native.citations) {
        expect(citation.exec(line), `誤判：${line.slice(0, 30)}`).toBeNull();
      }
    }
  });

  it("「10 個套件」是 darwin-x64 的鏡像量，不是套件總數", () => {
    const packages = FACTS.find((fact) => fact.id === "packages") as Fact;
    const line = "例如 `darwin-x64` 是 10 個套件、49 MB。";
    for (const citation of packages.citations) expect(citation.exec(line)).toBeNull();
  });
});

describe("★ 新登記的樣式不得誤判鄰近的句子", () => {
  /**
   * 2026-08-16 的第二輪擴大：契約條目、workspace 套件、action 引用處、
   * 不重複 action、CODEOWNERS 條目。
   *
   * 這五筆有一個共同的風險：它們的量詞（「條」「個」「處」）在這幾份文件裡
   * 到處都是。樣式寫寬一點就會對著別的正確數字亂叫，而一道會亂叫的閘門
   * 會被拿掉 —— 這一組驗的就是那件事。
   */
  const NEARBY: Record<string, readonly string[]> = {
    "contract-items": [
      "| **本 repo 自寫的 2 條** | 2          | **2** |",
      "**反向測試 6 條**，其中 4 條標 ★（驗「不該紅的時候不會紅」）。",
      "`p/default`（semgrep 的公開規則集）對本 repo 報了 26 條。",
    ],
    "workspace-packages": [
      "另有 22 個 `@yuku-*` 在 registry 上沒有 license 欄位。",
      "`vpr capture-health` 補上：它掃的是 24 個**外部直接相依**，",
    ],
    "action-refs": [
      "> 22 個原生二進位（每個約 4 MB）進入我們的建置環境",
      "例如 `darwin-x64` 是 10 個套件、49 MB。",
    ],
    "distinct-actions": [
      "授權疑慮已解除：`vite-plus`、core、8 個原生二進位的 `license` 欄位實測皆為 MIT。",
      "- 核准 **144 個平台原生二進位、12 個家族**的例外。",
    ],
    "codeowners-entries": [
      "本 repo 2026-08-15 實測：**22 條全部 Unknown owner**（見 C40）。",
      "| **MPL-2.0** | `lightningcss-*` 22 個（兩個版本）",
    ],
  };

  for (const [id, lines] of Object.entries(NEARBY)) {
    it(`★ ${id} 的樣式不碰那幾句`, () => {
      const fact = FACTS.find((candidate) => candidate.id === id) as Fact;
      expect(fact, `登記表裡沒有 ${id}`).toBeDefined();
      for (const line of lines) {
        for (const citation of fact.citations) {
          expect(citation.exec(line), `${id} 誤判：${line.slice(0, 34)}`).toBeNull();
        }
      }
    });
  }

  it("🔴 第 23 項裡講「修好之前」的那兩句**不得**被 action-refs 守著", () => {
    /**
     * 同一個數字（17）在第 23 項出現三次，但只有一次講的是現況。
     * 另外兩句 —— 摘要表那條刪除線、以及問題陳述裡列著 `@v7` 範例的那句 ——
     * 描述的是**修好之前**的狀態。
     *
     * 加第 18 個引用時，那兩句不會變成錯的；把它們改成 18 才會。
     * 那是「守它等於要求改寫歷史」，與 DECISIONS.md 不進守備範圍同一條理由。
     *
     * 這條與下一條是同一種判斷的兩個形狀：那邊是「數字推導不出來」，
     * 這邊是「句子講的是過去式」。兩種都會讓閘門變成在要求人改寫事實。
     */
    const fact = FACTS.find((candidate) => candidate.id === "action-refs") as Fact;
    const past = [
      "| 23  | 平台（CI）   | ~~17 處引用全用可移動的標籤~~ **已全部釘 SHA ＋ 加閘門（2026-08-16）**",
      "**修好之前，17 處引用全部以標籤釘住**：`actions/checkout@v7`、`actions/setup-node@v7`、",
    ];
    for (const line of past) {
      for (const citation of fact.citations) {
        expect(citation.exec(line), `誤守過去式：${line.slice(0, 30)}`).toBeNull();
      }
    }
  });

  it("🔴 CODEOWNERS 的「22 條 Unknown owner」**不得**被當成條目數守著", () => {
    /**
     * 這是這一輪最重要的一格，也是它被降級的理由。
     *
     * 那個 22 來自 `gh api …/codeowners/errors` —— GitHub 的判定。實測 C40
     * 量到 22 的那個 commit，本地是 14 條條目、21 個 owner 引用：**三個數字
     * 互不相等**，也就是說它推導不出來。硬守它只能靠人再抄一次期望值（A1）。
     *
     * 現在守的是條目數，而那句歷史測量必須留在文件裡且不被碰到。
     */
    const fact = FACTS.find((candidate) => candidate.id === "codeowners-entries") as Fact;
    const history = "本 repo 2026-08-15 實測：**22 條全部 Unknown owner**（見 C40）。";
    for (const citation of fact.citations) expect(citation.exec(history)).toBeNull();
  });
});

describe("handoffItemCount：合併標題要展開", () => {
  it("`## 5–7.` 算三項", () => {
    expect(handoffItemCount("## 1.\n## 5–7.\n")).toBe(4);
  });

  it("★ 編號有缺口不補 —— 目前就沒有第 15 項", () => {
    expect(handoffItemCount("## 14.\n## 16.\n")).toBe(2);
  });

  it("不是標題的數字不算", () => {
    expect(handoffItemCount("### 3. 小節\n內文 ## 9. 不在行首")).toBe(0);
  });

  it("真的 HANDOFF.md 數得出來，而且不是 0", () => {
    const source = readFileSync(join(ROOT, "HANDOFF.md"), "utf8");
    expect(handoffItemCount(source)).toBeGreaterThan(5);
  });
});

describe("登記表本身", () => {
  it("每個樣式恰好一個捕獲群組", () => {
    // 兩個群組的話 match[1] 可能不是那個數字，而比對會安靜地錯。
    //
    // 用字面計數而不是 `new RegExp(source + "|")` 去問引擎：後者會踩到
    // security/detect-non-literal-regexp，而那條規則在這個 repo 是 0 warnings。
    for (const fact of FACTS) {
      for (const citation of fact.citations) {
        const groups = citation.source.split("(").length - 1;
        const nonCapturing = citation.source.split("(?").length - 1;
        expect(groups - nonCapturing, `${fact.id}: ${citation.source}`).toBe(1);
      }
    }
  });

  it("★ 沒有任何樣式帶 g 旗標", () => {
    // 這些是模組層級的共用物件，而 checkFacts 用的是 exec。帶 g 的 regex
    // 會在物件上累積 lastIndex，於是同一個樣式跑到第二行時從中間開始比對 ——
    // 症狀是時有時無地漏掉命中，看起來像文件沒問題。
    for (const fact of FACTS) {
      for (const citation of fact.citations) {
        expect(citation.flags, `${fact.id}: ${citation.source}`).not.toContain("g");
      }
    }
  });

  it("每個事實都寫了來源", () => {
    for (const fact of FACTS) expect(fact.source.length, fact.id).toBeGreaterThan(10);
  });
});

describe("CLI 端對端", () => {
  it("這個 repo 現在是綠的", () => {
    const result = spawnSync("node", [CLI], { cwd: ROOT, encoding: "utf8" });
    expect(result.status, `${result.stdout ?? ""}${result.stderr ?? ""}`).toBe(0);
  });

  it("★ 通過訊息要講出它刻意不守 DECISIONS.md", () => {
    // 少了這句，綠燈會被讀成「全 repo 的數字都對」。
    const result = spawnSync("node", [CLI], { cwd: ROOT, encoding: "utf8" });
    expect(result.stdout).toContain("決策日誌");
  });

  it("🔴 DECISIONS.md 裡的舊數字**不得**被守 —— 它陳述的是歷史", () => {
    // 這是整個設計的樞紐。DECISIONS.md 現在仍然寫著 467／121／11，
    // 而那幾句在寫下的當時是真的。守它等於要求回頭改寫決策日誌。
    const decisions = readFileSync(join(ROOT, "DECISIONS.md"), "utf8");
    expect(decisions, "DECISIONS.md 不再有歷史數字 —— 這條測試失去意義").toContain("467 個套件");

    const result = spawnSync("node", [CLI], { cwd: ROOT, encoding: "utf8" });
    expect(result.status, "守到 DECISIONS.md 了").toBe(0);
  });
});
