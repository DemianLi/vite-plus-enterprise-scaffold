import { describe, expect, it } from "vitest";

import { renderReference, type Surface } from "../src/docs.ts";

/**
 * 形狀參考的渲染（C100）。`#95` 非阻斷級：**27 個元件零份使用說明**。
 *
 * ⚠️ 修法刻意不是手寫 —— 手抄 27 個元件的 prop 名字正是這個 repo 一再栽的病。
 * 這裡驗的是「渲染出來的東西沒有比資料多說什麼、也沒有少說」。
 */
const SAMPLE: Surface = {
  "@org/zeta": { later: { kind: "value", type: '"z"' } },
  "@org/alpha": {
    UiThing: {
      kind: "component",
      members: [
        'tone?: "info" | "danger"',
        "[emit update:open]: void",
        "[slot default]: (): VNode[]",
      ],
    },
    aFunction: { kind: "function", type: "(x: number) => string" },
  },
};

describe("renderReference", () => {
  it("🔴 成員原樣印出，不做任何解析", () => {
    /**
     * ⚠️ 這一條是這支渲染器最重要的性質。要把 `tone?: "info"` 拆成兩欄，
     * 就得找「第一個不在方括號裡的冒號」—— 而成員裡真的有
     * `[emit update:open]: void` 這種東西。**一個為了排版而存在的解析器，
     * 是一個會安靜出錯的解析器。**
     */
    const out = renderReference(SAMPLE);
    expect(out).toContain("[emit update:open]: void");
    expect(out).toContain('tone?: "info" | "danger"');
  });

  it("★ 沒有 members 的 export 印 type", () => {
    // 151 個 export 裡有 97 個是這一種，漏掉的話這份參考少掉三分之二。
    expect(renderReference(SAMPLE)).toContain("(x: number) => string");
  });

  it("🔴 排序是自己排的，不是吃 surface.json 的鍵順序", () => {
    /**
     * 那份基準由 `--update` 寫出、再交給 `vp fmt` —— 順序是那條路徑的產物，
     * 不是這份文件的契約。不自己排的話，上游換個寫法就整份洗牌，
     * 而 diff 會變成沒人看得完的東西（正好是登記變更時最需要看 diff 的時刻）。
     */
    const out = renderReference(SAMPLE);
    expect(out.indexOf("@org/alpha")).toBeLessThan(out.indexOf("@org/zeta"));
    expect(out.indexOf("aFunction")).toBeLessThan(out.indexOf("UiThing"));
  });

  it("🔴 區塊**不得**標成 ts —— 那些字串不是合法的 TypeScript", () => {
    /**
     * ⚠️ 第一版標了 ```ts，formatter 當場把它們當程式格式化（`"/api"` → `"/api";`），
     * 於是每次 `vp check --fix` 之後閘門就紅在「API.md 與基準對不上」。
     *
     * 那不是 formatter 壞掉，是**標籤在說謊**：`[slot default]: (): VNode[]`
     * 不是任何 TS 語句。改回去的話 `vpr ready` 會紅，而原因看起來會很莫名。
     */
    expect(renderReference(SAMPLE)).not.toContain("```ts");
  });

  it("★ 開頭要講明它是產生的、以及它**不**回答什麼", () => {
    // 少了後半句，這份檔案會被讀成「使用說明」——
    // 而它答不出「怎麼接線」，那些在原始碼的檔頭註解裡。
    const out = renderReference(SAMPLE);
    expect(out, "沒講不要手改").toContain("不要手改");
    expect(out, "沒講怎麼重生").toContain("--update");
    expect(out, "沒講它不是使用說明").toContain("不是使用說明");
  });
});
