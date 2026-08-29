import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collect, type Finding } from "@org/conformance/finding";

import { declaredSections, headingIsFor, ROOT, sectionFor } from "./parse.ts";
import { trackedDirectories, trackedRootEntries } from "./tree.ts";

/**
 * `SCOPE.md` 登記的東西，與版控裡真正存在的東西，是不是同一份。
 *
 * ⚠️ **這道閘門不判「准不准」，它只判「有沒有人寫過一句」**（C136 §三）。
 * 判準曾經帶著准入後果（寫不出「受益者是拉 v1 的團隊」就送 `main`），
 * 而兩條線併回一條之後「送 `main`」＝「留在原地」—— 後果消失了，
 * 判準退化成分類。**綠燈不是許可**（C93）。
 *
 * ── 為什麼需要這道閘門 ──────────────────────────────────────────────
 *
 * `v1.0.4` 把 v1 的範疇判準寫成 `SCOPE.md`，而那一版的文末自己就寫著
 * 「**沒有任何機制在守這份文件**」。手抄的清單會漂 —— 這個 repo 已經在
 * 同一件事上栽過三次（C71 記了兩次，C132 是第三次）。
 *
 * 而且它不是假想的：寫 `SCOPE.md` 的那一版順手抓到 README 的目錄樹列著
 * `tools/sast/`，而**那個目錄從來不在 v1 的樹上** —— 一個假的項目在最會被
 * 讀的地方待了不知道多久，而全套閘門照樣全綠。`doc-facts` 守的是數字，
 * 不是清單，兩者中間有一條縫。這道閘門補的就是那條縫。
 *
 * ── 兩個方向都要驗 ──────────────────────────────────────────────────
 *
 *   ① 樹上有、`SCOPE.md` 沒列 —— **樹上悄悄多了東西**，而沒有人寫過一句
 *      它是什麼。沒寫就是沒判斷過。
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
 * ── 訊息只有一種讀者，因為兩種讀者要做的事一樣了（C136 §五）─────────
 *
 * C95 把訊息拆成兩半：對 fork 了 v1 的團隊說「寫你們自己的理由」，對上游
 * 維護者說「寫得出受益者是拉 v1 的團隊才可以進，寫不出來就送 `main`」。
 * **那個分岔的唯一內容是後面那句要求**，而 C136 §三 判定它沒有後果了 ——
 * 於是兩種人要做的事一模一樣：加一列，寫一句它是什麼。
 *
 * ⚠️ 留著兩半會變成**一個沒有差別的分類**，而它還會讓讀者以為自己得先判斷
 * 「我是哪一種」才知道要做什麼。合併，並補上「綠了不代表可以」那一句。
 *
 * ⚠️ **對 #91 的作用**：C95 那句「刻意不去偵測這棵樹是不是上游」的**前提
 * 消失了** —— 這道閘門從此不需要那個答案，因為根本沒有那個分岔。
 * `#91` 問的是平行體系偵測，不因此可關。
 *
 * ── `tools/` 那一層在 C136 §四 交給了 `gate-roster` ─────────────────
 *
 * `SCOPE.md` 那張 `tools/` 表是已刪分支 `release/v1` 的快照，而
 * `gate-roster` 的 `GATES ∪ UNGATED` **涵蓋每一個 `tools/*` workspace 成員、
 * `why` 必填、機制在守**（`gate-roster/src/check.ts` 的①）。補齊這張表只會
 * 造出第二份手抄本，而兩道機制互不斷言 —— 漂移時兩邊都是綠的。
 *
 * ⚠️ **交棒沒有拿掉 fork 團隊手上的東西**：他們加 `tools/their-thing` 仍然
 * 會被擋，只是擋他們的換成了 `gate-roster` 的「工具沒登記」。
 *
 * ── ④ 根層要指名桶，而機器只查值域（C143）──────────────────────────
 *
 *   ④ 根層某一列沒有指名 C135 §三 那四個桶之一 —— **登記了、也寫了一句，
 *      但沒有說它承載哪一條軸**。
 *
 * C135 §四 把根層 32 列逐一歸了類，而那張表在**凍結卷**裡、帶著日期，
 * 沒有機制在守（C135 §七 明知故犯）。**三天就過期了**：C143 §三 實測
 * `1dc1227` 的 32 列到 `9659bb0` 變成 34 列，多出來的 `DECISIONS-2.md`
 * 與 `reports/` 沒有人歸過類。分類要活著就得長在活的那張表上。
 *
 * ⚠️ **機器只查兩件事：填了沒有、是不是那四個之一。** 判「它承載哪一條軸」
 * 是語意判斷，`#91` 自己寫過「一個分不出好壞的偵測器比沒有偵測器更糟 ——
 * 它會給出綠燈，而綠燈會被當成保證」。一列填了「正交」而它其實是正典，
 * **不會有任何東西變紅**（C143 §八）。
 */

/**
 * `SCOPE.md` 管的那幾層。
 *
 * ⚠️ **`tools/` 不在這裡，而那是裁決不是遺漏**（C136 §四）—— 那一層由
 * `tools/gate-roster` 登記，理由見上面檔頭最後一節。
 * `apps/` 與 `features/` 是示範切片，文件自己說了不管。
 */
export const GOVERNED = ["platform", ROOT] as const;

/**
 * 根層那一欄的值域 —— C135 §三 那四個桶，一字不改。
 *
 * ⚠️ **「無關」不要求寫理由，但一樣要求填桶名**（C143 §四）。C135 §三 免掉的是
 * 前者（替 `LICENSE` 寫受益者是儀式不是判斷），而後者正是它成為一個
 * **有名字的**逃生門、而不是一個沒人注意的逃生門的辦法。
 *
 * ⚠️ 值域寫死在這裡，是因為「可以填任何字」等於沒有值域 —— 那樣的一欄
 * 只買到「有人動過手指」，買不到「它落在一份講得出來的分類裡」。
 */
export const BUCKETS = ["正典", "正交", "過渡豁免", "無關"] as const;

/**
 * 兩張表在訊息裡的樣子 —— **兩張表的形狀不一樣，所以訊息不能共用**。
 *
 * | 節 | 欄 | 為什麼 |
 * | -- | -- | ------ |
 * | `platform/` | 路徑／是什麼 | 那一節明寫「整層都是交付物本體…**逐一寫受益者沒有意義**」 |
 * | 根層 | 名字／這是什麼 | 替 `LICENSE`、`.gitignore` 寫一句受益者是**儀式不是判斷** |
 *
 * ⚠️ 用同一句訊息會對著這兩層要求一個它們**刻意不要**的受益者欄 ——
 * 而叫人補一個文件說了不該存在的東西，下一個人只會照著補，然後那兩節的散文
 * 就變成假的。
 *
 * ⚠️ **每一層只有一句 `fix`，不再分 fork／上游**（C136 §五）—— 理由見檔頭。
 */
interface Layer {
  /** 訊息裡怎麼稱呼那張表。 */
  readonly table: string;
  /** 標題原文，給「那一節不見了」用。 */
  readonly heading: string;
  /** 第一格之後要填的是哪幾格。 */
  readonly columns: string;
  /**
   * 桶那一格是第幾格（0 起算），`undefined` = 這一層沒有桶欄（C143）。
   *
   * ⚠️ **這一格同時被排除在「登記了、但那一格是空的」之外**，而那不是放寬 ——
   * 它從「非空」升級成「必須是 `BUCKETS` 之一」，比原本嚴。分開的理由是
   * **變異驗證**（C143 §七 第 4 條）：兩條規則都管同一格的話，把桶那條拿掉、
   * 空著的桶仍然會紅，於是「紅的是這條規則」就證明不了 —— 那正是 C94 記下的
   * 「文件宣稱了一個保證，程式碼沒有交付它」，只是這次會發生在宣稱它的同一支 PR 裡。
   */
  readonly bucketColumn?: number;
  /**
   * 撞到的人該做什麼。
   *
   * ⚠️ **兩種讀者做的事一樣，所以只有一句。** 分成 fork／上游兩半的唯一內容
   * 是「寫得出受益者是拉 v1 的團隊才可以進」那個要求，而它沒有後果了
   * （C136 §三）。
   */
  readonly fix: string;
}

/**
 * 每一層都要說的那一句 —— **這道閘門不判准不准**。
 *
 * ⚠️ 拿掉判準欄之後特別需要它：文件裡已經沒有判準節在暗示還有第二關，
 * 而一個綠掉的閘門很容易被讀成「所以這東西可以在這裡」。**不可以。**
 */
const NOT_A_PERMIT =
  "⚠️ 這道閘門**不判准不准** —— 它綠了只代表**有人寫過一句**，" +
  "不代表那東西「可以」在這裡（C136 §三、C93）。";

const LAYERS: Record<string, Layer> = {
  platform: {
    table: "`platform/` 那張表",
    heading: "## \\`platform/\\` —— 准許存在的",
    columns: "「是什麼」那一格",
    fix:
      "寫一句它是什麼就好 —— 這道閘門要的是「有人判斷過這東西該不該在樹上」。" +
      "fork 了 v1 在做自己案子的話，寫你們自己的理由。",
  },
  [ROOT]: {
    table: "〈根層 —— 准許存在的〉那張表",
    heading: "## 根層 —— 准許存在的",
    // ⚠️ C143 加了第三欄之後這句話跟著改 —— 訊息叫人填的那一格要跟表對得上，
    // 不然它會叫人去填一格不存在的東西，而這正是這個檔案花兩節在講的病。
    columns: "「這是什麼」與「桶」那兩格",
    // ⚠️ 根層刻意沒有受益者欄 —— 替 `LICENSE` 寫那一句是儀式不是判斷。
    // 對 fork 的團隊來說這一節是**他們自己的樹**，一列一句話 ＋ 一個桶名就是全部成本。
    fix:
      "這一節在你們的樹上就是**你們自己的清單** —— 加一列，寫一句它是什麼，" +
      `再指名它落在哪一個桶（${BUCKETS.join("／")}）。` +
      "這道閘門在根層買到的是「交付樹長出東西的時候有人看見」，" +
      "不是那句話寫成什麼樣。",
    bucketColumn: 2,
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
            `        ${layer.fix}\n` +
            `        ${NOT_A_PERMIT}\n` +
            `        少了這一列，樹上就是悄悄多了一個沒有人看過的東西。`,
        );
      }

      for (const row of section.rows) {
        // 第一格是路徑，桶那一格有自己的規則（值域，比「非空」嚴）——
        // 兩條規則不重疊，理由見 `Layer.bucketColumn`。
        const rest = row.cells.filter((_, index) => index !== 0 && index !== layer.bucketColumn);
        if (!rest.some((cell) => cell === "")) continue;
        fail(
          "SCOPE.md",
          "登記了、但那一格是空的",
          `${layer.table}的 \`${row.path}\` 有空欄`,
          `把${layer.columns}填起來。\n` +
            `        ${layer.fix}\n` +
            `        一列只有路徑、後面留白，等於**登記了但沒判斷過** —— ` +
            `而這道閘門對外宣稱的正是「沒有人可以跳過那一格」（見 SCOPE.md 那一節）。\n` +
            `        ⚠️ 它只驗得到有沒有寫，寫得對不對仍然只有人能判斷。`,
        );
      }

      const bucketColumn = layer.bucketColumn;
      if (bucketColumn !== undefined) {
        for (const row of section.rows) {
          const bucket = row.cells[bucketColumn] ?? "";
          if (bucket === "") {
            fail(
              "SCOPE.md",
              "沒有指名桶",
              `${layer.table}的 \`${row.path}\` 沒有指名它落在哪一個桶`,
              `在那一列的第三格填一個桶：${BUCKETS.join("／")}（定義見 C135 §三）。\n` +
                `        「這是什麼」答的是**它是什麼**，桶答的是**它承載哪一條軸** —— ` +
                `兩件事，所以是兩格。\n` +
                `        ⚠️ 「無關」不要求寫理由，但一樣要**填桶名** —— ` +
                `那是它成為一個有名字的逃生門、而不是一個沒人注意的逃生門的辦法。\n` +
                `        ⚠️ 這道閘門只查填了沒有、是不是那四個之一。` +
                `**填得對不對只有人能判斷**，而它會綠。`,
            );
            continue;
          }
          if ((BUCKETS as readonly string[]).includes(bucket)) continue;
          fail(
            "SCOPE.md",
            "桶名不在那四個裡",
            `${layer.table}的 \`${row.path}\` 寫著「${bucket}」，那不是一個桶`,
            `換成這四個之一：${BUCKETS.join("／")}（定義見 C135 §三）。\n` +
              `        ⚠️ **要改的是那一列，不是 \`check.ts\` 的 \`BUCKETS\`** —— ` +
              `值域是判準的一部分，往裡面加一個名字就是改閘門來換綠燈` +
              `（AGENTS.md 規則二）。\n` +
              `        真的需要第五個桶的話，那要一則裁決 —— **停下來告訴人。**`,
          );
        }
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
