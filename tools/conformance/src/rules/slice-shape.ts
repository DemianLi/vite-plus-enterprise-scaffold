import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  REQUIRED_FILES,
  USECASE_COVERAGE_GLOB,
  USECASE_COVERAGE_MIN,
  isValidSliceDir,
  slicePackageName,
} from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";
import { hasTestFile } from "../scan.ts";

/** 目錄名本身。切片的名字會變成套件名、CODEOWNERS 路徑與 `--filter` 的參數。 */
export function checkSliceNaming(dir: string, slice: string): Finding[] {
  return collect((fail) => {
    if (!isValidSliceDir(dir)) {
      fail(
        slice,
        "命名",
        `目錄名 "${dir}" 不是 kebab-case`,
        "改成小寫加連字號，例如 order-history",
      );
    }
  });
}

/** 契約列出來的那幾個檔案。缺一個就表示這片不是從產生器出來的，或被改壞了。 */
export function checkRequiredFiles(slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    for (const file of REQUIRED_FILES) {
      if (!existsSync(join(slicePath, file))) {
        fail(
          slice,
          "必要檔案",
          `缺少 ${file}`,
          `建立 ${slice}/${file}，或用 vp create @org:slice 重新產生`,
        );
      }
    }
  });
}

/** 套件名必須由目錄名推導得出，否則 `--filter` 與 CODEOWNERS 會對不上。 */
export function checkPackageName(
  pkg: Record<string, unknown>,
  dir: string,
  slice: string,
): Finding[] {
  return collect((fail) => {
    const expectedName = slicePackageName(dir);
    if (pkg["name"] !== expectedName) {
      fail(
        slice,
        "套件命名",
        `package.json 的 name 是 "${String(pkg["name"])}"，應為 "${expectedName}"`,
        `把 name 改成 "${expectedName}"，否則 --filter 與 CODEOWNERS 對不上`,
      );
    }
  });
}

/** 有沒有測試。 */
export function checkSliceTests(slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    if (!hasTestFile(slicePath)) {
      fail(
        slice,
        "測試",
        "找不到任何 tests/**/*.test.ts",
        "沒有測試的切片＝沒有人能安全重構的切片。至少為主要流程補一支測試",
      );
    }
  });
}

/**
 * 覆蓋率門檻有沒有真的會跑。
 *
 * C120 §一 把門檻放進切片自己的 `vite.config.ts`，而覆蓋率預設是關的：
 * 少了 `enabled: true`，門檻只在有人手動加 `--coverage` 時存在，`vp test` 照樣綠。
 * 也就是一片切片自己一行就能把自己的門檻關掉，而 `vpr ready` 看不出來（#299）。
 * 範本那一份由 slice-gen 的測試守，但那守的是產出那一刻；樹上的三片是人手改的。
 *
 * ⚠️ 讀原文而不 import 設定物件：conformance 跑在 bare node，import 切片的設定會把
 * `vite-plus` 與 `@vitejs/plugin-vue` 拉進閘門的執行期。先去掉註解再比對 ——
 * 這幾支檔的註解裡本來就有 `enabled` 這個字。
 */
export function checkCoverageGate(slicePath: string, slice: string): Finding[] {
  return collect((fail) => {
    const configPath = join(slicePath, "vite.config.ts");
    if (!existsSync(configPath)) {
      fail(
        slice,
        "覆蓋率門檻",
        "缺少 vite.config.ts —— 覆蓋率門檻住在那裡（C120）",
        "用 vp create @org:slice 重新產生，或照 features/order/vite.config.ts 補一份",
      );
      return;
    }

    const code = readFileSync(configPath, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    const required: readonly (readonly [RegExp, string, string])[] = [
      [
        /coverage\s*:/,
        "缺少 coverage 區塊 —— 覆蓋率門檻住在那裡（C120）",
        "照 features/order/vite.config.ts 的 test.coverage 補一份",
      ],
      [
        /enabled\s*:\s*true/,
        "coverage 區塊沒有 enabled: true —— 覆蓋率預設是關的，門檻只在有人加 --coverage 時存在（C120）",
        "加一行 enabled: true",
      ],
      [
        /\bUSECASE_COVERAGE_GLOB\b/,
        `沒有引用 USECASE_COVERAGE_GLOB —— 門檻的 glob 必須從契約取（C119），契約值 ${USECASE_COVERAGE_GLOB}`,
        "thresholds 的鍵用 [USECASE_COVERAGE_GLOB]",
      ],
      [
        /\bUSECASE_COVERAGE_MIN\b/,
        `沒有引用 USECASE_COVERAGE_MIN —— 門檻的數字必須從契約取（C119），契約值 ${USECASE_COVERAGE_MIN}`,
        "thresholds 的各項度量用 USECASE_COVERAGE_MIN",
      ],
    ];
    for (const [pattern, problem, fix] of required) {
      if (!pattern.test(code)) fail(slice, "覆蓋率門檻", problem, fix);
    }
  });
}
