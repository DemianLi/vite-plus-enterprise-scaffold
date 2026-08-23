import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/**
 * 指向 `HANDOFF.md` 的**編號式**交叉引用 —— 一條都不准有（C99）。
 *
 * ── 為什麼這是一條站得住的規則 ──────────────────────────────────────
 *
 * 採用演練抓到兩處：`README.md` 說「見 HANDOFF 的 R3／R5」、
 * `CODEOWNERS` 說「參照 HANDOFF #25」。兩處都指向不存在的東西。
 *
 * ⚠️ 而它們**不是**過期 —— 逐個 commit 查過 50 個動過 `HANDOFF.md` 的版本，
 * `R3`／`R5`／`#25` **一次都沒有出現過**。
 * 也就是說：它們**從寫下的那一刻就是死的**，指向一套這份文件從來沒有過的編號。
 *
 * ── ⚠️ 但「提到編號」與「叫你去看編號」是兩件事 ─────────────────────
 *
 * 第一版的樣式只看「HANDOFF 附近有 `R<n>`／`#<n>`」，而它當場咬到
 * `CODEOWNERS:64`：「✅ **HANDOFF #14 已於 2026-08-16 結案**（C62）」。
 * 查了歷史：`#14` **真的存在過**（五個版本），後來被拿掉 ——
 * 那句話陳述的是**一件過去發生的事**，不是叫人去讀哪一節。
 *
 * 這正是 `facts.ts` 整個設計的樞紐（守現在式、不守 DECISIONS.md 那種歷史）
 * 在交叉引用上的同一條線。所以樣式要求一個**指路的動詞**：
 * 「見／參照／詳見／參見」。**沒有指路動詞的提及，是歷史，不碰。**
 *
 * ⚠️ 那是一個**代理**，不是判斷語氣的機器：有人寫「HANDOFF 的 R7 有詳細說明」
 * 就繞得過去。寫下來，是因為一條看起來嚴密的規則配上一個沒說出口的縫，
 * 比一條寫明射程的規則危險。
 *
 * ── 失敗方向 ────────────────────────────────────────────────────────
 *
 * 讀的人不會知道那一節不存在，只會以為自己漏讀了 —— 演練的人就為此
 * 停下來找了幾分鐘。而如果他真的在封閉網路裡（`README:95` 那一處講的正是
 * 內部 registry），被指去的那一節是不存在的。
 */
const DOCUMENTS = ["README.md", "CODEOWNERS", "HANDOFF.md", "SCOPE.md"];

/** 指路動詞 ＋「HANDOFF」＋ 十個字元內的 `R<數字>`／`#<數字>`。 */
const NUMBERED_REFERENCE = /(見|參照|詳見|參見)[^\n]{0,4}HANDOFF[^\n]{0,10}?(\bR\d+\b|#\d+\b)/;

describe("指向 HANDOFF 的交叉引用（C99）", () => {
  it("🔴 HANDOFF 自己沒有編號式章節 —— 這條規則的前提", () => {
    /**
     * ⚠️ **夾具存在性斷言**（C97 §三之二 的教訓）。哪天 `HANDOFF.md` 真的長出
     * `R3` 那樣的編號，下面那條規則就從「這種引用一定是死的」變成「可能是活的」
     * —— 而那會安靜地發生。訊息直接說這條規則失去前提。
     */
    const handoff = readFileSync(join(ROOT, "HANDOFF.md"), "utf8");
    const numbered = handoff.match(/^#+ *(R\d+|#\d+)\b/gm) ?? [];
    expect(numbered, "HANDOFF 長出編號式章節了 —— 下面那條規則的前提沒了，要重想").toEqual([]);
  });

  it.each(DOCUMENTS)("🔴 %s 不得用編號指向 HANDOFF", (name) => {
    const source = readFileSync(join(ROOT, name), "utf8");
    const hit = NUMBERED_REFERENCE.exec(source);
    expect(
      hit?.[0],
      hit === null
        ? ""
        : `${name} 叫人去看 HANDOFF 的「${hit[2]}」，而 HANDOFF 沒有編號式章節 —— ` +
            `把內容寫出來，或直接拿掉那個指路（歷史陳述不受這條規則管，見檔頭）`,
    ).toBeUndefined();
  });

  it("★ 這條樣式真的咬得到當初那兩句（不是一條永遠不開火的規則）", () => {
    // ⚠️ 沒有這一條的話，樣式寫錯（例如少了 `\b`）會讓上面每一條永遠綠，
    // 而那跟「文件是乾淨的」長得一模一樣。用當初的原文當樣本。
    for (const line of [
      "> 內部 registry 環境下…（見 HANDOFF 的 R3／R5）：",
      "# 或參照 HANDOFF #25 的三條出路（開分支保護／拆目錄／外掛檢查）。",
    ]) {
      expect(NUMBERED_REFERENCE.exec(line), line.slice(0, 30)).not.toBeNull();
    }
  });

  it("🔴 **歷史陳述不得被咬** —— 提到編號不等於叫人去看", () => {
    /**
     * ⚠️ 這一條是第一版樣式踩到的坑，也是它被改窄的理由。
     * `#14` 真的存在過（歷史查過五個版本），那句話說的是它**結案了**。
     * 把它判成死鏈，等於要求刪掉一段記錄 —— 與 `doc-facts` 不守
     * `DECISIONS.md` 是同一條理由。
     */
    for (const line of [
      "# ✅ HANDOFF #14 已於 2026-08-16 結案：**維持通則，不加獨立條目**（C62）。",
      "# ⚠️ 這一段以前寫的是「真正待決的問題在 HANDOFF #14」。已經不是了。",
    ]) {
      expect(NUMBERED_REFERENCE.exec(line), line.slice(0, 34)).toBeNull();
    }
  });
});
