import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createUiTheme } from "../src/theme.ts";

/**
 * 各案客製擴充點的驗收（HANDOFF #24 的「component 形狀」那條軸）。
 *
 * ── 為什麼這裡在比對原始碼文字 ──────────────────────────────────────
 *
 * `UiButton` 的 variant union 寫在**三個**地方：`defineProps` 的字面值、
 * `theme.ts` 的 `UiVariant`、以及 `VARIANTS` 那張表的鍵。
 *
 * 三份而不是一份是刻意的 —— `defineProps` 必須是字面值，否則 `api-surface`
 * 的基準檔會退化成一個別名，看不見 union 少了成員（見 UiButton.vue 的說明）。
 *
 * 而把它們釘在一起的**不能**是型別層的等式：實測過，`vp check` 對 `.vue`
 * 根本不做型別檢查（`const broken: number = "字串"` 在 SFC 裡零錯誤）。
 * 所以這裡讀原始碼比對 —— 與 `styles.test.ts` 讀 CSS 宣告同一個做法。
 */

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const BUTTON = readFileSync(join(PACKAGE_ROOT, "src/components/UiButton.vue"), "utf8");
const THEME = readFileSync(join(PACKAGE_ROOT, "src/theme.ts"), "utf8");

/**
 * 找一段宣告，找不到就直接丟。
 *
 * 用 `throw` 而不是 `expect(...).not.toBeNull()` 後面接 `?.`：後者讓型別
 * 仍然是可空的，於是要補一個 `as` —— 而那個 `as` 掩蓋的正是「樣式沒對上」，
 * 也就是這幾條測試最可能安靜失效的方式。
 */
function capture(source: string, pattern: RegExp): string {
  const found = pattern.exec(source)?.[1];
  if (found === undefined) throw new Error(`找不到宣告：${pattern.source}`);
  return found;
}

/** 抽出一個字串 union 的成員，例如 `type UiVariant = "a" | "b";` → ["a","b"]。 */
function unionMembers(source: string, pattern: RegExp): readonly string[] {
  return [...capture(source, pattern).matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

/**
 * 抽出一張 `const NAME: … = { a: …, b: … }` 的頂層鍵。
 *
 * 樣式由呼叫端用**字面正則**傳進來。第一版是 `new RegExp(\`const ${name}…\`)`，
 * 而本 repo 的 SAST 對用字串拼出來的正則有話說 —— 理由很實際：
 * 光看那一行看不出它會匹配什麼。
 */
function tableKeys(source: string, pattern: RegExp): readonly string[] {
  return [...capture(source, pattern).matchAll(/^\s*([a-z]\w*):/gm)].map((m) => m[1] as string);
}

describe("三份 union 必須一致", () => {
  it("★ variant：defineProps／UiVariant／VARIANTS 的鍵", () => {
    const fromProps = unionMembers(BUTTON, /variant\?: ([^;]+);/);
    const fromType = unionMembers(THEME, /export type UiVariant = ([^;]+);/);
    const fromTable = tableKeys(BUTTON, /const VARIANTS[^=]*=\s*\{([^}]*)\}/);

    expect(fromProps.length).toBeGreaterThan(0);
    expect(fromType).toEqual(fromProps);
    // 順序也比對：三份都是人手維護的，排序不同代表有人只改了其中一份。
    expect(fromTable).toEqual(fromProps);
  });

  it("★ size：defineProps／UiSize／SIZES 的鍵", () => {
    const fromProps = unionMembers(BUTTON, /size\?: ([^;]+);/);
    expect(unionMembers(THEME, /export type UiSize = ([^;]+);/)).toEqual(fromProps);
    expect(tableKeys(BUTTON, /const SIZES[^=]*=\s*\{([^}]*)\}/)).toEqual(fromProps);
  });

  it("★ 預設值必須是 union 的成員之一", () => {
    // `withDefaults` 給的預設 variant 打錯字的話，`VARIANTS[props.variant]`
    // 會是 undefined，按鈕只剩基礎類別 —— 看得見但不像壞掉。
    // `}>(),` 之後才是 withDefaults 的第二個參數。用它切，比想辦法讓正則
    // 認得巢狀大括號可靠 —— 而且切不到會直接紅，不會安靜地比對到空字串。
    const [, defaults] = BUTTON.split("}>(),");
    expect(defaults, "找不到 withDefaults 的預設值區塊").toBeDefined();

    const variantDefault = /variant:\s*"([^"]+)"/.exec(defaults as string)?.[1];
    expect(variantDefault, "withDefaults 沒有給 variant 預設值").toBeDefined();
    expect(unionMembers(BUTTON, /variant\?: ([^;]+);/)).toContain(variantDefault);
  });
});

describe("createUiTheme 的兩道防線", () => {
  it("🔴 空的覆寫 → 丟例外", () => {
    // `.use(createUiTheme({}))` 在 composition root 裡看起來就像設計系統
    // 已經被客製了，實際上什麼都沒做。
    expect(() => createUiTheme({})).toThrow(/沒有收到任何覆寫/);
    expect(() => createUiTheme({ variants: {} })).toThrow(/沒有收到任何覆寫/);
  });

  it("🔴 空字串 → 丟例外", () => {
    // 產生的是一個沒有底、沒有外框、沒有 hover 的透明方塊 ——
    // 看不見但點得到，而畫面不會壞到有人回報。
    expect(() => createUiTheme({ variants: { secondary: "  " } })).toThrow(/空字串/);
    expect(() => createUiTheme({ sizes: { sm: "" } })).toThrow(/空字串/);
  });

  it("合法的覆寫回傳一個 Vue plugin", () => {
    const plugin = createUiTheme({ variants: { ghost: "bg-surface" } });
    expect(typeof plugin.install).toBe("function");
  });

  it("★ 覆寫物件會被凍結", () => {
    // provide 出去的東西被下游改掉的話，症狀是「某個畫面的按鈕長得不一樣」，
    // 而那查起來要很久。
    let captured: unknown;
    createUiTheme({ variants: { ghost: "bg-surface" } }).install?.({
      provide: (_key: unknown, value: unknown) => {
        captured = value;
      },
    } as never);
    expect(Object.isFrozen(captured)).toBe(true);
  });
});
