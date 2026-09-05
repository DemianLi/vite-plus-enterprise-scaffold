import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Finding } from "../finding.ts";
import { readJson } from "../scan.ts";
import { checkDesignSystemAdoption, checkDesignSystemBoundary } from "./design-system.ts";
import { checkSliceDependencies } from "./dependencies.ts";
import { checkSliceLayering } from "./layering.ts";
import { checkOwnership } from "./ownership.ts";
import { checkRelativeEscapes } from "./relative-escape.ts";
import {
  checkCoverageGate,
  checkPackageName,
  checkRequiredFiles,
  checkSliceNaming,
  checkSliceTests,
} from "./slice-shape.ts";

/**
 * 一個切片要過的全部規則，照原本的順序。
 *
 * ── 這支不是規則，是組裝點 ──────────────────────────────────────────
 *
 * 它自己不判定任何事情，只決定**誰先跑**。而這件事有輸出上的後果：
 * 報告是照 finding 被記下來的順序印的，所以這裡的次序＝使用者看到的次序。
 * 改動它請當成改動輸出，不是改動內部結構。
 *
 * 中間那個提早結束不是最佳化：沒有 `package.json` 的話，後面每一條規則
 * 都會拿著 `undefined` 去比對，然後對同一個缺失重複回報六次。
 * 一片缺了 manifest，該說的話是「缺少 package.json」一句。
 */
export function checkSlice(
  root: string,
  dir: string,
  codeowners: string,
  sliceNames: ReadonlySet<string>,
): Finding[] {
  const slicePath = join(root, "features", dir);
  const slice = `features/${dir}`;

  const findings: Finding[] = [
    ...checkSliceNaming(dir, slice),
    ...checkRequiredFiles(slicePath, slice),
  ];

  const pkgPath = join(slicePath, "package.json");
  if (!existsSync(pkgPath)) return findings;

  const pkg = readJson(pkgPath);

  findings.push(
    ...checkPackageName(pkg, dir, slice),
    ...checkSliceTests(slicePath, slice),
    ...checkCoverageGate(slicePath, slice),
    ...checkSliceDependencies(pkg, dir, slice, sliceNames),
    // D4 第 3 層：相對路徑逃逸
    ...checkRelativeEscapes(root, slicePath, slice),
    // D14：切片內部分層（元件只呈現）
    ...checkSliceLayering(slicePath, slice),
    // D15：不得繞過設計系統自己拼一套
    ...checkDesignSystemBoundary(slicePath, slice),
    // D15：也不得「根本不用」
    ...checkDesignSystemAdoption(slicePath, slice),
    // D12：必須有 owner
    ...checkOwnership(dir, slice, codeowners),
  );

  return findings;
}
