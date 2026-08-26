import { readFileSync } from "node:fs";
import { join } from "node:path";

import { workspacePackages } from "@org/doc-facts/derive";

import { GATES, UNGATED, type Gate, type Tier, type Ungated } from "./gates.ts";

/**
 * 名冊的四個消費端各自對不對得上。
 *
 * ── 為什麼是「斷言一致」而不是「真的推導出去」 ──────────────────────
 *
 * 想過三條路：
 *
 *   (a) 真推導 —— `scripts.gate` 與 workflow 步驟都改成呼叫一支執行器，
 *       由它讀 `GATES` 決定跑什麼。
 *   (b) 斷言一致 —— 四份照舊手寫，加一道閘門比對它們與 `GATES`。
 *   (c) 產生 —— 從 `GATES` 產出 `scripts.gate` 與 workflow 片段，
 *       另一道閘門比對產出與已提交的檔案（api-surface 基準那種形狀）。
 *
 * 選 (b)，卡在兩件事上：
 *
 *   1. **tier2 檔頭明文寫著「刻意不經過 `vp`，直接呼叫底層執行檔」**
 *      —— D2 保單要求安全閘門獨立於可替換的驅動層。(a) 會讓每一道安全閘門
 *      改成經過我們自己寫的一層間接，那正是那條規則在防的東西。
 *   2. **CI 的每一步要能各自紅。** GitHub 是一步一格顯示的；(a) 把六道閘門
 *      併成一格之後，「哪一道紅了」要進 log 撈。
 *
 * (c) 沒有這兩個問題，但它會把兩個 workflow 檔變成產生物，而那兩個檔案裡
 * 最有價值的東西是**載明理由的註解** —— tier2 檔頭那三條規則、SAST 為什麼
 * 用自寫規則而不是公開規則集。把它們搬進產生器樣板，是把文件推遠離它在
 * 描述的那段程式碼。
 *
 * (b) 的代價很誠實：**每一處仍然各寫一份**，只是漂移現在會紅。
 * 這與 `doc-facts` 是同一個取捨，那支工具也不去改寫 README，只是不准它過期。
 */
export interface Problem {
  readonly kind: string;
  readonly detail: string;
}

/**
 * 名冊本身。`checkRoster` 收它而不是直接讀模組層的 `GATES`，理由只有一個：
 * **否則測試只能改 repo，不能改名冊。**「同一個套件同時登記成閘門與不接」
 * 這一類判定，只有兩邊都能動才驗得到，而驗不到的判定與不存在沒有差別。
 */
export interface Roster {
  readonly gates: readonly Gate[];
  readonly ungated: readonly Ungated[];
}

/** 這個 repo 真正的名冊。 */
export const ROSTER: Roster = { gates: GATES, ungated: UNGATED };

/** 對 `tools/` 底下的每個 workspace 套件，它在名冊裡登記成什麼。 */
type Registration = "gate" | "ungated" | "both" | "missing";

function ciCommandOf(gate: Gate): string {
  return gate.ciCommand ?? gate.command;
}

/**
 * `scripts.gate` 應該長的樣子。順序就是名冊的順序。
 *
 * ⚠️ 帶 `notInGateScript` 的閘門不進來 —— 那個欄位是**一句必填的理由**，
 * 不是一個開關（C132）。
 */
export function deriveGateScript(gates: readonly Gate[]): string {
  return gates
    .filter((gate) => gate.notInGateScript === undefined)
    .map((gate) => gate.command)
    .join(" && ");
}

/**
 * 某一層應該跑哪幾行。回傳的是**指令字串**，不是閘門代號。
 *
 * ⚠️ 一道閘門在 workflow 裡可以跑不只一次（C132）：`--require-fresh`、
 * `--evidence`、`--verify-sbom`…… 每一次都要在 `variants` 裡登記過，
 * **連理由一起**。少了這一段，那些完全正確的行會被報成「多一道」，
 * 而一道對正確寫法亂叫的閘門，第一天就會被加例外（C41）。
 */
export function deriveTierCommands(gates: readonly Gate[], tier: Tier): Set<string> {
  const commands = new Set<string>();
  for (const gate of gates) {
    if (!gate.tiers.includes(tier)) continue;
    commands.add(ciCommandOf(gate));
    for (const variant of gate.variants ?? []) commands.add(variant.command);
  }
  return commands;
}

/**
 * workflow 裡**單行** `run:` 的指令。
 *
 * ⚠️ `run: |` 這種多行區塊在這裡會被捕捉成 `|`，而 `|` 不是閘門形狀，
 * 所以會被下一關濾掉 —— 也就是說 SAST 那兩個 docker 步驟看不見。
 * 那是刻意的，理由寫在 gates.ts 檔頭〈刻意不涵蓋什麼〉那一節。
 */
//
// ⚠️ `-?` 不是多餘的：沒有 `name:` 的步驟寫成 `- run: 指令`，`run:` 前面就有
// 一個項目符號。真的那兩個 workflow 每一步都有 `name:`，所以少了它也不會出錯
// —— 但那種「現在剛好沒事」的漏洞，正是這道閘門的反向測試抓出來的第一件事。
// （`actionCounts` 的 `USES` 樣式早就這樣寫了，這裡是跟上。）
const RUN_LINE = /^[ \t]*-?[ \t]*run:[ \t]*(.+?)[ \t]*$/gm;

/**
 * 「長得像閘門」的指令：`tools/` 底下的 CLI、對 `tools/` 底下某包跑的 vitest、
 * 或 eslint。
 *
 * 這條樣式決定了**多出來的步驟抓不抓得到**。少了它，這道閘門只能驗
 * 「該有的都在」，驗不了「不該有的不在」—— 於是一支沒登記的新工具被塞進
 * workflow 也不會被說話，而那正好是這整件事要防的其中一半。
 *
 * ⚠️ **vitest 那一支是 `main` 才需要的**（C132）：`tools/bff-check` 沒有
 * `src/cli.ts`，它就是一包測試，CI 直接對它跑 vitest。少了這一段，
 * 那道**真的會擋下 PR** 的閘門在這裡完全隱形 —— 有人把它從 workflow 拿掉，
 * 名冊不會說話。樣式要跟著閘門的形狀走，不是反過來。
 */
const GATE_SHAPED =
  /^(?:node tools\/[\w-]+\/src\/cli\.ts|(?:\.\/node_modules\/\.bin\/)?(?:eslint\b|vitest run --root tools\/))/;

/**
 * YAML 的行尾註解。
 *
 * ⚠️ **必須是「空白之後的 `#`」**，不能只比 `#`：`vp run console#dev` 這種
 * 指令裡就有一個 `#`，而 YAML 也是這樣界定的 —— `#` 只有前面接空白（或行首）
 * 才開始一段註解。
 *
 * 沒有這一段的話，`run: node tools/x/src/cli.ts  # 理由` 這種**完全合法**的寫法
 * 會同時報「少一道」與「多一道」（實測過）。在一個到處都寫著理由的 repo 裡，
 * 那不是假想情況 —— 而一道對合法寫法亂叫的閘門，第一天就會被加例外，
 * 然後例外再也拿不掉（C41）。
 */
const TRAILING_COMMENT = /\s+#.*$/;

export function extractTierCommands(workflowSource: string): Set<string> {
  const found = new Set<string>();
  for (const match of workflowSource.matchAll(RUN_LINE)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const command = raw.replace(TRAILING_COMMENT, "").trimEnd();
    if (!GATE_SHAPED.test(command)) continue;
    found.add(command);
  }
  return found;
}

function diffSets(
  expected: ReadonlySet<string>,
  actual: ReadonlySet<string>,
): { missing: string[]; extra: string[] } {
  return {
    missing: [...expected].filter((item) => !actual.has(item)),
    extra: [...actual].filter((item) => !expected.has(item)),
  };
}

/** README 那張表的儲存格用 `` ` `` 包程式碼，比對前先拿掉。 */
function normalize(text: string): string {
  return text.replaceAll("`", "");
}

export function checkRoster(root: string, roster: Roster = ROSTER): Problem[] {
  const { gates, ungated } = roster;
  const problems: Problem[] = [];
  const read = (relative: string): string => readFileSync(join(root, relative), "utf8");

  // ── ① tools/ 底下的每一個套件都要登記過 ──────────────────────────
  //
  // 用的是 workspace 成員清單，不是 `readdirSync("tools")`。差別不是潔癖：
  // 見 doc-facts/src/derive.ts 上 workspacePackages 的註解（實測 16 vs 7）。
  const registrations = new Map<string, Registration>();
  for (const path of workspacePackages(root)) {
    if (path.startsWith("tools/")) registrations.set(path.slice("tools/".length), "missing");
  }

  const mark = (pkg: string, as: "gate" | "ungated"): void => {
    const current = registrations.get(pkg);
    if (current === undefined) {
      problems.push({
        kind: "登記了不存在的工具",
        detail: `名冊裡有 tools/${pkg}，但它不是 workspace 成員（目錄不在，或裡面沒有 package.json）`,
      });
      return;
    }
    registrations.set(pkg, current === "missing" ? as : "both");
  };

  for (const gate of gates) if (gate.pkg !== undefined) mark(gate.pkg, "gate");
  for (const entry of ungated) mark(entry.pkg, "ungated");

  for (const [pkg, state] of registrations) {
    if (state === "missing") {
      problems.push({
        kind: "工具沒登記",
        detail:
          `tools/${pkg} 是 workspace 成員，但 GATES 與 UNGATED 都沒有它。\n` +
          `      它是閘門就加進 GATES（要寫 tiers）；刻意不當閘門就加進 UNGATED（要寫理由）。`,
      });
    }
    if (state === "both") {
      problems.push({
        kind: "重複登記",
        detail: `tools/${pkg} 同時在 GATES 與 UNGATED 裡 —— 它到底是不是閘門？`,
      });
    }
  }

  // ── ② package.json 的 scripts.gate ──────────────────────────────
  const rootPackage = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  const scripts = rootPackage.scripts ?? {};

  const expectedGateScript = deriveGateScript(gates);
  if (scripts["gate"] !== expectedGateScript) {
    problems.push({
      kind: "scripts.gate 對不上",
      detail:
        `package.json 的 gate 與 GATES 推導出來的不同。應該是：\n` +
        `      ${expectedGateScript}\n` +
        `      目前是：\n      ${scripts["gate"] ?? "（沒有這個 script）"}`,
    });
  }

  // ── ③ 每一道閘門要能單獨跑 ──────────────────────────────────────
  //
  // README 教人跑 `vpr theme-verify` 這種單支指令。少一個別名不會造成假綠燈，
  // 但會讓文件裡那行指令直接不存在。成本是一行，所以守它。
  for (const gate of gates) {
    if (gate.pkg === undefined) continue;
    if (scripts[gate.id] !== gate.command) {
      problems.push({
        kind: "單獨跑的別名對不上",
        detail:
          `package.json 應該有 "${gate.id}": "${gate.command}"，` +
          `目前是 ${scripts[gate.id] === undefined ? "（沒有）" : `"${scripts[gate.id]}"`}`,
      });
    }
  }

  // ── ④ 兩個 workflow ─────────────────────────────────────────────
  const workflows: ReadonlyArray<readonly [Tier, string]> = [
    ["tier1", ".github/workflows/tier1-quality.yml"],
    ["tier2", ".github/workflows/tier2-security.yml"],
  ];

  for (const [tier, path] of workflows) {
    const { missing, extra } = diffSets(
      deriveTierCommands(gates, tier),
      extractTierCommands(read(path)),
    );
    for (const command of missing) {
      problems.push({ kind: "workflow 少一道", detail: `${path} 沒有跑 \`${command}\`` });
    }
    for (const command of extra) {
      problems.push({
        kind: "workflow 多一道",
        detail: `${path} 跑了 \`${command}\`，但 GATES 沒把它排進 ${tier}`,
      });
    }
  }

  // ── ⑤ README 那張〈兩層檢查〉的表 ───────────────────────────────
  //
  // ⚠️ 這是**存在性**檢查，不是精確比對：那兩格還寫著 GATES 不涵蓋的東西
  //（SAST、機密掃描），所以「多出來的字」是合法的。少寫一道會紅，多寫不會。
  const readme = normalize(read("README.md"));
  for (const tier of ["tier1", "tier2"] as const) {
    const heading = tier === "tier1" ? "**Tier 1 —" : "**Tier 2 —";
    const row = readme.split("\n").find((line) => line.startsWith("|") && line.includes(heading));
    if (row === undefined) {
      problems.push({
        kind: "README 那張表不見了",
        detail: `README.md 裡找不到 ${heading} 開頭的表格列（〈兩層檢查〉那一節）`,
      });
      continue;
    }
    for (const gate of gates) {
      if (!gate.tiers.includes(tier)) continue;
      if (!row.includes(normalize(gate.label))) {
        problems.push({
          kind: "README 漏了一道",
          detail: `README〈兩層檢查〉的 ${tier} 那一格沒提到「${gate.label}」`,
        });
      }
    }
  }

  return problems;
}
