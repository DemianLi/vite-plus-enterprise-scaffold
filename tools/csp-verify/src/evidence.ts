import { parseLockfile } from "@org/supply-chain/lockfile";
import { buildSecurityHeaders } from "@org/security-headers";

/**
 * 把「有人開瀏覽器驗過 CSP」從一段口述變成一份會過期的證據。
 *
 * ── 這道閘門在此之前的樣子 ──────────────────────────────────────────
 *
 * `cli.ts` 起一台伺服器，人在瀏覽器裡看 console，結果用手抄進 DECISIONS C39。
 * 那份紀錄是真的、當時也是對的，但它有兩個問題，而第二個才是致命的：
 *
 *   1. 沒有人會再跑第二次（交付軸勉強及格：紀錄可以進評審資料）
 *   2. **升級 reka-ui 或改 CSP 政策時，它不會說話**（迭代軸掛零）
 *
 * D16 的判準說：迭代軸掛零的東西該丟。但這一項不能丟 —— 它是 §11 II ⑦
 * 執行期那一層唯一的證據。所以要做的是把迭代軸補起來。
 *
 * ── 補的方式：指紋，不是日曆 ────────────────────────────────────────
 *
 * 直覺是給證據加一個「90 天後過期」。**不要**。日曆過期每季紅一次，
 * 而紅的時候通常什麼都沒變 —— 那種紅燈會被人加例外關掉，
 * 這正是 `health.test.ts` 裡寫的「誤報讓它被關掉」。
 *
 * 這份證據會失效的真正原因只有兩個：
 *
 *   1. **CSP 政策本身改了** —— 驗的是舊政策，結論不能沿用
 *   2. **會在執行期注入 `<style>` 或 inline script 的相依版本變了**
 *
 * 所以指紋 ＝ enforce 政策字串 ＋ 一份**具名的**相依版本清單。
 * 具名是重點：加一個 UI 相依必須動 `FINGERPRINT_PACKAGES` 這一行，
 * 於是它必然出現在 code review 裡。`policy.ts` 的 `UNSAFE_INLINE_ALLOWED_IN`
 * 用的是同一個手法 —— 讓「再加一個例外」變成一個看得見的動作。
 *
 * ⚠️ **刻意不對建置產物取雜湊。** Vite 的 chunk 檔名帶內容雜湊
 *（C39 那張表裡的 `src-*.js`、`OrderList-*.js`），任何切片的 PR 都會讓它變 ——
 * 那道閘門會天天紅，一週內被刪掉。
 *
 * ── 指紋守不到的那一塊，說清楚 ──────────────────────────────────────
 *
 * 瀏覽器自己也會變。若某版 Chromium 改了 `style-src-attr` 的處理方式，
 * 我們的政策會靜默失效而指紋不會動。這是真的洞。
 *
 * 但**不能拿瀏覽器版本當閘門** —— Chromium 每四週發一版，那等於每四週紅一次，
 * 回到上面那個會被關掉的形狀。所以：**記錄，不守**。
 * 證據檔留下驗證當時的瀏覽器，人在看的時候知道這份結論是對著誰成立的。
 */

/**
 * 指紋涵蓋的相依。**這份清單就是被審查的對象。**
 *
 * 收錄標準只有一條：**它有沒有可能讓 CSP 的結論改變**，也就是
 * 在執行期注入 `<style>` 元素、或產生 inline script／`eval`。
 *
 * 所以 `pinia`、`vue-router`、`@tanstack/vue-query` 不在裡面 —— 它們是狀態與
 * 資料層，改版不會動到 CSP。把它們加進來只會讓指紋因為無關的升級而失效，
 * 逼人重跑一次結論不會變的瀏覽器驗證。
 *
 * `vue-i18n` 在裡面的理由跟其他幾個不同：它的 **full build 會用 `new Function`
 * 編譯訊息樣板**，那需要 `script-src 'unsafe-eval'`。目前用的是 runtime-only，
 * 但那是一個換個 build 就會消失的性質。
 */
export const FINGERPRINT_PACKAGES = [
  "vue",
  "@vitejs/plugin-vue",
  // 對話框、下拉、Splitter 全在這裡。C39 的第一個探針驗的就是它的注入行為。
  "reka-ui",
  "tailwindcss",
  "@tailwindcss/vite",
  // catalog 裡寫的是 `vite: npm:@voidzero-dev/vite-plus-core@…`，
  // lockfile 記的是別名解開後的真名。指紋要對得上 lockfile。
  "@voidzero-dev/vite-plus-core",
  "vue-i18n",
] as const;

/**
 * 兩個探針用的顏色。**故意是任何設計系統都不會用的值** ——
 * 若探針的期望顏色剛好等於元素本來的顏色，「沒有變化」與「注入被擋」
 * 會長得一模一樣，而探針會在什麼都沒發生的情況下報成功。
 *
 * 這兩個常數同時餵給探針腳本與判定函式（見 `buildProbeScript`），
 * 兩邊不可能各說各話。
 */
export const INJECTED_STYLE_COLOR = "rgb(1, 2, 3)";
export const STYLE_ATTRIBUTE_COLOR = "rgb(4, 5, 6)";

/** 瀏覽器 `SecurityPolicyViolationEvent` 裡我們在意的欄位。 */
export interface Violation {
  readonly effectiveDirective: string;
  readonly blockedURI: string;
  /** `"enforce"` 或 `"report"`。**這個欄位是整份證據的錨點**，見 `evaluate`。 */
  readonly disposition: string;
}

/**
 * 探針腳本回報的**原始觀測**。刻意全是量到的東西，沒有一個是判斷。
 *
 * 判斷（`passed`）由 `evaluate()` 從這些數字推導 —— 人只負責貼原始輸出。
 * 如果讓人手寫 `passed: true`，這份檔案就從量測退化成主張，
 * 而主張是不需要開瀏覽器就寫得出來的。
 */
export interface RawCapture {
  /** 注入 `<style>` 規則後，探針元素實際算出來的顏色。 */
  readonly injectedStyleElementColor: string;
  /** 設了 `style` 屬性的元素實際算出來的顏色。 */
  readonly styleAttributeColor: string;
  readonly externalStylesheets: readonly { readonly href: string; readonly rules: number }[];
  readonly inlineScriptRan: boolean;
  readonly probeViolations: readonly Violation[];
  readonly dialogOpened: boolean;
  readonly dialogViolations: readonly Violation[];
  readonly styleElementsDuringDialog: number;
  readonly userAgent: string;
}

export interface ProbeResult {
  readonly id: string;
  readonly what: string;
  readonly expected: string;
  readonly observed: string;
  readonly passed: boolean;
}

export interface Fingerprint {
  /** `buildSecurityHeaders({ reportOnly: false })` 產生的 CSP 字串。 */
  readonly policy: string;
  readonly packages: Readonly<Record<string, string>>;
}

export interface EvidenceFile {
  readonly verifiedAt: string;
  /** 驗證時的瀏覽器 UA。**記錄用，不進判定** —— 理由見檔頭。 */
  readonly browser: string;
  readonly fingerprint: Fingerprint;
  readonly probes: readonly ProbeResult[];
  readonly capture: RawCapture;
}

/** 必須到齊的探針。少了任何一個就不算驗過。 */
export const REQUIRED_PROBES = [
  "injected-style-element-blocked",
  "style-attribute-allowed",
  "external-stylesheet-loaded",
  "inline-script-blocked",
  "dialog-no-violation",
] as const;

function enforced(
  violations: readonly Violation[],
  directivePrefix: string,
): Violation | undefined {
  return violations.find(
    (violation) =>
      violation.effectiveDirective.startsWith(directivePrefix) &&
      violation.disposition === "enforce",
  );
}

/**
 * 從原始觀測推導五個探針的結論。
 *
 * ── 為什麼「沒有發生」不足以當證據 ──────────────────────────────────
 *
 * 探針一與探針四驗的是「這件事被擋下來了」。而「被擋下來」與
 * **「注入的程式碼根本沒跑」** 在觀測上一模一樣：兩者都是顏色沒變、
 * script 沒執行。若只看這一邊，一個寫壞的探針會永遠回報成功。
 *
 * 所以兩條都要求**同時**有對應的 violation，而且 `disposition === "enforce"`。
 * violation 是機制真的開火的正面證據；`enforce` 則是這一整份證據唯一
 * 機器驗得出「不是 report-only」的地方 —— report-only 的事件會寫 `"report"`。
 *
 * 探針二與探針三是對照組：它們證明畫面**不是整個壞掉**。
 * 少了它們，「什麼樣式都沒生效」會被讀成「CSP 很嚴格」。
 */
export function evaluate(capture: RawCapture): readonly ProbeResult[] {
  const styleBlock = enforced(capture.probeViolations, "style-src");
  const scriptBlock = enforced(capture.probeViolations, "script-src");
  const loadedSheets = capture.externalStylesheets.filter((sheet) => sheet.rules > 0);

  return [
    {
      id: "injected-style-element-blocked",
      what: "JS 注入 <style> 元素（reka-ui Splitter 會做的事）",
      expected: `顏色不是 ${INJECTED_STYLE_COLOR}，且有 enforce 的 style-src violation`,
      observed: `顏色 ${capture.injectedStyleElementColor}；violation ${
        styleBlock ? `${styleBlock.effectiveDirective}（${styleBlock.disposition}）` : "無"
      }`,
      passed:
        capture.injectedStyleElementColor !== INJECTED_STYLE_COLOR && styleBlock !== undefined,
    },
    {
      id: "style-attribute-allowed",
      what: "style 屬性（Vue 的 :style 走這條）不得被誤擋",
      expected: STYLE_ATTRIBUTE_COLOR,
      observed: capture.styleAttributeColor,
      passed: capture.styleAttributeColor === STYLE_ATTRIBUTE_COLOR,
    },
    {
      id: "external-stylesheet-loaded",
      what: "外部 stylesheet 真的載入且有規則 —— 對照組",
      expected: "至少 1 份、規則數 > 0",
      observed: `${loadedSheets.length} 份（規則數 ${loadedSheets
        .map((sheet) => sheet.rules)
        .join("／")}）`,
      passed: loadedSheets.length > 0,
    },
    {
      id: "inline-script-blocked",
      what: "inline <script> 不得執行 —— 同時證明不需要 nonce（R6 的成本前提）",
      expected: "沒有執行，且有 enforce 的 script-src violation",
      observed: `執行 ${capture.inlineScriptRan ? "是" : "否"}；violation ${
        scriptBlock ? `${scriptBlock.effectiveDirective}（${scriptBlock.disposition}）` : "無"
      }`,
      passed: !capture.inlineScriptRan && scriptBlock !== undefined,
    },
    {
      id: "dialog-no-violation",
      what: "UiDialog 在 enforce CSP 下開啟：零 violation、零執行期注入的 <style>",
      // 「對話框有打開」是這一條的前提，不是附帶條件：
      // 沒打開的話「零 violation」只代表沒有東西跑過。
      expected: "對話框開啟、0 violation、0 個 <style> 元素",
      observed: `開啟 ${capture.dialogOpened ? "是" : "否"}；violation ${
        capture.dialogViolations.length
      }；<style> ${capture.styleElementsDuringDialog}`,
      passed:
        capture.dialogOpened &&
        capture.dialogViolations.length === 0 &&
        capture.styleElementsDuringDialog === 0,
    },
  ];
}

export interface EvidenceProblem {
  readonly kind:
    | "missing"
    | "empty"
    | "missing-probe"
    | "probe-failed"
    | "policy-changed"
    | "roster-drift"
    | "version-changed";
  readonly detail: string;
}

/** 目前這一刻的指紋。政策來自 `@org/security-headers`，版本來自 lockfile。 */
export function currentFingerprint(lockfileText: string): Fingerprint {
  const parsed = parseLockfile(lockfileText);
  const packages: Record<string, string> = {};

  for (const name of FINGERPRINT_PACKAGES) {
    // 同一個套件在 lockfile 裡出現多個版本是可能的（peer 解析）。
    // 全部記下來而不是挑一個 —— 挑一個會讓「多裝了一份舊版」變成看不見的事。
    const versions = [
      ...new Set(parsed.packages.filter((entry) => entry.name === name).map((e) => e.version)),
    ].sort();
    if (versions.length > 0) packages[name] = versions.join(", ");
  }

  const headers = buildSecurityHeaders({ reportOnly: false });
  const policy = headers["Content-Security-Policy"];
  if (policy === undefined) {
    // 走到這裡代表 buildSecurityHeaders 的 reportOnly 語意變了。
    // 靜靜記一個空字串會讓指紋永遠對得上 —— 那是最糟的失敗方式。
    throw new Error(
      "buildSecurityHeaders({ reportOnly: false }) 沒有回傳 Content-Security-Policy —— " +
        "政策的產生方式變了，這份證據的前提不成立",
    );
  }

  return { policy, packages };
}

/**
 * 證據還算不算數。
 *
 * 回傳空陣列代表通過。**沒有任何一條會因為「檔案不存在」而放行** ——
 * 那是這個 repo 反覆栽過的形狀（C33 的 Trivy 掃 0 個套件）：
 * 「沒被檢查」與「檢查通過」必須長得不一樣。
 */
export function checkEvidence(
  file: EvidenceFile | null,
  expected: Fingerprint,
): readonly EvidenceProblem[] {
  if (file === null) {
    return [
      {
        kind: "missing",
        detail: "找不到證據檔 —— 沒有人驗過，或檔案被刪了。兩種都不是通過。",
      },
    ];
  }

  const problems: EvidenceProblem[] = [];

  if (file.probes.length === 0) {
    problems.push({
      kind: "empty",
      detail: "證據檔裡一個探針都沒有 —— 空陣列不會有失敗的探針，那是假綠燈。",
    });
  }

  const recorded = new Set(file.probes.map((probe) => probe.id));
  for (const id of REQUIRED_PROBES) {
    if (!recorded.has(id)) {
      problems.push({ kind: "missing-probe", detail: `缺少必要探針：${id}` });
    }
  }

  for (const probe of file.probes) {
    if (!probe.passed) {
      problems.push({
        kind: "probe-failed",
        detail: `探針 ${probe.id} 失敗：期望 ${probe.expected}，實測 ${probe.observed}`,
      });
    }
  }

  if (file.fingerprint.policy !== expected.policy) {
    problems.push({
      kind: "policy-changed",
      detail:
        "CSP 政策已改，這份證據驗的是舊政策。\n" +
        `    證據：${file.fingerprint.policy}\n` +
        `    現況：${expected.policy}`,
    });
  }

  const recordedNames = Object.keys(file.fingerprint.packages).sort();
  const expectedNames = Object.keys(expected.packages).sort();
  if (recordedNames.join(",") !== expectedNames.join(",")) {
    problems.push({
      kind: "roster-drift",
      detail:
        "指紋涵蓋的相依名單與證據檔對不上 —— FINGERPRINT_PACKAGES 動過，或某個相依不在 lockfile 裡。\n" +
        `    證據：${recordedNames.join(" ") || "（空）"}\n` +
        `    現況：${expectedNames.join(" ") || "（空）"}`,
    });
  }

  for (const [name, version] of Object.entries(expected.packages)) {
    const was = file.fingerprint.packages[name];
    if (was !== undefined && was !== version) {
      problems.push({
        kind: "version-changed",
        detail: `${name} ${was} → ${version} —— 這個相依會影響執行期的 <style>／script 注入，結論要重驗`,
      });
    }
  }

  return problems;
}
