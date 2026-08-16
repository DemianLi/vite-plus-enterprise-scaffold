import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 設計系統的樣式入口驗收（D15）。
 *
 * ── 這支測試防的是一種「綠燈但畫面壞掉」 ────────────────────────────
 *
 * Tailwind v4 的自動來源偵測**刻意跳過 node_modules**，而在 monorepo 裡
 * `@org/ui` 與各切片都是透過 node_modules 的 symlink 被消費的。
 * 少了明寫的 `@source`，實測結果是：
 *
 *   建置成功、CSS 檔案從 160 bytes 變成 4409 bytes、退出碼 0 ——
 *   **而裡面一個 utility 都沒有。** 那 4.4 kB 全是 base reset。
 *
 * 也就是說「CSS 變大了」不能當作它有在編譯的證據。加上 `@source` 之後
 * 同一份程式碼產出 12.25 kB，探針才開始命中。
 *
 * 所以這裡守的是宣告本身：新增一層（例如 `packages/`）而忘了加 `@source`，
 * 產生的會是完全一樣的症狀，而且沒有任何閘門會紅。
 */

// 路徑一律相對**這支測試自己**，不從 repo 根目錄推。
// 第一版寫成 join(ROOT, "platform/ui/...")，於是退出演練把 package 複製到
// packages/ui/ 之後整組測試 ENOENT —— 而那正是演練該抓到的東西：
// **測試不該假設自己在原本的目錄結構裡。**
const PACKAGE_ROOT = join(import.meta.dirname, "..");
const ENTRY = join(PACKAGE_ROOT, "src/styles/index.css");

/**
 * 去掉 CSS 註解，但**保護引號內的字串**。
 *
 * ── 兩個都踩過的坑 ──────────────────────────────────────────────────
 *
 * 一、不去註解的話，兩支測試會誤報 —— 因為那份 CSS 的註解裡就寫著
 * 「這裡刻意不寫任何 @apply」與「為什麼必須明寫 @source」。
 * 測試比對到了自己在解釋的那段文字。
 *
 * 二、天真地去註解（`/\*[^]*?\*\/` 一把掃）會**吃掉 glob**：
 *
 *     @source "../../../../**\/*.{vue,ts}";
 *                          ↑ 這裡的 /**\/ 是一個合法的 CSS 空註解
 *
 * 結果那行變成 `../../../..*.{vue,ts}` —— 路徑少了一層，而測試看到的
 * 「宣告」跟 Tailwind 看到的不是同一個東西。這種錯最難查：兩邊都沒報錯。
 *
 * 所以要先認得字串。與 tools/exit-drill 的 plugin 解析器同一個做法：
 * **要比對程式碼就得先分辨程式碼與字面值**，正則做不到這件事。
 */
function stripCssComments(css: string): string {
  let out = "";

  for (let i = 0; i < css.length; i++) {
    const char = css[i] as string;

    if (char === '"' || char === "'") {
      const quote = char;
      out += char;
      i++;
      while (i < css.length && css[i] !== quote) {
        out += css[i];
        i++;
      }
      out += quote;
      continue;
    }

    if (char === "/" && css[i + 1] === "*") {
      i += 2;
      while (i < css.length && !(css[i] === "*" && css[i + 1] === "/")) i++;
      i++;
      continue;
    }

    out += char;
  }

  return out;
}

function entry(): string {
  return stripCssComments(readFileSync(ENTRY, "utf8"));
}

/** 抽出所有 `@source "..."` 的路徑。刻意只認帶引號的形式 —— Tailwind 也只認那個。 */
function declaredSources(css: string): readonly string[] {
  return [...css.matchAll(/@source\s+"([^"]+)"/g)].map((match) => match[1] as string);
}

describe("樣式入口", () => {
  it("匯入 tailwindcss", () => {
    expect(entry()).toContain('@import "tailwindcss"');
  });

  it("至少宣告一個 @source", () => {
    // 少了它，Tailwind 的自動偵測在 monorepo 裡什麼都掃不到（symlink），
    // 而症狀是「建置成功但一個 utility 都沒有」。
    expect(declaredSources(entry()).length).toBeGreaterThan(0);
  });

  it("@source 必須是能跨出本 package 的 glob", () => {
    // 逐層列出（"../../../../features"）在這個 repo 裡是對的，
    // 但**退出演練會把 package 搬到別的路徑**，那些相對路徑會指向不存在的地方——
    // 而 Tailwind 不會報錯，只會安靜地少掃一整層。
    // 要求 glob 是為了讓「換一個目錄佈局」不會讓樣式無聲消失。
    const sources = declaredSources(entry());
    expect(
      sources.some((source) => source.includes("**") && source.startsWith("..")),
      `@source 全是固定路徑（${sources.join("、")}）——換個佈局就會靜靜失效`,
    ).toBe(true);
  });

  it("@source 一律加引號", () => {
    // Tailwind 4.3.3 對沒加引號的直接報錯（實測：`@source` paths must be quoted），
    // 但錯誤訊息不會告訴你是哪一行 —— 在這裡擋比在建置時擋便宜。
    const withoutQuotes = [...entry().matchAll(/@source\s+([^"\s][^;]*);/g)];
    expect(withoutQuotes.map((m) => m[0])).toEqual([]);
  });
});

describe("去註解器本身", () => {
  it("不會把 glob 裡的 /**/ 當成空註解吃掉", () => {
    // 這是實際踩過的坑：@source "../../../../**/*.{vue,ts}" 裡的 /**/ 是一個
    // 合法的 CSS 空註解，天真的去註解器會把路徑少刨掉一層 ——
    // 而測試看到的宣告與 Tailwind 看到的變成兩回事，兩邊都不報錯。
    expect(declaredSources(entry())).toContain("../../../../**/*.{vue,ts}");
  });

  it("註解裡提到的 @source 不算宣告", () => {
    // 這份 CSS 的註解裡就寫著第二版用過的固定路徑。抓到它們的話，
    // 「必須是 glob」那條會被誤導成通過。
    expect(declaredSources(entry())).not.toContain("../components");
  });
});

describe("設計代幣", () => {
  it("@theme 裡有品牌色與控制項圓角", () => {
    const css = entry();
    expect(css).toContain("@theme");
    expect(css).toContain("--color-brand-600");
    expect(css).toContain("--radius-control");
  });

  it("★ 語意層必須指向色票層，不能直接寫值", () => {
    // 這是 multi-brand 那條接縫的形狀本身（HANDOFF #24）：
    // `--color-accent: var(--color-brand-600)` 讓各案有兩種粒度可選 ——
    // 覆寫色票（整套品牌一起走）或覆寫語意（只換一個用途）。
    //
    // 改成直接寫值的話兩種都還在「能改」，但各案要一格一格追，
    // 而那正是 #24 量到的狀態：元件裡 16 處顏色只有 5 處走代幣。
    //
    // ⚠️ 這裡只驗**宣告的形狀**。「這個間接在建置後仍然是活的」是另一回事，
    // 由 `tools/theme-verify` 真的建置兩次去比對 —— 一支只讀 CSS 檔的測試
    // 看不到 Tailwind 有沒有在建置期把它求值掉。
    const semantic = [
      ...entry().matchAll(/^\s*(--color-(?:accent|danger|focus)[a-z-]*)\s*:\s*([^;]+);/gm),
    ];

    expect(semantic.length, "@theme 裡找不到任何語意色代幣").toBeGreaterThan(0);
    for (const [, name, value] of semantic) {
      expect(value, `${name} 直接寫了值，沒有指向色票層`).toContain("var(--color-");
    }
  });

  it("★ 非顏色的代幣也要有", () => {
    // #24 查到的：multi-brand 之間不同的不只顏色，圓角／外框／陰影／字重
    // 都要能換。只做顏色的話，接縫看起來在那裡但只覆蓋三分之一。
    const css = entry();
    for (const token of ["--radius-", "--border-width-", "--shadow-", "--font-weight-"]) {
      expect(css, `@theme 裡沒有任何 ${token}* 代幣`).toContain(token);
    }
  });

  it("入口不寫元件類別", () => {
    // shadcn 模型的重點是「改一個元件時只要看一個檔案」。
    // 把樣式抽到共用入口會讓那個好處消失，然後我們只是自己做了一套 Bootstrap。
    expect(entry()).not.toContain("@apply");
  });
});

describe("公開契約", () => {
  it("index.ts 匯出每一個 components/ 裡的元件", () => {
    // 元件寫好了卻忘了匯出，使用端只會得到「找不到 UiXxx」——
    // 而那個錯誤訊息不會提示你去看 index.ts。
    const index = readFileSync(join(PACKAGE_ROOT, "src/index.ts"), "utf8");
    const components = readdirSync(join(PACKAGE_ROOT, "src/components")).filter((file) =>
      file.endsWith(".vue"),
    );

    expect(components.length).toBeGreaterThan(0);
    for (const file of components) {
      const name = file.replace(".vue", "");
      expect(index, `${file} 沒有在 index.ts 匯出`).toContain(`./components/${file}`);
      expect(index).toContain(`export { default as ${name} }`);
    }
  });

  it("不轉出 reka-ui 的基元", () => {
    // 直接轉出等於把「哪些基元可以用」交給每個團隊各自決定 ——
    // 而其中 Splitter 會在執行期注入 <style>，被 style-src 'self' 擋掉。
    const index = readFileSync(join(PACKAGE_ROOT, "src/index.ts"), "utf8");
    expect(index).not.toContain('from "reka-ui"');
    expect(index).not.toContain("export * from");
  });
});
