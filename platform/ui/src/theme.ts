import type { App, InjectionKey, Plugin } from "vue";

/**
 * 元件外觀的**擴充點**（HANDOFF #24 的「component 形狀」那條軸）。
 *
 * ── 為什麼代幣不夠 ──────────────────────────────────────────────────
 *
 * 代幣換得掉「值」：顏色、圓角、字重。換不掉的是**組合** ——
 * 「這個案子的 secondary 按鈕不要外框，改成淺底色」不是任何一個代幣，
 * 它是 `VARIANTS.secondary` 那一整條字串。
 *
 * 在這之前那張表是 `Readonly<Record<Variant, string>>` 的字面值，
 * 各案唯一的辦法是去改 `platform/ui` —— 也就是要集中的那一半。
 *
 * ── 只能替換，不能新增，這是刻意的 ──────────────────────────────────
 *
 * `variant` 是 `UiButton` 的 prop 型別，而 prop 型別是 api-surface 守的
 * 公開契約。開放任意字串（`Variant | (string & {})`）等於讓打錯字
 * 靜靜地退回預設樣式 —— 那是本 repo 一路在拆的那種失敗。
 *
 * 真的需要第五個 variant 的話，那是 `platform/ui` 的變更，走 PR，
 * 所有案子一起得到它。這正是 C62 決定的「基礎集中」那一半。
 *
 * ⚠️ ── 覆寫字串必須寫在 `.ts` 或 `.vue` 裡 ──────────────────────────
 *
 * `platform/ui/src/styles/index.css` 的 `@source` 是
 * `"../../../../**\/*.{vue,ts}"`。把覆寫搬進 JSON、YAML、`.mjs` 或環境變數，
 * Tailwind **掃不到那些類別名，也不會報錯** —— 產出的 CSS 少掉它們，
 * 而建置全綠。這與 `@source` 本身那個坑是同一個（見該檔檔頭）。
 *
 * 所以這個介面收的是**字串字面值**，不是「可以從任何地方載入的設定」。
 */

export type UiVariant = "primary" | "secondary" | "danger" | "ghost";
export type UiSize = "sm" | "md";

export interface UiThemeOverride {
  /** 整條替換某個 variant 的 class 字串。沒列到的 variant 用 `platform/ui` 的預設。 */
  readonly variants?: Readonly<Partial<Record<UiVariant, string>>>;
  /** 整條替換某個 size 的 class 字串。 */
  readonly sizes?: Readonly<Partial<Record<UiSize, string>>>;
}

/**
 * 元件端讀這個。**不從 `index.ts` 匯出** —— 使用端的入口只有
 * `createUiTheme()`，因為那裡才有辦法驗下面那兩條。
 */
export const UI_THEME: InjectionKey<UiThemeOverride> = Symbol("@org/ui theme");

/** 沒有人 provide 時的值。獨立常數而非 inject 的行內字面值，才不會每次渲染新建一個物件。 */
export const NO_OVERRIDE: UiThemeOverride = Object.freeze({});

/**
 * 裝進 composition root：`createApp(App).use(createUiTheme({ … }))`。
 *
 * 做成 Vue plugin 而不是匯出 `UI_THEME` 讓人自己 `app.provide()`，
 * 是為了有一個地方擋掉下面兩種「看起來有接上、實際上沒有」：
 */
export function createUiTheme(override: UiThemeOverride): Plugin {
  const entries = [
    ...Object.entries(override.variants ?? {}),
    ...Object.entries(override.sizes ?? {}),
  ];

  // 一、空的覆寫。`createUiTheme({})` 會安靜地什麼都不做，而 composition root
  // 裡多一行 `.use(createUiTheme(...))` 看起來就像設計系統已經被客製了。
  if (entries.length === 0) {
    throw new Error(
      "createUiTheme() 沒有收到任何覆寫。空的覆寫等於沒有呼叫它，" +
        "但在 composition root 裡看起來像有 —— 不需要的話就整行拿掉。",
    );
  }

  // 二、空字串。`{ secondary: "" }` 會讓那顆按鈕只剩基礎類別，變成一個沒有底、
  // 沒有外框、沒有 hover 的透明方塊 —— 而畫面不會壞到有人回報。
  for (const [name, classes] of entries) {
    if (classes.trim() === "") {
      throw new Error(
        `createUiTheme() 的 "${name}" 是空字串。想要「沒有樣式」請明寫需要的類別；` +
          "空字串產生的是一個看不見但點得到的元件。",
      );
    }
  }

  return {
    install(app: App) {
      app.provide(UI_THEME, Object.freeze(override));
    },
  };
}
