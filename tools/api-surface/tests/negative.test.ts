import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot, runCli, sandbox } from "@org/gate-kit/testing";

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

const ROOT = repoRoot();
const CLI = "tools/api-surface/src/cli.ts";
const REAL_BASELINE = join(ROOT, "tools/api-surface/surface.json");
const FIXTURES = "tools/api-surface/tests/fixtures";
const FIXTURE_SOURCE = join("sample", "src", "index.ts");

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

function scratch(): string {
  return sandbox({ prefix: "api-surface-negative-" }).root;
}

interface Result {
  readonly red: boolean;
  readonly output: string;
}

function run(args: readonly string[]): Result {
  const result = runCli(CLI, args);
  return { red: result.status !== 0, output: result.output };
}

// ── 基準副本 ──────────────────────────────────────────────────────────

/** 把真的基準檔複製一份，交給 `mutate` 動手腳，回傳副本路徑。 */
function baselineCopy(mutate: (baseline: Baseline) => void): string {
  const dir = scratch();
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
  pristineFixture = join(
    sandbox({ copy: [FIXTURES], prefix: "api-surface-fixture-", lifetime: "all" }).root,
    FIXTURES,
  );
  const seeded = run([
    "--platform",
    pristineFixture,
    "--baseline",
    join(pristineFixture, "surface.json"),
    "--update",
  ]);
  if (seeded.red) throw new Error(`fixture 基準產不出來：${seeded.output}`);
});

/** 複製一份乾淨的 fixture（含基準），對某個檔案動手腳後跑閘門。 */
function runFixtureFile(relative: string, mutate: (source: string) => string): Result {
  const dir = scratch();
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
    const dir = scratch();
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
    const dir = scratch();
    cpSync(pristineFixture, dir, { recursive: true });
    const result = run(["--platform", dir, "--baseline", join(dir, "surface.json")]);
    expect(result.output, "沒說那道檢查沒跑").toContain("沒有跑");
  });
});

// ── export 層級：名稱不見了 ───────────────────────────────────────────

describe("形狀參考（C100）", () => {
  /**
   * `#95` 非阻斷級：**27 個元件零份使用說明**。修法是從 `surface.json` 產生，
   * 不是手寫 —— 手抄 27 個元件的 prop 名字正是這個 repo 一再栽的病。
   *
   * ⚠️ 這一組守的是**接線**：`docs.test.ts` 驗渲染，這裡驗「CLI 真的比對了」。
   * C98 §四之三 記過同一個形狀 —— 純函式測得好好的，而把呼叫它的那段刪掉
   * 紅零條。
   */
  function withReference(mutate: (reference: string) => void) {
    const dir = scratch();
    cpSync(pristineFixture, dir, { recursive: true });
    const baseline = join(dir, "surface.json");
    const reference = join(dir, "API.md");
    const seed = run([
      "--platform",
      dir,
      "--baseline",
      baseline,
      "--reference",
      reference,
      "--update",
    ]);
    expect(seed.red, seed.output).toBe(false);
    mutate(reference);
    return run(["--platform", dir, "--baseline", baseline, "--reference", reference]);
  }

  it("★ --update 之後立刻再跑 → 綠", () => {
    const result = withReference(() => {});
    expect(result.red, result.output).toBe(false);
  });

  it("🔴 手改參考 → 紅", () => {
    const result = withReference((reference) => {
      writeFileSync(reference, `${readFileSync(reference, "utf8")}\n手改的一行\n`);
    });
    expect(result.red, `參考被手改了還是綠的\n${result.output}`).toBe(true);
    expect(result.output).toContain("--update");
  });

  it("🔴 參考不見了 → 紅，而且說得出它不存在", () => {
    // 少了這一條，「檔案被刪掉」與「內容不對」會給出同一句話，
    // 而前者的第一個念頭是「是不是我 clone 壞了」。
    const result = withReference((reference) => rmSync(reference));
    expect(result.red).toBe(true);
    expect(result.output).toContain("它不存在");
  });

  it("🔴 --platform 指到別處又沒給 --reference → **不得**碰根層那份", () => {
    /**
     * ⚠️ 這一條是踩到才有的。第一版無條件寫 `ROOT/API.md`，而
     * `beforeAll` 那次 seed fixture 的 `--update` 正是 `--platform <tmpdir>`
     * —— **跑一次測試就把 repo 根層的參考換成 fixture 的內容**。
     */
    const before = readFileSync(join(ROOT, "API.md"), "utf8");
    const dir = scratch();
    cpSync(pristineFixture, dir, { recursive: true });
    const result = run(["--platform", dir, "--baseline", join(dir, "surface.json"), "--update"]);
    expect(result.red, result.output).toBe(false);
    expect(readFileSync(join(ROOT, "API.md"), "utf8"), "根層 API.md 被動到了").toBe(before);
    expect(result.output, "沒說參考那一份沒有寫").toContain("形狀參考沒有寫");
  });
});

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
      // 真基準裡若有 codemod 登記過 Feature 的形狀變更（C240 就登記了一次），
      // 那一條會把這裡要問的紅燈赦免掉，測試變成在問「登記有沒有生效」。
      for (const record of baseline.codemods) {
        record.changes = record.changes?.filter((ref) => ref !== "@org/slice-kit#Feature");
      }
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
    const dir = scratch();
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
    const dir = scratch();
    const path = join(dir, "surface.json");
    writeFileSync(path, JSON.stringify({ surface: {}, codemods: [] }));

    const result = run(["--baseline", path]);
    expect(result.red).toBe(true);
  });
});

// ── 參數本身 ──────────────────────────────────────────────────────────

// 「--baseline／--platform 後面沒接東西 → 紅」曾經各有一條。缺值的判定住在
// `@org/gate-kit` 的 `parseFlags`，由 `gate-kit/tests/flags.test.ts` 守；把那個判定
// 拿掉時這裡的兩條與那邊同紅，而這支 CLI 讀的是 `FLAGS.flags`，沒有第二條路（C178）。
describe("參數本身", () => {
  it("★ 指到不存在的檔案 → 紅（我原本以為它會靜靜通過）", () => {
    // 寫這條時我預期的是「空基準 → 沒有移除 → 綠燈」，並準備在註解裡
    // 警告「路徑打錯會靜默通過」。**實際行為比那安全**：
    // 空基準之下，現況的每一個 export 都算「未登記的變更」，於是它紅了。
    const result = run(["--baseline", join(scratch(), "nope.json")]);
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
    const dir = scratch();
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
    const file = join(ROOT, FIXTURES, FIXTURE_SOURCE);
    const before = readFileSync(file, "utf8");
    runFixture((source) => source.replaceAll("InternalOnly", "ScratchShape"));
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});

// ── checkIndexAgreement 的紅燈那條路 ──────────────────────────────────

/**
 * ★ `cli.ts:277-284`（headline／dirs／remediation／exit 1）**在此之前一條路都走不到**。
 *
 * 上面那批會紅的案例全部走 `--platform <tmpdir>`，而那條檢查刻意只在
 * `PLATFORM === PLATFORM_DIR` 時問（`cli.ts:259`）—— 進不去。真樹那條
 * （`:213-228`）進得去，但這棵樹是乾淨的，`problems` 恆空。
 *
 * 實測（基準 `2326bc8`）：把 `:277-284` 整段刪掉 → **這支檔 97/97 全綠**。
 * `cli.ts:275-276` 那句「少一個方向要動 `checkIndexAgreement`，而那支函式是直接
 * 被測的」成立 —— 但它守的是**少一個方向**，不是**這一段有沒有被接上**；
 * 而 `:213-228` 只守綠燈那條路（`verifiedInIndex` 在那個 `if` 之外，
 * 所以刪掉紅燈那段之後綠燈照樣宣稱驗過）。
 *
 * ── 為什麼要整棵樹的副本 ────────────────────────────────────────────
 *
 * 這支 CLI 的 `ROOT` 是從 `import.meta.url` 推的（`cli.ts:42`），沒有 `--root`。
 * 要讓 `PLATFORM === PLATFORM_DIR` 而內容又是壞的，只能複製一份樹再跑**副本的**
 * CLI。
 *
 * ⚠️ **副本建在系統暫存目錄，不建在 repo 內 —— 這一點是實測逼出來的。**
 * 第一版用 `sandbox({ within: <這個 package> })`（`tools/vue-typecheck` 的 fixture
 * 是同一個 pattern），而 `vp run -r test` 是**併行**的：副本存在的那幾秒裡，
 * `threshold-check` 的符號連結農場走過這棵樹，量到「農場 378 個檔、真樹 300 個」
 * 當場紅 —— 而它**間歇**（同一支上一趟是綠的）。`vue-typecheck` 的 fixture 沒有
 * 這個問題是因為它**在版控裡**，兩邊都看得到它；一份跑到一半才存在的副本不是。
 *
 * 所以副本建在 `tmpdir()`，再把這個 package 的 `node_modules` 連過去 ——
 * `@org/*` 是 pnpm workspace 的 symlink，少了它副本的 CLI 一行都跑不起來。
 */
describe("checkIndexAgreement 接進 cli.ts 的那一段", () => {
  it("🔴 版控裡有、磁碟上沒有的 platform 套件 → RC=1，headline 與補救都印得出來", () => {
    const box = sandbox({
      prefix: "api-surface-wiring-",
      copy: ["platform", "tools/api-surface"],
      git: true,
    });

    // 副本的 CLI 要 import `@org/*`，而那些是這個 package 的 node_modules 裡的
    // workspace symlink。連過去，不複製 —— 複製一份 node_modules 是幾萬個檔。
    symlinkSync(
      join(ROOT, "tools/api-surface/node_modules"),
      join(box.root, "tools/api-surface/node_modules"),
      "dir",
    );

    // 不寫死名字：改名之後寫死的那個會靜靜失效，而症狀是這條測試恆綠。
    const victim = readdirSync(join(box.root, "platform"), { withFileTypes: true }).find((entry) =>
      entry.isDirectory(),
    )?.name;
    expect(victim, "副本的 platform/ 底下一個目錄都沒有 —— 沙盒建壞了").toBeDefined();

    // git add -A 之後才刪：版控裡有、磁碟上沒有，正是 vanished 那個方向。
    rmSync(join(box.root, "platform", String(victim)), { recursive: true, force: true });

    const result = spawnSync(process.execPath, [join(box.root, CLI)], {
      cwd: box.root,
      encoding: "utf8",
    });
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status, `應該紅卻是 ${String(result.status)}：\n${output}`).toBe(1);
    expect(output).toContain("在版控裡、磁碟上卻沒有");
    expect(output, "只印了 headline，沒印是哪一個").toContain(`platform/${String(victim)}`);
    expect(output, "沒印補救步驟 —— 那正是這段程式碼存在的理由").toContain("兩條出路");
  }, 120_000);
});
