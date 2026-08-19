// @vitest-environment happy-dom
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { nextTick, type Component } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import UiDropdownMenu from "../src/components/UiDropdownMenu.vue";

/**
 * ── `UiDropdownMenu`：C81 三個「三層全過」的最後一個（C88）──────────────
 *
 * 環境與收拾方式沿用 C86 的 `alert-dialog.test.ts`，兩個坑照樣適用，
 * 這裡不重述：**SSR 驗不到**（包在 reka-ui 的 `Teleport` 裡，
 * `renderToString` 的產出是 `<!--v-if-->`）、**只能靠 `enableAutoUnmount`
 * 收拾**（再加一個清 `body` 的 `afterEach` 會因為 LIFO 把整支弄紅）。
 *
 * ── ⚠️ 焦點落點不由「誰打開的」決定，由**整頁最後一個輸入事件**決定 ──
 *
 * 上游只在「使用者正在用鍵盤」時才把焦點送到第一個項目：
 *
 *     // MenuContentImpl.vue
 *     @entry-focus="(event) => { …
 *       if (!rootContext.isUsingKeyboardRef.value) event.preventDefault(); }"
 *
 * 而 `isUsingKeyboardRef` 來自 `useIsUsingKeyboard()`，它是
 * **`createSharedComposable`** 包出來的 —— 整頁一份，掛在 `window` 的
 * capture 監聽上，由最後一次 keydown／pointerdown 翻面。
 *
 * 五個實驗（下面三條測試就是 E20／E21／E2 的固化版）：
 *
 * | 實驗 | 怎麼打開                             | 落點       |
 * | ---- | ------------------------------------ | ---------- |
 * | E1   | 掛載時就 `open: true`，沒有輸入事件  | 選單容器   |
 * | E2   | 關著掛載，在觸發器上按 `↓`           | **第一項** |
 * | E3   | 關著掛載，點觸發器                   | 選單容器   |
 * | E20  | 程式 `open = true`，前一個事件是滑鼠 | 選單容器   |
 * | E21  | 程式 `open = true`，前一個事件是鍵盤 | **第一項** |
 *
 * → **E20 與 E21 只差「頁面上最後一個輸入事件」，其餘完全相同。**
 *   這推翻了元件檔頭的第一版，那裡寫的是「從程式碼設 `true` 與使用者按鍵
 *   打開，落點不一樣」—— 聽起來像是這個元件實例的性質，實際上是整頁共用的
 *   一個布林值。已改。（E12：兩個選單同時掛著時，第二個吃得到打在第一個
 *   身上的鍵盤事件。）
 *
 * ⚠️ 這也是**測試之間唯一的隱形耦合來源**：那個旗標跨實例共用，只有在
 * 最後一個訂閱者卸載時才會重置。這支測試不依賴那個重置 —— 每一條需要它的
 * 都自己先送一個 `pointerdown` 或 `keydown` 把狀態釘死。
 *
 * ── ⚠️ 綠燈的意思是什麼、不是什麼 ──────────────────────────────────
 *
 * **是**：在 happy-dom 上，名稱接得起來、四種鍵盤導航會動、Esc 會還原焦點、
 * 選一項會 emit 並關閉、`disabled` 的項目點不動。
 *
 * **不是**：真實瀏覽器的行為。除了 C86 已經記的「沒有可見性計算」之外，
 * 這裡多兩個：
 *
 *   一、面板的**位置**驗不到。`data-align` 是屬性，量得到；真正的座標由
 *       floating-ui 依版面算，而 happy-dom 沒有版面。
 *   二、`useBodyScrollLock` 補的 `padding-right` 在這裡是 `1024px`
 *       （真瀏覽器約 15px，那是捲軸寬度）。所以下面只斷言 `overflow: hidden`
 *       在不在，**不碰任何數字**。
 */

enableAutoUnmount(afterEach);

/** 掛載後讓 portal、`onMounted` 註冊、floating-ui 的非同步定位全部跑完。 */
async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const LABEL = "訂單 #1024 的操作";
const PROPS = {
  label: LABEL,
  items: [
    { value: "edit", label: "編輯" },
    { value: "duplicate", label: "複製" },
    { value: "archive", label: "封存", disabled: true },
    { value: "remove", label: "刪除", variant: "danger" },
  ],
} as const;

// HANDOFF #26：`.vue` 沒有型別檢查，`mount()` 收不了具名 props 而會挑到
// 最後一個 overload（TS2769）。轉成 `Component` 走寬鬆那條。
const Menu = UiDropdownMenu as Component;

function mountMenu(props: Record<string, unknown> = {}): ReturnType<typeof mount> {
  return mount(Menu, { props: { ...PROPS, ...props }, attachTo: document.body });
}

function triggerEl(): HTMLElement {
  const element = document.querySelector('[data-slot="dropdown-menu-trigger"]');
  expect(element, "找不到觸發器").not.toBeNull();
  return element as HTMLElement;
}

/** 展開中的面板；沒展開時是 `null`（**刻意不斷言**，有兩條在驗它不存在）。 */
function contentEl(): HTMLElement | null {
  return document.querySelector('[data-slot="dropdown-menu"]');
}

function openContent(): HTMLElement {
  const element = contentEl();
  expect(element, "選單沒有展開").not.toBeNull();
  return element as HTMLElement;
}

function itemTexts(): readonly string[] {
  return [...openContent().querySelectorAll('[role="menuitem"]')].map((item) =>
    (item.textContent ?? "").trim(),
  );
}

/** 目前焦點所在元素的文字。焦點在容器上時會是所有項目串起來的那一長串。 */
function activeText(): string {
  return (document.activeElement?.textContent ?? "").trim();
}

function activeRole(): string | null {
  return document.activeElement?.getAttribute("role") ?? null;
}

async function press(element: Element, key: string): Promise<void> {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await settle();
}

/** 從焦點所在處按鍵 —— 上游的處理器掛在內容上，靠冒泡接。 */
async function pressActive(key: string): Promise<void> {
  await press(document.activeElement ?? document.body, key);
}

/** 關著掛載，然後用鍵盤打開（`↓`）。這是「鍵盤使用者」那條路。 */
async function openByKeyboard(
  props: Record<string, unknown> = {},
): Promise<ReturnType<typeof mount>> {
  const wrapper = mountMenu(props);
  await settle();
  await press(triggerEl(), "ArrowDown");
  return wrapper;
}

describe("UiDropdownMenu", () => {
  it("⭐ 選單的名字是從觸發器接過來的", async () => {
    // 這是這個元件存在的理由。`DropdownMenuContent` 自己寫死
    // `:aria-labelledby="rootContext?.triggerId"` —— 觸發器沒有可及名稱，
    // `role="menu"` 就一起沒有，而畫面上完全看不出來。
    mountMenu({ open: true });
    await settle();
    const content = openContent();

    expect(content.getAttribute("role")).toBe("menu");

    const labelledBy = content.getAttribute("aria-labelledby");
    expect(labelledBy, "面板沒有 aria-labelledby").toBeTruthy();

    // ⚠️ 解到底，不只看屬性在不在 —— 指向一個不存在的 id 同樣是無名，
    // 而那種壞法只有解析得到頭才看得見。
    const named = document.getElementById(labelledBy as string);
    expect(named, `aria-labelledby="${labelledBy}" 指不到任何元素`).not.toBeNull();
    expect((named?.textContent ?? "").trim()).toBe(LABEL);
  });

  it("⭐ label 給空字串，名字就整個沒了 —— 上一條真的在讀它", async () => {
    // 反向：上一條若寫成「有 aria-labelledby 就算過」，這一條會綠，
    // 而那正是它該紅的地方。
    mountMenu({ open: true, label: "" });
    await settle();

    const labelledBy = openContent().getAttribute("aria-labelledby");
    const named = document.getElementById(labelledBy as string);
    expect((named?.textContent ?? "").trim()).toBe("");
  });

  it("觸發器的名字來自內容裡的 sr-only，不是 aria-label", async () => {
    // ⚠️ 差別不是風格。`aria-label` 會蓋掉內容，於是日後把觸發器改成
    // 有字的那一天，看得見的字與唸出來的字會不一致（WCAG 2.5.3）。
    // 而且名稱走內容才進得了上一條那個 `aria-labelledby`。
    mountMenu();
    await settle();
    const trigger = triggerEl();

    expect(trigger.getAttribute("aria-label"), "名字不該走 aria-label").toBeNull();
    expect((trigger.textContent ?? "").trim()).toBe(LABEL);
    expect(trigger.querySelector("span")?.getAttribute("class")).toBe("sr-only");
    // 圖示對輔具隱藏，否則名字會被唸兩次（同 `UiSelect` 的箭頭）。
    expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("項目是 menuitem，順序就是 items 的順序", async () => {
    mountMenu({ open: true });
    await settle();

    expect(itemTexts()).toEqual(["編輯", "複製", "封存", "刪除"]);
  });

  it("⭐ 用鍵盤打開 → 焦點落在第一個項目", async () => {
    await openByKeyboard();

    expect(activeRole()).toBe("menuitem");
    expect(activeText()).toBe("編輯");
  });

  it("⭐ 程式打開、而頁面最後一個輸入是滑鼠 → 焦點停在容器上", async () => {
    // E20。與下一條配對：兩條之間**只有那個輸入事件不同**。
    const wrapper = mountMenu();
    await settle();
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await settle();

    await wrapper.setProps({ open: true });
    await settle();

    expect(activeRole(), "焦點不該落在項目上").toBe("menu");
  });

  it("⭐ 同一段程式碼，只把最後一個輸入換成鍵盤 → 就會聚焦第一項", async () => {
    // E21。⚠️ 這裡送的是 `Tab`，一個與這個選單完全無關的鍵 —— 重點就是
    // 「無關」：那個旗標是 `createSharedComposable` 的整頁單例，
    // 頁面上任何地方按任何鍵都會翻它。
    const wrapper = mountMenu();
    await settle();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await settle();

    await wrapper.setProps({ open: true });
    await settle();

    expect(activeRole()).toBe("menuitem");
    expect(activeText()).toBe("編輯");
  });

  it("↓ 會跳過 disabled 的項目", async () => {
    await openByKeyboard();
    expect(activeText()).toBe("編輯");

    await pressActive("ArrowDown");
    expect(activeText()).toBe("複製");

    // 「封存」是 disabled 的，直接跳過它。
    await pressActive("ArrowDown");
    expect(activeText()).toBe("刪除");
  });

  it("End 到最後一項，Home 回第一項", async () => {
    await openByKeyboard();

    await pressActive("End");
    expect(activeText()).toBe("刪除");

    await pressActive("Home");
    expect(activeText()).toBe("編輯");
  });

  it("到底了不會繞回去", async () => {
    // 上游的 `loop` 預設 false，這裡沒有打開它。記下來是因為
    // 「到底要不要繞」兩種都有人做，而不寫的話下一個人會以為是漏的。
    await openByKeyboard();

    await pressActive("End");
    await pressActive("ArrowDown");
    expect(activeText(), "最後一項再按 ↓ 不該回到第一項").toBe("刪除");

    await pressActive("Home");
    await pressActive("ArrowUp");
    expect(activeText(), "第一項再按 ↑ 不該跳到最後一項").toBe("編輯");
  });

  it("首字母跳轉", async () => {
    await openByKeyboard();
    expect(activeText()).toBe("編輯");

    await pressActive("複");
    expect(activeText()).toBe("複製");
  });

  it("⚠️ 首字母的緩衝區是連續的 —— 一秒內的第二個鍵會接在後面", async () => {
    // 不是 bug，是上游的 `refAutoReset('', 1000)`：打「刪」再打「複」，
    // 搜尋字串是「刪複」而不是「複」，沒有項目符合所以焦點不動。
    //
    // ⚠️ 這一條在這裡的作用是**防止上一條被誤讀**：上一條綠不代表
    // 「每按一個字都會跳到那個字」。第一版的實驗就是這樣誤判的。
    await openByKeyboard();

    await pressActive("刪");
    expect(activeText()).toBe("刪除");

    await pressActive("複");
    expect(activeText(), "緩衝區是「刪複」，不該跳到複製").toBe("刪除");
  });

  it("Esc 關閉，而且焦點還給觸發器", async () => {
    await openByKeyboard();
    const trigger = triggerEl();

    await pressActive("Escape");

    expect(contentEl(), "Esc 之後面板該消失").toBeNull();
    expect(document.activeElement, "焦點該回到觸發器").toBe(trigger);
  });

  it("選一項會 emit 它的 value，而且選單同時關掉", async () => {
    const wrapper = mountMenu({ open: true });
    await settle();
    const items = [...openContent().querySelectorAll('[role="menuitem"]')];

    (items[1] as HTMLElement).click();
    await settle();

    // ⚠️ emit 的是 `value` 不是 `label` —— 顯示文字會被翻譯，動作代號不會。
    expect(wrapper.emitted("select")).toEqual([["duplicate"]]);
    expect(contentEl(), "選完之後選單該關（上游語意，見元件檔頭）").toBeNull();
  });

  it("⭐ emit 的那一刻選單還開著 —— 它在下一個 tick 才關", async () => {
    // ⚠️ 這一條擋的是元件檔頭的一句話。第一版寫的是「收到的時候選單已經
    // 關了」，實測相反：上游是 `emits('select')` → `await nextTick()` →
    // `onClose()`。差一個 tick，而後果很實際 —— 在處理器裡同步寫
    // `open = true` 會被那個 `onClose()` 安靜地蓋掉。
    //
    // ⚠️ **`settle()` 之後看不到這件事**（那時已經關了），所以探針必須在
    // 處理器**裡面**。同一個錯在 `UiAlertDialog` 的 `confirm` 上也犯過。
    const openWhenEmitted: boolean[] = [];
    mount(Menu, {
      props: {
        ...PROPS,
        open: true,
        onSelect: () => {
          openWhenEmitted.push(contentEl() !== null);
        },
      },
      attachTo: document.body,
    });
    await settle();

    (openContent().querySelectorAll('[role="menuitem"]')[0] as HTMLElement).click();
    expect(openWhenEmitted, "處理器根本沒被呼叫").toEqual([true]);

    await settle();
    expect(contentEl(), "一個 tick 之後才該關").toBeNull();
  });

  it("disabled 的項目點不動 —— 不 emit 也不關", async () => {
    const wrapper = mountMenu({ open: true });
    await settle();
    const items = [...openContent().querySelectorAll('[role="menuitem"]')];

    expect(items[2]?.getAttribute("aria-disabled")).toBe("true");
    (items[2] as HTMLElement).click();
    await settle();

    expect(wrapper.emitted("select")).toBeUndefined();
    expect(contentEl(), "點不動的項目不該把選單關掉").not.toBeNull();
  });

  it("danger 那一項疊上紅色那一格，其他項目沒有", async () => {
    // ⚠️ 對照組寫法，不比對完整 class 字串（同 C86 對 `confirmVariant`）：
    // 比字串的話，改配色的那天這條會紅，而它守的不是配色，
    // 是「`variant: 'danger'` 有沒有真的接到那一格」。
    mountMenu({ open: true });
    await settle();
    const items = [...openContent().querySelectorAll('[role="menuitem"]')];
    const classOf = (index: number): string => items[index]?.getAttribute("class") ?? "";

    expect(classOf(3)).not.toBe(classOf(0));
    // 而且是**疊加**不是取代：`item` 那一格的東西必須還在。
    expect(classOf(3)).toContain("rounded-control");
    expect(classOf(0)).toContain("rounded-control");
  });

  it("align 預設是 end，傳 start 會傳到面板上", async () => {
    const wrapper = mountMenu({ open: true });
    await settle();
    expect(openContent().getAttribute("data-align")).toBe("end");
    wrapper.unmount();

    mountMenu({ open: true, align: "start" });
    await settle();
    expect(openContent().getAttribute("data-align")).toBe("start");
  });

  it("open 是 false 時面板整個不存在", async () => {
    mountMenu();
    await settle();

    expect(contentEl()).toBeNull();
    // 觸發器還在 —— 不然上一句會是恆真的（整個元件沒掛也會過）。
    expect(triggerEl().getAttribute("aria-expanded")).toBe("false");
  });

  it("模板註解不會進 DOM 產物", async () => {
    // C85 的原始碼絆線擋「有人寫進模板」，這一條驗**產物**；這個元件包在
    // portal 裡，SSR 那一側驗不到（C86）。判定方式與 C86 那條相同。
    mountMenu({ open: true });
    await settle();

    const authored = [...openContent().innerHTML.matchAll(/<!--([\s\S]*?)-->/g)]
      .map((match) => (match[1] ?? "").trim())
      .filter((body) => !/^(\[|\]|v-if|teleport|\.)/.test(body) && body !== "");

    expect(authored).toEqual([]);
  });

  it("它是 modal 的：頁面捲不動，而且選單以外被 aria-hidden", async () => {
    // 上游預設 `modal: true`，這裡沒有改。⚠️ 只斷言「有沒有」，不斷言數字 ——
    // happy-dom 補的 `padding-right` 是 1024px（真瀏覽器約 15px）。
    const outside = document.createElement("div");
    outside.id = "外面的內容";
    document.body.append(outside);

    mountMenu({ open: true });
    await settle();

    expect(document.body.getAttribute("style") ?? "").toContain("overflow: hidden");
    expect(document.getElementById("外面的內容")?.getAttribute("aria-hidden")).toBe("true");

    outside.remove();
  });
});

/**
 * ⚠️ 恆真保護：上面每一條都建立在兩個 `data-slot` 選擇器上。打錯其中一個，
 * `openContent()` 會丟例外（那是好的），但 `contentEl()` 的那幾條
 * 「該是 null」會**安靜地全綠**。這一組獨立確認選擇器是對的。
 */
describe("★ 探針本身", () => {
  it("觸發器與面板是兩個不同的元素，而且各只有一個", async () => {
    mountMenu({ open: true });
    await settle();

    expect(document.querySelectorAll('[data-slot="dropdown-menu-trigger"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="dropdown-menu"]')).toHaveLength(1);
    expect(triggerEl()).not.toBe(openContent());
  });

  it("項目數與傳進去的一樣多 —— 否則導航那幾條是在空清單上跑", async () => {
    mountMenu({ open: true });
    await settle();

    expect(itemTexts()).toHaveLength(PROPS.items.length);
  });
});
