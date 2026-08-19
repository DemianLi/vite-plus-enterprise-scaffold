// @vitest-environment happy-dom
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { nextTick, type Component } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import UiAlertDialog from "../src/components/UiAlertDialog.vue";

/**
 * ── `UiAlertDialog`：本 package 第一支跑在 DOM 環境的測試（C86）──────────
 *
 * ⚠️ **為什麼非得是 DOM，不能像 `UiField` 那樣用 SSR。**
 *
 * `field-wiring.test.ts` 用 `renderToString` 驗接線，零新增相依。同一招在這裡
 * **一個字都驗不到**：reka-ui 的 `Teleport.vue` 是 `isMounted || forceMount`
 * 才渲染，而 `useMounted()` 在伺服器端是 false。實測 `UiDialog` 在
 * `renderToString` 下的完整產出是：
 *
 *     <!--[--><!--v-if--><!--]-->
 *
 * 連 `ctx.teleports` 都是 `undefined`。
 *
 * ⚠️ 量到的是 `DialogPortal`，而**可以推廣的理由是它們共用同一道閘**：
 * reka-ui 每個 `*Portal` 都只是 `Teleport.vue` 的薄包裝，而 `isMounted`
 * 那道判斷在 `Teleport.vue` 裡。所以精確的說法是「**包在 reka-ui 的
 * `Teleport` 裡的內容，SSR 下不渲染**」，不是「portal 元件整個是空的」——
 * `UiSelect` 的箭頭就在 `SelectTrigger` 裡、`SelectPortal` **外面**，
 * 它的 SSR 產出是有東西的（C85 量過）。
 *
 * ── 相依：加了兩個套件，供應鏈零變化 ────────────────────────────────
 *
 * `happy-dom` 與 `@vue/test-utils` **本來就在 catalog 裡**（`features/order`
 * 在用），所以這裡加的是 `pnpm-lock.yaml` 的兩行 importer，**不是兩個新套件**。
 * C84 那句「新增依賴 0」守的是供應鏈範圍，這一步沒有動到它。
 *
 * ⚠️ 環境用檔頭的 `@vitest-environment happy-dom` 限定在這一支 ——
 * 其餘五支測試維持 node 環境，不必為了這個元件全部變慢。
 *
 * ── ⚠️ 焦點保護有**兩條**路，而它們不對稱（五個實驗量出來的）────────
 *
 * `AlertDialogContent` 的 `onOpenAutoFocus` **沒有** `preventDefault()`，
 * 所以 `DialogContent` 自己的預設聚焦先跑，`nextTick` 的「聚焦取消鈕」疊在
 * 後面。兩條路因此同時存在：
 *
 *   路 1 註冊    `AlertDialogCancel` 的 `onMounted` 把自己登記給 content
 *   路 2 DOM 順序 `DialogContent` 的預設聚焦落在**第一個可聚焦元素**
 *
 * | 實驗 | 設定                        | 焦點落在 | 說明                        |
 * | ---- | --------------------------- | -------- | --------------------------- |
 * | A    | 真元件                      | 取消     | 路 1 穿得過 `as-child`＋`UiButton` |
 * | B    | **無** Cancel、取消排前面   | 取消     | 路 1 斷了，路 2 接住        |
 * | B2   | **無** Cancel、確認排前面   | **刪除** | ⚠️ 路 2 也沒了就真的沒了     |
 * | B3   | 有 Cancel、確認排 DOM 前面  | 取消     | **兩條都在時路 1 贏**       |
 * | B4   | 真元件 ＋ 槽內放一個 `<a>`  | 取消     | 槽內容**不會**破壞保護      |
 *
 * → **B2 就是模板必須把取消寫在確認前面的理由**，而那是這支測試唯一驗得到
 *   路 2 的方式（下面「取消鈕是內容裡第一個可聚焦元素」那條）。
 *
 * → **B4 推翻了元件檔頭的第一版。** 那裡本來寫著「不要在預設槽裡放可聚焦的
 *   東西，它會擋在 DOM 順序那條路前面」—— 推理是對的，實測是錯的，
 *   因為 B3 說路 1 壓過路 2。已改。**寫了論證就要去量它。**
 *
 * ── ⚠️ 綠燈的意思是什麼、不是什麼 ──────────────────────────────────
 *
 * **是**：在 happy-dom 這個 DOM 實作上，掛載之後 `document.activeElement`
 * 是取消鈕、點外面不關、Esc 會關、role 是 `alertdialog`。
 *
 * **不是**：真實瀏覽器的焦點行為。happy-dom 沒有實作 CSP、也沒有真正的
 * 排版與可見性計算（`pnpm-workspace.yaml` 對這一點有註記）—— 一個
 * `display: none` 的取消鈕在這裡照樣「聚焦得到」。要驗那一層要真瀏覽器。
 */

/**
 * ⚠️ 每一條都要自己收乾淨，而且**只能靠 `enableAutoUnmount`**。
 *
 * `attachTo: document.body` ＋ portal 的組合會把內容留在 `document.body` 上，
 * 而下面所有斷言都是 `document.querySelector` 找的 —— 不卸載的話第二條起
 * 抓到的是**上一條留下的那個**，症狀是「`emitted()` 是 undefined」這種
 * 完全指不到成因的紅（第一版就這樣紅了四條）。
 *
 * ⚠️ 而**再加一個 `afterEach(() => { document.body.innerHTML = "" })` 會全紅**：
 * `afterEach` 是後註冊的先跑，於是那一行在 Vue 卸載之前就把節點清光，
 * `removeFragment` 讀 `null.nextSibling` 直接丟例外。實測過 ——
 * 「保險起見多收一次」在這裡是把 12 條全部弄紅的那一手。
 */
enableAutoUnmount(afterEach);

/** 掛載後讓 portal、`onMounted` 註冊、`nextTick` 聚焦全部跑完。 */
async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const PROPS = {
  open: true,
  title: "刪除訂單",
  description: "訂單 #1024 會被永久刪除，這個動作無法復原。",
  confirmLabel: "刪除",
} as const;

// HANDOFF #26：`.vue` 沒有型別檢查，`h()`／`mount()` 收不了具名 props
// 而會挑到最後一個 overload（TS2769）。轉成 `Component` 走寬鬆那條 ——
// ⚠️ 代價是 props 打錯字不會被型別擋，同 `field-wiring.test.ts`。
const AlertDialog = UiAlertDialog as Component;

interface Mounted {
  readonly wrapper: ReturnType<typeof mount>;
  readonly content: Element;
}

async function open(options: Parameters<typeof mount>[1] = {}): Promise<Mounted> {
  const wrapper = mount(AlertDialog, {
    props: PROPS,
    attachTo: document.body,
    ...options,
  });
  await settle();

  const content = document.querySelector('[data-slot="alert-dialog"]');
  // ⚠️ 找不到就直接紅，不是跳過 —— 下面每一條都會在 `null` 上恆真。
  expect(content, "掛載後找不到對話框內容").not.toBeNull();
  return { wrapper, content: content as Element };
}

/** 內容裡所有按鈕的文字，順序就是 DOM 順序。 */
function buttonTexts(content: Element): readonly string[] {
  return [...content.querySelectorAll("button")].map((button) => (button.textContent ?? "").trim());
}

/** 確認鈕（`PROPS.confirmLabel` 那一顆）。 */
function confirmButton(content: Element): Element | undefined {
  return [...content.querySelectorAll("button")].find(
    (button) => (button.textContent ?? "").trim() === PROPS.confirmLabel,
  );
}

describe("UiAlertDialog", () => {
  it("role 是 alertdialog 而不是 dialog", async () => {
    const { content } = await open();
    expect(content.getAttribute("role")).toBe("alertdialog");
  });

  it("標題與說明真的被 aria 接上（不是只有畫面上有）", async () => {
    const { content } = await open();

    const labelledBy = content.getAttribute("aria-labelledby");
    const describedBy = content.getAttribute("aria-describedby");
    expect(labelledBy, "沒有 aria-labelledby").not.toBeNull();
    expect(describedBy, "沒有 aria-describedby").not.toBeNull();

    expect(document.getElementById(labelledBy as string)?.textContent?.trim()).toBe(PROPS.title);
    expect(document.getElementById(describedBy as string)?.textContent?.trim()).toBe(
      PROPS.description,
    );
  });

  it("⭐ 初始焦點落在取消鈕，不是確認鈕", async () => {
    await open();
    // 這一條是整個元件存在的理由：焦點若在「刪除」上，一個 Enter 就刪掉了。
    expect((document.activeElement?.textContent ?? "").trim()).toBe("取消");
  });

  it("⭐ 取消鈕是內容裡第一個可聚焦元素 —— 註冊那條路斷掉時的第二道防線", async () => {
    const { content } = await open();
    // 實驗 B2：把 `AlertDialogCancel` 換成普通按鈕、且確認排前面時，
    // 焦點會落在「刪除」。所以模板的順序本身就是一道防線，不是排版偏好。
    expect(buttonTexts(content)).toEqual(["取消", "刪除"]);
  });

  it("點外面不會關 —— 這正是它與 UiDialog 的差別之一", async () => {
    const { wrapper } = await open();

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await settle();

    expect(wrapper.emitted()["update:open"], "點外面竟然關了").toBeUndefined();
    expect(document.querySelector('[data-slot="alert-dialog"]')).not.toBeNull();
  });

  it("Esc 仍然會關 —— 逃生路徑沒有被一起拿掉", async () => {
    const { wrapper } = await open();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();

    expect(wrapper.emitted()["update:open"]).toEqual([[false]]);
  });

  it("按確認會 emit confirm，而且對話框同時關掉", async () => {
    const { wrapper, content } = await open();

    const confirm = [...content.querySelectorAll("button")].find(
      (button) => (button.textContent ?? "").trim() === "刪除",
    );
    confirm?.click();
    await settle();

    expect(wrapper.emitted()["confirm"]).toEqual([[]]);
    // `AlertDialogAction` 就是 `DialogClose` —— 關閉不是我們寫的，是它的語意。
    expect(wrapper.emitted()["update:open"]).toEqual([[false]]);
  });

  it("按取消會關，而且**不會** emit confirm", async () => {
    const { wrapper, content } = await open();

    const cancel = [...content.querySelectorAll("button")].find(
      (button) => (button.textContent ?? "").trim() === "取消",
    );
    cancel?.click();
    await settle();

    expect(wrapper.emitted()["confirm"], "取消竟然也送出了 confirm").toBeUndefined();
    expect(wrapper.emitted()["update:open"]).toEqual([[false]]);
  });

  it("confirmVariant 預設是 danger，不是 primary", async () => {
    // ⚠️ 不比對 `UiButton` 的實際 class 字串 —— 那會讓這支測試在
    // `UiButton` 改配色的那天紅，而它守的根本不是配色。
    // 改成**對照組**：預設掛出來的確認鈕，class 必須與明寫 `primary` 的不同。
    // union 只有兩個成員，所以「不是 primary」就等於「是 danger」。
    const first = await open();
    const byDefault = confirmButton(first.content)?.getAttribute("class");
    first.wrapper.unmount();

    const explicit = await open({ props: { ...PROPS, confirmVariant: "primary" } });
    const asPrimary = confirmButton(explicit.content)?.getAttribute("class");

    expect(byDefault, "預設的確認鈕沒有 class").toBeTruthy();
    expect(byDefault).not.toBe(asPrimary);
  });

  it("open 是 false 時什麼都不渲染", async () => {
    mount(AlertDialog, { props: { ...PROPS, open: false }, attachTo: document.body });
    await settle();

    expect(document.querySelector('[data-slot="alert-dialog"]')).toBeNull();
  });

  it("模板註解不會進 DOM 產物", async () => {
    const { content } = await open();

    // ⚠️ C85 的原始碼層絆線擋的是「有人寫進模板」，這一條驗的是**產物**。
    // 而它補的正是 C85 補不到的那一格：這個元件整個包在 portal 裡、SSR 下不渲染，
    // 所以 `field-wiring.test.ts` 那條 SSR 檢查對這個元件是空跑的。
    //
    // ⚠️ Vue 自己會插 `<!--v-if-->` 這類標記，所以比對的是「作者寫的註解」：
    // 濾掉以 `[`、`]`、`v-if`、`teleport` 開頭的那些。
    //
    // ⚠️ **這一條只看得到 content 裡面。** 變異驗過：註解放進 content → 這條
    // 與 C85 那條**都紅**；放在 content 外面（例如遮罩前面）→ **只有 C85 那條紅**。
    // 兩條的分工是實測出來的，不是設計出來的。
    const authored = [...content.innerHTML.matchAll(/<!--([\s\S]*?)-->/g)]
      .map((match) => (match[1] ?? "").trim())
      .filter((body) => !/^(\[|\]|v-if|teleport|\.)/.test(body) && body !== "");

    expect(authored).toEqual([]);
  });
});

/**
 * ⚠️ 恆真保護：上面每一條都建立在「`[data-slot="alert-dialog"]` 找得到」上。
 * `open()` 裡已經對它斷言過，但那是在同一個 helper 裡 —— 這一條獨立確認
 * 那個選擇器不是打錯字，否則整組測試會在 `null` 上安靜地全綠。
 */
describe("★ 探針本身", () => {
  it("選擇器抓得到東西，而且抓到的是同一個元素", async () => {
    const { content } = await open();

    expect(document.querySelectorAll('[data-slot="alert-dialog"]')).toHaveLength(1);
    expect(content.querySelectorAll("button")).toHaveLength(2);
  });
});
