import { describe, expect, it } from "vitest";
import { createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";

import UiField from "../src/components/UiField.vue";
import UiSelect from "../src/components/UiSelect.vue";

/**
 * `UiField` 的接線驗收。
 *
 * ── 為什麼這一支是 SSR，不是讀原始碼、也不是 mount ───────────────────
 *
 * ⚠️ 「不 mount」原本的理由是「沒有 `@vue/test-utils`」，而 **C86（#80）
 * 之後那句話是假的** —— 相依在 `package.json` 裡，同 package 有兩支在 mount。
 *
 * 今天的理由是**這一支不需要 DOM**：它問的全部是「輸出的 HTML 上，屬性值
 * 與 id 對不對得起來」，`renderToString` 的字串就答得完。
 *
 * ⚠️ 界線在哪裡有現成的例子 —— `alert-dialog.test.ts` 檔頭記著同一招在那裡
 * **一個字都驗不到**（reka-ui 的內容包在 `Teleport` 裡，SSR 產出是
 * `<!--v-if-->`），所以那一支才 mount。**判準是「SSR 夠不夠」，不是「有沒有
 * 相依」。**
 *
 * ⚠️ 不讀原始碼，則是因為這個元件的**全部價值都在執行期算出來的那個
 * `control` 物件上**：
 * `aria-describedby` 要不要接、接幾個、順序、以及「沒有時必須是 undefined
 * 不是空字串」。讀原始碼對這些完全無感 —— 那條 `computed` 可以整個寫錯而
 * 每一個字串斷言照樣綠。
 *
 * `vue/server-renderer` 是 `vue` 自己的進入點，本 package 已經依賴 vue，
 * **零新增依賴**。代價是它證明的是伺服器端渲染出來的 HTML，不是瀏覽器算出
 * 來的無障礙樹 —— 但屬性值與 id 對應這一層，兩者是同一件事。
 */

/**
 * ⚠️ `h()` 收不了 `.vue` 的具名 props —— 那是 HANDOFF #26 的具體代價。
 *
 * `.vue` 沒有型別檢查，tsc 看到的是一個 `declare module "*.vue"` 的 shim，
 * 於是 `h(UiField, { label: "…" }, …)` 會挑到最後一個 overload（把第二個
 * 參數當成元件實例）而報 TS2769。轉成 `Component` 讓 props 走寬鬆的那條。
 *
 * ⚠️ **代價要說清楚**：這裡的 props 打錯字不會被型別擋，而下面每一條斷言
 * 都建立在「props 真的傳進去了」上。`label` 打成 `lable` 的話，「`for`
 * 對得到 `id`」那條照樣綠（id 還是會產生）—— 所以那一條刻意連 `for` 的值
 * 本身都斷言 defined，而「渲染與否」那兩條是靠 `description`／`error`
 * 有沒有真的生出 `<p>` 來間接證明 props 有進去。
 */
const Field = UiField as Component;

interface Attributes {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
}

/** 渲染一個 `UiField`，slot 內容是一個把 `control` 整包綁上去的 `<input>`。 */
async function render(props: Attributes): Promise<string> {
  return await renderToString(
    createSSRApp({
      render: () =>
        h(Field, props, {
          default: ({ control }: { control: Record<string, unknown> }) =>
            h("input", control as never),
        }),
    }),
  );
}

/**
 * 解析一個開始標籤的屬性表。
 *
 * ⚠️ **用字面正則而不是 `new RegExp(name)`** —— eslint 的
 * `security/detect-non-literal-regexp` 在本 repo 是 0-warnings（C80 踩過
 * 同一條）。而且解析一次比對照名字拼一條正則更準：`aria-describedby="v-1 v-2"`
 * 的值裡有空白，字串切割會把它拆成兩個假的屬性。
 *
 * 帶值的存值，**沒有等號的存空字串** —— 那個區別是這支測試的重點之一，
 * 見下面 `hasAttribute` 的說明。
 */
function attributes(tag: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();

  // 帶值的先收。⚠️ 兩條分開的正則而不是一條帶 `(?:…)?` 的 ——
  // 那個可選群組被 eslint 的 `security/detect-unsafe-regex` 判成有回溯風險，
  // 而本 repo 是 0-warnings。拆開之後兩條都是線性的。
  for (const match of tag.matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)) {
    found.set(match[1] as string, match[2] as string);
  }

  // 剩下的就是沒有等號的。把帶值的整段挖掉再按空白切 —— 直接切會被
  // `aria-describedby="v-1 v-2"` 的值裡那個空白拆出假的屬性名。
  const bare = tag.replace(/\s[a-zA-Z-]+="[^"]*"/g, " ").replace(/^<|>$/g, "");
  for (const name of bare.split(/\s+/).filter(Boolean).slice(1)) {
    found.set(name, "");
  }

  return found;
}

/** 第一個 `<input>` 的屬性表。 */
function inputAttributes(html: string): ReadonlyMap<string, string> {
  return attributes(/<input\b[^>]*>/.exec(html)?.[0] ?? "");
}

/** 帶 `data-slot="…"` 的那個元素的屬性表。 */
function slotAttributes(html: string, slot: string): ReadonlyMap<string, string> {
  for (const match of html.matchAll(/<[a-z]+\b[^>]*>/g)) {
    const parsed = attributes(match[0]);
    if (parsed.get("data-slot") === slot) return parsed;
  }
  return new Map();
}

/** 文件裡出現過的所有 `id`。 */
function presentIds(html: string): readonly string[] {
  return [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] as string);
}

/**
 * 這個屬性**在不在**（不管有沒有帶值）。
 *
 * ⚠️ 這個函式是變異驗證逼出來的。第一版問的是「值是不是 undefined」——
 * **那是假綠**。實測 Vue 的 SSR：
 *
 *   `""`        → `<input aria-describedby>`（**沒有等號**）
 *   `undefined` → `<input>`
 *   `false`     → `<input aria-describedby="false">`
 *
 * 空字串渲染成 bare attribute，而在瀏覽器裡那等於 `aria-describedby=""` ——
 * 一個指向空的引用。只認 `="…"` 的抽取方式對它是盲的，於是把元件裡的
 * `described === "" ? undefined : described` 拿掉之後測試照樣全綠。
 *
 * **抽取函式認得什麼，決定了斷言抓得到什麼。**
 */
function hasAttribute(parsed: ReadonlyMap<string, string>, name: string): boolean {
  return parsed.has(name);
}

describe("標籤與控制項", () => {
  it("`for` 對得到控制項的 `id`", async () => {
    const html = await render({ label: "電子郵件" });
    const forValue = slotAttributes(html, "label").get("for");

    // ⚠️ 這正是 UiLabel 檔頭說「沒有任何閘門守得住」的那一格 ——
    // 它在使用端手寫時守不住，但 UiField 自己產生兩邊的話守得住。
    expect(forValue).toBeDefined();
    expect(inputAttributes(html).get("id")).toBe(forValue);
  });
});

describe("aria-describedby", () => {
  it("說明與錯誤都在時**兩個都指到**，而且說明在前", async () => {
    const html = await render({ label: "電子郵件", description: "不寄廣告", error: "格式不對" });
    const described = (inputAttributes(html).get("aria-describedby") ?? "").split(" ");

    expect(described).toHaveLength(2);

    // ⚠️ 順序就是唸出來的順序。只斷言「兩個都在」的話，把 join 的順序
    // 對調會照樣綠 —— 而輔具會先唸錯誤再唸這個欄位是幹嘛的。
    const descriptionId = slotAttributes(html, "field-description").get("id");
    const errorId = slotAttributes(html, "field-error").get("id");
    expect(descriptionId).toBeDefined();
    expect(errorId).toBeDefined();
    expect(described[0]).toBe(descriptionId);
    expect(described[1]).toBe(errorId);
  });

  it("只有說明時只指到說明", async () => {
    const html = await render({ label: "電子郵件", description: "不寄廣告" });
    expect((inputAttributes(html).get("aria-describedby") ?? "").split(" ")).toHaveLength(1);
  });

  it("只有錯誤時只指到錯誤", async () => {
    const html = await render({ label: "電子郵件", error: "格式不對" });
    expect((inputAttributes(html).get("aria-describedby") ?? "").split(" ")).toHaveLength(1);
  });

  it("兩個都沒有時**屬性不存在**，而不是空字串", async () => {
    const html = await render({ label: "電子郵件" });

    // ⚠️ 指向空的引用有兩種長相，兩種都要擋：`aria-describedby=""` 與
    // **沒有等號的** `aria-describedby`（Vue 對空字串產出的就是後者）。
    // 所以問「這個屬性在不在」，不是問「它的值是什麼」。
    expect(hasAttribute(inputAttributes(html), "aria-describedby")).toBe(false);
  });

  it("🔴 指到的每一個 id 都真的存在", async () => {
    // 這是「懸空引用」的無障礙版本 —— 同 theme-verify 守的那個形狀：
    // 指向一個不存在的 id，輔具就是唸不出來，而畫面完全正常。
    for (const props of [
      { label: "甲", description: "說明" },
      { label: "乙", error: "錯誤" },
      { label: "丙", description: "說明", error: "錯誤" },
    ]) {
      const html = await render(props);
      const ids = presentIds(html);
      for (const reference of (inputAttributes(html).get("aria-describedby") ?? "").split(" ")) {
        expect(
          ids,
          `${JSON.stringify(props)} 的 aria-describedby 指到不存在的 ${reference}`,
        ).toContain(reference);
      }
    }
  });
});

describe("aria-invalid", () => {
  it("有錯誤時是字串 `true`", async () => {
    const html = await render({ label: "電子郵件", error: "格式不對" });

    // ⚠️ 必須是 "true" 這個字面值：Tailwind 的 `aria-invalid:*` variant
    // 選的是 `[aria-invalid="true"]`，所以 UiInput／UiDatePicker 那幾條
    // 紅框樣式只有在這個值下才會生效。
    expect(inputAttributes(html).get("aria-invalid")).toBe("true");
  });

  it("沒有錯誤時**屬性不存在**，而不是 `false`", async () => {
    const html = await render({ label: "電子郵件" });

    // ⚠️ Vue 會把 boolean false 渲染成 aria-invalid="false"（aria-* 保留
    // false）。那在 DOM 裡看起來像「有設」，而 Tailwind 的 variant 不會中，
    // 所以樣式不生效 —— 一個看起來對、實際上什麼都沒做的屬性。
    expect(hasAttribute(inputAttributes(html), "aria-invalid")).toBe(false);
  });
});

describe("渲染與否", () => {
  it("沒給說明與錯誤時，那兩段不渲染", async () => {
    const html = await render({ label: "電子郵件" });
    expect(html).not.toContain('data-slot="field-description"');
    expect(html).not.toContain('data-slot="field-error"');
  });

  it("⚠️ 模板裡不留 HTML 註解 —— 它會進 SSR 產物", async () => {
    // renderToString 不移除註解（用戶端 production build 會）。
    // 一段中文論證會出現在使用 SSR 的專案下載的 HTML 裡，同 C83 的形狀。
    const html = await render({ label: "電子郵件", description: "說明", error: "錯誤" });
    expect(html).not.toContain("<!--#");
    expect(/<!--[^[\]]/.test(html), `SSR 產物裡有註解：${html}`).toBe(false);
  });
});

describe("UiField 包 UiSelect：`control` 要真的落到觸發鈕上（C101）", () => {
  /**
   * `#95` 非阻斷級。採用演練在瀏覽器裡量到：畫面上看得到「分級」兩個字，
   * 而那個 `<label for="v-60">` **指向一個不存在的元素**，那顆下拉沒有任何
   * 程式可讀的名稱 —— `document.getElementById('v-60')` 是 `null`。
   *
   * 成因：`UiSelect` 的根是 `SelectRoot`（提供 context 的無渲染元件），
   * fallthrough 的 attrs 落在那裡等於掉進地上。`UiInput`／`UiTextarea`
   * 是原生元素所以接得到 —— **同一個寫法，三個元件裡兩個能用。**
   *
   * ⚠️ 三道相關閘門當時全綠（`vue-typecheck` 認為 fallthrough 不是型別錯、
   * `component-contract` 讀原始碼文字、`a11y` 也是）。
   */
  const Select = UiSelect as Component;

  async function renderSelect(props: Attributes = { label: "分級" }): Promise<string> {
    return await renderToString(
      createSSRApp({
        render: () =>
          h(Field, props, {
            default: ({ control }: { control: Record<string, unknown> }) =>
              h(Select, {
                ...control,
                items: [{ value: "a", label: "A" }],
                placeholder: "選一個",
              } as never),
          }),
      }),
    );
  }

  it("🔴 `<label for>` 指到的 id 真的存在於產出的 HTML 裡", () => {
    // 這一條就是那個缺陷本身：for 有值、而那個 id 在文件裡不存在。
    return renderSelect().then((html) => {
      const label = /<label[^>]*\sfor="([^"]+)"/.exec(html);
      expect(label, "連 label 都沒渲染出來 —— 這條測試失去意義").not.toBeNull();
      const id = label![1]!;
      expect(html.includes(`id="${id}"`), `for="${id}" 指向一個不存在的元素`).toBe(true);
    });
  });

  it("🔴 `control` 的三格要一起落到觸發鈕上，不是只有 id", () => {
    /**
     * ⚠️ 修法是把 `$attrs` 整包轉過去（不是加一個選填 `id` prop），
     * 所以三格一次接齊。只驗 id 的話，把修法退化成單一 prop 也照樣綠 ——
     * 而那個退化版本正是稽核標記裡提過、會踩到 `api-surface` 的那條路。
     *
     * ⚠️ 所以要帶 `description` 與 `error` 進去把另外兩格叫出來：
     * `control` 在沒有它們的時候，那兩格是 `undefined`（刻意的，見 UiField），
     * 於是「只接得到 id」的實作也會通過一個只驗 id 的測試。
     */
    return renderSelect({ label: "分級", description: "選一個等級", error: "必填" }).then(
      (html) => {
        const trigger = /<button[^>]*>/.exec(html);
        expect(trigger, "沒有渲染出觸發鈕").not.toBeNull();
        expect(trigger![0], "觸發鈕上沒有 id").toMatch(/\sid="/);
        expect(trigger![0], "aria-describedby 沒有落到觸發鈕上").toMatch(/aria-describedby="/);
        expect(trigger![0], "aria-invalid 沒有落到觸發鈕上").toMatch(/aria-invalid/);
      },
    );
  });
});
