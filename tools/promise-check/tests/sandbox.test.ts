import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { SANDBOX_LAYERS, makeSandbox, trackedSlices } from "../src/breakage.ts";

/**
 * 沙盒契約：**副本裡真的有被驗的那幾層，而閘門真的看得見它們**（C127 §二）。
 *
 * ── ⚠️ 為什麼這一支非有不可 ─────────────────────────────────────────
 *
 * `makeSandbox` 補進 `platform` 與 `apps` 的那一刻，**沒有任何場景用得到
 * 它們** —— 今天唯一被規格指名的閘門是 `tools/conformance`，而承諾一問的
 * 是切片之間的邊界。一段「為了以後」而寫、沒有人在跑的擴充，就是這個 repo
 * 記過好幾次的那個形狀（`.oxlintrc.json` 建了但 `--print-config` 證明完全
 * 沒被讀到；`tools/spec-report` 的第四態）—— **設定寫了但沒生效，與全綠
 * 長得一模一樣。**
 *
 * ── ⚠️ 而「跑得起來」不等於「讀了副本」 ─────────────────────────────
 *
 * 所以這裡的每一條都是**差分**：改副本 → 數字要跟著動。少了敲掉那一步，
 * 一支在量真樹的閘門會讓下面每一條斷言都通過（C124 §一 整則就是這件事）。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const THEME_VERIFY = join(ROOT, "tools/theme-verify/src/cli.ts");
const CONFORMANCE = join(ROOT, "tools/conformance/src/cli.ts");

const sandboxes: string[] = [];

afterEach(() => {
  for (const dir of sandboxes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sandbox(): string {
  const made = makeSandbox(ROOT, trackedSlices(ROOT));
  sandboxes.push(made.dir);
  return made.dir;
}

function runThemeVerify(root: string): { status: number | null; output: string } {
  const result = spawnSync("node", [THEME_VERIFY, "--root", root], { cwd: ROOT, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** 版控裡 `dir` 底下有幾個檔。⚠️ `git ls-files`，不是 `readdirSync`（C73／C98）。 */
function trackedCount(cwd: string, dir: string): number {
  const result = spawnSync("git", ["ls-files", "-z", "--", dir], { cwd, encoding: "utf8" });
  return result.stdout.split("\0").filter((path) => path.length > 0).length;
}

/** 副本底下有幾個檔（副本不是版控，所以這一半只能走磁碟）。 */
function fileCount(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? fileCount(join(dir, entry.name)) : 1;
  }
  return total;
}

/** 靜態那一行印的元件數。抓不到就回 -1（讓斷言把整段輸出印出來）。 */
function componentCount(output: string): number {
  const match = /✓ 靜態：(\d+) 個元件/u.exec(output);
  return match === null ? -1 : Number(match[1]);
}

describe("沙盒契約", () => {
  /**
   * ⚠️ **打錯一個層名（`platfrom`）在這裡是紅的。**
   * `makeSandbox` 刻意**不**對「複製到 0 個檔」丟錯 —— 複製走 `git ls-files`，
   * 所以 0 的意思是「這棵樹上本來就沒有那一層」，而對一個把 `apps/` 換掉的
   * fork 丟錯，是拿一則關於他們沒做錯的事的錯誤訊息去換一個守不住的東西。
   * 那道防線改放在這裡：**逐層比對副本與真樹的檔數**。
   */
  it.each(SANDBOX_LAYERS)("★ 契約裡的 %s 在副本上檔數與真樹相同", (layer) => {
    const dir = sandbox();
    const tracked = trackedCount(ROOT, layer);

    expect(tracked, `版控裡沒有 ${layer}/ —— 層名打錯了？`).toBeGreaterThan(0);
    expect(fileCount(join(dir, layer))).toBe(tracked);
  });

  /**
   * ⚠️ `.github` 那一層補的是一個**藏在 early return 裡**的洞：
   * `conformance` 的 `checkActionPinning` 無條件執行，而它開頭是
   * `if (!existsSync(dir)) return;` —— 副本裡沒有 `.github` 的時候，
   * 它掃 0 個檔、什麼都不說、然後那道閘門全綠。
   * 這一條是差分：往副本的 workflow 塞一行沒釘 SHA 的 `uses:`，它必須紅。
   */
  it("★ 往副本的 workflow 塞一行沒釘 SHA 的 uses:，conformance 會紅", () => {
    const dir = sandbox();
    const workflows = join(dir, ".github/workflows");
    const victim = readdirSync(workflows).find((file) => file.endsWith(".yml"));

    expect(victim, "副本裡一個 workflow 都沒有 —— .github 沒進沙盒契約").toBeDefined();
    appendFileSync(join(workflows, victim as string), "\n      - uses: actions/checkout@v5\n");

    const result = spawnSync("node", [CONFORMANCE, "--root", dir], { cwd: ROOT, encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    expect(result.status, output).not.toBe(0);
    expect(output).toContain("action 未以 SHA 釘住");
  });

  it("★ 副本裡有 platform/ui 的元件與代幣，而 theme-verify 指得到", () => {
    const dir = sandbox();
    const { status, output } = runThemeVerify(dir);

    expect(status, output).toBe(0);
    expect(componentCount(output), output).toBeGreaterThan(0);
  });

  /**
   * ⚠️ **這一條才是這支檔案存在的理由。** 上面那條在一支完全無視 `--root`、
   * 只會量真樹的閘門底下也會全綠 —— 它證明的只有「跑得起來」。
   */
  it("★ 從副本刪掉一個元件，數字跟著少一個（敲掉那一步）", () => {
    const before = runThemeVerify(sandbox());
    const dir = sandbox();
    const components = join(dir, "platform/ui/src/components");
    const victim = readdirSync(components).find((file) => file.endsWith(".vue"));

    expect(victim, "副本裡一個 .vue 都沒有 —— 沙盒契約破了").toBeDefined();
    unlinkSync(join(components, victim as string));

    const after = runThemeVerify(dir);
    expect(componentCount(after.output), after.output).toBe(componentCount(before.output) - 1);
  });

  /**
   * ⚠️ C127 §三：`--root` 之下建置半**不跑**，而理由不是它會失敗 ——
   * 是它會成功並報出真樹的數字（副本的 `index.css` 掏空了照樣 200 格）。
   *
   * 這一條守的是那句範疇聲明看得見：輸出裡不准出現建置半的任何一行 ✓，
   * 否則哪天有人把承諾的「那麼」綁在那些字串上，那條承諾會在副本上
   * **恆真**（`check.ts` 比對的是 `output.includes(fragment)`）。
   */
  it("★ --root 之下不印建置半的任何一行，而且說得出自己沒驗", () => {
    const { output } = runThemeVerify(sandbox());

    expect(output, "建置半在副本上跑了 —— 它量的是真樹").not.toContain("✓ 建置：");
    expect(output, "引用那一段量的也是真樹的產物").not.toContain("✓ 引用：");
    expect(output).toContain("配色可換性**沒有驗**");
  });

  /** 對照：不帶 `--root` 的那條路徑一個字都不能變 —— 那是 fork 每天跑的那一條。 */
  it("不帶 --root 時三段都跑，而且宣稱兩條軸都驗了", () => {
    const result = spawnSync("node", [THEME_VERIFY], { cwd: ROOT, encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    expect(result.status, output).toBe(0);
    expect(output).toContain("✓ 建置：");
    expect(output).toContain("兩條軸都實測可換");
  });
});
