// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { UiDatePicker } from "../src/components/UiDatePicker.tsx";
import { UiField } from "../src/components/UiField.tsx";
import { UiInput } from "../src/components/UiInput.tsx";
import { UiSelect } from "../src/components/UiSelect.tsx";
import { UiTextarea } from "../src/components/UiTextarea.tsx";

/**
 * `UiField` 的接線，React 版（C236）。問題與 `field-wiring.test.ts` 相同 —— 屬性值與 id
 * 對不對得起來 —— 答案要從 React 版自己的產出量：`control` 那一段是重寫的，而且 React 版的
 * 控制項沒有 fallthrough，`control` 的三格落不落得到 `<input>` 上取決於它有沒有把三個 prop
 * 明列出來（`UiInput.tsx` 檔頭）。
 *
 * 用 DOM 而不是解析 SSR 字串：這裡問的都是「這個屬性在不在、指到的元素在不在」，
 * `hasAttribute` 與 `getElementById` 直接答，不必再造一個屬性解析器（Vue 那支為什麼要造，
 * 見它的 `hasAttribute` 說明 —— 那個坑在 DOM 上不存在）。
 */

afterEach(cleanup);

interface Props {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
}

function field(props: Props, control: "input" | "textarea" = "input"): HTMLElement {
  const { container } = render(
    createElement(UiField, {
      ...props,
      children: (wiring) =>
        control === "input"
          ? createElement(UiInput, { ...wiring, value: "" })
          : createElement(UiTextarea, { ...wiring, value: "" }),
    }),
  );
  return container;
}

function controlOf(container: HTMLElement): Element {
  const found = container.querySelector("input, textarea");
  if (found === null) throw new Error("沒有渲染出控制項 —— 下面每一條都失去意義");
  return found;
}

describe("標籤與控制項", () => {
  it("`for` 對得到控制項的 `id`", () => {
    const container = field({ label: "電子郵件" });
    const htmlFor = container.querySelector("label")?.htmlFor;
    expect(htmlFor).toBeTruthy();
    expect(controlOf(container).id).toBe(htmlFor);
  });
});

describe("aria-describedby", () => {
  it("說明與錯誤都在時兩個都指到，而且說明在前", () => {
    const container = field({ label: "電子郵件", description: "不寄廣告", error: "格式不對" });
    const described = (controlOf(container).getAttribute("aria-describedby") ?? "").split(" ");
    const descriptionId = container.querySelector('[data-slot="field-description"]')?.id;
    const errorId = container.querySelector('[data-slot="field-error"]')?.id;
    expect(descriptionId).toBeTruthy();
    expect(errorId).toBeTruthy();
    expect(described).toEqual([descriptionId, errorId]);
  });

  it("只有說明時只指到說明、只有錯誤時只指到錯誤", () => {
    for (const props of [
      { label: "甲", description: "說明" },
      { label: "乙", error: "錯誤" },
    ]) {
      const described = controlOf(field(props)).getAttribute("aria-describedby") ?? "";
      expect(described.split(" "), JSON.stringify(props)).toHaveLength(1);
      cleanup();
    }
  });

  it("兩個都沒有時屬性不存在，而不是空字串", () => {
    expect(controlOf(field({ label: "電子郵件" })).hasAttribute("aria-describedby")).toBe(false);
  });

  it("🔴 指到的每一個 id 都真的存在", () => {
    for (const props of [
      { label: "甲", description: "說明" },
      { label: "乙", error: "錯誤" },
      { label: "丙", description: "說明", error: "錯誤" },
    ]) {
      const container = field(props);
      for (const reference of (controlOf(container).getAttribute("aria-describedby") ?? "").split(
        " ",
      )) {
        expect(
          document.getElementById(reference),
          `${JSON.stringify(props)} → ${reference}`,
        ).not.toBeNull();
      }
      cleanup();
    }
  });
});

describe("aria-invalid", () => {
  it("有錯誤時是字串 `true` —— Tailwind 的 aria-invalid: 選的就是這個值", () => {
    expect(
      controlOf(field({ label: "電子郵件", error: "格式不對" })).getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("沒有錯誤時屬性不存在，而不是 `false`", () => {
    expect(controlOf(field({ label: "電子郵件" })).hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("渲染與否", () => {
  it("沒給說明與錯誤時，那兩段不渲染", () => {
    const container = field({ label: "電子郵件" });
    expect(container.querySelector('[data-slot="field-description"]')).toBeNull();
    expect(container.querySelector('[data-slot="field-error"]')).toBeNull();
  });
});

describe("control 的三格落到控制項上 —— React 沒有 fallthrough，要控制項自己收", () => {
  it.each(["input", "textarea"] as const)("%s 三格都收到了", (kind) => {
    const container = field({ label: "備註", description: "說明", error: "必填" }, kind);
    const element = controlOf(container);
    expect(element.tagName.toLowerCase()).toBe(kind);
    expect(element.id).toBeTruthy();
    expect(element.getAttribute("aria-describedby")).toBeTruthy();
    expect(element.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("UiField 包 UiSelect：`control` 落到觸發鈕上（C101 的 React 形狀，C237）", () => {
  /**
   * Vue 版的缺陷是 `<label for>` 指向一個不存在的元素（`field-wiring.test.ts` 那一組）。
   * React 版多一種壞法：Base UI 另渲染一個隱藏的表單 `<input>`，`for` 若指到它，
   * 元素存在、`getElementById` 找得到，而使用者操作的那顆按鈕仍然沒有名字。
   */
  function selectField(props: Props): HTMLElement {
    const { container } = render(
      createElement(UiField, {
        ...props,
        children: (wiring) =>
          createElement(UiSelect, {
            ...wiring,
            items: [{ value: "a", label: "A" }],
            placeholder: "選一個",
          }),
      }),
    );
    return container;
  }

  it("🔴 `<label for>` 指到的是觸發鈕（role=combobox），不是隱藏的 input", () => {
    const container = selectField({ label: "分級" });
    const htmlFor = container.querySelector("label")?.htmlFor ?? "";
    expect(htmlFor).toBeTruthy();
    expect(document.getElementById(htmlFor)?.getAttribute("role")).toBe("combobox");
  });

  it("🔴 三格一起落到觸發鈕上，不是只有 id", () => {
    const container = selectField({ label: "分級", description: "選一個等級", error: "必填" });
    const trigger = container.querySelector('[role="combobox"]');
    expect(trigger, "沒有渲染出觸發鈕").not.toBeNull();
    expect(trigger?.id).toBeTruthy();
    expect(trigger?.getAttribute("aria-describedby")).toBeTruthy();
    expect(trigger?.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("UiField 包 UiDatePicker：`control` 落到按鈕上（C238）", () => {
  /**
   * Vue 版接不起來：`DatePickerRoot` 不渲染元素，屬性落在它身上就消失，所以 `field` 那三條
   * `aria-invalid:*` 從落地起就是死的（`UiField.vue` 檔頭）。React 版是一顆按鈕，這一組量它接上了。
   */
  function dateField(props: Props): HTMLElement {
    const { container } = render(
      createElement(UiField, {
        ...props,
        children: (wiring) => createElement(UiDatePicker, { ...wiring, placeholder: "請選擇日期" }),
      }),
    );
    return container;
  }

  it("🔴 `<label for>` 指到的是那顆按鈕", () => {
    const container = dateField({ label: "生日" });
    const htmlFor = container.querySelector("label")?.htmlFor ?? "";
    expect(htmlFor).toBeTruthy();
    expect(document.getElementById(htmlFor)?.getAttribute("data-slot")).toBe("date-picker");
  });

  it("🔴 aria-invalid 落在帶紅框 class 的同一個元素上 —— Vue 版那三條死 class 在這裡是活的", () => {
    const container = dateField({ label: "生日", description: "民國年請換算", error: "必填" });
    const picker = container.querySelector('[data-slot="date-picker"]');
    expect(picker?.getAttribute("aria-invalid")).toBe("true");
    expect(picker?.className.split(" ")).toContain("aria-invalid:border-danger");
    // 日期文字在最前面（`date-picker-react.test.ts`），後面接 `UiField` 的說明與錯誤兩格。
    const described = (picker?.getAttribute("aria-describedby") ?? "").split(" ");
    expect(described.map((target) => document.getElementById(target)?.textContent)).toEqual([
      "請選擇日期",
      "民國年請換算",
      "必填",
    ]);
  });
});
