import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accountPlugins, DRILL_PLUGINS, parseConfiguredPlugins } from "../src/plugins.ts";

/**
 * 退出演練的 plugin 帳目（見 cli.ts 的說明）。
 *
 * ── 為什麼這支測試存在 ──────────────────────────────────────────────
 *
 * 這道檢查防的是**漏報**：一個沒被認出來的 plugin ＝ 演練少裝一個東西、
 * 照樣建置成功、照樣寫下 pass，而產物是錯的。整個機制的價值等於
 * `parseConfiguredPlugins` 的召回率，所以下面每一組「應該被抓到」都是必要的。
 *
 * 同時測**偽陽性**。誤報的代價不是零：一道會亂叫的閘門，三個月後就會被
 * 某個趕著出貨的人加上 skip，然後永遠不會被拿掉。註解裡提到的 plugin、
 * 字串裡長得像呼叫的東西、參數裡的巢狀函式，都不可以觸發它。
 */

const ROOT = join(import.meta.dirname, "../../..");

describe("parseConfiguredPlugins —— 應該抓到的", () => {
  it("抓得到最單純的一個", () => {
    expect(parseConfiguredPlugins("export default { plugins: [vue()] }")).toEqual(["vue"]);
  });

  it("帶物件參數的呼叫仍算一個 plugin，參數裡的鍵不算", () => {
    const source = `plugins: [vue(), securityHeaders({ reportUri: "/api/csp-report" })]`;
    expect(parseConfiguredPlugins(source)).toEqual(["vue", "securityHeaders"]);
  });

  it("參數裡有含 // 的網址時，不會把陣列尾巴一起吃掉", () => {
    // 天真的「先去掉 // 之後的內容」會從 http:// 砍到行尾，
    // 於是 `]` 不見了、後面的 plugin 全部消失 —— 而且安靜地消失。
    const source = `plugins: [proxy({ target: "http://localhost:8080" }), vue(), tailwindcss()]`;
    expect(parseConfiguredPlugins(source)).toEqual(["proxy", "vue", "tailwindcss"]);
  });

  it("跨多行、中間夾註解也抓得到", () => {
    const source = [
      "  plugins: [",
      "    vue(),",
      "    // 這行是說明",
      "    securityHeaders({ reportUri: '/api/csp-report' }),",
      "    /* 區塊註解 */",
      "    assertStaticCspCompatible(),",
      "  ],",
    ].join("\n");
    expect(parseConfiguredPlugins(source)).toEqual([
      "vue",
      "securityHeaders",
      "assertStaticCspCompatible",
    ]);
  });

  it("巢狀陣列裡的 plugin 不會隱形", () => {
    // Vite 接受 plugins: [[a(), b()], c()]。只認第一層的話，
    // 把新 plugin 包一層方括號就能繞過整道檢查。
    expect(parseConfiguredPlugins("plugins: [[a(), b()], c()]")).toEqual(["a", "b", "c"]);
  });

  it("同一個檔案裡有多個 plugins 陣列時，每一個都會掃", () => {
    // 根目錄 vite.config.ts 的 `lint: { plugins: [...] }` 排在前面。
    // 只取第一個命中的話，真正的 vite plugins 陣列會被完全跳過。
    const source = `lint: { plugins: ["import", "vue"] },\n  plugins: [vue(), tailwindcss()]`;
    expect(parseConfiguredPlugins(source)).toEqual(["vue", "tailwindcss"]);
  });

  it("條件式註冊也算數", () => {
    expect(parseConfiguredPlugins("plugins: [isDev && devtools(), vue()]")).toEqual([
      "devtools",
      "vue",
    ]);
  });
});

describe("parseConfiguredPlugins —— 不可以誤報的", () => {
  it("oxlint 的字串型 plugins 陣列不算 plugin", () => {
    // 這是根目錄 vite.config.ts 真正的內容。誤報的話 gate 從第一天就是紅的。
    const source = `lint: { plugins: ["import", "typescript", "unicorn", "oxc", "vue", "promise"] }`;
    expect(parseConfiguredPlugins(source)).toEqual([]);
  });

  it("行註解裡提到的 plugin 不算", () => {
    const source = "plugins: [vue()] // 之後可能會加 tailwindcss()";
    expect(parseConfiguredPlugins(source)).toEqual(["vue"]);
  });

  it("區塊註解裡提到的 plugin 不算", () => {
    const source = "plugins: [\n  /* 評估中：tailwindcss() 與 unocss() */\n  vue(),\n]";
    expect(parseConfiguredPlugins(source)).toEqual(["vue"]);
  });

  it("字串裡長得像呼叫的內容不算", () => {
    expect(parseConfiguredPlugins(`plugins: [vue({ name: "tailwindcss()" })]`)).toEqual(["vue"]);
  });

  it("參數裡的巢狀函式呼叫不算", () => {
    expect(parseConfiguredPlugins("plugins: [vue({ template: compile() })]")).toEqual(["vue"]);
  });

  it("展開既有陣列不算 plugin", () => {
    expect(parseConfiguredPlugins("plugins: [...base, vue()]")).toEqual(["vue"]);
  });

  it("沒有 plugins 陣列時回空，不是拋錯", () => {
    expect(parseConfiguredPlugins("export default { build: { sourcemap: 'hidden' } }")).toEqual([]);
  });
});

describe("accountPlugins —— 閘門本身", () => {
  it("未登記的 plugin 一定會紅，訊息要指得出是哪個檔案的哪一個", () => {
    const errors = accountPlugins([
      { path: "apps/console/vite.config.ts", source: "plugins: [vue(), unocss()]" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unocss");
    expect(errors[0]).toContain("apps/console/vite.config.ts");
  });

  it("多個未登記的 plugin 全部列出來，不是只報第一個", () => {
    // 只報第一個會讓人一次修一個、跑三次 CI，然後開始覺得這道閘門很煩。
    const errors = accountPlugins([
      { path: "a.ts", source: "plugins: [unocss(), svgLoader(), imagetools()]" },
    ]);
    expect(errors).toHaveLength(3);
  });

  it("兩張表都登記過的 plugin 全部放行", () => {
    const source = "plugins: [vue(), securityHeaders({}), assertStaticCspCompatible()]";
    expect(accountPlugins([{ path: "a.ts", source }])).toEqual([]);
  });

  it("沒有任何設定檔時回空，不是拋錯", () => {
    expect(accountPlugins([])).toEqual([]);
  });

  it("DRILL_PLUGINS 裡的每一筆都湊得出可用的 import 與模組名", () => {
    // 登記了卻少寫 importLine，--full 會產生一份 import 不到東西的設定，
    // 而那個錯誤要等到季度演練才會出現。
    for (const plugin of DRILL_PLUGINS) {
      expect(plugin.importLine).toContain(plugin.module);
      expect(plugin.importLine).toContain(plugin.name);
      expect(plugin.module.length).toBeGreaterThan(0);
    }
  });
});

describe("退出面設定檔的實際內容", () => {
  it("apps/console 的四個 plugin 全部被認出來", () => {
    // 拿真檔案測，而不是只測人造字串 —— 這支測試若和真實設定脫節，
    // 它會在 CI 上一直綠，而閘門在真檔案上早就瞎了。
    const source = readFileSync(join(ROOT, "apps/console/vite.config.ts"), "utf8");
    expect(parseConfiguredPlugins(source)).toEqual([
      "vue",
      "tailwindcss",
      "securityHeaders",
      "assertStaticCspCompatible",
    ]);
  });

  it("加一個未登記的 plugin 進去，一定會被抓到", () => {
    // 這就是這道閘門存在的理由，用真檔案演一次。
    const source = readFileSync(join(ROOT, "apps/console/vite.config.ts"), "utf8").replace(
      "plugins: [\n      vue(),",
      "plugins: [\n      vue(),\n      unocss(),",
    );
    expect(parseConfiguredPlugins(source)).toContain("unocss");
  });
});
