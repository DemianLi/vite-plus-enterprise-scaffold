import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { workspacePackages } from "@org/doc-facts/derive";

import {
  GATES,
  UNGATED,
  type Gate,
  type Ship,
  type Tier,
  type Ungated,
  type Variant,
} from "./gates.ts";

/**
 * 名冊的四個消費端各自對不對得上，**外加名冊自己的一列必填**（②，C155）——
 * 前者問「四份副本一致嗎」，後者問「這一列有沒有人判斷過」。
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
 * `scripts.gate` 與 `scripts.ready` 自己（C217 §四）：交給 `<名字>:select`，
 * 由選擇器決定跑 `<名字>:upstream` 還是 `<名字>:fork`。
 *
 * ⚠️⚠️ **`--no-cache` 那一層不能拿掉**（C218）。選擇器會再開一個 `vp` 行程，而一個
 * **被快取追蹤**的行程裡，巢狀的 `vp` 只要必須真的執行（cache miss）就開不起子行程：
 * `Failed to spawn process … Invalid argument (os error 22)`。實測四組、帶鹽值防重播：
 * 直接從 `vpr` 跑 → 開不起；包一層 `vp run --no-cache` → 真的執行；`pnpm run` → 真的執行。
 * ⚠️ 而它**被快取重播蓋住過一次**：內層第一趟是直接跑的、結果進了快取，之後的「巢狀」
 * 全是 cache hit 重播 —— 不開行程就不會出錯，量測回報全綠。
 */
export function selectorScript(name: "gate" | "ready"): string {
  return `vp run --no-cache ${name}:select`;
}

/** `<名字>:select`：選擇器本身。 */
export function selectorCommand(name: "gate" | "ready"): string {
  return `node tools/fork-select/src/cli.ts --script ${name}`;
}

/** `gate:fork` 應該長的樣子：下發、而且不帶 `notInGateScript` 的那幾道（C217 §四）。 */
export function deriveForkGateScript(gates: readonly Gate[]): string {
  return deriveGateScript(gates.filter((gate) => gate.ship.to === "fork"));
}

/**
 * fork 的測試那一步要帶的篩選（C217 §五）。
 *
 * ⚠️⚠️ **正向那一半照抄 `pnpm-workspace.yaml` 的目錄樣式** —— 不寫 `@org/*`，也不只給
 * 排除。那兩種實測都**安靜地跑全部**：根 package（`@org/monorepo`）也被選中，而它的
 * `test` 是 `vp run -r test`，被排除的那幾支從遞迴那一趟回來了（task 60、package 31；
 * C218）。`vite-plus` 自己的文件教的就是 `@my/*` 那一種。目錄樣式選不到根，而團隊
 * 新加的 package 不管取什麼名字都選得到。
 *
 * ⚠️ `--fail-if-no-match` 不是裝飾：`--filter '*'` 實測選到零個 package 而回 0 ——
 * 測試那一步什麼都沒跑，而它是綠的。
 */
export function deriveForkTestFilters(
  patterns: readonly string[],
  excludedNames: readonly string[],
): string {
  return [
    ...patterns.map((pattern) => `--filter './${pattern}'`),
    ...excludedNames.map((name) => `--filter '!${name}'`),
    "--fail-if-no-match",
  ].join(" ");
}

/** `pnpm-workspace.yaml` 的 `packages:` 底下那幾個樣式，照原順序。 */
export function workspacePatterns(yaml: string): string[] {
  const lines = yaml.split("\n");
  const patterns: string[] = [];
  for (const line of lines.slice(lines.findIndex((l) => /^packages:\s*$/.test(l)) + 1)) {
    const match = /^\s+-\s+["']?([^"'\s#]+)["']?\s*$/.exec(line);
    if (match?.[1] === undefined) break;
    patterns.push(match[1]);
  }
  return patterns;
}

/** 每個 workflow 讀辨別子的那一步（C217 §三）：一個 workflow 只讀一次，其餘步驟判它的輸出。 */
export const TREE_STEP_ID = "tree";
export const UPSTREAM_ONLY_IF = "steps.tree.outputs.side == 'upstream'";
export const FORK_ONLY_IF = "steps.tree.outputs.side == 'fork'";

function shipOf(gate: Gate, variant?: Variant): Ship["to"] {
  return (variant?.ship ?? gate.ship).to;
}

/** 某一層的每一行指令，在 fork 預設裡是哪一側。 */
function commandSides(gates: readonly Gate[], tier: Tier): Map<string, Ship["to"]> {
  const sides = new Map<string, Ship["to"]>();
  for (const gate of gates) {
    if (!gate.tiers.includes(tier)) continue;
    sides.set(ciCommandOf(gate), shipOf(gate));
    for (const variant of gate.variants ?? []) sides.set(variant.command, shipOf(gate, variant));
  }
  return sides;
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

/** workflow 裡的一步：`if:` 與單行 `run:`（多行區塊記成 `|`）。 */
export interface WorkflowStep {
  readonly if: string;
  readonly run: string;
}

// ⚠️ 開頭寫成 `[ -]*`、「是不是新的一步」交給程式碼看有沒有 `-`，而不是 `(\s*)(-\s+)?`：
// 後者是量詞套量詞，`security/detect-unsafe-regex`（tier2 那道 ESLint）會擋。值的前後空白
// 也在程式碼裡修，不讓 `(.*?)` 與 `[ \t]*` 在正則裡搶同一段字。
const STEP_LINE = /^([ -]*)([\w-]+):(.*)$/;

/**
 * 第一個 `steps:` 底下的每一步。
 *
 * ⚠️ 只認**步驟那一層**的鍵：`with:`／`env:` 底下的鍵、`run: |` 區塊裡的內容都比
 * 步驟鍵縮排更深，所以不會被當成 `if:`／`run:`。這支的用途只有 ⑤b，而那兩個 workflow
 * 各只有一個 job。
 */
export function extractSteps(source: string): WorkflowStep[] {
  const lines = source.split("\n");
  const at = lines.findIndex((line) => /^\s*steps:\s*$/.test(line));
  if (at < 0) return [];
  const steps: { if: string; run: string }[] = [];
  let itemIndent: number | undefined;
  for (const line of lines.slice(at + 1)) {
    const match = STEP_LINE.exec(line);
    if (match === null) continue;
    const [, lead = "", key = "", rest = ""] = match;
    const dashAt = lead.indexOf("-");
    if (dashAt >= 0) {
      itemIndent ??= dashAt;
      if (dashAt !== itemIndent) continue;
      steps.push({ if: "", run: "" });
    } else if (itemIndent === undefined || lead.length !== itemIndent + 2) {
      continue;
    }
    const current = steps.at(-1);
    if (current === undefined) continue;
    const value = rest.trim();
    if (key === "if") current.if = value;
    if (key === "run") current.run = value.replace(TRAILING_COMMENT, "").trimEnd();
  }
  return steps;
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

/**
 * 「這一列的理由指得到一則裁決」的字面判準（C211）。
 *
 * ⚠️ 具名 export 是為了讓測試**引用它**而不是抄一份：抄一份的話，改了規則的
 * pattern 而測試不動，兩邊會安靜地分岔（同 C120 那條「glob 與數字都從契約取」）。
 * 上界 `{1,3}` 是刻意的：沒有上界時 sha512 那種字串會餵出假的命中（C140 §…／
 * `decision-ids` 踩過同一個坑）。
 */
export const CITES_RULING = /\b[CDR]\d{1,3}\b/;

type Read = (relative: string) => string;

/** fork 的測試那一步應該長的樣子（C217 §五）：`ready:fork` 與 tier1 那一步共用這一段。 */
function forkTestCommand(root: string, gates: readonly Gate[], read: Read): string {
  const toolName = (pkg: string): string => {
    const path = join(root, "tools", pkg, "package.json");
    return existsSync(path)
      ? ((JSON.parse(readFileSync(path, "utf8")) as { name?: string }).name ?? `@org/${pkg}`)
      : `@org/${pkg}`;
  };
  const excluded = [
    ...new Set(
      gates.filter((gate) => gate.ship.to === "upstream-only").flatMap((gate) => gate.pkg ?? []),
    ),
  ].map(toolName);
  return `vp run ${deriveForkTestFilters(workspacePatterns(read("pnpm-workspace.yaml")), excluded)} test`;
}

export function checkRoster(root: string, roster: Roster = ROSTER): Problem[] {
  const { gates, ungated } = roster;
  const read: Read = (relative) => readFileSync(join(root, relative), "utf8");
  const scripts =
    (JSON.parse(read("package.json")) as { scripts?: Record<string, string> }).scripts ?? {};
  const forkTest = forkTestCommand(root, gates, read);
  // 順序就是訊息的順序，與拆開之前一字不差。
  return [
    ...checkRegistrations(root, gates, ungated),
    ...checkReasons(gates, ungated),
    ...checkScripts(scripts, gates, forkTest),
    ...checkWorkflows(read, gates, forkTest),
    ...checkReadme(read, gates),
  ];
}

function checkRegistrations(
  root: string,
  gates: readonly Gate[],
  ungated: readonly Ungated[],
): Problem[] {
  const problems: Problem[] = [];

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
  return problems;
}

function checkReasons(gates: readonly Gate[], ungated: readonly Ungated[]): Problem[] {
  const problems: Problem[] = [];

  // ── ② 每一道閘門要寫得出為什麼它存在（C155）──────────────────────
  //
  // `Ungated.why`、`Variant.why`、`notInGateScript` 三個必填理由欄早就有這條
  // 斷言，而 **`Gate.why` 沒有** —— 它只是型別上必填，寫 `""` 一路綠到底。
  // 實測（C155 §三）：把它改短，`vpr gate` 與整套測試都是 0；同樣的變異套在
  // 另外三個欄位上，測試立刻紅。**四個同語意的欄位，只有這一個是靜默的。**
  //
  // ⚠️ 這條規則在**這一層**而不在測試裡，理由是 `why` 對 fork v1 的團隊而言
  // 就是「有人判斷過」那個判斷本身（見 gates.ts 檔頭）—— 他們加一支工具撞到的
  // 應該是閘門，不是一支他們沒在讀的測試。
  //
  // ⚠️ 門檻與三個手足一字不差（`> 20`），而它**今天咬不到任何一列**（最短 25）。
  // 那是刻意的：挑一個今天就會咬的數字來證明它有用，量到的只會是那個數字。
  // 它在加第 17 列的那天才擋人，而那正是它該擋人的時候。
  for (const gate of gates) {
    if (gate.why.length > 20) continue;
    problems.push({
      kind: "閘門沒寫理由",
      detail:
        `GATES 的 \`${gate.id}\` 沒有寫 why，或者短到說不出一件事。\n` +
        `      這一欄要答的是「為什麼有這道閘門、以及為什麼在那一層」。`,
    });
  }

  // ── ②b 每一列要指得到「判它的那則裁決」（C211／#219）───────────────
  //
  // ⚠️ 查的是**有沒有指到**，不是指得對不對 —— 形狀同 `SCOPE.md` 的桶欄
  // （C143／C144：機器查「填了沒有」，填得對不對全綠）。
  //
  // ⚠️⚠️ **為什麼查編號，不查「有沒有寫出 D16 兩軸那兩句」。** 後者要求每一列
  // 各抄一份 C154 的內容，而那正是 C154 §七 說「會是反諷的」那件事：這份名冊
  // 存在的全部理由就是「一份到處都有副本的清單，改動時只有人記得改其中幾處」。
  // **指針不是副本** —— 兩軸的論證留在裁決裡，這一欄只負責指得到它。
  // ⚠️ 代價寫在 C211 §五：一個編號抄上去就過，這條規則分辨不了填得對不對。
  //
  // ⚠️ 射程只到「新增一列」。在既有工具裡加一條規則不會新增名冊列，
  // 所以 C154 §四 射程裡的那一半**這條規則看不到**（C211 §六，實例是 C204）。
  const uncited: string[] = [
    ...gates
      .filter((gate) => !CITES_RULING.test(gate.why))
      .map((gate) => `GATES 的 \`${gate.id}\``),
    ...ungated
      .filter((entry) => !CITES_RULING.test(entry.why))
      .map((entry) => `UNGATED 的 \`${entry.pkg}\``),
  ];
  for (const where of uncited) {
    problems.push({
      kind: "理由指不到裁決",
      detail:
        `${where} 的 why 沒有指到任何一則裁決（C<n>／D<n>／R<n> 的字面）。\n` +
        `      這一欄不必自己論證，它要**指得到**那個論證住在哪裡 ——\n` +
        `      判它進來（或刻意不接）的那一則。找不到那一則，就是還沒有人裁過它。`,
    });
  }
  return problems;
}

function checkScripts(
  scripts: Readonly<Record<string, string>>,
  gates: readonly Gate[],
  forkTest: string,
): Problem[] {
  const problems: Problem[] = [];

  // ── ③ package.json 的 scripts.gate ──────────────────────────────
  // ⚠️ C217 §四 起 `gate`／`ready` 是選擇器，閘門鏈住在 `gate:upstream`／`gate:fork`。
  // `gate:upstream` 就是這一格原本比對的 `scripts.gate`，逐字不變 —— 上游一支都不少（C217 §七）。
  for (const name of ["gate", "ready"] as const) {
    const expected: ReadonlyArray<readonly [string, string]> = [
      [name, selectorScript(name)],
      [`${name}:select`, selectorCommand(name)],
    ];
    for (const [key, value] of expected) {
      if (scripts[key] === value) continue;
      problems.push({
        kind: "gate／ready 不是選擇器",
        detail:
          `package.json 的 ${key} 應該是 \`${value}\`，` +
          `目前是 ${scripts[key] === undefined ? "（沒有）" : `\`${scripts[key]}\``}。\n` +
          `      直接寫一條鏈的話兩棵樹跑同一條（C217 §四）；少了 --no-cache 那一層，` +
          `\`vpr ${name}\` 開不起巢狀的 vp（C218）。`,
      });
    }
  }

  const chains = [
    ["gate:upstream", deriveGateScript(gates), "GATES 全部"],
    ["gate:fork", deriveForkGateScript(gates), "GATES 裡 `ship.to` 是 fork 的"],
  ] as const;
  for (const [name, expected, from] of chains) {
    if (scripts[name] !== expected) {
      problems.push({
        kind: `${name} 對不上`,
        detail:
          `package.json 的 ${name} 與${from}推導出來的不同。應該是：\n` +
          `      ${expected}\n` +
          `      目前是：\n      ${scripts[name] ?? "（沒有這個 script）"}`,
      });
    }
  }

  // fork 的測試那一步：排除清單從名冊推（C217 §五）。
  if (!(scripts["ready:fork"] ?? "").includes(forkTest)) {
    problems.push({
      kind: "fork 的測試篩選對不上",
      detail:
        `package.json 的 ready:fork 裡找不到這一段：\n      ${forkTest}\n` +
        `      正向照抄 pnpm-workspace.yaml、排除名冊上游專用那幾支的 package（C217 §五）。`,
    });
  }

  // ── ④ 每一道閘門要能單獨跑 ──────────────────────────────────────
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
  return problems;
}

function checkWorkflows(read: Read, gates: readonly Gate[], forkTest: string): Problem[] {
  const problems: Problem[] = [];

  // ── ⑤ 兩個 workflow ─────────────────────────────────────────────
  const workflows: ReadonlyArray<readonly [Tier, string]> = [
    ["tier1", ".github/workflows/tier1-quality.yml"],
    ["tier2", ".github/workflows/tier2-security.yml"],
  ];

  for (const [tier, path] of workflows) {
    const source = read(path);
    const { missing, extra } = diffSets(
      deriveTierCommands(gates, tier),
      extractTierCommands(source),
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

    // ── ⑤b 每一步在 fork 裡跑不跑，要對得上名冊（C217 §三／§六）──────
    //
    // ⚠️ 辨別子那一步不在的話，`steps.tree.outputs.side` 是空字串，於是每一個
    // 「== 'upstream'」都是假 —— 上游專用的步驟**在上游**安靜地全部被跳過，而 job 是綠的。
    if (!new RegExp(`^\\s*id:\\s*${TREE_STEP_ID}\\s*$`, "m").test(source)) {
      problems.push({
        kind: "workflow 讀不到辨別子",
        detail: `${path} 沒有 \`id: ${TREE_STEP_ID}\` 那一步 —— 下面每一個 \`${UPSTREAM_ONLY_IF}\` 都會是假。`,
      });
    }
    const sides = commandSides(gates, tier);
    for (const step of extractSteps(source)) {
      const side = sides.get(step.run);
      const upstreamOnly = step.if.includes(UPSTREAM_ONLY_IF);
      if (side === "upstream-only" && !upstreamOnly) {
        problems.push({
          kind: "上游專用的步驟在 fork 也會跑",
          detail: `${path} 的 \`${step.run}\` 是上游專用，它的 if: 要帶 \`${UPSTREAM_ONLY_IF}\``,
        });
      }
      if (side === "fork" && (upstreamOnly || step.if.includes(FORK_ONLY_IF))) {
        problems.push({
          kind: "下發的步驟在另一棵樹被跳過",
          detail: `${path} 的 \`${step.run}\` 下發，兩棵樹都要跑 —— 它的 if: 不得判辨別子`,
        });
      }
      // 兩條測試步驟：上游那條在 fork 會跑到上游專用工具的測試，fork 那條在上游會少跑。
      if (step.run.startsWith("./node_modules/.bin/vp run -r test") && !upstreamOnly) {
        problems.push({
          kind: "測試步驟的分流錯了",
          detail: `${path} 的全量測試那一步要帶 \`${UPSTREAM_ONLY_IF}\` —— 否則 fork 會跑上游專用工具的測試（C217 §五）`,
        });
      }
      if (step.run.includes(forkTest) && !step.if.includes(FORK_ONLY_IF)) {
        problems.push({
          kind: "測試步驟的分流錯了",
          detail: `${path} 的 fork 測試那一步要帶 \`${FORK_ONLY_IF}\` —— 否則上游會安靜地少跑那幾支的測試`,
        });
      }
    }
  }

  // tier1 跑測試，所以 fork 那一條要真的在；它的篩選與 ready:fork 是同一段字串。
  if (!read(".github/workflows/tier1-quality.yml").includes(forkTest)) {
    problems.push({
      kind: "fork 的測試篩選對不上",
      detail: `.github/workflows/tier1-quality.yml 裡找不到這一段：\n      ${forkTest}`,
    });
  }
  return problems;
}

function checkReadme(read: Read, gates: readonly Gate[]): Problem[] {
  const problems: Problem[] = [];

  // ── ⑥ README 那張〈兩層檢查〉的表 ───────────────────────────────
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
