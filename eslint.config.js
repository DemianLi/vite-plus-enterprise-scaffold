// Tier 2 安全閘門的進入點（D10）。
//
// 刻意**不**經由 vp 執行 —— D2 保單要求安全閘門獨立於可替換的驅動層。
// CI 直接呼叫：pnpm exec eslint . --max-warnings=0
//
// 跑法（D10）：全量、不過濾、不快取、PR ＋ 每日排程。
// 安全掃描的結果會隨時間失效，即使程式碼一字未改 —— 新公布的 CVE 不會改變
// 任何快取指紋，affected 過濾會判定「無影響」，於是命中快取回綠燈，
// 而專案此刻正是脆弱的。
export { default } from "@org/eslint-config";
