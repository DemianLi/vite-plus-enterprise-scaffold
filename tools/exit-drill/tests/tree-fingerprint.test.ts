import { describe, expect, it } from "vitest";
import { compareFingerprint, fingerprintOf } from "../src/tree-fingerprint.ts";

const A = { path: "apps/console/src/main.ts", sha256: "aaa" };
const B = { path: "platform/ui/src/index.ts", sha256: "bbb" };

describe("fingerprintOf", () => {
  it("列舉順序不影響指紋", () => {
    // `git ls-files` 的順序不保證跨版本穩定，而指紋要能跨機器比對。
    expect(fingerprintOf([A, B]).hash).toBe(fingerprintOf([B, A]).hash);
  });

  it("檔案數就是進去的數量", () => {
    expect(fingerprintOf([A, B]).files).toBe(2);
  });

  it("任何一個檔案的內容變了，指紋就變", () => {
    expect(fingerprintOf([A, B]).hash).not.toBe(fingerprintOf([A, { ...B, sha256: "ccc" }]).hash);
  });

  it("⚠️ 路徑是身分的一部分 —— 同樣的內容換個位置也算變了", () => {
    // 只雜湊內容的話，把一個檔案改名（或搬層）在指紋上是隱形的，
    // 而演練複製的是**路徑加內容**：搬走的檔案 alias 就接不上了。
    expect(fingerprintOf([A, B]).hash).not.toBe(
      fingerprintOf([A, { ...B, path: "platform/ui/src/entry.ts" }]).hash,
    );
  });

  it("空清單算得出一個雜湊 —— 而那正是它不能被當成相符的理由", () => {
    // 這條測試在記錄一個事實，不是在要求它：空清單**有**雜湊，兩邊都算得出
    // 同一個，所以「相符」在這種情況下是保證成立的。擋它的是 compareFingerprint
    // 的 `empty` 分支（見下面那條），不是這裡。
    expect(fingerprintOf([]).files).toBe(0);
    expect(fingerprintOf([]).hash).toBe(fingerprintOf([]).hash);
  });
});

describe("compareFingerprint", () => {
  const current = fingerprintOf([A, B]);

  it("記的與算的一樣 ＝ 相符", () => {
    const verdict = compareFingerprint({ treeHash: current.hash, treeFiles: 2 }, current);
    expect(verdict.kind).toBe("match");
    expect(verdict.message).toContain("2 個檔案");
  });

  it("⚠️ 涵蓋 0 個檔案時判 empty，即使兩邊的雜湊一模一樣", () => {
    // 這是這棵樹栽過六次的那個形狀：量測台回報假的零，而零與零相符。
    const nothing = fingerprintOf([]);
    const verdict = compareFingerprint({ treeHash: nothing.hash, treeFiles: 0 }, nothing);
    expect(verdict.kind).toBe("empty");
  });

  it("舊格式（沒有 treeHash）判 unrecorded，不是 drift", () => {
    // 講成 drift 的話，第一次升級的人會以為自己弄壞了什麼。
    expect(compareFingerprint({}, current).kind).toBe("unrecorded");
    expect(compareFingerprint({ treeHash: "" }, current).kind).toBe("unrecorded");
  });

  it("對不上 ＝ drift，而檔案數變了要講出變成幾個", () => {
    const verdict = compareFingerprint({ treeHash: "別的雜湊", treeFiles: 99 }, current);
    expect(verdict.kind).toBe("drift");
    expect(verdict.message).toContain("從 99 變成 2");
  });

  it("檔案數一樣但內容不同時，要明說「數量沒變」", () => {
    // 少了這一句，人看到「涵蓋 2 個檔案」會以為它在講數量對得上。
    const verdict = compareFingerprint({ treeHash: "別的雜湊", treeFiles: 2 }, current);
    expect(verdict.kind).toBe("drift");
    expect(verdict.message).toContain("數量沒變");
  });

  it("記了雜湊卻沒記檔案數時，仍然判得出 drift", () => {
    expect(compareFingerprint({ treeHash: "別的雜湊" }, current).kind).toBe("drift");
  });
});
