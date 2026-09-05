import { spawnSync } from "node:child_process";

/**
 * 這棵工作樹裡有哪些檔案 —— **問 git，不問磁碟**。
 *
 * ── 為什麼換掉 `walk()`（C182）───────────────────────────────────────
 *
 * 因為問的問題是「**這個 repo 的**測試環境有沒有真個資」（§11 II ⑥），
 * 而 `readdirSync` 答的是「這個目錄底下有什麼」。開發機上那兩件事差很多：
 * `.claude/worktrees/` 底下常常躺著另一個 session 的工作樹，那是**整棵樹的
 * 副本**。實測（C182 §一）在主 checkout 上，掃描範圍 **112 → 220**，多出來的
 * 108 個全部是鄰居樹裡的檔案 —— 而命中的每一項都是本 repo `EXEMPT` 裡那份
 * 反向測試對照組的複本。CI 拿到的是乾淨 clone，所以它**永遠是綠的**：
 * 本機紅、CI 綠，`scope-check/src/tree.ts` 三個月前就替另一支工具寫下了
 * 這個形狀（那段引 C41）。這裡是同一個判準的第二個實例。
 *
 * ⚠️ **改的是對象，不是判準。** `SCAN_RULES` 四條、`detect.ts` 的偵測器、
 * `EXEMPT` 一個字都沒動 —— 鄰居工作樹本來就不是「這個 repo」，把它從分母裡
 * 拿掉不是放寬門檻（規則二 管的是判準）。
 *
 * ── 為什麼是聯集，未追蹤那一半不能省 ────────────────────────────────
 *
 * `ls-files` 只答「git 現在追蹤著什麼」。一支 PII 閘門最該擋的那一刻，
 * 正是**真資料還沒 commit** —— 從正式環境撈一份下來、丟進 `tests/`、
 * 還沒 `git add`。只問追蹤中的檔案會剛好在那一刻閉嘴。
 * `--others --exclude-standard` 補的就是這一半：未追蹤、而且沒被 ignore。
 *
 * ⚠️ 於是被 `.gitignore` 蓋住的產物自然不進來（`coverage/`、`.stryker-tmp/`、
 * `reports/*`、`.vitest-results.json`），這支工具原本那兩張手抄的跳過清單
 * 因此整批退場。⚠️ **其中 `.vitest-results.json` 那格有歷史**：它是
 * `vp run -r test --reporter=json` 每個 package 留一份的產物，內容含每次執行的
 * 毫秒時間戳，而 13～16 位的時間戳有相當比例通過 Luhn 校驗 —— 這道閘門
 * 會因此報出「信用卡號的形狀」，而那些數字是時鐘。症狀是**跑過測試之後**
 * 閘門才紅，看起來像幽靈（C133 §九）。現在擋住它的是 `.gitignore` 那一行，
 * 不是這裡的清單。
 *
 * ⚠️ **`.vite-plus` 是唯一沒有被吸收的一列，而那是決定不是遺漏**（#292）。
 * 它要是哪天長出來，會以「未追蹤且未 ignore」的身分進來 —— 也就是
 * `git status` 上看得見它：壞法是**吵**（誤報），不是安靜地漏。
 * 而它至今一次都沒長出來過 —— Vite+ 把受管執行期放在 `~/.vite-plus`
 * （`VP_HOME`，見 `node_modules/vite-plus/docs/guide/env.md`），不在這棵樹裡，
 * 而 `VP_HOME` 在本 repo 一處都沒設。補一列進 `.gitignore` 會是一列
 * **沒有受害者的黑名單** —— 正是 C182 §五 否決「`SKIP` 加一列 `.claude`」
 * 的那個形狀。⚠️ 讓這段話失效的觸發條件是「有人把 `VP_HOME` 指到 repo
 * 相對路徑」，而**沒有任何閘門在看 `VP_HOME`**；量測與三條路寫在 #292。
 *
 * ── 巢狀工作樹是 git 自己擋掉的，不是靠 `.gitignore` 那一行 ──────────
 *
 * 實測（`git init` 的外層 repo，種三份副本，一份都不 ignore）：
 *
 * | 種下去的東西            | `ls-files --others --exclude-standard` 回什麼 |
 * | ----------------------- | --------------------------------------------- |
 * | 純目錄副本              | 底下每一個檔案，逐條                          |
 * | `git init` 過的子目錄   | **只有 `nestedrepo/` 一條**（目錄本身）       |
 * | `git worktree add` 的樹 | **只有 `wt-copy/` 一條**                      |
 *
 * git 不會走進另一個 repository。所以「鄰居工作樹」這一整類被擋掉的原因是
 * **結構性的**，`.gitignore:33` 的 `.claude/worktrees/` 只是第二道 —— 換個
 * 位置放（`dist/`、備份目錄、第二個 worktree 根）照樣不會被掃進來。
 * C182 §五 否決「`SKIP` 加一列 `.claude`」的理由就在這裡：那是黑名單，
 * 每一列都要有人先被咬一次。
 *
 * ⚠️ **不含 `--directory`／`--no-empty-directory` 那種目錄條目要濾掉**：
 * 上表第二、三列回的字串以 `/` 結尾，它們是目錄不是檔案。
 *
 * ⚠️ **純目錄副本仍然會被掃**，而那是對的：一份沒進版控、沒被 ignore、
 * 就躺在這棵樹裡的檔案，正是上面那半個理由要抓的東西。
 *
 * ── `-z`，以及 git 不在的時候不退回去 ───────────────────────────────
 *
 * 不加 `-z` 的話含非 ASCII 的路徑會被 git 加引號並做八進位轉義，
 * 而這棵樹的 `features/order/specs/訂單.feature` 就是那個形狀（C112）。
 * 用 `-z` 之後**不要再 `.trim()`** —— NUL 已經是明確的分隔。
 *
 * 找不到 git 就直接失敗，不改用 `readdirSync` 湊合。一道「找不到 git 就換個
 * 比較寬鬆的判準」的閘門，會在最需要它的環境裡安靜地換成另一件事 ——
 * 而且沒有人會發現，因為它還是綠的。`scope-check` 與 `api-surface` 對同一件事
 * 有同一條規矩。
 *
 * ⚠️ **刻意不 import 那兩支的版本，也不放進 `@org/gate-kit`。**
 * 跨工具相依要通過 `conformance` 的邊界規則，而 C5 記過那套機制咬自己人的樣子；
 * `api-surface/src/tracked.ts` 的檔頭（引 C96 §二）已經替同一個選擇寫過理由：
 * 與其把共用函式加參數，不如各寫各的 —— 三支問 git 的問題其實不一樣
 * （哪些目錄／哪些套件／哪些檔案）。
 */
export function trackedFiles(root: string): string[] {
  const tracked = gitLines(root, ["ls-files", "-z"]);
  const untracked = gitLines(root, ["ls-files", "-z", "--others", "--exclude-standard"]);

  // 目錄條目（巢狀 repo／工作樹）以 `/` 結尾 —— 它們不是檔案，見檔頭那張表。
  return [...new Set([...tracked, ...untracked])].filter((path) => !path.endsWith("/"));
}

function gitLines(root: string, args: readonly string[]): string[] {
  const result = spawnSync("git", [...args], { cwd: root, encoding: "utf8" });

  if (result.error !== undefined || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr.trim();
    throw new Error(
      `讀不到工作樹內容（git ${args.join(" ")}）：${reason}\n` +
        `      這道閘門刻意不退回去掃磁碟 —— 磁碟上有鄰居工作樹的副本，` +
        `用它當事實來源會在開發機紅、在 CI 綠（C182）。`,
    );
  }

  return result.stdout.split("\0").filter((path) => path.length > 0);
}
