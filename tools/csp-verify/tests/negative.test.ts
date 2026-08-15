import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FINGERPRINT_PACKAGES,
  INJECTED_STYLE_COLOR,
  REQUIRED_PROBES,
  STYLE_ATTRIBUTE_COLOR,
  checkEvidence,
  currentFingerprint,
  evaluate,
  type EvidenceFile,
  type RawCapture,
} from "../src/evidence.ts";
import { buildProbeScript } from "../src/probe.ts";

/**
 * `tools/csp-verify` 的**反向測試**。
 *
 * ── 這道閘門原本三樣都缺 ────────────────────────────────────────────
 *
 * 零測試、零進版控的產物、不在任何 workflow 裡。結果由人抄進 DECISIONS C39。
 *
 * ── 這裡驗的是守衛，不是 CSP ────────────────────────────────────────
 *
 * CSP 本身只有真的瀏覽器驗得了（happy-dom 與 jsdom 都沒實作 CSP，
 * 拿它們跑會得到一份「全部通過」而什麼都沒驗）。
 *
 * 所以這支測試的對象是**證據的有效期機制**：
 * 「沒有人驗過」「驗過但探針是空的」「驗過但政策後來改了」
 * 這三種狀況，必須跟「驗過而且還算數」長得不一樣。
 *
 * 這是這個 repo 反覆栽的那個形狀（C33 的 Trivy 掃 0 個套件、
 * vitest 4 的空失敗清單、`health.test.ts` 的名單漂移）：
 * **「沒被檢查」與「檢查通過」必須看得出差別。**
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CLI = join(ROOT, "tools/csp-verify/src/cli.ts");
const EVIDENCE_PATH = join(ROOT, "tools/csp-verify/evidence.json");
const LOCKFILE = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");

const REAL: EvidenceFile = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8")) as EvidenceFile;

/** 一份全數通過的原始觀測，形狀與實測到的那一份相同。 */
function capture(overrides: Partial<RawCapture> = {}): RawCapture {
  return {
    injectedStyleElementColor: "rgb(0, 0, 0)",
    styleAttributeColor: STYLE_ATTRIBUTE_COLOR,
    externalStylesheets: [{ href: "http://localhost:4173/assets/index.css", rules: 45 }],
    inlineScriptRan: false,
    probeViolations: [
      { effectiveDirective: "style-src-elem", blockedURI: "inline", disposition: "enforce" },
      { effectiveDirective: "script-src-elem", blockedURI: "inline", disposition: "enforce" },
    ],
    dialogOpened: true,
    dialogViolations: [],
    styleElementsBeforeDialog: 0,
    styleElementsDuringDialog: 0,
    userAgent: "Mozilla/5.0 Chrome/148.0.0.0",
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceFile> = {}): EvidenceFile {
  return {
    verifiedAt: "2026-08-15",
    browser: "Mozilla/5.0 Chrome/148.0.0.0",
    fingerprint: currentFingerprint(LOCKFILE),
    probes: evaluate(capture()),
    capture: capture(),
    ...overrides,
  };
}

function kinds(problems: readonly { kind: string }[]): readonly string[] {
  return problems.map((problem) => problem.kind);
}

describe("對照組：進版控的那份證據現在仍然有效", () => {
  /**
   * ⚠️ 這一條必須先過，否則下面每一條「該紅」的測試都可能只是因為
   * 環境壞了而紅 —— 而那種綠燈教人忽略這道閘門。
   */
  it("★ 真的 evidence.json ＋ 真的 lockfile → 零問題", () => {
    const problems = checkEvidence(REAL, currentFingerprint(LOCKFILE));
    expect(problems.map((problem) => problem.detail).join("\n")).toBe("");
  });

  it("它記的是真的跑過瀏覽器 —— 五個探針齊全且都通過", () => {
    expect(REAL.probes).toHaveLength(REQUIRED_PROBES.length);
    expect(REAL.probes.every((probe) => probe.passed)).toBe(true);
  });

  it("★ 而且證明了政策是 enforce 而不是 report-only", () => {
    // 這是整份證據唯一機器驗得出「不是 report-only」的地方。
    // report-only 的事件 disposition 會是 "report"，畫面照常運作 ——
    // 那種驗證等於沒驗。
    const dispositions = REAL.capture.probeViolations.map((v) => v.disposition);
    expect(dispositions).toContain("enforce");
    expect(dispositions).not.toContain("report");
  });
});

describe("🔴 沒有證據不得等於通過", () => {
  it("證據檔不存在 → 紅（這條是整支測試的重點）", () => {
    expect(kinds(checkEvidence(null, currentFingerprint(LOCKFILE)))).toContain("missing");
  });

  it("探針陣列是空的 → 紅", () => {
    // 空陣列不會有失敗的探針。少了這條，刪掉 probes 的內容就能讓閘門變綠。
    const problems = checkEvidence(evidence({ probes: [] }), currentFingerprint(LOCKFILE));
    expect(kinds(problems)).toContain("empty");
  });

  it("少了任何一個必要探針 → 紅", () => {
    // 只留一個最好過的探針，其餘刪掉 —— 沒有這條，那樣做會全綠。
    const only = evaluate(capture()).filter((probe) => probe.id === "style-attribute-allowed");
    const problems = checkEvidence(evidence({ probes: only }), currentFingerprint(LOCKFILE));
    expect(kinds(problems).filter((kind) => kind === "missing-probe")).toHaveLength(
      REQUIRED_PROBES.length - 1,
    );
  });

  it("有探針但失敗了 → 紅", () => {
    const broken = evaluate(capture({ inlineScriptRan: true }));
    const problems = checkEvidence(evidence({ probes: broken }), currentFingerprint(LOCKFILE));
    expect(kinds(problems)).toContain("probe-failed");
  });
});

describe("🔴 偽造的結論：手改 passed 不得放行", () => {
  /**
   * 「`passed` 由 `evaluate()` 推導、不接受人手寫」這句話，如果只在 `--record`
   * 那一刻成立，就等於沒有 —— 事後把 `evidence.json` 裡的 false 改成 true，
   * 或直接蓋一份全綠的 probes 上去，CI 照樣綠。
   *
   * 那樣的話這道閘門會變成它自己在防的那個東西：**一份不用開瀏覽器就寫得
   * 出來的主張。** 所以 `checkEvidence` 會從 `capture` 重算一次。
   */
  it("把失敗的探針改成 passed: true → 紅", () => {
    const contradicted = capture({ dialogOpened: false });
    const forged = evaluate(contradicted).map((probe) => ({ ...probe, passed: true }));
    const problems = checkEvidence(
      evidence({ probes: forged, capture: contradicted }),
      currentFingerprint(LOCKFILE),
    );
    expect(kinds(problems)).toContain("derivation-mismatch");
  });

  it("把真證據的 probes 蓋到一份矛盾的 capture 上 → 紅", () => {
    const problems = checkEvidence(
      { ...REAL, capture: capture({ inlineScriptRan: true, probeViolations: [] }) },
      currentFingerprint(LOCKFILE),
    );
    expect(kinds(problems)).toContain("derivation-mismatch");
  });

  it("整個 capture 被拿掉 → 紅（沒有原始觀測就無從查證）", () => {
    const { capture: _dropped, ...withoutCapture } = evidence();
    const problems = checkEvidence(
      withoutCapture as unknown as EvidenceFile,
      currentFingerprint(LOCKFILE),
    );
    expect(kinds(problems)).toContain("no-capture");
  });

  it("★ 只改給人看的訊息不算竄改 —— 比的是 (id, passed)", () => {
    // 深比較整個物件的話，改一句 `observed` 的措辭就會讓證據失效。
    // 那種紅燈與事實無關，而與事實無關的紅燈會被關掉。
    const reworded = REAL.probes.map((probe) => ({ ...probe, observed: "換個說法" }));
    const problems = checkEvidence({ ...REAL, probes: reworded }, currentFingerprint(LOCKFILE));
    expect(kinds(problems)).not.toContain("derivation-mismatch");
  });
});

describe("指紋：上一次驗證的前提變了就失效", () => {
  it("🔴 CSP 政策改了 → 紅", () => {
    const stale = evidence();
    const problems = checkEvidence(
      { ...stale, fingerprint: { ...stale.fingerprint, policy: "default-src *" } },
      currentFingerprint(LOCKFILE),
    );
    expect(kinds(problems)).toContain("policy-changed");
  });

  it("🔴 reka-ui 升版 → 紅（對話框的注入行為可能就變了）", () => {
    const stale = evidence();
    const problems = checkEvidence(
      {
        ...stale,
        fingerprint: {
          ...stale.fingerprint,
          packages: { ...stale.fingerprint.packages, "reka-ui": "0.0.0-old" },
        },
      },
      currentFingerprint(LOCKFILE),
    );
    expect(kinds(problems)).toContain("version-changed");
  });

  it("🔴 FINGERPRINT_PACKAGES 動過（多一個或少一個）→ 紅", () => {
    // 少了這條，把一個相依從名單裡拿掉就能讓舊證據繼續有效 ——
    // 而那正是「安靜地縮小監控範圍」的做法。
    const stale = evidence();
    const shrunk = { ...stale.fingerprint.packages };
    delete shrunk["reka-ui"];
    const problems = checkEvidence(
      { ...stale, fingerprint: { ...stale.fingerprint, packages: shrunk } },
      currentFingerprint(LOCKFILE),
    );
    expect(kinds(problems)).toContain("roster-drift");
  });

  it("★ 不在名單裡的相依升版不該讓證據失效", () => {
    // 誤報的代價跟漏報一樣高：每次升 pinia 都要有人重開瀏覽器跑一次
    // 結論不會變的驗證，這道閘門一個月內就會被關掉。
    const expected = currentFingerprint(LOCKFILE);
    expect(Object.keys(expected.packages)).not.toContain("pinia");
    expect(Object.keys(expected.packages)).not.toContain("vue-router");
    expect(Object.keys(expected.packages)).not.toContain("@tanstack/vue-query");
  });

  it("★ 名單上的每一個都真的在 lockfile 裡解析得到", () => {
    // 打錯一個字，`currentFingerprint` 會安靜地少記一個 —— 而且不會有任何
    // 東西變紅（證據與現況同時少了它，對得上）。結果是那個相依從此不被監控。
    const resolved = Object.keys(currentFingerprint(LOCKFILE).packages);
    for (const name of FINGERPRINT_PACKAGES) {
      expect(resolved, `${name} 在 lockfile 裡找不到 —— 它其實沒有被監控`).toContain(name);
    }
  });
});

describe("evaluate：「什麼都沒發生」不算被擋下", () => {
  it("🔴 顏色沒變但沒有 violation → 不算通過", () => {
    // 「被擋下」與「注入的程式碼根本沒跑」在觀測上一模一樣。
    // 少了 violation 的佐證，一個壞掉的探針會永遠回報成功。
    const probes = evaluate(capture({ probeViolations: [] }));
    const blocked = probes.find((probe) => probe.id === "injected-style-element-blocked");
    expect(blocked?.passed).toBe(false);
  });

  it("🔴 violation 是 report-only → 不算通過", () => {
    const probes = evaluate(
      capture({
        probeViolations: [
          { effectiveDirective: "style-src-elem", blockedURI: "inline", disposition: "report" },
          { effectiveDirective: "script-src-elem", blockedURI: "inline", disposition: "report" },
        ],
      }),
    );
    expect(probes.filter((probe) => probe.passed).map((probe) => probe.id)).not.toContain(
      "injected-style-element-blocked",
    );
  });

  it("🔴 注入的樣式真的生效了 → 不算通過", () => {
    const probes = evaluate(capture({ injectedStyleElementColor: INJECTED_STYLE_COLOR }));
    const blocked = probes.find((probe) => probe.id === "injected-style-element-blocked");
    expect(blocked?.passed).toBe(false);
  });

  it("★ style 屬性被誤擋 → 紅（不是只有放行才要驗）", () => {
    // Vue 的 :style 走這條。把 style-src-attr 的例外拿掉，所有動態樣式
    // 會靜音失效 —— 那不是「更安全」，那是壞掉。
    const probes = evaluate(capture({ styleAttributeColor: "rgb(0, 0, 0)" }));
    const allowed = probes.find((probe) => probe.id === "style-attribute-allowed");
    expect(allowed?.passed).toBe(false);
  });

  it("★ 一份樣式表都沒載入 → 紅（對照組：畫面不是整個壞掉）", () => {
    // 少了這條，「什麼樣式都沒生效」會被讀成「CSP 很嚴格」。
    const probes = evaluate(capture({ externalStylesheets: [] }));
    expect(probes.find((probe) => probe.id === "external-stylesheet-loaded")?.passed).toBe(false);
  });

  it("樣式表有載入但規則數是 0 → 紅", () => {
    const probes = evaluate(
      capture({ externalStylesheets: [{ href: "http://x/a.css", rules: 0 }] }),
    );
    expect(probes.find((probe) => probe.id === "external-stylesheet-loaded")?.passed).toBe(false);
  });

  it("🔴 對話框根本沒打開 → 零 violation 不算通過", () => {
    // 這是這一組裡最容易寫錯的：沒打開的話「零 violation」只代表沒有東西跑過。
    const probes = evaluate(capture({ dialogOpened: false }));
    expect(probes.find((probe) => probe.id === "dialog-no-violation")?.passed).toBe(false);
  });

  it("對話框打開時多長出 <style> 元素 → 紅", () => {
    // reka-ui 若哪一版改成執行期注入樣式，會踩到這一條。
    const probes = evaluate(capture({ styleElementsDuringDialog: 1 }));
    expect(probes.find((probe) => probe.id === "dialog-no-violation")?.passed).toBe(false);
  });

  it("★ 看的是差值不是絕對值 —— 靜置就有 <style> 不代表對話框注入了", () => {
    // 今天的產物靜置時是 0 個。但 Vite 只要開始內聯小 CSS，絕對值就不是 0，
    // 而探針會報「<style> 1」讓人診斷成「reka-ui 開始注入樣式」——
    // **錯的原因**，出現在一道全部價值都在「訊息講得出原因」的閘門上。
    const probes = evaluate(
      capture({ styleElementsBeforeDialog: 3, styleElementsDuringDialog: 3 }),
    );
    expect(probes.find((probe) => probe.id === "dialog-no-violation")?.passed).toBe(true);
  });
});

describe("探針腳本與判定共用同一組常數", () => {
  it("★ 腳本裡的兩個顏色就是判定用的那兩個", () => {
    // 兩邊各寫一份的話，某次「順手改一下」之後探針會**永遠回報成功** ——
    // 注入的顏色跟期望的不一樣，正好符合「被擋下」的定義。
    const script = buildProbeScript();
    expect(script).toContain(INJECTED_STYLE_COLOR);
    expect(script).toContain(STYLE_ATTRIBUTE_COLOR);
    expect(INJECTED_STYLE_COLOR).not.toBe(STYLE_ATTRIBUTE_COLOR);
  });

  it("腳本會回報判定需要的每一個欄位", () => {
    const script = buildProbeScript();
    for (const field of [
      "injectedStyleElementColor",
      "styleAttributeColor",
      "externalStylesheets",
      "inlineScriptRan",
      "probeViolations",
      "dialogOpened",
      "dialogViolations",
      "styleElementsBeforeDialog",
      "styleElementsDuringDialog",
      "userAgent",
    ]) {
      expect(script, `探針沒有回報 ${field}`).toContain(field);
    }
  });

  it("腳本記的是 disposition —— 少了它就分不出 enforce 與 report-only", () => {
    expect(buildProbeScript()).toContain("disposition");
  });
});

describe("CLI 端對端", () => {
  function run(args: readonly string[]): { code: number; output: string } {
    const result = spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
    return { code: result.status ?? -1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }

  it("--verify 對真的證據檔 → 綠", () => {
    const result = run(["--verify"]);
    expect(result.code, result.output).toBe(0);
  });

  it("🔴 --verify 指到不存在的證據檔 → 紅，而且說得出原因", () => {
    const dir = mkdtempSync(join(tmpdir(), "csp-evidence-"));
    try {
      const result = run(["--verify", "--evidence", join(dir, "nope.json")]);
      expect(result.code).toBe(1);
      expect(result.output).toContain("missing");
      // 訊息必須帶重驗步驟，否則看到紅燈的人只會把檔案 touch 出來。
      expect(result.output).toContain("--print-probe");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("🔴 --verify 對一份被動過手腳的證據檔 → 紅", () => {
    const dir = mkdtempSync(join(tmpdir(), "csp-evidence-"));
    try {
      const path = join(dir, "evidence.json");
      const tampered = { ...REAL, probes: [] };
      writeFileSync(path, JSON.stringify(tampered, null, 2));
      const result = run(["--verify", "--evidence", path]);
      expect(result.code).toBe(1);
      expect(result.output).toContain("empty");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--record 失敗的觀測時仍寫檔，但回傳非零", () => {
    const dir = mkdtempSync(join(tmpdir(), "csp-evidence-"));
    try {
      const capturePath = join(dir, "capture.json");
      writeFileSync(capturePath, JSON.stringify(capture({ dialogOpened: false })));
      const evidencePath = join(dir, "evidence.json");
      const result = run(["--record", capturePath, "--evidence", evidencePath]);
      expect(result.code).toBe(1);
      expect(readFileSync(evidencePath, "utf8")).toContain("dialog-no-violation");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--print-probe 印出可執行的腳本，不動任何檔案", () => {
    const before = readFileSync(EVIDENCE_PATH, "utf8");
    const result = run(["--print-probe"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("securitypolicyviolation");
    expect(readFileSync(EVIDENCE_PATH, "utf8")).toBe(before);
  });
});
