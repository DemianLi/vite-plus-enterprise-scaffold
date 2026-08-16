import { describe, expect, it } from "vitest";
import { customProperties, resolve, ruleFor, rules } from "../src/css.ts";

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
