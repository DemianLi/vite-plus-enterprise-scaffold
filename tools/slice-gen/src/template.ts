import { createTemplate } from "bingo";
import { z } from "zod";

import {
  assertCoversContract,
  flattenPaths,
  isValidSliceDir,
  toCamelCase,
} from "./contract-shape.ts";
import { buildSliceFiles } from "./files.ts";

/**
 * 切片產生器（D9）。
 *
 * ── 這支工具解決不了漂移，請不要期待它解決 ──────────────────────────
 *
 * 產生器只決定**起點**。第一天大家從同一個模板出發，三個月後 A 團隊的切片
 * 沒寫測試、B 團隊把 API 呼叫寫進元件、C 團隊偷偷加了跨切片依賴 ——
 * 產生器對這些一無所知，因為它只在建立那一刻跑過一次。
 *
 * 真正防退化的是 `tools/conformance`，它在 CI 每次都跑。
 *
 * 兩者的關係是本設計的核心：**它們讀同一份 `@org/slice-kit/contract`**。
 * 產生器產出的東西 ＝ 一致性檢查會驗的東西，兩者互為定義。
 * 契約若新增必要檔案而產生器沒跟上，`assertCoversContract` 會讓
 * 產生器自己的測試失敗 —— 而不是等到有人產出一個過不了 CI 的切片。
 */
export default createTemplate({
  about: {
    name: "@org/slice-gen",
    description: "產生一個符合契約的 vertical slice",
  },

  options: {
    // ⚠️ 這個選項刻意**不叫** `name`。
    // bingo 把 `name` 當作內建的「repository 名稱」並會從系統自動推斷，
    // 自訂同名選項會被它蓋掉，傳進 produce 的值不再是我們宣告的字串，
    // 症狀是 `kebab.split is not a function` —— 一個完全看不出根因的錯誤。
    slice: z
      .string()
      .describe("切片名（kebab-case），例如 order-history")
      // 命名規則來自契約，不在這裡重寫一份 —— 重寫就是漂移的開始。
      .refine(isValidSliceDir, {
        message:
          "切片名必須是 kebab-case：小寫開頭、只含小寫字母數字與單一連字號，且不得以連字號結尾",
      }),

    title: z.string().describe("顯示名稱，用於 i18n 與側邊欄，例如「訂單管理」"),

    team: z
      .string()
      .describe("CODEOWNERS 的負責團隊，例如 @org/team-fulfillment")
      .refine((value) => value.startsWith("@"), {
        message: "團隊名須以 @ 開頭（GitHub team 格式）",
      }),
  },

  async produce({ options }) {
    // bingo 會注入自己的內建選項並可能覆寫同名項目，因此在進入產生邏輯前
    // 明確驗一次型別 —— 沒有這道守衛，選項名撞號只會在深處噴出
    // 「split is not a function」，根因完全看不出來。
    for (const [key, value] of Object.entries({
      slice: options.slice,
      title: options.title,
      team: options.team,
    })) {
      if (typeof value !== "string") {
        throw new TypeError(
          `[slice-gen] 選項 --${key} 不是字串（收到 ${typeof value}）。` +
            `通常代表該選項名與 bingo 的內建選項撞號，請改名。`,
        );
      }
    }

    const files = buildSliceFiles({
      name: options.slice,
      title: options.title,
      team: options.team,
    });

    // 建置期自我檢查：產出是否涵蓋契約要求的每一個必要檔案。
    assertCoversContract(flattenPaths(files));

    const identifier = toCamelCase(options.slice);

    return {
      files,

      // 產生後立刻跑一次格式化。
      // 沒有這一步，每個人產完切片的第一件事都是修格式 —— 而「產生器的輸出
      // 過不了自己專案的 check」會很快讓人不信任這個工具。
      // 手工把樣板對齊 formatter 規則也可以，但那是會隨 oxfmt 版本失效的做法；
      // 直接讓 formatter 自己跑才是穩的。
      scripts: ["vp fmt ."],

      // 產生器只寫**新**檔案，不改既有檔案。
      // 下面兩步會動到全 repo 共用的檔案（CODEOWNERS 決定權責、features.ts
      // 決定系統組成），自動塞進去等於繞過 code review —— 那正是這兩個檔案
      // 存在的意義。所以刻意留給人做，並把要貼的內容準備好。
      suggestions: [
        `在 CODEOWNERS 加入這一行（沒有 owner 的切片＝沒人負責的切片）：\n` +
          `    /features/${options.slice}/          ${options.team}`,

        `在 apps/<app>/package.json 的 dependencies 加入這個切片\n` +
          `（少了這步，下一步的 import 會解析失敗 —— pnpm 是嚴格 node_modules，\n` +
          `未宣告的依賴就是 import 不到）：\n` +
          `    "@org/feature-${options.slice}": "workspace:*"`,

        `在 apps/<app>/src/features.ts 加入 import 與陣列項目：\n` +
          `    import ${identifier} from "@org/feature-${options.slice}";\n` +
          `    export const features: readonly Feature[] = [..., ${identifier}];`,

        `安裝依賴並驗證：\n` +
          `    vp install && node tools/conformance/src/cli.ts && vp run @org/feature-${options.slice}#test`,
      ],
    };
  },
});
