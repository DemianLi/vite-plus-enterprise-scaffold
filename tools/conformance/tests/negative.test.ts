import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 一致性檢查的**反向測試**：逐一破壞一個切片，確認該紅的時候會紅、
 * 而且紅在正確的那一條規則上。
 *
 * ── 為什麼這支比看起來重要 ──────────────────────────────────────────
 *
 * `tools/conformance` 是 Tier 2 的閘門，D4／D6／D12／D14／D15 全靠它。
 * 而在這支測試存在之前，它**只證明過一件事：現況是綠的**。
 *
 * 一條寫錯的規則（比對了不存在的路徑、`fail()` 寫在到不了的分支裡）
 * 永遠是綠的，而且和真正有效的規則長得一模一樣。
 *
 * ── 偽陽性和偽陰性一樣要驗，而且更難救 ──────────────────────────────
 *
 * 下面標 ★ 的幾條驗的是**不該紅的時候不會紅**。它們比「該紅會紅」更重要：
 * 一條會誤擋的規則，第一天就會被加上例外，然後那個例外永遠不會拿掉 ——
 * 規則等於廢了，而 CI 全綠。
 *
 * 特別是 `import type`：在 `verbatimModuleSyntax` 下它會被完全抹除，
 * 借型別不算耦合。但 `import { type X }` **不一樣** —— 那個模組真的會被載入，
 * 所以必須算 value import。兩者只差一個位置，行為完全相反。
 *
 * ── 怎麼破壞：改副本，不改 repo ─────────────────────────────────────
 *
 * 前身是一支會就地竄改 `features/order/src/store.ts` 再還原的腳本。
 * 現在把切片複製到暫存目錄，用 `--root` 讓 conformance 去掃那份副本 ——
 * **repo 的原始碼一個位元組都沒被動過**，中斷了最多留一個 temp 目錄。
 *
 * 那個 `--root` 參數就是為了這件事加的（見 `src/cli.ts` 的註解）。
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const PACKAGE_DIR = resolve(HERE, "..");
const ROOT = resolve(PACKAGE_DIR, "../..");
const CLI = join(ROOT, "tools/conformance/src/cli.ts");

let sandbox: string | undefined;

afterEach(() => {
  if (sandbox !== undefined) rmSync(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

/**
 * 建一個最小 repo：**兩個**切片。
 *
 * 為什麼一定要兩個：D4 第 1 層不用正則猜「什麼是切片」，它讀 `features/`
 * 的實際內容建立事實名單（見契約裡 `SLICE_PACKAGE_PREFIX` 的註解）。
 * sandbox 裡只放 order 的話，`@org/feature-shipment` 就不在名單上，
 * 「跨切片依賴」那條**永遠測不出來** —— 而測試會顯示綠燈。
 *
 * 第一版就是只複製一片，然後在註解裡寫下這個理由、又照樣斷言它會紅。
 *
 * CODEOWNERS 一併寫好，否則每條測試都會因為「擁有權」而紅 ——
 * 那會讓「有沒有紅」變得毫無資訊量。
 */
function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "conformance-negative-"));

  for (const slice of ["order", "shipment"]) {
    cpSync(join(ROOT, "features", slice), join(dir, "features", slice), {
      recursive: true,
      // node_modules 是 symlink 農場，複製它既慢又沒有意義 ——
      // conformance 讀的是 package.json 的宣告，不解析實際安裝結果。
      filter: (src) => !src.includes("node_modules"),
    });
  }

  writeFileSync(
    join(dir, "CODEOWNERS"),
    "/features/order/ @org/team-fulfillment\n/features/shipment/ @org/team-logistics\n",
  );
  sandbox = dir;
  return dir;
}

interface Result {
  readonly red: boolean;
  readonly output: string;
}

function runConformance(root: string): Result {
  const result = spawnSync("node", [CLI, "--root", root], { cwd: ROOT, encoding: "utf8" });
  return {
    red: result.status !== 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function fileIn(root: string, relativePath: string): string {
  return join(root, "features/order", relativePath);
}

function patch(root: string, relativePath: string, from: string, to: string): void {
  const path = fileIn(root, relativePath);
  const source = readFileSync(path, "utf8");
  // 找不到要改的字串 = 這條反向測試其實什麼都沒破壞，而它會「通過」。
  // 前身用字串比對換程式碼，切片一改寫法那條就靜靜失效了。
  if (!source.includes(from)) {
    throw new Error(`[negative] 在 ${relativePath} 找不到要破壞的片段：${from}`);
  }
  writeFileSync(path, source.replace(from, to));
}

const STORE = "src/store.ts";
const VIEW = "src/views/OrderList.vue";
const STORE_ANCHOR = 'import { defineStore } from "pinia";';
const VIEW_ANCHOR = 'import { computed } from "vue";';

describe("乾淨的副本本身是綠的", () => {
  /**
   * ⚠️ 這一條必須先過，否則下面每一條都沒有意義。
   *
   * 少了它，只要 sandbox 建得不對（少複製一個檔、CODEOWNERS 沒寫），
   * 下面所有「該紅」的測試都會「成功變紅」—— 而原因是環境壞了。
   */
  it("複製出來的切片沒有破壞時通過檢查", () => {
    const root = makeSandbox();
    const result = runConformance(root);
    expect(result.red, result.output).toBe(false);
    expect(result.output).toContain("2 個切片");
  });
});

describe("D14：Pinia 只放「客戶端才是權威」的東西", () => {
  const CASES = [
    {
      what: "store 直接取數（value import ./api.ts）",
      line: 'import { fetchOrders } from "./api.ts";',
    },
    {
      what: "store 直接用 useQuery",
      line: 'import { useQuery } from "@tanstack/vue-query";',
    },
    {
      what: "store 直接用 http client",
      line: 'import { http } from "@org/http-client";',
    },
    {
      what: "多行 value import 也要抓到",
      line: 'import {\n  fetchOrders,\n  cancelOrder,\n} from "./api.ts";',
    },
    {
      // 這一條與下面的 ★ 只差一個 type 的位置，而行為完全相反：
      // `import { type X }` 在 verbatimModuleSyntax 下模組**真的被載入**。
      what: "import { type X } 算 value import",
      line: 'import { type Order } from "./api.ts";',
    },
  ];

  for (const { what, line } of CASES) {
    it(`${what} → 紅`, () => {
      const root = makeSandbox();
      patch(root, STORE, STORE_ANCHOR, `${STORE_ANCHOR}\n${line}`);

      const result = runConformance(root);
      expect(result.red, `仍然綠燈 —— 這條規則沒有牙齒\n${result.output}`).toBe(true);
      expect(result.output).toContain("store");
    });
  }

  it("★ 純 import type 不得被誤擋", () => {
    const root = makeSandbox();
    patch(root, STORE, STORE_ANCHOR, `${STORE_ANCHOR}\nimport type { Order } from "./api.ts";`);

    const result = runConformance(root);
    expect(result.red, `**誤擋** —— 這條規則會被加例外然後廢掉\n${result.output}`).toBe(false);
  });

  it("★ 多行 import type 也不得被誤擋", () => {
    const root = makeSandbox();
    patch(
      root,
      STORE,
      STORE_ANCHOR,
      `${STORE_ANCHOR}\nimport type {\n  Order,\n} from "./api.ts";`,
    );

    const result = runConformance(root);
    expect(result.red, `**誤擋**（多行）\n${result.output}`).toBe(false);
  });
});

describe("D14：view 只負責呈現", () => {
  const CASES = [
    { what: "view 直接 import 資料層", line: 'import { fetchOrders } from "../api.ts";' },
    { what: "view 直接用 useQuery", line: 'import { useQuery } from "@tanstack/vue-query";' },
  ];

  for (const { what, line } of CASES) {
    it(`${what} → 紅`, () => {
      const root = makeSandbox();
      patch(root, VIEW, VIEW_ANCHOR, `${VIEW_ANCHOR}\n${line}`);

      const result = runConformance(root);
      expect(result.red, `仍然綠燈 —— 這條規則沒有牙齒\n${result.output}`).toBe(true);
    });
  }
});

describe("D15：設計系統的兩條規則", () => {
  it("繞過 @org/ui 直接 import reka-ui → 紅", () => {
    const root = makeSandbox();
    patch(root, VIEW, VIEW_ANCHOR, `${VIEW_ANCHOR}\nimport { Primitive } from "reka-ui";`);

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("繞過設計系統");
  });

  it("根本不用 @org/ui → 紅（C41）", () => {
    const root = makeSandbox();
    // 把整個 import 拿掉，等於「這個切片自己刻 UI」。
    patch(root, VIEW, 'import { UiButton, UiDialog } from "@org/ui";\n', "");

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("設計系統採用");
  });

  it("CSP 不相容的 Splitter → 紅", () => {
    const root = makeSandbox();
    patch(root, VIEW, VIEW_ANCHOR, `${VIEW_ANCHOR}\nimport { SplitterGroup } from "reka-ui";`);

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("CSP 不相容");
  });
});

describe("D4 / D6 / D12：切片邊界與治理", () => {
  it("跨切片依賴 → 紅", () => {
    const root = makeSandbox();
    const path = join(root, "features/order/package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8")) as {
      dependencies: Record<string, string>;
    };
    pkg.dependencies["@org/feature-shipment"] = "workspace:*";
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("跨切片");
  });

  it("寫死版本（不走 catalog:）→ 紅", () => {
    const root = makeSandbox();
    const path = join(root, "features/order/package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8")) as {
      dependencies: Record<string, string>;
    };
    pkg.dependencies["vue"] = "3.5.0";
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("版本治理");
  });

  it("沒有 CODEOWNERS 條目 → 紅", () => {
    const root = makeSandbox();
    writeFileSync(join(root, "CODEOWNERS"), "# 空的\n");

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("擁有權");
  });
});

/**
 * 幽靈依賴 —— 這一組的 ★ 比「該紅」那兩條更難寫，也更重要。
 *
 * 這條規則的失敗模式**不是漏抓，是亂叫**：它掃的是每一個裸模組名，而原始碼裡
 * 「長得像 import 但不是相依」的東西比想像多得多（JSDoc 範例、測試用的樣板
 * 字串、Node 內建的裸寫法、子路徑匯入）。乾跑時光是 `tools/` 底下就噴了 20 幾條，
 * 一條都不是真的。
 *
 * 所以下面五條 ★ 各釘住一種偽陽性來源。少了它們，這道閘門會在上線第一週被
 * 加上例外，然後例外永遠不會拿掉。
 */
describe("幽靈依賴：import 了但 package.json 沒宣告", () => {
  const GHOST = 'import { cloneDeep } from "lodash-es";';

  it("切片 import 了沒宣告的套件 → 紅", () => {
    const root = makeSandbox();
    patch(root, STORE, STORE_ANCHOR, `${GHOST}\n${STORE_ANCHOR}`);

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("幽靈依賴");
    expect(result.output).toContain("lodash-es");
  });

  /**
   * ⚠️ **這一條是整組的核心。**
   *
   * 「本機跑得起來」最常見的原因就是那個套件宣告在 workspace 根目錄、被提升到
   * 共用的 `node_modules`。如果檢查把根目錄的宣告也算進來，它會在**它唯一該抓
   * 的那種情況**上回報綠燈 —— 一道剛好對自己的目標失明的閘門。
   */
  it("只宣告在 workspace 根 package.json → 仍然紅（提升正是這條規則存在的理由）", () => {
    const root = makeSandbox();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "sandbox", devDependencies: { "lodash-es": "^4.17.21" } }),
    );
    patch(root, STORE, STORE_ANCHOR, `${GHOST}\n${STORE_ANCHOR}`);

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("幽靈依賴");
  });

  /**
   * ⚠️ **CSS 的 `@import` 也是相依，只是它不長得像 import。**
   *
   * 2026-08-17 撞到的真實案例：`platform/ui/src/styles/index.css` 寫著
   * `@import "tailwindcss"`，而 `platform/ui` 沒有宣告它 —— 解析成功純粹是
   * 因為 `apps/console` 剛好有。乾跑時整個 repo 是 0 違規（四筆 `@import`
   * 三個 package 全都已宣告），所以這一組測試就是這條規則**唯一**的證據。
   */
  it("🔴 CSS 的 @import 用了沒宣告的套件 → 紅", () => {
    const root = makeSandbox();
    writeFileSync(fileIn(root, "src/styles.css"), '@import "tailwindcss";\n');

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("幽靈依賴（CSS）");
    expect(result.output).toContain("tailwindcss");
  });

  it("🔴 `@import url(...)` 與 `layer()` 尾綴也要抓到", () => {
    const root = makeSandbox();
    writeFileSync(fileIn(root, "src/styles.css"), '@import url("some-pkg/a.css") layer(base);\n');

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("some-pkg");
  });

  it("★ 相對路徑的 @import 不是相依，不得被誤擋", () => {
    const root = makeSandbox();
    writeFileSync(fileIn(root, "src/styles.css"), '@import "./other.css";\n');

    const result = runConformance(root);
    expect(result.red, result.output).toBe(false);
  });

  it("★ 註解掉的 @import 不算", () => {
    const root = makeSandbox();
    writeFileSync(fileIn(root, "src/styles.css"), '/* @import "commented-out"; */\n');

    const result = runConformance(root);
    expect(result.output).not.toContain("commented-out");
    expect(result.red, result.output).toBe(false);
  });

  /**
   * 🔴 **去註解時不准把 glob 吃掉。**
   *
   * ⚠️ 下面幾處的 `*\/` 刻意加了反斜線 —— 寫成裸的會**把這段註解自己關掉**，
   * 而症狀是 386 行之後整個檔案變成語法錯誤。講註解會被吃掉的註解自己被吃掉了。
   *
   * `@source "…/**\/*.{vue,ts}"` 裡的 `/*` 是一個**合法的 CSS 註解開頭**。
   * 天真的 `/\/\*[^]*?\*\//g` 會從那裡一路吃到**下一個真註解的 `*\/`**，
   * 把中間整段刨掉 —— 而中間那段裡有一個真的 `@import`。兩邊都不報錯，
   * 檢查看到的內容與瀏覽器看到的不是同一個東西。
   *
   * ⚠️ **這條測試的第一版不會鑑別**：當時 glob 之後沒有 `*\/`，天真版
   * 根本沒吃到東西，所以兩種實作都綠。要讓它有意義，被吃掉的那個
   * `@import` 必須是**沒宣告的套件**，而且後面要真的有一個 `*\/`。
   * 換成天真版實測會紅 —— 那才是這條存在的證據。
   */
  it("🔴 glob 裡的 /* 不是註解 —— 吃掉它會連真的 @import 一起吞了", () => {
    const root = makeSandbox();
    writeFileSync(
      fileIn(root, "src/styles.css"),
      [
        // ⚠️ 這個 glob 刻意寫成 `src/*.…` 而不是 `**/*.…`：後者的 `/**/` 是
        // **自閉合**的，天真版只吃掉那四個字元、吞不到下面那行。
        // 第一版就是那樣寫的，於是兩種實作都綠 —— 一條不會鑑別的測試。
        '@source "src/*.{vue,ts}";',
        '@import "swallowed-pkg";',
        "/* 一個真的註解，天真版會吃到這裡才停 */",
        "",
      ].join("\n"),
    );

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("swallowed-pkg");
  });

  it("★ 子路徑匯入不得被誤擋（@org/slice-kit/contract 就是 @org/slice-kit）", () => {
    const root = makeSandbox();
    patch(
      root,
      STORE,
      STORE_ANCHOR,
      `import { SOURCE_EXTENSIONS } from "@org/slice-kit/contract";\n${STORE_ANCHOR}`,
    );

    const result = runConformance(root);
    expect(result.output).not.toContain("幽靈依賴");
    expect(result.red, result.output).toBe(false);
  });

  /**
   * ★ 兩種寫法都要驗。只擋 `node:` 前綴的實作會放過裸寫的 `from "path"`，
   * 而那是完全合法的匯入 —— 那種誤報會落在每一個寫 Node 腳本的人身上。
   */
  it("★ Node 內建模組的兩種寫法都不得被誤擋", () => {
    const root = makeSandbox();
    patch(
      root,
      STORE,
      STORE_ANCHOR,
      `import { join } from "node:path";\nimport { sep } from "path";\n${STORE_ANCHOR}`,
    );

    const result = runConformance(root);
    expect(result.output).not.toContain("幽靈依賴");
  });

  /**
   * ★ 註解裡的 import 範例。這不是假想的情況：`slice-kit/src/contract.ts` 的
   * JSDoc 就用 `import { useQuery } from "@tanstack/vue-query"` 當反例，
   * 而它是乾跑時第一個亮起來的偽陽性。
   */
  it("★ 註解裡的 import 範例不得被誤擋", () => {
    const root = makeSandbox();
    patch(root, STORE, STORE_ANCHOR, `/** 範例：${GHOST} */\n// ${GHOST}\n${STORE_ANCHOR}`);

    const result = runConformance(root);
    expect(result.output).not.toContain("幽靈依賴");
    expect(result.red, result.output).toBe(false);
  });

  /**
   * ★ `tests/` 不掃，而這條把那個取捨變成可執行的斷言。
   *
   * 它同時是一份**限制聲明**：測試檔裡真正的幽靈依賴這條規則看不到。
   * 那可以接受，因為測試少一個相依會當場跑不起來，不會安靜地混到驗收那天 ——
   * 但不可以假裝它被守著。這條測試改綠為紅的那天，代表取捨被改了。
   */
  it("★ tests/ 裡把原始碼當字串資料的不得被誤擋", () => {
    const root = makeSandbox();
    writeFileSync(
      join(root, "features/order/tests/fixture.test.ts"),
      `const source = \`${GHOST}\`;\nexport { source };\n`,
    );

    const result = runConformance(root);
    expect(result.output).not.toContain("幽靈依賴");
    expect(result.red, result.output).toBe(false);
  });
});

/**
 * CI 的 action 必須以 commit SHA 釘住。
 *
 * 這一組的重點是**它是一道閘門，不是一次改動**：把現有的 16 行改成 SHA 是
 * 快照，讓它保持為真的是下面這些測試所守的那條規則。少了它，下一個人加一行
 * `uses: foo@v1`，而沒有任何東西會說話。
 */
describe("CI 的 action 必須以 commit SHA 釘住", () => {
  const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

  function writeWorkflow(root: string, body: string): void {
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github/workflows/ci.yml"),
      `name: ci\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${body}`,
    );
  }

  it("用可移動的標籤（@v7）→ 紅", () => {
    const root = makeSandbox();
    writeWorkflow(root, "      - uses: actions/checkout@v7\n");

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("action 未以 SHA 釘住");
    expect(result.output).toContain("actions/checkout@v7");
  });

  /**
   * ⚠️ 看起來很精確的版本號同樣是標籤。這一條單獨存在，是因為
   * `@v0.36.0` 讀起來像釘死了 —— 而它和 `@v3` 一樣可以被重指。
   */
  it("看起來精確的版本標籤（@v0.36.0）也要紅", () => {
    const root = makeSandbox();
    writeWorkflow(root, "      - uses: aquasecurity/trivy-action@v0.36.0\n");

    const result = runConformance(root);
    expect(result.red, result.output).toBe(true);
    expect(result.output).toContain("action 未以 SHA 釘住");
  });

  it("★ SHA 釘住的不得被誤擋（含尾隨的版本註解）", () => {
    const root = makeSandbox();
    writeWorkflow(root, `      - uses: actions/checkout@${SHA} # v7\n`);

    const result = runConformance(root);
    expect(result.output).not.toContain("action 未以 SHA 釘住");
    expect(result.red, result.output).toBe(false);
  });

  it("★ 同 repo 的相對路徑 action 不得被誤擋（它沒有版本的概念）", () => {
    const root = makeSandbox();
    writeWorkflow(root, "      - uses: ./.github/actions/setup\n");

    const result = runConformance(root);
    expect(result.output).not.toContain("action 未以 SHA 釘住");
    expect(result.red, result.output).toBe(false);
  });

  it("★ docker:// 帶 digest 的不得被誤擋", () => {
    const root = makeSandbox();
    writeWorkflow(root, `      - uses: docker://alpine@sha256:${"a".repeat(64)}\n`);

    const result = runConformance(root);
    expect(result.output).not.toContain("action 未以 SHA 釘住");
    expect(result.red, result.output).toBe(false);
  });

  /**
   * ★ 對照組的對照組：沒有 workflow 目錄時**不得**因此變紅。
   *
   * 少了這一條，一個「找不到目錄就 fail」的實作會讓上面每一條「該紅」的
   * 測試都成功變紅 —— 而原因是環境，不是規則。
   */
  it("★ 沒有 .github/workflows 時不得紅", () => {
    const root = makeSandbox();

    const result = runConformance(root);
    expect(result.output).not.toContain("action 未以 SHA 釘住");
    expect(result.red, result.output).toBe(false);
  });
});

describe("repo 本身沒有被動到", () => {
  /**
   * 這條看似多餘，但它釘住的正是搬這支測試進 repo 的**唯一理由**：
   * 前身會就地改 `features/order` 的原始碼，跑到一半被中斷 repo 就壞著。
   */
  it("跑完之後 features/order 的 store 與 view 仍是原本的內容", () => {
    const root = makeSandbox();
    patch(root, STORE, STORE_ANCHOR, `${STORE_ANCHOR}\nimport { http } from "@org/http-client";`);
    runConformance(root);

    const realStore = readFileSync(join(ROOT, "features/order/src/store.ts"), "utf8");
    expect(realStore).not.toContain('import { http } from "@org/http-client";');

    // 而且真正的 repo 仍然是綠的。
    const real = runConformance(ROOT);
    expect(real.red, real.output).toBe(false);
  });
});
