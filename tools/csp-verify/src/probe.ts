import { INJECTED_STYLE_COLOR, STYLE_ATTRIBUTE_COLOR } from "./evidence.ts";

/**
 * 貼進瀏覽器 console 跑的探針腳本。
 *
 * ── 為什麼探針要由工具產生，而不是寫在 README 裡讓人照抄 ──────────────
 *
 * 探針一與探針二靠兩個約定好的顏色值判定（`INJECTED_STYLE_COLOR` /
 * `STYLE_ATTRIBUTE_COLOR`）。如果腳本是文件裡的一段字，而判定在
 * `evidence.ts` 裡，那兩邊會在某次「順手改一下」之後對不上 ——
 * 而症狀是探針**永遠回報成功**（注入的顏色跟期望的不一樣，正是「被擋下」的定義）。
 *
 * 由同一組常數產生腳本，這種漂移在型別上就不可能發生。
 *
 * ── 為什麼不用無頭瀏覽器把這一段自動化 ──────────────────────────────
 *
 * 因為要驗的東西**只有真的瀏覽器 CSP 引擎知道**：happy-dom 與 jsdom
 * 都沒有實作 CSP，拿它們跑會得到一份「全部通過」而什麼都沒驗。
 * 而裝 Playwright 代表把瀏覽器二進位拉進這個 repo 的供應鏈盤點範圍
 *（`tools/supply-chain` 要為它們算來源證明），為了一道閘門付這個代價
 * 正是 D16 要擋的那種過度設計。
 *
 * 所以形狀比照 `tools/exit-drill`：**人跑一次，機器守它的有效期**。
 */

/** 找不到對話框時的等待上限（毫秒）。 */
const DIALOG_TIMEOUT_MS = 800;

export function buildProbeScript(): string {
  return `(async () => {
  const violations = [];
  const record = (e) => violations.push({
    effectiveDirective: e.effectiveDirective,
    blockedURI: e.blockedURI,
    disposition: e.disposition,
  });
  document.addEventListener('securitypolicyviolation', record);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── 探針 1：JS 注入 <style> 元素 ────────────────────────────────
  const host = document.createElement('div');
  host.id = 'csp-probe-host';
  document.body.appendChild(host);
  const styleEl = document.createElement('style');
  styleEl.textContent = '#csp-probe-host { color: ${INJECTED_STYLE_COLOR}; }';
  document.head.appendChild(styleEl);

  // ── 探針 2：style 屬性（對照組）─────────────────────────────────
  const attrTarget = document.createElement('div');
  attrTarget.setAttribute('style', 'color: ${STYLE_ATTRIBUTE_COLOR};');
  document.body.appendChild(attrTarget);

  // ── 探針 4：inline <script> ────────────────────────────────────
  const scriptEl = document.createElement('script');
  scriptEl.textContent = 'window.__cspInlineRan = true;';
  document.head.appendChild(scriptEl);

  await wait(400);

  const injectedStyleElementColor = getComputedStyle(host).color;
  const styleAttributeColor = getComputedStyle(attrTarget).color;
  const inlineScriptRan = window.__cspInlineRan === true;
  const externalStylesheets = Array.from(document.styleSheets)
    .filter((s) => s.href !== null)
    .map((s) => { let rules = -1; try { rules = s.cssRules.length; } catch { rules = -2; } return { href: s.href, rules }; });
  const probeViolations = violations.slice();
  host.remove(); attrTarget.remove(); styleEl.remove(); scriptEl.remove();

  // ── 探針 5：對話框 ─────────────────────────────────────────────
  //
  // 刻意不寫死按鈕文字：逐一按下去，直到出現 [role="dialog"]。
  // 寫死文字的話，切片改個標籤這一條就會靜靜地變成「沒有對話框可驗」。
  //
  // 但「逐一按下去」對登出／刪除這類按鈕是有代價的 —— 按到登出，
  // 後面的探針就在一個沒有資料的畫面上跑。所以跳過幾個明顯的。
  const AVOID = /登出|log ?out|刪除|delete|移除|remove/i;
  const before = violations.length;
  const styleElementsBefore = document.querySelectorAll('style').length;
  let dialogOpened = false;
  let styleElementsDuringDialog = styleElementsBefore;

  for (const button of Array.from(document.querySelectorAll('button'))) {
    if (AVOID.test(button.textContent ?? '')) continue;
    button.focus();
    button.click();
    await wait(${DIALOG_TIMEOUT_MS});
    if (document.querySelector('[role="dialog"]') !== null) {
      dialogOpened = true;
      styleElementsDuringDialog = document.querySelectorAll('style').length;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(400);
      break;
    }
  }

  const dialogViolations = violations.slice(before);
  document.removeEventListener('securitypolicyviolation', record);

  const capture = {
    injectedStyleElementColor,
    styleAttributeColor,
    externalStylesheets,
    inlineScriptRan,
    probeViolations,
    dialogOpened,
    dialogViolations,
    styleElementsDuringDialog,
    userAgent: navigator.userAgent,
  };
  console.log(JSON.stringify(capture, null, 2));
  return capture;
})()`;
}
