import { describe, expect, it } from "vitest";

import {
  MASK_CHARACTER,
  isMasked,
  maskAll,
  maskEmail,
  maskName,
  maskNationalId,
  maskPhone,
} from "../src/index.ts";

/**
 * 隱碼函式（§11 II ⑨）。
 *
 * ── 一個隱碼函式的失敗有兩個方向，而兩個都是實的 ────────────────────
 *
 * **遮太少**：完整值漏到畫面上，規則直接沒被滿足。
 * **遮太多**：客服在列表裡認不出是誰，於是那個畫面沒有人用 ——
 * 然後有人寫一個不呼叫這些函式的版本。第二種比較不明顯，也比較常發生。
 *
 * 所以每個函式都有一條「留下來的部分要夠用」的斷言。
 *
 * ⚠️ 這支測試裡的身分證字號與電話**刻意不通過校驗** ——
 * 測試資料不得使用真個資，而這是一條約定：沒有東西會提醒你。
 *
 * ── 這支檔案剩下的六顆存活變異全部判為等價，別再讀一次（#157）────────
 *
 * 判法是差分測試 —— 把變異真的套上去，拿原版與變異版跑同一批輸入（4036 個
 * 輸入 × 6 個匯出函式）找分岔，**零分岔**。而理由是結構性的，不是「試不出來」：
 *
 *   - `keepHead` 的兩顆（`join("")` 的分隔符被換掉）：唯一的兩個呼叫端都傳
 *     `keep = 1`，而走到那兩行時陣列長度 ≤ 1 —— **分隔符不可能出現**。
 *     ⚠️ 這條等價性**依賴 `keep === 1`**：哪天有人用 `keepHead(x, 3)`，
 *     它就不再等價，而這裡不會有東西提醒你。
 *   - `maskName` 開頭那個空字串短路的兩顆：拿掉它，`"".split(/(\s+)/)` 得到
 *     一個空白段，第 74 行原樣保留它，join 回來仍然是 `""`。
 *   - `split(/(\s+)/)` → `/(\s)/` 與 → `/(\S+)/` 兩顆：第 74 行對空白段
 *     **原樣保留**，所以三種分法切出來的段落互補而 join 結果相同。
 *
 * ⚠️ **對照組成立才算數**：同一支工具餵 #145 補掉的那四顆，當場找出分岔，
 * 而且它自己找回的邊界輸入正是當初手工挑的 `@example.com` 與長度 4 的 `José`。
 * 沒有這個對照，「全部無分岔」與「工具壞了」在畫面上長得一模一樣。
 */

describe("maskName", () => {
  it("中文姓名留第一個字", () => {
    expect(maskName("林佳蓉")).toBe("林○○");
    expect(maskName("黃詩涵")).toBe("黃○○");
  });

  it("複姓也只留一個字 —— 判準是位置不是語意", () => {
    // 「歐陽」是複姓，但函式無從得知。留兩個字會在單姓上多洩漏一個字，
    // 而多洩漏比少洩漏糟。
    expect(maskName("歐陽靖")).toBe("歐○○");
  });

  it("★ 西方姓名分段處理", () => {
    expect(maskName("Aya Nakamura")).toBe("A○○ N○○○○○○○");
  });

  it("★ 空白原樣保留 —— 否則名字會黏成一團認不出結構", () => {
    // 單一字元的段落會被整個遮掉（留首字＝洩漏全部），所以是 ○ ○ ○ 而不是 A B C。
    // 我第一次寫這條時預期的是後者 —— 而那個預期是錯的：
    // 「留第一個字」對一個只有一個字的段落沒有安全的做法。
    expect(maskName("A B C")).toBe(`${MASK_CHARACTER} ${MASK_CHARACTER} ${MASK_CHARACTER}`);
    expect(maskName("Jo  Ann")).toContain("  ");
  });

  it("單字姓名整個遮掉", () => {
    expect(maskName("陳")).toBe(MASK_CHARACTER);
  });

  it("空字串不會炸", () => {
    expect(maskName("")).toBe("");
  });

  it("🔴 結果不得包含被遮掉的那些字", () => {
    expect(maskName("林佳蓉")).not.toContain("佳");
    expect(maskName("林佳蓉")).not.toContain("蓉");
  });
});

describe("字素叢集：不能用碼點拆", () => {
  it("🔴 帶結合附標的字算一個字", () => {
    // "é" 的分解形式是 e + U+0301。用 [...value] 拆會變成兩個，
    // 於是 keepHead(1) 留下一個沒有附標的 e，而長度也多算一個 ——
    // **遮罩長度透露原字串的碼點數**，留下來的那半個字還可能可讀。
    const decomposed = "José";
    expect([...decomposed]).toHaveLength(5);
    expect(maskName(decomposed)).toBe(`J${MASK_CHARACTER.repeat(3)}`);
  });

  it("emoji 不會被拆成兩半", () => {
    expect(maskName("👩‍🚀 Lin")).toBe(`${MASK_CHARACTER} L○○`);
  });
});

describe("maskEmail", () => {
  it("本地部分留首字，網域保留", () => {
    expect(maskEmail("wang@example.com")).toBe("w○○○@example.com");
  });

  it("★ 網域刻意不遮 —— 它是判斷客戶歸屬所需，本身不識別到個人", () => {
    expect(maskEmail("a.very.long.name@corp.example.com")).toContain("@corp.example.com");
  });

  it("沒有 @ 的字串當成一般字串處理，不是回原值", () => {
    expect(maskEmail("notanemail")).toBe(`n${MASK_CHARACTER.repeat(9)}`);
  });

  it("🔴 本地部分不得漏出去", () => {
    expect(maskEmail("wang@example.com")).not.toContain("ang");
  });

  /**
   * 🔴 `@` 在第一個位置 —— `at <= 0` 那條分支存在的唯一理由。
   *
   * 把它寫成 `at < 0`，本地部分就是空字串、`value.slice(at)` 把整串原樣接回去，
   * 結果是 **`@example.com` 一個字都沒遮**。而 `wang@example.com` 這種正常輸入
   * 在兩種寫法下**完全等價** —— 所以只有站在邊界上的輸入才看得見這個差別。
   *
   * ⚠️ 這條是 #136 的突變測試掉出來的（#145 其一）。刪掉它，`<=` 退化成 `<`
   * 不會有任何測試變紅。
   */
  it("🔴 `@` 在開頭時仍然要遮 —— 差一個等號就是原樣輸出", () => {
    expect(maskEmail("@example.com")).toBe(`@${MASK_CHARACTER.repeat(11)}`);
    expect(maskEmail("@example.com")).not.toContain("example");
  });
});

describe("maskPhone", () => {
  // ⚠️ 刻意用一個**不像台灣手機**的數字。理由與檔頭那條相同：一支
  // 「示範電話號碼長什麼樣」的測試資料，與一筆真的號碼在字面上沒有差別。
  // maskPhone 只看位數，換個數字不影響驗的東西。
  const FAKE_PHONE = "1234567890";

  it("留末三碼 —— 核對身分問的就是後三碼", () => {
    expect(maskPhone(FAKE_PHONE)).toBe(`${MASK_CHARACTER.repeat(7)}890`);
  });

  it("★ 留下來的三碼真的還在，否則這個函式沒有用途", () => {
    expect(maskPhone(FAKE_PHONE).endsWith("890")).toBe(true);
  });

  it("太短的整個遮掉", () => {
    expect(maskPhone("12")).toBe(MASK_CHARACTER.repeat(2));
  });
});

describe("maskNationalId", () => {
  it("留首碼與末三碼", () => {
    // 刻意用不通過校驗的值 —— 見檔頭。
    expect(maskNationalId("A100000000")).toBe(`A${MASK_CHARACTER.repeat(6)}000`);
  });

  it("🔴 中間六碼才是識別資訊，不得漏", () => {
    expect(maskNationalId("A123456780")).not.toContain("2345");
  });

  /**
   * 🔴 長度剛好 4 —— 「留首碼與末三碼」在這個長度上等於「什麼都不留給遮」。
   *
   * `length <= 4` 寫成 `length < 4` 的話，長度 4 會走下面那條：
   * 首碼 ＋ `MASK.repeat(0)` ＋ 末三碼 = **原值**。而 `A100000000` 這種正常長度
   * 在兩種寫法下等價 —— 又是只有邊界看得見。
   *
   * ⚠️ #136 掉出來的（#145 其一）。與 maskEmail 那條是同一個病：
   * 一個隱碼函式在某個長度上靜靜地什麼都不遮。
   */
  it("🔴 長度剛好 4 的整個遮掉 —— 差一個等號就是原樣輸出", () => {
    expect(maskNationalId("A123")).toBe(MASK_CHARACTER.repeat(4));
    expect(maskNationalId("A123")).not.toContain("123");
  });
});

describe("maskAll", () => {
  it("什麼都不留", () => {
    expect(maskAll("任何東西")).toBe(MASK_CHARACTER.repeat(4));
  });
});

describe("isMasked", () => {
  it("認得出遮過的字串", () => {
    expect(isMasked(maskName("林佳蓉"))).toBe(true);
    expect(isMasked("林佳蓉")).toBe(false);
  });
});

describe("全部都是不可逆的", () => {
  it("★ 沒有任何一個函式吐得出原值", () => {
    // 隱碼不是加密。需要看完整值的情境（客服核對身分）不在這一層解決 ——
    // 那是後端授權的事，前端拿不到完整值才是對的。
    const original = "林佳蓉";
    for (const mask of [maskName, maskEmail, maskPhone, maskNationalId, maskAll]) {
      expect(mask(original), mask.name).not.toBe(original);
    }
  });
});
