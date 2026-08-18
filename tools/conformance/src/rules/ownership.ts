import { REQUIRE_CODEOWNERS_ENTRY } from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";

/**
 * D12：每一片都要有 owner。
 *
 * CODEOWNERS 的內容由呼叫端讀好傳進來 —— 它對每一片都一樣，
 * 而在這裡讀等於切片數乘以三次 `existsSync`。
 */
export function checkOwnership(dir: string, slice: string, codeowners: string): Finding[] {
  return collect((fail) => {
    if (REQUIRE_CODEOWNERS_ENTRY && !codeowners.includes(`/features/${dir}/`)) {
      fail(
        slice,
        "擁有權",
        "CODEOWNERS 沒有對應條目",
        `在 CODEOWNERS 加入 "/features/${dir}/ @your-team"。沒有 owner 的切片＝沒人負責的切片`,
      );
    }
  });
}
