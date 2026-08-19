import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { compile } from "tailwindcss";

import { defaultSlotValues, stripComments } from "./contract.ts";

/**
 * 無障礙的驗收（C82）。
 *
 * ── 這支測試從哪來 ──────────────────────────────────────────────────
 *
 * C81 §六 用「缺了消費端看不看得出來」那條判準掃既有元件時，在 `UiSkeleton`
 * 上抓到兩條，而那個 PR 宣告自己是純文件，所以**只記錄、不修**。這裡是修。
 *
 * ── 為什麼沒有一條是 mount 出來的 ────────────────────────────────────
 *
 * 本 package 沒有 `jsdom`／`happy-dom`／`@vue/test-utils`，整組測試都是
 * **讀原始碼文字**（見 `component-contract.test.ts` 檔頭）。要 mount 就得往
 * `release/v1` 的交付線 package 加測試依賴 —— 而這個 PR 的題目是修兩個缺陷，
 * 不是換一套測試策略。
 *
 * 代價要說清楚：**這裡證明的是「屬性寫在模板裡」，不是「瀏覽器算出來的
 * 無障礙樹長那樣」。** 前者擋得住「有人把它刪掉」，擋不住「Vue 改變
 * fallthrough 語意」。後者要真的開瀏覽器，不在本 repo 現有的閘門形狀裡。
 *
 * 產物那一條是例外：它**真的編譯**，因為那條問的正是「原始碼裡的字有沒有
 * 變成執行期的規則」——「class 寫了但被丟掉」是本 repo 栽過的坑（C77／C80），
 * 而讀原始碼的斷言對那個坑完全無感。編譯器用的是 `tailwindcss` 自己的
 * `compile()`，本 package 已經依賴它（peer ＋ dev），**沒有新增任何依賴**。
 */

const require = createRequire(import.meta.url);
const PACKAGE_ROOT = join(import.meta.dirname, "..");
const COMPONENTS_DIR = join(PACKAGE_ROOT, "src/components");

const COMPONENTS = readdirSync(COMPONENTS_DIR)
  .filter((name) => name.endsWith(".vue"))
  .map((name) => ({
    name: name.replace(/\.vue$/, ""),
    source: readFileSync(join(COMPONENTS_DIR, name), "utf8"),
  }));

/** 預設表裡帶動畫的那幾格。`animate-none` 本身是「關掉」，不是動畫。 */
function animatedSlots(source: string): readonly (readonly [string, string])[] {
  return [...defaultSlotValues(source)].filter(([, classes]) =>
    classes
      .split(/\s+/)
      .some((token) => /(^|:)animate-/.test(token) && !token.endsWith("animate-none")),
  );
}

/** Tailwind v4 的 `compile()` 要自己餵 `@import` 的內容。 */
async function buildCss(candidates: readonly string[]): Promise<string> {
  const compiler = await compile('@import "tailwindcss";', {
    base: PACKAGE_ROOT,
    loadStylesheet: async (id: string, base: string) => {
      const path =
        id === "tailwindcss" ? require.resolve("tailwindcss/index.css") : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  return compiler.build([...candidates]);
}

/**
 * 產物裡那條保護的形狀。**逐格對準真的印出來的字串**：媒體查詢、轉義過的
 * 選擇器（`.motion-reduce\:animate-none`）、以及它宣告的 `animation: none`。
 *
 * 只驗 `toContain("motion-reduce")` 的話，把 class 打成 `motion-safe:` 仍然
 * 全綠 —— 那個錯拼出來的是**反過來的**規則（只在使用者「不介意動畫」時才
 * 關掉），畫面上與正確版一模一樣。
 */
const REDUCED_MOTION_RULE =
  /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{\s*\.motion-reduce\\:animate-none\s*\{\s*animation:\s*none/;

describe("動畫必須關得掉", () => {
  it("★ 至少掃到兩個元件", () => {
    // 與 component-contract 同一條保險：目錄改名或搬走時，下面的 it.each
    // 會零次執行然後報綠。
    expect(COMPONENTS.length).toBeGreaterThanOrEqual(2);
  });

  it("★ 真的有元件在用動畫 —— 否則下面那條是恆真的", () => {
    // 這一條守的是「條文還有對象」。哪天最後一個動畫被拿掉，下面的迴圈會
    // 零次執行而全綠，而那時這條規則已經沒有在守任何東西了 —— 該讓它說話，
    // 不是安靜地留一條裝飾品在 repo 裡。
    const animated = COMPONENTS.filter(({ source }) => animatedSlots(source).length > 0);
    expect(animated.map(({ name }) => name)).not.toEqual([]);
  });

  describe.each(COMPONENTS)("$name", ({ source }) => {
    it("預設表裡每一格動畫都配了 motion-reduce:animate-none", () => {
      // 前庭障礙使用者關不掉的閃動（C81 §六 的第二條）。Tailwind v4.3.3
      // 不自帶這層保護 —— 由下面「Tailwind 不自帶保護」那條實測證明。
      for (const [slot, classes] of animatedSlots(source)) {
        expect(
          classes.split(/\s+/),
          `${slot} 有動畫卻沒有 motion-reduce:animate-none —— 那個閃動關不掉`,
        ).toContain("motion-reduce:animate-none");
      }
    });
  });
});

describe("骨架對輔具隱藏", () => {
  /**
   * ⚠️ 這一條是**具名的**，不是掃目錄的 —— 與這個檔案裡其他條文不同，
   * 理由要寫下來否則下一個人會照抄錯的那半。
   *
   * 「哪些元件是純裝飾」**推導不出來**：它不是型別、不是槽、也不是模板結構，
   * 是一個設計判斷（這個東西代表的是還不存在的內容）。硬要通用化只會寫出
   * 一條猜的規則，然後在第一個反例上被放寬。
   *
   * 所以這裡具名，而具名的代價由下面那條保險擋：檔案改名或搬走要紅，
   * 不能安靜地零執行。
   */
  const skeleton = COMPONENTS.find(({ name }) => name === "UiSkeleton");

  it("★ UiSkeleton 還在（具名條文的保險）", () => {
    expect(skeleton, "找不到 UiSkeleton.vue —— 具名條文會零執行然後全綠").toBeDefined();
  });

  it('模板上有 aria-hidden="true"', () => {
    // WAI-ARIA：aria-busy 標在**容器**上（MUST），骨架自己是要被藏起來的
    // 雜訊 —— 它沒有無障礙名稱，role="status" 會註冊一個永遠沒東西可唸的
    // live region，而且並排時是 N 個。詳見元件檔頭。
    const template = stripComments(skeleton?.source ?? "").split("<template>")[1] ?? "";
    expect(template, "UiSkeleton 模板沒有 aria-hidden —— 載入期間輔具完全靜默").toContain(
      'aria-hidden="true"',
    );
  });
});

describe("★ 產物實測：原始碼裡的那個字真的變成規則", () => {
  /**
   * ⚠️ **candidate 取自 `UiSkeleton` 的預設表，不是這裡寫死的字面值。**
   *
   * 寫死的話這條驗的只是「Tailwind 認得 `motion-reduce:` 這個 variant」——
   * 一條與本 repo 無關的上游事實，把元件裡的 class 刪光它照樣綠。
   * 從預設表取，才串得起「**元件真的寫了那個字** → 產物真的有那條規則」。
   *
   * ⚠️ 而這條**還是沒有**覆蓋最後一環：Tailwind 自己掃 `.vue` 檔把 candidate
   * 抽出來的那一步。這裡是把字串直接餵給 `compile()` 的。那一環由兩個東西
   * 守著 —— `styles.test.ts` 守 `@source` 宣告，`theme-verify` 的 fixture
   * 建置真的掃全 repo；落地時也在 `apps/console` 的產物裡實測過那條規則
   * （minify 後是 `prefers-reduced-motion:reduce`，無空格）。
   */
  const skeletonClasses = (
    defaultSlotValues(COMPONENTS.find(({ name }) => name === "UiSkeleton")?.source ?? "").get(
      "skeleton",
    ) ?? ""
  ).split(/\s+/);

  it("★ candidate 真的是從元件取來的 —— 否則下面那條與元件無關", () => {
    expect(skeletonClasses).toContain("animate-pulse");
  });

  it("motion-reduce:animate-none 產出 prefers-reduced-motion 規則", async () => {
    // C77／C80 的坑：class 寫了，執行期被丟掉。讀原始碼的斷言對它無感。
    const css = await buildCss(skeletonClasses);
    expect(css, `產物裡沒有那條保護：\n${css}`).toMatch(REDUCED_MOTION_RULE);
  });

  it("★ Tailwind 不自帶保護 —— 少了那個 class 就沒有那條規則", async () => {
    // 這一條是上面那條的另一半，也是「為什麼要自己加」的證據本身。
    // 少了它，上面那條可能是被 Tailwind 的預設樣式滿足的，而不是被我們寫的
    // class 滿足 —— 兩者在斷言上長得一模一樣。
    const css = await buildCss(["animate-pulse"]);
    expect(css).not.toMatch(/prefers-reduced-motion/);
  });

  /**
   * ⚠️ **第二組（C88）：`UiDropdownMenu` 觸發器上那個 `sr-only`。**
   *
   * 那個元件的可及名稱來自按鈕內容裡的 `<span class="sr-only">`，而
   * `sr-only` 是**模板裡寫死的一個字串**、不在任何預設表裡 ——
   * 上面 `animatedSlots` 走的那條路徑掃不到它。
   *
   * ⚠️ **這一條守的是版面，不是無障礙。** 可及名稱是文字內容、不依賴 CSS：
   * `sr-only` 編不出來的時候名字還在，壞的是「那行字會顯示在按鈕上」。
   * 把它讀成「名字的保險」是反的 —— 元件檔頭有同一段說明，而那個方向
   * 正是選 `sr-only` 而不選 `aria-label` 的第三個理由（壞得吵）。
   */
  const srOnlyCandidate = ((): string => {
    const source = COMPONENTS.find(({ name }) => name === "UiDropdownMenu")?.source ?? "";
    const template = stripComments(source).split("<template>")[1] ?? "";
    // 取的是**真的包著 `label` 的那個 span**，不是任何一個 sr-only。
    return /<span class="([^"]+)">\{\{ label \}\}<\/span>/.exec(template)?.[1] ?? "";
  })();

  it("★ candidate 真的是從元件模板取來的", () => {
    // 抓不到時 candidate 是空字串，下面那條會在空清單上跑 —— 它仍然會紅
    // （空清單編不出 `.sr-only`），但訊息會指向 Tailwind 而不是這個正則。
    expect(srOnlyCandidate).toBe("sr-only");
  });

  it("sr-only 真的編得出把文字挪出畫面的規則", async () => {
    const css = await buildCss([srOnlyCandidate]);
    expect(css, `產物裡沒有 .sr-only：\n${css}`).toMatch(/\.sr-only\s*\{/);
    // 只看選擇器在不在會被一條空規則滿足。⚠️ 而**藏起來的那一句是
    // `clip-path: inset(50%)`，不是老寫法的 `clip: rect(0,0,0,0)`**
    // （`tailwindcss@4.3.3` 實測；第一版按舊寫法斷言，紅了）。
    expect(css).toMatch(/clip-path:\s*inset\(/);
  });

  it("★ 那條規則是那個 class 帶來的，不是 base reset 自帶的", async () => {
    const css = await buildCss(["size-4"]);
    expect(css).not.toMatch(/\.sr-only\s*\{/);
  });
});

/**
 * 反向測試 —— 用人造來源證明每一條**該紅的時候會紅**。
 *
 * 只驗真實檔案的話，這一整組斷言可以被一個 `return true` 滿足而全綠
 * （與 `component-contract.test.ts` 同一條理由）。
 */
describe("🔴 每一條都要抓得到違規", () => {
  it("有動畫但沒有保護", () => {
    const component = `
const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {
  skeleton: "animate-pulse rounded-control",
};
`;
    const [[, classes]] = animatedSlots(component) as [[string, string]];
    expect(classes.split(/\s+/)).not.toContain("motion-reduce:animate-none");
  });

  it("⚠️ 檔頭註解裡的那個字串不算數", () => {
    /**
     * 這不是假想的：`UiSkeleton` 的檔頭**真的**寫著
     * `motion-reduce:animate-none`（整整一段在解釋它為什麼必須在），
     * 連被註解掉的舊值都是這條條文可能誤讀的東西。
     *
     * ⚠️ 第一版這條的理由寫的是「靠 `stripComments` 擋」。**實測推翻了它**：
     * 拿掉去註解再刪掉真的那條 class，條文照樣紅。真正的防線是
     * `defaultSlotValues` 的兩層形狀（只掃 `= { … }` 內部、要求 `key: "值"`），
     * 所以這裡驗的是**那兩層**，不是去註解 —— 條文的理由要對得上它真的在
     * 走的那條路徑。
     */
    const component = `
/**
 * 舊版長這樣：
 *   skeleton: "animate-pulse motion-reduce:animate-none",
 */
const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {
  // skeleton: "animate-pulse motion-reduce:animate-none",
  skeleton: "animate-pulse rounded-control",
};
`;
    const [[, classes]] = animatedSlots(component) as [[string, string]];
    expect(classes).not.toContain("motion-reduce");
  });

  it("⚠️ 已知破口：註解掉的舊值排在真值**後面**時會蓋掉它", () => {
    /**
     * 記錄一個**擋不住**的形狀，不是宣稱它擋得住。
     *
     * `stripComments` 認的是行首的 `*`／`//`／`/*`，而多行註解中間那幾行
     * 常常沒有前綴；剛好長成 `slot: "…"` 的話，形狀那一層也攔不到。
     *
     * ⚠️ 但**只有排在真值後面才會出事** —— 實測出來的，不是推的：
     * `defaultSlotValues` 用「後出現的為準」合併，所以
     *
     *     註解在前 → "animate-pulse rounded-control"（真值贏，條文正確地紅）
     *     註解在後 → "animate-pulse motion-reduce:animate-none"（註解贏，誤綠）
     *
     * 也就是說那個為了「不丟資料就夠」隨手定的合併規則，在這裡是**半個
     * 防線**。半個防線要寫下來是哪半個，否則下一個人動它時不知道自己在動
     * 什麼。
     *
     * 為什麼記成測試而不是修掉：要正確處理得先分辨字串與註解，那是
     * `styles.test.ts` 那支去註解器的工作量。這個破口要踩到，得先寫出一段
     * 沒有前綴的多行註解、內容剛好是一張舊表、還排在真值後面。
     * **先讓它有名字**，哪天真的踩到了，這條會直接指出是哪一層漏的。
     */
    const commentAfter = `
const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {
  skeleton: "animate-pulse rounded-control",
  /*
  skeleton: "animate-pulse motion-reduce:animate-none",
  */
};
`;
    // 現況：那一格照樣被認成「有動畫」，但它的值是**註解來的** ——
    // 於是上面那條「每一格動畫都配了保護」在這裡會通過。誤綠的路徑就是這條。
    const [[, leaked]] = animatedSlots(commentAfter) as [[string, string]];
    expect(leaked.split(/\s+/)).toContain("motion-reduce:animate-none");
    expect(defaultSlotValues(commentAfter).get("skeleton")).toContain("motion-reduce:animate-none");

    // 對照組：同一段註解移到真值前面，「後者為準」讓真值贏，條文正確地抓到違規。
    const commentBefore = `
const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {
  /*
  skeleton: "animate-pulse motion-reduce:animate-none",
  */
  skeleton: "animate-pulse rounded-control",
};
`;
    const [[, honest]] = animatedSlots(commentBefore) as [[string, string]];
    expect(honest.split(/\s+/)).not.toContain("motion-reduce:animate-none");
    expect(defaultSlotValues(commentBefore).get("skeleton")).not.toContain("motion-reduce");
  });

  it("animate-none 自己不算「有動畫」", () => {
    // 否則一格寫著 `motion-reduce:animate-none` 的表會要求自己再配一個保護。
    const component = `
const DEFAULT_PARTS: Readonly<Record<UiFakeSlot, string>> = {
  still: "animate-none rounded-control",
};
`;
    expect(animatedSlots(component)).toEqual([]);
  });

  it("模板沒有 aria-hidden", () => {
    const template =
      '<template>\n  <div data-slot="skeleton" :class="parts.skeleton" />\n</template>';
    expect(template.split("<template>")[1]).not.toContain('aria-hidden="true"');
  });

  it("aria-hidden 被寫成 false 也要抓得到", () => {
    // 實測過：Vue 對**非 class** 屬性是「使用端覆蓋」，所以 false 是真的會生效
    // 的值，不是寫錯就沒事的字。條文比對整個 `aria-hidden="true"`，不是屬性名。
    const template =
      '<template>\n  <div aria-hidden="false" :class="parts.skeleton" />\n</template>';
    expect(template.split("<template>")[1]).not.toContain('aria-hidden="true"');
  });

  it("motion-safe 不會滿足產物那條規則", async () => {
    // 打錯成 motion-safe 產出的是**反過來的**規則，畫面上看不出差別。
    const css = await buildCss(["motion-safe:animate-none"]);
    expect(css).not.toMatch(REDUCED_MOTION_RULE);
  });
});

/**
 * ── 模板裡不得留 HTML 註解（C85）─────────────────────────────────────
 *
 * `renderToString` **不移除**註解 —— 用戶端的 production build 會，SSR 不會。
 * 所以寫在 `<template>` 裡的中文論證會出現在使用 Nuxt 那類 SSR 的專案
 * **下載的 HTML 裡**。⚠️ 同 C83 的形狀：寫在原始碼裡的東西進了交付物。
 *
 * 實測（C84，`UiField` 的 SSR 產出）：
 *
 *     <input id="v-0" aria-describedby="v-1 v-2" aria-invalid="true">
 *     <!-- ⚠️ 刻意**沒有** role="alert"：錯誤透過 aria-describedby 在聚焦時… -->
 *
 * ⚠️ **這一條驗的是原始碼，不是產物。** 它擋得住「有人往模板裡寫註解」，
 * 擋不住「Vue 改變註解的處理方式」。同 `theme-verify` README 那句
 * 「綠燈的意思是配色與形狀實測可換，不是設計系統可換」：邊界要自己說出來。
 *
 * ⚠️ **而對包在 portal 裡的模板，產物那一側不是「成本高」，是「做不到」**（C86 實測）。
 * reka-ui 的 `Teleport.vue` 是 `isMounted || forceMount` 才渲染，
 * `useMounted()` 在伺服器端是 false —— `UiDialog` 在 `renderToString` 下的
 * 完整產出是 `<!--[--><!--v-if--><!--]-->`，連 `ctx.teleports` 都是 undefined。
 * 再多的 fixture 也變不出東西來。這一版寫的是「成本遠大於換到的」，
 * **那句話對渲染得出來的模板為真，對包在 `Teleport` 裡的為假**。
 *
 * ⚠️ 界線是 `Teleport` 不是「元件」：`UiSelect` 的箭頭在 `SelectTrigger` 裡、
 * `SelectPortal` **外面**，所以它的註解當年是真的洩漏到 SSR 的（C85 量過）。
 *
 * ⚠️ 產物那一側現在有兩條，各自只涵蓋一個元件：
 * `field-wiring.test.ts` 用 SSR 驗 `UiField`、`alert-dialog.test.ts` 用 DOM
 * 驗 `UiAlertDialog`（整個包在 portal 裡的元件只有後面那條路走得通）。
 * 加上這條掃全目錄的，才是完整的：兩條深、一條廣。
 *
 * ⚠️ 別跟 SSR 的 fragment 標記搞混：產物裡的 `<!--[-->` 與 `<!---->` 是 Vue
 * 自己插的，不是作者寫的。這一條讀的是**原始碼**，碰不到它們。
 */
describe("模板不留 HTML 註解", () => {
  for (const { name, source } of COMPONENTS) {
    it(`${name} 的 <template> 裡沒有註解`, () => {
      const template = /<template>([\s\S]*)<\/template>/.exec(source)?.[1];

      // ⚠️ 解析不到 <template> 就直接紅，不是跳過 —— 「沒有模板的元件」
      // 在這個 repo 不存在，而 undefined 會讓下面那條斷言恆真。
      expect(template, `${name} 解析不出 <template> 區塊`).toBeDefined();
      expect(template).not.toContain("<!--");
    });
  }
});
