import { describe, expect, it } from "vitest";

import { isLuhn, isNationalId, isRealEmail, scanText } from "../src/detect.ts";
import { EXEMPT } from "../src/scan.ts";

/**
 * 偵測器的**對照組**。
 *
 * ── 這支檔案自己是違規的，而且必須是 ────────────────────────────────
 *
 * 要證明「偵測得到真的身分證字號」，就得有一個真的通過校驗的身分證字號 ——
 * 於是這支測試檔本身會被自己的掃描器抓到。它列在 `EXEMPT` 裡。
 *
 * 例外是**單一完整路徑**，不是 `tools/pii-check/tests/*`：
 * 寫成 glob 的話，日後任何一份塞進這個目錄的資料都會自動隱形。
 * 這與 `sbom-negative.test.ts` 刻意不照慣例命名是同一條規矩 ——
 * 讓豁免的範圍剛好等於「已經人工看過的那一份」。
 *
 * ── 下面這些值從哪來 ────────────────────────────────────────────────
 *
 * 身分證字號是**用校驗公式反推出來的**（A1 開頭遞增找到第一個通過的），
 * 不是任何人的。信用卡號是 `4111111111111111` —— 那是各家支付服務公開
 * 發布的測試卡號，本來就不對應任何一張真的卡。
 */

/** 通過校驗的身分證字號。用公式反推，不對應任何人。 */
const VALID_ID = "A100000001";
/** 只差一個檢查碼。它與上面那個的差別，就是這個偵測器的全部價值。 */
const INVALID_ID = "A100000000";
/** 公開的測試卡號。 */
const TEST_CARD = "4111111111111111";

describe("身分證字號：校驗碼是誤報與漏報的分界", () => {
  it("通過校驗的會被抓到", () => {
    expect(isNationalId(VALID_ID)).toBe(true);
  });

  it("★ 只有檢查碼不對就不算 —— 否則每個 A1 開頭的十碼字串都會被報", () => {
    expect(isNationalId(INVALID_ID)).toBe(false);
  });

  it("首碼用的是地區代號表，不是字母序", () => {
    // I、O、W、X、Y、Z 的代號是歷史遺留（I=34、O=35、W=32…）。
    // 照字母序算會讓校驗全盤失效，而失效的方向是**放行**。
    expect(isNationalId("A100000001")).toBe(true);
    expect(isNationalId("11000000012")).toBe(false);
    expect(isNationalId("Ω100000001")).toBe(false);
  });

  it("在一段文字裡找得到", () => {
    const found = scanText(`const customer = { id: "${VALID_ID}" };`);
    expect(found.map((finding) => finding.kind)).toContain("national-id");
    expect(found[0]?.line).toBe(1);
  });
});

describe("信用卡：Luhn", () => {
  it("公開測試卡號通過 Luhn，會被抓到", () => {
    expect(isLuhn(TEST_CARD)).toBe(true);
    expect(scanText(TEST_CARD).map((finding) => finding.kind)).toContain("credit-card");
  });

  it("★ 改一位數就不算", () => {
    expect(isLuhn("4111111111111112")).toBe(false);
  });

  it("★ 短的數字串不看 —— 否則每個時間戳都會被報", () => {
    // 13 位是下限。少了它，Date.now() 的毫秒值（13 位）會開始隨機命中。
    expect(scanText("1234").length).toBe(0);
  });
});

describe("電子郵件：保留網域是白名單，其餘一律當真的", () => {
  it("指向真實網域的會被抓到", () => {
    expect(isRealEmail("wang@gmail.com")).toBe(true);
    expect(isRealEmail("someone@company.com.tw")).toBe(true);
  });

  it("★ RFC 2606／6761 的保留網域放行", () => {
    for (const address of [
      "dev@example.com",
      "a@example.org",
      "a@foo.test",
      "a@foo.invalid",
      "dev@example.internal",
    ]) {
      expect(isRealEmail(address), address).toBe(false);
    }
  });

  it("🔴 npm 套件規格不得被當成信箱（第一版就是栽在這裡）", () => {
    // `名稱@版本` 與 `本地部分@網域` 在字面上一模一樣。第一版跑出 45 項，
    // 幾乎全是這個 —— 一道第一天就吐四十幾條誤報的閘門會被關掉，
    // 然後真的個資從此靜靜留在 repo 裡。
    const npmSpecs = "fsevents@2.3.3 vite-plus@0.2.9 detect-libc@2.1.2 lightningcss@1.33.0";
    expect(scanText(npmSpecs)).toEqual([]);
  });

  it("頂級網域必須是字母 —— 那正是版本號與網域的差別", () => {
    expect(isRealEmail("a@b.2.3")).toBe(true); // isRealEmail 本身不管格式
    expect(scanText("a@b.2.3")).toEqual([]); // 但 regex 不會把它撿起來
  });
});

describe("手機號碼", () => {
  it("09 開頭的十位數會被抓到", () => {
    expect(scanText("聯絡電話 0912345678").map((finding) => finding.kind)).toContain("mobile");
  });

  it("★ 位數不對就不算", () => {
    expect(scanText("091234567").filter((finding) => finding.kind === "mobile")).toEqual([]);
  });
});

describe("偵測不到的東西，要說出口", () => {
  it("🔴 姓名抓不到 —— 這是這條規則的覆蓋上限", () => {
    // 「林佳蓉」與一個真的客戶的名字在字面上沒有任何差別：
    // 沒有校驗碼、沒有格式、沒有可判定的性質。
    // 把這件事釘成一條測試，是為了讓「§11 II ⑥ 覆蓋是 partial 不是 full」
    // 有一個看得見的理由 —— 而不是一句寫在註記裡、下一個人會刪掉的話。
    expect(scanText("const demo = [{ customerName: '林佳蓉' }];")).toEqual([]);
  });

  it("地址也抓不到", () => {
    expect(scanText("台北市信義區市府路 1 號")).toEqual([]);
  });
});

describe("這支檔案自己", () => {
  it("★ 必須列在 EXEMPT 裡，而且是完整路徑不是 glob", () => {
    const key = "tools/pii-check/tests/detect.test.ts";
    expect(EXEMPT[key], "對照組沒被豁免 —— 掃描器會對自己的測試資料開火").toBeTruthy();
    for (const path of Object.keys(EXEMPT)) {
      expect(path, `${path} 看起來像 glob —— 例外必須剛好等於看過的那一份`).not.toMatch(/[*?]/);
    }
  });
});

describe("保留網域的子網域也是保留的", () => {
  it("🔴 corp.example.com 不是真信箱 —— 第一版把它報成違規", () => {
    // RFC 2606 保留的是整棵子樹。而 `a@corp.example.com` 正是規範建議的寫法 ——
    // 對著正確做法開火的檢查，會教人改用真網域，剛好與規則的目的相反。
    // 這個 bug 是被 platform/pii 自己的測試撞出來的。
    expect(isRealEmail("a@corp.example.com")).toBe(false);
    expect(isRealEmail("x@sub.example.org")).toBe(false);
  });

  it("★ 但長得像的不算 —— notexample.com 是真的", () => {
    expect(isRealEmail("a@notexample.com")).toBe(true);
    expect(isRealEmail("a@example.com.tw")).toBe(true);
  });
});
