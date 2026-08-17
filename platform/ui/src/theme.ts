import type { App, InjectionKey, Plugin } from "vue";

/**
 * 元件外觀的**擴充點** —— 三軸裡的「形狀」那一條。
 *
 * ── 為什麼代幣不夠 ──────────────────────────────────────────────────
 *
 * 代幣換得掉「值」：顏色、圓角、字重。換不掉的是**組合** ——
 * 「這個案子的 secondary 按鈕不要外框，改成淺底色」不是任何一個代幣，
 * 它是 `VARIANTS.secondary` 那一整條字串。
 *
 * ── 為什麼不照 shadcn 的答案做 ──────────────────────────────────────
 *
 * shadcn 對「各案怎麼換元件樣式」的官方答案是「你擁有原始碼，直接改它」。
 * 那個答案在這個 repo 是被 D15 明文否決的，而接案公司的情況比 D15 描述的更糟：
 * 不是每個切片一份，是**每個案子一份**。20 個案子改了 20 份 `UiButton.vue`，
 * 上游修一個焦點環的 bug 要手動同步 20 次，而且沒有任何機制會提醒誰漏了。
 *
 * 所以這裡的接縫存在的理由就是這一句：**樣式各案不同，原始碼只有一份。**
 *
 * ── 為什麼是「元件 → 具名槽」而不是平鋪的 variants／sizes ────────────
 *
 * 這個介面在 2026-08-17 之前是 `{ variants, sizes }`。那是**按鈕的概念**
 * 長在一個全域 API 上 —— 第二個元件（`UiDialog`）需要覆寫它的遮罩與內容框時
 * 沒有地方可去，於是它就**沒有接縫**，而沒有任何東西為此說話。
 *
 * 改形狀是破壞性變更（附 codemod `flatten-ui-theme-to-components`）。之所以
 * 在 v1.0.0 tag 之前做，是因為當時的成本是**一個呼叫端**，tag 之後是每一個
 * fork、永遠。同一個判準見 `styles/index.css` 對 `--color-muted` 改名的說明。
 *
 * ── 槽名不是我們取的 ────────────────────────────────────────────────
 *
 * `UiDialog` 的四個槽名來自 reka-ui 的基元（`DialogOverlay`／`DialogContent`／
 * `DialogTitle`／`DialogDescription`），那也是 shadcn-vue 的 part 名、
 * 以及市面上 shadcn Figma kit 的圖層名。設計師說「overlay 要更淡」的時候，
 * 前端要改的那一格就叫 `overlay` —— 這條對應不需要翻譯表，這是需求 2 與 3
 * 真正的產出。**採用它的代價是零**，因為那些名字本來就已經在元件的 import 裡。
 *
 * ⚠️ 但 variant 的名字**刻意不跟** shadcn（它叫 `default`／`destructive`）。
 * `primary`／`danger` 是設計稿上的通用語彙，而改 variant 名會動到 prop union ——
 * 那是 api-surface 的破壞性變更加上每個使用端。槽是新的、沒有使用端，所以免費；
 * variant 不是。
 *
 * ── 只能替換，不能新增，這是刻意的 ──────────────────────────────────
 *
 * 槽的清單是**封閉的 union**。開放任意字串等於讓打錯字靜靜地什麼都不做 ——
 * `{ UiDialog: { ovelay: "…" } }` 會安靜地被忽略，而畫面看起來只是「沒生效」。
 * 真的需要第五個槽的話，那是 `platform/ui` 的變更，走 PR，所有案子一起得到它。
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

/**
 * `UiButton` 的可覆寫槽 —— 四個 variant ＋ 兩個 size 在同一個平面。
 *
 * 不分成 `{ variant: {…}, size: {…} }` 兩層是因為兩組名稱不會相撞，
 * 而多一層巢狀只是讓覆寫的人多打一次字。相撞的那天由檢查器說話：
 * 兩個 union 有共同成員的話，`Record` 的鍵會少一格，測試會紅。
 */
export type UiButtonSlot = UiVariant | UiSize;

/** `UiDialog` 的可覆寫部位。名稱取自 reka-ui 的基元，見檔頭。 */
export type UiDialogSlot = "overlay" | "content" | "title" | "description";

/**
 * 各案的覆寫表：**元件名 → 槽名 → 整條 class 字串**。
 *
 * ⚠️ 語意是**整條替換**，不是附加。想要「在預設值上加一點東西」請把預設值
 * 抄過來再加 —— 附加語意在 tailwind-merge 底下只對「認得出來的衝突」有效，
 * 而把 `-translate-x-1/2` 變成靠左對齊剛好是它認不出來的那一種，
 * 症狀會是「大部分案子有效，某一個案子的對話框位置偏掉」。
 */
export type UiThemeOverride = {
  readonly UiButton?: Readonly<Partial<Record<UiButtonSlot, string>>>;
  readonly UiDialog?: Readonly<Partial<Record<UiDialogSlot, string>>>;
};

/**
 * 攤平用的中性視角：元件名 → 槽名 → class 字串。
 *
 * ⚠️ 上面刻意寫成 `type` 而不是 `interface`，理由很技術但很實際：
 * **interface 沒有隱式索引簽章**，所以 `Object.entries()` 推不出值的型別
 * （實測是 `{}`，然後 `classes.trim()` 編不過）。可以用 `as` 硬轉，
 * 但那個 `as` 掩蓋的正是「元件名打錯」—— 也就是下面兩條防線要抓的東西。
 *
 * 用 `type` 換到的是**不需要任何斷言就能走訪所有元件**，於是新增第三個元件時
 * 這裡一個字都不用改。寫死一份元件名清單會是第二份事實來源（A1）。
 */
type SlotTables = Readonly<
  Record<string, Readonly<Record<string, string | undefined>> | undefined>
>;

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
  // 攤平成 `UiButton.secondary` 這種名字：下面兩條防線的訊息要指得出是哪一格，
  // 而巢狀之後光說 "secondary" 已經不夠 —— 兩個元件可以有同名的槽。
  const tables: SlotTables = override;
  const entries: (readonly [string, string])[] = [];
  for (const [component, slots] of Object.entries(tables)) {
    for (const [slot, classes] of Object.entries(slots ?? {})) {
      entries.push([`${component}.${slot}`, classes ?? ""]);
    }
  }

  // 一、空的覆寫。`createUiTheme({})` 會安靜地什麼都不做，而 composition root
  // 裡多一行 `.use(createUiTheme(...))` 看起來就像設計系統已經被客製了。
  if (entries.length === 0) {
    throw new Error(
      "createUiTheme() 沒有收到任何覆寫。空的覆寫等於沒有呼叫它，" +
        "但在 composition root 裡看起來像有 —— 不需要的話就整行拿掉。",
    );
  }

  // 二、空字串。`{ UiButton: { secondary: "" } }` 會讓那顆按鈕只剩基礎類別，
  // 變成一個沒有底、沒有外框、沒有 hover 的透明方塊 —— 而畫面不會壞到有人回報。
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
      app.provide(UI_THEME, freezeDeep(override));
    },
  };
}

/**
 * 凍結覆寫表與**每一個元件的槽表**。
 *
 * ⚠️ 巢狀之後 `Object.freeze()` 一層已經不夠：它只擋得住「換掉整個 UiButton
 * 那一格」，擋不住 `theme.UiButton.secondary = "…"`。而那正是比較可能發生的
 * 那一種 —— 症狀是「某個畫面的按鈕長得不一樣」，查起來要很久。
 */
function freezeDeep(override: UiThemeOverride): UiThemeOverride {
  for (const slots of Object.values(override)) {
    if (slots !== undefined) Object.freeze(slots);
  }
  return Object.freeze(override);
}
