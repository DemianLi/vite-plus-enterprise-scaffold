import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_FILES, slicePackageName, usesDesignSystem } from "@org/slice-kit/contract";

/**
 * 端對端：走**真正的入口** `bin/index.ts`，不是直接呼叫 `buildSliceFiles()`。
 *
 * ── 為什麼這個區別是整支測試的重點 ──────────────────────────────────
 *
 * 這個 package 的其他 51 條測試全部直接呼叫 `buildSliceFiles()`。它們驗的是
 * **模板的內容**，而使用者實際跑的是：
 *
 *     bin/index.ts → bingo 的 runTemplateCLI → template.ts 的 produce() → buildSliceFiles()
 *
 * 中間那兩層完全沒有被測到。Nx 社群那篇談 preset generator E2E 的文章
 * 講的就是這件事：預設的 E2E harness 把產生器放在**與正式情況不同的環境**下跑，
 * 於是真實會爆的東西在測試裡是綠的。
 *
 * 這不是理論。第一次真的跑 `bin/index.ts` 就發現 `--slice value`（空格寫法）
 * 被解析成 **boolean** —— `.refine()` 產生 ZodEffects，bingo 認不得，
 * 整個選項被丟掉後變成裸旗標。
 *
 * ⚠️ 這**不是**「CLI 不能用」：`--slice=value`（等號）一直是可用的，
 * README 也早就這樣規避了。真正的問題是當時 `title` 沒有 `.refine()`，
 * 空格寫法對它完全正常 —— **同一支 CLI 上三個選項有兩種行為**，
 * 而三份文件各寫各的成因，沒有一份說對（見 C42）。
 *
 * 所以這支測試**刻意用空格寫法**跑。`.refine()` 一旦被加回去，這裡就會紅。
 *
 * ── 為什麼寫真實檔案系統，而不是用虛擬 tree ────────────────────────
 *
 * 因為 `tools/conformance` 讀的是真的檔案。Angular 的 schematics 預設是
 * 記憶體虛擬 tree，但他們自己的 CDK schematics 也把 tree 複製到真實路徑 ——
 * 理由一樣：TypeScript compiler API 沒辦法在虛擬 tree 裡解析原始碼。
 * 要驗「產出的東西過得了真的閘門」，就得讓閘門看到真的檔案。
 *
 * ── 殘留物 ──────────────────────────────────────────────────────────
 *
 * 這支測試會在 `features/` 底下真的建一個目錄，所以清理是規格的一部分，
 * 不是禮貌。三層防護：
 *
 *   1. `beforeAll` 先刪一次 —— 上一次跑到一半被中斷的話，這裡收拾
 *   2. `afterAll` 再刪一次 —— 正常路徑
 *   3. 最後一條測試直接斷言 `features/` 只剩下真正的切片
 *
 * 目錄名刻意取 `zz-` 開頭：在 `features/` 裡排最後，而且一眼看得出不是
 * 真的切片 —— 萬一真的殘留，撿到的人不會以為那是誰的功能。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const SLICE = "zz-slice-gen-e2e";
const SLICE_DIR = join(ROOT, "features", SLICE);

/** 跑之前 `features/` 底下有哪些切片。最後一條測試拿它比對。 */
const SLICES_BEFORE = readdirSync(join(ROOT, "features")).filter((entry) =>
  statSync(join(ROOT, "features", entry)).isDirectory(),
);

function cleanup(): void {
  rmSync(SLICE_DIR, { recursive: true, force: true });
}

interface Run {
  readonly status: number | null;
  readonly output: string;
}

function run(command: string, args: readonly string[]): Run {
  const result = spawnSync(command, [...args], { cwd: ROOT, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

let generated: Run;

beforeAll(() => {
  cleanup();

  generated = run("node", [
    "tools/slice-gen/bin/index.ts",
    // --offline：不碰網路，也不會去要 GitHub token。
    // 同樣重要的是**沒有** --remote —— 有它 bingo 會真的去建一個 GitHub repo。
    "--offline",
    "--directory",
    `features/${SLICE}`,
    "--slice",
    SLICE,
    "--title",
    "端對端探針",
    "--team",
    "@org/team-x",
  ]);
}, 60_000);

afterAll(cleanup);

describe("真正的 CLI 入口跑得起來", () => {
  it("exit 0", () => {
    expect(generated.status, generated.output).toBe(0);
  });

  it("跑完整條流程，最後印出後續步驟", () => {
    // 只驗 exit 0 不夠：bingo 取消（Ctrl-C）也可能是 0。
    // 印出 suggestions 表示 produce() 真的回傳了東西。
    expect(generated.output).toContain("CODEOWNERS");
  });

  /**
   * 這一條是這次真正抓到 bug 的形狀。
   *
   * `--slice` 傳不進去的時候，`produce()` 的守衛會擋下並說「收到 boolean」。
   * 有人把 `.refine()` 加回 options 的話，這裡會紅。
   */
  it("★ 「那一行請忽略」的警告要在其他步驟**之後**（C99）", () => {
    /**
     * 採用演練實測：這幾段 suggestion 印完之後，外層 `vp create` 還會再印一行
     * `→ Next: cd features/<name> && vp run` —— 鷹架的通用結尾，而這個 repo 的
     * 切片不是獨立可跑的東西（照它做只會列出全 repo 的 task 清單）。
     * 兩段指示放在同一份輸出裡，當下分不出哪一段才算數。
     *
     * ⚠️ 那條警告**只有在最後一條時才有用** —— 它靠的是「緊接在它要否定的
     * 那一行前面」。有人往 suggestions 後面再加一條，它就不再相鄰了，
     * 而不會有任何東西說話。這條測試就是那個「說話的東西」。
     */
    const warn = generated.output.indexOf("那一行請忽略");
    expect(warn, "找不到那條警告").toBeGreaterThan(-1);
    for (const earlier of ["CODEOWNERS", "features.ts", "vp install"]) {
      expect(
        generated.output.indexOf(earlier),
        `${earlier} 那一步跑到警告後面去了 —— 警告必須是最後一條`,
      ).toBeLessThan(warn);
    }
  });

  it("🔴 警告要把它在講的那一行**原樣寫出來**", () => {
    /**
     * ⚠️ 這條原本寫的是「警告要排在 `→ Next:` 之前」，而它**當場紅了** ——
     * 因為這支 e2e 跑的是 `tools/slice-gen/bin/index.ts`，
     * 而那一行是外層 `vp create` 印的。**兩條不同的入口。**
     *
     * ⚠️ 也就是說：**README:127 教採用者跑的那個指令，沒有任何測試在跑。**
     * 這是 C99 記下的具名缺口 —— 手動實測過（會多印那一行），但沒寫成 e2e，
     * 因為那次執行順帶改了 `pnpm-lock.yaml` 與一個檔案模式。
     *
     * 所以這裡改成守**警告自己站得住的那一半**：它必須把那句話原樣寫出來，
     * 讀的人才認得出在講哪一行（實測中間隔著十行進度輸出，靠位置靠不住）。
     */
    expect(generated.output, "警告沒把那一行原樣寫出來").toContain("→ Next: cd features/");
    expect(generated.output).toContain("vp run");
  });

  it("命令列選項確實以字串傳進去（不是被當成裸旗標）", () => {
    expect(generated.output).not.toContain("不是字串");
    expect(existsSync(SLICE_DIR), `${SLICE_DIR} 不存在 —— 產生器沒有寫出任何東西`).toBe(true);
  });
});

describe("產出的切片內容正確", () => {
  it.each(REQUIRED_FILES)("產出 %s", (required) => {
    expect(existsSync(join(SLICE_DIR, required))).toBe(true);
  });

  it("套件名由切片名推導", () => {
    const pkg = JSON.parse(readFileSync(join(SLICE_DIR, "package.json"), "utf8")) as {
      name: string;
    };
    expect(pkg.name).toBe(slicePackageName(SLICE));
  });

  it("view 使用設計系統（D15）—— 判定式與 conformance 同一份", () => {
    const view = readFileSync(join(SLICE_DIR, "src/views/ZzSliceGenE2eList.vue"), "utf8");
    expect(usesDesignSystem(view)).toBe(true);
  });
});

/**
 * 真的把閘門叫起來，而不是重寫一份它的邏輯。
 *
 * 預期**恰好一項**違規：CODEOWNERS。那一項產生器產不出來 ——
 * 它刻意只寫新檔案，不改 CODEOWNERS 與 features.ts，因為自動塞進去等於
 * 繞過 code review，而那正是那兩個檔案存在的意義。
 */
describe("產出的切片通過真的一致性檢查（除了必須由人指派的那一項）", () => {
  let conformance: Run;

  beforeAll(() => {
    conformance = run("node", ["tools/conformance/src/cli.ts"]);
  }, 60_000);

  it("只因為「擁有權」而紅", () => {
    expect(conformance.output).toContain("擁有權");
    expect(conformance.output).toContain(`features/${SLICE}`);
  });

  it("違規恰好一項 —— 不是一堆問題裡剛好有它", () => {
    expect(conformance.output).toContain("1 項違規");
  });

  it("沒有「設計系統採用」違規（C41 的規則，新切片必須一開始就在裡面）", () => {
    expect(conformance.output).not.toContain("設計系統採用");
  });
});

describe("不留殘留物", () => {
  it("清理後 features/ 只剩真正的切片", () => {
    cleanup();

    const after = readdirSync(join(ROOT, "features")).filter((entry) =>
      statSync(join(ROOT, "features", entry)).isDirectory(),
    );

    expect(after).toEqual(SLICES_BEFORE);
    expect(after).not.toContain(SLICE);
  });
});
