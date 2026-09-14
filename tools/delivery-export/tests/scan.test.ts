import { describe, expect, it } from "vitest";

import { LOCKFILE, scan, traceRules, verdict } from "../src/scan.ts";

const RULES = traceRules({
  toolNames: ["exit-drill", "pii-check"],
  docNames: ["DECISIONS.md", "HANDOFF.md", "API.md"],
});

/** 每一條規則一句會命中的樣本 —— 對照組的「已知非零」那一半。 */
const KNOWN_HITS: Record<string, string> = {
  "裁決編號 C／D／R ＋ 數字": "所有請求必須經由同源的 BFF（D8）",
  "題號 Q ＋ 數字": "值型別是 CalendarDate（Q68）",
  "工具名（tools/ 的目錄名）": "必須登記在 exit-drill 的 DRILL_PLUGINS",
  閘門: "這一行由閘門守著",
  "vitest／cucumber／coverage": "import { it } from 'vitest';",
  "tools/": "見 tools/pii 的說明",
  內部文件名: "理由寫在 DECISIONS.md",
  "Tier 1／Tier 2": "安全規則走 Tier 2",
  "stryker／突變／變異／mutation": "突變測試會把這裡改壞",
  vpr: "跑 vpr ready",
  "腳手架／scaffold": "這是腳手架的碼",
  "gate／drill": "the gate blocks it",
  演練: "採用演練花了半天",
  "issue 號 #＋數字": "登記在（#95）",
  "測試套件（lockfile）": "  vite-plus@0.3.1:\n    resolution: {integrity: sha512-x}",
};

/** 樣本放在規則會掃的那一支檔裡：lockfile 那一條只看 lockfile。 */
function sampleFile(label: string, content: string): { path: string; content: string } {
  const lockfileOnly = RULES.find((rule) => rule.label === label)?.scope === "lockfile";
  return { path: lockfileOnly ? LOCKFILE : "sample.ts", content };
}

/** 「已知為零」那一半：像業務碼、而且故意長得接近詞表的字串。 */
const KNOWN_CLEAN = [
  'const color = "#1D4ED8"; // 主色',
  "export function toolsOf(user: User) { return user.tools; }",
  "API 回應 401 時導回登入頁",
  "const DC1 = 1; const C1a = 2;",
  "發票查詢：依期別列出",
  "const checker = createPiiChecker(); // pii-checker 是業務元件，名字剛好包住一支工具名",
  "// gateway 逾時就重試；navigate 與 aggregate 也不算",
  "const DRILL_TIMEOUT = 3;",
  'const muted = "#fff"; const entity = "&#123;";',
  "訂單編號 1024 會被永久刪除",
];

describe("C250 收進來的四個詞", () => {
  const hits = (label: string, content: string): number | undefined =>
    scan([{ path: "a", content }], RULES).rules.find((rule) => rule.label === label)?.hits;

  it("gate／drill 各種大小寫與複數都算，前後是英數就不算", () => {
    expect(hits("gate／drill", "Gates and DRILL, drills")).toBe(3);
    expect(hits("gate／drill", "gateway drilling")).toBe(0);
  });

  it("issue 號前面是英數、& 或 # 就不算", () => {
    expect(hits("issue 號 #＋數字", "（#130 §七）與 HANDOFF #24")).toBe(2);
    expect(hits("issue 號 #＋數字", "a#1 &#123; ##2 #1D4ED8")).toBe(0);
  });
});

describe("痕跡掃描的詞表（C231 §三，Q111）", () => {
  it("每一條規則都有一句會命中的樣本 —— 少一條，那條規則壞掉時沒人知道", () => {
    expect(Object.keys(KNOWN_HITS).sort()).toEqual(RULES.map((rule) => rule.label).sort());
  });

  it.each(Object.entries(KNOWN_HITS))("%s 命中它的樣本", (label, sample) => {
    const result = scan([sampleFile(label, sample)], RULES);
    expect(result.rules.find((rule) => rule.label === label)?.hits).toBeGreaterThan(0);
  });

  it("★ 乾淨的樣本零命中 —— 對照組的另一個方向，接住太寬的 pattern", () => {
    const result = scan(
      KNOWN_CLEAN.map((content, index) => ({ path: `clean-${index}.ts`, content })),
      RULES,
    );
    expect(result.byFile).toEqual([]);
  });

  it("全形括號旁的編號照樣命中（CJK 字元不是 \\w，\\b 成立）", () => {
    expect(scan([{ path: "a", content: "（C120）見C215" }], RULES).rules[0]?.hits).toBe(2);
  });

  it("內部文件名裸寫也算；API 是一般詞，要帶 .md 才算", () => {
    const hits = (content: string): number | undefined =>
      scan([{ path: "a", content }], RULES).rules.find((rule) => rule.label === "內部文件名")?.hits;
    expect(hits("見 HANDOFF 第 5 節")).toBe(1);
    expect(hits("見 HANDOFF.md")).toBe(1);
    expect(hits("這份 API 的表面")).toBe(0);
    expect(hits("形狀見 API.md")).toBe(1);
  });

  it("同一個位置好幾個詞命中只算一處：DECISIONS-2.md 不會被 DECISIONS 再算一次", () => {
    const rules = traceRules({
      toolNames: ["exit-drill"],
      docNames: ["DECISIONS.md", "DECISIONS-2.md"],
    });
    const docs = (content: string): number | undefined =>
      scan([{ path: "a", content }], rules).rules.find((rule) => rule.label === "內部文件名")?.hits;
    expect(docs("見 DECISIONS-2.md 與 DECISIONS.md")).toBe(2);
  });

  it("重疊的命中只算一處：詞表同時有 bff-check 與 check，bff-check 只算一次", () => {
    const rules = traceRules({ toolNames: ["bff-check", "check"], docNames: ["A.md"] });
    const tools = (content: string): number | undefined =>
      scan([{ path: "a", content }], rules).rules.find((rule) => rule.label.startsWith("工具名"))
        ?.hits;
    expect(tools("跑 bff-check")).toBe(1);
    expect(tools("跑 check")).toBe(1);
  });

  it("逐檔的計數加總等於總數", () => {
    const result = scan(
      Object.entries(KNOWN_HITS).map(([label, content]) => sampleFile(label, content)),
      RULES,
    );
    expect(result.byFile.reduce((sum, [, count]) => sum + count, 0)).toBe(result.total);
  });
});

describe("lockfile 只掃測試套件的名字（C253）", () => {
  const hitsIn = (path: string, content: string): Record<string, number> =>
    Object.fromEntries(
      scan([{ path, content }], RULES)
        .rules.filter((rule) => rule.hits > 0)
        .map((rule) => [rule.label, rule.hits]),
    );

  it("★ vite-plus 帶進來的 vitest 與它的 peer 在 lockfile 裡命中", () => {
    const lock = "  vitest@4.1.11(happy-dom@20.11.2):\n  '@testing-library/dom@10.4.1':";
    expect(hitsIn(LOCKFILE, lock)).toEqual({ "測試套件（lockfile）": 3 });
  });

  it("★ 其餘規則不掃 lockfile —— sha512 的 base64 會湊出假的編號", () => {
    expect(hitsIn(LOCKFILE, "    resolution: {integrity: sha512-ab+C12/D3=}")).toEqual({});
  });

  it("lockfile 那一條不掃原始碼：業務碼寫 playwright 由別的規則管，不歸它", () => {
    expect(hitsIn("src/a.ts", "// 截圖用 playwright")).toEqual({});
  });

  it("上游 Vite 與 rolldown 不算 —— 那是交出去的樹的建置引擎", () => {
    expect(
      hitsIn(
        LOCKFILE,
        "  vite@8.2.2:\n  rolldown@1.2.6:\n  '@rolldown/binding-linux-x64-gnu@1.2.6':",
      ),
    ).toEqual({});
  });
});

describe("判定：任一命中就失敗（C252）", () => {
  const dirty = scan([{ path: "a", content: "閘門" }], RULES);
  const clean = scan([{ path: "a", content: "發票" }], RULES);

  it("★ 有命中就失敗，訊息說產物已刪除", () => {
    expect(verdict(dirty)).toMatchObject({
      ok: false,
      message: expect.stringContaining("產物已刪除"),
    });
  });

  it("零命中才 ok", () => {
    expect(verdict(clean).ok).toBe(true);
  });
});

describe("掃不到東西不是乾淨", () => {
  it("零支檔 → 丟例外，不回傳零命中", () => {
    expect(() => scan([], RULES)).toThrow(/零支檔/);
  });

  it("推導出來的工具名是空的 → 丟例外（空詞表掃出零處，與乾淨長得一樣）", () => {
    expect(() => traceRules({ toolNames: [], docNames: ["A.md"] })).toThrow(/工具名/);
  });
});
