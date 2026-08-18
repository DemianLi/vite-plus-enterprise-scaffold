import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  ROSTER,
  checkRoster,
  deriveGateScript,
  deriveTierCommands,
  extractTierCommands,
  type Roster,
} from "../src/check.ts";
import { GATES, UNGATED, type Gate, type Tier } from "../src/gates.ts";

/**
 * 反向測試：每一種漂移都要真的變紅。
 *
 * ── 為什麼整棵假 repo 是從名冊**長出來**的 ──────────────────────────
 *
 * `healthy()` 拿一份名冊，產出一棵**照那份名冊寫得完全正確**的目錄樹。
 * 每個測試再從那棵樹上弄壞一件事。
 *
 * 這樣寫的理由不是漂亮：如果 fixture 是手寫死的，加一道新閘門就會讓整批
 * 測試變紅，而修法是回來手抄一次 —— 那正好是這支工具在防的動作，
 * 由它自己的測試示範一次會很難看。
 *
 * ⚠️ 一律指到臨時目錄，**不碰真的 repo**。理由見 doc-facts/src/derive.ts 上
 * `TRANSIENT_PREFIX` 的註解：那裡記著一個「測試動到 repo，害另一支測試
 * 隨機變紅」的實測競態。
 */

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

interface Layout {
  /** `tools/` 底下、有 `package.json` 的目錄。 */
  toolPackages: string[];
  /** `tools/` 底下、**沒有** `package.json` 的目錄（切分支留下來的幽靈）。 */
  ghostDirectories: string[];
  scripts: Record<string, string>;
  tier1Commands: string[];
  tier2Commands: string[];
  tier1Labels: string[];
  tier2Labels: string[];
}

/** 照這份名冊，一切都寫對的樣子。 */
function healthy(roster: Roster): Layout {
  const labels = (tier: Tier): string[] =>
    roster.gates.filter((gate) => gate.tiers.includes(tier)).map((gate) => gate.label);

  const scripts: Record<string, string> = { gate: deriveGateScript(roster.gates) };
  for (const gate of roster.gates) {
    if (gate.pkg !== undefined) scripts[gate.id] = gate.command;
  }

  return {
    toolPackages: [
      ...roster.gates.filter((gate) => gate.pkg !== undefined).map((gate) => gate.pkg as string),
      ...roster.ungated.map((entry) => entry.pkg),
    ],
    ghostDirectories: [],
    scripts,
    tier1Commands: [...deriveTierCommands(roster.gates, "tier1")],
    tier2Commands: [...deriveTierCommands(roster.gates, "tier2")],
    tier1Labels: labels("tier1"),
    tier2Labels: labels("tier2"),
  };
}

function workflow(commands: readonly string[], extraMultilineStep: boolean): string {
  const steps = commands
    .map((command) => `      - name: 某一道\n        run: ${command}\n`)
    .join("");
  // tier2 真的有 docker 步驟，而它們是 `run: |` 多行區塊。放一個進來，
  // 是為了釘住「多行區塊不會被誤認成沒登記的閘門」—— 少了這一條，
  // 有人把單行抽取改寬鬆一點，這道閘門就會開始對 SAST 那兩步亂叫。
  const docker = extraMultilineStep
    ? "      - name: SAST 掃描\n        run: |\n          docker run --rm semgrep scan --config .semgrep/rules.yml\n"
    : "";
  return `name: t\njobs:\n  j:\n    steps:\n${steps}${docker}`;
}

function write(layout: Layout): string {
  const root = mkdtempSync(join(tmpdir(), "gate-roster-"));
  created.push(root);

  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - tools/*\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: layout.scripts }, null, 2));

  mkdirSync(join(root, "tools"));
  for (const name of layout.toolPackages) {
    mkdirSync(join(root, "tools", name), { recursive: true });
    writeFileSync(join(root, "tools", name, "package.json"), `{ "name": "@org/${name}" }`);
  }
  for (const name of layout.ghostDirectories) {
    mkdirSync(join(root, "tools", name), { recursive: true });
  }

  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(
    join(root, ".github/workflows/tier1-quality.yml"),
    workflow(layout.tier1Commands, false),
  );
  writeFileSync(
    join(root, ".github/workflows/tier2-security.yml"),
    workflow(layout.tier2Commands, true),
  );

  writeFileSync(
    join(root, "README.md"),
    "## 兩層檢查\n\n" +
      "| | 內容 | 指令 | 何時跑 |\n| --- | --- | --- | --- |\n" +
      `| **Tier 1 — 品質** | ${layout.tier1Labels.join(" + ")} | x | y |\n` +
      `| **Tier 2 — 安全閘門** | ${layout.tier2Labels.join(" + ")} | x | y |\n`,
  );

  return root;
}

/** 照名冊寫對的 fixture，再套用一個破壞。 */
function broken(mutate: (layout: Layout) => void, roster: Roster = ROSTER): string {
  const layout = healthy(roster);
  mutate(layout);
  return write(layout);
}

const kinds = (root: string, roster: Roster = ROSTER): string[] =>
  checkRoster(root, roster).map((problem) => problem.kind);

describe("寫對的時候不該亂叫", () => {
  it("照名冊產出來的 fixture 是零問題", () => {
    expect(checkRoster(write(healthy(ROSTER)), ROSTER)).toEqual([]);
  });

  it("真的 repo 現在是一致的", () => {
    // 這一條與 CLI 重疊，而重疊是刻意的：CLI 只在 `vpr gate` 跑，
    // 這一條在 `vp run -r test` 跑。兩邊都要能看見同一件事變紅。
    expect(checkRoster(resolve(fileURLToPath(import.meta.url), "../../../.."))).toEqual([]);
  });

  it("沒有 package.json 的幽靈目錄不算工具", () => {
    // C41 的實測：一台從 main 切到 release/v1 的機器上，`tools/` 底下
    // 數得到 16 個目錄而只有 7 個是 workspace 成員。用目錄數當判準的話，
    // 這道閘門在開發機紅、在 CI 綠 —— 第一天就會被加例外。
    const root = broken((layout) => {
      layout.ghostDirectories = ["sast", "ui-survey", "csp-verify"];
    });
    expect(kinds(root)).toEqual([]);
  });
});

describe("工具沒登記", () => {
  it("多一個沒登記的 tools/ 套件會紅", () => {
    const root = broken((layout) => {
      layout.toolPackages.push("brand-new-gate");
    });
    expect(kinds(root)).toContain("工具沒登記");
  });

  it("名冊指到一個不存在的套件會紅", () => {
    const root = broken((layout) => {
      layout.toolPackages = layout.toolPackages.filter((name) => name !== "conformance");
    });
    expect(kinds(root)).toContain("登記了不存在的工具");
  });

  it("同時登記成閘門與不接會紅", () => {
    // 這一條只有在名冊也能換掉的時候才驗得到 —— 就是 `Roster` 收成參數的理由。
    const roster: Roster = {
      gates: GATES,
      ungated: [...UNGATED, { pkg: "conformance", why: "自相矛盾的登記" }],
    };
    expect(kinds(write(healthy(roster)), roster)).toContain("重複登記");
  });
});

describe("四個消費端各自漂移", () => {
  it("scripts.gate 少一道會紅", () => {
    const root = broken((layout) => {
      layout.scripts["gate"] = deriveGateScript(GATES.slice(1));
    });
    expect(kinds(root)).toContain("scripts.gate 對不上");
  });

  it("scripts.gate 順序換掉也會紅", () => {
    // 順序是有意義的（便宜的排前面），所以比對是字串相等而不是集合相等。
    const root = broken((layout) => {
      layout.scripts["gate"] = deriveGateScript([...GATES].reverse());
    });
    expect(kinds(root)).toContain("scripts.gate 對不上");
  });

  it("少一個單獨跑的別名會紅", () => {
    const root = broken((layout) => {
      delete layout.scripts["theme-verify"];
    });
    expect(kinds(root)).toContain("單獨跑的別名對不上");
  });

  it("workflow 少一道會紅", () => {
    const root = broken((layout) => {
      layout.tier2Commands = layout.tier2Commands.slice(1);
    });
    expect(kinds(root)).toContain("workflow 少一道");
  });

  it("workflow 多一道沒登記的會紅", () => {
    const root = broken((layout) => {
      layout.tier1Commands.push("node tools/mystery/src/cli.ts");
    });
    expect(kinds(root)).toContain("workflow 多一道");
  });

  it("閘門排錯層會紅（tier1 的跑到 tier2）", () => {
    const root = broken((layout) => {
      const moved = layout.tier1Commands.pop();
      if (moved !== undefined) layout.tier2Commands.push(moved);
    });
    const found = kinds(root);
    expect(found).toContain("workflow 少一道");
    expect(found).toContain("workflow 多一道");
  });

  it("README 那張表少一道會紅", () => {
    const root = broken((layout) => {
      layout.tier2Labels = layout.tier2Labels.slice(1);
    });
    expect(kinds(root)).toContain("README 漏了一道");
  });

  it("README 那張表整個不見會紅", () => {
    const root = broken((layout) => {
      layout.tier1Labels = [];
      layout.tier2Labels = [];
    });
    // 表格列還在（只是格子空了），所以報的是「漏了」而不是「不見了」。
    expect(kinds(root)).toContain("README 漏了一道");
  });
});

describe("抽取層", () => {
  it("多行的 run: | 區塊不會被當成閘門", () => {
    const source = workflow(["node tools/conformance/src/cli.ts"], true);
    expect(extractTierCommands(source)).toEqual(new Set(["node tools/conformance/src/cli.ts"]));
  });

  it("非閘門的步驟（vp check、快取）不會被當成閘門", () => {
    const source =
      "steps:\n" +
      "      - run: ./node_modules/.bin/vp check\n" +
      "      - run: ./node_modules/.bin/vp run -r test\n" +
      "      - run: node tools/doc-facts/src/cli.ts\n";
    expect(extractTierCommands(source)).toEqual(new Set(["node tools/doc-facts/src/cli.ts"]));
  });

  it("行尾註解不算指令的一部分", () => {
    // 實測過的假陽性：加一句理由會同時報「少一道」與「多一道」。
    const source = "steps:\n      - run: node tools/doc-facts/src/cli.ts  # A1：只守推導得出來的\n";
    expect(extractTierCommands(source)).toEqual(new Set(["node tools/doc-facts/src/cli.ts"]));
  });

  it("指令自己帶的 # 不會被當成註解", () => {
    // 只有**空白之後**的 `#` 才開始註解，YAML 就是這樣界定的。這條規矩要緊，
    // 因為這個 repo 真的有帶 `#` 的指令（`vp run console#dev`）—— 若是見 `#`
    // 就截斷，那種指令會被砍成半截。
    const source =
      "steps:\n      - run: ./node_modules/.bin/eslint . --max-warnings=0 --rulesdir a#b\n";
    expect(extractTierCommands(source)).toEqual(
      new Set(["./node_modules/.bin/eslint . --max-warnings=0 --rulesdir a#b"]),
    );
  });

  it("CI 版的 eslint 路徑抓得到", () => {
    const source = "steps:\n      - run: ./node_modules/.bin/eslint . --max-warnings=0\n";
    expect(extractTierCommands(source)).toEqual(
      new Set(["./node_modules/.bin/eslint . --max-warnings=0"]),
    );
  });
});

describe("名冊本身的約束", () => {
  it("每道閘門至少排在一層", () => {
    for (const gate of GATES) expect(gate.tiers.length, gate.id).toBeGreaterThan(0);
  });

  it("代號不重複", () => {
    const ids = GATES.map((gate: Gate) => gate.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("刻意不接的每一個都寫了理由", () => {
    // 理由是這份清單唯一的用處：少了它，「漏接」與「刻意不接」長得一樣。
    for (const entry of UNGATED) expect(entry.why.length, entry.pkg).toBeGreaterThan(20);
  });

  it("ciCommand 只在真的不一樣的時候才寫", () => {
    // 寫一個與 command 相同的 ciCommand 不會出錯，只會讓下一個讀的人
    // 以為那裡有個他沒看懂的差異。
    for (const gate of GATES) {
      if (gate.ciCommand !== undefined) expect(gate.ciCommand, gate.id).not.toBe(gate.command);
    }
  });

  it("每個 variant 都寫了理由", () => {
    // 與 UNGATED 的理由同一條規矩：同一支工具在 CI 多跑一次，是最容易
    // 悄悄長出來的東西。一句必填的理由讓「刻意多跑」與「不小心多貼一行」
    // 長得不一樣。
    for (const gate of GATES) {
      for (const variant of gate.variants ?? []) {
        expect(variant.why.length, `${gate.id} → ${variant.command}`).toBeGreaterThan(20);
      }
    }
  });

  it("variant 的指令不會與主指令重複", () => {
    // 重複的話 Set 會吸收掉它，於是那一行「登記過」是假的 —— 拿掉 variant
    // 也不會有人說話。
    for (const gate of GATES) {
      for (const variant of gate.variants ?? []) {
        expect(variant.command, gate.id).not.toBe(gate.ciCommand ?? gate.command);
      }
    }
  });

  it("不進 scripts.gate 的閘門，理由要寫得出本機由什麼涵蓋", () => {
    for (const gate of GATES) {
      if (gate.notInGateScript === undefined) continue;
      expect(gate.notInGateScript.length, gate.id).toBeGreaterThan(20);
      // 它仍然必須有別名 —— 少一個別名不會造成假綠燈，但會讓文件裡那行
      // 指令直接不存在。
      expect(gate.pkg, gate.id).toBeDefined();
    }
  });
});

describe("main 上多出來的三種形狀（C74）", () => {
  it("workflow 少跑一個已登記的 variant 會紅", () => {
    // 這是 variants 存在的理由的另一半：登記讓它不再被誤報成「多一道」，
    // 但登記之後它就**必須真的在** —— 否則 `--evidence` 那一步被誰刪掉，
    // 名冊不會說話。
    const root = broken((layout) => {
      layout.tier2Commands = layout.tier2Commands.filter(
        (command) => !command.endsWith("--evidence"),
      );
    });
    expect(kinds(root)).toContain("workflow 少一道");
  });

  it("workflow 多跑一個沒登記的變體會紅", () => {
    const root = broken((layout) => {
      layout.tier2Commands.push("node tools/compliance/src/cli.ts --something-new");
    });
    expect(kinds(root)).toContain("workflow 多一道");
  });

  it("帶 notInGateScript 的閘門被塞進 scripts.gate 會紅", () => {
    // 反過來的方向：那個欄位說「本機不跑這個」，塞進去就是與它自己矛盾。
    const root = broken((layout) => {
      layout.scripts["gate"] = `${layout.scripts["gate"]} && vp run -F @org/bff-check test`;
    });
    expect(kinds(root)).toContain("scripts.gate 對不上");
  });

  it("沒有 cli.ts 的閘門（vitest 形狀）從 workflow 消失會紅", () => {
    // `tools/bff-check` 就是一包測試。少了 GATE_SHAPED 那一段，它在這道
    // 閘門眼裡完全隱形 —— 有人把那一步拿掉，名冊會說「一切正常」。
    const root = broken((layout) => {
      layout.tier2Commands = layout.tier2Commands.filter(
        (command) => !command.includes("vitest run --root"),
      );
    });
    expect(kinds(root)).toContain("workflow 少一道");
  });

  it("vitest 步驟的指令抓得到", () => {
    const source = "steps:\n      - run: ./node_modules/.bin/vitest run --root tools/bff-check\n";
    expect(extractTierCommands(source)).toEqual(
      new Set(["./node_modules/.bin/vitest run --root tools/bff-check"]),
    );
  });

  it("跑全 repo 測試的那一行不是閘門形狀", () => {
    // `vp run -r test` 與 `vitest run`（不帶 --root tools/）都不該被當成
    // 沒登記的閘門 —— 樣式要窄到只認「對 tools/ 底下某一包跑的測試」。
    const source =
      "steps:\n      - run: ./node_modules/.bin/vp run -r test\n" +
      "      - run: ./node_modules/.bin/vitest run\n";
    expect(extractTierCommands(source)).toEqual(new Set());
  });
});
