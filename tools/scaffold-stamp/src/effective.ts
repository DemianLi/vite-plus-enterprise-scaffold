import { matchesGlob } from "node:path";
import { isDeepStrictEqual } from "node:util";

import type { Problem } from "./stamp.ts";

/**
 * 生效設定：團隊那一半有沒有蓋掉腳手架那一半（C220 Q35）。
 *
 * 章守得住 `vite.scaffold.ts` 的位元組，守不住根層寫在 spread **之後**的同名規則 ——
 * 團隊把 `no-eval` 關掉，`vite.scaffold.ts` 一個位元組都沒動（C219 §六）。那正是
 * AGENTS.md 規則二「修改設定來達成綠燈」的形狀，所以這一格比對的是 oxlint **實際生效**
 * 的設定，不是原始碼。
 *
 * ⚠️ 事實來源是 `vp lint --print-config`（繞過 `vp` 拿到的是預設集）—— 這一格因此綁死
 * 驅動層，而那是這道閘門在 Tier 1 不在 Tier 2 的理由（tier2-security.yml 檔頭的 D2 保單）。
 *
 * ⚠️ 它看不到「團隊新加一條腳手架沒提過的規則，落在 `tools/`、`platform/` 上」——
 * 那不是蓋掉，是新增；見 C220 §六。
 */

interface Override {
  readonly files: readonly string[];
  readonly rules: Readonly<Record<string, unknown>>;
}

export interface ScaffoldHalf {
  readonly lint: {
    readonly plugins: readonly string[];
    readonly rules: Readonly<Record<string, unknown>>;
    readonly options: Readonly<Record<string, unknown>>;
  };
  readonly overrides: readonly Override[];
}

interface Printed {
  readonly plugins: readonly string[];
  readonly rules: Readonly<Record<string, unknown>>;
  readonly options: Readonly<Record<string, unknown>>;
  readonly overrides: readonly Override[];
  readonly ignorePatterns: readonly string[];
}

const SEVERITY: Readonly<Record<string, string>> = {
  error: "deny",
  deny: "deny",
  warn: "warn",
  off: "allow",
  allow: "allow",
};

/** 原始碼的寫法 → `--print-config` 的寫法：`"error"` → `"deny"`，`["error", {…}]` → `["deny", [{…}]]`。 */
export function normalizeRule(rule: unknown): unknown {
  if (typeof rule === "string") return SEVERITY[rule] ?? rule;
  if (!Array.isArray(rule)) return rule;
  const [severity, ...options] = rule as unknown[];
  const normalized = normalizeRule(severity);
  return options.length === 0 ? normalized : [normalized, options];
}

function normalizeRules(rules: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => [name, normalizeRule(rule)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPrinted(value: unknown): Printed | undefined {
  if (!isRecord(value)) return undefined;
  const { plugins, rules, options, overrides, ignorePatterns } = value;
  if (!Array.isArray(plugins) || !isRecord(rules) || !isRecord(options)) return undefined;
  if (!Array.isArray(overrides)) return undefined;
  return {
    plugins: plugins as string[],
    rules,
    options,
    overrides: overrides.filter(isRecord).map((entry) => ({
      files: Array.isArray(entry["files"]) ? (entry["files"] as string[]) : [],
      rules: isRecord(entry["rules"]) ? entry["rules"] : {},
    })),
    ignorePatterns: Array.isArray(ignorePatterns) ? (ignorePatterns as string[]) : [],
  };
}

const show = (value: unknown): string => (value === undefined ? "（沒有）" : JSON.stringify(value));

function checkBase(half: ScaffoldHalf, printed: Printed): Problem[] {
  const problems: Problem[] = [];
  for (const [name, rule] of Object.entries(half.lint.rules)) {
    const actual = printed.rules[name];
    if (isDeepStrictEqual(actual, normalizeRule(rule))) continue;
    problems.push({
      kind: "腳手架的規則被蓋掉了",
      detail: `${name}：vite.scaffold.ts 寫 ${show(rule)}，生效的是 ${show(actual)}`,
    });
  }
  for (const plugin of half.lint.plugins) {
    if (!printed.plugins.includes(plugin)) {
      problems.push({ kind: "腳手架的外掛被拿掉了", detail: plugin });
    }
  }
  for (const [key, value] of Object.entries(half.lint.options)) {
    if (isDeepStrictEqual(printed.options[key], value)) continue;
    problems.push({
      kind: "腳手架的選項被改了",
      detail: `${key}：vite.scaffold.ts 寫 ${show(value)}，生效的是 ${show(printed.options[key])}`,
    });
  }
  return problems;
}

/**
 * 腳手架那一串 override 必須原樣排在**最後**（C219 §二：後者蓋前者）；排在它前面的是
 * 團隊的，而團隊的 override 不得提到腳手架的基礎規則 —— 那是換一個位置的「蓋掉」。
 */
function checkOverrides(half: ScaffoldHalf, printed: Printed): Problem[] {
  const count = half.overrides.length;
  const tail = printed.overrides.slice(-count);
  const problems: Problem[] = [];
  for (const [at, expected] of half.overrides.entries()) {
    const actual = printed.overrides.length < count ? undefined : tail[at];
    const same =
      actual !== undefined &&
      isDeepStrictEqual(actual.files, expected.files) &&
      isDeepStrictEqual(actual.rules, normalizeRules(expected.rules));
    if (same) continue;
    problems.push({
      kind: "腳手架的 override 不在最後，或被改了",
      detail: `scaffoldOverrides 第 ${at + 1} 條（${expected.files.join("、")}）`,
    });
  }

  const base = new Set(Object.keys(half.lint.rules));
  const team = printed.overrides.slice(0, Math.max(0, printed.overrides.length - count));
  for (const [at, entry] of team.entries()) {
    const hits = Object.keys(entry.rules).filter((name) => base.has(name));
    if (hits.length === 0) continue;
    problems.push({
      kind: "團隊的 override 蓋掉了腳手架的規則",
      detail: `overrides[${at}]（${entry.files.join("、")}）：${hits.join("、")}`,
    });
  }
  return problems;
}

function checkIgnores(printed: Printed, protectedPaths: readonly string[]): Problem[] {
  const problems: Problem[] = [];
  for (const pattern of printed.ignorePatterns) {
    const directory = `${pattern.replace(/\/+$/, "")}/**`;
    const hit = protectedPaths.find(
      (path) => matchesGlob(path, pattern) || matchesGlob(path, directory),
    );
    if (hit === undefined) continue;
    problems.push({
      kind: "腳手架的檔被排除在 lint 之外",
      detail: `ignorePatterns 的 ${pattern} 命中 ${hit}`,
    });
  }
  return problems;
}

export function checkEffective(
  half: ScaffoldHalf,
  printConfig: unknown,
  protectedPaths: readonly string[],
): Problem[] {
  const printed = asPrinted(printConfig);
  if (printed === undefined) {
    return [{ kind: "讀不懂生效設定", detail: "vp lint --print-config 的輸出不是預期的形狀" }];
  }
  return [
    ...checkBase(half, printed),
    ...checkOverrides(half, printed),
    ...checkIgnores(printed, protectedPaths),
  ];
}
