import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSSRApp, h, type Component, type VNode } from "vue";
import { renderToString } from "vue/server-renderer";

import { defaultTableBodies } from "./contract.ts";
import VueAlert from "../src/components/UiAlert.vue";
import VueBadge from "../src/components/UiBadge.vue";
import VueField from "../src/components/UiField.vue";
import VueInput from "../src/components/UiInput.vue";
import VueLabel from "../src/components/UiLabel.vue";
import VuePagination from "../src/components/UiPagination.vue";
import VueSeparator from "../src/components/UiSeparator.vue";
import VueSkeleton from "../src/components/UiSkeleton.vue";
import VueTable from "../src/components/UiTable.vue";
import VueTableBody from "../src/components/UiTableBody.vue";
import VueTableCell from "../src/components/UiTableCell.vue";
import VueTableHead from "../src/components/UiTableHead.vue";
import VueTableHeadCell from "../src/components/UiTableHeadCell.vue";
import VueTableRow from "../src/components/UiTableRow.vue";
import VueTextarea from "../src/components/UiTextarea.vue";
import { UiAlert } from "../src/components/UiAlert.tsx";
import { UiBadge } from "../src/components/UiBadge.tsx";
import { UiField } from "../src/components/UiField.tsx";
import { UiInput } from "../src/components/UiInput.tsx";
import { UiLabel } from "../src/components/UiLabel.tsx";
import { UiPagination } from "../src/components/UiPagination.tsx";
import { UiSeparator } from "../src/components/UiSeparator.tsx";
import { UiSkeleton } from "../src/components/UiSkeleton.tsx";
import { UiTable } from "../src/components/UiTable.tsx";
import { UiTableBody } from "../src/components/UiTableBody.tsx";
import { UiTableCell } from "../src/components/UiTableCell.tsx";
import { UiTableHead } from "../src/components/UiTableHead.tsx";
import { UiTableHeadCell } from "../src/components/UiTableHeadCell.tsx";
import { UiTableRow } from "../src/components/UiTableRow.tsx";
import { UiTextarea } from "../src/components/UiTextarea.tsx";

/**
 * 遷移期間 React 版與 Vue 版要**一模一樣**（C236）—— 兩條比對。
 *
 * 一、預設表的原文：每一支 `.tsx` 對它的 `.vue`，逐字相同，只准差下面那張翻譯表。
 * 二、SSR 產出：原生元素做的那幾支（沒有經過 reka-ui／Base UI 基元的），兩版渲染出來的
 *     標籤、屬性、文字逐一相同。**分頁是這一條的主角** —— React 版的頁碼是自己算的
 *     （`src/utils/page-range.ts`），Vue 版是 reka-ui 在算，這裡把後者當對照組逐組比。
 *
 * 經過基元的那幾支（Checkbox／Radio／Switch／Tabs）兩個基元庫的 DOM 本來就不同
 * （reka 是 `<button>`，Base UI 是 `<span>` ＋ 隱藏 input），第二條對它們沒有意義；
 * 它們的行為在 `choice-react.test.ts` 裡逐條量。
 */

const COMPONENTS_DIR = join(import.meta.dirname, "../src/components");
const read = (file: string): string => readFileSync(join(COMPONENTS_DIR, file), "utf8");
const REACT_FILES = readdirSync(COMPONENTS_DIR).filter((name) => name.endsWith(".tsx"));

/**
 * 預設表裡**唯一**允許兩版不同的地方：reka-ui 與 Base UI 表達同一個狀態用的屬性不一樣。
 *
 * 逐元件列、逐 token 按前綴換。沒列的元件兩版必須逐字相同。
 * `disabled:` 那兩列是因為 Base UI 的這三個控制項是 `<span>`，沒有 `:disabled` 可選。
 */
const VARIANT_TRANSLATIONS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  UiCheckbox: [
    ["data-[state=checked]:", "data-checked:"],
    ["disabled:", "data-disabled:"],
    ["peer-disabled:", "peer-data-disabled:"],
  ],
  UiRadioItem: [
    ["data-[state=checked]:", "data-checked:"],
    ["disabled:", "data-disabled:"],
    ["peer-disabled:", "peer-data-disabled:"],
  ],
  UiSwitch: [
    ["data-[state=checked]:", "data-checked:"],
    ["data-[state=unchecked]:", "data-unchecked:"],
    ["disabled:", "data-disabled:"],
  ],
  UiTabs: [["data-[state=active]:", "data-active:"]],
  // 面板與觸發器等寬的那個變數，兩個基元庫在執行期各寫各的名字（C237，見 `UiSelect.tsx`）。
  UiSelect: [["min-w-(--reka-select-trigger-width)", "min-w-(--anchor-width)"]],
  UiDropdownMenu: [["data-[state=open]:", "data-popup-open:"]],
};

function translate(body: string, pairs: readonly (readonly [string, string])[]): string {
  return body.replace(/[^\s"]+/g, (token) => {
    for (const [from, to] of pairs) {
      if (token.startsWith(from)) return to + token.slice(from.length);
    }
    return token;
  });
}

describe("一、預設表兩版逐字相同", () => {
  it("★ 每一支 .tsx 都有它的 .vue —— 遷移期間沒有只有一版的元件", () => {
    expect(REACT_FILES.length).toBeGreaterThanOrEqual(2);
    const vueFiles = new Set(readdirSync(COMPONENTS_DIR).filter((name) => name.endsWith(".vue")));
    for (const file of REACT_FILES) {
      expect(vueFiles, `${file} 沒有對應的 .vue`).toContain(file.replace(/\.tsx$/, ".vue"));
    }
  });

  describe.each(REACT_FILES)("%s", (file) => {
    const name = file.replace(/\.tsx$/, "");

    it("預設表與 .vue 逐字相同（只差翻譯表那幾個 variant）", () => {
      const react = defaultTableBodies(read(file));
      const vue = defaultTableBodies(read(`${name}.vue`));
      expect(react.size, `${file} 解析不出任何預設表 —— 空對空會恆真`).toBeGreaterThan(0);

      const pairs = VARIANT_TRANSLATIONS[name] ?? [];
      const expected = [...vue].map(([table, body]) => [table, translate(body, pairs)]);
      expect(Object.fromEntries(react)).toEqual(Object.fromEntries(expected));
    });
  });

  it("★ 翻譯表的每一列都真的用得到 —— 用不到的列是一個沒有人在比的例外", () => {
    for (const [name, pairs] of Object.entries(VARIANT_TRANSLATIONS)) {
      const tokens = [...defaultTableBodies(read(`${name}.vue`)).values()]
        .join(" ")
        .split(/[\s"]+/);
      for (const [from] of pairs) {
        expect(
          tokens.some((token) => token.startsWith(from)),
          `${name} 的 Vue 預設表裡沒有 ${from}`,
        ).toBe(true);
      }
    }
  });

  it("🔴 只翻了其中一份的代幣抓得到", () => {
    const vue = `const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {\n  a: "border-line",\n};`;
    const react = `const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {\n  a: "border-input",\n};`;
    expect(Object.fromEntries(defaultTableBodies(react))).not.toEqual(
      Object.fromEntries(defaultTableBodies(vue)),
    );
  });

  it("★ 換行與尾逗號不算差別 —— 否則格式化器一跑就全紅", () => {
    const wrapped = `const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {\n  a: cn(\n    "x",\n    "y",\n  ),\n};`;
    const oneLine = `const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = { a: cn("x", "y") };`;
    expect(defaultTableBodies(wrapped)).toEqual(defaultTableBodies(oneLine));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 二、SSR 產出兩版逐一相同
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 把一段 HTML 攤成「開標籤（屬性排序）／關標籤／文字」的序列。
 *
 * - Vue 的 fragment 標記（`<!--[-->`）與 SSR 的空註解拿掉：那是框架插的，不是元件寫的。
 * - 屬性排序：兩個框架輸出屬性的順序不同，而順序沒有語意。
 * - 沒有值的屬性當成空字串：Vue 輸出 `disabled`、React 輸出 `disabled=""`，瀏覽器裡同一件事。
 * - **id 換成出現順序的代號**：Vue 的 `useId()` 是 `v-0`，React 的是 `«r0»`。換成代號之後，
 *   `for`／`aria-describedby` 指不指得到同一個元素仍然比得出來（見下面的 ★）。
 */
const ID_REFERENCES = new Set([
  "id",
  "for",
  "aria-describedby",
  "aria-labelledby",
  "aria-controls",
]);

function decode(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function normalizeHtml(html: string): readonly string[] {
  const ids = new Map<string, string>();
  const idOf = (value: string): string => {
    if (!ids.has(value)) ids.set(value, `#${ids.size + 1}`);
    return ids.get(value) as string;
  };

  const out: string[] = [];
  for (const piece of html.replace(/<!--[^>]*-->/g, "").split(/(<[^>]+>)/)) {
    if (piece.startsWith("</")) {
      out.push(piece);
      continue;
    }
    if (!piece.startsWith("<")) {
      const text = decode(piece).trim();
      if (text !== "") out.push(text);
      continue;
    }
    const tag = /^<([a-zA-Z][\w-]*)/.exec(piece)?.[1] ?? "?";
    const attributes: string[] = [];
    for (const match of piece.matchAll(/\s([a-zA-Z][\w:-]*)="([^"]*)"/g)) {
      const name = match[1] as string;
      const value = decode(match[2] as string);
      const mapped = ID_REFERENCES.has(name) ? value.split(" ").map(idOf).join(" ") : value;
      attributes.push(`${name}=${mapped}`);
    }
    const bare = piece
      .replace(/\s[a-zA-Z][\w:-]*="[^"]*"/g, " ")
      .replace(/^<[a-zA-Z][\w-]*|\/?>$/g, "");
    for (const name of bare.split(/\s+/).filter(Boolean)) attributes.push(`${name}=`);
    out.push(`<${tag} ${attributes.sort().join(" ")}>`);
  }
  return out;
}

const asVue = (component: unknown): Component => component as Component;

async function vueHtml(render: () => VNode): Promise<string> {
  return await renderToString(createSSRApp({ render }));
}

function reactHtml(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

interface Case {
  readonly title: string;
  readonly vue: () => VNode;
  readonly react: () => ReactElement;
  /**
   * React 版刻意多出來的 class。**唯一**的一個是 `UiLabel` 的 `select-none`（`UiField` 裡面
   * 渲染的就是 `UiLabel`，所以它的幾組也列）：Vue 版的「雙擊不反白」是 reka-ui 的
   * mousedown 處理器，React 版改用 CSS（C236，見 `UiLabel.tsx`）。
   * 比對前從 React 那一邊拿掉；它真的在，由下面那條 ★ 守著 —— 例外沒被用到就是過期了。
   */
  readonly reactOnlyClasses?: readonly string[];
}

function withoutClasses(html: string, tokens: readonly string[]): string {
  return html.replace(/class="([^"]*)"/g, (_whole, value: string) => {
    const kept = value.split(" ").filter((token) => !tokens.includes(token));
    return `class="${kept.join(" ")}"`;
  });
}

const TONES_ALERT = ["info", "success", "danger"] as const;
const TONES_BADGE = ["neutral", "accent", "danger"] as const;

const CASES: readonly Case[] = [
  ...TONES_ALERT.map((tone) => ({
    title: `UiAlert tone=${tone}`,
    vue: () => h(asVue(VueAlert), { tone }, () => "已儲存"),
    react: () => createElement(UiAlert, { tone }, "已儲存"),
  })),
  ...TONES_BADGE.map((tone) => ({
    title: `UiBadge tone=${tone}`,
    vue: () => h(asVue(VueBadge), { tone }, () => "草稿"),
    react: () => createElement(UiBadge, { tone }, "草稿"),
  })),
  {
    title: "UiLabel",
    vue: () => h(asVue(VueLabel), { for: "email" }, () => "電子郵件"),
    react: () => createElement(UiLabel, { htmlFor: "email" }, "電子郵件"),
    reactOnlyClasses: ["select-none"],
  },
  ...(["horizontal", "vertical"] as const).flatMap((orientation) =>
    [false, true].map((semantic) => ({
      title: `UiSeparator orientation=${orientation} semantic=${String(semantic)}`,
      vue: () => h(asVue(VueSeparator), { orientation, semantic }),
      react: () => createElement(UiSeparator, { orientation, semantic }),
    })),
  ),
  {
    title: "UiSeparator 全用預設值",
    vue: () => h(asVue(VueSeparator)),
    react: () => createElement(UiSeparator),
  },
  {
    title: "UiSkeleton",
    vue: () => h(asVue(VueSkeleton)),
    react: () => createElement(UiSkeleton),
  },
  {
    title: "UiInput",
    vue: () => h(asVue(VueInput), { modelValue: "王小明" }),
    react: () => createElement(UiInput, { value: "王小明" }),
  },
  {
    title: "UiTextarea",
    vue: () => h(asVue(VueTextarea), { modelValue: "備註" }),
    react: () => createElement(UiTextarea, { value: "備註" }),
  },
  {
    title: "UiTable 一組六支",
    vue: () =>
      h(asVue(VueTable), null, () => [
        h(asVue(VueTableHead), null, () =>
          h(asVue(VueTableRow), null, () => [
            h(asVue(VueTableHeadCell), null, () => "編號"),
            h(asVue(VueTableHeadCell), { scope: "row" }, () => "金額"),
          ]),
        ),
        h(asVue(VueTableBody), null, () =>
          h(asVue(VueTableRow), null, () => [
            h(asVue(VueTableCell), null, () => "A-1"),
            h(asVue(VueTableCell), { numeric: true }, () => "1,200"),
          ]),
        ),
      ]),
    react: () =>
      createElement(
        UiTable,
        null,
        createElement(
          UiTableHead,
          null,
          createElement(
            UiTableRow,
            null,
            createElement(UiTableHeadCell, null, "編號"),
            createElement(UiTableHeadCell, { scope: "row" }, "金額"),
          ),
        ),
        createElement(
          UiTableBody,
          null,
          createElement(
            UiTableRow,
            null,
            createElement(UiTableCell, null, "A-1"),
            createElement(UiTableCell, { numeric: true }, "1,200"),
          ),
        ),
      ),
  },
  ...[
    { label: "電子郵件" },
    { label: "電子郵件", description: "不寄廣告" },
    { label: "電子郵件", error: "格式不對" },
    { label: "電子郵件", description: "不寄廣告", error: "格式不對" },
  ].map((props) => ({
    title: `UiField ${JSON.stringify(props)}`,
    vue: () =>
      h(asVue(VueField), props, {
        default: ({ control }: { control: Record<string, unknown> }) =>
          h(asVue(VueInput), { ...control, modelValue: "" }),
      }),
    react: () =>
      createElement(UiField, {
        ...props,
        children: (control) => createElement(UiInput, { ...control, value: "" }),
      }),
    reactOnlyClasses: ["select-none"],
  })),
];

/**
 * 分頁的差分格：總頁數 1–20 × 每一個目前頁，另加「總筆數 0」。
 *
 * 總筆數刻意不整除（`頁數 × 10 − 3`），`Math.ceil` 那一步才有東西可以錯。
 * 20 頁涵蓋了省略號出現、只出現一邊、兩邊都出現、以及頁數太少而全部列出的每一種情形
 * （`siblingCount` 2 時分界在 9 頁）。
 */
const PAGINATION_CASES: readonly Case[] = [
  { pageCount: 1, page: 1, total: 0 },
  ...Array.from({ length: 20 }, (_, index) => index + 1).flatMap((pageCount) =>
    Array.from({ length: pageCount }, (_, index) => ({
      pageCount,
      page: index + 1,
      total: pageCount * 10 - 3,
    })),
  ),
].map(({ pageCount, page, total }) => ({
  title: `UiPagination ${pageCount} 頁、第 ${page} 頁（${total} 筆）`,
  vue: () => h(asVue(VuePagination), { modelValue: page, total, perPage: 10 }),
  react: () => createElement(UiPagination, { page, total, perPage: 10 }),
}));

/**
 * 上面 `CASES` 渲染到的元件。其餘的不在這裡比，理由有兩種，行為改在 `BEHAVIOR_TESTS` 那支檔裡量：
 *
 * - 經過基元的（勾選類、Tabs）：兩個基元庫的 DOM 本來就不同，見檔頭。
 * - 彈出層（C237）：內容在 portal 裡，reka 的 `Teleport` 在 SSR 下不渲染（`<!--v-if-->`），
 *   React 的 portal 在 SSR 下也不渲染 —— 兩邊都是空的，放進來會是一組「空對空」的綠。
 */
const SSR_COMPARED: ReadonlySet<string> = new Set([
  "UiAlert",
  "UiBadge",
  "UiField",
  "UiInput",
  "UiLabel",
  "UiPagination",
  "UiSeparator",
  "UiSkeleton",
  "UiTable",
  "UiTableBody",
  "UiTableCell",
  "UiTableHead",
  "UiTableHeadCell",
  "UiTableRow",
  "UiTextarea",
]);

const BEHAVIOR_TESTS: Readonly<Record<string, string>> = {
  UiButton: "button-react.test.ts",
  UiCheckbox: "choice-react.test.ts",
  UiRadioGroup: "choice-react.test.ts",
  UiRadioItem: "choice-react.test.ts",
  UiSwitch: "choice-react.test.ts",
  UiTabs: "choice-react.test.ts",
  UiTabsPanel: "choice-react.test.ts",
  UiDialog: "dialog-react.test.ts",
  UiAlertDialog: "alert-dialog-react.test.ts",
  UiSelect: "select-react.test.ts",
  UiDropdownMenu: "dropdown-menu-react.test.ts",
};

describe("二、SSR 產出兩版逐一相同", () => {
  it("★ 分頁的差分格真的有那麼多組 —— 否則下面是在少數幾組上綠", () => {
    expect(PAGINATION_CASES.length).toBe(211);
  });

  it.each([...CASES, ...PAGINATION_CASES].map((entry) => [entry.title, entry] as const))(
    "%s",
    async (_title, entry) => {
      const vue = normalizeHtml(await vueHtml(entry.vue));
      const react = normalizeHtml(
        withoutClasses(reactHtml(entry.react()), entry.reactOnlyClasses ?? []),
      );
      expect(vue.length, "Vue 那一邊什麼都沒渲染出來 —— 空對空會恆真").toBeGreaterThan(0);
      expect(react).toEqual(vue);
    },
  );

  it("★ 每一支 .tsx 不是在這裡比過 SSR，就是有一支行為測試 —— 兩邊都沒有的元件沒有人在比", () => {
    const self = readFileSync(import.meta.filename, "utf8");
    for (const file of REACT_FILES) {
      const name = file.replace(/\.tsx$/, "");
      const behavior = BEHAVIOR_TESTS[name];
      expect(
        SSR_COMPARED.has(name) !== (behavior !== undefined),
        `${name} 要恰好在 SSR_COMPARED 或 BEHAVIOR_TESTS 其中一邊`,
      ).toBe(true);
      const source =
        behavior === undefined ? self : readFileSync(join(import.meta.dirname, behavior), "utf8");
      expect(source, `${behavior ?? "本檔"} 沒有 import ${name}`).toContain(
        `import { ${name} } from "../src/components/${file}";`,
      );
    }
  });

  it("★ 每一個 React 多出來的 class 都真的在 —— 沒被用到的例外是過期的例外", () => {
    for (const entry of CASES.filter((item) => item.reactOnlyClasses !== undefined)) {
      const classes = [...reactHtml(entry.react()).matchAll(/class="([^"]*)"/g)].flatMap((match) =>
        (match[1] as string).split(" "),
      );
      for (const token of entry.reactOnlyClasses ?? []) {
        expect(classes, `${entry.title} 沒有 ${token}`).toContain(token);
      }
    }
  });
});

describe("★ 正規化本身", () => {
  it("屬性值不同就不相等 —— 不是什麼都當成一樣", () => {
    expect(normalizeHtml('<button aria-label="Page 5">5</button>')).not.toEqual(
      normalizeHtml('<button aria-label="Page 6">5</button>'),
    );
  });

  it("id 換成代號之後，指得到同一個元素的仍然相等", () => {
    expect(normalizeHtml('<label for="v-0"></label><input id="v-0">')).toEqual(
      normalizeHtml('<label for="«r1»"></label><input id="«r1»"/>'),
    );
  });

  it("🔴 而指錯元素的不相等 —— 代號沒有把關聯抹掉", () => {
    expect(normalizeHtml('<label for="a"></label><input id="b">')).not.toEqual(
      normalizeHtml('<label for="a"></label><input id="a">'),
    );
  });

  it("沒有值的屬性等於空字串的屬性，而不等於沒有這個屬性", () => {
    expect(normalizeHtml("<button disabled></button>")).toEqual(
      normalizeHtml('<button disabled=""></button>'),
    );
    expect(normalizeHtml("<button disabled></button>")).not.toEqual(
      normalizeHtml("<button></button>"),
    );
  });

  it("Vue 的 fragment 標記不算內容", () => {
    expect(normalizeHtml("<!--[--><div></div><!--]-->")).toEqual(normalizeHtml("<div></div>"));
  });
});
