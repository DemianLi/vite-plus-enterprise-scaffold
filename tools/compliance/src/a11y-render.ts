import {
  ACCESSIBILITY_STANDARD,
  REQUIRED_LEVEL,
  type AcceptanceStage,
  type Criterion,
  type ScopedOverride,
} from "./a11y.ts";
import type { Coverage } from "./map.ts";

const STAGE_LABEL: Record<AcceptanceStage, string> = {
  freego: "Freego",
  manual: "人工檢測",
  sample: "抽測",
};

const PRE_FILTER_MARK: Record<Coverage, string> = {
  none: "❌ 擋不掉",
  partial: "⚠️ 部分",
  full: "✅ 擋得掉",
};

/** 表格欄位裡的 `|` 會把欄位切開。與 render.ts 的 `cell` 同一個理由。 */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

export interface A11yRenderInput {
  readonly criteria: readonly Criterion[];
  readonly rules: readonly string[];
  readonly overrides: readonly ScopedOverride[];
}

export function renderAccessibility(input: A11yRenderInput): string {
  const { criteria, rules, overrides } = input;
  const lines: string[] = [];

  lines.push(
    "# 無障礙：驗收端與開發端的分工",
    "",
    "> **這份檔案是產生的，不要手改。** 事實來源是 `tools/compliance/src/a11y.ts`，",
    "> 改完跑 `node tools/compliance/src/cli.ts --update`。",
    "",
    `對照的規範：**${ACCESSIBILITY_STANDARD}**`,
    "",
    `政府機關網站新設或改版被要求的等級：**${REQUIRED_LEVEL} 以上**（立法院決議）。`,
    "",
    "## 這份文件回答的**不是**「我們達標了嗎」",
    "",
    "達標與否由驗收端判定，而驗收端有三段，**沒有一段在 CI 裡**：",
    "",
    "```",
    "① 軟體檢測（Freego，掃已部署的 URL）",
    "② 登錄申請 ＋ 自我檢測 → Freego 覆核",
    "③ 人工檢測（專家跑鍵盤與螢幕閱讀器）→ 抽測",
    "```",
    "",
    "這份表回答的是：**送檢之前，哪幾格開發期就擋得掉、哪幾格結構上擋不掉。**",
    "",
    "後者不是缺陷，是必須由人工或委外承接的部分。把它寫下來，",
    "比裝一道假裝守得到的閘門有價值 —— 一道會回報「零問題」而其實什麼都沒檢查的閘門，",
    "會讓所有人以為那一格有人在看。",
    "",
    "## 成功準則 → 誰判定 → 開發期擋不擋得掉",
    "",
    "⚠️ **這張表刻意只收 HANDOFF #22 點名的四格，不是 AA 的完整清單。**",
    "完整對照需要規範原文（逐條的編號、名稱、等級），而那是組織輸入 ——",
    "理由與「不寫沒有事實來源的計數」寫在 `src/a11y.ts` 的檔頭。",
    "",
    "| 成功準則 | 名稱 | 等級 | 驗收端由誰判定 | 開發期 | 守它的 |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  for (const criterion of criteria) {
    const stages = criterion.acceptance.map((stage) => STAGE_LABEL[stage]).join("、");
    const gates = criterion.gates.length === 0 ? "—" : criterion.gates.join("、");
    lines.push(
      `| ${cell(criterion.id)} | ${cell(criterion.name)} | ${criterion.level} ` +
        `| ${cell(stages)} | ${PRE_FILTER_MARK[criterion.preFilter]} | ${cell(gates)} |`,
    );
  }

  lines.push("", "### 逐條註記", "");
  for (const criterion of criteria) {
    lines.push(`- **${criterion.id} ${criterion.name}（${criterion.level}）** ${criterion.note}`);
  }

  lines.push(
    "",
    "## 開發期的前置過濾器實際檢查什麼",
    "",
    "`platform/eslint-config/src/a11y.js`，跑在 Tier 1 的每一次 CI 上。",
    "下面這份清單是**從那份設定推導的**，不是抄本 —— 升級外掛時新規則會自動進來。",
    "",
    "⚠️ 這裡刻意**不**宣稱每條規則對應哪一條成功準則。那個對照需要規範原文，",
    "而猜一個對照寫進交付文件，比不寫更糟。",
    "",
    `共 ${rules.length} 條：`,
    "",
  );

  for (const rule of rules) lines.push(`- \`${rule}\``);

  lines.push("", "## 哪些規則在哪些路徑被覆寫", "");

  if (overrides.length === 0) {
    lines.push("沒有範圍覆寫：上面那份清單在每一個 `.vue` 上都跑。");
  } else {
    lines.push("| 規則 | 範圍（files） | 設定 |");
    lines.push("| --- | --- | --- |");
    for (const override of overrides) {
      lines.push(
        `| \`${cell(override.rule)}\` | \`${cell(override.files.join(", "))}\` | \`${cell(override.setting)}\` |`,
      );
    }
    lines.push("");
    lines.push(
      "理由寫在 `platform/eslint-config/src/a11y.js` 該區塊的註解裡，這裡不抄 —— 抄本會過期。",
      "",
      "⚠️ 範圍是 glob 字面，從 repo 根錨定，這份文件印的是設定寫的字串不是它實際命中的檔案數。",
    );
  }

  lines.push(
    "",
    "## 為什麼沒有在 CI 裡跑 axe-core",
    "",
    "量過，結論是負面的（C69）：",
    "",
    "| 量到的 | 結果 |",
    "| --- | --- |",
    "| `color-contrast` 對一段 1.1:1 的文字 | 落在 `incomplete`，**不是** `violations` |",
    "| `link-in-text-block` | 同樣落在 `incomplete` |",
    "| `heading-order` 掃孤立畫面 | 永遠不適用（每個畫面只有一個 `<h1>`） |",
    "| DOM 裡有 `<iframe>` | axe **直接丟例外**，不是跳過 |",
    "| happy-dom 的 `getBoundingClientRect()` | API 在，回傳全零 |",
    "",
    "也就是說：真正想買的兩條（1.4.1、1.4.3）在模擬 DOM 下是壞的，",
    "而買得到的那條在元件層級沒有意義。",
    "",
    "要讓 `color-contrast` 真的判定得了就得跑真瀏覽器，而 Vitest 的文件明寫",
    "**CI 要跑 browser mode 就得裝 playwright 或 webdriverio** —— 也就是把瀏覽器",
    "二進位拉進供應鏈盤點範圍。那個代價換到的東西 **Freego 在驗收時本來就會做**，",
    "而且掃的是真正要交付的那個網站，比掃孤立元件更準。",
    "",
    "> ⚠️ 這一段量測自己也踩到同一個坑：掃 `UiDialog` 得到「0 violations」，",
    "> 而它在 teleport stub 底下只 render 了 81 個字元 —— **掃描對象是空的**。",
    "> 那個綠燈是假的，而它長得跟真的一模一樣。",
  );

  return `${lines.join("\n")}\n`;
}
