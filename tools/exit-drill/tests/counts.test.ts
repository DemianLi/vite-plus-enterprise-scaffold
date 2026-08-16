import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkDocumentedCounts,
  DOCUMENTS_CITING_EVIDENCE,
  findDocumentedTestCounts,
  parseTestCounts,
} from "../src/counts.ts";

/**
 * 演練成績的文件比對（見 `src/counts.ts` 的說明）。
 *
 * 這道檢查的價值等於它的**召回率**：抓不到的那一處就是會安靜過期的那一處。
 * 但誤報的代價同樣真實 —— 一道會亂叫的閘門會被加上 skip，然後永遠不會拿掉。
 * 所以兩個方向都測。
 */

const ROOT = join(import.meta.dirname, "../../..");

describe("parseTestCounts", () => {
  it("撈得到 vitest 的摘要", () => {
    const output = " Test Files  8 passed (8)\n      Tests  98 passed (98)\n";
    expect(parseTestCounts(output)).toEqual({ tests: 98, testFiles: 8 });
  });

  it("撈不到就回 null，不是回 0", () => {
    // 回 0 會讓 evidence.json 寫下「通過，0 個測試」—— 看起來很正常的假證據。
    expect(parseTestCounts("build succeeded")).toBeNull();
  });

  it("只有其中一行也算撈不到", () => {
    expect(parseTestCounts("      Tests  98 passed (98)\n")).toBeNull();
  });

  it("帶 ANSI 色碼的輸出照樣撈得到", () => {
    // 這是 vitest 經過 pipe 時**實際**吐出來的樣子 —— 它即使不是 TTY 也上色。
    // 第一版沒剝色碼，於是「輸出裡明明有那一行卻不 match」，看起來像鬧鬼。
    const esc = String.fromCharCode(27);
    const output =
      `${esc}[2m Test Files ${esc}[22m ${esc}[1m${esc}[32m8 passed${esc}[39m${esc}[22m${esc}[90m (8)${esc}[39m\n` +
      `${esc}[2m      Tests ${esc}[22m ${esc}[1m${esc}[32m98 passed${esc}[39m${esc}[22m${esc}[90m (98)${esc}[39m\n`;
    expect(parseTestCounts(output)).toEqual({ tests: 98, testFiles: 8 });
  });

  it("有失敗時不會誤把 failed 的數字當成 passed", () => {
    const output = " Test Files  1 failed | 7 passed (8)\n      Tests  3 failed | 95 passed (98)\n";
    expect(parseTestCounts(output)).toBeNull();
  });
});

describe("findDocumentedTestCounts", () => {
  it("抓得到中文寫法", () => {
    expect(findDocumentedTestCounts("上游 Vitest **98 個測試全過**、原始碼未改")).toEqual([98]);
  });

  it("抓得到英文寫法", () => {
    expect(findDocumentedTestCounts("✓ 上游 Vitest **98 tests 全過**")).toEqual([98]);
  });

  it("同一份文件裡的多處都抓得到", () => {
    // 實際情況就是這樣：2026-08-16 那次重跑，光 DECISIONS.md 一份裡就有 6 處同時變紅。
    const source = "退到上游 86 個測試全過\n上游 Vitest 98 tests 全過\n上游 86 個測試全過";
    expect(findDocumentedTestCounts(source)).toEqual([86, 98, 86]);
  });

  it("沒有「全過」尾巴的不算", () => {
    // 「這個切片有 12 個測試」之類的句子與演練無關，抓了就是誤報。
    expect(findDocumentedTestCounts("退到上游後這個切片有 12 個測試，涵蓋主要流程")).toEqual([]);
  });

  it("不相干的數字不算", () => {
    const source = "退到上游：467 個套件、121 個原生二進位、目標耗時 < 1s";
    expect(findDocumentedTestCounts(source)).toEqual([]);
  });
});

describe("findDocumentedTestCounts —— 不可以誤報的", () => {
  it("本 repo 自己的測試數不算演練成績", () => {
    // DECISIONS.md 的驗證表真的有這一列。第一版沒分辨語境，這道閘門
    // 從第一天起就對著它亂叫 —— 而它是被自己的測試抓到的。
    const source = "| `vp run -r test` | **232 tests 全過**（16 個測試檔） |";
    expect(findDocumentedTestCounts(source)).toEqual([]);
  });

  it("引用歷史錯誤值的句子不算（C36 就有一句）", () => {
    const source = "演練的成績（「86 個測試全過、耗時 4 秒」）被手抄在好幾處";
    expect(findDocumentedTestCounts(source)).toEqual([]);
  });

  it("★ 明說在講「首次實測」的句子不算 —— 那是歷史，不是現況", () => {
    // 2026-08-16 重跑（108 → 146）時逼出來的：DECISIONS 有一句記著第一次跑出
    // 什麼，把它改成新數字等於**要求改寫歷史**，而那正是 doc-facts 拒絕守
    // DECISIONS.md 的同一條理由。
    const source = "產物大小一致），首次實測時上游 Vitest **108 個測試全過**，原始碼未改";
    expect(findDocumentedTestCounts(source)).toEqual([]);
  });

  it("★ 但「上游⋯全過」少了那個標記就照樣要被咬到", () => {
    // 這一條是上面那個放寬的反向測試。少了它，「首次實測」會變成一個
    // 「不想被守就加這四個字」的萬用出口 —— 而閘門的出口一旦好用，
    // 三個月後每一句都會有那四個字。
    const source = "產物大小一致），實測時上游 Vitest **108 個測試全過**，原始碼未改";
    expect(findDocumentedTestCounts(source)).toEqual([108]);
  });
});

describe("checkDocumentedCounts", () => {
  it("對不上就報，訊息要同時給出宣稱值與證據值", () => {
    const errors = checkDocumentedCounts(
      [{ path: "HANDOFF.md", source: "退到上游 86 個測試全過" }],
      98,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("86");
    expect(errors[0]).toContain("98");
    expect(errors[0]).toContain("HANDOFF.md");
  });

  it("多處錯就全部列出，不是只報第一個", () => {
    const errors = checkDocumentedCounts(
      [
        { path: "a.md", source: "上游 86 個測試全過\n上游 86 tests 全過" },
        { path: "b.md", source: "上游 4 個測試全過" },
      ],
      98,
    );
    expect(errors).toHaveLength(3);
  });

  it("一致就放行", () => {
    expect(checkDocumentedCounts([{ path: "a.md", source: "上游 98 個測試全過" }], 98)).toEqual([]);
  });

  it("沒有引用的文件不會被當成違規", () => {
    expect(checkDocumentedCounts([{ path: "a.md", source: "完全沒提到演練" }], 98)).toEqual([]);
  });
});

const GUARDED = DOCUMENTS_CITING_EVIDENCE;

describe("真實文件與真實證據", () => {
  it("受守的文件目前引用的數字都與 evidence.json 一致", () => {
    // 拿真檔案測。只測人造字串的話，這支測試會在 CI 上一直綠，
    // 而文件早就和證據脫節了 —— 那正是這道檢查要防的東西。
    const evidence = JSON.parse(readFileSync(join(ROOT, "tools/exit-drill/evidence.json"), "utf8"));
    const documents = GUARDED.map((path) => ({
      path,
      source: readFileSync(join(ROOT, path), "utf8"),
    }));

    expect(checkDocumentedCounts(documents, evidence.tests)).toEqual([]);
  });

  it("受守的文件確實各自都有引用（否則這道檢查等於沒在看）", () => {
    for (const path of GUARDED) {
      const found = findDocumentedTestCounts(readFileSync(join(ROOT, path), "utf8"));
      expect(found.length, `${path} 沒有任何「N 個測試全過」`).toBeGreaterThan(0);
    }
  });
});
