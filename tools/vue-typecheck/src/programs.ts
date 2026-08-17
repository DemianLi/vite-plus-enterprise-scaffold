import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * 「有哪些 `.vue` 要檢查、它們屬於哪個 package」—— 從檔案系統推導，不寫清單。
 *
 * 寫死一份清單的話，新增一個切片就會安靜地不被檢查，而閘門仍然全綠 ——
 * 那是這個 repo 已經踩過三次的形狀（A1：只守推導得出來的）。
 */

/** 走訪的起點。就是 `pnpm-workspace.yaml` 的四個 glob。 */
const WORKSPACE_GLOBS = ["apps", "platform", "features", "tools"] as const;

/**
 * 排除規則。**是規則不是清單** —— 新增一個 fixture 不需要改這裡。
 *
 * `tests/fixtures/` 底下的 `.vue` 是**刻意寫壞的**：
 * `platform/eslint-config` 那份餵給無障礙規則、`tools/api-surface` 那份餵給
 * 形狀抽取器、本 package 自己那幾份餵給下面的反向測試。
 * 不排除的話這道閘門第一天就對著它們紅，然後它會被加例外（C41）。
 */
const FIXTURE_SEGMENT = `${sep}tests${sep}fixtures${sep}`;

const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo"]);

export interface Program {
  /** package 目錄，相對於 repo 根。 */
  readonly dir: string;
  /** 該 package 的 `tsconfig.json`，相對於 repo 根。 */
  readonly tsconfig: string;
  /** 這個 package 底下**應該被檢查到**的 `.vue`，相對於 repo 根，已排序。 */
  readonly views: readonly string[];
}

/**
 * ⚠️ **點開頭的目錄一律不走**，`.git` 只是其中一個。
 *
 * 直接的理由是本 package 自己的反向測試：它把 fixture 複製到
 * `tests/fixtures/.tmp-XXXX/`、跑完就 `rmSync`。而 vitest **並行跑測試檔**，
 * 所以 `programs.test.ts` 可能正走到一個正在被刪掉的目錄裡 ——
 * `readdirSync` 對消失的目錄丟 ENOENT，而**那個例外發生在任何過濾之前**，
 * `isFixture` 救不了。
 *
 * 那會變成一道每 N 次紅一次的閘門，而那種閘門會被加例外，不會被修（C41），
 * 而且它正是 C61 的形狀：兩支測試搶同一個 repo。
 */
function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.name.endsWith(".vue")) {
      out.push(join(dir, entry.name));
    }
  }
}

/** repo 裡所有 `.vue`，含 fixture。分開匯出是為了讓測試能斷言排除**真的排掉了東西**。 */
export function allViews(root: string): readonly string[] {
  const found: string[] = [];
  for (const glob of WORKSPACE_GLOBS) {
    const base = join(root, glob);
    if (existsSync(base)) walk(base, found);
  }
  return found.map((file) => relative(root, file)).sort();
}

export function isFixture(view: string): boolean {
  return `${sep}${view}`.includes(FIXTURE_SEGMENT);
}

/** 從 `.vue` 往上找最近的 `package.json`，那就是它的 package。 */
function owningPackage(root: string, view: string): string | null {
  let dir = join(root, view, "..");
  while (dir.startsWith(root) && dir !== root) {
    if (existsSync(join(dir, "package.json"))) return relative(root, dir);
    dir = join(dir, "..");
  }
  return null;
}

/**
 * 要跑幾份 program，各自含哪些 `.vue`。
 *
 * ⚠️ **一個 `.vue` 找不到 package、或它的 package 沒有 `tsconfig.json`，
 * 一律丟例外，不跳過。** 「跳過」在這裡的症狀是閘門全綠而那個檔案沒被檢查過，
 * 也就是這支工具存在的理由本身。
 */
export function discoverPrograms(root: string): readonly Program[] {
  const byPackage = new Map<string, string[]>();

  for (const view of allViews(root)) {
    if (isFixture(view)) continue;
    const pkg = owningPackage(root, view);
    if (pkg === null) throw new Error(`${view} 往上找不到 package.json —— 不知道該用哪份 tsconfig`);
    if (!existsSync(join(root, pkg, "tsconfig.json"))) {
      throw new Error(`${view} 的 package ${pkg} 沒有 tsconfig.json —— 沒有 tsconfig 就檢查不了`);
    }
    const views = byPackage.get(pkg) ?? [];
    views.push(view);
    byPackage.set(pkg, views);
  }

  return [...byPackage.entries()]
    .map(([dir, views]) => ({ dir, tsconfig: join(dir, "tsconfig.json"), views: views.sort() }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * 這份 program 該看的 `.vue` 裡，哪些**根本沒進到它的檔案清單**。
 *
 * ⚠️ **這比錯誤數重要。** 「0 條錯誤」與「一個檔案都沒讀到」印出來長得一樣，
 * 而後者是這個 repo 被騙過三次的形狀（`@source` 沒設時 Tailwind 建置成功、
 * CSS 還變大，裡面一個 utility 都沒有）。獨立成函式是為了讓它能被單獨測。
 */
export function missingViews(
  root: string,
  program: Program,
  files: readonly string[],
): readonly string[] {
  const seen = new Set(files.map((file) => relative(root, file)));
  return program.views.filter((view) => !seen.has(view));
}
