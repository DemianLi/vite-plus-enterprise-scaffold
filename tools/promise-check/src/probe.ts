import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

/**
 * 這道閘門**真的看了我給它的那棵樹嗎**。
 *
 * ── 為什麼需要這一層 ────────────────────────────────────────────────
 *
 * `check.ts` 的整個設計建立在一個假設上：把 `--root <沙盒>` 傳給閘門，
 * 它就會去掃那份副本。**這條線上的閘門一律靜默忽略不認得的旗標**
 * （C123 §一 實測：`conformance --roo /tmp` 打錯一個字母，仍然
 * `✓ 一致性檢查通過（2 個切片）` 而 exit 0）。今天看不見，是因為只有
 * `tools/conformance` 一支接進來，而它恰好認得 `--root` 這四個字。
 *
 * 接第二支的那一刻就發作，而發作的樣子是**一則指向錯誤地方的紅燈**：
 * 閘門在量沒有被弄壞的真樹 → 該紅的場景全綠 → 報〈承諾沒有牙齒〉→
 * 而那則訊息給的兩條修法（修閘門／改規格）**都不是真正的原因**，
 * 其中一條還能靠改規格變綠（C123 §二 那張表）。
 *
 * ── ⚠️ 對照組那道保險守不了這個方向 ──────────────────────────────────
 *
 * C118 §三 寫得很清楚，它守的是**偽陽性**：沙盒建壞掉 → 每一條「必須紅」
 * 都成功變紅。這裡是**偽陰性**：閘門沒看沙盒 → 每一條「必須綠」都成功變綠。
 * 而今天唯一在做這件事的東西分辨不出來 —— 承諾一的對照組片段 `"2 個切片"`，
 * 沙盒照真樹建（`SLICES_NEEDED = 2`），**兩邊的數字設計上就會相同**。
 * 把那個片段寫得再嚴都沒有用。
 *
 * ── 判別法：跑兩趟，唯一的變數是那個路徑指向哪裡 ─────────────────────
 *
 * 一趟 `--root <一個空目錄>`、一趟 `--root <repo 自己>`，輸出（含結束碼）
 * 逐字相同 → 它沒有看那個目錄。
 *
 * ⚠️ **第二趟不是「完全不給 `--root`」**，而這一點是整支探針的關鍵。
 * 「給 vs 不給」的話兩趟的 `argv` 形狀不同，於是一支**只是把參數印出來、
 * 卻完全不使用它**的閘門會產生差異 —— 而探針會說「它讀了」，放行一支
 * 其實在量真樹的閘門。這是**危險方向**的判錯。兩趟都給 `--root`、
 * 只換路徑，argv 形狀就對稱了，剩下的差異只能是行為上的。
 *
 * ⚠️ 兩個路徑遮成**同一個**標記，理由同上：遮成兩個不同的標記等於沒遮。
 *
 * ⚠️ 素材是**空目錄**，不是一份沙盒副本 —— 這是刻意的。沙盒是照真樹複製的，
 * 兩邊的輸出設計上就會相同（同一個坑）；而「切片數」那類素材在 fork 的樹上
 * 會變成樹相依的（`breakage.ts` 記著 C95／C97 同一條教訓）。空目錄與樹上
 * 有幾片切片無關，換一棵樹仍然分辨得出來。
 */

/** 閘門的 CLI 路徑慣例。這條線上每一支閘門都是這個形狀。 */
export const CLI_SUFFIX = "src/cli.ts";

export interface RootProbe {
  /** 這支閘門的行為會隨 `--root` 改變。 */
  readonly readsRoot: boolean;
  /**
   * 兩趟的輸出。
   *
   * ⚠️ **綠燈那條路徑也要留證據。** 這個判定認的是「兩趟有差異」，而差異
   * 不必然來自 `--root` —— 一個時間數字、一份沒有排序的檔案清單，都會讓
   * 一支其實在量真樹的閘門被判成「讀了」。那是**危險方向**的判錯，而它
   * 不會有任何紅燈。證據留著，那一天才看得出差在哪裡。
   * （`scripts.gate` 上六支閘門各判三次，今天的判定全部穩定。）
   */
  readonly evidence: string;
}

/**
 * 把兩趟各自的 root 路徑從輸出裡遮掉，再比對。
 *
 * ⚠️ 兩個路徑遮成**同一個**標記 —— 遮成 `<PROBE>` 與 `<ROOT>` 的話，
 * 一支把 `process.argv` 原樣印出來的閘門仍然會產生差異，而那正是這一步
 * 要消掉的東西。這裡問的是行為，不是它印了什麼。
 *
 * ⚠️ 相對形式也要遮：`conformance` 印的是 `relative(process.cwd(), …)`，
 * 而 cwd 就是 `root`，所以同一個目錄在輸出裡長成 `../../../…`。
 *
 * ⚠️ 長的先遮：短的先遮會把長路徑咬掉一段前綴，留下一截認不出來的殘骸。
 */
function mask(text: string, root: string, probeDir: string): string {
  const forms = new Set<string>();
  for (const dir of [probeDir, root]) {
    forms.add(dir);
    forms.add(realpathSync(dir));
    forms.add(relative(root, dir));
  }

  let masked = text;
  for (const form of [...forms].filter((f) => f.length > 0).sort((a, b) => b.length - a.length)) {
    masked = masked.split(form).join("<ROOT>");
  }
  return masked;
}

function runOnce(root: string, cli: string, target: string, probeDir: string): string {
  const result = spawnSync("node", [join(root, cli), "--root", target], {
    cwd: root,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return `exit=${result.status}\n${mask(output, root, probeDir)}`;
}

/**
 * 跑兩趟，判斷 `gate` 這支閘門的行為會不會隨 `--root` 改變。
 *
 * @param gate 閘門目錄（相對 `root`），例如 `tools/conformance`。
 */
export function probeRootSupport(root: string, gate: string): RootProbe {
  const probeDir = mkdtempSync(join(tmpdir(), "promise-probe-"));
  const cli = join(gate, CLI_SUFFIX);

  try {
    const pointed = runOnce(root, cli, probeDir, probeDir);
    const home = runOnce(root, cli, root, probeDir);

    if (pointed !== home) {
      return {
        readsRoot: true,
        evidence:
          `${cli} 的輸出隨 --root 改變。\n` +
          `── 指向一個空目錄 ──\n${pointed.trimEnd()}\n` +
          `── 指向 repo 自己 ──\n${home.trimEnd()}`,
      };
    }

    return {
      readsRoot: false,
      evidence:
        `${cli} 指向一個空目錄與指向 repo 自己，輸出逐字相同：\n` +
        `${pointed.trimEnd()}\n` +
        "（兩趟的路徑都遮成 <ROOT> —— 只把參數印出來不算「讀了它」。）",
    };
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
}
