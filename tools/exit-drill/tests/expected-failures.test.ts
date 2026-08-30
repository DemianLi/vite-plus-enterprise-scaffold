import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectFailures,
  EXPECTED_FAILURES,
  reconcileFailures,
  type ExpectedFailure,
  type VitestJsonReport,
} from "../src/expected-failures.ts";

const ROOT = join(import.meta.dirname, "../../..");
const WORKDIR = "/tmp/exit-drill-XXXX";

function report(files: readonly Record<string, unknown>[]): VitestJsonReport {
  return { testResults: files } as VitestJsonReport;
}

describe("collectFailures", () => {
  it("整個檔案載不起來時，帳記在檔案這一層", () => {
    const failures = collectFailures(
      report([{ name: `${WORKDIR}/app/tests/a.test.ts`, status: "failed", assertionResults: [] }]),
      WORKDIR,
    );
    expect(failures).toEqual([{ file: "app/tests/a.test.ts", test: null }]);
  });

  it("檔案載得起來時，帳記在失敗的那幾條上，通過的不算", () => {
    const failures = collectFailures(
      report([
        {
          name: `${WORKDIR}/app/tests/b.test.ts`,
          status: "failed",
          assertionResults: [
            { fullName: "群組 通過的那條", status: "passed" },
            { fullName: "群組 失敗的那條", status: "failed" },
          ],
        },
      ]),
      WORKDIR,
    );
    expect(failures).toEqual([{ file: "app/tests/b.test.ts", test: "群組 失敗的那條" }]);
  });

  it("⚠️ 有執行到測試的失敗檔案，不可以再多記一筆整檔的", () => {
    // 多記那一筆的話，同一個檔案裡**別的**測試壞掉會被整檔那一筆蓋過去 ——
    // 而整檔那一筆是登記過的，於是新的壞掉是綠的。
    const failures = collectFailures(
      report([
        {
          name: `${WORKDIR}/app/tests/c.test.ts`,
          status: "failed",
          assertionResults: [{ fullName: "群組 一條", status: "failed" }],
        },
      ]),
      WORKDIR,
    );
    expect(failures.filter((failure) => failure.test === null)).toEqual([]);
  });

  it("工作目錄帶不帶結尾斜線都要相對得出來", () => {
    const raw = report([
      { name: `${WORKDIR}/app/tests/d.test.ts`, status: "failed", assertionResults: [] },
    ]);
    expect(collectFailures(raw, `${WORKDIR}/`)).toEqual(collectFailures(raw, WORKDIR));
  });

  it("空報表就是沒有失敗", () => {
    expect(collectFailures({}, WORKDIR)).toEqual([]);
  });
});

const LEDGER: readonly ExpectedFailure[] = [
  { file: "app/tests/x.test.ts", test: null, replaced: "某物", reason: "理由" },
  { file: "app/tests/y.test.ts", test: "群組 登記過的那條", replaced: "某物", reason: "理由" },
];

describe("reconcileFailures", () => {
  it("如期失敗、一條不多一條不少 ＝ 通過", () => {
    const observed = [
      { file: "app/tests/x.test.ts", test: null },
      { file: "app/tests/y.test.ts", test: "群組 登記過的那條" },
    ];
    expect(reconcileFailures(observed, LEDGER)).toEqual([]);
  });

  it("沒登記的失敗要紅", () => {
    const observed = [
      { file: "app/tests/x.test.ts", test: null },
      { file: "app/tests/y.test.ts", test: "群組 登記過的那條" },
      { file: "app/tests/z.test.ts", test: "群組 新的那條" },
    ];
    const errors = reconcileFailures(observed, LEDGER);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("未登記的失敗");
  });

  it("⚠️ 登記過的那條**開始通過**也要紅 —— 這是與排除清單的全部差別", () => {
    // 排除清單在這一格是綠的：被排除的東西修好了，清單照樣留著替它辯護。
    const observed = [{ file: "app/tests/x.test.ts", test: null }];
    const errors = reconcileFailures(observed, LEDGER);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("帳目過期");
  });

  it("同一個檔案裡**別的**測試失敗，不會被那個檔案的登記赦免", () => {
    const observed = [
      { file: "app/tests/x.test.ts", test: null },
      { file: "app/tests/y.test.ts", test: "群組 登記過的那條" },
      { file: "app/tests/y.test.ts", test: "群組 另外那條" },
    ];
    const errors = reconcileFailures(observed, LEDGER);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("另外那條");
  });

  it("兩個方向同時發生時，兩邊都要念出來", () => {
    const observed = [{ file: "app/tests/z.test.ts", test: "群組 新的那條" }];
    expect(reconcileFailures(observed, LEDGER)).toHaveLength(3);
  });
});

/**
 * 絆線：帳目裡的每一筆，都必須指得到樹上真的存在的那一條測試。
 *
 * ⚠️ **指不到的那一筆是最壞的一種**：它永遠不會與觀測相符，所以「帳目過期」
 * 那個方向會替它叫 —— 但那要等到**每季一次**的完整演練。這條測試把同一件事
 * 提前到改到那個檔案的那一支 PR 上。
 *
 * 斷言吃的資料**從被守的對象取**（`apps/console/tests/*.ts` 的原始碼），
 * 不是另抄一份清單。
 */
describe("EXPECTED_FAILURES 指得到真的測試", () => {
  const TITLE = /\b(?:describe|it)\(\s*"((?:[^"\\]|\\.)*)"/g;

  /** 從一支測試檔的原始碼推出所有 `describe 標題` 組合。 */
  function fullNamesOf(sourcePath: string): readonly string[] {
    const source = readFileSync(join(ROOT, sourcePath), "utf8");
    const titles = [...source.matchAll(TITLE)].map((match) => match[1] ?? "");
    const [group = ""] = titles;
    return titles.slice(1).map((title) => `${group} ${title}`);
  }

  /** 演練工作目錄的 `app/` 就是 repo 的 `apps/console/`。 */
  function sourcePathOf(drillPath: string): string {
    return drillPath.replace(/^app\//, "apps/console/");
  }

  it("對照組：抽名字這件事本身是有作用的", () => {
    // 沒有這一格的話，`fullNamesOf` 回空陣列時下面那條會**因為集合是空的**
    // 而看起來很正常 —— 不，它會紅；但紅的原因會被誤讀成「帳目錯了」。
    const names = fullNamesOf("apps/console/tests/bff-routes.test.ts");
    expect(names.length).toBeGreaterThan(1);
    expect(names).toContain("apps/console 的 dev 資料端點 權限不足時是 403，不是靜靜地成功");
  });

  it("每一筆登記的測試名，在原始碼裡都找得到", () => {
    for (const entry of EXPECTED_FAILURES) {
      if (entry.test === null) continue;
      expect(fullNamesOf(sourcePathOf(entry.file)), entry.file).toContain(entry.test);
    }
  });

  it("每一筆都寫了演練替換掉的是什麼 —— 那一欄是判準，不是註解", () => {
    for (const entry of EXPECTED_FAILURES) {
      expect(entry.replaced.trim(), `${entry.file} ${entry.test ?? ""}`).not.toBe("");
      expect(entry.reason.trim(), `${entry.file} ${entry.test ?? ""}`).not.toBe("");
    }
  });

  it("⚠️ 帳目不是空的 —— 空的帳目與「全部登記過」在對帳時長得一樣", () => {
    expect(EXPECTED_FAILURES.length).toBeGreaterThan(0);
  });
});
