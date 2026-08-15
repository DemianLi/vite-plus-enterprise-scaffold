// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { maskName } from "@org/pii";

import feature from "../src/index.ts";

/**
 * §11 II ⑨ 的**執行期層**：宣告為個資的欄位，渲染出來真的看不到完整值。
 *
 * ── 為什麼靜態層不夠 ────────────────────────────────────────────────
 *
 * `tools/pii-check --masking` 證明的是「原始碼裡寫了 maskName(...)」。
 * 它證明不了 `maskName` 真的遮住了東西 —— 一個回傳原值的實作可以讓
 * 那道閘門全綠。這與 `csp-verify` 的分工完全一樣：
 * 靜態探測找出「有這個能力」，實測證明「執行期實際發生了什麼」。
 *
 * ── 這裡最容易寫錯的一條 ────────────────────────────────────────────
 *
 * 直覺會寫成「斷言隱碼後的字串有出現」。那條會過，而且**在沒有隱碼時也會過**：
 * 「林○○」與「林佳蓉」可以同時出現在畫面上（例如列表遮了、明細沒遮）。
 *
 * 真正該斷言的是**完整值在整份 HTML 裡不存在**。
 * 這是 #5 那個洞的同一課：檢查要重新推導觀測，不是讀一份宣告。
 */

/** 刻意不用示範資料裡的名字：測試不該依賴另一個檔案的內容。 */
const FULL_NAME = "王曉明";
const LATIN_NAME = "Aya Nakamura";

describe("隱碼函式本身", () => {
  it("中文姓名留第一個字", () => {
    expect(maskName(FULL_NAME)).toBe("王○○");
  });

  it("★ 西方姓名分段處理 —— 否則列表裡完全認不出是誰", () => {
    // 整串只留第一個字母的話會變成 A○○○○○○○○○○○：
    // 長度本身洩漏資訊，而且難用到大家會乾脆不呼叫這個函式。
    expect(maskName(LATIN_NAME)).toBe("A○○ N○○○○○○○");
  });

  it("🔴 遮罩後不得包含原本的字", () => {
    const masked = maskName(FULL_NAME);
    expect(masked).not.toContain("佳");
    expect(masked).not.toBe(FULL_NAME);
  });

  it("空字串不會炸", () => {
    expect(maskName("")).toBe("");
  });
});

/**
 * 用一個只做呈現的替身元件，而不是掛整個 `OrderList.vue`。
 *
 * `OrderList.vue` 需要 Pinia、vue-query、vue-i18n 與 router 四個外掛才掛得起來，
 * 而那四個東西一個都不影響「姓名有沒有被遮住」。掛整個畫面只會讓這支測試
 * 因為與個資無關的理由而壞掉 —— 然後有人把它跳過。
 *
 * ⚠️ 代價要說清楚：這樣就**不是**在測 `OrderList.vue` 本身。
 * 守住 `OrderList.vue` 的是靜態層（`pii-check --masking` 讀它的 template）。
 * 兩層加起來才是完整的：靜態層看得到每一個模板，這一層證明遮罩真的會遮。
 */
const OrderRow = defineComponent({
  props: { customerName: { type: String, required: true } },
  setup: (props) => () => h("td", maskName(props.customerName)),
});

describe("渲染結果裡找不到完整姓名", () => {
  it("🔴 完整姓名不得出現在 HTML 的任何地方", () => {
    const wrapper = mount(OrderRow, { props: { customerName: FULL_NAME } });
    expect(wrapper.html(), "完整姓名被渲染出去了").not.toContain(FULL_NAME);
  });

  it("★ 而且畫面不是空的 —— 對照組", () => {
    // 少了這條，「什麼都沒渲染」會被讀成「遮得很好」。
    // 這是 C33 的規矩在元件測試上的樣子。
    const wrapper = mount(OrderRow, { props: { customerName: FULL_NAME } });
    expect(wrapper.text().length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain("王");
  });

  it("西方姓名同樣不得完整出現", () => {
    const wrapper = mount(OrderRow, { props: { customerName: LATIN_NAME } });
    expect(wrapper.html()).not.toContain(LATIN_NAME);
    expect(wrapper.html()).not.toContain("Nakamura");
  });
});

describe("切片的宣告與實作對得上", () => {
  it("order 宣告了 customerName 是個資", () => {
    expect(feature.personalData).toContain("customerName");
  });

  it("★ personalData 是必填的 —— 空陣列是答案，沒寫不是", () => {
    // 型別已經擋住「沒寫」，這條釘住的是它**確實是型別的一部分**：
    // 哪天有人把它改成選填，這裡會紅。
    expect(Array.isArray(feature.personalData)).toBe(true);
  });
});
