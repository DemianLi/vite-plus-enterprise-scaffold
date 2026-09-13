import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pnpm, type Step } from "./export.ts";

/**
 * 在匯出那棵樹上重跑一次：repo 外的乾淨目錄、離線照 lockfile 安裝、建置（C231 §四.7）。
 *
 * C231 §二 驗的是「拿掉 `tools/` 的樹」，**不是匯出那棵** —— 改寫過的 manifest、剪過的
 * lockfile 與重寫的 `pnpm-workspace.yaml` 只有在這裡才一起被走過。
 *
 * ⚠️ 建置綠不等於有產物：每一個出門的應用都要留下 `dist/index.html`，否則這一步紅。
 */
/** 每一個出門的應用都要留下 `dist/index.html`；零個應用出門也算紅（全數有產物是空真）。 */
export function artifactStep(workdir: string, apps: readonly string[]): Step {
  const missing = apps.filter((app) => !existsSync(join(workdir, app, "dist/index.html")));
  return {
    name: `產物（${apps.join("、")} 的 dist/index.html）`,
    ok: apps.length > 0 && missing.length === 0,
    output: apps.length === 0 ? "沒有任何應用出門" : `缺：${missing.join("、")}`,
  };
}

export function drill(exportDir: string, apps: readonly string[]): readonly Step[] {
  const workdir = mkdtempSync(join(tmpdir(), "delivery-export-drill-"));
  try {
    cpSync(exportDir, workdir, {
      recursive: true,
      filter: (source) => !source.includes("/node_modules"),
    });
    const steps: Step[] = [
      pnpm(["install", "--frozen-lockfile", "--offline"], workdir, "離線照 lockfile 安裝"),
    ];
    if (steps[0]?.ok === true) steps.push(pnpm(["run", "build"], workdir, "建置"));
    if (steps.at(-1)?.ok === true && steps.length === 2) steps.push(artifactStep(workdir, apps));
    return steps;
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}
