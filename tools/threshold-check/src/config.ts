/**
 * 門檻從哪裡讀出來、探針設定怎麼造出來。
 *
 * ── 為什麼事實來源是 `vp lint --print-config`，不是 `vite.config.ts` 的文字 ──
 *
 * 門檻寫在根層 `vite.config.ts` 的 `lint.rules` 與 `lint.overrides` 裡，而
 * **「哪些格子算門檻」不該由這支工具自己列一份清單** —— 那會造出第二份名冊，
 * 而這棵樹一再栽在「同一件事有兩份寫法然後它們漂開」上（gate-kit/flags.ts 的
 * 檔頭列了三次）。C147 §四 的草圖寫「八個門檻」，票面實測是十一格 ——
 * **那個差額就是手抄清單的成本**。
 *
 * 所以射程由 `--print-config` 決定：任何 `["deny"|"warn", [{ …數字… }]]` 形狀的
 * 規則選項都算一格。今天是 11 格，明天有人加第十二條複雜度規則，它自己就進來了。
 *
 * ⚠️ **代價是這條萃取規則會多抓** —— 一個「數字選項但不是門檻」的規則
 *（假想例：`{ allow: 3 }`）會被算成一格。擋它的是 `tests/` 裡那條把今天
 * 11 個三元組逐字釘住的夾具：萃取結果一變，測試先紅，由人判斷那一格算不算門檻。
 * **這是刻意的：靜默的少涵蓋才是這支工具存在要防的東西。**
 */

/** 一格門檻：某個範圍裡、某條規則的、某個數字選項。 */
export interface Slot {
  /** `"base"` 或 `"overrides[N]"`。**位置就是身分** —— 配對靠它，見 `pairSlots`。 */
  readonly scope: string;
  /** `--print-config` 用的規則名，例如 `max-depth`、`vue/max-props`。 */
  readonly rule: string;
  /** 選項鍵，例如 `max`、`maxProps`。 */
  readonly option: string;
  readonly value: number;
  /** 給人看的範圍說明：base 是「根層」，override 是它自己的 `files` 樣式。 */
  readonly where: string;
}

interface RuleBag {
  readonly scope: string;
  readonly where: string;
  readonly rules: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ruleBags(printConfig: unknown): RuleBag[] {
  if (!isRecord(printConfig)) return [];
  const bags: RuleBag[] = [];

  const base = printConfig["rules"];
  if (isRecord(base)) bags.push({ scope: "base", where: "根層 lint.rules", rules: base });

  const overrides = printConfig["overrides"];
  if (Array.isArray(overrides)) {
    for (const [at, entry] of overrides.entries()) {
      if (!isRecord(entry)) continue;
      const rules = entry["rules"];
      if (!isRecord(rules)) continue;
      const files = Array.isArray(entry["files"]) ? entry["files"].join("、") : "?";
      bags.push({ scope: `overrides[${at}]`, where: files, rules });
    }
  }

  return bags;
}

/**
 * 把 `--print-config` 的輸出攤平成一串門檻。
 *
 * ⚠️ **順序有意義**：`pairSlots` 靠位置把真設定與探針設定對起來，而兩邊都由
 * 同一支 `vp lint --print-config` 產生，所以鍵的順序一致。
 */
export function collectSlots(printConfig: unknown): Slot[] {
  const slots: Slot[] = [];
  for (const bag of ruleBags(printConfig)) {
    for (const [rule, config] of Object.entries(bag.rules)) {
      if (!Array.isArray(config) || config.length < 2) continue;
      const options = config[1];
      if (!Array.isArray(options) || !isRecord(options[0])) continue;
      for (const [option, value] of Object.entries(options[0])) {
        if (typeof value !== "number" || !Number.isInteger(value)) continue;
        slots.push({ scope: bag.scope, rule, option, value, where: bag.where });
      }
    }
  }
  return slots;
}

/**
 * 規則名 → 診斷訊息裡的 `code`。`max-depth` → `eslint(max-depth)`、
 * `vue/max-props` → `vue(max-props)`。
 */
export function codeOf(rule: string): string {
  const slash = rule.lastIndexOf("/");
  return slash === -1 ? `eslint(${rule})` : `${rule.slice(0, slash)}(${rule.slice(slash + 1)})`;
}

/**
 * ⚠️ 一格門檻在原始碼裡長的樣子：**一條規則、一個數字選項**。
 *
 * 兩個以上數字選項的規則這條樣式抓不到（只會抓到第一個），而那不會靜默 ——
 * `--print-config` 那邊會多數出一格，`floorSource` 的計數對不上就紅。
 */
const RULE_LINE =
  /(?<head>(?:"[\w/@-]+"|[A-Za-z_$][\w$]*):\s*\[\s*"(?:error|warn)"\s*,\s*\{\s*\w+\s*:\s*)(?<value>\d+)(?<tail>\s*\}\s*\])/g;

const RULE_NAME = /^"?([\w/@-]+)"?\s*:/;

export interface FlooredSource {
  readonly text: string;
  /** 改寫了幾格。呼叫端拿它跟 `collectSlots` 的長度比對。 */
  readonly count: number;
}

/**
 * 把每一格門檻壓到**它那條規則裡獨一無二的地板值**（同一條規則在原始碼裡
 * 第 n 次出現就給 n，從 0 開始）。
 *
 * ── 為什麼是「地板」而不是「減一」──────────────────────────────────
 *
 * C147 §四 的草圖是「跟實測最大值比」，而票面實測時發現**實測最大值靜態讀不到**
 * （門檻設在 max 上時，lint 的輸出裡一個字都沒有），於是票面改用「各減一，
 * 報不出違規就是過期」。⚠️ **那個做法答得出「過不過期」，答不出「該調到多少」。**
 *
 * 壓到地板則兩件事一次答完：規則對那個範圍裡**每一個**函式都開火，於是
 * 訊息裡的實測值攤開來了，取最大就是 C147 §二 說的「新的最大值」。
 *
 * ── 為什麼地板值逐格不同 ────────────────────────────────────────────
 *
 * ⚠️⚠️ **這是整支工具的關鍵**：一條規則配在多個範圍上（產品碼 199／測試碼 455／
 * per-file 放行 850）時，違規歸屬給哪一格**不能靠路徑重算一次 glob** ——
 * 那會把 `vite.config.ts` 的 `files:` 樣式抄第二份。
 *
 * 每一格給不同的地板值之後，oxlint 自己在訊息裡寫著 `Maximum allowed is N`，
 * **歸屬是 oxlint 算的，不是我們算的**。多一個 override、改一次 glob，
 * 這支工具一行都不用動。
 */
export function floorSource(source: string): FlooredSource {
  const seen = new Map<string, number>();
  let count = 0;

  const text = source.replace(RULE_LINE, (match, ...rest) => {
    const groups = rest.at(-1) as { head: string; value: string; tail: string };
    const name = RULE_NAME.exec(groups.head)?.[1];
    if (name === undefined) return match;
    const rank = seen.get(name) ?? 0;
    seen.set(name, rank + 1);
    count += 1;
    return `${groups.head}${rank}${groups.tail}`;
  });

  return { text, count };
}

/** 一格門檻的兩個讀數：真設定的值，與探針設定裡代表它的地板值。 */
export interface Pair {
  readonly slot: Slot;
  readonly floor: number;
}

export type Pairing =
  | { readonly ok: true; readonly pairs: Pair[] }
  | { readonly ok: false; readonly why: string };

/**
 * 把真設定與探針設定的門檻逐格對起來，並驗四件事。
 *
 * ⚠️ 這四條全是**自我防護的夾具**（C154 §三 第 3 條）：它們守的是這支工具
 * 自己有沒有量對，不是別人的程式碼有沒有壞。**所以它們不計 D16 迭代軸的分**，
 * 但少了它們，一個對不上的探針會安靜地回綠 —— 每一條都必須紅。
 */
export function pairSlots(real: readonly Slot[], probe: readonly Slot[]): Pairing {
  if (real.length !== probe.length) {
    return {
      ok: false,
      why: `真設定有 ${real.length} 格門檻，探針設定有 ${probe.length} 格 —— 改寫沒有全中`,
    };
  }

  const pairs: Pair[] = [];
  const usedFloors = new Map<string, Set<number>>();

  for (const [at, slot] of real.entries()) {
    const other = probe[at];
    if (other === undefined) return { ok: false, why: `第 ${at} 格在探針設定裡不存在` };
    if (other.scope !== slot.scope || other.rule !== slot.rule || other.option !== slot.option) {
      return {
        ok: false,
        why: `第 ${at} 格對不上：真設定是 ${slot.scope}／${slot.rule}／${slot.option}，探針設定是 ${other.scope}／${other.rule}／${other.option}`,
      };
    }
    if (other.value >= slot.value) {
      return {
        ok: false,
        why: `${slot.rule}（${slot.where}）的地板值 ${other.value} 沒有低於門檻 ${slot.value} —— 探針量不到分佈`,
      };
    }

    // ⚠️ 同一條規則的兩格拿到同一個地板值，兩格的違規就會混在一起 ——
    // 其中一格過期而另一格沒有時，混出來的最大值會讓它靜靜地回綠。
    const floors = usedFloors.get(slot.rule) ?? new Set<number>();
    if (floors.has(other.value)) {
      return {
        ok: false,
        why: `${slot.rule} 有兩格拿到同一個地板值 ${other.value} —— 違規歸屬會混在一起`,
      };
    }
    floors.add(other.value);
    usedFloors.set(slot.rule, floors);

    pairs.push({ slot, floor: other.value });
  }

  return { ok: true, pairs };
}
