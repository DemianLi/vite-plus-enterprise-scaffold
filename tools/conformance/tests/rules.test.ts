import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
import { checkFileMode, declaredBinTargets, judgeModes } from "../src/rules/file-mode.ts";
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
/**
 * ── 這支規則剩下的十二顆存活變異，八顆等價、四顆有裁決（#157）──────────
 *
 * 下面四條 🔴 補完之後，`file-mode.ts` 的存活從 24 顆掉到 12 顆。剩下的
 * **沒有一顆是「還沒讀到」**，理由各自不同，寫在這裡以免下一批重讀同一堆：
 *
 *   - **`maxBuffer` 兩顆** —— 理由寫在 `file-mode.ts` 的那一行旁邊。一句話：
 *     ENOBUFS 之下 `status` 仍是 0 而 stdout 未截斷，所以改小它不改行為。
 *     ⚠️ **不要為那兩顆加一道 `result.error` 的檢查** —— 造不出會紅的測試。
 *   - **`trackedFiles` 的解析防禦四顆**（`line === ""`、`tab === -1`）——
 *     兩個條件**互相掩護**：`ls-files -z` 的每一列必有 tab，而空列必無 tab，
 *     所以任一條被改掉，另一條都擋下同一批輸入。要讓它們分岔，得先造出一個
 *     畸形的 git 輸出，而那支 git 是這個函式自己 spawn 的 —— 沒有那個接縫。
 *   - **`normalize(join(".", x))` 兩顆** —— 它與 `normalize(x)` 恆等。
 *     ⚠️ 而這是**量出來的不是推的**：fixture 裡 root 的 `package.json` 真的
 *     走到了 `dir === "."` 那一支（第一版 probe 沒走到，回報的是假的零）。
 *   - **訊息拼接段四顆** —— 把 `fix` 那兩段字串裡的其中一段換成空字串。
 *     `output.test.ts` 對此有明文裁決：刻意不比對訊息的字面內容，否則
 *     「有人調整了某條規則的修法說明」會變成測試紅。下面第四條因此只斷言非空，
 *     而非空**擋不住**「兩段裡少一段」。**這是裁決，不是遺漏。**
 */
describe("版控檔案模式：判定沒有 IO，兩個方向都要紅", () => {
  const bin = (...paths: string[]): ReadonlySet<string> => new Set(paths);

  it("bin 目標是 100644 → 紅", () => {
    const findings = judgeModes(
      [{ mode: "100644", path: "tools/demo/src/cli.ts" }],
      bin("tools/demo/src/cli.ts"),
    );
    expect(findings.map((f: Finding) => f.rule)).toEqual(["檔案模式"]);
  });

  // ⚠️ 反方向不是對稱的裝飾：#140 那次是 `pnpm install` **加上**可執行位。
  // 只判一個方向的話，模式在樹上散開的主要來源不會有人說話。
  it("不是 bin 目標卻是 100755 → 也紅", () => {
    const findings = judgeModes([{ mode: "100755", path: "tools/demo/src/helper.ts" }], bin());
    expect(findings.map((f: Finding) => f.rule)).toEqual(["檔案模式"]);
  });

  it("兩邊都對的時候不說話", () => {
    const findings = judgeModes(
      [
        { mode: "100755", path: "tools/demo/src/cli.ts" },
        { mode: "100644", path: "tools/demo/src/helper.ts" },
      ],
      bin("tools/demo/src/cli.ts"),
    );
    expect(findings).toEqual([]);
  });

  // symlink 與 submodule 也會出現在 ls-files -s 裡，而對它們要求 100644 是錯的。
  it("symlink 與 submodule 不判", () => {
    const findings = judgeModes(
      [
        { mode: "120000", path: "link" },
        { mode: "160000", path: "vendor/sub" },
      ],
      bin(),
    );
    expect(findings).toEqual([]);
  });

  it("bin 的字串形式與物件形式都認得（slice-gen 用的是字串）", () => {
    const dir = tree({
      "tools/a/package.json": JSON.stringify({ bin: "./bin/index.ts" }),
      "tools/b/package.json": JSON.stringify({ bin: { b: "./src/cli.ts" } }),
    });

    const targets = declaredBinTargets(dir, [
      { mode: "100644", path: "tools/a/package.json" },
      { mode: "100644", path: "tools/b/package.json" },
    ]);
    expect([...targets].sort()).toEqual(["tools/a/bin/index.ts", "tools/b/src/cli.ts"]);
  });

  /**
   * 🔴 **沒有 `bin` 欄位的 package.json —— 這棵樹裡多數 package.json 正是這個形狀。**
   *
   * 上面每一條餵進去的 package.json 都有 `bin`，所以
   * `typeof bin === "object" && bin !== null` 這一段從來沒有被一個
   * **缺欄位**的輸入走過。把它改成恆真，`Object.values(undefined)` 當場丟
   * TypeError —— **整道閘門在真實的樹上炸掉**，而判定那八條測試一條都不會紅。
   *
   * ⚠️ 三個形狀一起餵，因為它們踩的是三個不同的東西：缺欄位（`undefined`）、
   * `null`（`typeof null === "object"` 那個老坑 —— `bin !== null` 就是為它寫的，
   * 沒有這條測試那半個條件是免費的）、以及值不是字串的那種（`.filter` 存在的理由，
   * 少了它 `join()` 會拿到一個數字然後丟「path 必須是字串」）。
   *
   * ⚠️ #157 的突變測試掉出來的，一次六顆：把這一段改成恆真的三種寫法、
   * 把 `.filter` 整個拿掉、以及把 filter 的述詞改成恆真。
   */
  it("🔴 沒有 bin、bin 是 null、bin 值不是字串 —— 三種都不得炸，也不得貢獻目標", () => {
    const dir = tree({
      "no-bin/package.json": JSON.stringify({ name: "@org/no-bin" }),
      "null-bin/package.json": JSON.stringify({ name: "@org/null-bin", bin: null }),
      "num-bin/package.json": JSON.stringify({ bin: { a: 123, b: "./ok.ts" } }),
      "ok/package.json": JSON.stringify({ bin: { ok: "./src/cli.ts" } }),
    });

    const targets = declaredBinTargets(dir, [
      { mode: "100644", path: "no-bin/package.json" },
      { mode: "100644", path: "null-bin/package.json" },
      { mode: "100644", path: "num-bin/package.json" },
      { mode: "100644", path: "ok/package.json" },
    ]);

    // ⚠️ 非字串的值被濾掉，而**同一個物件裡的字串值仍然算數** ——
    // 「整份跳過」與「濾掉壞的那個」在這裡是兩種行為，前者會漏掉一支 bin。
    expect([...targets].sort()).toEqual(["num-bin/ok.ts", "ok/src/cli.ts"]);
  });

  /**
   * 🔴 **只有 `package.json` 是 bin 的宣告來源。**
   *
   * 把 `!file.path.endsWith("package.json")` 那道 continue 改成恆不成立，
   * 版控裡每一份合法 JSON 都會被當成 package.json 讀進來 —— 而 `tsconfig.json`
   * 與各種 `*.json` 測試資料都是合法 JSON。
   *
   * ⚠️ 後果的方向是**閘門變鬆**，那比變嚴難發現得多：多出來的 bin 目標讓
   * 「不是 bin 卻是 100755」那半條規則對它們閉嘴，而那半條守的正是 #140
   * 那次 `pnpm install` 弄出來的形狀。
   */
  it("🔴 合法 JSON 但不是 package.json 的檔案，不是 bin 的宣告來源", () => {
    const dir = tree({
      "other/tsconfig.json": JSON.stringify({ bin: { sneaky: "./sneaky.ts" } }),
      "ok/package.json": JSON.stringify({ bin: { ok: "./src/cli.ts" } }),
    });

    const targets = declaredBinTargets(dir, [
      { mode: "100644", path: "other/tsconfig.json" },
      { mode: "100644", path: "ok/package.json" },
    ]);

    expect([...targets]).toEqual(["ok/src/cli.ts"]);
  });

  /**
   * 🔴 **兩個方向的訊息都不得是空的，而這裡刻意不比對字面內容。**
   *
   * 上面每一條都只比對 `rule` 與 `where`，所以 `detail` 與 `fix` 兩段整個被清成
   * 空字串時它們全部照樣綠 —— 使用者拿到的是一行「[檔案模式] some/path」，
   * 然後什麼都沒有。而 `finding.ts` 的原話是 `fix` 要帶上「怎麼修 + 不修會怎樣」。
   *
   * ⚠️ 只驗非空。比對字面內容會讓「有人調整了修法說明」變成這條紅，
   * 而 `output.test.ts` 對同一件事已經有明文裁決（那裡的原話是刻意不比對）。
   */
  it("🔴 兩個方向的 detail 與 fix 都不得是空的（只驗非空，不驗字面）", () => {
    const findings = judgeModes(
      [
        { mode: "100644", path: "tools/demo/src/cli.ts" },
        { mode: "100755", path: "tools/demo/src/helper.ts" },
      ],
      bin("tools/demo/src/cli.ts"),
    );

    expect(findings).toHaveLength(2);
    for (const finding of findings) {
      expect(finding.detail, finding.where).not.toBe("");
      expect(finding.fix, finding.where).not.toBe("");
    }
  });
});

/**
 * 反向測試 —— **在一個丟得掉的 fixture repo 上翻模式，不動這個 repo 的 index。**
 *
 * ⚠️ 對真的 index 跑 `git update-index --chmod` 是不行的：翻掉與還原之間
 * 只要有一次崩潰或中斷，index 就留在髒的狀態，而下一次 `vpr gate` 會為了
 * 一個完全無關的理由紅 —— 而那正是這道閘門要治的那種「零行 diff 的變更」。
 *
 * ⚠️ 用 `cwd:` 傳工作目錄，**不要 `process.chdir()`**：runner 把
 * `pool: 'threads'` 寫死在原始碼裡，chdir 是整個 worker 共用的。
 */
describe("版控檔案模式：反向測試跑在 fixture repo 上", () => {
  const git = (cwd: string, ...args: string[]): void => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} 失敗：${result.stderr}`);
  };

  const fixture = (): string => {
    const dir = tree({
      "tools/demo/package.json": JSON.stringify({ bin: { demo: "./src/cli.ts" } }),
      "tools/demo/src/cli.ts": "#!/usr/bin/env node\\n",
    });
    git(dir, "init", "-q");
    git(dir, "add", "-A");
    return dir;
  };

  it("把 bin 目標的可執行位拿掉 → 紅", () => {
    const dir = fixture();
    git(dir, "update-index", "--chmod=-x", "tools/demo/src/cli.ts");
    expect(checkFileMode(dir).findings.map((f: Finding) => f.where)).toEqual([
      "tools/demo/src/cli.ts",
    ]);
  });

  it("補回去 → 綠（否則上面那條可能是恆紅）", () => {
    const dir = fixture();
    git(dir, "update-index", "--chmod=+x", "tools/demo/src/cli.ts");
    const { findings, examined } = checkFileMode(dir);
    expect(findings).toEqual([]);
    // ⚠️ 綠燈要附一個非零的對照，否則「零筆」與「一個檔都沒看到」長得一樣。
    expect(examined).toBe(2);
  });

  /**
   * ⚠️ **這條測試釘的是一個「守不到」，不是一個「守得到」。**
   *
   * 事實來源是 `git ls-files -s`，讀的是 **index**。**只翻工作區的模式，
   * 這道閘門看不到** —— 而 C122 第一版把這件事寫反了（宣稱突變測試跑完
   * 閘門會紅），那句話跟著 `v1.12.0` 發了出去，四個地方都寫了。
   *
   * 分不出這兩種情況的原因，就在這個檔案裡：上面三條全部用
   * `git update-index --chmod`，那動的是 index。這條補上工作區那條路徑。
   *
   * 它綠是**對的**（純本機、還沒進版控的狀態不該讓閘門紅）——
   * 而 C121 §六 的「跑完看一眼 `git diff --summary`」因此**沒有被取代**。
   * 這條測試在的理由：哪天有人把事實來源改成檔案系統，這裡會紅，
   * 而文件與程式碼的分岔會當場被看見，不是被相信。
   */
  it("★ 只翻工作區的模式 → 綠（這是限制，不是缺陷 —— C122 §七）", () => {
    const dir = fixture();
    git(dir, "update-index", "--chmod=+x", "tools/demo/src/cli.ts");
    chmodSync(join(dir, "tools/demo/src/cli.ts"), 0o644);
    expect(checkFileMode(dir).findings).toEqual([]);
  });

  // ⚠️ 「不是 git repo」必須是**丟錯**，不是回傳零筆。回傳零筆就是
  // 「量不到的東西被記成沒有問題」—— 這棵樹為那個形狀付過兩次學費。
  it("目錄不是 git repo 時丟錯，不回傳零筆", () => {
    const dir = tree({ "a.txt": "" });
    expect(() => checkFileMode(dir)).toThrow();
  });

  /**
   * 🔴 **丟出來的訊息要帶上 git 自己說的那句話。**
   *
   * 上面那條只驗「有丟」。把整段訊息換成空字串、或把 `result.stderr ?? ""`
   * 換成 `result.stderr && ""`（兩者都是 #157 掉出來的存活變異），它照樣過 ——
   * 而拿到那個錯誤的人看到的是一個**沒有原因**的失敗，然後開始猜。
   *
   * ⚠️ 不比對 git 的文字，那會把測試綁死在語系與 git 版本上。做法是**先自己
   * 跑一次同一個命令**、拿它的 stderr 當期待值 —— 斷言因此掛在被守的那個
   * 東西上，而不是掛在一句抄過來的話上。
   *
   * ⚠️ 中間那條 `expect(said).not.toBe("")` 是對照，不是裝飾：期待值自己是空的
   * 時候，最後一行會恆真，而恆真的測試與守得住的測試在報表上長得一樣。
   */
  it("🔴 丟錯時要帶上 git 自己說的話，不是一個沒有原因的失敗", () => {
    const dir = tree({ "a.txt": "" });

    const own = spawnSync("git", ["ls-files", "-s", "-z"], { cwd: dir, encoding: "utf8" });
    expect(own.status).not.toBe(0);
    const said = own.stderr.trim().split("\n")[0];
    expect(said).not.toBe("");

    expect(() => checkFileMode(dir)).toThrow(said);
  });
});

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
