import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { repoRoot } from "@org/gate-kit";
import { describe, expect, it } from "vitest";

import { judge, measure } from "../src/check.ts";
import {
  codeOf,
  collectSlots,
  floorSource,
  pairSlots,
  type Pair,
  type Slot,
} from "../src/config.ts";
import { parseDiagnostics } from "../src/diagnostics.ts";

/**
 * ⚠️ **判定那一半不 mount 任何東西，也不跑 lint。**
 *
 * 判定那一半（`config.ts`／`diagnostics.ts`／`check.ts`）是純函式，餵得進假資料；
 * 量測那一半（`probe.ts`）要起子行程掃全樹，跑一趟三秒多，**而且它的正確性
 * 靠的是自己那六條夾具**（檔案集合一致、改寫格數對得上、訊息解析得出來、
 * 射程對得上、錨點在清單裡、門檻配得起來）—— 那幾條每一趟 `vpr gate` 都在跑。
 *
 * 在測試裡再跑一次同樣的東西，換到的不是覆蓋率，是一條會跟其他測試
 * 搶同一棵樹的整合測試（C87 記過那個形狀）。
 *
 * ── ⚠️ 最後那一組是例外，而它買到的東西別處沒有 ────────────────────
 *
 * `--root`（C163）之後，這支工具有**兩個 root**：跑在哪、以及被驗的設定在哪。
 * 上面每一條純函式測試對「這兩個有沒有被接錯」完全無感 —— 一份把 `--root`
 * 只用在「檔案存不存在」、然後照樣壓真樹設定的實作，會通過這裡全部的斷言、
 * 通過承諾檢查的探針（兩趟輸出確實不同）、也通過沙盒的逐位元組比對，
 * 然後讓 `specs/gate-thresholds.feature` 那條「必須紅」報〈承諾沒有牙齒〉——
 * 一則指向閘門或規格、而兩者都不是原因的紅燈。
 *
 * 擋它的只有一件事：**紅燈裡那個數字要是目標設定裡的數字，不是真樹的。**
 * 那條斷言在檔案最後，代價約三秒，排程相依見 `vite.config.ts`。
 */

const CONFIG = {
  rules: {
    complexity: ["deny", [{ max: 39 }]],
    "max-depth": ["deny", [{ max: 5 }]],
    "oxc/bad-min-max-func": "warn",
    "vue/max-props": ["deny", [{ maxProps: 5 }]],
  },
  overrides: [
    {
      files: ["**/tests/**", "**/*.test.*"],
      rules: { "max-depth": ["deny", [{ max: 3 }]] },
    },
    {
      files: [".semgrep/**"],
      rules: { "no-eval": "allow" },
    },
    {
      files: ["features/*/**"],
      rules: { "no-restricted-imports": ["deny", [{ patterns: ["axios"] }]] },
    },
  ],
};

describe("collectSlots", () => {
  it("只收「數字選項」那一種，字串嚴重度與非數字選項都不算門檻", () => {
    expect(
      collectSlots(CONFIG).map((s) => `${s.scope}｜${s.rule}｜${s.option}｜${s.value}`),
    ).toEqual([
      "base｜complexity｜max｜39",
      "base｜max-depth｜max｜5",
      "base｜vue/max-props｜maxProps｜5",
      "overrides[0]｜max-depth｜max｜3",
    ]);
  });

  it("override 的 files 樣式就是給人看的範圍說明", () => {
    expect(collectSlots(CONFIG).at(-1)?.where).toBe("**/tests/**、**/*.test.*");
  });

  it("形狀不對的輸入給空清單，不丟例外 —— 丟例外會被上層當成量測台壞了", () => {
    expect(collectSlots(undefined)).toEqual([]);
    expect(collectSlots({ rules: "nope" })).toEqual([]);
  });
});

describe("codeOf", () => {
  it("沒有外掛前綴的規則屬於 eslint", () => {
    expect(codeOf("max-depth")).toBe("eslint(max-depth)");
  });

  it("有前綴的規則照前綴走", () => {
    expect(codeOf("vue/max-props")).toBe("vue(max-props)");
  });
});

describe("floorSource", () => {
  const SOURCE = [
    '      "max-lines-per-function": ["error", { max: 199 }],',
    '      complexity: ["error", { max: 39 }],',
    '      "vue/max-props": ["error", { maxProps: 5 }],',
    "        rules: {",
    '          "max-lines-per-function": ["error", { max: 455 }],',
    '          complexity: ["error", { max: 15 }],',
    "        },",
  ].join("\n");

  it("同一條規則的第 n 次出現拿到地板值 n —— 那是違規歸屬的唯一依據", () => {
    const { text, count } = floorSource(SOURCE);
    expect(count).toBe(5);
    expect(text).toContain('"max-lines-per-function": ["error", { max: 0 }]');
    expect(text).toContain('"max-lines-per-function": ["error", { max: 1 }]');
    expect(text).toContain('complexity: ["error", { max: 0 }]');
    expect(text).toContain('complexity: ["error", { max: 1 }]');
    expect(text).toContain('"vue/max-props": ["error", { maxProps: 0 }]');
  });

  it("沒有引號的規則名一樣要抓到 —— 第一版的樣式要求引號，於是 complexity 整條漏掉了", () => {
    expect(floorSource('complexity: ["error", { max: 39 }],').count).toBe(1);
  });

  /**
   * ⚠️ **這一條是射程的釘子。**
   *
   * 這支工具刻意不維護一份「哪些格子算門檻」的清單（見 `config.ts` 檔頭），
   * 代價是新增一條有數字選項的規則會靜靜地被算進來、或靜靜地漏掉。
   * 這條測試把今天的格數釘死：`vite.config.ts` 的門檻增減時它會紅，
   * **由人判斷那一格算不算門檻，然後改這個數字**。
   */
  it("今天這棵樹有 11 格門檻", () => {
    expect(floorSource(readFileSync(join(repoRoot(), "vite.config.ts"), "utf8")).count).toBe(11);
  });
});

describe("parseDiagnostics", () => {
  const MESSAGES = [
    [
      "eslint(max-lines-per-function)",
      "The function `runFull` has too many lines (199). Maximum allowed is 0.",
    ],
    ["vue(max-props)", "This component has too many props (2). Maximum allowed is 1."],
    ["eslint(max-depth)", "Blocks are nested too deeply (3). Maximum allowed is 2."],
    ["eslint(max-params)", "Function 'patch' has too many parameters (4). Maximum allowed is 3."],
    ["eslint(complexity)", "async function has a complexity of 15. Maximum allowed is 14."],
  ];

  it("五條規則五種措辭，含沒有括號的 complexity", () => {
    const parsed = parseDiagnostics({
      diagnostics: MESSAGES.map(([code, message]) => ({ code, message })),
    });
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.readings.map((r) => [r.reported, r.allowed])).toEqual([
      [199, 0],
      [2, 1],
      [3, 2],
      [4, 3],
      [15, 14],
    ]);
  });

  it("與門檻無關的診斷完全不進來", () => {
    const parsed = parseDiagnostics({
      diagnostics: [
        {
          code: "unicorn(no-useless-spread)",
          message: "Using a spread operator here creates a new array.",
        },
      ],
    });
    expect(parsed).toEqual({ readings: [], unparsed: [], files: 0 });
  });

  it("⚠️ 量測那一趟自己的射程要帶出來 —— 檔案清單那條夾具問的是另一趟呼叫", () => {
    expect(parseDiagnostics({ diagnostics: [], number_of_files: 257 }).files).toBe(257);
    expect(parseDiagnostics({ diagnostics: [] }).files).toBe(0);
  });

  it("⚠️ 讀不出數字的門檻訊息要被點名，不是被丟掉 —— 丟掉的話上游換措辭會全綠", () => {
    const parsed = parseDiagnostics({
      diagnostics: [
        { code: "eslint(complexity)", message: "too complex. Maximum allowed is fifteen." },
      ],
    });
    expect(parsed.readings).toEqual([]);
    expect(parsed.unparsed).toEqual([
      "eslint(complexity)｜too complex. Maximum allowed is fifteen.",
    ]);
  });
});

function slot(rule: string, value: number, scope = "base"): Slot {
  return { scope, rule, option: "max", value, where: scope };
}

describe("pairSlots", () => {
  it("逐格對得上就過", () => {
    const result = pairSlots([slot("max-depth", 5)], [slot("max-depth", 0)]);
    expect(result.ok).toBe(true);
  });

  it("格數不同 ⇒ 改寫沒有全中", () => {
    const result = pairSlots(
      [slot("max-depth", 5), slot("complexity", 39)],
      [slot("max-depth", 0)],
    );
    expect(result.ok).toBe(false);
  });

  it("同一位置的規則不同 ⇒ 兩份設定的順序對不起來", () => {
    const result = pairSlots([slot("max-depth", 5)], [slot("complexity", 0)]);
    expect(result.ok).toBe(false);
  });

  it("地板值沒有低於門檻 ⇒ 探針量不到分佈", () => {
    const result = pairSlots([slot("max-depth", 5)], [slot("max-depth", 5)]);
    expect(result.ok).toBe(false);
  });

  it("⚠️ 同一條規則兩格拿到同一個地板值 ⇒ 違規會混在一起，必須紅", () => {
    const result = pairSlots(
      [slot("max-depth", 5), slot("max-depth", 3, "overrides[0]")],
      [slot("max-depth", 0), slot("max-depth", 0, "overrides[0]")],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.why).toContain("同一個地板值");
  });
});

const PAIRS: Pair[] = [
  { slot: slot("max-lines-per-function", 239), floor: 0 },
  { slot: slot("max-depth", 3, "overrides[0]"), floor: 1 },
];

describe("measure ＋ judge", () => {
  it("實測 max 低於門檻 ⇒ 過期，而紅燈訊息帶著該降到的數字", () => {
    const rows = measure(PAIRS, [
      { code: "eslint(max-lines-per-function)", reported: 199, allowed: 0 },
      { code: "eslint(max-lines-per-function)", reported: 185, allowed: 0 },
      { code: "eslint(max-depth)", reported: 3, allowed: 1 },
    ]);
    const findings = judge(rows);
    expect(findings.map((f) => f.rule)).toEqual(["門檻過期"]);
    expect(findings[0]?.detail).toContain("實測最大值是 199");
    expect(findings[0]?.fix).toContain("降成 199");
  });

  it("實測 max 等於門檻 ⇒ 綠", () => {
    expect(
      judge(
        measure(PAIRS, [
          { code: "eslint(max-lines-per-function)", reported: 239, allowed: 0 },
          { code: "eslint(max-depth)", reported: 3, allowed: 1 },
        ]),
      ),
    ).toEqual([]);
  });

  it("⚠️ 一格零違規 ⇒ 「量不到」，不是「降到 0」—— 兩個相反的狀態在票面的量法下同讀數", () => {
    const rows = measure(PAIRS, [{ code: "eslint(max-depth)", reported: 3, allowed: 1 }]);
    const findings = judge(rows);
    expect(findings.map((f) => f.rule)).toEqual(["門檻量不到"]);
    expect(findings[0]?.fix).toContain("停下來告訴人");
  });

  it("違規歸屬只認地板值 —— 同一條規則的另一格不會被算進來", () => {
    const rows = measure(
      [
        { slot: slot("max-depth", 5), floor: 0 },
        { slot: slot("max-depth", 3, "overrides[0]"), floor: 1 },
      ],
      [
        { code: "eslint(max-depth)", reported: 5, allowed: 0 },
        { code: "eslint(max-depth)", reported: 3, allowed: 1 },
      ],
    );
    expect(rows.map((r) => r.observed)).toEqual([5, 3]);
    expect(judge(rows)).toEqual([]);
  });

  it("實測 max 高於門檻 ⇒ 這道閘門不叫人動門檻，叫人去看 vp check", () => {
    const findings = judge(
      measure(
        [{ slot: slot("max-depth", 3), floor: 0 }],
        [{ code: "eslint(max-depth)", reported: 5, allowed: 0 }],
      ),
    );
    expect(findings.map((f) => f.rule)).toEqual(["門檻被超過"]);
    expect(findings[0]?.fix).toContain("不要動門檻");
  });
});

describe("--root 換的是被驗的那份設定", () => {
  /**
   * ⚠️ **載重的是「500」這三個字，不是「紅了」。**
   *
   * 真樹那一格是 5。訊息裡出現 500，唯一的解釋是它讀了**目標設定的內容** ——
   * 換成只讀「那個目錄存不存在」的實作，這裡會拿到 5，或者根本是綠的。
   *
   * ⚠️ 反過來那一半（指向真樹 → 綠）不在這裡：每一趟 `vpr gate` 都在跑它，
   * 而在這裡再跑一次要多付三秒。
   */
  it("★ 指向一份門檻被抬高的設定 → 紅，而紅燈點名的是那一份裡的數字", () => {
    const root = repoRoot();
    const source = readFileSync(join(root, "vite.config.ts"), "utf8");
    // 第一個 max-depth 是根層那一格（5）。⚠️ 非全域替換，覆寫的只有它。
    const raised = source.replace(/("max-depth":\s*\[\s*"error",\s*\{\s*max:\s*)\d+/u, "$1500");
    expect(raised, "設定的寫法變了 —— 這裡什麼都沒改壞，而它會「通過」").not.toBe(source);

    const dir = mkdtempSync(join(tmpdir(), "threshold-root-"));
    try {
      writeFileSync(join(dir, "vite.config.ts"), raised);
      const result = spawnSync(
        "node",
        [join(root, "tools/threshold-check/src/cli.ts"), "--root", dir],
        {
          cwd: root,
          encoding: "utf8",
        },
      );
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

      expect(result.status, output).not.toBe(0);
      expect(output).toContain("門檻過期");
      expect(output, "紅燈裡的數字是真樹的，不是那一份的 —— --root 只被拿去看目錄在不在").toContain(
        "設在 500",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
