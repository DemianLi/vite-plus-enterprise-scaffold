import { describe, expect, it } from "vitest";
import { findPaletteUsage, usedClassNames } from "../src/palette.ts";

/**
 * 「元件裡不准出現原始顏色」這條規則本身的驗收。
 *
 * 用人造來源，不讀真的元件 —— 真的元件現在是零違規，拿它當來源的話
 * 這幾條測試會**在規則壞掉時照樣通過**（空集合等於空集合）。
 */

const scan = (source: string) => findPaletteUsage("Fixture.vue", source).map((v) => v.className);

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
