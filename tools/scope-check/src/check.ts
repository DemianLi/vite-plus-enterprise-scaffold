import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collect, type Finding } from "@org/conformance/finding";

import { declaredSections, headingIsFor, ROOT, sectionFor } from "./parse.ts";
import { trackedDirectories, trackedRootEntries } from "./tree.ts";

/**
 * `SCOPE.md` 說准許存在的東西，與版控裡真正存在的東西，是不是同一份。
 *
 * ── 為什麼需要這道閘門 ──────────────────────────────────────────────
 *
 * `v1.0.4` 把 v1 的範疇判準寫成 `SCOPE.md`，而那一版的文末自己就寫著
 * 「**沒有任何機制在守這份文件**」。手抄的清單會漂 —— 這個 repo 已經在
 * 同一件事上栽過三次（C71 記了兩次，`main` 的 C74 是第三次）。
 *
 * 而且它不是假想的：寫 `SCOPE.md` 的那一版順手抓到 README 的目錄樹列著
 * `tools/sast/`，而**那個目錄從來不在 v1 的樹上** —— 一個假的項目在最會被
 * 讀的地方待了不知道多久，而全套閘門照樣全綠。`doc-facts` 守的是數字，
 * 不是清單，兩者中間有一條縫。這道閘門補的就是那條縫。
 *
 * ── 兩個方向都要驗 ──────────────────────────────────────────────────
 *
 *   ① 樹上有、`SCOPE.md` 沒列 —— **範疇裡悄悄多了東西**，而判準要求
 *      每一項都寫得出「受益者是拉 v1 的團隊」。沒寫就是沒判斷過。
 *   ② `SCOPE.md` 列了、樹上沒有 —— **清單在說謊**，就是 `tools/sast` 那個病。
 *
 * 只驗①的話，這份文件會慢慢長出一堆早就不存在的東西，而讀它的人以為
 * 那些都在。只驗②的話，加一支工具就再也沒有人會被逼著寫那句受益者。
 *
 * ── ③ 是 C94 才補上的，而在那之前 SCOPE.md 已經宣稱它存在了 ─────────
 *
 *   ③ 登記了、但那一列第一格之後有空格子 —— **等於登記了但沒判斷過**。
 *
 * `SCOPE.md` 從 `v1.0.5` 起就寫著「這道閘門保證的是**沒有人可以跳過那一格**」。
 * 實測（把某一列後兩欄清空 → `listed` 數量不變、閘門全綠）證明那句話是假的：
 * ①②都只看第一格。**文件宣稱了一個保證，而程式碼沒有交付它** —— 這跟
 * README 曾經列著從來不存在的 `tools/sast/` 是同一種病，只是方向相反。
 *
 * ⚠️ 修的是**程式碼**不是那句話。收回宣稱看起來比較誠實，但 `#66` 的紅燈訊息
 * 整段建立在「你得寫出那一句」之上 —— 把保證拿掉，等於把 `#66` 的前提抽掉。
 *
 * ── 訊息為什麼講兩種讀者，而不是去判斷你是哪一種（C95、#66）───────
 *
 * 這道閘門接在 `scripts.gate` 上，也就是 `vpr ready` —— 而 `vpr ready` 正是
 * HANDOFF 叫**拉 v1 去做案子的團隊**第一個跑的東西。一個 fork 了 v1、要加自己
 * 共用 HTTP 包裝的團隊，建了 `platform/their-client/` 就會撞到這裡，而原本的
 * 訊息對他們說「寫出**受益者是拉 v1 的團隊**那一句，寫不出來就送 `main`」——
 * 那句話他們**依定義寫不出來**（他們自己就是那個團隊），而 `main` 是這個 repo
 * 的分支，不是他們的。判定是對的，錯的是**它預設讀訊息的人是誰**。
 *
 * ⚠️ **刻意不去偵測「這棵樹是不是上游」。** 那是 issue #91 在問的問題，
 * 而它的答案還沒有 —— 一個猜錯的偵測會給出**看起來很確定的錯訊息**，
 * 比預設一種讀者更糟。訊息同時對兩種人說話，這件事不需要那個答案。
 */

/** `SCOPE.md` 管的那幾層。`apps/` 與 `features/` 是示範切片，文件自己說了不管。 */
export const GOVERNED = ["tools", "platform", ROOT] as const;

/**
 * 三張表在訊息裡的樣子 —— **三張表的形狀都不一樣，所以訊息不能共用**。
 *
 * | 節 | 欄 | 為什麼 |
 * | -- | -- | ------ |
 * | `tools/` | 路徑／守什麼／為什麼受益者是拉 v1 的團隊 | 每一支都要填得出那句受益者 |
 * | `platform/` | 路徑／是什麼 | 那一節明寫「整層都是交付物本體…**逐一寫受益者沒有意義**」 |
 * | 根層 | 名字／這是什麼 | 替 `LICENSE`、`.gitignore` 寫「受益者是拉 v1 的團隊」是**儀式不是判斷** |
 *
 * ⚠️ 用同一句訊息會對著 `platform/` 與根層要求一個它們**刻意不要**的受益者欄 ——
 * 而叫人補一個文件說了不該存在的東西，下一個人只會照著補，然後那兩節的散文
 * 就變成假的。
 *
 * ⚠️ `forFork` 與 `forUpstream` 分開的理由見 C95：這道閘門接在 `vpr ready` 上，
 * 而那是 HANDOFF 叫**拉 v1 去做案子的團隊**第一個跑的東西。
 * **刻意不去偵測「這棵樹是不是上游」** —— 那是 #91 在問的，答案還沒有，
 * 而猜錯的偵測會給出看起來很確定的錯訊息。
 */
interface Layer {
  /** 訊息裡怎麼稱呼那張表。 */
  readonly table: string;
  /** 標題原文，給「那一節不見了」用。 */
  readonly heading: string;
  /** 第一格之後要填的是哪幾格。 */
  readonly columns: string;
  /** fork 了 v1 在做自己案子的人該做什麼。 */
  readonly forFork: string;
  /** 維護這條線、東西要送回上游的人該做什麼。 */
  readonly forUpstream: string;
}

const UPSTREAM_CRITERION =
  "寫得出「受益者是拉 v1 的團隊」才可以進 `release/v1`，" +
  "寫不出來就送 `main`（判準見 `release/v1` 的 C72）。";

const LAYERS: Record<string, Layer> = {
  tools: {
    table: "`tools/` 那張表",
    heading: "## \\`tools/\\` —— 准許存在的",
    columns: "「守什麼」與「為什麼受益者是拉 v1 的團隊」那兩格",
    forFork:
      "寫你們自己的理由。這道閘門要的是「有人判斷過這東西該不該在樹上」，" +
      "不是那六個字；「送 `main`」講的是這個 repo 的分支，跟你們無關。",
    forUpstream: UPSTREAM_CRITERION,
  },
  platform: {
    table: "`platform/` 那張表",
    heading: "## \\`platform/\\` —— 准許存在的",
    columns: "「是什麼」那一格",
    forFork:
      "寫你們自己的理由。這道閘門要的是「有人判斷過這東西該不該在樹上」，" +
      "不是那六個字；「送 `main`」講的是這個 repo 的分支，跟你們無關。",
    forUpstream: UPSTREAM_CRITERION,
  },
  [ROOT]: {
    table: "〈根層 —— 准許存在的〉那張表",
    heading: "## 根層 —— 准許存在的",
    columns: "「這是什麼」那一格",
    // ⚠️ 根層不叫 fork 的人去登記「受益者是拉 v1 的團隊」—— 那一節根本沒有那一欄。
    // 對他們來說這一節是**他們自己的樹**，一列一句話就是全部成本。
    forFork:
      "這一節在你們的樹上就是**你們自己的清單** —— 加一列寫一句它是什麼就好。" +
      "這道閘門在根層買到的是「你們的交付樹長出東西的時候有人看見」，" +
      "不是那句話寫成什麼樣。",
    forUpstream:
      "根層**刻意沒有受益者欄**（替 `LICENSE` 寫那一句是儀式不是判斷），" +
      "但判準沒有變 —— 一個新的頂層目錄該不該在 v1 的樹上，" +
      "見 `release/v1` 的 C72。",
  },
};

/**
 * 每一層在成功訊息裡怎麼念。
 *
 * ⚠️ 不要用 `` `${parent}/` `` 湊 —— 根層會變成「根層/」，而那不是一個路徑。
 * 這道閘門剛剛才因為兩句「說得比做得多」的話付過兩次代價（C94、C95），
 * 綠燈訊息一樣算數。
 */
export const LAYER_LABEL: Record<string, string> = {
  tools: "tools/",
  platform: "platform/",
  [ROOT]: "根層",
};

export function checkScope(root: string, source?: string): Finding[] {
  const text = source ?? readFileSync(join(root, "SCOPE.md"), "utf8");

  return collect((fail) => {
    // ⚠️ 錨點是具名特例（見 `parse.ts` 的 `needle`），所以一節
    // `## \`docs/\` —— 准許存在的` 會**完全惰性而且是綠的**。
    // 那是 `tools/sast` 那個病的形狀，只是反過來 —— 所以要反查一次。
    for (const heading of declaredSections(text)) {
      if (GOVERNED.some((parent) => headingIsFor(heading, parent))) continue;
      fail(
        "SCOPE.md",
        "這一節沒有人在檢查",
        `〈${heading}〉看起來是一份「准許存在的」清單，但沒有任何一層對應到它`,
        `這道閘門的錨點是**具名**的（\`check.ts\` 的 \`GOVERNED\` ＋ ` +
          `\`parse.ts\` 的 \`needle\`）—— 加一節不會讓它自己被檢查，` +
          `那一節會安靜地當裝飾品，而讀的人以為它在守著什麼。\n` +
          `        要治理新的一層就去改那兩個地方，那是一次寫得出來的決定；` +
          `不打算治理就別用「准許存在的」這五個字當標題。`,
      );
    }

    for (const parent of GOVERNED) {
      const section = sectionFor(text, parent);

      if (section === undefined) {
        fail(
          "SCOPE.md",
          "那一節不見了",
          `找不到${LAYERS[parent]?.table ?? parent}那一節`,
          `把標題寫回 "${LAYERS[parent]?.heading ?? ""}"。` +
            `這道閘門靠那個標題定位表格 —— 找不到就當成「這一層沒有清單」的話，` +
            `改個標題就能讓整層不再被檢查，而且是綠的。`,
        );
        continue;
      }

      const layer = LAYERS[parent];
      if (layer === undefined) continue;

      const listed = new Set(section.listed);
      // 根層要的是另一種切法（有斜線取第一段、沒斜線整條就是一個檔），
      // 所以是另一支函式 —— 理由見 `tree.ts` 的 `trackedRootEntries` 檔頭。
      const tracked = new Set(
        parent === ROOT ? trackedRootEntries(root) : trackedDirectories(root, parent),
      );

      for (const path of tracked) {
        if (listed.has(path)) continue;
        fail(
          "SCOPE.md",
          "樹上有、沒登記",
          `\`${path}\` 在版控裡，但${layer.table}沒有它`,
          `在${layer.table}加一列，把${layer.columns}填起來。\n` +
            `        接下來那句話取決於你是誰：\n` +
            `        · **你 fork 了 v1 在做自己的案子** —— ${layer.forFork}\n` +
            `        · **你在維護這條線、東西要送回上游** —— ${layer.forUpstream}\n` +
            `        少了這一列，v1 就是悄悄多了一個團隊沒預期的東西。`,
        );
      }

      for (const path of section.skipped) {
        fail(
          "SCOPE.md",
          "登記了、但那一格是空的",
          `${layer.table}的 \`${path}\` 有空欄`,
          `把${layer.columns}填起來（fork 了在做自己案子的話，寫你們自己的理由）。` +
            `一列只有路徑、後面留白，等於**登記了但沒判斷過** —— ` +
            `而這道閘門對外宣稱的正是「沒有人可以跳過那一格」（見 SCOPE.md 那一節）。` +
            `⚠️ 它只驗得到有沒有寫，寫得對不對仍然只有人能判斷。`,
        );
      }

      for (const path of listed) {
        if (tracked.has(path)) continue;
        fail(
          "SCOPE.md",
          "登記了不存在的",
          `${layer.table}列著 \`${path}\`，但版控裡沒有它`,
          `拿掉那一列，或把東西加回版控。` +
            `一份列著不存在的項目的清單，比沒有清單更糟 —— ` +
            `README 的目錄樹列了 \`tools/sast/\` 不知道多久，而它從來沒存在過。`,
        );
      }
    }
  });
}
