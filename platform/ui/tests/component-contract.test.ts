import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createUiTheme } from "../src/theme.ts";
import {
  aliasesUsedInProps,
  componentExports,
  consumedOverrides,
  declaredSlotTypes,
  defaultSlotKeys,
  definePropsBlock,
  exportedTypeNames,
  propUnionMembers,
  resolveUnion,
  stringDefaults,
} from "./contract.ts";

/**
 * 元件契約的驗收 —— 需求 2 與 3 的閘門。
 *
 * ── 這支測試取代了什麼 ──────────────────────────────────────────────
 *
 * 前一版是 `theme.test.ts`，它 `readFileSync("src/components/UiButton.vue")`
 * —— **寫死一個檔名**。於是它守的不是一條規則，是一個檔案：`UiDialog` 從落地
 * 那天就缺「形狀」那條軸（寬度與位置寫死在模板裡，任何案子都換不掉），
 * 而那支測試一個字都沒說，因為它根本沒讀那個檔案。
 *
 * 現在掃目錄。第三個元件加進來時，它會被同一組條文檢查。
 *
 * ── 為什麼是讀原始碼比對，不是型別層的等式 ──────────────────────────
 *
 * 實測過：**`vp check` 對 `.vue` 不做型別檢查**（`const broken: number = "字串"`
 * 在 SFC 裡是零錯誤）。所以 SFC 裡的型別斷言是裝飾品。`tools/vue-typecheck`
 * 補上了那個缺口，但它驗的是「型別對不對」，不是「慣例有沒有被遵守」——
 * 一個沒有接縫的元件型別完全正確。
 */

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const COMPONENTS_DIR = join(PACKAGE_ROOT, "src/components");

const THEME = readFileSync(join(PACKAGE_ROOT, "src/theme.ts"), "utf8");
const INDEX = readFileSync(join(PACKAGE_ROOT, "src/index.ts"), "utf8");

/** 元件清單從**檔案系統**推導，不是寫死（A1）。 */
const COMPONENTS = readdirSync(COMPONENTS_DIR)
  .filter((name) => name.endsWith(".vue"))
  .map((name) => ({
    name: name.replace(/\.vue$/, ""),
    source: readFileSync(join(COMPONENTS_DIR, name), "utf8"),
  }));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe("元件契約", () => {
  /**
   * ⚠️ 這一條看起來多餘，但它是上面那個 `readdirSync` 的保險。
   *
   * 目錄改名、glob 打錯、或有人把元件搬走 —— `COMPONENTS` 會變成空陣列，
   * 而下面每一個 `it.each` 都會**零次執行然後報綠**。這一整組檢查最可能
   * 安靜失效的方式就是這個。
   */
  it("★ 至少掃到兩個元件", () => {
    expect(COMPONENTS.length).toBeGreaterThanOrEqual(2);
  });

  describe.each(COMPONENTS)("$name", ({ name, source }) => {
    it("① 被 index.ts 以同名匯出", () => {
      const exported = componentExports(INDEX);
      expect(exported.map((entry) => entry.file)).toContain(name);
      expect(exported.find((entry) => entry.file === name)?.exportedAs).toBe(name);
    });

    it("② 在 UiThemeOverride 裡有一格具名槽", () => {
      expect(sorted(declaredSlotTypes(THEME).keys())).toContain(name);
    });

    it("③ 宣告的槽 ＝ 預設表的鍵", () => {
      const slotType = declaredSlotTypes(THEME).get(name);
      expect(slotType, `UiThemeOverride 沒有 ${name} 那一格`).toBeDefined();
      expect(sorted(defaultSlotKeys(source))).toEqual(
        sorted(new Set(resolveUnion(THEME, slotType as string))),
      );
    });

    it("③ 元件真的讀了自己的那一格", () => {
      // 宣告了槽、寫好預設表，但從頭到尾沒有 inject —— 型別全對、測試全綠，
      // 而各案的覆寫一個字都不會生效。這是最安靜的一種壞法。
      expect(sorted(consumedOverrides(source))).toContain(name);
    });

    it("④ props 的 union 是字面值，不是型別別名", () => {
      const props = definePropsBlock(source);
      if (props === null) return;
      expect(aliasesUsedInProps(props, exportedTypeNames(THEME))).toEqual([]);
    });

    it("預設值必須是該 prop 的 union 成員之一", () => {
      const props = definePropsBlock(source);
      if (props === null) return;

      for (const [prop, value] of stringDefaults(source)) {
        const members = propUnionMembers(props, prop);
        // 沒有 union 的 prop（`type?: "button" | …` 以外的自由字串）跳過 ——
        // 這一條問的是「預設值在不在清單裡」，不是「每個 prop 都要有清單」。
        if (members.length === 0) continue;
        expect(members, `${name} 的 ${prop} 預設值 "${value}" 不在 union 裡`).toContain(value);
      }
    });
  });
});

/**
 * 反向測試 —— 用人造來源證明每一條**該紅的時候會紅**。
 *
 * 只驗真實檔案的話，這一整組斷言可以被一個 `return true` 滿足而全綠。
 * 這裡每一條都對應上面一條，來源是刻意寫壞的最小片段。
 */
describe("🔴 每一條都要抓得到違規", () => {
  const FAKE_THEME = `
export type UiFakeSlot = "a" | "b";
export type UiFakeOverride = never;
export type UiThemeOverride = {
  readonly UiFake?: Readonly<Partial<Record<UiFakeSlot, string>>>;
};
`;

  it("① 元件沒有被 index.ts 匯出", () => {
    const index = `export { default as UiButton } from "./components/UiButton.vue";`;
    expect(componentExports(index).map((entry) => entry.file)).not.toContain("UiDialog");
  });

  it("① 匯出名與檔名不一致", () => {
    const index = `export { default as Dialog } from "./components/UiDialog.vue";`;
    expect(componentExports(index)[0]?.exportedAs).not.toBe("UiDialog");
  });

  it("② UiThemeOverride 裡沒有那一格", () => {
    expect(declaredSlotTypes(FAKE_THEME).has("UiOther")).toBe(false);
  });

  it("③ 預設表少一個鍵", () => {
    const component = `
const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {
  a: "x",
};
`;
    expect(sorted(defaultSlotKeys(component))).not.toEqual(
      sorted(resolveUnion(FAKE_THEME, "UiFakeSlot")),
    );
  });

  it("③ 預設表多一個鍵", () => {
    const component = `
const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {
  a: "x",
  b: "y",
  c: "z",
};
`;
    expect(sorted(defaultSlotKeys(component))).not.toEqual(
      sorted(resolveUnion(FAKE_THEME, "UiFakeSlot")),
    );
  });

  it("③ 元件沒有 inject —— 覆寫不會生效", () => {
    const component = `
const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = { a: "x", b: "y" };
const parts = DEFAULT_PARTS;
`;
    expect(consumedOverrides(component).has("UiFake")).toBe(false);
  });

  it("③ 元件讀錯別人的那一格", () => {
    // 複製貼上另一個元件之後忘了改名字。型別完全合法（兩個元件都在
    // UiThemeOverride 裡），而這個元件永遠讀不到自己的覆寫。
    expect(consumedOverrides(`const x = theme.UiButton?.primary;`).has("UiDialog")).toBe(false);
  });

  it("④ props 寫成型別別名", () => {
    const props = definePropsBlock(`defineProps<{
  slot?: UiFakeSlot;
}>()`);
    expect(aliasesUsedInProps(props as string, exportedTypeNames(FAKE_THEME))).toEqual([
      "UiFakeSlot",
    ]);
  });

  it("④ 註解裡提到別名不算違規", () => {
    // `UiButton` 的 docblock 就在解釋為什麼不能寫成 UiVariant 別名。
    // 抓到它的話，這條規則會在「解釋自己」的句子上紅，然後被關掉。
    const props = definePropsBlock(`defineProps<{
  /** 不要寫成 UiFakeSlot，理由見 theme.ts。 */
  variant?: "a" | "b";
}>()`);
    expect(aliasesUsedInProps(props as string, exportedTypeNames(FAKE_THEME))).toEqual([]);
  });

  it("預設值打錯字", () => {
    const props = `
  variant?: "primary" | "secondary";
`;
    expect(propUnionMembers(props, "variant")).not.toContain("secondry");
  });

  it("★ 錨點移位要丟例外，不是回傳空集合", () => {
    // 空集合對空集合是相等的 —— 錨點改名之後這一整組斷言會安靜地變成恆真。
    expect(() => declaredSlotTypes("export type Something = {};")).toThrow(/找不到區塊起點/);
    expect(() => resolveUnion(FAKE_THEME, "UiNotThere")).toThrow(/找不到區塊起點/);
  });

  it("★ 別名解析要跟著往下走，不是只認字面值", () => {
    // `UiButtonSlot = UiVariant | UiSize` 若不遞迴，會解析成零個成員，
    // 而零個對零個相等 —— UiButton 那一條就變成恆真。
    expect(resolveUnion(THEME, "UiButtonSlot").length).toBeGreaterThan(2);
  });
});

describe("createUiTheme 的兩道防線", () => {
  it("🔴 空的覆寫 → 丟例外", () => {
    // `.use(createUiTheme({}))` 在 composition root 裡看起來就像設計系統
    // 已經被客製了，實際上什麼都沒做。
    expect(() => createUiTheme({})).toThrow(/沒有收到任何覆寫/);
    expect(() => createUiTheme({ UiButton: {} })).toThrow(/沒有收到任何覆寫/);
  });

  it("🔴 空字串 → 丟例外，而且訊息指得出是哪個元件的哪一格", () => {
    // 產生的是一個沒有底、沒有外框、沒有 hover 的透明方塊 ——
    // 看不見但點得到，而畫面不會壞到有人回報。
    expect(() => createUiTheme({ UiButton: { secondary: "  " } })).toThrow(/UiButton\.secondary/);
    expect(() => createUiTheme({ UiDialog: { overlay: "" } })).toThrow(/UiDialog\.overlay/);
  });

  it("合法的覆寫回傳一個 Vue plugin", () => {
    const plugin = createUiTheme({ UiDialog: { content: "inset-x-0 bottom-0" } });
    expect(typeof plugin.install).toBe("function");
  });

  it("★ 覆寫物件與每個元件的槽表都要被凍結", () => {
    // ⚠️ 巢狀之後淺凍結已經不夠：它擋得住「換掉整個 UiButton 那一格」，
    // 擋不住 `theme.UiButton.secondary = "…"`，而後者比較可能發生。
    let captured: unknown;
    createUiTheme({ UiButton: { ghost: "bg-surface" } }).install?.({
      provide: (_key: unknown, value: unknown) => {
        captured = value;
      },
    } as never);

    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen((captured as { UiButton: unknown }).UiButton)).toBe(true);
  });
});
