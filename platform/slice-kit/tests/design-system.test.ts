import { describe, it, expect } from "vitest";

import {
  usesDesignSystem,
  DESIGN_SYSTEM_PACKAGE,
  SLICE_DESIGN_SYSTEM_IMPORTS,
} from "../src/contract.ts";

/**
 * `usesDesignSystem` 的正反測試。
 *
 * ── 為什麼這支測試值得存在 ──────────────────────────────────────────
 *
 * 這個判定式是一道 Tier 2 閘門的**唯一**依據。它偏任何一邊的代價都不對稱：
 *
 *   偏鬆（該紅沒紅）→ 規則等於不存在，而 CI 全綠，沒有人會發現
 *   偏緊（不該紅卻紅）→ 有人會加 skip，然後那個 skip 永遠不會拿掉
 *
 * 所以下面每一組都成對出現：**一個該 true、一個該 false**。
 * 只驗 true 的那半邊，一個 `return true` 就能通過全部。
 */

describe("usesDesignSystem —— 認得出真的用了", () => {
  it("具名匯入", () => {
    expect(usesDesignSystem(`import { UiButton } from "${DESIGN_SYSTEM_PACKAGE}";`)).toBe(true);
  });

  it(".vue 的 <script setup> 區塊（這才是實際會被掃到的形狀）", () => {
    const sfc = `<script setup lang="ts">
import { computed } from "vue";
import { UiButton, UiDialog } from "${DESIGN_SYSTEM_PACKAGE}";
</script>

<template><UiButton /></template>
`;
    expect(usesDesignSystem(sfc)).toBe(true);
  });

  it("動態 import", () => {
    expect(usesDesignSystem(`const ui = await import("${DESIGN_SYSTEM_PACKAGE}");`)).toBe(true);
  });
});

describe("usesDesignSystem —— 認得出沒用", () => {
  it("完全沒提到", () => {
    const view = `<template><h1>{{ title }}</h1><table /></template>`;
    expect(usesDesignSystem(view)).toBe(false);
  });

  it("只 import 了別的東西", () => {
    expect(usesDesignSystem(`import { computed } from "vue";`)).toBe(false);
  });

  /**
   * 這一條是整支測試的重點。
   *
   * `import type` 在 verbatimModuleSyntax 下會被**完全抹除** ——
   * 執行期一個位元組都不剩，畫面上不會有任何東西來自設計系統。
   * 放行它，這條規則就變成一行就能滿足的形式主義。
   */
  it("借型別不算用過", () => {
    expect(usesDesignSystem(`import type { ButtonSize } from "${DESIGN_SYSTEM_PACKAGE}";`)).toBe(
      false,
    );
  });

  it("同一個檔案裡有 type import，也有真的 import → 算用過", () => {
    const source = `import type { ButtonSize } from "${DESIGN_SYSTEM_PACKAGE}";
import { UiButton } from "${DESIGN_SYSTEM_PACKAGE}";
`;
    expect(usesDesignSystem(source)).toBe(true);
  });

  /**
   * 只在註解或文件裡提到不算。
   *
   * 產生器產出的每個檔案都在註解裡寫著「一律走 @org/ui」——
   * 用 `includes("@org/ui")` 實作的話，**每個切片都會自動通過**，
   * 而那個版本的規則什麼都沒驗到。
   */
  it("只在註解裡提到不算", () => {
    const source = `// 畫面元件一律從 ${DESIGN_SYSTEM_PACKAGE} 取用（D15）。
import { computed } from "vue";
`;
    expect(usesDesignSystem(source)).toBe(false);
  });

  it("import 一個名字**開頭相同**的別的套件不算", () => {
    // "@org/ui-survey" 以 "@org/ui" 開頭。用 startsWith 實作就會誤判。
    expect(usesDesignSystem(`import { x } from "${DESIGN_SYSTEM_PACKAGE}-survey";`)).toBe(false);
  });
});

describe("兩條 D15 規則指向同一個入口", () => {
  it("設計系統套件本身不在禁止清單裡（否則規則自相矛盾）", () => {
    // 這條看似廢話，但它釘住的是一個真的會發生的錯誤：
    // 有人把 "@org/ui" 加進 SLICE_DESIGN_SYSTEM_IMPORTS，於是切片
    // 「必須用它」和「不准用它」同時成立，兩道閘門互相打架。
    expect(SLICE_DESIGN_SYSTEM_IMPORTS as readonly string[]).not.toContain(DESIGN_SYSTEM_PACKAGE);
  });
});
