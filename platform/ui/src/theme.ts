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
 * ── 為什麼不照 shadcn 的做法 ────────────────────────────────────────
 *
 * ⚠️ **不是因為它要人改原始碼 —— 那個說法是錯的，這裡更正。** 現行
 * shadcn-vue 的 cva 表裡沒有任何 utility，只有語意 class 名
 * （`cn-button-variant-default`），真正的樣式住在 `style-*.css`。各案換樣式
 * ＝ 換一份 preset CSS，**元件原始碼完全不動**。官方的客製順序是
 * 「內建 variant → `class` → 改原始碼加 variant → wrapper」，改原始碼排第三。
 *
 * 不照它的真正理由只有一句：**CSS preset 沒有任何閘門在守。**
 * `.cn-button-variant-defualt` 打錯一個字，產生一個永遠不匹配的 class，
 * 畫面安靜地少一塊樣式 —— 那正是這個 repo 被騙過六次的形狀。
 *
 * 兩邊的失敗輪廓是相反的：CSS preset 打錯字**安靜失效**、但不用逐元件接線；
 * 具名槽打錯字**編譯失敗**、但每個元件都要接線（而那條線由檢查器守著）。
 * 它的架構對它的散佈模型是對的（下游是任意專案，沒有共用閘門），
 * 我們的對「把架構決策寫成閘門」這個命題是對的。不是同一題的兩個答案。
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
 * `UiAlertDialog` 的可覆寫部位。前四格與 `UiDialogSlot` 同名同義。
 *
 * ⚠️ **刻意重複而不共用**（同 C78 §3 對 `UiTextarea` 的處置）：共用一個型別
 * 別名的話，日後幫對話框加一格會逼確認框跟著長一格，而兩者的結構沒有理由
 * 永遠一致。**代價寫在這裡**：覆寫了 `UiDialog.content`（例如手機版改成
 * 底部滑出）的案子**不會**套到確認框，兩個框會長得不一樣 —— 要一致就兩格都寫。
 *
 * ⚠️ **多出來的 `actions` 是因為那裡沒有槽。** `UiDialog` 的按鈕列沒有這一格，
 * 因為它有 `footer` 槽可以整組換掉；`UiAlertDialog` **刻意不給那個槽**
 * （見元件檔頭：換掉就把焦點保護一起換掉了），所以那一列若再沒有具名槽，
 * 各案連「改成左右分置」都做不到。**拿掉一個逃生口就要補另一個。**
 */
export type UiAlertDialogSlot = "overlay" | "content" | "title" | "description" | "actions";

/** `UiInput` 的可覆寫部位。名稱取自上游的 `data-slot="input"`。 */
export type UiInputSlot = "input";

/**
 * `UiSkeleton` 的可覆寫部位。只有一格 —— 這個元件就是一個方塊。
 *
 * ⚠️ 一格也要有：沒有這一格的話，各案想把骨架從灰色改成品牌淡色就得
 * 改 `platform/`，而那正是具名槽存在的理由。
 */
export type UiSkeletonSlot = "skeleton";

/**
 * `UiBadge` 的可覆寫部位 —— `badge` 是版型，另外三個是 `tone` 的值。
 *
 * ⚠️ `badge` 那一格是 review 補的：第一版把圓角與內距寫死在模板的 `class`
 * 上，於是各案換得掉顏色、**換不掉形狀**。
 *
 * ⚠️ 刻意**不叫** `UiVariant`：那是按鈕的軸（含 `ghost`），標籤沒有它。
 * 共用的話，日後幫按鈕加一個 variant 會逼標籤跟著長一格。
 */
export type UiBadgeSlot = "badge" | "neutral" | "accent" | "danger";

/** `UiCheckbox` 的可覆寫部位。名稱取自 reka-ui 的基元與 `Label`。 */
export type UiCheckboxSlot = "root" | "indicator" | "label";

/**
 * `UiTabs` 的可覆寫部位。
 *
 * ⚠️ **不含 panel** —— 那是 `UiTabsPanel` 自己的一格。兩個檔案各有一格，
 * 因為覆寫的語意是整條替換：合成一格的話，各案想只改 panel 的內距
 * 就得把 trigger 那一整條也抄過來。
 */
export type UiTabsSlot = "list" | "trigger";

/** `UiTabsPanel` 的可覆寫部位。見 `UiTabsSlot` 為什麼分開。 */
export type UiTabsPanelSlot = "panel";

/** `UiLabel` 的可覆寫部位。 */
export type UiLabelSlot = "label";

/**
 * ⚠️ **沒有 `label` 那一格。** 標籤走 `UiLabel` 的槽 —— `UiField` 是第一個
 * import 別的元件的元件，理由見它的檔頭。再開一格會讓同一個東西有兩個
 * 覆寫入口，而設計師講「標籤要更小」時前端得猜是哪一個。
 */
export type UiFieldSlot = "field" | "description" | "error";

/** `UiTextarea` 的可覆寫部位。⚠️ 與 `UiInputSlot` 刻意分開，見元件檔頭。 */
export type UiTextareaSlot = "textarea";

/** `UiSwitch` 的可覆寫部位。名稱取自 reka-ui 的基元。 */
export type UiSwitchSlot = "root" | "thumb";

/** `UiRadioGroup` 的可覆寫部位 —— 只有容器，每一項是 `UiRadioItem` 的事。 */
export type UiRadioGroupSlot = "group";

/** `UiRadioItem` 的可覆寫部位。 */
export type UiRadioItemSlot = "item" | "indicator" | "label";

/** `UiSelect` 的可覆寫部位。名稱取自 reka-ui 的基元。 */
export type UiSelectSlot = "trigger" | "content" | "item" | "indicator" | "chevron";

/**
 * `UiDatePicker` 的可覆寫部位。名稱取自 reka-ui 的基元。
 *
 * ⚠️ 八格是這個 repo 目前最多的 —— 日期選擇器本來就是一個小應用
 *（輸入分段 ＋ 觸發器 ＋ 面板 ＋ 導航 ＋ 表頭 ＋ 日格）。合併成幾格會讓
 * 各案想改一個星期標題就得把整片日曆的 class 抄過來（覆寫是整條替換）。
 */
export type UiDatePickerSlot =
  | "field"
  | "segment"
  | "trigger"
  | "content"
  | "nav"
  | "heading"
  | "headCell"
  | "day";

/**
 * `UiTable` 家族的可覆寫部位 —— **六個檔案各一個型別**。
 *
 * ⚠️ 不合成一個 `UiTableSlot` 的理由與 `UiTabs`／`UiTabsPanel` 相同：
 * 覆寫的語意是整條替換，合成一格的話各案想只改儲存格內距，
 * 就得把表頭與列的 class 一起抄過來。
 */
export type UiTableSlot = "scroller" | "table";
/** `UiTableHead` 的可覆寫部位（`<thead>`）。 */
export type UiTableHeadSlot = "head";
/** `UiTableBody` 的可覆寫部位（`<tbody>`）。 */
export type UiTableBodySlot = "body";
/** `UiTableRow` 的可覆寫部位（`<tr>`）。 */
export type UiTableRowSlot = "row";
/** `UiTableHeadCell` 的可覆寫部位（`<th>`）。 */
export type UiTableHeadCellSlot = "cell";
/** `UiTableCell` 的可覆寫部位（`<td>`）。`numeric` 是疊加在 `cell` 上的那一格。 */
export type UiTableCellSlot = "cell" | "numeric";

/** `UiPagination` 的可覆寫部位。名稱取自 reka-ui 的基元。 */
export type UiPaginationSlot = "list" | "item" | "nav" | "ellipsis";

/** `UiSeparator` 的可覆寫部位。 */
export type UiSeparatorSlot = "separator";

/** `UiAlert` 的可覆寫部位 —— `alert` 是版型，另外三個是 `tone` 的值（同 `UiBadge`）。 */
export type UiAlertSlot = "alert" | "info" | "success" | "danger";

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
  readonly UiAlertDialog?: Readonly<Partial<Record<UiAlertDialogSlot, string>>>;
  readonly UiInput?: Readonly<Partial<Record<UiInputSlot, string>>>;
  readonly UiSkeleton?: Readonly<Partial<Record<UiSkeletonSlot, string>>>;
  readonly UiBadge?: Readonly<Partial<Record<UiBadgeSlot, string>>>;
  readonly UiCheckbox?: Readonly<Partial<Record<UiCheckboxSlot, string>>>;
  readonly UiTabs?: Readonly<Partial<Record<UiTabsSlot, string>>>;
  readonly UiTabsPanel?: Readonly<Partial<Record<UiTabsPanelSlot, string>>>;
  readonly UiLabel?: Readonly<Partial<Record<UiLabelSlot, string>>>;
  readonly UiField?: Readonly<Partial<Record<UiFieldSlot, string>>>;
  readonly UiTextarea?: Readonly<Partial<Record<UiTextareaSlot, string>>>;
  readonly UiSwitch?: Readonly<Partial<Record<UiSwitchSlot, string>>>;
  readonly UiRadioGroup?: Readonly<Partial<Record<UiRadioGroupSlot, string>>>;
  readonly UiRadioItem?: Readonly<Partial<Record<UiRadioItemSlot, string>>>;
  readonly UiSelect?: Readonly<Partial<Record<UiSelectSlot, string>>>;
  readonly UiDatePicker?: Readonly<Partial<Record<UiDatePickerSlot, string>>>;
  readonly UiTable?: Readonly<Partial<Record<UiTableSlot, string>>>;
  readonly UiTableHead?: Readonly<Partial<Record<UiTableHeadSlot, string>>>;
  readonly UiTableBody?: Readonly<Partial<Record<UiTableBodySlot, string>>>;
  readonly UiTableRow?: Readonly<Partial<Record<UiTableRowSlot, string>>>;
  readonly UiTableHeadCell?: Readonly<Partial<Record<UiTableHeadCellSlot, string>>>;
  readonly UiTableCell?: Readonly<Partial<Record<UiTableCellSlot, string>>>;
  readonly UiPagination?: Readonly<Partial<Record<UiPaginationSlot, string>>>;
  readonly UiSeparator?: Readonly<Partial<Record<UiSeparatorSlot, string>>>;
  readonly UiAlert?: Readonly<Partial<Record<UiAlertSlot, string>>>;
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
