import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { dependencyClosure, injectingFiles, STYLE_INJECTION } from "./style-injection.ts";

/**
 * Base UI 不在 `CSP_INCOMPATIBLE_MODULES` 名單上 —— **這個「空」要有東西守著**（C233 §六、C235）。
 *
 * 名單上的東西由 conformance 擋 import；名單**外**的東西沒有人擋，而它們在名單外的
 * 唯一理由是 C233 §三 那一次的量測：Base UI 的捲動鎖定只寫 `element.style`，
 * 全套件 `createElement('style')` 0 支。那是 1.8.0 的事實 —— 哪一版開始注入，
 * 症狀會與 Radix 一模一樣：瀏覽器擋掉、零報錯、彈出層打開時頁面照樣能捲。
 *
 * 這支測試對**裝上去的那一版**逐檔重量，所以升級 PR 會自己紅。
 */

const PACKAGE_JSON = join(import.meta.dirname, "..", "package.json");
const PEERS = new Set(["react", "react-dom"]);

const closure = dependencyClosure("@base-ui/react", PACKAGE_JSON, PEERS);

describe("Base UI 的執行期相依閉包不注入 <style>", () => {
  it("★ 閉包裡真的有東西 —— 捲動鎖定住的那一支也在", () => {
    // 走錯起點或解析失敗時閉包會是空的，下面那條就對空集合恆真。
    // `@base-ui/utils` 是 C233 §三 點名的那一支（`useScrollLock.js`）。
    expect([...closure.keys()]).toContain("@base-ui/react");
    expect([...closure.keys()]).toContain("@base-ui/utils");
  });

  it("★ 真的掃到了檔案", () => {
    const scanned = [...closure.values()].reduce(
      (sum, dir) => sum + injectingFiles(dir).scanned,
      0,
    );
    // C235 量到的是 9 支套件、2000 個執行期檔案。門檻取遠低於它的值，
    // 只擋「掃描根本沒發生」，不擋套件瘦身。
    expect(scanned).toBeGreaterThan(100);
  });

  it.each([...closure])("%s 零處 createElement('style')", (_name, dir) => {
    expect(injectingFiles(dir).hits).toEqual([]);
  });
});

describe("🔴 判定函式抓得到真的注入", () => {
  it("reka-ui 的 Splitter 那一支 —— 這棵樹上已知會注入的真實套件", () => {
    // 正向對照用真實套件而不是只用人造字串：證明這個樣式對得上實際發佈的寫法
    // （它是 C232 §四 2 那條 Splitter 禁令的來源）。reka-ui 在批次 ⑤ 隨 Vue 退場，
    // 那天這條要換一個對照，不能刪 —— 刪了之後上面那組「零處」就沒有人證明它會紅。
    const reka = dependencyClosure("reka-ui", PACKAGE_JSON, new Set()).get("reka-ui");
    expect(reka).toBeDefined();
    expect(injectingFiles(reka as string).hits.length).toBeGreaterThan(0);
  });

  it("人造套件：一行 createElement('style') 就算", () => {
    const dir = mkdtempSync(join(tmpdir(), "style-injection-"));
    try {
      writeFileSync(join(dir, "index.mjs"), 'const s = document.createElement("style");\n');
      writeFileSync(join(dir, "index.d.ts"), 'declare const s: "createElement(\\"style\\")";\n');
      const { hits, scanned } = injectingFiles(dir);
      expect(hits).toEqual([join(dir, "index.mjs")]);
      expect(scanned).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("引號與空白的變體都認得", () => {
    for (const form of [
      "createElement('style')",
      "createElement(`style`)",
      'createElement( "style" )',
    ]) {
      expect(STYLE_INJECTION.test(form), form).toBe(true);
    }
    expect(STYLE_INJECTION.test('createElement("styles")')).toBe(false);
  });
});
