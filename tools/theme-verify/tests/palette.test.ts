import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRANSLATION_TARGETS,
  declaredColorTokens,
  findPaletteUsage,
  translationFor,
  usedClassNames,
} from "../src/palette.ts";

/**
 * 「元件裡不准出現原始顏色」這條規則本身的驗收。
 *
 * 用人造來源，不讀真的元件 —— 真的元件現在是零違規，拿它當來源的話
 * 這幾條測試會**在規則壞掉時照樣通過**（空集合等於空集合）。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const THEME_CSS = readFileSync(join(ROOT, "platform/ui/src/styles/index.css"), "utf8");

/**
 * 第三類的減數。**用真的那一份**，不是人造集合 ——
 * 這幾條測試要問的是「這個 repo 的代幣詞彙下，那些名字算不算違規」。
 */
const DECLARED = declaredColorTokens(THEME_CSS);

const scan = (source: string) =>
  findPaletteUsage("Fixture.vue", source, DECLARED).map((v) => v.className);

describe("內建色階", () => {
  it("🔴 直接用 gray → 紅", () => {
    expect(scan(`<div class="bg-gray-50">`)).toEqual(["bg-gray-50"]);
  });

  it("★ 帶 variant 前綴的也要抓到", () => {
    // 轉換前 secondary 的那一格就是 `hover:bg-gray-50`。正則少了前綴那一段的話，
    // 這條規則會漏掉**它最該抓的那一個**，而漏掉的方式是安靜通過。
    expect(scan(`"border-gray-300 hover:bg-gray-50 focus-visible:outline-blue-500"`)).toEqual([
      "border-gray-300",
      "hover:bg-gray-50",
      "focus-visible:outline-blue-500",
    ]);
  });

  it("🔴 white／black 也算原始顏色", () => {
    // 這兩個最容易被漏掉：它們不長得像調色盤，所以看起來不像缺口。
    // 而 `text-white` 正是 primary 按鈕上的字 —— 各案把強調色換成淺色時，
    // 那行字會直接消失，沒有任何閘門會說話。
    expect(scan(`"bg-white text-white bg-black/40"`)).toEqual([
      "bg-white",
      "text-white",
      "bg-black/40",
    ]);
  });
});

describe("色票層", () => {
  it("🔴 元件直接用色票 → 紅", () => {
    expect(scan(`"bg-brand-600 hover:bg-brand-700 bg-danger-500"`)).toEqual([
      "bg-brand-600",
      "hover:bg-brand-700",
      "bg-danger-500",
    ]);
  });

  it("★ 但語意代幣不能被誤判成色票", () => {
    // `bg-danger` 合法、`bg-danger-500` 不合法，兩者只差一個數字後綴。
    // 這裡分不開的話，轉換完成的元件會全紅，然後整條規則會被關掉（C41）。
    expect(scan(`"bg-danger bg-accent text-on-danger border-line text-fg-muted"`)).toEqual([]);
  });

  it("★ 尺寸與字級不在守備範圍", () => {
    // 只守顏色。把 rounded-lg／text-sm 一起擋掉會逼出一堆
    // `--spacing-control-sm-padding` 這種代幣 —— D16 說的過度設計。
    expect(scan(`"rounded-lg text-sm shadow-xl h-10 px-4"`)).toEqual([]);
  });
});

describe("註解", () => {
  it("★ 註解裡的反例不算違規", () => {
    // 元件的 docblock 會寫「轉換前這裡是 border-gray-300」。抓到它的話，
    // 規則會在**解釋自己的那句話**上紅 —— 而修法只有兩種：刪掉說明，
    // 或關掉規則。兩種都是壞的。
    const source = [
      " * 轉換前是 border-gray-300 bg-white text-gray-900",
      "// hover:bg-gray-50 也一樣",
      "<!-- bg-black/40 -->",
      `const x = "bg-surface";`,
    ].join("\n");
    expect(scan(source)).toEqual([]);
  });

  it("★ 但同一行有真的用法時不能被註解豁免掉", () => {
    // 「開頭是註解就整行跳過」的代價：行尾註解裡的違規會漏。
    // 這條測試釘住的是**行首**才豁免 —— 否則在字串後面補一個 `//`
    // 就成了萬用出口（與 exit-drill 那個 HISTORICAL 豁免同一個顧慮）。
    expect(scan(`const x = "bg-gray-50"; // 之後要改`)).toEqual(["bg-gray-50"]);
  });
});

describe("未翻譯的 shadcn 代幣", () => {
  it("🔴 utility 形式 → 紅，而且訊息說得出替代品", () => {
    // `bg-primary` 的 rest 一個連字號都沒有；`bg-muted-foreground` 的最後
    // 一段不是數字。兩者都會被「數字後綴」那兩行丟掉 —— 所以這一類的判定
    // **必須排在它們之前**。這條測試釘住的就是那個順序：放到後面去，
    // 這裡會拿到空陣列。
    expect(scan(`"bg-primary text-muted-foreground border-input ring-ring"`)).toEqual([
      "bg-primary",
      "text-muted-foreground",
      "border-input",
      "ring-ring",
    ]);
    expect(translationFor("primary")).toBe("--color-accent");
    expect(translationFor("muted-foreground")).toBe("--color-fg-muted");
    expect(translationFor("ring")).toBe("--color-focus");
  });

  it("🔴 任意屬性語法切出來的裸代幣也要抓到", () => {
    // Tailwind v4 的「前綴 ＋ 括號 ＋ 代幣名」會被切成兩個詞，裸代幣的第一個
    // 連字號在 index 0 —— 落到 `dash <= 0` 那行就沒了。
    //
    // ⚠️ 這裡刻意用字串拼接寫出那個語法，不寫成字面值：Tailwind 掃這份檔案
    // （連註解一起），寫成字面值就會在產物裡編出一條指向不存在代幣的規則，
    // 然後 `auditReferences` 紅。寫這一類的時候真的踩過一次（C104 §三）。
    const arbitrary = `"bg-` + `(--primary) text-` + `(--muted-foreground)"`;
    expect(scan(arbitrary)).toEqual(["--primary", "--muted-foreground"]);
  });

  it("🔴 帶 variant 前綴的也要抓到", () => {
    expect(scan(`"hover:bg-primary focus-visible:ring-ring"`)).toEqual([
      "hover:bg-primary",
      "focus-visible:ring-ring",
    ]);
  });

  it("★ 兩邊同名的不能誤報 —— 減法是活的", () => {
    // `accent` 是今天唯一的碰撞，而 `bg-accent` 在元件裡用了十幾次。
    // 判準若寫成「shadcn 的詞彙全部擋掉」，這一格會全紅然後規則被關掉（C41）。
    expect(DECLARED.has("accent")).toBe(true);
    expect(scan(`"bg-accent hover:bg-accent-hover text-on-accent"`)).toEqual([]);
  });

  it("★ 我們自己的形狀代幣不能被前綴比對誤報", () => {
    // shadcn 有 `--border`，我們有 `--border-width-control`。用前綴比對的話
    // 後者會被報成違規 —— 而它是這個 repo 自己宣告的代幣，真的在用。
    const source = `border-bottom: var(--border-width-control) solid var(--color-line);`;
    expect(scan(source)).toEqual([]);
  });

  it("★ 沒有對應的代幣不編一個出來", () => {
    // `secondary` 在這裡是一組 class，`sidebar-*`／`chart-*` 這個 repo 沒有
    // 那個概念。硬給對應比不給更糟：它讓人以為換掉一個代幣就等價。
    expect(scan(`"bg-secondary bg-sidebar text-chart-1"`)).toEqual([
      "bg-secondary",
      "bg-sidebar",
      "text-chart-1",
    ]);
    expect(translationFor("secondary")).toBeNull();
    expect(translationFor("sidebar")).toBeNull();
    expect(translationFor("chart-1")).toBeNull();
  });
});

describe("第三類的兩份資料", () => {
  it("★ 每個翻譯目標都真的宣告在 index.css 裡", () => {
    // ⚠️ **這一條與詞彙表的失敗方向不同。** 詞彙表漏一個 → 少擋一次；
    // 翻譯目標寫錯 → 訊息把人送去一個**不存在的代幣**，那是錯的方向。
    // `--color-muted` → `--color-fg-muted` 那次改名證明這個風險是真的：
    // 少了這條斷言，那次改名會讓這道閘門開始指路指到空氣。
    expect(TRANSLATION_TARGETS.length).toBeGreaterThan(0);
    for (const target of TRANSLATION_TARGETS) {
      expect(DECLARED.has(target.slice("--color-".length))).toBe(true);
    }
  });

  it("★ 減數是從真的 CSS 推導出來的，不是人造的", () => {
    // 這條釘住的是**接線**：`declaredColorTokens` 若解析不到東西，
    // 減數變空 → 所有同名代幣都變違規 → 真元件的 `bg-accent` 全紅。
    // 那個失敗是吵的，但這裡直接把它變成一條會紅的斷言。
    expect(DECLARED.size).toBeGreaterThan(10);
    expect(DECLARED.has("fg-muted")).toBe(true);
    expect(DECLARED.has("line")).toBe(true);
    // 反向：`@theme` 沒宣告的名字不能混進來。
    expect(DECLARED.has("primary")).toBe(false);
    expect(DECLARED.has("muted-foreground")).toBe(false);
  });

  it("★ 解析不到 @theme 時回空集合，由 cli.ts 擋", () => {
    expect(declaredColorTokens("/* 沒有 theme 區塊 */").size).toBe(0);
  });

  it("★ 訊息引用的 UiButton VARIANTS 真的有 secondary 那一鍵", () => {
    // 無對應那一支訊息寫著「`secondary` 在這裡是一組 class（見 UiButton 的
    // VARIANTS）」。⚠️ **那是一句指向外部原始碼的引用，而引用會過期** ——
    // 改名或重構掉那張表，訊息就把人送去一個不存在的東西。
    //
    // 這條與上面「翻譯目標真的存在」同一個形狀（C97 §三之二），
    // 而它差一點沒有被寫下來：驗了 `VARIANTS` 在，沒驗 `secondary` 在裡面。
    const button = readFileSync(join(ROOT, "platform/ui/src/components/UiButton.vue"), "utf8");
    const table = /const VARIANTS: [^=]*= \{([\s\S]*?)\n\};/.exec(button);
    expect(table).not.toBeNull();
    expect(table?.[1]).toContain("secondary:");
    // 而且它真的是「一組 class」而不是單一代幣 —— 訊息說的就是這件事。
    const secondary = /secondary: "([^"]*)"/.exec(table?.[1] ?? "");
    expect((secondary?.[1] ?? "").split(" ").length).toBeGreaterThan(1);
  });

  it("★ 裸名帶在 violation 上，不是訊息端再解析一次", () => {
    // ⚠️ 這條釘住的是「不要有第二份剖析」。`cli.ts` 曾經自己從 className
    // 再切一次（去 variant 前綴、取第一個連字號之後、丟 /opacity）——
    // 那是同一段邏輯的第二份手抄本。
    const hits = findPaletteUsage("F.vue", `"hover:bg-primary text-muted-foreground/70"`, DECLARED);
    expect(hits.map((h) => h.upstream)).toEqual(["primary", "muted-foreground"]);
    // 前兩類沒有裸名。
    expect(findPaletteUsage("F.vue", `"bg-gray-50"`, DECLARED)[0]?.upstream).toBeNull();
  });
});

describe("usedClassNames", () => {
  it("只收得到非註解行的類別", () => {
    const source = [" * bg-accent 在註解裡", `const v = "border-line bg-surface";`].join("\n");
    const names = usedClassNames(source);
    expect(names.has("border-line")).toBe(true);
    expect(names.has("bg-surface")).toBe(true);
    expect(names.has("bg-accent")).toBe(false);
  });

  it("★ 不收沒有連字號的識別字", () => {
    // 少了這條，`computed`／`props`／`const` 會全部混進來，
    // 而那份集合是拿來當濾網用的 —— 混進雜訊等於濾網失效。
    expect([...usedClassNames("const computed = props.variant;")]).toEqual([]);
  });
});
