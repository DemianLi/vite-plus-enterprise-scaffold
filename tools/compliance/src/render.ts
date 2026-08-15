import type { Control, Gate } from "./map.ts";

/**
 * 對照表的推導與輸出 —— 純函式，不碰檔案系統也不碰網路。
 *
 * 取數（檔案存不存在）留在 cli.ts，判定留在這裡：這樣每一條判定都可以用
 * 固定的輸入測過一次，而不是靠「跑一次看看對不對」。
 * 與 `tools/ui-survey/src/registry.ts` 同一個切法。
 */

/**
 * 腳手架欠、而且完全沒有東西在守的條號。這張表存在的主要理由。
 *
 * ⚠️ 判準是 `owed` 而不是 `scope`。第一版用 scope 篩，於是 §16（證據保存
 * 五年）因為責任落在流程面而被歸成「不在範圍」—— 但腳手架確實欠它一份
 * 保存期政策。反過來 §11 II ① 的防火牆同樣不在前端，而腳手架什麼都不欠。
 * 只看 scope 會把這兩種混成同一格。
 */
export function owedGaps(controls: readonly Control[]): readonly Control[] {
  return controls.filter((control) => control.owed && control.coverage === "none");
}

/**
 * 存在、但沒有證明過自己會紅的**閘門**。
 *
 * ⚠️ `kind: "proposer"` 的不算。Renovate 不擋任何東西 —— 把它算進「待補的洞」，
 * 會讓這個數字永遠少一個永遠補不完的，而讀的人會以為那是欠的工作。
 */
export function unprovenGates(gates: readonly Gate[]): readonly Gate[] {
  return blockingGates(gates).filter((gate) => gate.negativeTest === null);
}

/**
 * 會擋人的那些。**分母也要用它** —— 只把 proposer 從分子拿掉、分母仍算全部，
 * 會讓「8／12」看起來比「8／11」好，而好的那一格是憑空長出來的。
 */
export function blockingGates(gates: readonly Gate[]): readonly Gate[] {
  return gates.filter((gate) => gate.kind === "gate");
}

/**
 * 對不到任何條號的閘門。
 *
 * 這**不是**違規清單。它們的正當性來自另一條軸（能不能交到評審桌上，
 * 以及上游變動時會不會講話），只是不來自法規。分開列是為了避免下一次
 * 有人把「供應鏈盤點」當成法定義務再論證一次 —— 它不是。
 */
export function gatesWithoutArticle(
  gates: readonly Gate[],
  controls: readonly Control[],
): readonly Gate[] {
  const cited = new Set(controls.flatMap((control) => control.gates));
  return gates.filter((gate) => !cited.has(gate.id));
}

/** 被條號引用、卻不在 GATES 裡的 id。映射打錯字時會在這裡現形。 */
export function danglingGateIds(
  gates: readonly Gate[],
  controls: readonly Control[],
): readonly string[] {
  const known = new Set(gates.map((gate) => gate.id));
  const missing = new Set<string>();
  for (const control of controls) {
    for (const id of control.gates) if (!known.has(id)) missing.add(id);
  }
  return [...missing].sort();
}

/**
 * 一條法規的「證明狀態」。
 *
 * 刻意分三級而不是布林：一條由三道閘門共同守、其中一道證明過的規則，
 * 說它「已證明」是謊，說它「未證明」則抹掉了已經做到的部分。
 * 稽核桌上這個差別是實的 —— 部分證明要講得出哪一部分。
 */
export type ProofStatus = "out-of-scope" | "none" | "partial" | "proven";

/**
 * ⚠️ `out-of-scope` 這一級是必要的，不是裝飾。
 *
 * 第一版沒有它，於是 §11 II ① 的防火牆、④ 的防毒，全部顯示成「❌ 未證明」——
 * 而它們是後端與基礎設施的事，腳手架不提供也不該假裝提供。
 * 結果是一張有 9 個紅叉的表，其中只有 2 個是真的洞，
 * 而真的那 2 個（⑥ 測試環境不得用真個資、⑨ 隱碼機制）淹在裡面看不見。
 *
 * 一份把不該我做的事也列成失敗的清單，讀的人第一天就會學會略過紅色。
 */
export function proofStatus(control: Control, gates: readonly Gate[]): ProofStatus {
  if (control.gates.length === 0) return control.owed ? "none" : "out-of-scope";

  const byId = new Map(gates.map((gate) => [gate.id, gate]));
  // proposer 不擋人，「會不會紅」對它沒有意義 —— 兩邊都不算，
  // 否則它要嘛拉低分母（假的洞）、要嘛拉高分子（假的已證明）。
  const blocking = control.gates.filter((id) => byId.get(id)?.kind !== "proposer");
  if (blocking.length === 0) return control.owed ? "none" : "out-of-scope";

  const proven = blocking.filter((id) => byId.get(id)?.negativeTest != null).length;
  if (proven === 0) return "none";
  return proven === blocking.length ? "proven" : "partial";
}

/**
 * 一條法規底下「幾道閘門證明過會紅 ／ 共幾道」。
 *
 * ── 為什麼這個數字非得算出來不可 ────────────────────────────────────
 *
 * §11 II ⑦ 的註記原本手寫著「四道裡只有 conformance 證明過會紅」。
 * 那句話在補完 api-surface 的反向測試那天就過期了，補完 csp-verify 又過期一次，
 * 而 §11 II ⑥／⑨ 做完還會再過期一次 —— **三次漂移，零次紅燈**。
 *
 * 一張自稱守著「數字會不會說謊」的表，自己的註記在說謊，是最壞的一種。
 * 所以這個數字由 `GATES` 推導，註記只留判斷、不留計數。
 */
export function provenCount(
  control: Control,
  gates: readonly Gate[],
): { readonly proven: number; readonly total: number } {
  const byId = new Map(gates.map((gate) => [gate.id, gate]));
  const blocking = control.gates.filter((id) => byId.get(id)?.kind !== "proposer");
  return {
    proven: blocking.filter((id) => byId.get(id)?.negativeTest != null).length,
    total: blocking.length,
  };
}

const PROOF_MARK: Record<ProofStatus, string> = {
  "out-of-scope": "— 不在範圍",
  none: "❌ 未證明",
  partial: "◐ 部分",
  proven: "✅ 已證明",
};

const SCOPE_LABEL: Record<Control["scope"], string> = {
  frontend: "前端",
  backend: "後端／基礎設施",
  process: "流程／營運",
};

/** Markdown 表格的儲存格不能有裸的 `|`，否則欄位會被切開。 */
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function gateSummary(control: Control, gates: readonly Gate[]): string {
  if (control.gates.length === 0) return control.owed ? "🔴 **（無）**" : "—";
  const byId = new Map(gates.map((gate) => [gate.id, gate]));
  return control.gates
    .map((id) => {
      const gate = byId.get(id);
      if (gate?.kind === "proposer") return `${id} ▷`;
      return gate?.negativeTest == null ? `${id} ⚠️` : id;
    })
    .join("、");
}

const COVERAGE_MARK: Record<Control["coverage"], string> = {
  none: "無",
  partial: "部分",
  full: "完整",
};

export interface RenderInput {
  readonly regulation: string;
  readonly gates: readonly Gate[];
  readonly controls: readonly Control[];
  readonly future: readonly { readonly item: string; readonly source: string }[];
}

export function render(input: RenderInput): string {
  const { regulation, gates, controls, future } = input;
  const gaps = owedGaps(controls);
  const unproven = unprovenGates(gates);
  const orphans = gatesWithoutArticle(gates, controls);

  const lines: string[] = [];

  lines.push(
    "# 法遵對照表",
    "",
    "> **這份檔案是產生的，不要手改。** 事實來源是 `tools/compliance/src/map.ts`，",
    "> 改完跑 `node tools/compliance/src/cli.ts --update`。",
    "> 閘門每次都會比對它與映射是否一致 —— 手改會在下一次 CI 被打回。",
    "",
    `對照的規範：**${regulation}**`,
    "",
    "個資法 §20-1 已於民國 114 年 11 月 11 日公布，但施行日期由行政院定之而至今未定；",
    "其授權的《個人資料檔案安全維護管理辦法》仍是 115 年 1 月 22 日的預告草案。",
    "未生效的部分列在最後一節，不與現行義務混在一起。",
    "",
    "## 一眼看完",
    "",
    `- 腳手架欠、而且**完全沒有東西在守**的條號：**${gaps.length}**`,
    `- 存在但**沒有證明過自己會紅**的閘門：**${unproven.length} / ${blockingGates(gates).length}**`,
    `- 對不到任何條號的閘門：**${orphans.length}**（不是違規，見下方說明）`,
    "",
    "## 條號 → 閘門",
    "",
    "「覆蓋」與「證明」是**兩件獨立的事**：前者問「這條被守到多少」，",
    "後者問「守它的東西證明過自己會紅嗎」。合成一欄就會產生假的一列 ——",
    "§12 III 正是樣本：閘門有、閘門也證明過會紅、而法條仍然沒被滿足。",
    "",
    "| 條號 | 要求 | 責任落點 | 守它的閘門 | 覆蓋 | 證明過會紅 |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  for (const control of controls) {
    lines.push(
      `| ${cell(control.article)} | ${cell(control.requirement)} | ${SCOPE_LABEL[control.scope]} ` +
        `| ${cell(gateSummary(control, gates))} | ${COVERAGE_MARK[control.coverage]} ` +
        `| ${PROOF_MARK[proofStatus(control, gates)]} |`,
    );
  }

  lines.push("", "### 逐條註記", "");
  for (const control of controls) {
    const { proven, total } = provenCount(control, gates);
    // 計數由 GATES 推導、附在註記後面。註記本文不得再寫死數字 ——
    // 理由見 provenCount 的說明。
    const tally = total === 0 ? "" : `（${proven}／${total} 道閘門證明過會紅）`;
    lines.push(`- **${control.article}** ${control.note}${tally}`);
  }

  lines.push(
    "",
    "## 閘門 → 證據",
    "",
    "標 ▷ 的是**提案者**而不是閘門：它不擋任何東西，所以「反向測試」對它不適用，",
    `上面那個 ${unproven.length}／${blockingGates(gates).length} 的分子與分母都不含它。`,
    "",
    "| 閘門 | 檢查什麼 | 進版控的證據 | 反向測試 |",
    "| --- | --- | --- | --- |",
  );

  for (const gate of gates) {
    const proof =
      gate.kind === "proposer"
        ? "▷ 不適用"
        : gate.negativeTest === null
          ? "**❌ 無**"
          : `\`${gate.negativeTest}\``;
    lines.push(
      `| \`${gate.id}\`${gate.kind === "proposer" ? " ▷" : ""} | ${cell(gate.what)} ` +
        `| ${gate.evidence === null ? "**（無）**" : `\`${gate.evidence}\``} | ${proof} |`,
    );
  }

  lines.push("", "### 逐道註記", "");
  for (const gate of gates) {
    lines.push(`- **\`${gate.id}\`** — \`${gate.command}\`  \n  ${gate.note}`);
  }

  if (gaps.length > 0) {
    lines.push(
      "",
      "## 🔴 腳手架欠、而且沒有東西在守的",
      "",
      "這幾條是**現行有效**的義務，而且是腳手架做得到的。它們不在「還沒生效」那一節裡。",
      "",
    );
    for (const control of gaps) {
      lines.push(`- **${control.article}** ${control.requirement}  \n  ${control.note}`);
    }
  }

  if (orphans.length > 0) {
    lines.push(
      "",
      "## 對不到條號的閘門",
      "",
      "**這不是違規清單。** 這些閘門的正當性來自另外兩件事：能不能交到評審桌上",
      "（採購／資安／法務要的佐證），以及上游變動時它會不會講話。只是不來自法規。",
      "",
      "分開列的理由是避免下一次有人把它們當成法定義務再論證一次。",
      "",
    );
    for (const gate of orphans) {
      lines.push(`- **\`${gate.id}\`** — ${gate.what}`);
    }
  }

  lines.push(
    "",
    "## 尚未適用（留好的介面）",
    "",
    "兩個觸發條件任一成立就要接上：公司上市櫃，或個資法 §20-1 施行且公司同時是",
    "「非中小企業（資本額逾一億**且**員工逾二百人）且個資達一萬筆」。",
    "",
    "⚠️ 這幾件事**現行法規並未要求**。",
    "",
  );
  for (const item of future) {
    lines.push(`- ${item.item}  \n  法源：${item.source}`);
  }

  lines.push("");
  return lines.join("\n");
}
