/**
 * CSP 相容性探測的判定 —— 純函式，不碰網路。
 *
 * ── 為什麼這是本 repo 的決勝軸 ──────────────────────────────────────
 *
 * `@org/security-headers` 的政策是 `style-src 'self'` ＋
 * `style-src-attr 'unsafe-inline'`。意思是：
 *
 *   · 靜態 stylesheet          → 沒問題
 *   · Vue 的 `:style`（屬性）  → 沒問題（受 style-src-attr 管）
 *   · **執行期插入的 `<style>` 元素** → **被擋掉**
 *
 * 而一般的 UI 函式庫比較文章從來不提第三點。CSS-in-JS 的函式庫
 * （naive-ui 的 css-render、ant-design-vue 的 emotion）核心機制就是它。
 *
 * ── 這個探測是什麼、不是什麼 ────────────────────────────────────────
 *
 * 它掃的是**已發佈的 dist**，證明「這份程式碼有這個能力」，
 * **不證明執行期一定會發生**：tree-shaking 可能移除它，沒 import 的元件不會執行。
 *
 * 所以判定分三級，而不是二分。選定之後仍然必須開瀏覽器套上真實政策再驗一次 ——
 * 這一點寫在報告裡，不要讓讀的人以為 grep 過就等於驗過。
 */

export type CspVerdict = "clean" | "avoidable" | "needs-nonce" | "blocked";

export interface CspProbe {
  readonly name: string;
  /** 套件裡的靜態 `.css` 檔數。0 且有注入 ＝ 樣式全靠執行期產生。 */
  readonly staticCssFiles: number;
  /** 出現 `createElement("style")` 的檔案（相對套件根目錄）。 */
  readonly injectionSites: readonly string[];
  /** 提到 `nonce` 的檔案數。> 0 表示至少有機會相容。 */
  readonly nonceMentions: number;
}

export interface CspAssessment {
  readonly verdict: CspVerdict;
  readonly reason: string;
}

/** 注入點是否全部集中在可以「不要用它」就避開的元件裡。 */
function onlyInAvoidableComponent(sites: readonly string[]): boolean {
  if (sites.length === 0) return false;
  // 主 bundle（index.*）代表注入在核心路徑上，避不開。
  return !sites.some((site) => /(^|\/)(index|vuetify)[.-]/.test(site));
}

export function assessCsp(probe: CspProbe): CspAssessment {
  if (probe.injectionSites.length === 0) {
    return {
      verdict: "clean",
      reason: `零執行期注入，${probe.staticCssFiles} 個靜態 CSS 檔。直接相容 style-src 'self'。`,
    };
  }

  if (onlyInAvoidableComponent(probe.injectionSites)) {
    const nonce = probe.nonceMentions > 0 ? "，且該處支援 nonce" : "";
    return {
      verdict: "avoidable",
      reason:
        `注入只出現在 ${probe.injectionSites.join("、")}${nonce}。` +
        "不使用該元件即零注入 —— 但這條要由**讀過那段程式碼**的人確認，不能只看檔名。",
    };
  }

  if (probe.nonceMentions === 0) {
    return {
      verdict: "blocked",
      reason:
        "注入在主 bundle（核心路徑），且全套件零處提及 nonce。" +
        "沒有任何設定能讓它在 style-src 'self' 下運作。",
    };
  }

  return {
    verdict: "needs-nonce",
    reason:
      "注入在核心路徑，但套件支援 nonce。要用就得替 style-src 供應 per-request nonce ——" +
      "而那代表需要一個會改寫 HTML 的中間層，R6 的成本級距整個往上跳。",
  };
}

export const VERDICT_LABEL: Readonly<Record<CspVerdict, string>> = {
  clean: "✅ 直接相容",
  avoidable: "✅ 可避開",
  "needs-nonce": "⚠️ 需要 nonce",
  blocked: "❌ 撞 CSP",
};
