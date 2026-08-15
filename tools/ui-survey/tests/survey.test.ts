import { describe, expect, it } from "vitest";
import { assessCsp } from "../src/csp.ts";
import { CANDIDATES, SCA_BASELINE } from "../src/candidates.ts";

/**
 * 市調工具的判定測試。
 *
 * 這支工具產出的數字會被拿去跟法務與資安講話，所以每一條判定都要能被重驗。
 * 特別是**兩個第一版就算錯的地方**（發版頻率、供應鏈基線）——
 * 它們錯的方向都是「看起來很合理但結論相反」，所以各有一支測試釘住。
 */

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
