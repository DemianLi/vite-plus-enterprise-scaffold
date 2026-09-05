import { describe, it, expect } from "vitest";

import {
  BASE_DIRECTIVES,
  FORBIDDEN_VALUES,
  UNSAFE_INLINE_ALLOWED_IN,
  buildCsp,
  buildSecurityHeaders,
} from "../src/index.ts";

/**
 * CSP 放寬是**靜默的**：加一個 `'unsafe-eval'` 不會有任何測試變紅、
 * 不會有任何功能壞掉，症狀只有「某天被滲透測試開單」。
 *
 * 這組測試就是那個會變紅的東西。每一條都對應一個具體的攻擊面，
 * 不是為了覆蓋率而寫。
 */

const allValues = Object.values(BASE_DIRECTIVES).flat();

describe("絕不允許的值", () => {
  it.each(FORBIDDEN_VALUES)("政策中不出現 %s", (forbidden) => {
    expect(allValues).not.toContain(forbidden);
  });

  it("沒有 'unsafe-eval'：Vue runtime-only build 不需要它（D11）", () => {
    expect(buildCsp()).not.toContain("unsafe-eval");
  });

  it("沒有萬用來源", () => {
    for (const [directive, values] of Object.entries(BASE_DIRECTIVES)) {
      expect(values, `${directive} 含萬用值`).not.toContain("*");
    }
  });
});

describe("'unsafe-inline' 的例外精準縮在 style 屬性上", () => {
  it("只有白名單內的指令可以用 'unsafe-inline'", () => {
    for (const [directive, values] of Object.entries(BASE_DIRECTIVES)) {
      if (values.includes("'unsafe-inline'")) {
        expect(
          (UNSAFE_INLINE_ALLOWED_IN as readonly string[]).includes(directive),
          `${directive} 使用了 'unsafe-inline' 但不在白名單內`,
        ).toBe(true);
      }
    }
  });

  it("style-src 本身**不含** 'unsafe-inline'", () => {
    // 這是關鍵區別：放寬整個 style-src 等於允許任意 <style> 注入，
    // 只放寬 style-src-attr 則僅允許 Vue 的 :style 綁定。
    expect(BASE_DIRECTIVES["style-src"]).not.toContain("'unsafe-inline'");
  });

  it("style-src-attr 有 'unsafe-inline'，否則 Vue 的 :style 綁定會靜音失效", () => {
    expect(BASE_DIRECTIVES["style-src-attr"]).toContain("'unsafe-inline'");
  });

  it("script-src 絕不含 'unsafe-inline'", () => {
    expect(BASE_DIRECTIVES["script-src"]).not.toContain("'unsafe-inline'");
  });
});

describe("點擊劫持與資料外洩", () => {
  it.each([
    ["frame-ancestors", "'none'"],
    ["base-uri", "'none'"],
    ["object-src", "'none'"],
  ])("%s 設為 %s", (directive, expected) => {
    expect(BASE_DIRECTIVES[directive]).toEqual([expected]);
  });

  it("connect-src 限制在同源：跨源請求會讓 SameSite cookie 失效（D8）", () => {
    expect(BASE_DIRECTIVES["connect-src"]).toEqual(["'self'"]);
  });
});

describe("nonce", () => {
  it("提供 nonce 時加進 script-src", () => {
    expect(buildCsp({ nonce: "abc123" })).toContain("'nonce-abc123'");
  });

  it("未提供 nonce 時 script-src 仍是 'self'，不會退化成放寬", () => {
    const csp = buildCsp();
    expect(csp).toContain("script-src 'self';");

    // 斷言只針對 script-src 這一段：整份政策本來就含
    // `style-src-attr 'unsafe-inline'`，那是 D11 設計好的例外（見上面的測試）。
    // 拿 not.toContain("unsafe") 掃全字串會把那個例外也當成違規。
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc).not.toContain("unsafe");
  });

  it("nonce 不會污染 BASE_DIRECTIVES（多次呼叫不累加）", () => {
    buildCsp({ nonce: "first" });
    expect(buildCsp({ nonce: "second" })).not.toContain("first");
    expect(BASE_DIRECTIVES["script-src"]).toEqual(["'self'"]);
  });
});

describe("report-only 與 enforce 的切換", () => {
  it("report-only 使用 Report-Only 標頭名", () => {
    const headers = buildSecurityHeaders({ reportOnly: true });
    expect(headers).toHaveProperty("Content-Security-Policy-Report-Only");
    expect(headers).not.toHaveProperty("Content-Security-Policy");
  });

  it("enforce 使用正式標頭名", () => {
    const headers = buildSecurityHeaders({ reportOnly: false });
    expect(headers).toHaveProperty("Content-Security-Policy");
    expect(headers).not.toHaveProperty("Content-Security-Policy-Report-Only");
  });

  it("兩種模式的政策內容完全相同 —— 切換時不會冒出沒測過的規則", () => {
    const reportOnly = buildSecurityHeaders({ reportOnly: true });
    const enforce = buildSecurityHeaders({ reportOnly: false });
    expect(reportOnly["Content-Security-Policy-Report-Only"]).toBe(
      enforce["Content-Security-Policy"],
    );
  });

  it("report-uri 有帶進去，否則 report-only 階段收不到任何回報", () => {
    expect(buildCsp({ reportUri: "/api/csp-report" })).toContain("report-uri /api/csp-report");
  });
});

describe("其餘安全標頭", () => {
  it.each([
    "X-Content-Type-Options",
    "Referrer-Policy",
    "X-Frame-Options",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ])("下發 %s", (header) => {
    expect(buildSecurityHeaders({ reportOnly: true })).toHaveProperty(header);
  });

  it("HSTS 至少一年，且涵蓋子網域", () => {
    const hsts = buildSecurityHeaders({ reportOnly: true })["Strict-Transport-Security"]!;
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");
  });
});

describe("指令清單不得縮水", () => {
  it("★ 13 條指令一條不少 —— 刪任何一條，這裡的 diff 直接印出少了哪一條", () => {
    // 政策是手寫的、減的方向零守、加一條要來這裡登記正是 review 會看到的動作。
    // 與 UNSAFE_INLINE_ALLOWED_IN 的檔內註解同一個理由。
    expect(Object.keys(BASE_DIRECTIVES).sort()).toEqual([
      "base-uri",
      "connect-src",
      "default-src",
      "font-src",
      "form-action",
      "frame-ancestors",
      "img-src",
      "manifest-src",
      "object-src",
      "script-src",
      "style-src",
      "style-src-attr",
      "worker-src",
    ]);
  });

  it("★ 不會退回 default-src 的三條各自在場", () => {
    // 這三條沒有 fallback，刪掉不是「回到 default-src」而是「不設限」；
    // form-action 是改前唯一沒具名的那條。
    const directives = Object.keys(BASE_DIRECTIVES);
    for (const noFallback of ["base-uri", "form-action", "frame-ancestors"]) {
      expect(directives, `${noFallback} 不在 BASE_DIRECTIVES`).toContain(noFallback);
    }
  });
});
