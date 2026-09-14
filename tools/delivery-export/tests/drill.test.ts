import { describe, expect, it } from "vitest";

import { sandbox } from "@org/gate-kit/testing";

import { artifactStep } from "../src/drill.ts";
import { run } from "../src/export.ts";

/**
 * 只守演練的最後一步。前兩步（離線安裝、建置）要真的叫套件管理器，沒有放進測試 ——
 * 它們由閘門鏈每一趟走（`vpr delivery-check`，C252）。快取不齊時剪 lockfile 會紅的那一種壞法，
 * 只有乾淨的 CI runner 看得到。
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

describe("叫不到執行檔時，紅字要說得出原因", () => {
  it("★ 執行檔不存在 → 失敗，輸出帶著系統的錯誤（C252 之前這裡是一片空白）", () => {
    const { root } = sandbox({ files: { "README.md": "" } });
    const step = run("delivery-export-no-such-binary", ["install"], root, "安裝");
    expect(step.ok).toBe(false);
    expect(step.output).toContain("ENOENT");
  });
});
