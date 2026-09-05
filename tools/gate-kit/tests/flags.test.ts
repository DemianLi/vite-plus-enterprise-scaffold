import { describe, expect, it } from "vitest";

import { parseFlags } from "../src/flags.ts";

const PII_SPEC = { root: { kind: "value", noun: "目錄" } } as const;

describe("parseFlags —— 認得的旗標", () => {
  it("value 旗標吃下一個引數", () => {
    const parsed = parseFlags(["--root", "/tmp/x"], PII_SPEC);
    expect(parsed.ok && parsed.flags.root).toBe("/tmp/x");
  });

  it("沒給就用 fallback；沒有 fallback 就是 undefined", () => {
    const withFallback = parseFlags([], { root: { kind: "value", fallback: "/repo" } } as const);
    expect(withFallback.ok && withFallback.flags.root).toBe("/repo");

    const without = parseFlags([], PII_SPEC);
    expect(without.ok && without.flags.root).toBeUndefined();
  });

  it("boolean 旗標預設 false，出現才 true", () => {
    const spec = { update: { kind: "boolean" } } as const;

    const absent = parseFlags([], spec);
    expect(absent.ok && absent.flags.update).toBe(false);

    const present = parseFlags(["--update"], spec);
    expect(present.ok && present.flags.update).toBe(true);
  });

  /**
   * ★ 這條沒有斷言，它的斷言是**編譯得過**。
   *
   * 判別聯集的代價是每個 adapter 都要處理 `ok: false`，而「忘了處理」正是
   * 這個設計唯一的失敗模式。它不需要另外守：沒先收窄 `.ok` 就碰 `.flags`
   * 是型別錯誤，`vp check` 會擋。上面那條測試的第一版就是這樣紅的 ——
   * 我呼叫了 parseFlags 兩次，收窄沒有跨呼叫帶過去。
   */
  it("★ 沒收窄 ok 就取 flags 是型別錯誤（斷言即編譯本身）", () => {
    const parsed = parseFlags(["--root", "/tmp/x"], PII_SPEC);
    // @ts-expect-error 沒有先檢查 parsed.ok
    void parsed.flags;
    expect(parsed.ok).toBe(true);
  });

  it("非旗標的位置引數直接略過，不影響解析", () => {
    const parsed = parseFlags(["something", "--root", "/tmp/x", "trailing"], PII_SPEC);
    expect(parsed.ok && parsed.flags.root).toBe("/tmp/x");
  });

  it("★ 同一個 value 旗標給兩次 → 最後一個贏", () => {
    // `spec-report` 與 `promise-check` 的檔頭都寫著「`parseFlags` 只留最後一個」，
    // 而 C180 之前沒有東西守這句：手讀 argv 的那五支取的是**第一個**，同一個
    // argv 在同一個行程裡兩個答案（`compliance --file 壞 --file 好` 是 RC 1）。
    const parsed = parseFlags(["--root", "/first", "--root", "/last"], PII_SPEC);
    expect(parsed.ok && parsed.flags.root).toBe("/last");
  });
});

/**
 * 不認得的旗標必須紅 —— 這條是被一次真實事故逼出來的，理由完整寫在
 * `src/flags.ts` 的 docblock 與 `tools/pii-check/tests/roster.test.ts:157`。
 *
 * 搬進 gate-kit 的意義：那段措辭現在是**所有**閘門共用的，而在這裡它是一個
 * 純函式的回傳值，測得起 —— 原本它只能靠 spawnSync 起行程去比 stderr。
 */
/**
 * `list` 是 C181 加的第三種 kind。C126 §七 把它放著沒做，理由是 main 與 release/v1
 * 兩線併線時「逐字相同 → 零衝突」；兩線模型 2026-08-26 結束後那個理由不在了，
 * 而兩支 CLI 各自的收集迴圈在 C180 §五 被記成「同一段程式碼寫兩次」。
 */
describe("parseFlags —— list 旗標", () => {
  const SPEC = { spec: { kind: "list", noun: "規格檔路徑" } } as const;

  it("沒給就是空陣列，不是 undefined", () => {
    const parsed = parseFlags([], SPEC);
    expect(parsed.ok && parsed.flags.spec).toEqual([]);
  });

  it("★ 給幾次收幾個，順序照給的順序 —— 這是它與 value 唯一的差別", () => {
    const parsed = parseFlags(["--spec", "a.feature", "--spec", "b.feature"], SPEC);
    expect(parsed.ok && parsed.flags.spec).toEqual(["a.feature", "b.feature"]);
  });

  it("🔴 缺值的兩種缺法與 value 走同一條：後面沒東西、後面是另一個旗標", () => {
    const trailing = parseFlags(["--spec"], SPEC);
    expect(trailing.ok).toBe(false);
    expect(!trailing.ok && trailing.message).toContain("規格檔路徑");

    const swallowed = parseFlags(["--spec", "a.feature", "--spec", "--root"], SPEC);
    expect(swallowed.ok).toBe(false);
  });
});

describe("🔴 parseFlags —— 不認得的旗標", () => {
  it("已移除的旗標 → 不得靜靜當成一次普通執行", () => {
    const parsed = parseFlags(["--masking"], PII_SPEC);
    expect(parsed.ok, "仍然放行 —— 被拿掉的旗標又會在 CI 裡假裝成一道檢查").toBe(false);
    expect(!parsed.ok && parsed.message).toContain("--masking");
  });

  it("★ 訊息要說得出「為什麼這會紅」，不只是「不認得」", () => {
    // 讀到這條訊息的人多半正在 CI 上看紅燈。少了原因，最短的修法是把旗標
    // 加回 spec —— 那正好是錯的方向。
    const parsed = parseFlags(["--masking"], PII_SPEC);
    expect(!parsed.ok && parsed.message).toContain("綠燈");
  });

  it("★ 訊息要列出這支到底吃什麼，否則使用者只能去讀原始碼", () => {
    const parsed = parseFlags(["--nope"], PII_SPEC);
    expect(!parsed.ok && parsed.message).toContain("--root");
  });

  /**
   * ★ 空 spec 是 `theme-verify` 這種完全不讀 argv 的工具的情況。
   *
   * 「沒有旗標」很容易被實作成「什麼都放行」（`known.length === 0` 時提早
   * return），而那正好讓最不設防的那幾支繼續不設防。
   */
  it("★ 空 spec 拒絕所有旗標，而不是放行所有旗標", () => {
    const parsed = parseFlags(["--anything"], {});
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toContain("不吃任何旗標");
  });
});

describe("🔴 parseFlags —— value 旗標缺值", () => {
  it("後面沒東西 → 紅", () => {
    const parsed = parseFlags(["--root"], PII_SPEC);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toContain("目錄");
  });

  it("★ 後面接的是另一個旗標 → 紅，不得把旗標當成值吞掉", () => {
    // `--root --update` 若把 "--update" 當成路徑，掃描目標會變成一個不存在的
    // 路徑，而多數工具對此的反應是掃不到東西然後回報綠燈。
    const parsed = parseFlags(["--root", "--update"], {
      root: { kind: "value" },
      update: { kind: "boolean" },
    } as const);
    expect(parsed.ok).toBe(false);
  });
});
