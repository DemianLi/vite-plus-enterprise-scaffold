import type { Finding } from "./finding.ts";

/**
 * 照「發生的地方」分組，組內維持記下來的順序。
 *
 * 用 `Map` 不是 `Object.groupBy`：`Map` 的走訪順序是**插入順序**，
 * 而那正是規則跑的順序（見 `rules/slice.ts`）。物件的鍵順序對整數樣的字串
 * 有特殊規則，一個叫 `123` 的切片會被排到最前面 —— 現在不會發生，
 * 但那種故障不會有任何東西說話。
 */
export function groupFindings(findings: readonly Finding[]): Map<string, Finding[]> {
  const grouped = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = grouped.get(f.where) ?? [];
    list.push(f);
    grouped.set(f.where, list);
  }
  return grouped;
}

/**
 * 整份報告的文字，**含結尾換行**。
 *
 * ── 為什麼回傳字串而不是直接 console.error ──────────────────────────
 *
 * 這樣「報告長什麼樣子」才是一個可以直接斷言的東西。前身是十幾行
 * `console.error`，要驗它只能起一個子行程、弄壞一個切片、再比對 stderr——
 * 而那種測試同時綁著判定、格式與行程結束碼，任何一個變了都紅，
 * 而紅的訊息不會告訴你是哪一個。
 *
 * ⚠️ 每一段的結尾換行是原本 `console.error` 自動補的那一個。
 * 這支工具的輸出被 CI 的紀錄與 `vpr gate` 直接照抄，
 * 所以格式差一個換行就是一次使用者看得到的改動。
 *
 * ── `title` 為什麼有預設值 ──────────────────────────────────────────
 *
 * `tools/scope-check`（C73）是第二個產出 `Finding[]` 的工具，而閘門訊息
 * 長得一樣對讀的人有價值 —— 同一個 repo 的紅燈不該有兩種排版。
 * 但這一行的字面內容是**這支工具的輸出**，`#53` 花了整輪去證明它一字未改，
 * 所以參數帶預設值：conformance 的呼叫端一個字都不用動，
 * 而「輸出沒變」這件事由既有的測試繼續盯著。
 */
export function formatReport(findings: readonly Finding[], title = "一致性檢查"): string {
  let out = `\n✗ ${title}未通過：${findings.length} 項違規\n\n`;

  for (const [where, items] of groupFindings(findings)) {
    out += `  ${where}\n`;
    for (const item of items) {
      out += `    ✗ [${item.rule}] ${item.detail}\n`;
      out += `      → ${item.fix}\n`;
    }
    out += "\n";
  }

  return out;
}
