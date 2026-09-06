import { spawnSync } from "node:child_process";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * 無障礙閘門的反向測試（HANDOFF 第 22 項）。
 *
 * ── 這幾條測試在防的是什麼 ─────────────────────────────────────────
 *
 * `src/a11y.js` 對本 repo 的 `.vue` 檔實測是**零命中**。零命中有兩種：
 * 一種是「看過了，沒問題」，一種是「什麼都沒看」。這個 repo 已經在
 * 第二種上栽過很多次（見 tier2-security.yml 對 SBOM 與 semgrep 的註解），
 * 而兩者在 CI 上長得一模一樣：綠燈。
 *
 * 所以這裡不驗「repo 是乾淨的」—— 那件事閘門自己每次都在驗。
 * 這裡驗的是**閘門自己還活著**：拿一份故意寫壞的 SFC，
 * 要求每一條規則都確實對它開火。
 *
 * ⚠️ 斷言的是**規則 ID 的集合**，不是數量、也不是 exit code。
 *   - 用數量：換一條規則、數量不變，測試照樣綠
 *   - 用 exit code：只要有任何一條紅就綠，其餘 22 條全壞掉也看不出來
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CONFIG = fileURLToPath(new URL("../src/a11y.js", import.meta.url));
const ROOT_CONFIG = fileURLToPath(new URL("../../../eslint.config.js", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/a11y-violations.vue", import.meta.url));

/**
 * 刻意不涵蓋的規則：規則 ID → 為什麼一個 SFC 檔案觸發不了它。
 *
 * 現在是空的，而它存在是因為 C57：**一道沒有合法出口的閘門，最後一定
 * 是閘門被拿掉。** 若哪天上游加了一條需要特殊設定才會開火的規則，
 * 正確的動作是在這裡具名寫下理由，不是把整條斷言放寬。
 */
const UNCOVERED: Readonly<Record<string, string>> = {};

/** 用閘門自己的設定跑 ESLint。`ignore: false` 才碰得到刻意被排除的 fixture。 */
async function lintFixture(): Promise<ESLint.LintResult> {
  const eslint = new ESLint({
    overrideConfigFile: CONFIG,
    // flat config 的 `ignores` 會把 fixture 擋在外面（不擋的話閘門永遠是紅的）。
    // 這一行是唯一繞過它的地方，而且只在測試裡。
    ignore: false,
  });
  const [result] = await eslint.lintFiles([FIXTURE]);
  if (result === undefined) throw new Error("fixture 沒有被 lint 到");
  return result;
}

/** 這份設定實際啟用了哪些 a11y 規則 —— 問 ESLint，不重新推導一次。 */
async function enabledRules(): Promise<Set<string>> {
  const eslint = new ESLint({ overrideConfigFile: CONFIG, ignore: false });
  const calculated = (await eslint.calculateConfigForFile(FIXTURE)) as {
    rules: Record<string, unknown>;
  };
  return new Set(
    Object.keys(calculated.rules).filter((rule) => rule.startsWith("vuejs-accessibility/")),
  );
}

describe("無障礙閘門的規則確實會開火", () => {
  it("★ fixture 觸發了每一條被啟用的規則", async () => {
    const enabled = await enabledRules();
    const fired = new Set((await lintFixture()).messages.map((message) => message.ruleId));

    const silent = [...enabled].filter((rule) => !fired.has(rule) && !(rule in UNCOVERED));

    // 訊息刻意列出規則名：紅的時候要能直接看出是哪一條沒開火，
    // 而不是只知道「集合對不起來」。
    expect(silent, `這些規則對 fixture 沒有反應：\n  ${silent.join("\n  ")}`).toEqual([]);
  });

  it("★ 沒有多出來的規則 —— fixture 只該踩到被啟用的那些", async () => {
    const enabled = await enabledRules();
    const fired = [...new Set((await lintFixture()).messages.map((message) => message.ruleId))];

    expect(fired.filter((rule) => rule !== null && !enabled.has(rule))).toEqual([]);
  });

  it("★ 沒有剖析錯誤 —— 一個剖析不了的檔案，23 條規則會一起安靜", async () => {
    // fixture 的 `<script setup lang="ts">` 寫的是 TS 專屬語法，而
    // `src/a11y.js` 設了 `parserOptions.parser: false`（不剖析 `<script>`）。
    // 那個選項失效、掉回 espree 的話，整個檔案剖析失敗 → 一條規則都不命中，
    // 而那與「沒有問題」在 CI 上長得一模一樣。這條就是擋那個。
    //
    // ⚠️ 它**不**擋「有人改成 tseslint.parser」—— 那樣剖析得起來，
    // 這條照樣綠。要知道那件事有沒有發生，去看 `src/a11y.js` 的註解
    //（那裡寫著改回去會把 C2 的 TypeScript 6.0.3 釘子重新綁上來）。
    const result = await lintFixture();
    const fatal = result.messages.filter((message) => message.fatal === true);
    expect(fatal.map((message) => message.message)).toEqual([]);
  });

  it("每一條都是 error，不是 warning", async () => {
    // CI 跑的是 `eslint --max-warnings=0`，所以 warning 也會擋。
    // 但本機直接跑 eslint 時 warning 不會讓人停下來，
    // 而一條沒有人會停下來看的無障礙告警等於沒有這條規則。
    const result = await lintFixture();
    expect(result.messages.every((message) => message.severity === 2)).toBe(true);
  });
});

/**
 * **這個 checkout** 裡實際存在的 `.vue`。不寫死清單 —— 寫死的那一刻它就開始過期。
 *
 * ── 為什麼問 git，不走磁碟（C190 §二 4）─────────────────────────────
 *
 * 前一版遞迴走磁碟，跳過清單是手抄的 `node_modules`／`dist`／`coverage`／`.git`
 * —— **沒有 `.claude`**。於是主 checkout 底下開一棵並行 session 的 worktree
 * （這棵樹自己的工作慣例，`.gitignore:33` 就是為它加的），這條斷言實跑 70 vs 71：
 * 多出來的那一個是鄰居樹裡**這份 fixture 的複本**。設定的排除樣式是萬用字元開頭
 * （連複本一起排除），而這裡的期望值用的是絕對路徑相等（排不掉複本）——
 * 同一個「路徑錨定對副本必然失效」，而這一次錨在路徑上的是**期望值**。
 *
 * ⚠️ **那個紅是這條斷言自己判準下的真紅，不是被設定改出來的**：它在
 * `src/a11y.js` 一個字都還沒動的時候就量得到。壞的是它問的**對象** ——
 * 「磁碟上每一個 `.vue`」而不是「這個 checkout 裡每一個 `.vue`」。所以這裡換的
 * 是對象，判準（「每一個都要被掃到」）一個字沒動，AGENTS.md 規則二 管的是後者。
 *
 * ⚠️ **而它同時是 `src/worktrees.js` 那條黑名單的守衛。** 那一列只擋得住
 * `.claude/worktrees/` 這個慣例位置；副本放在別處時，eslint 那一側會多收一批、
 * git 這一側不會，兩側對不起來 —— 這條就紅（C190 §四（3）第二列，實測差集 35）。
 * 黑名單漏掉的位置因此是**吵的**，不是安靜的。
 *
 * ⚠️ 未追蹤那一半不能省：一個剛加進來、還沒 `git add` 的 `.vue` 也在這個
 * checkout 裡，只問 `ls-files` 會讓它在期望值裡缺席而斷言假綠。
 * `tools/pii-check/src/tracked.ts` 的檔頭有同一組理由的完整版；刻意不 import
 * 它 —— 跨工具相依要過 `conformance` 的邊界規則，而三支問 git 的問題不一樣。
 */
function vueFilesInCheckout(root: string): string[] {
  const fixture = relative(root, FIXTURE);
  const listed = new Set([
    ...gitLines(root, ["ls-files", "-z"]),
    ...gitLines(root, ["ls-files", "-z", "--others", "--exclude-standard"]),
  ]);

  return [...listed].filter((path) => path.endsWith(".vue") && path !== fixture);
}

/**
 * 找不到 git 就直接失敗，不退回去掃磁碟 —— 磁碟上有鄰居工作樹的副本，
 * 用它當事實來源會讓這條斷言在開發機紅、在 CI 綠（C41）。
 *
 * `-z` 是必要的：不加的話含非 ASCII 的路徑會被 git 加引號並做八進位轉義。
 */
function gitLines(root: string, args: readonly string[]): string[] {
  const result = spawnSync("git", [...args], { cwd: root, encoding: "utf8" });

  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `讀不到工作樹內容（git ${args.join(" ")}）：${result.error?.message ?? result.stderr.trim()}`,
    );
  }

  return result.stdout.split("\0").filter((path) => path.length > 0);
}

describe("閘門的掃描範圍", () => {
  it("★ 這個 checkout 裡每一個 .vue 都被掃到了", async () => {
    // 這道閘門對本 repo 的正常結果是**零個發現**，而 `eslint .` 在一個
    // 檔案都沒配對到的時候，結果也是零個發現、exit 0。兩者在 CI 上
    // 完全無法區分。
    //
    // 會讓它們分家的情況很平常：`.vue` 搬去一個新的頂層目錄、
    // 上面的 ignores 被誰擴大了一格、glob 寫錯一個字。
    // 少了這條，那些改動的症狀是「閘門變得更快」，沒有別的。
    const eslint = new ESLint({ overrideConfigFile: CONFIG, cwd: ROOT });
    const results = await eslint.lintFiles([ROOT]);

    const linted = results
      .map((result) => result.filePath)
      .filter((path) => path.endsWith(".vue"))
      .map((path) => relative(ROOT, path))
      .sort();

    expect(linted).toEqual(vueFilesInCheckout(ROOT).sort());
    // 上面那條在「兩邊都是空的」時也會過。這一行讓那種情況紅。
    expect(linted.length).toBeGreaterThan(0);
  });
});

describe("fixture 的排除範圍", () => {
  // flat config 的 `ignores` 是相對 basePath 比對的，而閘門與這支測試的
  // basePath 不同（repo 根 vs. 本 package）。第一版樣式寫死了
  // `**/eslint-config/tests/…`，在 repo 根那一側能排除、在這一側排不掉 ——
  // 所以兩邊都要測。只測一邊的話，另一邊的失效方式是閘門永遠紅，
  // 而永遠紅的閘門會先被加旗標繞過、再被拿掉（C57）。
  const BASE_PATHS = {
    "從 repo 根跑（閘門）": fileURLToPath(new URL("../../..", import.meta.url)),
    "從本 package 跑（測試）": fileURLToPath(new URL("..", import.meta.url)),
  };

  for (const [label, cwd] of Object.entries(BASE_PATHS)) {
    it(`★ ${label}：排除的是那一個檔案，不是整個目錄`, async () => {
      const eslint = new ESLint({ overrideConfigFile: CONFIG, cwd });

      expect(await eslint.isPathIgnored(FIXTURE)).toBe(true);

      // 排除範圍寫成目錄的話，之後任何人在 fixtures/ 下新增的 .vue
      // 都會安靜地不被檢查 —— 而那正是這道閘門要防的事情本身。
      expect(await eslint.isPathIgnored(`${HERE}fixtures/some-other.vue`)).toBe(false);
    });
  }
});

describe("巢狀工作樹不算這個 checkout 的一部分", () => {
  /**
   * ⚠️ **斷言的是行為，不是設定裡有沒有那個字串。** 比對陣列內容的版本，
   * 在有人把樣式改成一個排不掉東西的字串時照樣是綠的 —— 它會與現實脫鉤，
   * 而這道閘門要防的正是「看起來有在檢查」。
   *
   * 兩份設定 × 兩個呼叫端都問一次：閘門從 repo 根跑，反向測試從本 package 跑，
   * 而 flat config 的 `ignores` 是相對 basePath 比對的（`src/a11y.js` 那段
   * basePath 教訓）。⚠️ **但這四格不是四份等價的證據**：從本 package 跑時，
   * 鄰居樹本來就落在 basePath **之外**，這兩格在 `src/worktrees.js` 那一列
   * 加進來之前就是 `true` —— 那是**涵蓋**，不是排除（C190 §二 3）。
   * 拿「四格全綠」當成樣式在兩端都測過了的證據是錯的。
   */
  const CONFIGS = {
    無障礙閘門: CONFIG,
    "Tier 2 安全閘門": ROOT_CONFIG,
  };
  /**
   * 每一個呼叫端配一個「**必須**還在射程內」的對照 —— 少了它，一條寬到把
   * `platform/ui/**` 一起吃掉的樣式會讓上面那條斷言全綠。
   *
   * ⚠️ **兩個 cwd 的對照組不是同一個檔案，而那件事本身就是證據。** 實測：
   * 從本 package 跑時，主樹那份逐位元組相同的 `UiTextarea.vue`（在 repo 根底下、
   * basePath 之外）也回 `true` —— 也就是說這一格連「主樹的檔案」都排除，
   * 它排除的是**整個 basePath 之外**，跟樣式無關。所以這一格的對照只能挑
   * package 裡面的檔案，而挑不到 package 外面的這件事，正是 C190 §二 3 說的
   * 「這一端是涵蓋滿足的，不是樣式滿足的」。
   *
   * ⚠️ **但別把那句話讀成「這兩格永遠不會紅」——** 它們接不住「樣式太窄」
   * （漏掉一個副本位置，那是上面那條射程斷言在守），接得住「樣式太寬」：
   * 實測把 `src/worktrees.js` 改成 `ignores: ["**"]`，四格全紅，因為那時
   * 連 package 裡面的對照檔都被排除了。
   */
  const CWDS = {
    "從 repo 根跑（閘門）": {
      cwd: ROOT,
      inScope: `${ROOT}platform/ui/src/components/UiTextarea.vue`,
    },
    "從本 package 跑（測試）": {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      inScope: `${HERE}fixtures/some-other.vue`,
    },
  };

  // 並行 session 的工作樹開在這裡（`.gitignore:33`）。路徑不必真的存在 ——
  // `isPathIgnored` 問的是樣式，而挑這一支是因為它就是 #282 命中的那一個檔。
  const NEIGHBOUR = `${ROOT}.claude/worktrees/probe/platform/ui/src/components/UiTextarea.vue`;

  for (const [configLabel, configFile] of Object.entries(CONFIGS)) {
    for (const [cwdLabel, { cwd, inScope }] of Object.entries(CWDS)) {
      it(`★ ${configLabel}／${cwdLabel}：鄰居工作樹裡的檔案不在射程內`, async () => {
        const eslint = new ESLint({ overrideConfigFile: configFile, cwd });

        expect(await eslint.isPathIgnored(NEIGHBOUR)).toBe(true);
        expect(await eslint.isPathIgnored(inScope)).toBe(false);
      });
    }
  }
});
