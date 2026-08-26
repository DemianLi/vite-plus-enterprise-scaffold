import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FACTS, REMEDIATION, checkFacts, handoffItemCount, type Fact } from "../src/facts.ts";

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

  it("★ 「N 個套件全帶 sha512」的兩種寫法都要被咬到", () => {
    // HANDOFF 有兩句一模一樣的宣稱，只有一句帶尾巴的「integrity」：
    // 第 5–7 節的條列，以及第 23 項對照表的表格欄位。
    //
    // 原本的樣式要求那個尾巴，於是**表格裡那個數字從來沒有被守過** ——
    // 2026-08-16 改套件數時才發現（C60）。放寬之後兩句都咬得到。
    //
    // ⚠️ 這條測的是「放寬」本身。少了它，有人把 `integrity` 加回樣式裡，
    // `citations.length` 不變、never-cited 也不會紅（另一句仍然對得到），
    // 於是那個洞會安靜地回來 —— 而這次連 C60 都寫著它已經補好了。
    const packages = FACTS.find((fact) => fact.id === "packages") as Fact;
    const bothForms = [
      "- 565 個套件全帶 sha512 integrity，CI 以 `--frozen-lockfile` 安裝",
      "| 565 個套件全帶 sha512                 | 標籤              |",
    ];

    for (const line of bothForms) {
      const matched = packages.citations.some((citation) => citation.exec(line) !== null);
      expect(matched, `沒有任何樣式咬得到：${line}`).toBe(true);
    }
  });
});

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

  it("🔴 一個樣式都沒有的事實 → 紅（C97：那條逃生口通到的洞）", () => {
    /**
     * 這條守的是**紅燈訊息自己指出去的那條路**。
     *
     * 「樣式對不到句子」的補救是「同步更新 src/facts.ts 的樣式」，而在 C97
     * 之前，把 `citations` 清成 `[]` 會讓閘門 exit=0、全綠、測試 29 passed ——
     * 唯一的痕跡是綠燈裡的樣式計數少一，而沒有人有那個基準。
     *
     * 也就是說：這支工具的整個用途（不讓東西看不見地失效）對**它自己的
     * 登記表**是關掉的。
     */
    const hollow: Fact = { ...FACT, citations: [] };
    const problems = checkFacts(docs("這裡共 5 個示範。"), { demo: 5 }, [hollow]);
    expect(problems.map((problem) => problem.kind)).toContain("unguarded");
  });

  it("★ 零樣式的訊息要說得出合法的做法是「移除整個 Fact」", () => {
    // 只說「這樣不行」的話，讀到的人會把 citations 再清一次然後困惑。
    // 差別在 diff 看不看得見：移掉整個 Fact 看得見，清空 citations 看不見。
    const hollow: Fact = { ...FACT, citations: [] };
    const detail = checkFacts(docs("x"), { demo: 5 }, [hollow])[0]?.detail ?? "";
    expect(detail).toContain("移除整個 Fact");
  });

  it("★ 樣式對不到時，訊息要把「被刪了」那一支也講出來", () => {
    /**
     * C97、#95 第 1 項。這道閘門接在 `vpr ready` 上，而那是 HANDOFF 叫
     * **拉 v1 去做案子的團隊**第一個跑的東西 —— 他們把 README 換成自己
     * 產品的之後會拿到 7 條這種紅燈（演練實測）。
     *
     * 原本的訊息問「句子被改寫了，還是那段被刪了？」，卻只給了前者的做法。
     * 後者對 fork 團隊才是常態，而它的做法有一個陷阱（見上一條），
     * 所以訊息必須兩支都講，而且要把人接到零樣式那條規則上。
     */
    const detail =
      checkFacts(docs("這裡有五個示範。"), { demo: 5 }, [FACT]).find(
        (problem) => problem.kind === "never-cited",
      )?.detail ?? "";
    expect(detail, "沒講「改寫」那一支").toContain("被改寫");
    expect(detail, "沒講「被刪」那一支").toContain("被刪");
    expect(detail, "沒把人接到零樣式那條規則").toContain("citations: []");
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
    "ui-components": [
      // ⚠️ 這兩句都在講「一個／第三個元件」而不是總數。第一句尤其危險：
      // 它用中文數字，所以今天對不到 —— 但把樣式放寬成 `.只有.*元件` 那種
      // 就會抓到它，然後這條事實會在一句永遠不會變的話上紅。
      "**每一段都有檢查**，而且檢查是**掃目錄**的 —— 第三個元件加進來時它一樣會說話。",
      "⚠️ **這一組檢查刻意不守「接縫夠不夠」。** 一個元件該開幾個槽、哪幾塊該讓各案",
      "`platform/ui` 的元件契約**掃目錄**驗每一個元件，不是綁在某個檔名上。",
      // 3 個元件 ＋ 3 個切片：這是 theme-verify 的輸出，講的是它掃了什麼，
      // 而且格式不同（沒有「只有」也沒有「都被檢查」）。
      "✓ 靜態：8 個元件 ＋ 3 個切片／應用畫面、0 處原始顏色",
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

  it("🔴 講「修好之前」那種**形狀**的句子不得被 action-refs 守著", () => {
    /**
     * 規則：講**過去式**的句子刻意不登記。加第 9 個引用時那種句子不會變成
     * 錯的，把它們跟著改才會 —— 那是「守它等於要求改寫歷史」，
     * 與 DECISIONS.md 不進守備範圍同一條理由。
     *
     * 這條與下一條是同一種判斷的兩個形狀：那邊是「數字推導不出來」，
     * 這邊是「句子講的是過去式」。兩種都會讓閘門變成在要求人改寫事實。
     *
     * ⚠️ **底下兩行現在是形狀樣本，不是引文（C97）。** 原本的說法是
     * 「同一個數字（17）在第 23 項出現三次」—— 而那三句話**早就不在文件裡了**
     * （實測 grep：`17 處`、`修好之前`、`可移動的標籤` 在 README 與 HANDOFF
     * 零命中）。這條測試因此描述了一份不存在的文件，而**沒有東西會說**：
     * 它一直在真空通過（`action-refs` 當時 `citations` 是空的，迴圈跑零次）。
     *
     * ⚠️ 三條之下那條 DECISIONS 的測試**沒有這樣漂**，差別只有一句：
     * `expect(decisions, "…這條測試失去意義").toContain("467 個套件")` ——
     * **一條夾具存在性斷言**。這一條沒有，所以它漂了而且沒人知道。
     * 這裡補不回那種斷言（句子真的不在了），改成明說用的是形狀。
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

  it("🔴 每個事實至少有一個樣式（C97）", () => {
    /**
     * ⚠️ **這條不是上面那條 runtime 檢查的重複。**
     *
     * `checkFacts` 在 `documents.length === 0` 時**提早回傳** —— 一棵文件
     * 讀不到的樹上，零樣式的事實根本走不到那個檢查。這一條無條件成立。
     *
     * 而它在這棵樹上抓到過真東西：`action-refs` 的 `citations` 原本只有
     * 一行寫著「所以**只有它**被登記」的註解、**沒有 regex**。
     * ⚠️ 不是生來就空：`49b36da`（`release(v1.0.0)`）把樣式刪掉、註解留著，
     * 因為它守的那句話在那次縮減裡被裁掉了 —— 從 `v1.0.0` 空到 `v1.2.0`，
     * 八個發出去的版本，全套閘門全綠。
     */
    for (const fact of FACTS) {
      expect(fact.citations.length, `${fact.id} 一個引用樣式都沒有`).toBeGreaterThan(0);
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

describe("紅燈尾巴：它也會被拉 v1 的團隊讀到（C97）", () => {
  it("★ 訊息要對 fork 團隊說話 —— 不去判斷讀的人是誰", () => {
    /**
     * `#95` 第 1 項。這道閘門接在 `scripts.gate` ＝ `vpr ready` 上，而那是
     * HANDOFF 叫**拉 v1 去做案子的團隊**第一個跑的東西。演練實測的觸發點：
     * 加第一片切片 → 2 條 mismatch（workspace 套件數、CODEOWNERS 條目數），
     * 而加切片正是採用指南教的第一件事。
     *
     * ⚠️ 跟 C95 一樣**不去偵測「這棵樹是不是上游」** —— 那是 `#91` 在問的，
     * 答案還沒有，而猜錯的偵測會給出看起來很確定的錯訊息。
     */
    expect(REMEDIATION, "沒有對 fork 那一種讀者說話").toContain("fork");
  });

  it("★ 要講出「與上游分歧」是預期的", () => {
    // 這是 #95 真正指認出來的代價：改完之後那幾句話描述的是他們自己的樹，
    // 每個案子都會這樣改一次。不講的話，他們會以為自己弄壞了什麼。
    expect(REMEDIATION).toContain("分歧");
  });

  it("🔴 訊息裡不得出現「這個 repo」", () => {
    /**
     * 在一棵 fork 的樹上，那四個字指的是**他們的** repo —— 而「一再栽跟頭」的
     * 不是他們。一句話同時對兩種讀者說時，指示代名詞就不能指向作者的樹。
     *
     * ⚠️ 這是 C95 §四 那條的同一個形狀（裸寫一個編號會把人送去讀另一則
     * 決策）：**訊息把人指錯地方，不會有任何東西說話。**
     */
    expect(REMEDIATION, "「這個 repo」在 fork 的樹上指錯對象").not.toContain("這個 repo");
  });

  it("🔴 「拿去跟採購與資安講的話」不得被當成上游敘事刪掉", () => {
    /**
     * ⚠️ 這條守的是一個**我差點犯的錯**：把這句話當成「上游味道」一起刪掉。
     * 它對一個企業採用團隊只會更真，不會更假。C95 修的是一個 fork 團隊
     * **做不到的動作**，不是一句動機說明 —— 刪掉後者只會讓訊息更模糊。
     */
    expect(REMEDIATION).toContain("採購與資安");
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
