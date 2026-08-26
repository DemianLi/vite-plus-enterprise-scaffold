import { spawnSync } from "node:child_process";
import { relative } from "node:path";

/**
 * 「這個進入點在版控裡嗎」——`platform/` 底下的套件哪幾個是 git 追蹤著的。
 *
 * ── 為什麼需要這一問（C98）────────────────────────────────────────────
 *
 * `listEntryPoints()` 用 `readdirSync` 讀磁碟。C73 對這件事早有明文裁決：
 * 事實來源要是 **`git ls-files`**，「不是 `ls-tree HEAD`，更不是 `readdirSync`」，
 * 理由是「用磁碟當事實來源會**開發機紅、CI 綠**」。
 *
 * 這支工具的方向**相反，而且更糟 —— 開發機綠、CI 紅，而那個紅沒有合法出口**。
 * 實測走完整條路（`--platform` ＋ `--baseline` 指到隔離的假樹）：
 *
 *   ① 磁碟上有一個沒進版控的 `platform/client/`  → 紅：「1 項相容變更未登記」
 *   ② 照它說的跑 `--update`                       → **綠**
 *   ③ commit `surface.json`，CI 拿到乾淨 clone    → 那個目錄不存在，
 *      它的 export 全部變成「移除」→ **判成破壞性變更，要求你為一個
 *      從來不存在於版控的 API 寫 codemod**
 *
 * ③ 那種紅燈**沒有 codemod 可寫** —— 而 `cli.ts` 的檔頭自己命名過這一類
 *（基準版號不合時「那種紅燈沒有合法出口」），只是沒想到事實來源也會製造它。
 *
 * ── 為什麼不直接把探索換成 `git ls-files` ─────────────────────────────
 *
 * ⚠️ 因為 `--platform` 會被弄壞，而**那是這支工具自己的測試逃生口**：
 * `tests/negative.test.ts` 把 fixture 複製到 `mkdtempSync(tmpdir())` 再指過去
 * （理由寫在 `tests/fixtures/README.md`），而 tmpdir 不在任何 index 裡。
 * 換掉事實來源會讓那批負向測試全部失效。
 *
 * C73 的裁決仍然成立，只是那次的工具**沒有注入旗標**。這裡改成
 * **多問一句**而不是換一個問法：進入版控的東西才准進基準，
 * 而紅燈給得出合法出路（`git add`，或把它移出 `platform/`）。
 *
 * ⚠️ **刻意不 import `scope-check` 的 `tree.ts`。** 跨工具相依要通過
 * `conformance` 的邊界規則，而 C5 記過那套機制咬自己人的樣子。
 * C96 §二 也在更短的距離上論證過：與其把共用函式加參數，不如各寫各的。
 */
export function trackedPackageDirs(root: string, platformDir: string): ReadonlySet<string> {
  const prefix = relative(root, platformDir);
  const result = spawnSync("git", ["ls-files", "-z", "--", prefix], {
    cwd: root,
    encoding: "utf8",
  });

  // ⚠️ **找不到 git 就直接失敗，不要當成「零個被追蹤」。**
  // 那會讓每一個進入點都變成幽靈，紅一整片 —— 而真正壞掉的是儀器。
  // `scope-check/tree.ts` 對同一件事有同一條規矩。
  if (result.status !== 0) {
    throw new Error(
      `git ls-files 失敗（${prefix}）：${result.stderr || result.error?.message || "未知"}`,
    );
  }

  const dirs = new Set<string>();
  for (const path of result.stdout.split("\0")) {
    if (!path.endsWith("/package.json")) continue;
    const rest = path.slice(prefix.length + 1);
    const slash = rest.indexOf("/");
    // 只認 `platform/<name>/package.json` 這一層；更深的是套件內部的檔案。
    if (slash !== -1 && rest.slice(slash + 1) === "package.json") dirs.add(rest.slice(0, slash));
  }
  return dirs;
}

/**
 * 磁碟上進得了基準、而版控裡沒有的那些。
 *
 * ⚠️ 純函式，而且**事實來源從參數進來** —— 這道檢查只在跑真正的 `platform/`
 * 時由 CLI 接上（`--platform` 指到 repo 外面時「在不在 index 裡」沒有意義），
 * 於是絆線掛不到 CLI 那條路上。掛在這裡才吃得到被守的資料。
 */
export function phantomEntryPoints(
  onDisk: readonly string[],
  tracked: ReadonlySet<string>,
): readonly string[] {
  return onDisk.filter((name) => !tracked.has(name)).sort();
}

/**
 * 反方向：**版控裡有、磁碟上沒有**的套件目錄。
 *
 * ⚠️ **同一個病理，鏡像的形狀。** `rm -rf platform/pii`（或一次沒收乾淨的
 * stash／merge／`mv`）之後：`readdirSync` 列不到它 → 沒有進入點 →
 * 基準裡 `@org/pii` 的 export 全部變成「移除」→ **判成破壞性變更，
 * 要求你為一個仍然在版控裡的套件寫 codemod**。一樣沒有合法出口。
 *
 * ⚠️ **好好地移除不是這一種**：`git rm -r platform/pii` 之後 index 與磁碟
 * 是一致的，那是一次**真的**破壞性變更，codemod 那條路正是為它準備的。
 * 病的是**兩邊不一致**，不是移除本身。
 *
 * C73 那張表就是這麼寫的：**兩個方向都要驗，因為壞掉的方式有兩種。**
 * 只補一個方向，等於把同一個沒有出口的紅燈留在鏡子的另一面。
 *
 * ⚠️ `onDisk` 要餵 **`readdirSync` 的完整清單**，不是「有貢獻進入點的那些」——
 * `platform/tsconfig` 在版控裡、在磁碟上，而它沒有 `exports` 所以正當地
 * 貢獻零個進入點。拿它跟進入點清單比，會每一次都誤報。
 */
export function vanishedPackageDirs(
  tracked: ReadonlySet<string>,
  onDisk: readonly string[],
): readonly string[] {
  const present = new Set(onDisk);
  return [...tracked].filter((name) => !present.has(name)).sort();
}

/**
 * 幽靈進入點的紅燈尾巴。
 *
 * ⚠️ **住在這裡是為了掛得上絆線**（C97 §五 學到的）：`cli.ts` 頂層就會
 * `process.exit`，import 不了，而這道檢查**刻意只在跑真正的 `platform/` 時開**
 * —— 於是測試那條 `--platform` 的路徑永遠印不出它。抽成常數才驗得到。
 */
export const PHANTOM_REMEDIATION =
  "\n  它們在磁碟上，但 git 沒有追蹤它們 —— 而基準（surface.json）是要 commit 的。\n" +
  "  照現在這條路走下去會是這樣：\n\n" +
  "    跑 --update → 它們的 export 被寫進基準 → 當場變綠 → 你 commit 基準\n" +
  "    → CI 拿到的乾淨 clone 沒有這些目錄 → 那些 export 全部變成「移除」\n" +
  "    → 判成破壞性變更，要求你為一個從來不存在於版控的 API 寫 codemod\n\n" +
  "  最後那個紅燈**沒有合法出口**（沒有 codemod 可寫），所以在這裡先擋。\n\n" +
  "  兩條出路，挑一條：\n" +
  "  · 這個套件要留下來 —— `git add platform/<名字>`，然後重跑。\n" +
  "    （staged 就算數，不必先 commit —— 事實來源是 index。）\n" +
  "  · 它只是暫時的 —— 把它移出 `platform/`。\n" +
  "    ⚠️ 加進 .gitignore **不夠**：這道檢查看的是版控，不是 ignore 規則，\n" +
  "    而上面那條路徑照樣會走完。\n";

/** 反方向的紅燈尾巴。理由同上，掛絆線的理由同 `PHANTOM_REMEDIATION`。 */
export const VANISHED_REMEDIATION =
  "\n  它們在版控裡，但磁碟上沒有 —— 而進入點是從磁碟列的。\n" +
  "  照現在這條路走下去會是這樣：\n\n" +
  "    它們列不進進入點 → 基準裡它們的 export 全部變成「移除」\n" +
  "    → 判成破壞性變更，要求你為一個**仍然在版控裡**的套件寫 codemod\n\n" +
  "  那個紅燈一樣沒有合法出口，所以在這裡先擋。\n\n" +
  "  兩條出路，挑一條：\n" +
  "  · 不小心刪掉的 —— `git restore platform/<名字>` 把它拿回來。\n" +
  "  · 真的要移除 —— `git rm -r platform/<名字>`，讓 index 跟磁碟一致。\n" +
  "    那之後它就是一次**真的**破壞性變更，走 codemod 那條路（D12）——\n" +
  "    這道檢查擋的不是移除，是**兩邊不一致**。\n";

export interface IndexProblem {
  readonly kind: "phantom" | "vanished";
  readonly dirs: readonly string[];
  /** 印在清單後面的那段「該怎麼辦」。 */
  readonly remediation: string;
  readonly headline: string;
}

/**
 * index 與磁碟對不對得上 —— **兩個方向合成一支**。
 *
 * ⚠️ **合成一支不是為了整齊，是為了絆線咬得到「接線」。**
 * 兩個方向各自接在 `cli.ts` 裡的時候，變異「把反方向那段刪掉」**紅零條** ——
 * 純函式的測試照樣全過（函式還在），而 CLI 那條路在測試環境裡永遠不會觸發
 * （這棵樹是乾淨的，`--platform` 又刻意略過）。
 *
 * 合成之後，`cli.ts` 那端是一個**吞不掉任何方向的迴圈**：要少一個方向，
 * 就得動這支函式，而這支函式是直接被測的。
 * 形狀同 `doc-facts` 的 `checkFacts()` 回傳一串 `FactProblem`。
 */
export function checkIndexAgreement(
  entryDirs: readonly string[],
  tracked: ReadonlySet<string>,
  onDisk: readonly string[],
): readonly IndexProblem[] {
  const problems: IndexProblem[] = [];

  const phantom = phantomEntryPoints(entryDirs, tracked);
  if (phantom.length > 0) {
    problems.push({
      kind: "phantom",
      dirs: phantom,
      headline: `platform/ 底下有 ${phantom.length} 個進入點不在版控裡`,
      remediation: PHANTOM_REMEDIATION,
    });
  }

  const vanished = vanishedPackageDirs(tracked, onDisk);
  if (vanished.length > 0) {
    problems.push({
      kind: "vanished",
      dirs: vanished,
      headline: `platform/ 底下有 ${vanished.length} 個套件在版控裡、磁碟上卻沒有`,
      remediation: VANISHED_REMEDIATION,
    });
  }

  return problems;
}
