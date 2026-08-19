import { describe, expect, it } from "vitest";
import {
  RUNTIME_PROVIDED,
  auditReferences,
  customProperties,
  resolve,
  ruleFor,
  rules,
} from "../src/css.ts";

/**
 * CSS 讀取層的驗收。
 *
 * 這幾條看起來很基礎，但它們守的是一種**特別難發現**的失敗：讀取層少讀了
 * 幾條規則時，上層的「兩份產物比對」不會報錯，它會**通過** ——
 * 因為要比對的那條不在集合裡。閘門於是變成一個永遠亮綠的燈。
 */

describe("切塊", () => {
  it("★ at-rule 包住的規則要拆得出來", () => {
    // 正則版第一版就是死在這裡：Tailwind 的產物整份包在 @layer 裡，
    // 於是它只回傳最外層那一塊，utility 一條都拿不到。
    const css = "@layer utilities{.a{color:red}.b{color:blue}}";
    expect(rules(css).map((r) => r.selector)).toEqual([".a", ".b"]);
  });

  it("★ :is() 裡的括號不會讓選擇器對錯位置", () => {
    const css = ".x:hover:is(:where(.y) *){color:red}";
    expect(rules(css)[0]?.selector).toBe(".x:hover:is(:where(.y) *)");
  });

  it("巢狀 media 也拆得到", () => {
    const css = "@media (min-width:40rem){@supports (color:red){.c{color:red}}}";
    expect(rules(css).map((r) => r.selector)).toEqual([".c"]);
  });
});

describe("自訂屬性", () => {
  it("同名取最後一次出現的值", () => {
    // app 端的覆寫就是靠「同名宣告排在後面」生效的。取第一次的話，
    // 這支工具會把最該驗的那件事驗成反的 —— 而且驗出來是「覆寫沒生效」，
    // 看起來像產品壞了。
    expect(customProperties("--a:1;--a:2").get("--a")).toBe("2");
  });
});

describe("展開", () => {
  it("★ 多層 var() 一路展開", () => {
    // 兩層代幣的重點就在這裡：--color-accent 的**宣告文字**在覆寫前後
    // 一個字都不會變，只有展開之後才看得出來它跟著色票走了。
    const vars = customProperties("--x:var(--y);--y:var(--z);--z:red");
    expect(resolve("var(--x)", vars)).toBe("red");
  });

  it("用得到 fallback", () => {
    expect(resolve("var(--nope, blue)", customProperties(""))).toBe("blue");
  });

  it("★ 循環參照不會把行程掛住", () => {
    // CSS 自己容得下 `--a: var(--a)`。這裡碰到它必須停下來 ——
    // 一道會把 CI 卡死的閘門，第一件事就是被拿掉。
    const vars = customProperties("--a:var(--b);--b:var(--a)");
    expect(() => resolve("var(--a)", vars)).not.toThrow();
  });
});

describe("找規則", () => {
  it("★ 用完全相等，不是包含", () => {
    // `.text-fg` 會同時命中 `.text-fg-muted` 與 `.text-fg-subtle` ——
    // 類別名稱本來就互為前綴，所以子字串比對在這裡永遠是錯的。
    const all = rules(".text-fg-muted{color:a}.text-fg{color:b}");
    expect(ruleFor(all, ".text-fg")?.body).toBe("color:b");
  });
});

/**
 * 懸空引用：`var()` 指到一個整份產物裡都沒有人宣告的名字。
 *
 * 這是 2026-08-17 那次代幣改名留下的形狀 —— 宣告改了，散在切片 `class` 裡的
 * 引用沒改，而建置成功、CSS 還變大。判定要準到兩件事：真的缺陷要抓到，
 * Tailwind 自己那些**帶 fallback** 的引用一個都不能抓（實測 9 筆裡 7 筆是後者）。
 */
describe("懸空引用", () => {
  const names = (css: string) => auditReferences(css).dangling.map((d) => d.name);

  it("🔴 沒有人宣告的 var() → 抓到，而且要講得出是誰在用", () => {
    const audit = auditReferences(":root{--a:1}.x{color:var(--nope)}");
    expect(audit.dangling).toEqual([{ name: "--nope", selectors: [".x"] }]);
  });

  it("★ 帶 fallback 的一律放行 —— 這一條不要「收緊」", () => {
    // 實測 apps/console 的產物：9 筆未宣告引用裡有 7 筆帶 fallback，
    // 而且 7 筆全是 Tailwind 自己寫的（--tw-leading、--default-font-* …）。
    // 把它們算成違規＝上線第一天就有 7 個偽陽性，然後這條規則會被關掉（C41）。
    expect(names(".x{line-height:var(--tw-leading,1.5)}")).toEqual([]);
  });

  it("★ 宣告在別條規則裡也算數（刻意不追作用域）", () => {
    // Tailwind 常常是 A 規則設 `--tw-shadow`、B 規則讀它。嚴格追作用域會把
    // 那一整套判成違規，而它們一個缺陷都不是。這裡要抓的是「整份產物裡
    // 沒有任何地方宣告過」。
    expect(names(".a{--shared:1}.b{color:var(--shared)}")).toEqual([]);
  });

  it("★ @property 註冊過的名字算宣告", () => {
    expect(
      names('@property --tw-ease{syntax:"*"}.x{transition-timing-function:var(--tw-ease)}'),
    ).toEqual([]);
  });

  it("★ 同一個名字被多處引用時要合併，選擇器不重複", () => {
    const audit = auditReferences(".a{color:var(--x)}.b{color:var(--x)}.a{border-color:var(--x)}");
    expect(audit.dangling).toEqual([{ name: "--x", selectors: [".a", ".b"] }]);
  });

  it("★ 第三方在執行期設的那幾個放行", () => {
    // reka-ui 的 SelectContent 用 inline style 寫 --reka-select-trigger-width，
    // 所以它永遠不在建置產物裡。見 css.ts 的 RUNTIME_PROVIDED。
    expect(names(".x{min-width:var(--reka-select-trigger-width)}")).toEqual([]);
  });

  it("🔴 沒登記的第三方變數**仍然要紅** —— 這個出口是窄的", () => {
    // 這一條才是上面那條的價值所在。放行清單如果會自己長大
    //（例如「--reka-* 開頭一律放行」），那 reka-ui 那邊改名或我們打錯字
    // 就再也不會紅了 —— 而那正是這道檢查存在的理由。
    expect(names(".x{width:var(--reka-select-trigger-height)}")).toEqual([
      "--reka-select-trigger-height",
    ]);
  });

  it("🔴 登記表的每一筆都要寫得出「誰設的」—— 理由是必填的字串", () => {
    /**
     * ⚠️ 這條守的是 C41 那個形狀：一個布林開關（或一句 disable 註解）
     * 下一個人只會照抄；一個**必填而且要講得出誰在什麼時候設的**字串，
     * 寫不出來的人會發現自己其實是在 silence 一個真的缺陷。
     *
     * 所以理由不能是「第三方」「執行期」這種可以套在任何一筆上的話 ——
     * 它要點名那個函式庫與那個時機。這裡用長度當下限，是因為
     * 「內容對不對」只有人讀得出來，而長度至少擋得掉空字串與一個詞。
     */
    const entries = Object.entries(RUNTIME_PROVIDED);
    expect(entries.length, "登記表空了就等於這個出口沒有人在看").toBeGreaterThan(0);
    for (const [name, reason] of entries) {
      expect(name.startsWith("--"), name).toBe(true);
      expect(reason.length, `${name} 的理由太短，講不出誰在什麼時候設它`).toBeGreaterThan(40);
    }
  });

  it("★ declared 要跟著回傳 —— 「零個懸空」與「一個字都沒讀到」長得一樣", () => {
    // 呼叫端拿它當前置條件。少了這個數字，一份被解析壞掉的 CSS
    // 會回報「沒有懸空引用」，而那是綠燈代表沒有人看。
    expect(auditReferences("").declared).toBe(0);
    expect(auditReferences(":root{--a:1;--b:2}").declared).toBe(2);
  });
});
