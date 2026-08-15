import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMON_LICENSES,
  HEALTH_FRESHNESS_DAYS,
  checkHealth,
  licenseNeedsReview,
  looksUnmaintained,
  parseRegistry,
  type HealthFacts,
  type HealthFile,
} from "../src/health.ts";

/**
 * 相依健康度的判定與**反向測試**。
 *
 * ── 這道閘門判錯的方向只有一個是危險的 ──────────────────────────────
 *
 * 漏報：一個停止維護的相依、或一個被改成商業授權的相依，靜靜留在樹裡。
 * 誤報：一個「做完了」的微工具被標成廢棄，於是有人在 PR 上加一列例外。
 *
 * 兩者都會讓這道閘門失效，但方式相反：漏報讓它沒用，誤報讓它被關掉。
 * 所以標 ★ 的幾條驗的是**不該紅的時候不會紅**。
 *
 * ── 名單漂移必須是紅的 ──────────────────────────────────────────────
 *
 * 最容易寫錯的一條：只檢查擷取檔裡有的那些。那樣的話，新增一個相依之後
 * 閘門仍然全綠 —— 因為新的那個不在擷取檔裡。
 * **「沒被檢查」與「檢查通過」會長得一模一樣**，而這正是這個 repo 反覆
 * 栽過的那個形狀（C33 的 Trivy 掃 0 個套件、vitest 4 的空失敗清單）。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const NOW = Date.parse("2026-08-16T00:00:00Z");

function registryDoc(name: string, versions: Record<string, string>, license = "MIT"): unknown {
  const stable = Object.keys(versions).filter((version) => !version.includes("-"));
  const newest = stable.sort(
    (a, b) => Date.parse(versions[b] as string) - Date.parse(versions[a] as string),
  )[0];
  return {
    name,
    "dist-tags": { latest: newest ?? Object.keys(versions)[0] },
    versions: Object.fromEntries(Object.keys(versions).map((version) => [version, { license }])),
    time: { created: "2020-01-01T00:00:00Z", modified: "2026-08-16T00:00:00Z", ...versions },
  };
}

function facts(overrides: Partial<HealthFacts> = {}): HealthFacts {
  return {
    name: "demo",
    latest: "1.0.0",
    license: "MIT",
    publishedAt: "2026-08-01",
    stableReleasesPerYear: 4,
    lastStableAt: "2026-08-01",
    ...overrides,
  };
}

function file(records: readonly HealthFacts[], capturedAt = "2026-08-16"): HealthFile {
  return { capturedAt, registry: "https://registry.npmjs.org", records };
}

describe("parseRegistry —— 發版活躍度只能算穩定版", () => {
  it("預發版不計入", () => {
    // 這是 @headlessui/vue 的真實形狀：穩定版停在兩年前，之後只有 insiders
    // 預發版。把預發版算進去會顯示「31 版／年」——
    // 剛好把一個停更的專案顯示成最活躍的那個。
    const document = registryDoc("headless-like", {
      "1.7.23": "2024-09-09T00:00:00Z",
      "0.0.0-insiders.aaa": "2026-04-13T00:00:00Z",
      "0.0.0-insiders.bbb": "2026-04-07T00:00:00Z",
    });
    const parsed = parseRegistry(document, NOW);
    expect(parsed?.stableReleasesPerYear).toBe(0);
    expect(parsed?.lastStableAt).toBe("2024-09-09");
  });

  it("一年內的穩定版才計入", () => {
    const document = registryDoc("active", {
      "1.0.0": "2024-01-01T00:00:00Z",
      "1.1.0": "2026-03-01T00:00:00Z",
      "1.2.0": "2026-07-01T00:00:00Z",
    });
    expect(parseRegistry(document, NOW)?.stableReleasesPerYear).toBe(2);
  });

  it("欄位不全時回 null，不是回一個看起來正常的空殼", () => {
    expect(parseRegistry({ name: "x" }, NOW)).toBeNull();
    expect(parseRegistry(null, NOW)).toBeNull();
  });
});

describe("licenseNeedsReview", () => {
  it("五個常見寬鬆授權放行", () => {
    for (const license of COMMON_LICENSES) expect(licenseNeedsReview(license)).toBe(false);
  });

  it("SEE LICENSE IN 要人看 —— PrimeVue 就是這樣被抓到的", () => {
    expect(licenseNeedsReview("SEE LICENSE IN LICENSE.md")).toBe(true);
  });

  it("沒有宣告也要人看", () => {
    expect(licenseNeedsReview("（無宣告）")).toBe(true);
  });

  it("★ MPL-2.0 必須要人看 —— HANDOFF #4 正是為它而存在", () => {
    // 搬這幾個函式過來時，我「順手補齊」了常見寬鬆授權，其中包含 MPL-2.0。
    // 那等於安靜地關掉一個法務正在依賴的檢查，而且不會有任何測試變紅。
    // 現在有了。
    expect(licenseNeedsReview("MPL-2.0")).toBe(true);
    expect(COMMON_LICENSES).toHaveLength(5);
  });
});

describe("looksUnmaintained", () => {
  it("12 個月零穩定版 → 標出來", () => {
    expect(looksUnmaintained(facts({ stableReleasesPerYear: 0 }))).toBe(true);
  });

  it("★ 一年出一版也算有人維護", () => {
    expect(looksUnmaintained(facts({ stableReleasesPerYear: 1 }))).toBe(false);
  });
});

describe("checkHealth：該紅的時候會紅", () => {
  const roster = ["demo"];

  it("★ 一切正常 → 零問題（對照組）", () => {
    expect(checkHealth(file([facts()]), roster, {}, NOW)).toEqual([]);
  });

  it("擷取結果過期 → 紅", () => {
    const old = new Date(NOW - (HEALTH_FRESHNESS_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    const problems = checkHealth(file([facts()], old), roster, {}, NOW);
    expect(problems.map((problem) => problem.kind)).toContain("stale-capture");
  });

  it("★ 剛好在期限內不算過期", () => {
    const edge = new Date(NOW - (HEALTH_FRESHNESS_DAYS - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(checkHealth(file([facts()], edge), roster, {}, NOW)).toEqual([]);
  });

  it("capturedAt 不是日期 → 紅，而不是算出 NaN 天然後放行", () => {
    const problems = checkHealth(file([facts()], "很久以前"), roster, {}, NOW);
    expect(problems.map((problem) => problem.kind)).toContain("stale-capture");
  });

  it("🔴 新增了相依但沒重擷 → 紅（這條是整支測試的重點）", () => {
    // 少了它，新增一個相依之後閘門仍然全綠 —— 因為新的那個不在擷取檔裡。
    const problems = checkHealth(file([facts()]), ["demo", "brand-new"], {}, NOW);
    expect(problems.map((problem) => problem.kind)).toContain("roster-drift");
    expect(problems.some((problem) => problem.detail.includes("brand-new"))).toBe(true);
  });

  it("移除了相依但擷取檔還留著 → 紅", () => {
    const problems = checkHealth(file([facts(), facts({ name: "gone" })]), roster, {}, NOW);
    expect(problems.map((problem) => problem.kind)).toContain("roster-drift");
  });

  it("停止維護 → 紅", () => {
    const problems = checkHealth(file([facts({ stableReleasesPerYear: 0 })]), roster, {}, NOW);
    expect(problems.map((problem) => problem.kind)).toContain("unmaintained");
  });

  it("授權需要人看 → 紅", () => {
    const problems = checkHealth(
      file([facts({ license: "SEE LICENSE IN LICENSE.md" })]),
      roster,
      {},
      NOW,
    );
    expect(problems.map((problem) => problem.kind)).toContain("license-review");
  });

  it("同一個套件兩個問題都有 → 兩條都要報，不是只報第一個", () => {
    const problems = checkHealth(
      file([facts({ stableReleasesPerYear: 0, license: "Proprietary" })]),
      roster,
      {},
      NOW,
    );
    expect(problems.map((problem) => problem.kind).sort()).toEqual([
      "license-review",
      "unmaintained",
    ]);
  });
});

describe("checkHealth：例外", () => {
  const roster = ["demo"];

  it("寫下理由的例外不再報", () => {
    const problems = checkHealth(
      file([facts({ stableReleasesPerYear: 0 })]),
      roster,
      { demo: "做完了，退場成本近乎零" },
      NOW,
    );
    expect(problems).toEqual([]);
  });

  it("🔴 例外不得蓋掉名單漂移", () => {
    // 例外說的是「這個套件的狀態可以接受」，不是「這個套件不用檢查」。
    // 一個被 acknowledge 過的套件從 package.json 消失了，仍然要報 ——
    // 否則例外清單會變成一份讓東西徹底隱形的抑制清單。
    const problems = checkHealth(
      file([facts({ name: "gone", stableReleasesPerYear: 0 })]),
      roster,
      { gone: "曾經接受過" },
      NOW,
    );
    expect(problems.map((problem) => problem.kind)).toContain("roster-drift");
  });

  it("★ 例外只對指定的套件生效，不是全域開關", () => {
    const problems = checkHealth(
      file([facts({ stableReleasesPerYear: 0 })]),
      roster,
      { somethingElse: "無關的例外" },
      NOW,
    );
    expect(problems.map((problem) => problem.kind)).toContain("unmaintained");
  });
});

describe("對實際擷取到的 dependency-health.json", () => {
  const actual = JSON.parse(
    readFileSync(join(ROOT, "tools/supply-chain/dependency-health.json"), "utf8"),
  ) as HealthFile;

  it("有內容 —— 空陣列也會零問題，那是假綠燈", () => {
    expect(actual.records.length).toBeGreaterThan(10);
  });

  it("每一筆都解析得出授權與最後穩定版日期", () => {
    for (const record of actual.records) {
      expect(record.license, `${record.name} 沒有授權`).toBeTruthy();
      expect(record.lastStableAt, `${record.name} 沒有最後穩定版日期`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  });

  it("沒有掃到 workspace 內部套件 —— 它們不在 registry 上", () => {
    expect(actual.records.some((record) => record.name.startsWith("@org/"))).toBe(false);
  });
});
