/**
 * 相依健康度：這個套件還有沒有人在維護、授權有沒有被偷偷改掉。
 *
 * ── 為什麼這幾個函式從 tools/ui-survey 搬過來 ────────────────────────
 *
 * 它們原本住在 UI 選型市調裡，掃的是**五個早已選完的候選函式庫**。
 * 能力是對的 —— PrimeVue 就是被 `licenseNeedsReview()` 抓到的：
 * `license` 欄位變成 `SEE LICENSE IN LICENSE.md`，GitHub 上的 LICENSE.md
 * 仍然是 MIT，**只有 tarball 裡那份寫著商業條款**。
 *
 * 但目標是錯的。選型做完之後，那份候選名單再也不會告訴你任何事；
 * 而「我們實際裝的東西有沒有停止維護、授權有沒有變」——
 * **在此之前完全沒有東西在看。**
 *
 * ── 範圍：外部直接相依，不是整棵樹 ──────────────────────────────────
 *
 * 只掃 package.json 明寫的外部相依（目前 24 個），不掃 519 個全部。
 * 理由不是省事：那 121 個原生二進位是 TypeScript／lightningcss／yuku 的
 * platform binding，它們的維護狀態由母套件決定，逐個問 registry 只會得到
 * 144 份說著同一件事的答案。而「我們選了什麼」這個問題，問的就是直接相依。
 */

/**
 * 不需要人看一眼的授權。**只有五個，而且刻意就是這五個。**
 *
 * 這份清單寫在原始碼裡：加一個授權進來是**判斷**，要在 PR 上被看見。
 * 與 `FAMILY_TIERS` 同一個理由。
 *
 * ⚠️ **不要「順手補齊」常見的寬鬆授權。** 搬過來的時候我加了 0BSD、CC0-1.0、
 * Unlicense、**MPL-2.0** —— 而 MPL-2.0 正是 HANDOFF #4 要法務裁決的那一項
 *（`lightningcss-*` 11 個，檔案層級弱著作權，多數企業授權政策會標記）。
 * 那次「補齊」等於安靜地關掉一個法務正在依賴的檢查，而且不會有任何測試變紅。
 *
 * 這份清單的意思不是「這些授權沒問題」，是「**這些不需要每次都重新問一次**」。
 */
export const COMMON_LICENSES: readonly string[] = [
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-3-Clause",
  "BSD-2-Clause",
];

export interface HealthFacts {
  readonly name: string;
  readonly latest: string;
  readonly license: string;
  readonly publishedAt: string;
  /** 過去 12 個月的**穩定版**數量。 */
  readonly stableReleasesPerYear: number;
  /** 最後一個穩定版的日期。與 publishedAt 不同時代表 latest 是預發版。 */
  readonly lastStableAt: string;
}

/** 預發版：版本號含 `-`（`1.0.0-rc.1`、`0.0.0-insiders.abc`）。 */
function isPrerelease(version: string): boolean {
  return version.includes("-");
}

/**
 * 發版活躍度**只能算穩定版**。
 *
 * 第一版把所有 `time` 條目都算進去，於是 `@headlessui/vue` 顯示「31 版／年」——
 * 而它的穩定版停在 2024-09-09，近兩年只出過 `insiders` 預發版；
 * `tailwindcss` 更誇張，顯示「418 版／年」，幾乎全是 nightly。
 *
 * 這個數字是拿去判斷「這個相依有沒有人在維護」的，算錯的方向剛好是
 * **把死掉的專案顯示成最活躍的**。
 */
export function parseRegistry(document: unknown, now: number): HealthFacts | null {
  if (typeof document !== "object" || document === null) return null;
  const doc = document as Record<string, unknown>;

  const distTags = doc["dist-tags"] as Record<string, string> | undefined;
  const versions = doc["versions"] as Record<string, Record<string, unknown>> | undefined;
  const time = doc["time"] as Record<string, string> | undefined;
  const latest = distTags?.["latest"];
  if (latest === undefined || versions === undefined || time === undefined) return null;

  const manifest = versions[latest];
  if (manifest === undefined) return null;

  const stable = Object.entries(time)
    .filter(([key]) => key !== "created" && key !== "modified" && !isPrerelease(key))
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));

  const cutoff = now - 365 * 86_400_000;
  const recent = stable.filter(([, when]) => Date.parse(when) > cutoff);

  return {
    // 不用 String()：registry 文件是外部輸入，`name` 若不是字串就該當成缺欄位，
    // 而不是被硬轉成 "[object Object]" 一路混進報告裡。
    name: typeof doc["name"] === "string" ? doc["name"] : "（無名稱）",
    latest,
    license: typeof manifest["license"] === "string" ? manifest["license"] : "（無宣告）",
    publishedAt: (time[latest] ?? "").slice(0, 10),
    stableReleasesPerYear: recent.length,
    lastStableAt: (stable[0]?.[1] ?? "").slice(0, 10),
  };
}

/**
 * 授權是否需要人看一眼。
 *
 * 刻意**不**做「MIT 就放行、其他就擋」的二分：`SEE LICENSE IN LICENSE.md`
 * 這種值本身不是拒絕的理由，它是「**去把實際發佈的那份讀出來**」的訊號。
 */
export function licenseNeedsReview(license: string): boolean {
  return !COMMON_LICENSES.includes(license);
}

/** 12 個月沒有穩定版 ＝ 不該把新東西押上去，無論 star 數多漂亮。 */
export function looksUnmaintained(facts: HealthFacts): boolean {
  return facts.stableReleasesPerYear === 0;
}

export interface HealthFile {
  readonly capturedAt: string;
  readonly registry: string;
  readonly records: readonly HealthFacts[];
}

export interface HealthProblem {
  readonly kind: "stale-capture" | "roster-drift" | "unmaintained" | "license-review";
  readonly detail: string;
}

/**
 * 擷取結果超過幾天就算過期。
 *
 * 90 天，比 `exit-drill` 的 120 天短。理由不同：退出演練驗的是「還退得回去」，
 * 那件事不太會在一季內變；而「這個套件是不是不維護了」正是**靠時間累積**
 * 才成立的判斷 —— 一份半年前的擷取，說的是半年前有沒有人在維護。
 *
 * ⚠️《數位經濟辦法》§18 要的是每 12 個月，這裡比它嚴。刻意的：
 * 法規是下限，而下限剛好跨過「一整年沒發版」這個判定門檻本身。
 */
export const HEALTH_FRESHNESS_DAYS = 90;

/**
 * 離線檢查。`now` 由呼叫端注入，`acknowledged` 是已經有人看過並寫下理由的例外。
 *
 * ⚠️ **名單漂移（roster-drift）必須是紅的，而不是靜靜略過。**
 * 少了它，新增一個相依之後這道閘門仍然全綠 —— 因為它只檢查擷取檔裡有的那些，
 * 而新的那個不在裡面。「沒被檢查」與「檢查通過」會長得一模一樣，
 * 而這正是這個 repo 反覆栽過的那個形狀。
 */
export function checkHealth(
  file: HealthFile,
  directDependencies: readonly string[],
  acknowledged: Readonly<Record<string, string>>,
  now: number,
): readonly HealthProblem[] {
  const problems: HealthProblem[] = [];

  const ageDays = Math.floor((now - Date.parse(file.capturedAt)) / 86_400_000);
  if (Number.isNaN(ageDays)) {
    problems.push({ kind: "stale-capture", detail: `capturedAt 不是日期：${file.capturedAt}` });
  } else if (ageDays > HEALTH_FRESHNESS_DAYS) {
    problems.push({
      kind: "stale-capture",
      detail: `擷取於 ${file.capturedAt}（${ageDays} 天前，上限 ${HEALTH_FRESHNESS_DAYS} 天）`,
    });
  }

  const captured = new Set(file.records.map((record) => record.name));
  const expected = new Set(directDependencies);

  const missing = [...expected].filter((name) => !captured.has(name)).sort();
  const extra = [...captured].filter((name) => !expected.has(name)).sort();
  if (missing.length > 0) {
    problems.push({
      kind: "roster-drift",
      detail: `有相依從來沒被擷取過：${missing.join("、")}`,
    });
  }
  if (extra.length > 0) {
    problems.push({
      kind: "roster-drift",
      detail: `擷取檔裡有已經不再使用的相依：${extra.join("、")}`,
    });
  }

  for (const record of file.records) {
    if (!expected.has(record.name)) continue; // 已由 roster-drift 報過
    if (acknowledged[record.name] !== undefined) continue;

    if (looksUnmaintained(record)) {
      problems.push({
        kind: "unmaintained",
        detail: `${record.name} 過去 12 個月沒有穩定版（最後一個：${record.lastStableAt || "查無"}）`,
      });
    }
    if (licenseNeedsReview(record.license)) {
      problems.push({
        kind: "license-review",
        detail: `${record.name} 的授權是「${record.license}」—— 需要人去把實際發佈的那份讀出來`,
      });
    }
  }

  return problems;
}
