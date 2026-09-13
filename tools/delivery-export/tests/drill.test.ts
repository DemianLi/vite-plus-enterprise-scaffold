import { describe, expect, it } from "vitest";

import { sandbox } from "@org/gate-kit/testing";

import { artifactStep } from "../src/drill.ts";

/**
 * 只守演練的最後一步。前兩步（離線安裝、建置）要真的叫 pnpm，沒有放進測試 ——
 * 它們只由 C248 §三 那幾趟手動 CLI 走過，④ 接線之後由閘門鏈每一趟走。
 */
describe("演練的產物檢查：建置綠不等於有產物", () => {
  it("每個出門的應用都有 dist/index.html 才算過", () => {
    const { root } = sandbox({ files: { "apps/a/dist/index.html": "<!doctype html>" } });
    expect(artifactStep(root, ["apps/a"]).ok).toBe(true);
  });

  it("★ 少一個就紅，訊息說缺哪一個", () => {
    const { root } = sandbox({ files: { "apps/a/dist/index.html": "<!doctype html>" } });
    const step = artifactStep(root, ["apps/a", "apps/b"]);
    expect(step.ok).toBe(false);
    expect(step.output).toContain("apps/b");
  });

  it("沒有任何應用出門也是紅 —— 零個應用「全數有產物」是空真", () => {
    const { root } = sandbox({ files: { "README.md": "" } });
    expect(artifactStep(root, []).ok).toBe(false);
  });
});
