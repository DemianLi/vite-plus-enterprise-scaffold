import type { Control, Gate } from "./map.ts";
import { danglingGateIds } from "./render.ts";

/**
 * 映射與檔案系統的一致性檢查 —— 純函式，`exists` 由呼叫端注入。
 *
 * 取數留在 cli.ts、判定留在這裡，理由與 `render.ts` 相同：這幾條判定
 * 本身就是這張表能不能被信任的全部依據，它們必須用固定的輸入測過，
 * 而不是靠「在真的 repo 上跑一次看看」——
 * 在真的 repo 上，「沒有錯誤」與「檢查根本沒跑到」長得一模一樣。
 */

/** 慣例上反向測試該住的位置。宣告為 null 時用它反查有沒有人偷偷補了。 */
export function conventionalNegativeTest(gateId: string): string {
  return `tools/${gateId}/tests/negative.test.ts`;
}

export function verifyMap(
  gates: readonly Gate[],
  controls: readonly Control[],
  exists: (repoRelativePath: string) => boolean,
): readonly string[] {
  const errors: string[] = [];

  for (const id of danglingGateIds(gates, controls)) {
    errors.push(`條號引用了不存在的閘門 id：${id}`);
  }

  const seen = new Set<string>();
  for (const gate of gates) {
    if (seen.has(gate.id)) errors.push(`閘門 id 重複：${gate.id}`);
    seen.add(gate.id);

    if (gate.evidence !== null && !exists(gate.evidence)) {
      errors.push(`${gate.id} 宣告的證據檔不存在：${gate.evidence}`);
    }

    // ── 高估方向：表上寫「已證明」，實際沒有 ──────────────────────
    // 這是危險的那一邊。稽核抽驗時當場破功。
    if (gate.negativeTest !== null) {
      if (!exists(gate.negativeTest)) {
        errors.push(
          `${gate.id} 宣告有反向測試，但檔案不存在：${gate.negativeTest}\n` +
            "      這是危險的方向 —— 表上寫著「已證明」，而實際沒有。",
        );
      }
      continue;
    }

    // ── 低估方向：補了測試卻沒更新映射 ────────────────────────────
    // 看起來無害，但假的洞會讓真的洞失去意義 ——
    // 一旦有人習慣「那幾格本來就是紅的」，這張表就不再被讀了。
    const conventional = conventionalNegativeTest(gate.id);
    if (exists(conventional)) {
      errors.push(
        `${gate.id} 在映射裡是「未證明」，但 ${conventional} 存在\n` +
          "      補了測試就要更新映射，否則表上會永遠掛著一個假的洞。",
      );
    }
  }

  return errors;
}
