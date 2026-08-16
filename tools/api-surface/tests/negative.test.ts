import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `tools/api-surface` 的**反向測試**。
 *
 * ── 兩種破壞法，因為這道閘門有兩半 ──────────────────────────────────
 *
 * **改基準檔的副本**：問「基準說有、現況沒有 → 會不會紅」。
 * 直覺的做法是去 `platform/*` 刪一個 export 再還原 —— 能動，但跑到一半
 * 被中斷 repo 就壞著，而且是安靜地壞。改副本對閘門而言完全等價
 *（它比的就是這兩邊），而 `platform/` 一個位元組都沒被動到。
 * `--baseline` 就是為此加的。
 *
 * **改 fixture 套件的原始碼**：問反過來的那一半 ——「這個重構**不該**
 * 讓形狀漂移」。屬性對調、interface 換 type、改名私有型別，改的是來源
 * 不是記錄，副本問不出來。fixture 會先整個複製到暫存目錄再改，
 * `--platform` 指過去。理由寫在 tests/fixtures/README.md。
 *
 * 2026-08-16 這支從「只比對名稱」重做成「比對型別形狀」，測試也跟著擴充：
 * 名稱層級的那幾條保留原意，形狀層級的是新的。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CLI = join(ROOT, "tools/api-surface/src/cli.ts");
const REAL_BASELINE = join(ROOT, "tools/api-surface/surface.json");
const FIXTURES = join(ROOT, "tools/api-surface/tests/fixtures");
const FIXTURE_SOURCE = join("sample", "src", "index.ts");
const FIXTURE_COMPONENT = join("sample", "src", "SampleWidget.vue");

interface CodemodRecord {
  name: string;
  removes: string[];
  changes?: string[];
  reason: string;
}

interface ExportShape {
  kind: string;
  members?: string[];
  type?: string;
}

interface Baseline {
  version: number;
  surface: Record<string, Record<string, ExportShape>>;
  codemods: CodemodRecord[];
}

const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "api-surface-negative-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

interface Result {
  readonly red: boolean;
  readonly output: string;
}

function run(args: readonly string[]): Result {
  const result = spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
  return { red: result.status !== 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

// ── 基準副本 ──────────────────────────────────────────────────────────

/** 把真的基準檔複製一份，交給 `mutate` 動手腳，回傳副本路徑。 */
function baselineCopy(mutate: (baseline: Baseline) => void): string {
  const dir = sandbox();
  const baseline = JSON.parse(readFileSync(REAL_BASELINE, "utf8")) as Baseline;
  mutate(baseline);
  const path = join(dir, "surface.json");
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
  return path;
}

/** 基準檔裡第一個模組的名字。不寫死，否則改名就靜靜失效。 */
function anyModule(baseline: Baseline): string {
  const name = Object.keys(baseline.surface)[0];
  if (name === undefined) throw new Error("基準檔裡沒有任何模組 —— 這支測試失去意義");
  return name;
}

/** 基準檔裡第一個帶成員的 export。同樣不寫死名字。 */
function anyShaped(baseline: Baseline): { module: string; symbol: string; shape: ExportShape } {
  for (const [module, shapes] of Object.entries(baseline.surface)) {
    for (const [symbol, shape] of Object.entries(shapes)) {
      if (shape.members !== undefined && shape.members.length > 0) {
        return { module, symbol, shape };
      }
    }
  }
  throw new Error("基準檔裡沒有任何帶成員的 export —— 形狀比對根本沒在跑");
}

function anyOfKind(baseline: Baseline, kind: string): { module: string; symbol: string } {
  for (const [module, shapes] of Object.entries(baseline.surface)) {
    for (const [symbol, shape] of Object.entries(shapes)) {
      if (shape.kind === kind) return { module, symbol };
    }
  }
  throw new Error(`基準檔裡沒有任何 kind=${kind} 的 export`);
}

// ── fixture 套件 ──────────────────────────────────────────────────────

let pristineFixture: string;

beforeAll(() => {
  // 先用未改動的 fixture 產一份基準，之後每條測試都從這份乾淨的複製出去。
  pristineFixture = mkdtempSync(join(tmpdir(), "api-surface-fixture-"));
  cpSync(FIXTURES, pristineFixture, { recursive: true });
  const seeded = spawnSync(
    "node",
    [
      CLI,
      "--platform",
      pristineFixture,
      "--baseline",
      join(pristineFixture, "surface.json"),
      "--update",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (seeded.status !== 0) {
    throw new Error(`fixture 基準產不出來：${seeded.stdout ?? ""}${seeded.stderr ?? ""}`);
  }
  return () => rmSync(pristineFixture, { recursive: true, force: true });
});

/** 複製一份乾淨的 fixture（含基準），對某個檔案動手腳後跑閘門。 */
function runFixtureFile(relative: string, mutate: (source: string) => string): Result {
  const dir = sandbox();
  cpSync(pristineFixture, dir, { recursive: true });
  const file = join(dir, relative);
  const before = readFileSync(file, "utf8");
  const after = mutate(before);
  if (after === before) throw new Error("fixture 改寫沒生效 —— 比對字串沒對上，這條測試是空的");
  writeFileSync(file, after);
  return run(["--platform", dir, "--baseline", join(dir, "surface.json")]);
}

function runFixture(mutate: (source: string) => string): Result {
  return runFixtureFile(FIXTURE_SOURCE, mutate);
}

// ── 對照組 ────────────────────────────────────────────────────────────

describe("對照組：沒動過的東西是綠的", () => {
  /**
   * ⚠️ 這一組必須先過，否則下面每一條都沒有意義 ——
   * 只要複製或 `--baseline` 解析壞了，所有「該紅」的測試都會「成功變紅」，
   * 而原因是環境壞了。
   */
  it("原封不動複製一份基準 → 通過", () => {
    const result = run(["--baseline", baselineCopy(() => {})]);
    expect(result.red, result.output).toBe(false);
    expect(result.output).toContain("無破壞性變更");
  });

  it("真的 repo 本身也是綠的（不帶參數）", () => {
    const result = run([]);
    expect(result.red, result.output).toBe(false);
  });

  it("fixture 原封不動 → 通過", () => {
    const dir = sandbox();
    cpSync(pristineFixture, dir, { recursive: true });
    const result = run(["--platform", dir, "--baseline", join(dir, "surface.json")]);
    expect(result.red, result.output).toBe(false);
  });
});

// ── export 層級：名稱不見了 ───────────────────────────────────────────

describe("整個 export 不見了", () => {
  it("🔴 基準說有、現況沒有的 export → 紅", () => {
    const path = baselineCopy((baseline) => {
      const module = anyModule(baseline);
      baseline.surface[module]!["zzRemovedOnPurpose"] = { kind: "value", type: "1" };
    });

    const result = run(["--baseline", path]);
    expect(result.red, `仍然綠燈 —— D12 的 codemod 規則沒有牙齒\n${result.output}`).toBe(true);
    expect(result.output).toContain("zzRemovedOnPurpose");
    // 訊息必須講出補救步驟，否則看到紅燈的人只會把 export 加回去。
    expect(result.output).toContain("codemod");
  });

  it("一次移除多個 → 全部列出，不是只報第一個", () => {
    const path = baselineCopy((baseline) => {
      const module = anyModule(baseline);
      baseline.surface[module]!["zzGoneA"] = { kind: "value", type: "1" };
      baseline.surface[module]!["zzGoneB"] = { kind: "value", type: "2" };
    });

    const result = run(["--baseline", path]);
    expect(result.output).toContain("zzGoneA");
    expect(result.output).toContain("zzGoneB");
  });

  it("基準有一個根本不存在的模組 → 紅", () => {
    const path = baselineCopy((baseline) => {
      baseline.surface["@org/zz-never-existed"] = { thing: { kind: "value", type: "1" } };
    });

    const result = run(["--baseline", path]);
    expect(result.red).toBe(true);
    expect(result.output).toContain("@org/zz-never-existed");
  });
});

// ── 形狀層級：名字都還在，但型別變了 ─────────────────────────────────

describe("形狀變了（名稱一個都沒動）", () => {
  /**
   * 這一組就是這次重做的理由。2026-08-16 `Feature` 加了一個必填的
   * `personalData`，下游每一個切片都會編譯失敗 —— 而舊版閘門一聲不吭，
   * 因為它只比名稱。
   */
  it("🔴 現況多了一個必填成員 → 紅", () => {
    const path = baselineCopy((baseline) => {
      const { module, symbol, shape } = anyShaped(baseline);
      // 從基準拿掉一個成員 ⇒ 對閘門而言等於現況多了一個必填成員。
      shape.members = shape.members!.slice(1);
      baseline.surface[module]![symbol] = shape;
    });

    const result = run(["--baseline", path]);
    expect(result.red, `形狀多了必填成員卻沒說話 —— 這正是重做前的盲點\n${result.output}`).toBe(
      true,
    );
    expect(result.output).toContain("必填");
  });

  it("🔴 現況少了一個成員 → 紅", () => {
    const path = baselineCopy((baseline) => {
      const { module, symbol, shape } = anyShaped(baseline);
      shape.members = [...shape.members!, "zzGoneMember: string"];
      baseline.surface[module]![symbol] = shape;
    });

    const result = run(["--baseline", path]);
    expect(result.red).toBe(true);
    expect(result.output).toContain("zzGoneMember");
  });

  it("★ 必填 → 選填也算破壞性（反直覺，所以釘住）", () => {
    // 對「產生物件的人」變寬鬆了，但對「讀屬性的人」型別多了 undefined，
    // 在 strict 之下每一處讀取都編不過。判準只有一條：下游會不會編不過。
    const path = baselineCopy((baseline) => {
      baseline.surface["@org/slice-kit"] = {
        Feature: { kind: "type", members: ["permissions?: readonly string[] | undefined"] },
      };
    });

    const result = run(["--baseline", path]);
    expect(result.red, `必填 → 選填被放行了\n${result.output}`).toBe(true);
    expect(result.output).toContain("破壞性");
  });

  // 「新增選填成員 → 相容」沒辦法用基準副本問：從副本拿掉一個選填成員，
  // 對閘門而言是「現況多了一個選填成員」沒錯，但反過來加一個，就變成
  // 「現況少了它」= 移除。要問對方向必須真的改原始碼，所以那條在 fixture 那組。

  it("🔴 class 的建構子簽章變了 → 紅", () => {
    const path = baselineCopy((baseline) => {
      const { module, symbol } = anyOfKind(baseline, "class");
      const shape = baseline.surface[module]![symbol]!;
      shape.members = shape.members!.map((member) =>
        member.startsWith("new (") ? member.replace("new (", "new (zzExtra: string, ") : member,
      );
    });

    const result = run(["--baseline", path]);
    expect(result.red, `class 的建構子換了簽章卻沒說話\n${result.output}`).toBe(true);
    expect(result.output).toContain("new (");
  });

  it("🔴 索引簽章的值型別變了 → 紅", () => {
    // getPropertiesOfType 看不到索引簽章。少了那一段，這種 interface 會被記成
    // 一個空形狀，改索引型別完全不漂移。
    const path = baselineCopy((baseline) => {
      baseline.surface["@org/bff-contract"] = {
        CookieAttributes: { kind: "type", members: ["[index string] readonly: number"] },
      };
    });

    const result = run(["--baseline", path]);
    expect(result.red, `索引簽章沒有被比對\n${result.output}`).toBe(true);
    expect(result.output).toContain("index string");
  });

  it("🔴 .vue 元件的 prop 變了 → 紅", () => {
    // `declare module "*.vue"` 讓 checker 對兩個元件回報一模一樣的型別，
    // 所以元件的形狀是另外從 SFC 解析出來的。這條確認那條路真的接上了。
    const path = baselineCopy((baseline) => {
      const shape = baseline.surface["@org/ui"]?.["UiButton"];
      expect(shape?.members, "UiButton 沒有 props —— SFC 解析沒有接上").toBeDefined();
      shape!.members = [...shape!.members!, "zzGoneProp?: string"];
    });

    const result = run(["--baseline", path]);
    expect(result.red).toBe(true);
    expect(result.output).toContain("zzGoneProp");
  });

  it("★ 純資料常數的型別變了 → 算相容，不要求 codemod", () => {
    // 常數的字面型別跟著內容跑。判成破壞性的話，每改一條設定就要寫一份
    // 不存在的 codemod —— 那種閘門會被關掉（C57）。代價寫在 shape.ts。
    const path = baselineCopy((baseline) => {
      const { module, symbol } = anyOfKind(baseline, "value");
      baseline.surface[module]![symbol] = { kind: "value", type: '"zz-old-value"' };
    });

    const result = run(["--baseline", path]);
    expect(result.red).toBe(true);
    expect(result.output).toContain("相容變更");
    expect(result.output).not.toContain("破壞性變更");
  });

  it("🔴 帶簽章的 export 型別變了 → 破壞性", () => {
    const path = baselineCopy((baseline) => {
      const { module, symbol } = anyOfKind(baseline, "function");
      baseline.surface[module]![symbol] = { kind: "function", type: "(zz: number) => void" };
    });

    const result = run(["--baseline", path]);
    expect(result.red).toBe(true);
    expect(result.output).toContain("破壞性變更");
  });
});

// ── codemod 是唯一的合法出口 ─────────────────────────────────────────

describe("codemod 是唯一的合法出口", () => {
  const EXISTING = "rename-feature-kit-to-slice-kit";

  it("★ 登記了對應 codemod 的移除 → 放行", () => {
    // D12 刻意留的路：做得到 codemod 的 breaking change 可以過。
    // 誤擋這一種，規則就會被整個繞過。
    const path = baselineCopy((baseline) => {
      const module = anyModule(baseline);
      baseline.surface[module]!["zzMigrated"] = { kind: "value", type: "1" };
      baseline.codemods = [
        ...baseline.codemods,
        { name: EXISTING, removes: [`${module}#zzMigrated`], reason: "測試用" },
      ];
    });

    const result = run(["--baseline", path]);
    expect(
      result.red,
      `誤擋 —— 合法的 breaking change 走不通，規則會被繞過\n${result.output}`,
    ).toBe(false);
  });

  it("★ 登記了對應 codemod 的『形狀變更』→ 放行", () => {
    /**
     * 這一條是這次重做最要緊的一格。
     *
     * 催生重做的變更是「`Feature` 加一個必填欄位」—— 它不移除任何東西，
     * 所以 `removes` 登記不了。少了 `changes`，唯一能讓 CI 變綠的辦法是
     * 把那個變更收回去，而一道對合法變更沒有出口的閘門，
     * 最後被拿掉的是閘門本身（C57）。
     */
    const path = baselineCopy((baseline) => {
      const { module, symbol, shape } = anyShaped(baseline);
      shape.members = shape.members!.slice(1);
      baseline.surface[module]![symbol] = shape;
      baseline.codemods = [
        ...baseline.codemods,
        { name: EXISTING, removes: [], changes: [`${module}#${symbol}`], reason: "測試用" },
      ];
    });

    const result = run(["--baseline", path]);
    expect(result.red, `登記過的形狀變更仍被擋下 —— 這道閘門沒有合法出口\n${result.output}`).toBe(
      false,
    );
  });

  it("🔴 登記了不存在的 codemod 檔案 → 紅", () => {
    // 「登記」與「真的有那支 codemod」是兩件事。少了這道檢查，
    // 任何人都可以用一行 JSON 讓 breaking change 過關。
    const path = baselineCopy((baseline) => {
      baseline.codemods = [
        ...baseline.codemods,
        { name: "zz-does-not-exist", removes: [], reason: "測試用" },
      ];
    });

    const result = run(["--baseline", path]);
    expect(result.red, `仍然綠燈 —— 登記一個不存在的 codemod 就能繞過\n${result.output}`).toBe(
      true,
    );
    expect(result.output).toContain("zz-does-not-exist");
  });

  it("★ changes 登記的是別的 export → 不得放行", () => {
    // 最容易寫錯的一種：只看「有沒有登記」而不看「登記的是不是這一個」。
    const path = baselineCopy((baseline) => {
      const { module, symbol, shape } = anyShaped(baseline);
      shape.members = shape.members!.slice(1);
      baseline.surface[module]![symbol] = shape;
      baseline.codemods = [
        ...baseline.codemods,
        { name: EXISTING, removes: [], changes: [`${module}#zzSomethingElse`], reason: "測試用" },
      ];
    });

    const result = run(["--baseline", path]);
    expect(result.red, `登記別的 export 就能過 —— 那等於沒有規則\n${result.output}`).toBe(true);
  });

  it("★ removes 的登記不得赦免『形狀變更』", () => {
    /**
     * 兩個欄位的赦免範圍是分開的，這條釘住那件事。
     *
     * 合成同一個集合的話，一筆很久以前「我刪掉了 X」的登記，會順便讓
     * 之後每一次「X 的形狀變了」都永遠過關 —— 而那些變更登記者從來沒看過，
     * 也沒有任何 codemod 對應。
     */
    const path = baselineCopy((baseline) => {
      const { module, symbol, shape } = anyShaped(baseline);
      shape.members = shape.members!.slice(1);
      baseline.surface[module]![symbol] = shape;
      baseline.codemods = [
        ...baseline.codemods,
        { name: EXISTING, removes: [`${module}#${symbol}`], reason: "測試用" },
      ];
    });

    const result = run(["--baseline", path]);
    expect(result.red, `removes 把形狀變更也赦免了\n${result.output}`).toBe(true);
  });
});

// ── 基準檔格式 ────────────────────────────────────────────────────────

describe("基準檔格式", () => {
  it("🔴 舊版（第 1 版）格式 → 紅，而且要講出補救步驟", () => {
    /**
     * 第 1 版的 `surface` 是 `{ 模組: string[] }`。當成第 2 版讀，
     * `Object.entries` 會吐出索引鍵（"0"、"1"…），比出來的是一堆
     * 憑空冒出來的違規 —— 或者反過來一片綠。兩種都是**對一份沒讀懂的
     * 基準檔給出判決**，而那比沒有判決更糟。
     */
    const dir = sandbox();
    const path = join(dir, "surface.json");
    writeFileSync(
      path,
      JSON.stringify({ surface: { "@org/pii": ["maskName", "maskEmail"] }, codemods: [] }),
    );

    const result = run(["--baseline", path]);
    expect(result.red, `舊格式被當成新格式讀了\n${result.output}`).toBe(true);
    expect(result.output).toContain("--update");
  });

  it("★ 沒有 version 欄位也要紅（不能猜它是新版）", () => {
    const dir = sandbox();
    const path = join(dir, "surface.json");
    writeFileSync(path, JSON.stringify({ surface: {}, codemods: [] }));

    const result = run(["--baseline", path]);
    expect(result.red).toBe(true);
  });
});

// ── 參數本身 ──────────────────────────────────────────────────────────

describe("參數本身", () => {
  it("--baseline 後面沒接東西 → 紅", () => {
    expect(run(["--baseline"]).red).toBe(true);
  });

  it("--platform 後面沒接東西 → 紅", () => {
    expect(run(["--platform"]).red).toBe(true);
  });

  it("★ 指到不存在的檔案 → 紅（我原本以為它會靜靜通過）", () => {
    // 寫這條時我預期的是「空基準 → 沒有移除 → 綠燈」，並準備在註解裡
    // 警告「路徑打錯會靜默通過」。**實際行為比那安全**：
    // 空基準之下，現況的每一個 export 都算「未登記的變更」，於是它紅了。
    const result = run(["--baseline", join(sandbox(), "nope.json")]);
    expect(result.red).toBe(true);
    expect(result.output).toContain("未登記在基準中");
  });
});

// ── 重構不該讓形狀漂移 ───────────────────────────────────────────────

describe("這些重構不該讓形狀漂移", () => {
  /**
   * 每一條都是實測出來的。重做期間有兩條原本是紅的：屬性重排（改成排序後
   * 才記錄）、以及公開簽章裡的私有型別（改成前置條件擋在前面）。
   * 留著它們，是因為下一個改這支工具的人很可能會不小心把其中一條弄回去。
   */
  it("★ 把屬性的宣告順序對調 → 綠", () => {
    const result = runFixture((source) =>
      source.replace(
        "  readonly retries?: number;\n  readonly tags: readonly string[];",
        "  readonly tags: readonly string[];\n  readonly retries?: number;",
      ),
    );
    expect(result.red, `屬性順序對消費端沒有意義，卻漂移了\n${result.output}`).toBe(false);
  });

  it("★ interface 換成等價的 type → 綠", () => {
    const result = runFixture((source) =>
      source
        .replace("export interface SampleOptions {", "export type SampleOptions = {")
        .replace(
          "  readonly tags: readonly string[];\n}",
          "  readonly tags: readonly string[];\n};",
        ),
    );
    expect(result.red, `換個宣告寫法就漂移\n${result.output}`).toBe(false);
  });

  it("★ 在屬性上加一行 JSDoc → 綠", () => {
    const result = runFixture((source) =>
      source.replace(
        "  readonly tags: readonly string[];",
        "  /** 這一行只是註解。 */\n  readonly tags: readonly string[];",
      ),
    );
    expect(result.red, `加註解就漂移\n${result.output}`).toBe(false);
  });

  it("★ 改名一個沒出現在公開簽章裡的私有型別 → 綠", () => {
    const result = runFixture((source) => source.replaceAll("InternalOnly", "ScratchShape"));
    expect(result.red, `消費端看不見的型別改名不該漂移\n${result.output}`).toBe(false);
  });

  it("★ 新增一個選填成員 → 紅，但歸類是「相容」", () => {
    const result = runFixture((source) =>
      source.replace(
        "  readonly tags: readonly string[];",
        "  readonly tags: readonly string[];\n  readonly zzNote?: string;",
      ),
    );
    expect(result.red).toBe(true);
    expect(result.output).toContain("相容變更");
    expect(result.output).toContain("zzNote");
    expect(result.output).not.toContain("破壞性變更");
  });

  it("🔴 匿名物件常數少了一個欄位 → 破壞性，不是相容", () => {
    /**
     * 「沒有呼叫簽章的 export 算純資料、型別變了只算相容」這條寬鬆規則，
     * 一開始把 `config`（一個 getter 物件）也算了進去 —— 於是拿掉
     * `config.appTitle` 會被判成相容，而每個讀它的地方都編不過。
     *
     * 那與「判準只有一條：下游會不會編不過」直接矛盾，也是這支工具剛剛
     * 才在 `UiButton.vue` 修掉的同一種毛病：**一句不成立的保護聲明**。
     * 現在匿名物件改記成員，寬鬆那一側只剩字面量、陣列、tuple。
     */
    const result = runFixture((source) =>
      source.replace('  retries: 3,\n  label: "sample",', '  label: "sample",'),
    );
    expect(result.red).toBe(true);
    expect(result.output).toContain("破壞性變更");
    expect(result.output).toContain("retries");
  });

  it("★ 字面量常數的值變了 → 相容（寬鬆那一側只剩這種）", () => {
    // 常數的字面型別跟著內容跑，那不是編不過的來源。判成破壞性的話，
    // 每改一條設定就要人寫一份不存在的 codemod，而那種紅燈會被關掉。
    const result = runFixture((source) =>
      source.replace("export const SAMPLE_LIMIT = 10;", "export const SAMPLE_LIMIT = 25;"),
    );
    expect(result.red).toBe(true);
    expect(result.output).toContain("相容變更");
    expect(result.output).not.toContain("破壞性變更");
  });

  it("🔴 公開簽章引用私有型別 → 紅，而且要指名是哪一個", () => {
    /**
     * 這是整個設計的前置條件。`typeToString` 對具名型別一律印名字，
     * 而**沒有任何 NodeBuilderFlags 會把非匯出的型別展開成結構**（實測掃過）。
     * 於是一個消費端看不見的改名會漂移、被判成破壞性、然後要求一份
     * 根本不需要的 codemod。所以擋在前面，補救是加一個 `export`。
     */
    const result = runFixture((source) =>
      source.replace(
        "export function makeSample(options: SampleOptions): SampleTable {",
        "export function makeSample(options: SampleOptions, scratch?: InternalOnly): SampleTable {",
      ),
    );
    expect(result.red, `私有型別漏進公開簽章卻沒被擋下\n${result.output}`).toBe(true);
    expect(result.output).toContain("InternalOnly");
    expect(result.output).toContain("export");
  });
});

// ── `.vue` 元件 ───────────────────────────────────────────────────────

describe(".vue 元件的公開面", () => {
  /**
   * checker 對每個元件都回報同一個 shim 型別，所以元件的形狀是直接解析
   * SFC 得到的。文字解析的涵蓋範圍必須寫死 —— 只認 props 卻記成一份
   * 完整形狀，就是「看起來有守、其實沒守」。這一組釘住那條界線。
   */
  it("🔴 元件加一個必填 prop → 紅", () => {
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("  label: string;", "  label: string;\n  ariaLabel: string;"),
    );
    expect(result.red, `元件 prop 的變更沒有被看見\n${result.output}`).toBe(true);
    expect(result.output).toContain("ariaLabel");
  });

  it("🔴 元件用了 defineEmits → 直接丟例外，而且要說是哪個檔案", () => {
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("defineProps<{", 'defineEmits<{ (e: "go"): void }>();\n\ndefineProps<{'),
    );
    expect(result.red, `emits 沒被擋下 —— 記下來的形狀會是不完整的\n${result.output}`).toBe(true);
    expect(result.output).toContain("SampleWidget.vue");
    expect(result.output).toContain("defineEmits");
  });

  it("★ 只在**註解**裡提到 defineEmits → 不得紅", () => {
    /**
     * 這條是被自己絆倒之後補的。`UiButton.vue` 的說明裡寫了一句
     * 「加 defineEmits 會讓 api-surface 丟例外」，於是這支解析讀到自己的
     * 警語，然後對那個檔案丟了例外 —— 訊息看起來完全正確，指的卻是註解。
     *
     * 修法是掃原始碼前先剝掉註解。留這條，是因為下一個人很可能會在
     * 別的地方重新加一個沒剝註解的掃描。
     */
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace(
        "type Tone =",
        "// 這個元件刻意不用 defineEmits / defineSlots / defineExpose。\ntype Tone =",
      ),
    );
    expect(result.red, `註解裡的字被當成程式碼了\n${result.output}`).toBe(false);
  });

  it("★ 改名 SFC 裡的區域型別別名 → 綠", () => {
    // `Tone` 只活在這個 <script setup> 裡，消費端看到的是展開後的聯集。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replaceAll("Tone", "Loudness"),
    );
    expect(result.red, `元件內的私有型別改名不該漂移\n${result.output}`).toBe(false);
  });
});

// ── repo 沒有被動到 ──────────────────────────────────────────────────

describe("repo 沒有被動到", () => {
  it("跑完之後真的 surface.json 內容不變", () => {
    const before = readFileSync(REAL_BASELINE, "utf8");
    run([
      "--baseline",
      baselineCopy((baseline) => {
        baseline.surface[anyModule(baseline)] = { zzWiped: { kind: "value", type: "1" } };
      }),
    ]);
    expect(readFileSync(REAL_BASELINE, "utf8")).toBe(before);
  });

  it("跑 fixture 不會動到 repo 裡的 fixture 原始碼", () => {
    const file = join(FIXTURES, FIXTURE_SOURCE);
    const before = readFileSync(file, "utf8");
    runFixture((source) => source.replaceAll("InternalOnly", "ScratchShape"));
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});
