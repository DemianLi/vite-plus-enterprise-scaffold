import { spawnSync } from "node:child_process";

/**
 * 版控裡有哪些目錄。
 *
 * ── 為什麼是 git，不是 readdirSync ──────────────────────────────────
 *
 * 因為問的問題就是「**版控裡**有什麼」，而 `readdirSync` 答的是
 * 「**磁碟上**有什麼」。兩者在乾淨的 clone 上一樣，在開發機上差很多：
 * 切換分支時 git 會刪掉被追蹤的檔案，卻留下含 `.DS_Store` 或殘留
 * `node_modules` 連結的目錄。實測一台在 `main` 與 `release/v1` 之間切過的
 * 機器上，`ls tools/` 數得到十幾個而版控裡只有七個。
 *
 * 用磁碟當事實來源的檢查會**在開發機紅、在 CI 綠** —— 那正是 C41 說的
 * 「第一天就被加例外，然後例外再也拿不掉」的形狀。
 *
 * ⚠️ **也不是「目錄裡有沒有 `package.json`」。** 那個判準（`gate-roster` 在
 * `main` 上用的那個）答的是「它是不是 workspace 成員」，而這裡問的是
 * 「**版控裡多了什麼東西**」。一個只放腳本、沒有 `package.json` 的新目錄
 * 悄悄進了 `tools/`，正是這道閘門該說話的情況，而那個判準看不見它。
 *
 * ── 為什麼是 `ls-files` 而不是 `ls-tree HEAD` ───────────────────────
 *
 * `ls-tree HEAD` 答的是「**上一個 commit** 裡有什麼」。用它的話，新增一支
 * 工具、`git add` 了、跑 `vpr gate` —— **綠的**，因為那支工具還沒進 HEAD。
 * 要等 commit 完才紅，而那時候人已經走了。
 *
 * `ls-files` 答的是「**git 現在追蹤著什麼**」（index），所以 staged 的新目錄
 * 當場就看得見。兩者一樣會把未追蹤的殘骸排除在外，而那是選 git 的首要理由。
 *
 * ⚠️ 還沒 `git add` 的檔案兩種都看不到 —— 這道閘門守的是**版控**，
 * 不是磁碟。`vpr ready` 跑在 commit 之前，而 CI 跑在 commit 之後，
 * 兩邊看到的是同一份 index。
 *
 * ── git 不在的時候刻意不退回去 ──────────────────────────────────────
 *
 * 沒有 git 就直接失敗，不改用 `readdirSync` 湊合。一道「找不到 git 就換個
 * 比較寬鬆的判準」的閘門，會在最需要它的環境裡安靜地換成另一件事 ——
 * 而且沒有人會發現，因為它還是綠的。
 */
export function trackedDirectories(root: string, parent: string): string[] {
  const result = spawnSync("git", ["ls-files", "--", `${parent}/`], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.error !== undefined || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr.trim();
    throw new Error(
      `讀不到版控內容（git ls-files -- ${parent}/）：${reason}\n` +
        `      這道閘門刻意不退回去掃磁碟 —— 磁碟上有切分支留下的殘骸，` +
        `用它當事實來源會在開發機紅、在 CI 綠。`,
    );
  }

  // `ls-files` 列的是檔案路徑，這裡要的是**第一層目錄**：
  // `tools/conformance/src/cli.ts` → `tools/conformance`。
  const directories = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    const path = line.trim();
    if (path.length === 0) continue;
    const segments = path.split("/");
    if (segments.length < 2) continue;
    directories.add(`${segments[0]}/${segments[1]}`);
  }
  return [...directories];
}

/**
 * 版控裡的**根層**有哪些東西 —— 頂層目錄與根層檔案。
 *
 * ── 為什麼這是新函式，不是 `trackedDirectories` 加一個參數 ──────────
 *
 * 上面那支問的是「`<parent>/` 底下有哪些第一層目錄」，它把每一條路徑切成
 * `segments[0]/segments[1]` 兩段。根層要的是**另一種切法**：有斜線的取第一段
 * （那是頂層目錄），沒斜線的整條就是一個根層檔。硬塞進同一支函式，那個
 * `if` 會住在最不該有分支的地方 —— 決定「這道閘門看到什麼」的那一行。
 *
 * ⚠️ **事實來源沒有換。** 一樣是 `git ls-files`，一樣是 index 而不是 HEAD、
 * 不是磁碟。上面那整段關於殘骸、staged、以及「找不到 git 就直接失敗」的論證
 * 原封不動繼續成立 —— 這一支只是把同一份輸出換個方式切。
 *
 * ⚠️ **目錄帶尾斜線，檔案不帶。** `.github/` 與 `LICENSE` 在清單上要看得出
 * 是哪一種，而 `SCOPE.md` 那張表登記的就是這裡回傳的字串原樣。少了它，
 * 一個叫 `docs` 的檔案跟一個叫 `docs` 的目錄在表上長得一模一樣。
 */
export function trackedRootEntries(root: string): string[] {
  const result = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });

  if (result.error !== undefined || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr.trim();
    throw new Error(
      `讀不到版控內容（git ls-files）：${reason}\n` +
        `      這道閘門刻意不退回去掃磁碟 —— 磁碟上有切分支留下的殘骸，` +
        `用它當事實來源會在開發機紅、在 CI 綠。`,
    );
  }

  const entries = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    const path = line.trim();
    if (path.length === 0) continue;
    const slash = path.indexOf("/");
    entries.add(slash === -1 ? path : `${path.slice(0, slash)}/`);
  }
  return [...entries];
}
