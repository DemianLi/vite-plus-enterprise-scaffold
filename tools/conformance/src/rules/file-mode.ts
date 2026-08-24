import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

import { collect, type Finding } from "../finding.ts";

/**
 * 版控裡的**檔案模式**（`100644` ↔ `100755`）。
 *
 * ── 為什麼需要一道閘門，而不是「發版前記得看一眼」──────────────────
 *
 * 模式變更的**逐行 diff 是零**：
 *
 *     $ git diff --stat
 *      tools/conformance/src/cli.ts | 0
 *      1 file changed, 0 insertions(+), 0 deletions(-)
 *
 *     $ git diff --summary
 *      mode change 100644 => 100755 tools/conformance/src/cli.ts
 *
 * `vp check`、全套測試、其餘每一道閘門、每一道 CI —— **一個都沒有在看那個位**，
 * 而 `git status --short` 顯示的是 ` M`，與任何一般修改長得一樣。
 *
 * 已經發作過三次，三次的源頭不同：C116（`vp install`／`vp create` 動它，
 * ⚠️ **那一次進了發出去的版本**）、#140（`pnpm install` 建 workspace bin 連結時
 * `chmod +x` 連結目標）、C121 §六（Stryker 的 `inPlace` 還原時不保留模式）。
 * **每一次都是靠人在發版前用 `--summary` 追出來的。**
 *
 * ── 判準：**宣告了 `bin` 的目標一律 `100755`，其餘一律 `100644`** ──────
 *
 * ⚠️ **判準不是「有 shebang 就要 755」。** 那會把測試 fixture 與範例掃進來 ——
 * 一個示範用的腳本有 shebang 是很正常的事，而它不是任何東西的進入點。
 * `bin` 是**宣告**：有人打算讓別人直接執行它，那個意圖寫在 `package.json` 裡。
 *
 * C116 §三 當時明文不補這道閘門，理由是判準還不存在 ——「七支 `cli.ts` 全部有
 * shebang、六支宣告了 `bin`，模式卻是五支 `100644`、兩支 `100755`，
 * **所以『哪個模式才對』這個問題，樹自己沒有答案**」。#141 把九支對齊成 `100755`
 * 之後，樹自己有答案了，而這道檢查是讓那個答案保持為真的東西。
 *
 * ── 事實來源是 `git ls-files -s`，不是檔案系統 ──────────────────────
 *
 * ⚠️ **git 只記 `100644` 與 `100755` 兩個值**，而工作區的實際權限位比那多
 *（umask、掛載選項、還原工具各自會留下不同的東西）。問的是「**版控裡**是什麼」，
 * 不是「這台機器上是什麼」—— 後者會讓同一棵樹在兩台機器上得到不同的答案。
 *
 * `-z` 的理由與 `tools/scope-check/src/tree.ts`、`tools/api-surface/src/tracked.ts`
 * 同一條：不加它，含非 ASCII 的路徑會被 git 加引號並做八進位轉義。
 *
 * ── ⚠️ 這條規則**不在 `--root` 底下跑**，而那不是為了省事 ────────────
 *
 * `--root` 指到的是一份**複製到暫存目錄的切片副本**（`tools/promise-check` 與
 * 這支自己的反向測試都這樣用）。**副本不是版控**，所以這條規則問的那個問題
 * 在那裡沒有答案 —— 不是「答案是綠的」。
 *
 * 兩條路都試不得：讓它在非 git 目錄下照跑，`git ls-files` 非零退出，
 * 於是 `specs/promise-1-architecture.feature` 那條**期待綠燈的對照組**當場紅
 *（而那條對照組存在的理由，正是「一道會誤擋的規則第一天就會被加例外」）；
 * 讓它安靜回傳零筆，就是這個 repo 付過學費的那個形狀 ——
 * **量不到的東西被記成沒有問題**。
 *
 * 所以排除寫在 `cli.ts` 的呼叫端、而且會印出來。守得住的是哪半個，要自己講明白。
 */

/** `git ls-files -s` 的一列：模式 ＋ repo 相對路徑。 */
export interface TrackedFile {
  readonly mode: string;
  readonly path: string;
}

/**
 * ⚠️ 只判 blob 的兩個模式。symlink（`120000`）與 submodule（`160000`）
 * 也會出現在 `ls-files -s` 裡，而對它們要求 `100644` 是錯的 ——
 * 目前這棵樹一個都沒有，但「現在沒有」不是不處理的理由。
 */
const EXECUTABLE = "100755";
const REGULAR = "100644";

export function trackedFiles(root: string): readonly TrackedFile[] {
  const result = spawnSync("git", ["ls-files", "-s", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ls-files 失敗（${root}）：${result.stderr ?? ""}`);
  }
  // 每一列是 `<模式> <物件> <stage>\t<路徑>`，以 NUL 分隔。
  // ⚠️ 用 `-z` 之後不要 `.trim()` —— NUL 已經是明確的分隔，而 trim 會弄壞
  // 前後帶空白的檔名。
  const files: TrackedFile[] = [];
  for (const line of (result.stdout ?? "").split("\0")) {
    if (line === "") continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    files.push({ mode: line.slice(0, line.indexOf(" ")), path: line.slice(tab + 1) });
  }
  return files;
}

/**
 * 版控裡每一份 `package.json` 宣告的 `bin` 目標，化成 repo 相對路徑。
 *
 * ⚠️ `bin` 有兩種合法形狀，而這棵樹**兩種都在用**：物件
 *（`{"conformance": "./src/cli.ts"}`，八支）與字串（`"./bin/index.ts"`，
 * `tools/slice-gen` 那支）。只認物件的話會漏掉一支，而漏掉的那支不會有人抗議。
 */
export function declaredBinTargets(root: string, files: readonly TrackedFile[]): Set<string> {
  const targets = new Set<string>();
  for (const file of files) {
    if (!file.path.endsWith("package.json")) continue;
    let bin: unknown;
    try {
      bin = (JSON.parse(readFileSync(join(root, file.path), "utf8")) as { bin?: unknown }).bin;
    } catch {
      // 讀不動或不是合法 JSON 的 package.json 不是這條規則的問題。
      continue;
    }
    const declared =
      typeof bin === "string"
        ? [bin]
        : typeof bin === "object" && bin !== null
          ? Object.values(bin as Record<string, unknown>).filter((v) => typeof v === "string")
          : [];
    const dir = dirname(file.path);
    for (const target of declared as string[]) {
      targets.add(normalize(dir === "." ? target : join(dir, target)));
    }
  }
  return targets;
}

/**
 * 判定本體 —— **沒有 IO**，餵得進合成資料，所以兩個方向都測得到。
 *
 * 兩個方向都要判，而那不是對稱的裝飾：只判「bin 目標掉了可執行位」的話，
 * 一個**不該**可執行的檔案被 `chmod +x`（#140 那次 `pnpm install` 做的事，
 * 以及任何一次手滑）不會有人說話，而那正是模式在樹上亂掉的來源之一。
 */
export function judgeModes(
  files: readonly TrackedFile[],
  binTargets: ReadonlySet<string>,
): Finding[] {
  return collect((fail) => {
    for (const file of files) {
      if (file.mode !== EXECUTABLE && file.mode !== REGULAR) continue;
      const isBin = binTargets.has(normalize(file.path));
      const expected = isBin ? EXECUTABLE : REGULAR;
      if (file.mode === expected) continue;

      fail(
        file.path,
        "檔案模式",
        isBin
          ? `版控裡是 ${file.mode}，而它是 package.json 宣告的 bin 目標（應為 ${EXECUTABLE}）`
          : `版控裡是 ${file.mode}，而沒有任何 package.json 把它宣告成 bin（應為 ${REGULAR}）`,
        isBin
          ? `git update-index --chmod=+x ${file.path} —— 不修的話，直接執行它的人拿到「Permission denied」，` +
              `而 diff 是零行，下一個人看不出來發生過什麼。`
          : `git update-index --chmod=-x ${file.path} —— 不修的話，可執行位會在樹上散開，` +
              `到某個時點沒有人說得出「哪個模式才對」（C116 就是停在這個問題上）。`,
      );
    }
  });
}

/**
 * 接線：讀版控 → 收集 `bin` 宣告 → 判定。
 *
 * ⚠️ **回傳的不只是 `Finding[]`，而那是刻意的** —— 其餘每一條規則都只回
 * `Finding[]`，這條多回一個「看了幾個檔」。
 *
 * 理由是這條規則的成功訊息會印在 `cli.ts` 的檔尾，而第一版把那句話寫成了一個
 * **與呼叫無關的分支** —— 把 `checkFileMode(...)` 那一行刪掉，訊息照印、
 * 八條判定測試照樣全綠，**接線測試因此是恆真的**。
 * 讓訊息帶一個只有真的跑過才產得出來的數字，那條測試才有東西可以咬。
 *
 * 同一條教訓在這棵樹上寫過兩次：`doc-facts/src/derive.ts` 的
 *「唯一抓得到射程寫錯的對照是 N 對不對得上版控」，以及覆蓋率那次的假滿分。
 */
export function checkFileMode(root: string): { findings: Finding[]; examined: number } {
  const files = trackedFiles(root);
  return { findings: judgeModes(files, declaredBinTargets(root, files)), examined: files.length };
}
