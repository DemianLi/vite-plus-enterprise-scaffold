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

/**
 * 改一個 fixture 檔之後跑 `--update`，回傳**重新推導出來的**基準。
 *
 * ⚠️ 與 `runFixtureFile` 的差別是它問的問題不同。比對模式問「這個改動會不會
 * 紅」；這個問「解析器**看到了什麼**」。第一版把兩者混在一起，於是
 * 「拿掉 defineProps 之後解析器沒有丟例外」被寫成了 `expect(red).toBe(false)`
 * —— 而拿掉 prop 本來就該紅，測試因此在測一件它不打算測的事。
 */
function surfaceAfter(relative: string, mutate: (source: string) => string): Baseline {
  const dir = sandbox();
  cpSync(pristineFixture, dir, { recursive: true });
  const file = join(dir, relative);
  const before = readFileSync(file, "utf8");
  const after = mutate(before);
  if (after === before) throw new Error("fixture 改寫沒生效 —— 比對字串沒對上，這條測試是空的");
  writeFileSync(file, after);

  // ⚠️ 寫到一個**還不存在**的基準路徑。指向既有的那份時 `--update` 會先比對，
  // 而這裡的改寫幾乎一定是破壞性的（prop 被換掉了）—— 於是它在推導之前就紅了，
  // 而我們要問的正是「推導出什麼」。沒有舊基準可比，它就只推導。
  const derived = join(dir, "derived.json");
  const result = run(["--platform", dir, "--baseline", derived, "--update"]);
  if (result.red) throw new Error(`解析失敗：${result.output}`);
  return JSON.parse(readFileSync(derived, "utf8")) as Baseline;
}

/** fixture 元件在基準裡的成員清單。找不到就丟 —— 空清單對空清單是相等的。 */
function widgetMembers(baseline: Baseline): readonly string[] {
  for (const shapes of Object.values(baseline.surface)) {
    const shape = shapes["SampleWidget"];
    if (shape?.members !== undefined) return shape.members;
  }
  throw new Error("基準裡找不到 SampleWidget —— 這條測試是空的");
}

/**
 * 改一段、沒對上就丟。
 *
 * `runFixtureFile`／`surfaceAfter` 只驗「整份有沒有變」，那對單一改寫夠用，
 * 對多段改寫不夠：其中一段沒對上，整份仍然變了，而測試會安靜地在測別的東西。
 */
function replaceOnce(source: string, from: string | RegExp, to: string): string {
  const after = source.replace(from, to);
  if (after === source) throw new Error(`fixture 改寫沒生效：${String(from)} —— 這條測試是空的`);
  return after;
}

/** 把 fixture 元件剝成一個**零公開面**的純版型元件：prop、slot、emit 各一段。 */
function stripSurface(source: string): string {
  let stripped = replaceOnce(source, /defineProps<\{[\s\S]*?\}>\(\);/, "");
  stripped = replaceOnce(stripped, /defineSlots<\{[\s\S]*?\}>\(\);/, "");
  stripped = replaceOnce(stripped, /const emit = defineEmits<\{[\s\S]*?\}>\(\);/, "");
  stripped = replaceOnce(stripped, ` @click="emit('picked', label)"`, "");
  return replaceOnce(stripped, '<slot name="icon" />{{ label }}<slot />', "純版型");
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

  it("★ 真 repo 的綠燈要講出進入點驗過在版控裡（C98）", () => {
    /**
     * ⚠️ **綠燈訊息也是宣稱**（C96）。C98 之前，這個「10 個進入點」是**磁碟上**
     * 的數字 —— 一個沒進版控的 `platform/foo/` 會被算進去，`--update` 會把它
     * 寫進基準，然後 CI 的乾淨 clone 上它全部變成「移除」→ 破壞性變更 →
     * 要求為一個從來不存在於版控的 API 寫 codemod，而那種紅燈沒有合法出口。
     */
    const result = run([]);
    expect(result.output, "綠燈沒講事實來源").toContain("版控");
    // ⚠️ 這一條才是掛在被守的東西上的：那句話只有在檢查**真的跑過**時才印得出來
    //（`verifiedInIndex` 是它算出來的）。少了它，綠燈會退回「那道檢查沒有跑」。
    //
    // 第一版沒有這一條，於是「拿掉整段檢查」這個變異紅零條 —— 綠燈照樣宣稱
    // 它驗過。那正是這個 PR 在修的病，我自己在修它的時候又犯一次。
    expect(result.output, "檢查沒跑，而綠燈卻宣稱驗過").not.toContain("那道檢查沒有跑");
  });

  it("fixture 原封不動 → 通過", () => {
    const dir = sandbox();
    cpSync(pristineFixture, dir, { recursive: true });
    const result = run(["--platform", dir, "--baseline", join(dir, "surface.json")]);
    expect(result.red, result.output).toBe(false);
  });

  it("🔴 --platform 指到別處時，綠燈要講明那道檢查**沒有跑**", () => {
    /**
     * ⚠️ 這一條守的是一個**沉默的略過**。fixture 在 tmpdir 裡，不在任何 index，
     * 所以「進入點在不在版控裡」那道檢查對它沒有意義、刻意不開 ——
     * 但不講的話，這個綠燈看起來跟真 repo 的綠燈一模一樣。
     *
     * 這個 repo 剛為「看起來在守、其實沒有」付過兩次代價（C94、C97）。
     */
    const dir = sandbox();
    cpSync(pristineFixture, dir, { recursive: true });
    const result = run(["--platform", dir, "--baseline", join(dir, "surface.json")]);
    expect(result.output, "沒說那道檢查沒跑").toContain("沒有跑");
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

  it("★ 訊息要對兩種讀者說「下游是誰」，而不去判斷你是哪一種（C98）", () => {
    /**
     * `#95` 第 1 項。這道閘門接在 `vpr ready` 上，而那是 HANDOFF 叫**拉 v1 去做
     * 案子的團隊**第一個跑的東西 —— 給 `platform/ui` 的元件加一個選填 prop 就會撞到。
     *
     * 原本的理由只寫了上游那一種：「`platform/*` 會發成內部套件給各案升級，
     * 所以『下游』也包含不在這個 repo 裡的人」。對一個 fork 了 v1 的團隊那是
     * **假的** —— 他們就是「各案」，不是發布方。而這句話正是這道閘門嚴厲程度的
     * 理由，讀錯了會以為它與自己無關。
     *
     * ⚠️ 跟 C95／C97 一樣**不去偵測「這棵樹是不是上游」** —— 那是 `#91` 在問的。
     */
    const path = baselineCopy((baseline) => {
      const module = anyModule(baseline);
      baseline.surface[module]!["zzTwoReaders"] = { kind: "value", type: "1" };
    });
    const result = run(["--baseline", path]);
    expect(result.red).toBe(true);
    expect(result.output, "沒對 fork 那一種讀者說話").toContain("fork");
    expect(result.output, "沒講上游那一種讀者").toContain("內部套件");
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

  it("🔴 字面值聯集少一個成員 → 破壞性", () => {
    /**
     * ⚠️ **修掉之前，這個改動是完全看不見的。**
     *
     * `type SampleMode = "read" | "write"` 的每個成員都是 string，於是
     * `getPropertiesOfType` 回傳整套 `String.prototype`。實測：`@org/ui` 的
     * `UiVariant` 被記成 123 行的 `charAt`／`blink`／`fontcolor`，
     * 而 union 本身一個字都沒有記到 —— 拿掉 `"ghost"`，形狀字串完全一樣。
     *
     * 那正是這支工具在 `.vue` 的 shim 上踩過的同一種瞎法，只是這次發生在
     * 一個**看起來已經記了很多東西**的條目上：123 行的成員清單讓它
     * 比真正有守的條目更像有守。
     */
    const result = runFixture((source) =>
      source.replace(
        'export type SampleMode = "read" | "write";',
        'export type SampleMode = "read";',
      ),
    );
    expect(result.red).toBe(true);
    expect(result.output).toContain("破壞性變更");
    expect(result.output).toContain("SampleMode");
    expect(result.output).toContain("write");
  });

  it("🔴 字面值聯集**加**一個成員 → 也是破壞性", () => {
    /**
     * 直覺會說這該是「相容」—— 既有消費端傳的值仍然合法。**但那只看了輸入端。**
     *
     * 聯集同時是輸出端的形狀：下游只要有一張 `Record<SampleMode, …>`
     * （`@org/ui` 的 `VARIANTS` 就是），或一個窮舉的 `switch`，
     * 加一個成員他們**當場編不過**。判準只有一條 —— 下游會不會編不過 ——
     * 而這裡答案是會。
     *
     * 記下來是因為它有代價：`UiVariant` 加第五個 variant 要走 D12 登記。
     * 那個代價是對的（所有案子都會拿到那個 variant，該有人看過），
     * 但沒寫下來的話，第一個踩到的人會以為是閘門壞了。
     */
    const result = runFixture((source) =>
      source.replace(
        'export type SampleMode = "read" | "write";',
        'export type SampleMode = "read" | "write" | "zzAppend";',
      ),
    );
    expect(result.red).toBe(true);
    expect(result.output).toContain("破壞性變更");
    expect(result.output).toContain("zzAppend");
  });

  it("★ 聯集記的是成員，不是它自己的名字", () => {
    /**
     * `typeToString` 對帶 aliasSymbol 的型別回傳**別名的名字**，
     * 所以第一版修法記出來的是 `{"kind":"type","type":"SampleMode"}` ——
     * 一個把自己的名字當成自己形狀的條目。改名抓得到（鍵變了），
     * 改內容抓不到，而改內容才是破壞下游的那一種。
     */
    const dir = sandbox();
    cpSync(pristineFixture, dir, { recursive: true });
    const baseline = JSON.parse(readFileSync(join(dir, "surface.json"), "utf8")) as Baseline;
    const shapes = Object.values(baseline.surface)[0] as Record<string, ExportShape>;

    expect(shapes["SampleMode"]?.type).toBe('"read" | "write"');
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

  it("🔴 元件用了 defineExpose → 直接丟例外，而且要說是哪個檔案", () => {
    // 三個巨集裡只剩它擋著。理由不是「還沒做」，是 `<script setup>` 預設封閉：
    // 沒有這個巨集，一個實例成員都洩不出去 —— 它的絆線是真的。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("defineProps<{", "defineExpose({ focus: () => {} });\n\ndefineProps<{"),
    );
    expect(result.red, `expose 沒被擋下 —— 整個實例面會少掉\n${result.output}`).toBe(true);
    expect(result.output).toContain("SampleWidget.vue");
    expect(result.output).toContain("defineExpose");
  });

  /**
   * ── 沒有 `defineProps` 的元件（2026-08-17 補）────────────────────────
   *
   * 這裡原本無條件丟例外，訊息是「找不到 `defineProps<{…}>()`」。它擋住的
   * 第一個真實案例是 `UiInput` —— 一個只有 `defineModel` 的輸入框，公開面
   * 是 `modelValue` 與 `update:modelValue`，兩樣都不經 `defineProps`。
   *
   * 那個錯誤訊息**聽起來完全正確**，指的卻是解析器的假設，不是元件的問題。
   * 與 `defineEmits`／`defineSlots` 那道絆線是同一種：**絆的是宣告的形式，
   * 不是公開面本身。**
   */
  it("★ 只有 defineModel、沒有 defineProps → 解析得出來，而且 modelValue 進得了表面", () => {
    /**
     * 這一條同時修掉兩個缺口，兩個都是抄第一個 shadcn 元件時撞到的：
     *
     * 一、沒有 `defineProps` **原本無條件丟例外**。訊息是「找不到
     *     defineProps<{…}>()」—— 聽起來完全正確，指的卻是解析器的假設。
     *     `UiInput` 是個只有 `defineModel` 的輸入框，公開面是 `modelValue`
     *     與 `update:modelValue`，兩樣都不經 defineProps。
     *
     * 二、`defineModel` 的樣式原本寫成 `defineModel<T>("name"` ——
     *     **只認具名的那一種**。於是不具名形式產生的 `modelValue` 與
     *     `update:modelValue` **安靜地不進 API 表面**，正是這支工具檔頭
     *     說要避免的「少算」，發生在它自己身上。
     *
     * ⚠️ 驗的是**記錄下來的內容**，不是「有沒有丟例外」。第一版寫成
     * `expect(red).toBe(false)` —— 而拿掉 prop 本來就該紅，那條測試在測
     * 一件它不打算測的事。比對模式問「會不會紅」，這裡要問的是
     * 「解析器看到了什麼」，兩者要分開。
     */
    const members = widgetMembers(
      surfaceAfter(FIXTURE_COMPONENT, (source) =>
        source
          .replace(/defineProps<\{[\s\S]*?\}>\(\);/, "const model = defineModel<string>();")
          .replace("{{ label }}", "{{ model }}"),
      ),
    );
    expect(members).toContain("modelValue?: string");
    expect(members).toContain("[emit update:modelValue]: void");
  });

  it("★ 具名的 defineModel 不得被算兩次", () => {
    // 兩條樣式（具名／不具名）若都命中同一個宣告，同一個 model 會產生
    // 兩組成員，而基準裡多出來的那一組永遠不會消失。
    const members = widgetMembers(
      surfaceAfter(FIXTURE_COMPONENT, (source) =>
        source
          .replace(/defineProps<\{[\s\S]*?\}>\(\);/, 'const model = defineModel<boolean>("open");')
          .replace("{{ label }}", "{{ model }}"),
      ),
    );
    expect(members.filter((member) => member.startsWith("open"))).toHaveLength(1);
    expect(members).not.toContain("modelValue?: boolean");
  });

  it("★ 巢狀泛型 ＋ 單引號的具名 defineModel → 兩樣都讀得出來", () => {
    /**
     * 三個缺口寫在同一條裡，因為它們是同一個成因：**兩條互斥的正規式之間
     * 一定會有縫**。`<([^>]+)>` 在 `Array<string>` 的內層 `>` 就收尾，
     * 而具名那條只寫了雙引號。任何一個沒對上，這個 model 的兩格公開面
     * 就安靜地不進表面 —— 不是紅燈，是少算，而少算沒有症狀。
     *
     * 改成「先切出型別參數，再看第一個引數是不是字串字面值」之後，
     * 兩種形式走同一條路，所以這條同時問得出巢狀、引號、與不得重複計算。
     */
    const members = widgetMembers(
      surfaceAfter(FIXTURE_COMPONENT, (source) =>
        source
          .replace(
            /defineProps<\{[\s\S]*?\}>\(\);/,
            "const items = defineModel<Array<string>>('items');",
          )
          .replace("{{ label }}", "{{ items }}"),
      ),
    );
    expect(members).toContain("items?: Array<string>");
    expect(members).toContain("[emit update:items]: void");
    expect(members.filter((member) => member.startsWith("items"))).toHaveLength(1);
    expect(members.some((member) => member.startsWith("modelValue"))).toBe(false);
  });

  it("🔴 defineModel 沒有型別參數 → 紅，不是記成 unknown", () => {
    // 執行期形式讀不出型別。記成 `unknown` 的話，把 `String` 換成 `Number`
    // 一個字都不會漂移 —— 而那正是這道閘門存在的理由的反面。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace(
        /defineProps<\{[\s\S]*?\}>\(\);/,
        "const model = defineModel({ type: String });",
      ),
    );
    expect(result.red, `執行期形式的 defineModel 沒被擋下\n${result.output}`).toBe(true);
    expect(result.output).toContain("SampleWidget.vue");
    expect(result.output).toContain("型別參數");
  });

  it("🔴 defineModel 的名字不是字面值 → 紅，不是預設成 modelValue", () => {
    // 讀不出名字卻預設成 `modelValue`，記下來的會是一個**不存在的 prop**，
    // 而真正的那一個永遠不在記錄裡。與 emit 的事件名同一條規則。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace(
        /defineProps<\{[\s\S]*?\}>\(\);/,
        "const key = 'open';\nconst model = defineModel<boolean>(key);",
      ),
    );
    expect(result.red, `讀不出名字的 defineModel 被當成 modelValue 了\n${result.output}`).toBe(
      true,
    );
    // ⚠️ 只斷言「字面值」不夠：`emittedNames` 的訊息裡也有那三個字。
    expect(result.output).toContain("第一個引數");
  });

  it("🔴 defineEmits 用執行期陣列形式 → 紅（這一條在修好之前是綠的）", () => {
    /**
     * `defineProps` 從第一天就有「寫了卻讀不懂就紅」這條絆線，`defineEmits`
     * 與 `defineSlots` 沒有。那個不對稱不是設計，是漏的：陣列形式解析不了，
     * 於是**所有事件安靜消失**，而基準檔看起來仍然記著一份完整的元件形狀 ——
     * 比整個不記更難發現。
     */
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace(
        /const emit = defineEmits<\{[\s\S]*?\}>\(\);/,
        'const emit = defineEmits(["picked"]);',
      ),
    );
    expect(result.red, `執行期形式的 defineEmits 沒被擋下\n${result.output}`).toBe(true);
    // ⚠️ 只斷言 "defineEmits" 會誤判成有守：拿掉這條絆線之後，模板裡那個
    // `emit('picked')` 會讓 assertDeclared 丟例外，而它的訊息也寫著
    // 「請補進 defineEmits」—— 一樣紅，卻是因為別的東西。
    expect(result.output).toContain("不是型別參數形式");
  });

  it("🔴 defineSlots 用具名型別別名 → 紅（展不開就是少算）", () => {
    // 別名的成員這支解析展不開，記下來會是零個 slot —— 而模板裡那兩個
    // `<slot>` 仍然是消費端寫得出來的公開面。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace(
        /defineSlots<\{[\s\S]*?\}>\(\);/,
        "type Slots = { default(): unknown[] };\ndefineSlots<Slots>();",
      ),
    );
    expect(result.red, `別名形式的 defineSlots 沒被擋下\n${result.output}`).toBe(true);
    // 同上：assertDeclared 的「請補進 defineSlots<{…}>()」也含那個字。
    expect(result.output).toContain("不是型別參數形式");
  });

  it("🔴 同一個巨集寫兩次 → 紅（只讀第一個等於安靜忽略其餘）", () => {
    // 解析只讀第一個匹配。Vue 自己也不允許重複呼叫，所以這條大半是防禦性的 ——
    // 但沒有反向測試的防線與沒有防線在輸出上長得一樣，所以還是要問一次。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("defineSlots<{", "defineSlots<{ extra(): unknown[] }>();\n\ndefineSlots<{"),
    );
    expect(result.red, `重複的巨集沒被擋下\n${result.output}`).toBe(true);
    // ⚠️ 拿掉這條絆線之後閘門仍然會紅（只讀到第一個 defineSlots，模板裡的
    // `icon` 就變成沒宣告的 slot）—— 所以要斷言只有這條路會印的字。
    expect(result.output).toContain("出現了 2 次");
  });

  it("★ 零公開面的元件：解析得出來，而且日後長出來的 prop 仍然會漂移", () => {
    /**
     * 這條有兩半，**第二半才是重點**。
     *
     * 第一半：純版型元件（`Separator`／`Skeleton` 這種）以前根本進不了
     * `platform/ui` —— 解析器對「沒有解析出任何公開面」無條件丟例外。放行的
     * 前提是四個巨集都已經有「寫了卻讀不懂就紅」的絆線（上面那幾條），
     * 否則寫錯形式的巨集會安靜地變成一個「合法的零公開面元件」。
     *
     * 第二半：放行之後記下來的是 `members: []`，而這個 repo 自己的慣例是
     * **空成員清單代表改比對型別字串**（見 shape.ts 的 typeShape 與
     * objectMembers）。元件的形狀沒有 `type` 欄位，所以只要 `compare.ts`
     * 也照那個慣例讀，兩半都比不到 —— 這個元件之後長出來的每一個 prop
     * 都不會漂移。那會是一個比舊例外更糟的洞，而且是在一個專門補這種洞的
     * 改動裡加進去的。實測 `compare.ts` 判的是 `members !== undefined`，
     * 所以它是對的 —— 但那是推論，這裡把它變成量測。
     */
    const dir = sandbox();
    cpSync(pristineFixture, dir, { recursive: true });
    const file = join(dir, FIXTURE_COMPONENT);
    writeFileSync(file, stripSurface(readFileSync(file, "utf8")));

    const baseline = join(dir, "empty.json");
    const seeded = run(["--platform", dir, "--baseline", baseline, "--update"]);
    expect(seeded.red, `零公開面的元件解析不了\n${seeded.output}`).toBe(false);
    expect(widgetMembers(JSON.parse(readFileSync(baseline, "utf8")) as Baseline)).toEqual([]);

    writeFileSync(
      file,
      replaceOnce(
        readFileSync(file, "utf8"),
        '<script setup lang="ts">',
        '<script setup lang="ts">\ndefineProps<{ zzAdded: string }>();',
      ),
    );
    const result = run(["--platform", dir, "--baseline", baseline]);
    expect(result.red, `基準是空成員清單，新增 prop 卻沒有漂移\n${result.output}`).toBe(true);
    expect(result.output).toContain("zzAdded");
  });

  it("🔴 寫了 defineProps 但用執行期物件形式 → 仍然要紅", () => {
    // 上面那條放寬的是「完全沒有 defineProps」。**這條防線不能跟著鬆掉** ——
    // 物件形式解析不了，記下來的形狀會少掉全部的 prop，而那是安靜的。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace(/defineProps<\{[\s\S]*?\}>\(\);/, "defineProps({ label: String });"),
    );
    expect(result.red, `執行期物件形式的 defineProps 沒被擋下\n${result.output}`).toBe(true);
    expect(result.output).toContain("SampleWidget.vue");
  });

  it("★ 只在**註解**裡提到 defineExpose → 不得紅", () => {
    /**
     * 這條是被自己絆倒之後補的。`UiButton.vue` 的說明裡寫了一句
     * 「加 defineExpose 會讓 api-surface 丟例外」，於是這支解析讀到自己的
     * 警語，然後對那個檔案丟了例外 —— 訊息看起來完全正確，指的卻是註解。
     *
     * 修法是掃原始碼前先剝掉註解。留這條，是因為下一個人很可能會在
     * 別的地方重新加一個沒剝註解的掃描。
     */
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("type Tone =", "// 這個元件刻意不用 defineExpose。\ntype Tone ="),
    );
    expect(result.red, `註解裡的字被當成程式碼了\n${result.output}`).toBe(false);
  });

  it("★ 只在**模板文字**裡提到 defineExpose → 不得紅", () => {
    /**
     * 上面那條的孿生兄弟，而且是 review 抓出來的：當時的修法是「掃原始碼前
     * 先剝掉註解」，但模板裡的**文字節點**不是註解 —— 一句
     * `<p>這個元件刻意不用 defineExpose…</p>` 照樣讓整支解析丟例外。
     *
     * 同一個坑補了一半。現在巨集只在 `<script setup>` 裡找（見 scriptSetup），
     * 模板整塊留給 assertDeclared。
     */
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("{{ label }}", "{{ label }}<span>不用 defineExpose 洩漏實例</span>"),
    );
    expect(result.red, `模板文字被當成程式碼了\n${result.output}`).toBe(false);
  });

  it("🔴 有 <script> 但不是 setup → 紅（Options API 讀不懂就是零公開面）", () => {
    /**
     * ⚠️ 這一格在「放行空形狀」與這條絆線之間曾經是開著的。實測：把元件換成
     * `export default { props: { label: {…} } }`，基準記成 `members: []`，
     * 接著**再加一個必填 prop，閘門輸出「無破壞性變更」exit 0** ——
     * 那個元件的公開面從此完全不受守護，而基準檔看起來很正常。
     *
     * 舊的「空形狀等於沒有守」那個例外剛好蓋著這一格。拆掉它就要有人接手。
     */
    const result = runFixtureFile(FIXTURE_COMPONENT, () =>
      [
        '<script lang="ts">',
        "export default { props: { label: { type: String, required: true } } };",
        "</script>",
        "",
        "<template>",
        '  <button type="button">{{ label }}</button>',
        "</template>",
        "",
      ].join("\n"),
    );
    expect(result.red, `Options API 的元件被記成零公開面\n${result.output}`).toBe(true);
    // ⚠️ 不能只斷言 "SampleWidget.vue"：這個檔案裡幾乎每條錯誤訊息都有它。
    expect(result.output).toContain("沒有 <script setup>");
  });

  it("★ 完全沒有 <script> 的純版型元件 → 解析得出來，而且是零公開面", () => {
    /**
     * 上一條的反面，而且是這組裡最容易寫錯的一條：`Separator`／`Skeleton`
     * 這種元件**根本沒有 `<script>`**，而它們正是「放行空形狀」要照顧的案例。
     * 絆線收得太寬（例如寫成「沒有 `<script setup>` 就紅」）就把它們一起擋了。
     *
     * ⚠️ 這裡不能用 runFixtureFile：換掉整個元件會讓既有的五個成員消失，
     * 於是紅燈來自「破壞性變更」而不是解析 —— 兩者都是紅，意思完全不同。
     * 所以種一份新的基準來問。
     */
    const dir = sandbox();
    cpSync(pristineFixture, dir, { recursive: true });
    writeFileSync(join(dir, FIXTURE_COMPONENT), "<template>\n  <hr>\n</template>\n");

    const baseline = join(dir, "layout-only.json");
    const seeded = run(["--platform", dir, "--baseline", baseline, "--update"]);
    expect(seeded.red, `純版型元件解析不了\n${seeded.output}`).toBe(false);
    expect(widgetMembers(JSON.parse(readFileSync(baseline, "utf8")) as Baseline)).toEqual([]);
  });

  it("★ 型別參數裡的字串字面值含 `>` → 不得紅", () => {
    /**
     * `genericArgument` 做角括號配對，但一開始不跳過字串字面值 ——
     * 於是 `defineProps<{ arrow: "a>b" }>()` 在字串裡的 `>` 收尾，
     * 接著被判成「不是型別參數形式」。
     *
     * 那個宣告完全合法，而訊息叫人改成執行期形式 —— **正好是這支解析
     * 禁止的方向**。誤報比漏報好，但把人推向錯誤的修法不是。
     */
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("  label: string;", '  arrow: "a>b";\n  label: string;'),
    );
    expect(result.red, `字串字面值裡的 > 被當成泛型收尾\n${result.output}`).toBe(true);
    // 這個改動**應該**漂移（多一個必填 prop），但要是因為多了一格而紅，
    // 不是因為解析不了。兩者的訊息完全不同。
    expect(result.output).toContain("arrow");
    expect(result.output).not.toContain("不是型別參數形式");
  });

  it("🔴 兩個不具名 defineModel → 紅（撞名會讓基準出現同名兩格）", () => {
    /**
     * `typeLiteralMacro` 對重複的巨集會紅，理由是「只讀第一個等於安靜忽略
     * 其餘」。`defineModel` 不能照抄那條 —— **多個具名 model 是合法的**，
     * 衝突的是名字。
     *
     * 少了這條的症狀不是紅燈：實測基準寫進
     * `["[emit update:modelValue]: void", "[emit update:modelValue]: void",
     * "modelValue?: number", "modelValue?: string"]`，同一個名字兩格，
     * 而 compare.ts 的 `Map<string, Member[]>` 拿到一個兩元素的陣列。
     */
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace(
        /defineProps<\{[\s\S]*?\}>\(\);/,
        "const one = defineModel<string>();\nconst two = defineModel<number>();",
      ),
    );
    expect(result.red, `兩個不具名的 defineModel 撞名沒被擋下\n${result.output}`).toBe(true);
    // ⚠️ 拿掉這條絆線之後閘門仍然會紅（少了 label／tone 是破壞性變更）——
    // 所以斷言只有這條路會印的字。
    expect(result.output).toContain("兩個同名的 prop");
  });

  /**
   * ── slot 與 emit：2026-08-17 之前這一整組問不出來 ──────────────────
   *
   * 當時的「保護」是：原始碼裡出現 `defineEmits`／`defineSlots` 就丟例外。
   * 實測顯示那道絆線綁錯了東西 —— 它絆的是**宣告**，而 slot 與 emit
   * **不需要宣告就存在**。下面第一條與第二條就是當初那兩筆量測，
   * 現在它們必須紅。
   */
  it("🔴 模板加一個沒宣告的具名 slot → 紅（這一條在修好之前是綠的）", () => {
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("{{ label }}", '<slot name="header" />{{ label }}'),
    );
    expect(result.red, `沒宣告的 slot 是公開面，閘門卻看不見\n${result.output}`).toBe(true);
    expect(result.output).toContain("header");
  });

  it("🔴 模板 emit 一個沒宣告的事件 → 紅（同樣曾經是綠的）", () => {
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("emit('picked', label)", "emit('dropped', label)"),
    );
    expect(result.red, `沒宣告的事件是公開面，閘門卻看不見\n${result.output}`).toBe(true);
    expect(result.output).toContain("dropped");
  });

  it("🔴 拿掉一個 slot（宣告與模板一起拿掉）→ 破壞性", () => {
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("  icon(): unknown[];\n", "").replace('<slot name="icon" />', ""),
    );
    expect(result.red, `少一個 slot 沒被判成破壞性\n${result.output}`).toBe(true);
    expect(result.output).toContain("[slot icon]");
  });

  it("🔴 改一個 emit 的參數型別 → 破壞性", () => {
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("picked: [label: string]", "picked: [label: number]"),
    );
    expect(result.red, `emit 的參數型別變了沒被看見\n${result.output}`).toBe(true);
    expect(result.output).toContain("[emit picked]");
  });

  it("🔴 宣告了一個模板裡沒有的 slot → 紅（記錄比公開面大也是壞的）", () => {
    // 另一個方向。消費端照著基準檔寫 `<template #ghost>`，內容永遠不會出現，
    // 而那是一個沒有錯誤訊息的 bug。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("  icon(): unknown[];", "  icon(): unknown[];\n  ghost(): unknown[];"),
    );
    expect(result.red, `宣告了不存在的 slot 沒被抓到\n${result.output}`).toBe(true);
    expect(result.output).toContain("ghost");
  });

  it("★ 只寫在 HTML 註解裡的 <slot> 不算一個 slot", () => {
    // 與上面那條 `defineExpose` 註解測試同一個顧慮，只是換一種註解語法。
    // `UiDialog` 的模板本來就有 <!-- … -->，所以這條不是假想的情況。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("{{ label }}", '<!-- 之後可能會加 <slot name="header" /> -->{{ label }}'),
    );
    expect(result.red, `HTML 註解裡的 slot 被當成真的了\n${result.output}`).toBe(false);
  });

  it("🔴 emit 的事件名不是字面值 → 丟例外，不是安靜地少記", () => {
    // 讀不出事件名就記不進公開面，而少記的那一格改了不會漂移 ——
    // 與動態 slot 名同一個顧慮。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("emit('picked', label)", "emit(label)"),
    );
    expect(result.red, `讀不出名字的 emit 被跳過了\n${result.output}`).toBe(true);
    expect(result.output).toContain("字面值");
  });

  it("🔴 動態名字的 <slot> → 丟例外，不是安靜地少記", () => {
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace('<slot name="icon" />', '<slot :name="tone" />'),
    );
    expect(result.red, `讀不出名字的 slot 被跳過了\n${result.output}`).toBe(true);
    expect(result.output).toContain("動態");
  });

  it("★ prop 的型別裡有分號 → 仍然算一個成員（切割要真的配對括號）", () => {
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("  label: string;", "  label: string;\n  meta: { a: string; b: number };"),
    );
    expect(result.red, `新增必填 prop 沒被看見\n${result.output}`).toBe(true);
    expect(result.output).toContain("meta");
    // 天真的 `split(";")` 會把它切成 `meta: { a: string` 與 `b: number }` 兩個成員。
    // 兩個都是假的，而第二個看起來完全合法 —— 那種錯誤不會有人發現。
    expect(result.output).not.toContain("成員 `b`");
  });

  it("🔴 defineProps 裡有一段解析不了的東西 → 丟例外，不是跳過", () => {
    // 跳過的代價是那個 prop 從此不在記錄裡，而不在記錄裡的東西改了不會漂移。
    const result = runFixtureFile(FIXTURE_COMPONENT, (source) =>
      source.replace("  label: string;", "  label: string;\n  (): void;"),
    );
    expect(result.red, `看不懂的宣告被安靜跳過了\n${result.output}`).toBe(true);
    expect(result.output).toContain("看不懂");
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
