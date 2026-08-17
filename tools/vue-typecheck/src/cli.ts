#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverPrograms, missingViews, type Program } from "./programs.ts";
import { runVueTsc } from "./run.ts";

/**
 * `.vue` 的型別檢查（HANDOFF #26 → C68）。
 *
 * ── 為什麼需要一支獨立的工具 ────────────────────────────────────────
 *
 * `vp check` 的型別那一段是 oxlint 的 tsgolint，**它不看 `.vue`**。
 * 實測：同一行 `const broken: number = "顯然是字串"` 放進 SFC 是 0 errors、
 * 放進 `.ts` 是 1 error。也就是說設計系統的元件原始碼在 2026-08-17 之前
 * **一行型別檢查都沒有跑過**。
 *
 * ── 代價要說在最前面：這個 repo 因此有兩個 TypeScript ────────────────
 *
 * `catalog` 的 `typescript: ^7.0.2` 是原生 Go 版，已經沒有 JS 版的 compiler
 * API（`Object.keys(require("typescript")).length === 2`）。而 `vue-tsc` →
 * `@volar/typescript` 需要那組 API。所以本 package 用具名 catalog
 * `catalog:vue-typecheck` 拉一份 JS 版的 TypeScript 5.x。
 *
 * **兩支編譯器對同一份 `.ts` 給出不同判決的話，這道閘門會被關掉（C57）。**
 * 那個風險量過：接上當天 vue-tsc 把這四份 program 裡的每一支 `.ts` 都檢查了，
 * 產出 0 條 tsgolint 沒有的診斷。升 vite-plus 或 TS 時要重跑那個比對。
 *
 * ── 刻意不開 `strictTemplates` ──────────────────────────────────────
 *
 * 乾跑量過（C55）：開了會多 2 條，兩條都是 `<UiButton @click="…">`。
 * `UiButton` 沒宣告 `click`，靠的是 fallthrough attr 落到根 `<button>` ——
 * 而**加 `defineEmits` 反而會關掉 fallthrough**，是真的行為迴歸。
 * 也就是說那 2 條要求的「修法」比病還糟，所以不開（C41）。
 *
 * 不開的代價是抓不到「prop 名字打錯」。已經抓得到的：prop 型別、缺必填 prop、
 * slot payload 型別（那一條正是 #24 留下的第一個殘留）。
 *
 * ── 這支工具抓不到什麼 ──────────────────────────────────────────────
 *
 * `<template #不存在的slot>` 不會紅，開 `strictTemplates` 也不會。
 * `@vue/language-core` 3.x 只有 `checkUnknownProps`／`Events`／`Components`／
 * `Directives`／`strictVModel` 五個旋鈕，沒有 unknown slot 這一項 ——
 * 是這支工具沒有這個能力，不是設定沒開。宣告與模板的一致性由
 * `tools/api-surface` 守（C67），兩邊合起來才是完整的。
 */

const HERE = resolvePath(fileURLToPath(import.meta.url), "..");
const ROOT = resolvePath(HERE, "../../..");
const BIN = join(HERE, "../node_modules/vue-tsc/bin/vue-tsc.js");

let failures = 0;

function fail(rule: string, detail: string, fix: string): void {
  failures++;
  console.error(`\n✗ ${rule}\n  ${detail}\n  → ${fix}`);
}

function checkCoverage(program: Program, files: readonly string[]): void {
  const missing = missingViews(ROOT, program, files);
  if (missing.length === 0) return;
  fail(
    "program 沒讀到該讀的 .vue",
    `${program.tsconfig} 的檔案清單裡缺了：${missing.join("、")}`,
    "檢查該 package tsconfig 的 include —— 沒被讀到的檔案，錯誤數永遠是 0",
  );
}

function main(): void {
  if (!existsSync(BIN)) {
    fail(
      "找不到 vue-tsc",
      `${relative(ROOT, BIN)} 不存在`,
      "跑 `vp install`。它在 tools/vue-typecheck 的 devDependencies 裡",
    );
    process.exit(1);
  }

  const programs = discoverPrograms(ROOT);
  if (programs.length === 0) {
    fail(
      "一份 program 都沒推導出來",
      "整個 workspace 找不到任何非 fixture 的 .vue",
      "這條檢查掃不到東西時會全綠 —— 所以這裡直接紅",
    );
    process.exit(1);
  }

  // 四份 program 大量重疊（每一份都會拉進 platform/ui 的兩個元件），所以
  // **同一個缺陷會被回報四次**。按位置去重，把回報它的 program 併在一起 ——
  // 那個清單有資訊：`$t` 那一類正是「同一個檔案在 A 裡乾淨、在 B 裡是錯的」。
  const found = new Map<string, { readonly detail: string; readonly programs: string[] }>();
  let views = 0;

  for (const program of programs) {
    const result = runVueTsc(BIN, ROOT, program.tsconfig);
    views += program.views.length;
    checkCoverage(program, result.files);

    for (const diagnostic of result.diagnostics) {
      const where =
        diagnostic.file === null
          ? program.tsconfig
          : `${relative(ROOT, diagnostic.file)}:${diagnostic.line}`;
      const key = `${where} ${diagnostic.code} ${diagnostic.text}`;
      const entry = found.get(key) ?? {
        detail: `${where}\n  ${diagnostic.code}: ${diagnostic.text}`,
        programs: [],
      };
      entry.programs.push(program.dir);
      found.set(key, entry);
    }

    // 沒有診斷卻非 0 —— 例如 OOM 或被砍掉。當成通過的話這道閘門就是裝飾品。
    if (result.status !== 0 && result.diagnostics.length === 0) {
      fail(
        "vue-tsc 非正常結束",
        `${program.tsconfig} 回傳 ${result.status}，但一條診斷都沒有`,
        "手動跑一次看它印什麼",
      );
    }
  }

  for (const { detail, programs: where } of found.values()) {
    fail(".vue 型別錯誤", `${detail}\n  （回報者：${where.join("、")}）`, "修掉它");
  }

  if (failures > 0) {
    console.error(`\n✗ .vue 型別檢查：${failures} 個問題`);
    process.exit(1);
  }
  console.log(`✓ .vue 型別檢查通過（${programs.length} 份 program、${views} 個 SFC）`);
}

main();
