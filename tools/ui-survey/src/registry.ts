/**
 * npm registry 事實的解析 —— 純函式，不碰網路。
 *
 * 取數留在 cli.ts，判定留在這裡：這樣每一條判定都可以用固定的 registry 文件
 * 測過一次，而不是靠「跑一次看看對不對」。
 */

import { COMMON_LICENSES } from "./candidates.ts";

export interface RegistryFacts {
  readonly name: string;
  readonly latest: string;
  readonly license: string;
  readonly publishedAt: string;
  /** 過去 12 個月的**穩定版**數量。 */
  readonly stableReleasesPerYear: number;
  /** 最後一個穩定版的日期。與 publishedAt 不同時代表 latest 是預發版。 */
  readonly lastStableAt: string;
  readonly directDependencies: number;
  readonly unpackedMB: string;
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
export function parseRegistry(document: unknown, now: number): RegistryFacts | null {
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

  const dist = manifest["dist"] as { unpackedSize?: number } | undefined;
  const dependencies = manifest["dependencies"] as Record<string, string> | undefined;

  return {
    // 不用 String()：registry 文件是外部輸入，`name` 若不是字串就該當成缺欄位，
    // 而不是被硬轉成 "[object Object]" 一路混進報告裡。
    name: typeof doc["name"] === "string" ? doc["name"] : "（無名稱）",
    latest,
    license: typeof manifest["license"] === "string" ? manifest["license"] : "（無宣告）",
    publishedAt: (time[latest] ?? "").slice(0, 10),
    stableReleasesPerYear: recent.length,
    lastStableAt: (stable[0]?.[1] ?? "").slice(0, 10),
    directDependencies: Object.keys(dependencies ?? {}).length,
    unpackedMB: dist?.unpackedSize === undefined ? "?" : (dist.unpackedSize / 1_048_576).toFixed(1),
  };
}

/**
 * 授權是否需要人看一眼。
 *
 * 刻意**不**做「MIT 就放行、其他就擋」的二分：`SEE LICENSE IN LICENSE.md`
 * 這種值本身不是拒絕的理由，它是「**去把實際發佈的那份讀出來**」的訊號。
 * PrimeVue 就是這樣被抓到的 —— 欄位變成那個字串，而 GitHub 上的
 * LICENSE.md 仍然是 MIT，只有 tarball 裡那份寫著商業條款。
 */
export function licenseNeedsReview(license: string): boolean {
  return !COMMON_LICENSES.includes(license);
}

/** 12 個月沒有穩定版 ＝ 不該把新專案押上去，無論 star 數多漂亮。 */
export function looksUnmaintained(facts: RegistryFacts): boolean {
  return facts.stableReleasesPerYear === 0;
}
