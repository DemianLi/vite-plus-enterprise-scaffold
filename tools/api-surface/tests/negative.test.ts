import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `tools/api-surface` 的**反向測試**。
 *
 * ── 這道閘門在此之前一條測試都沒有 ──────────────────────────────────
 *
 * 而它守的是 D12 最硬的一條規則：**改 platform/ 的破壞性變更必須附 codemod**。
 * 在單一 monorepo 裡 `platform/` 就是腳手架本身，改它等於同時改動所有切片、
 * 所有團隊 —— 那條規則若沒有牙齒，就只是一句寫在文件裡的話。
 *
 * `tools/compliance` 的對照表把它列成「四道閘門裡唯一連零件測試都沒有的」。
 * 這支測試補的就是那一格。
 *
 * ── 怎麼破壞：改副本的基準檔，不改 platform 的原始碼 ────────────────
 *
 * 直覺的做法是去 `platform/*` 刪一個 export 再還原 —— 能動，但跑到一半
 * 被中斷 repo 就壞著，而且是安靜地壞。
 *
 * 改成在**基準檔的副本**裡塞一個「基準說有、現況沒有」的 export：
 * 對閘門而言那與真的刪掉一個 export 完全等價（它比的就是這兩邊），
 * 而 `platform/` 一個位元組都沒被動到。那個 `--baseline` 參數就是為此加的。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CLI = join(ROOT, "tools/api-surface/src/cli.ts");
const REAL_BASELINE = join(ROOT, "tools/api-surface/surface.json");

interface CodemodRecord {
  readonly name: string;
  readonly removes: readonly string[];
  readonly reason: string;
}

interface Baseline {
  surface: Record<string, string[]>;
  codemods: CodemodRecord[];
}

let sandbox: string | undefined;

afterEach(() => {
  if (sandbox !== undefined) rmSync(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

/** 把真的基準檔複製一份，交給 `mutate` 動手腳，回傳副本路徑。 */
function baselineCopy(mutate: (baseline: Baseline) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "api-surface-negative-"));
  sandbox = dir;

  const baseline = JSON.parse(readFileSync(REAL_BASELINE, "utf8")) as Baseline;
  mutate(baseline);

  const path = join(dir, "surface.json");
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
  return path;
}

/** 基準檔裡第一個 platform 模組的名字。不寫死，否則改名就靜靜失效。 */
function anyModule(baseline: Baseline): string {
  const name = Object.keys(baseline.surface)[0];
  if (name === undefined) throw new Error("基準檔裡沒有任何模組 —— 這支測試失去意義");
  return name;
}

interface Result {
  readonly red: boolean;
  readonly output: string;
}

function run(baselinePath: string): Result {
  const result = spawnSync("node", [CLI, "--baseline", baselinePath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { red: result.status !== 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

describe("對照組：沒動過的基準檔是綠的", () => {
  /**
   * ⚠️ 這一條必須先過，否則下面每一條都沒有意義 ——
   * 只要複製或 `--baseline` 解析壞了，所有「該紅」的測試都會「成功變紅」，
   * 而原因是環境壞了。
   */
  it("原封不動複製一份 → 通過", () => {
    const result = run(baselineCopy(() => {}));
    expect(result.red, result.output).toBe(false);
    expect(result.output).toContain("無破壞性變更");
  });

  it("真的 repo 本身也是綠的（不帶 --baseline）", () => {
    const result = spawnSync("node", [CLI], { cwd: ROOT, encoding: "utf8" });
    expect(result.status, `${result.stdout ?? ""}${result.stderr ?? ""}`).toBe(0);
  });
});

describe("破壞性變更會被擋下", () => {
  it("🔴 基準說有、現況沒有的 export → 紅", () => {
    // 等價於有人從 platform 刪掉一個 export 卻沒寫 codemod。
    const path = baselineCopy((baseline) => {
      const module = anyModule(baseline);
      baseline.surface[module] = [...(baseline.surface[module] ?? []), "zzRemovedOnPurpose"];
    });

    const result = run(path);
    expect(result.red, `仍然綠燈 —— D12 的 codemod 規則沒有牙齒\n${result.output}`).toBe(true);
    expect(result.output).toContain("zzRemovedOnPurpose");
    // 訊息必須講出補救步驟，否則看到紅燈的人只會把 export 加回去。
    expect(result.output).toContain("codemod");
  });

  it("一次移除多個 → 全部列出，不是只報第一個", () => {
    const path = baselineCopy((baseline) => {
      const module = anyModule(baseline);
      baseline.surface[module] = [...(baseline.surface[module] ?? []), "zzGoneA", "zzGoneB"];
    });

    const result = run(path);
    expect(result.output).toContain("zzGoneA");
    expect(result.output).toContain("zzGoneB");
  });

  it("整個模組從基準消失不算違規 —— 那是新增模組的反面，由 --update 處理", () => {
    // 基準有、現況沒有的**模組**（不是 export）。目前的實作把它的每個 export
    // 都算成移除，這條釘住那個行為，讓它變成刻意而不是巧合。
    const path = baselineCopy((baseline) => {
      baseline.surface["@org/zz-never-existed"] = ["thing"];
    });

    const result = run(path);
    expect(result.red).toBe(true);
    expect(result.output).toContain("@org/zz-never-existed");
  });
});

describe("codemod 是唯一的合法出口", () => {
  it("★ 登記了對應 codemod 的移除 → 放行", () => {
    // 這是 D12 刻意留的路：做得到 codemod 的 breaking change 可以過。
    // 誤擋這一種，規則就會被整個繞過。
    const path = baselineCopy((baseline) => {
      const module = anyModule(baseline);
      baseline.surface[module] = [...(baseline.surface[module] ?? []), "zzMigrated"];
      baseline.codemods = [
        ...baseline.codemods,
        {
          name: "rename-feature-kit-to-slice-kit",
          removes: [`${module}#zzMigrated`],
          reason: "測試用：驗證登記過的移除會放行",
        },
      ];
    });

    const result = run(path);
    expect(
      result.red,
      `誤擋 —— 合法的 breaking change 走不通，規則會被繞過\n${result.output}`,
    ).toBe(false);
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

    const result = run(path);
    expect(result.red, `仍然綠燈 —— 登記一個不存在的 codemod 就能繞過\n${result.output}`).toBe(
      true,
    );
    expect(result.output).toContain("zz-does-not-exist");
  });

  it("★ codemod 登記的是別的 export → 不得放行", () => {
    // 最容易寫錯的一種：只看「有沒有登記 codemod」而不看「登記的是不是這一個」。
    const path = baselineCopy((baseline) => {
      const module = anyModule(baseline);
      baseline.surface[module] = [...(baseline.surface[module] ?? []), "zzActuallyRemoved"];
      baseline.codemods = [
        ...baseline.codemods,
        {
          name: "rename-feature-kit-to-slice-kit",
          removes: [`${module}#zzSomethingElse`],
          reason: "測試用：登記的不是被移除的那一個",
        },
      ];
    });

    const result = run(path);
    expect(result.red, `登記別的 export 就能過 —— 那等於沒有規則\n${result.output}`).toBe(true);
  });
});

describe("參數本身", () => {
  it("--baseline 後面沒接東西 → 紅", () => {
    const result = spawnSync("node", [CLI, "--baseline"], { cwd: ROOT, encoding: "utf8" });
    expect(result.status).not.toBe(0);
  });

  it("★ 指到不存在的檔案 → 紅（我原本以為它會靜靜通過）", () => {
    // 寫這條時我預期的是「空基準 → 沒有移除 → 綠燈」，並準備在註解裡
    // 警告「路徑打錯會靜默通過」。**實際行為比那安全**：
    // 空基準之下，現況的每一個 export 都算「未登記的新增」，於是它紅了。
    //
    // 釘住這件事，因為它是這道閘門一個不明顯的優點：
    // 基準檔遺失或路徑打錯，不會表現成「檢查通過」。
    const dir = mkdtempSync(join(tmpdir(), "api-surface-negative-"));
    sandbox = dir;
    const result = run(join(dir, "nope.json"));

    expect(result.red).toBe(true);
    expect(result.output).toContain("未登記在基準中");
  });
});

describe("repo 本身沒有被動到", () => {
  it("跑完之後真的 surface.json 內容不變", () => {
    const before = readFileSync(REAL_BASELINE, "utf8");
    run(
      baselineCopy((baseline) => {
        baseline.surface[anyModule(baseline)] = ["zzWiped"];
      }),
    );
    expect(readFileSync(REAL_BASELINE, "utf8")).toBe(before);
  });
});
