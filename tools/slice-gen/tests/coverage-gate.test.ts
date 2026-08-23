import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { USECASE_COVERAGE_GLOB, USECASE_COVERAGE_MIN } from "@org/slice-kit/contract";
import { buildSliceFiles } from "../src/files.ts";

/**
 * 覆蓋率門檻的**反向測試** —— 證明那條線真的會開火（C120）。
 *
 * ── 為什麼需要這一支 ────────────────────────────────────────────────
 *
 * 這棵樹上**沒有任何一列會讓它紅**：門檻收在 `src/usecases/**`，而版控裡
 * 兩支示範切片都沒有那一層（C114 §六 刻意保留的狀態）。一個永遠 exit 0
 * 的門檻，與「沒有門檻」在輸出上完全一樣 —— 這正是 `spec-report` 設計時
 * 多長出來的第四態「未執行」（C115）。
 *
 * 而覆蓋率門檻有一個自己的版本：**glob 沒有命中任何檔案時，它靜默通過、
 * exit 0**（實測，見 C120）。打錯字與「這個目錄本來就沒有東西」長得一模
 * 一樣。所以「設定寫在那裡」證明不了任何事，要證明的是：
 *
 *   1. 產生器**真的**產出那份設定（下面 §一，靜態）
 *   2. 那份設定**真的**會在 usecase 沒被走完時紅（下面 §二，真的跑一次）
 *
 * ── 為什麼跑得起來 ──────────────────────────────────────────────────
 *
 * 暫存專案建在這個 package 底下，所以 `vite-plus`／`vitest`／
 * `@vitest/coverage-v8`／`@vitejs/plugin-vue`／`@org/slice-kit` 全部由
 * node 往上找 `node_modules` 解析得到。放到系統暫存目錄就解析不到，
 * 那也是 `tools/vue-typecheck` 的 fixture 建在 repo 內的同一個理由。
 *
 * ⚠️ 用的是**產生器產出的那一份 `vite.config.ts` 原文**，不是重寫一份
 * 等價的設定。重寫一份的話，這支測試證明的是它自己。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", ".tmp-coverage-gate");
const VITEST_BIN = resolve(HERE, "../node_modules/.bin/vitest");

const generated = buildSliceFiles({ name: "probe", title: "探針", team: "@org/team-x" });
const viteConfig = generated["vite.config.ts"];

/** 兩個分支的 usecase。覆蓋率門檻要看的就是這種東西。 */
const USECASE = `export function pick(flag: boolean): string {
  if (flag) return "yes";
  return "no";
}
`;

/** 只走一個分支 —— 行 100%、分支 50%。 */
const HALF_COVERED = `import { it, expect } from "vitest";
import { pick } from "../src/usecases/probe.ts";

it("只走 true 那一支", () => {
  expect(pick(true)).toBe("yes");
});
`;

/** 兩個分支都走。 */
const FULLY_COVERED = `import { it, expect } from "vitest";
import { pick } from "../src/usecases/probe.ts";

it("兩支都走", () => {
  expect(pick(true)).toBe("yes");
  expect(pick(false)).toBe("no");
});
`;

function write(relative: string, contents: string): void {
  const target = join(FIXTURE, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, "utf8");
}

function runFixture(): { status: number | null; output: string } {
  const result = spawnSync(VITEST_BIN, ["run"], { cwd: FIXTURE, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

beforeAll(() => {
  rmSync(FIXTURE, { recursive: true, force: true });
  write("package.json", `{ "name": "coverage-gate-fixture", "private": true, "type": "module" }\n`);
  write("vite.config.ts", typeof viteConfig === "string" ? viteConfig : "");
  write("src/usecases/probe.ts", USECASE);
});

afterAll(() => {
  rmSync(FIXTURE, { recursive: true, force: true });
});

describe("一、產生器真的產出那份設定", () => {
  it("切片帶一支 vite.config.ts", () => {
    expect(typeof viteConfig).toBe("string");
  });

  it("門檻的 glob 與數字從契約取，不是字面值", () => {
    // 寫死字串的話，`USECASES_DIR` 改名時設定會安靜地失效 —— glob 不命中
    // 不會報錯。這一條盯的就是那個。
    expect(viteConfig).toContain("USECASE_COVERAGE_GLOB");
    expect(viteConfig).toContain("USECASE_COVERAGE_MIN");
    expect(viteConfig).toContain('from "@org/slice-kit/contract"');
  });

  it("★ 覆蓋率預設開著 —— 少了這一行，門檻只在有人加 --coverage 時存在", () => {
    expect(viteConfig).toContain("enabled: true");
  });

  it("★ glob 不是空砲：產出的切片真的有 usecase 檔", () => {
    // 這一條擋的是「門檻永遠命中零個檔案」。它與打錯字同形，而且是綠的。
    const paths = Object.keys(generated["src"] as Record<string, unknown>);
    expect(paths).toContain("usecases");
    expect(USECASE_COVERAGE_GLOB.startsWith("src/usecases/")).toBe(true);
  });

  it("provider 與 vue plugin 列在切片自己的相依裡（C111）", () => {
    const pkg = JSON.parse(generated["package.json"] as string) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies["@vitest/coverage-v8"]).toBe("catalog:");
    expect(pkg.devDependencies["@vitejs/plugin-vue"]).toBe("catalog:");
  });
});

describe("二、那份設定真的會開火", () => {
  it(`🔴 usecase 的分支沒走完 → 紅，而且訊息指名那條 glob`, () => {
    write("tests/probe.test.ts", HALF_COVERED);
    const run = runFixture();

    expect(run.status, `應該紅卻是 ${run.status}：\n${run.output}`).not.toBe(0);
    expect(run.output).toContain(USECASE_COVERAGE_GLOB);
    expect(run.output).toContain(String(USECASE_COVERAGE_MIN));
  }, 60_000);

  it("✅ 同一份設定、同一支 usecase，走完就綠 —— 紅不是設定本身有毛病", () => {
    write("tests/probe.test.ts", FULLY_COVERED);
    const run = runFixture();

    expect(run.status, run.output).toBe(0);
  }, 60_000);
});
