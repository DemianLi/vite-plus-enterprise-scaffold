import { describe, expect, it } from "vitest";
import { assessCsp } from "../src/csp.ts";
import { licenseNeedsReview, looksUnmaintained, parseRegistry } from "../src/registry.ts";
import { CANDIDATES, SCA_BASELINE } from "../src/candidates.ts";

/**
 * 市調工具的判定測試。
 *
 * 這支工具產出的數字會被拿去跟法務與資安講話，所以每一條判定都要能被重驗。
 * 特別是**兩個第一版就算錯的地方**（發版頻率、供應鏈基線）——
 * 它們錯的方向都是「看起來很合理但結論相反」，所以各有一支測試釘住。
 */

const now = Date.parse("2026-08-15T00:00:00Z");

function registryDoc(name: string, versions: Record<string, string>, license = "MIT"): unknown {
  const latest = Object.keys(versions).filter((v) => !v.includes("-"));
  const newest = latest.sort(
    (a, b) => Date.parse(versions[b] as string) - Date.parse(versions[a] as string),
  )[0];
  return {
    name,
    "dist-tags": { latest: newest ?? Object.keys(versions)[0] },
    versions: Object.fromEntries(
      Object.keys(versions).map((v) => [v, { license, dist: { unpackedSize: 1_048_576 } }]),
    ),
    time: { created: "2020-01-01T00:00:00Z", modified: "2026-08-15T00:00:00Z", ...versions },
  };
}

describe("parseRegistry —— 發版活躍度只能算穩定版", () => {
  it("預發版不計入", () => {
    // 這就是 @headlessui/vue 的真實形狀：穩定版停在兩年前，
    // 之後只有 insiders 預發版。把預發版算進去會顯示「31 版/年」，
    // 剛好把一個停更的專案顯示成最活躍的那個。
    const doc = registryDoc("headless-like", {
      "1.7.23": "2024-09-09T00:00:00Z",
      "0.0.0-insiders.aaa": "2026-04-13T00:00:00Z",
      "0.0.0-insiders.bbb": "2026-04-07T00:00:00Z",
      "0.0.0-insiders.ccc": "2025-12-04T00:00:00Z",
    });
    const facts = parseRegistry(doc, now);
    expect(facts?.stableReleasesPerYear).toBe(0);
    expect(facts?.lastStableAt).toBe("2024-09-09");
  });

  it("一年內的穩定版才計入", () => {
    const doc = registryDoc("active", {
      "1.0.0": "2024-01-01T00:00:00Z",
      "1.1.0": "2026-03-01T00:00:00Z",
      "1.2.0": "2026-07-01T00:00:00Z",
    });
    expect(parseRegistry(doc, now)?.stableReleasesPerYear).toBe(2);
  });

  it("欄位不全時回 null，不是回一個看起來正常的空殼", () => {
    expect(parseRegistry({ name: "x" }, now)).toBeNull();
    expect(parseRegistry(null, now)).toBeNull();
  });
});

describe("licenseNeedsReview", () => {
  it("常見寬鬆授權放行", () => {
    for (const license of ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause"]) {
      expect(licenseNeedsReview(license)).toBe(false);
    }
  });

  it("SEE LICENSE IN 要人看 —— PrimeVue 就是這樣被抓到的", () => {
    expect(licenseNeedsReview("SEE LICENSE IN LICENSE.md")).toBe(true);
  });

  it("沒有宣告也要人看", () => {
    expect(licenseNeedsReview("（無宣告）")).toBe(true);
    expect(licenseNeedsReview("MPL-2.0")).toBe(true);
  });
});

describe("looksUnmaintained", () => {
  it("12 個月零穩定版 → 標出來", () => {
    const doc = registryDoc("stale", { "1.0.0": "2024-01-01T00:00:00Z" });
    const facts = parseRegistry(doc, now);
    expect(facts && looksUnmaintained(facts)).toBe(true);
  });
});

describe("assessCsp", () => {
  it("零注入 → 直接相容", () => {
    const result = assessCsp({
      name: "element-plus",
      staticCssFiles: 123,
      injectionSites: [],
      nonceMentions: 0,
    });
    expect(result.verdict).toBe("clean");
  });

  it("注入只在單一可避開的元件 → 可避開", () => {
    // reka-ui 的真實形狀：唯一注入在 Splitter 的拖曳游標，而且吃 nonce。
    const result = assessCsp({
      name: "reka-ui",
      staticCssFiles: 0,
      injectionSites: ["dist/utils/style.js"],
      nonceMentions: 3,
    });
    expect(result.verdict).toBe("avoidable");
    expect(result.reason).toContain("nonce");
  });

  it("注入在主 bundle 且零 nonce → 撞 CSP", () => {
    // naive-ui 的真實形狀：css-render 是核心機制，避不開。
    const result = assessCsp({
      name: "naive-ui",
      staticCssFiles: 0,
      injectionSites: ["dist/index.js", "dist/index.mjs", "dist/index.prod.js"],
      nonceMentions: 0,
    });
    expect(result.verdict).toBe("blocked");
  });

  it("注入在主 bundle 但支援 nonce → 需要 nonce，並點出 R6 的成本", () => {
    const result = assessCsp({
      name: "vuetify",
      staticCssFiles: 132,
      injectionSites: ["dist/vuetify.esm.js", "lib/composables/theme.js"],
      nonceMentions: 6,
    });
    expect(result.verdict).toBe("needs-nonce");
    expect(result.reason).toContain("R6");
  });
});

describe("名單本身的健全性", () => {
  it("供應鏈基線一定要含 vite-plus", () => {
    // 少了它，npm 會把上游 vite（連同 @rolldown/binding 的 14 個原生二進位）
    // 算成「新增」，整張成本表就錯了 —— 而且錯得看起來很權威。
    expect(SCA_BASELINE.some((spec) => spec.startsWith("vite-plus@"))).toBe(true);
    expect(SCA_BASELINE.some((spec) => spec.includes("vite-plus-core"))).toBe(true);
  });

  it("每個被淘汰的候選都要寫出理由", () => {
    for (const candidate of CANDIDATES) {
      if (candidate.eliminated === undefined) continue;
      expect(candidate.eliminated.length, `${candidate.name} 的淘汰理由太短`).toBeGreaterThan(20);
    }
  });

  it("存活的候選至少要有兩個，否則這份調查等於沒比較", () => {
    expect(CANDIDATES.filter((c) => c.eliminated === undefined).length).toBeGreaterThanOrEqual(2);
  });
});
