import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Finding } from "../src/finding.ts";
import { checkActionPinning } from "../src/rules/action-pinning.ts";
import { checkCspIncompatibleImports } from "../src/rules/csp.ts";
import { checkSliceDependencies } from "../src/rules/dependencies.ts";
import {
  checkDesignSystemAdoption,
  checkDesignSystemBoundary,
} from "../src/rules/design-system.ts";
import { checkSliceLayering } from "../src/rules/layering.ts";
import { checkOwnership } from "../src/rules/ownership.ts";
import { checkPhantomDependencies } from "../src/rules/phantom-deps.ts";
import { checkRelativeEscapes } from "../src/rules/relative-escape.ts";
import { checkPackageName, checkSliceNaming } from "../src/rules/slice-shape.ts";

/**
 * 判定本身的測試 —— **直接 import，不起行程。**
 *
 * ── 這支與 `negative.test.ts` 的分工 ────────────────────────────────
 *
 * `negative.test.ts` 一條都沒有改，而且它仍然該過：它驗的是整支 CLI
 * 端對端的行為（弄壞一個切片副本 → 結束碼非零 → stderr 有那段字）。
 * 那種測試同時綁著判定、報告格式與結束碼，任何一個變了都紅，
 * **而紅的訊息不會告訴你是哪一個**。
 *
 * 這支驗的是判定，而且只有判定。差別具體到可以量：
 *
 *   - 一半的規則在這裡**完全不碰檔案系統** —— 它們收的是一個
 *     已經 parse 好的 `package.json` 物件（見第一個 describe）。
 *     那在 `spawnSync` 的世界裡做不到：要驗一條相依規則，得先在磁碟上
 *     擺出一整個能通過前面所有規則的切片。
 *   - 順序這種東西**測得到**。`checkSliceDependencies` 那條就是為它寫的。
 *
 * ⚠️ 斷言的是 `rule` 欄位，不是 `detail`。detail 裡有路徑與檔名，
 * 是給人看的；把它寫進斷言等於每次調整訊息措辭都要改測試，
 * 而那種測試最後會被改成 `toContain("違規")`，然後什麼都不驗。
 */

let sandbox: string | undefined;

afterEach(() => {
  if (sandbox !== undefined) rmSync(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

/** 在暫存目錄裡擺出一棵樹。回傳根目錄。 */
function tree(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), "conformance-rules-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(dir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  sandbox = dir;
  return dir;
}

function rules(findings: readonly Finding[]): string[] {
  return findings.map((f) => f.rule);
}

const SLICE = "features/order";

/** 這條規則的三個參數每次都一樣，抽掉免得每個案例重寫一次。 */
function escapes(root: string): Finding[] {
  return checkRelativeEscapes(root, join(root, "features/order"), SLICE);
}

describe("完全不碰檔案系統的規則", () => {
  it("目錄名不是 kebab-case → 紅", () => {
    expect(rules(checkSliceNaming("Order_History", SLICE))).toEqual(["命名"]);
  });

  it("★ 合法的 kebab-case 不得被誤擋", () => {
    expect(checkSliceNaming("order-history", SLICE)).toEqual([]);
  });

  it("套件名與目錄名對不上 → 紅", () => {
    const found = checkPackageName({ name: "@org/orders" }, "order", SLICE);
    expect(rules(found)).toEqual(["套件命名"]);
    // 訊息要同時講出「現在是什麼」與「應該是什麼」，否則修的人得自己去查慣例。
    expect(found[0]?.detail).toContain("@org/feature-order");
  });

  it("★ 推導得出來的套件名不得被誤擋", () => {
    expect(checkPackageName({ name: "@org/feature-order" }, "order", SLICE)).toEqual([]);
  });

  it("CODEOWNERS 沒有條目 → 紅", () => {
    expect(rules(checkOwnership("order", SLICE, ""))).toEqual(["擁有權"]);
  });

  it("★ 有條目就不紅", () => {
    const codeowners = "/features/order/ @org/team-fulfillment\n";
    expect(checkOwnership("order", SLICE, codeowners)).toEqual([]);
  });
});

describe("相依那三條共用一個迴圈，而順序是輸出的一部分", () => {
  /**
   * ⚠️ **這條測試是為了這次拆解寫的，而且它是唯一擋得住那個回歸的東西。**
   *
   * 跨切片依賴（D4）、HTTP 客戶端（D8）、版本治理（D6）三條規則跑在
   * **同一個 `Object.entries(allDeps)` 迴圈**裡，所以輸出是逐個相依排的。
   * 把它們拆成三支獨立的規則（那看起來更乾淨）會讓輸出變成逐條規則排 ——
   * 判定一條都沒錯，每一條反向測試照樣綠，而使用者看到的報告變了。
   *
   * 下面這組相依刻意讓兩種排法分岔：
   *   逐個相依 → 跨切片、版本、HTTP、版本
   *   逐條規則 → 跨切片、HTTP、版本、版本
   */
  it("同一個相依觸發的多條規則會排在一起", () => {
    const pkg = {
      dependencies: { "@org/feature-shipment": "1.0.0" },
      devDependencies: { axios: "^1.7.0" },
    };
    const found = checkSliceDependencies(pkg, "order", SLICE, new Set(["@org/feature-shipment"]));

    expect(rules(found)).toEqual(["跨切片依賴", "版本治理", "HTTP 客戶端", "版本治理"]);
  });

  it("★ catalog: 與 workspace: 不得被誤擋", () => {
    const pkg = {
      dependencies: { "@org/ui": "workspace:*", vue: "catalog:" },
    };
    expect(checkSliceDependencies(pkg, "order", SLICE, new Set())).toEqual([]);
  });

  it("★ 切片依賴自己不算跨切片依賴", () => {
    const pkg = { dependencies: { "@org/feature-order": "workspace:*" } };
    const names = new Set(["@org/feature-order"]);
    expect(checkSliceDependencies(pkg, "order", SLICE, names)).toEqual([]);
  });
});

describe("要一棵目錄樹，但仍然不用起行程", () => {
  it("相對路徑逃逸切片根目錄 → 紅", () => {
    const root = tree({
      "features/order/src/api.ts": 'import { shared } from "../../../platform/x.ts";\n',
    });
    const found = escapes(root);
    expect(rules(found)).toEqual(["相對路徑逃逸"]);
    // 訊息要指出解析後落在哪裡 —— 只說「逃逸了」的話，修的人得自己心算路徑。
    expect(found[0]?.detail).toContain("platform/x.ts");
  });

  it("★ 切片**內部**的 ../ 完全合法，不得被誤擋", () => {
    const root = tree({
      "features/order/src/views/OrderList.vue":
        '<script setup lang="ts">\nimport "../api.ts";\n</script>\n',
      "features/order/src/api.ts": "export const fetchOrders = () => [];\n",
    });
    expect(escapes(root)).toEqual([]);
  });

  it("action 用可移動的標籤 → 紅", () => {
    const root = tree({
      ".github/workflows/ci.yml": "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n",
    });
    expect(rules(checkActionPinning(root))).toEqual(["action 未以 SHA 釘住"]);
  });

  it("★ 以 SHA 釘住的不得被誤擋", () => {
    const sha = "a".repeat(40);
    const root = tree({
      ".github/workflows/ci.yml": `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha} # v7\n`,
    });
    expect(checkActionPinning(root)).toEqual([]);
  });

  it("import 了 package.json 沒宣告的套件 → 紅", () => {
    const root = tree({
      "features/order/package.json": '{ "name": "@org/feature-order" }\n',
      "features/order/src/index.ts": 'import { z } from "zod";\n',
    });
    const found = checkPhantomDependencies(root, join(root, "features/order"), SLICE);
    expect(rules(found)).toEqual(["幽靈依賴"]);
  });

  it("CSS 的 @import 也是相依 → 紅", () => {
    const root = tree({
      "platform/ui/package.json": '{ "name": "@org/ui" }\n',
      "platform/ui/src/index.css": '@import "tailwindcss";\n',
    });
    const found = checkPhantomDependencies(root, join(root, "platform/ui"), "platform/ui");
    expect(rules(found)).toEqual(["幽靈依賴（CSS）"]);
  });

  it("★ 子路徑匯入指的是同一個套件，不得被誤擋", () => {
    const root = tree({
      "features/order/package.json":
        '{ "name": "@org/feature-order", "dependencies": { "@org/slice-kit": "workspace:*" } }\n',
      "features/order/src/index.ts": 'import { REQUIRED_FILES } from "@org/slice-kit/contract";\n',
    });
    expect(checkPhantomDependencies(root, join(root, "features/order"), SLICE)).toEqual([]);
  });

  it("CSP 不相容的 Splitter → 紅", () => {
    const root = tree({
      "platform/ui/src/Layout.vue":
        '<script setup lang="ts">\nimport { SplitterGroup } from "reka-ui";\n</script>\n',
    });
    const found = checkCspIncompatibleImports(root, join(root, "platform"), "platform");
    expect(rules(found)).toEqual(["CSP 不相容的元件"]);
  });

  it("★ reka-ui 的其他元件不在禁令內，不得被誤擋", () => {
    const root = tree({
      "platform/ui/src/Dialog.vue":
        '<script setup lang="ts">\nimport { DialogRoot } from "reka-ui";\n</script>\n',
    });
    expect(checkCspIncompatibleImports(root, join(root, "platform"), "platform")).toEqual([]);
  });

  it("composable 檔名與匯出的函式名對不上 → 紅", () => {
    const root = tree({
      "features/order/src/composables/useOrderList.ts": "export function useOrders() {}\n",
    });
    expect(rules(checkSliceLayering(join(root, "features/order"), SLICE))).toEqual([
      "composable 命名",
    ]);
  });

  it("view 直接 import 資料層 → 紅", () => {
    const root = tree({
      "features/order/src/api.ts": "export const fetchOrders = () => [];\n",
      "features/order/src/views/OrderList.vue":
        '<script setup lang="ts">\nimport { fetchOrders } from "../api.ts";\n</script>\n',
    });
    expect(rules(checkSliceLayering(join(root, "features/order"), SLICE))).toEqual([
      "元件直接取數",
    ]);
  });

  it("切片自己拼設計系統基元 → 紅", () => {
    const root = tree({
      "features/order/src/ui/Button.vue":
        '<script setup lang="ts">\nimport { clsx } from "clsx";\n</script>\n',
    });
    expect(rules(checkDesignSystemBoundary(join(root, "features/order"), SLICE))).toEqual([
      "繞過設計系統",
    ]);
  });

  it("整片沒有任何一處用 @org/ui → 紅（C41）", () => {
    const root = tree({
      "features/order/src/views/OrderList.vue": "<template><h1>訂單</h1></template>\n",
    });
    expect(rules(checkDesignSystemAdoption(join(root, "features/order"), SLICE))).toEqual([
      "設計系統採用",
    ]);
  });

  /**
   * 掃不到檔案時的訊息要指對方向。
   *
   * 空清單會讓 `.some()` 回傳 false，於是訊息變成「這個切片沒用設計系統」——
   * 而真正的原因是目錄結構與 `SOURCE_EXTENSIONS` 對不上。
   */
  it("掃不到原始碼時，detail 要說的是掃不到，不是沒在用", () => {
    const root = tree({ "features/order/README.md": "# 訂單\n" });
    const found = checkDesignSystemAdoption(join(root, "features/order"), SLICE);
    expect(rules(found)).toEqual(["設計系統採用"]);
    expect(found[0]?.detail).toContain("掃不到");
  });
});

/**
 * `src/` 底下除了 `cli.ts` 以外，任何檔案都不得讀 `process.argv`、
 * 不得呼叫 `process.exit`。
 *
 * ── 為什麼這條是掃目錄而不是列清單 ──────────────────────────────────
 *
 * 這整個 issue（#53）就是「判定住在一個一被 import 就結束行程的檔案裡」。
 * 拆完之後的狀態是一個**快照**：下一個人在 `src/rules/` 新增一支規則、
 * 順手在模組頂層讀一次 `process.argv`，就把同一個坑挖回來了，
 * 而所有測試照樣全綠 —— 因為那支測試會是它自己寫的，跑在它自己的假設上。
 *
 * 與 action 釘住那條規則同一個判準：**沒有強制機制的狀態不叫控制**（C52）。
 * 清單會漏掉新檔案，掃目錄不會。
 */
describe("規則模組不得有副作用", () => {
  const SRC = resolve(fileURLToPath(import.meta.url), "../../src");

  function sources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) sources(path, found);
      else if (entry.name.endsWith(".ts")) found.push(path);
    }
    return found;
  }

  const modules = sources(SRC).filter((path) => path !== join(SRC, "cli.ts"));

  it("掃得到檔案（否則下面那條會變成恆真）", () => {
    expect(modules.length).toBeGreaterThan(5);
  });

  for (const path of modules) {
    const name = path.slice(SRC.length + 1);

    it(`${name} 不碰 process.argv／process.exit`, () => {
      // 註解裡會提到這兩個名字（它們正是這次拆解的主題），所以先剝掉註解。
      const source = readFileSync(path, "utf8")
        .replace(/\/\*[^]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");

      expect(source).not.toContain("process.argv");
      expect(source).not.toContain("process.exit");
    });
  }
});
