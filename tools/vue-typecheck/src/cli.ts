#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFlags } from "@org/gate-kit";

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
 * ── 而那第二個 TypeScript 不只是成本，它看得見 `vp check` 看不見的東西 ──
 *
 * 落地當天的說法是「分歧上界 0，升級時要重跑比對」。**那個說法是錯的**，
 * 而且錯在方向：分歧不但存在，還是這道閘門的**能力**。實測（`.ts` 檔）：
 *
 * ```ts
 * import UiButton from "./components/UiButton.vue";
 * h(UiButton, { variant: "根本不是 variant" });
 * ```
 *
 * `vp check` → **0 errors**；這道閘門 → 紅。因為 tsgolint 看的是
 * `declare module "*.vue"` 那個萬用宣告（props 是 `Record<string, unknown>`，
 * 任何 prop 都合法），vue-tsc 解析真的 SFC。
 *
 * ⚠️ 所以**「一邊紅一邊綠」不是分歧警訊，多半是真陽性** —— 這一點必須寫在
 * 紅燈訊息裡，否則第一個撞到的人會以為是工具在吵架，然後把閘門關掉（C41）。
 *
 * 反方向也有一個實例，而那次是 tsgolint 對的：把 `import` 加進 `env.d.ts`
 * 會讓 `declare module "*.vue"` 失效，`vp check` 紅、vue-tsc 全綠。
 * **兩支編譯器各自有對方看不見的東西，沒有一支涵蓋另一支。**
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
 * ⚠️ **那個代價在採用演練裡真的被踩到了**（`#95`）：照 `UiButton` 的習慣寫
 * `<UiAlert variant="danger">`，全套閘門綠，而錯誤提示安靜地渲染成 info 色。
 *
 * ⚠️ **所以 C101 又量了一次 —— 這次是單獨的那顆旋鈕，不是 `strictTemplates`。**
 * 上面那段講「五個旋鈕」，而 C55 那 2 條誤報全是 **events**，所以
 * 「只開 `checkUnknownProps`」看起來是一條沒被試過的路。量下來：
 *
 *     只開 checkUnknownProps                → 28 條，**全部**是 `data-slot`
 *     把 data-slot 用型別擴充正名之後        → 換成 `aria-invalid`／`aria-describedby` 那一批
 *
 * 後面那一批正是 `UiField` 的 `control` 物件靠 fallthrough 傳下去的東西 ——
 * **這個元件庫的設計整體建立在 fallthrough attrs 上**，而這顆旋鈕與那個設計
 * 衝突，不是設定沒調對。結論與 C55 相同，只是量得更細。
 *
 * **不要再量第三次。** 要改的話，要改的是元件的接線設計，不是這顆旋鈕。
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
/**
 * ⚠️ **這支不吃任何旗標 —— 而「不吃」必須是一句話，不是一片沉默**（C126）。
 *
 * 空 spec 在 `parseFlags` 底下的意思是**拒絕所有旗標**，不是放行所有旗標。
 * 少了這三行，`node <這支> --anything` 會靜靜地跑一趟預設路徑然後回 0 ——
 * 而 CI 上留著一個被拿掉的旗標時，那一步會頂著它原本的名字回傳綠燈
 * （C52 付過這筆學費，完整量測在 C125 §一）。
 */
const FLAGS = parseFlags(process.argv.slice(2), {});
if (!FLAGS.ok) {
  console.error(FLAGS.message);
  process.exit(1);
}

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
  const found = new Map<
    string,
    { readonly detail: string; readonly isView: boolean; readonly programs: string[] }
  >();
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
        isView: diagnostic.file?.endsWith(".vue") ?? false,
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

  for (const { detail, isView, programs: where } of found.values()) {
    const suffix = `\n  （回報者：${where.join("、")}）`;
    if (isView) {
      fail(".vue 型別錯誤", `${detail}${suffix}`, "修掉它");
      continue;
    }
    // ⚠️ **不是 `.vue` 的診斷要分開講，而且不要叫人去看 vp check 有沒有分歧。**
    // 實測過：這一類多半是 `vp check` **看不到**的真缺陷，不是兩支編譯器吵架。
    fail(
      "型別錯誤（`vp check` 很可能是綠的）",
      `${detail}${suffix}`,
      "照樣修掉它。vp check 綠燈不代表這條是誤報 —— 它看的是 " +
        '`declare module "*.vue"` 那個萬用宣告，vue-tsc 解析真的 SFC，兩邊看到的不是同一個型別（C68）',
    );
  }

  if (failures > 0) {
    console.error(`\n✗ .vue 型別檢查：${failures} 個問題`);
    process.exit(1);
  }
  console.log(`✓ .vue 型別檢查通過（${programs.length} 份 program、${views} 個 SFC）`);
}

main();
