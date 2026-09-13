import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
 * 原生元素做的那幾支，SSR 產出與凍結的答案逐一相同（C243，Q98）。
 *
 * `ssr-expected.json` 不是手寫的：C236 起這些元件由 `react-parity.test.ts` 逐組對 Vue 版
 * （reka-ui 在算分頁、在送 `role`）比對 SSR 產出；Vue 退場前，在那支比對全綠的樹上把
 * React 這一邊的產出存下來。凍結當下每一組都與 Vue 版相同（`UiLabel` 與渲染它的 `UiField`
 * 那五組多一個 `select-none`，C236 的唯一例外，見 `UiLabel.tsx`）。從此這份檔就是那個對照組。
 *
 * ⚠️ 改了元件的標記讓這裡紅，要做的是**判斷那個差別是不是刻意的**，是的話重產這一格 ——
 * 不是把整份檔重產一次讓它綠。重產整份等於把對照組換成受檢者自己。
 *
 * 經過基元的（勾選類、Tabs）與彈出層不在這裡比，理由有兩種，行為改在 `BEHAVIOR_TESTS` 那支檔裡量：
 *
 * - 經過基元的：DOM 由 Base UI 決定（`<span>` ＋ 隱藏 input），凍結它等於凍結上游的實作細節。
 * - 彈出層：內容在 portal 裡，React 的 portal 在 SSR 下不渲染 —— 放進來會是一組「空對空」的綠。
 */

const EXPECTED: Readonly<Record<string, readonly string[]>> = JSON.parse(
  readFileSync(join(import.meta.dirname, "ssr-expected.json"), "utf8"),
) as Record<string, readonly string[]>;

const COMPONENTS_DIR = join(import.meta.dirname, "../src/components");
const REACT_FILES = readdirSync(COMPONENTS_DIR).filter((name) => name.endsWith(".tsx"));

/**
 * 把一段 HTML 攤成「開標籤（屬性排序）／關標籤／文字」的序列。
 *
 * - 註解拿掉：那是框架插的，不是元件寫的。
 * - 屬性排序：順序沒有語意，而 React 的輸出順序跟著 prop 的書寫順序走。
 * - 沒有值的屬性當成空字串：`disabled` 與 `disabled=""` 在瀏覽器裡是同一件事。
 * - **id 換成出現順序的代號**：`useId()` 的值（`«r0»`）隨渲染順序變。換成代號之後，
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

interface Case {
  readonly title: string;
  readonly render: () => ReactElement;
}

const TONES_ALERT = ["info", "success", "danger"] as const;
const TONES_BADGE = ["neutral", "accent", "danger"] as const;

const CASES: readonly Case[] = [
  ...TONES_ALERT.map((tone) => ({
    title: `UiAlert tone=${tone}`,
    render: () => createElement(UiAlert, { tone }, "已儲存"),
  })),
  ...TONES_BADGE.map((tone) => ({
    title: `UiBadge tone=${tone}`,
    render: () => createElement(UiBadge, { tone }, "草稿"),
  })),
  {
    title: "UiLabel",
    render: () => createElement(UiLabel, { htmlFor: "email" }, "電子郵件"),
  },
  ...(["horizontal", "vertical"] as const).flatMap((orientation) =>
    [false, true].map((semantic) => ({
      title: `UiSeparator orientation=${orientation} semantic=${String(semantic)}`,
      render: () => createElement(UiSeparator, { orientation, semantic }),
    })),
  ),
  { title: "UiSeparator 全用預設值", render: () => createElement(UiSeparator) },
  { title: "UiSkeleton", render: () => createElement(UiSkeleton) },
  { title: "UiInput", render: () => createElement(UiInput, { value: "王小明" }) },
  { title: "UiTextarea", render: () => createElement(UiTextarea, { value: "備註" }) },
  {
    title: "UiTable 一組六支",
    render: () =>
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
    render: () =>
      createElement(UiField, {
        ...props,
        children: (control) => createElement(UiInput, { ...control, value: "" }),
      }),
  })),
  // 分頁的頁碼演算法在 `page-range.test.ts` 逐組比；這裡凍結的是標記，挑五組：
  // 總筆數 0（頁數仍是 1）、只有一頁、全部列出、只有右邊省略、兩邊都省略。
  ...[
    { pageCount: 1, page: 1, total: 0 },
    { pageCount: 1, page: 1, total: 7 },
    { pageCount: 9, page: 5, total: 87 },
    { pageCount: 20, page: 1, total: 197 },
    { pageCount: 20, page: 10, total: 197 },
  ].map(({ pageCount, page, total }) => ({
    title: `UiPagination ${pageCount} 頁、第 ${page} 頁（${total} 筆）`,
    render: () => createElement(UiPagination, { page, total, perPage: 10 }),
  })),
];

/** 上面 `CASES` 渲染到的元件。 */
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
  UiDatePicker: "date-picker-react.test.ts",
};

describe("SSR 產出與凍結的答案逐一相同", () => {
  it.each(CASES.map((entry) => [entry.title, entry] as const))("%s", (title, entry) => {
    const expected = EXPECTED[title];
    expect(expected, `ssr-expected.json 沒有「${title}」這一格`).toBeDefined();
    expect(normalizeHtml(renderToStaticMarkup(entry.render()))).toEqual(expected);
  });

  it("★ 凍結的每一格都有人渲染 —— 沒人比的答案是過期的答案", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(CASES.map(({ title }) => title).sort());
  });

  it("★ 每一支 .tsx 不是在這裡比 SSR，就是有一支行為測試 —— 兩邊都沒有的元件沒有人在比", () => {
    expect(REACT_FILES.length).toBeGreaterThanOrEqual(2);
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
});

describe("★ 正規化本身", () => {
  it("屬性值不同就不相等 —— 不是什麼都當成一樣", () => {
    expect(normalizeHtml('<button aria-label="Page 5">5</button>')).not.toEqual(
      normalizeHtml('<button aria-label="Page 6">5</button>'),
    );
  });

  it("id 換成代號之後，指得到同一個元素的仍然相等", () => {
    expect(normalizeHtml('<label for="«r0»"></label><input id="«r0»">')).toEqual(
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

  it("註解不算內容", () => {
    expect(normalizeHtml("<!-- --><div></div><!-- -->")).toEqual(normalizeHtml("<div></div>"));
  });
});
