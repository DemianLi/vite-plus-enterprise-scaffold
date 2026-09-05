import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sandbox } from "@org/gate-kit/testing";
import { describe, expect, it } from "vitest";

import { missingViews, type Program } from "../src/programs.ts";
import { parseOutput, runVueTsc, type RunResult } from "../src/run.ts";

/**
 * 反向測試：每一條都先讓 fixture 壞掉，再證明這支工具會說話。
 *
 * ⚠️ **不要把這裡的「不得紅」讀成「不重要」。** `#不存在的slot` 那一條是
 * 刻意記下來的**能力邊界**：`@vue/language-core` 沒有 unknown slot 這個旋鈕，
 * 所以它永遠不會紅。寫成測試，是為了哪天升級後它突然會紅時有人知道 ——
 * 那不是壞消息，是可以把 C68 那段「抓不到什麼」改掉的訊號。
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURE = "tools/vue-typecheck/tests/fixtures/app";
const BIN = join(HERE, "../node_modules/vue-tsc/bin/vue-tsc.js");

/**
 * ⚠️ **每一條會跑 vue-tsc 的測試都要自己帶 timeout。**
 *
 * vitest 預設 5 秒，而一次 `runVueTsc` 是建一份完整的 TS program ——
 * 本機約 2 秒，CI runner 上超過 5 秒。第一版沒帶，於是**本機全綠、CI 六條紅**。
 *
 * 不改成全域設定的理由：那要在本 package 多一份 `vite.config.ts`，
 * 而「退出面收斂在兩個設定檔」是 README 寫在外面的不變式。
 * 慢的是這幾條，代價就寫在這幾條旁邊。
 */
const SPAWNS_VUE_TSC = 120_000;

/**
 * 副本放在 `fixtures/` 底下而不是 `os.tmpdir()`（`within`）—— `vue-tsc` 要解析
 * `vue`，而 `.npmrc` 是 `node-linker=isolated`，repo 外面往上找不到本 package 的
 * `node_modules`。理由完整寫在 `fixtures/README.md`。
 */
function copy(): string {
  const box = sandbox({ within: join(HERE, "fixtures"), prefix: ".tmp-", copy: [FIXTURE] });
  return join(box.root, FIXTURE);
}

function edit(root: string, file: string, from: string, to: string): void {
  const path = join(root, "src", file);
  const before = readFileSync(path, "utf8");
  if (!before.includes(from))
    throw new Error(`${file} 裡找不到 ${JSON.stringify(from)} —— 改壞的方式過期了`);
  writeFileSync(path, before.replace(from, to));
}

function check(root: string): RunResult {
  return runVueTsc(BIN, root, "tsconfig.json");
}

/** 只看訊息，不看行號 —— 行號會隨 fixture 一起漂。 */
function messages(result: RunResult): string {
  return result.diagnostics.map((d) => `${d.code}: ${d.text}`).join("\n");
}

describe("基準：fixture 本身是乾淨的", () => {
  it(
    "★ 沒有任何診斷 —— 後面每一條「會紅」才有意義",
    () => {
      const result = check(copy());
      expect(messages(result)).toBe("");
      expect(result.status).toBe(0);
    },
    SPAWNS_VUE_TSC,
  );

  it(
    "★ 兩個 .vue 真的進了 program —— 「零錯誤」與「什麼都沒看」長得一樣",
    () => {
      const result = check(copy());
      const views = result.files
        .filter((file) => file.endsWith(".vue"))
        .map((file) => basename(file))
        .sort((a, b) => a.localeCompare(b));
      expect(views).toEqual(["Child.vue", "Parent.vue"]);
    },
    SPAWNS_VUE_TSC,
  );
});

describe("SFC 內部：vp check 完全看不到的那一半", () => {
  it(
    "🔴 <script setup> 裡的型別錯誤",
    () => {
      const root = copy();
      edit(
        root,
        "Child.vue",
        "import type { VNode }",
        'const broken: number = "顯然是字串";\nvoid broken;\nimport type { VNode }',
      );
      expect(messages(check(root))).toContain("TS2322");
    },
    SPAWNS_VUE_TSC,
  );

  it(
    "🔴 <template> 運算式的型別錯誤",
    () => {
      const root = copy();
      edit(root, "Child.vue", "{{ label }}", "{{ label.notAMethod() }}");
      expect(messages(check(root))).toContain("'notAMethod' does not exist");
    },
    SPAWNS_VUE_TSC,
  );
});

/**
 * ⚠️ **這一組是這道閘門唯一「別人完全做不到」的能力，不要當成錦上添花。**
 *
 * `.ts` 檔消費 `.vue` 時，`vp check` 看的是 `declare module "*.vue"` 那個
 * 萬用宣告（props ＝ `Record<string, unknown>`，任何 prop 都合法），
 * 而 vue-tsc 解析真的 SFC。實測在 repo 本體上：
 *
 *     h(UiButton, { variant: "根本不是 variant" })
 *     vp check → 0 errors ／ 這道閘門 → 紅
 *
 * 落地當天把這件事寫成「分歧風險，升級時要重跑比對」——**方向寫反了**。
 * 分歧存在，而且多半是真陽性。紅燈訊息因此必須自己講清楚，
 * 否則第一個撞到的人會以為工具在吵架然後把閘門關掉（C41）。
 *
 * ⚠️ 但這一格**不是全知的**：型別**不符**會紅，**多一個不存在的 prop 不會** ——
 * `h()` 的 props 型別是 `Props & VNodeProps & AllowedComponentProps &
 * ComponentCustomProps` 的交集，多餘屬性檢查被那個交集打掉。
 * 與模板側 `checkUnknownProps` 是同一件事的兩個位置，而兩邊都沒開／沒有。
 */
describe(".ts 消費 .vue：vp check 的盲區", () => {
  it(
    "🔴 prop 型別不符（h() 呼叫）—— 同一行在 vp check 底下是 0 errors",
    () => {
      const root = copy();
      edit(root, "consumer.ts", "count: 1 }", 'count: "一" }');
      expect(messages(check(root))).toContain("TS2");
    },
    SPAWNS_VUE_TSC,
  );

  it(
    "⚪ 多一個根本不存在的 prop → **不會**紅（`h()` 的 props 型別帶 Record 交集）",
    () => {
      const root = copy();
      edit(root, "consumer.ts", "count: 1 }", "count: 1, nope: true }");
      expect(messages(check(root))).toBe("");
    },
    SPAWNS_VUE_TSC,
  );

  it(
    "★ 這一類的診斷不在 .vue 上 —— 報告要分開講，不能標成「.vue 型別錯誤」",
    () => {
      const root = copy();
      edit(root, "consumer.ts", "count: 1 }", 'count: "一" }');
      const files = check(root).diagnostics.map((d) => d.file ?? "");
      expect(files.every((file) => file.endsWith(".ts"))).toBe(true);
      expect(files.some((file) => file.endsWith(".vue"))).toBe(false);
    },
    SPAWNS_VUE_TSC,
  );
});

describe('跨元件：declare module "*.vue" 沒有把它蓋掉', () => {
  it(
    "🔴 prop 型別不符",
    () => {
      const root = copy();
      edit(root, "Parent.vue", ':count="1"', ":count=\"'一'\"");
      expect(messages(check(root))).toContain("TS2322");
    },
    SPAWNS_VUE_TSC,
  );

  it(
    "🔴 少了必填的 prop",
    () => {
      const root = copy();
      edit(root, "Parent.vue", ' label="hi"', "");
      expect(messages(check(root))).toContain("TS2345");
    },
    SPAWNS_VUE_TSC,
  );

  it(
    "🔴 slot payload 的型別用錯 —— 這一條就是 #24 留下的第一個殘留",
    () => {
      const root = copy();
      edit(root, "Parent.vue", "total.toFixed(0)", "total.toUpperCase()");
      expect(messages(check(root))).toContain("'toUpperCase' does not exist on type 'number'");
    },
    SPAWNS_VUE_TSC,
  );

  it(
    "🔴 事件的參數型別不符",
    () => {
      const root = copy();
      edit(root, "Parent.vue", "function onPicked(id: string)", "function onPicked(id: number)");
      expect(messages(check(root))).not.toBe("");
    },
    SPAWNS_VUE_TSC,
  );
});

/**
 * 這個邊界的另一半由 `tools/api-surface` 補：slot 與 emit 的**宣告**與模板
 * 不一致時它會紅（C67）。兩邊合起來才完整 —— 這裡驗型別、那裡驗名單。
 */
describe("能力邊界：記下來，不是放過", () => {
  it(
    "⚪ 用一個不存在的 slot 名 → **不會**紅（language-core 沒有這個旋鈕）",
    () => {
      const root = copy();
      edit(root, "Parent.vue", "#badge=", "#nope=");
      // 用了 #nope 之後 badge 的 payload 就沒人接，所以順帶把那段運算式也拿掉。
      edit(root, "Parent.vue", "{{ total.toFixed(0) }}", "x");
      expect(messages(check(root))).toBe("");
    },
    SPAWNS_VUE_TSC,
  );
});

describe("工具自己不准安靜地什麼都沒檢查", () => {
  it("★ 該看的 .vue 不在檔案清單裡 → missingViews 要說出是哪一個", () => {
    const program: Program = {
      dir: "platform/ui",
      tsconfig: "platform/ui/tsconfig.json",
      views: ["platform/ui/src/components/UiButton.vue", "platform/ui/src/components/UiDialog.vue"],
    };
    const missing = missingViews("/repo", program, [
      "/repo/platform/ui/src/components/UiButton.vue",
    ]);
    expect(missing).toEqual(["platform/ui/src/components/UiDialog.vue"]);
  });

  it("★ 全部都在 → 空陣列", () => {
    const program: Program = { dir: "a", tsconfig: "a/tsconfig.json", views: ["a/X.vue"] };
    expect(missingViews("/repo", program, ["/repo/a/X.vue"])).toEqual([]);
  });

  /**
   * ★ 端對端版：把 tsconfig 的 `include` 指開，`.vue` 就真的不在 program 裡。
   *
   * 上面兩條是拿假路徑餵 `missingViews`，證明的是判斷式；這一條證明的是
   * **接線** —— vue-tsc 實際印出來的絕對路徑與 `Program.views` 的相對路徑
   * 對得上。接錯的話這道「比錯誤數重要」的守衛會恆真，而那正是它要防的事。
   */
  it(
    "★ .vue 被 tsconfig 排除在外 → 0 條錯誤，但守衛要指名是哪一個",
    () => {
      const root = copy();
      writeFileSync(
        join(root, "tsconfig.json"),
        readFileSync(join(root, "tsconfig.json"), "utf8").replace(
          '"include": ["src"]',
          '"include": ["src/env.d.ts"]',
        ),
      );
      const result = check(root);
      expect(messages(result)).toBe("");

      const program: Program = {
        dir: ".",
        tsconfig: "tsconfig.json",
        views: ["src/Child.vue", "src/Parent.vue"],
      };
      expect(missingViews(root, program, result.files)).toEqual([
        "src/Child.vue",
        "src/Parent.vue",
      ]);
    },
    SPAWNS_VUE_TSC,
  );

  it("🔴 vue-tsc 印出一行認不得的東西 → 丟例外，不是當成沒事", () => {
    expect(() => parseOutput("Something entirely unexpected")).toThrow("解析不了");
  });

  it("★ 沒有檔案位置的診斷（tsconfig 層級）也要被抓到", () => {
    const { diagnostics } = parseOutput("error TS5083: Cannot read file 'nope.json'.");
    expect(diagnostics).toEqual([
      { file: null, line: null, code: "TS5083", text: "Cannot read file 'nope.json'." },
    ]);
  });

  it("★ 縮排的續行要接回上一筆，不是變成新的一筆", () => {
    const { diagnostics } = parseOutput("a.vue(1,2): error TS2345: 第一行\n  第二行");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.text).toBe("第一行\n第二行");
  });
});
