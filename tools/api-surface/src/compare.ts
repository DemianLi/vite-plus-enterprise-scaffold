import type { EntrySurface, ExportShape } from "./shape.ts";

/**
 * 把兩份表面比出「破壞性」與「相容」兩類變更。
 *
 * ── 兩類，因為出口只有兩個 ──────────────────────────────────────────
 *
 *   - **相容**：更新基準就好（`--update`），diff 會出現在 PR 裡讓人看
 *   - **破壞性**：必須在基準檔的 codemods 登記，而且要有那支 codemod
 *
 * D12 的規則不是「不准改」，是**讓提出 breaking change 的人自己承擔成本**。
 * 所以合法出口一定要存在而且走得通 —— 否則第一次擋到真的變更時，
 * 被拿掉的會是閘門（C57）。
 */

export interface Baseline {
  /**
   * 基準檔格式版本。
   *
   * v1 的 `surface` 是 `{ 模組: string[] }`，v2 是 `{ 模組: { 名稱: 形狀 } }`。
   * 拿 v1 當 v2 讀，`Object.entries` 會吐出索引鍵（`"0"`、`"1"`…），比對結果
   * 是一堆憑空冒出來的違規，或者反過來一片綠 —— 兩種都是**對一份沒讀懂的
   * 基準檔給出判決**。所以這個欄位不是版本註記，是拒絕執行的依據。
   */
  readonly version: number;
  readonly surface: Record<string, EntrySurface>;
  readonly codemods: readonly CodemodRecord[];
}

export interface CodemodRecord {
  /** codemod 檔名（不含副檔名），對應 tools/codemods/<name>.ts */
  readonly name: string;
  /** 這個 codemod 負責遷移的、已移除的 export，格式 `<module>#<export>` */
  readonly removes: readonly string[];
  /**
   * 這個 codemod 負責遷移的、**形狀改變**的 export，格式同上。
   *
   * ── 沒有這個欄位的話，這道閘門對它自己的催生案例是無解的 ──────────
   *
   * 催生本次重做的變更是「`Feature` 加一個必填的 `personalData`」。
   * 那不是移除任何東西，所以 `removes` 登記不了它。少了 `changes`，
   * 唯一能讓 CI 變綠的辦法是把那個變更收回去 —— 一道對合法變更沒有出口的
   * 閘門，最後被拿掉的是閘門。
   */
  readonly changes?: readonly string[];
  /** 一句話說明為什麼這個 breaking change 是必要的 */
  readonly reason: string;
}

export type Severity = "breaking" | "compatible";

export interface Finding {
  readonly module: string;
  readonly symbol: string;
  /**
   * `removal` 是整個 export 不見了，`shape` 是它還在但形狀變了。
   *
   * 兩者分開，因為登記的欄位也分開：`removes` 只赦免前者，`changes` 只赦免
   * 後者。合成一個集合的話，一筆「我刪了 X」的舊登記會順便讓「X 多了一個
   * 必填欄位」永遠過關 —— 而那是登記者當初沒有看過、也沒有寫 codemod 的變更。
   */
  readonly kind: "removal" | "shape";
  readonly severity: Severity;
  readonly detail: string;
}

/** `<module>#<export>`，登記與比對共用同一個鍵。 */
export function referenceOf(finding: Pick<Finding, "module" | "symbol">): string {
  return `${finding.module}#${finding.symbol}`;
}

interface Member {
  readonly key: string;
  readonly optional: boolean;
  readonly rest: string;
}

const NAMED = /^([A-Za-z_$][\w$]*)(\??): ([\s\S]*)$/;
const BRACKETED = /^(\[[^\]]*\])( readonly)?: ([\s\S]*)$/;
const CALLABLE = /^(new )?\(([\s\S]*)\): ([\s\S]*)$/;

/**
 * 成員字串 → 比對用的鍵。
 *
 * 具名屬性用名字當鍵，才能分辨「改了型別」與「換了一個屬性」。
 * 簽章（`(a: string): void`、`new (…): X`）沒有名字，全部歸在同一個鍵下
 * 整組比 —— 多載變動因此一律算破壞性。那是保守的一邊：多載很少動，
 * 而算錯的方向是多問一次，不是少擋一次。
 */
function parseMember(member: string): Member {
  const named = NAMED.exec(member);
  if (named !== null) {
    return { key: named[1] ?? member, optional: named[2] === "?", rest: named[3] ?? "" };
  }
  const bracketed = BRACKETED.exec(member);
  if (bracketed !== null) {
    return {
      key: bracketed[1] ?? member,
      optional: false,
      rest: `${bracketed[2] ?? ""}${bracketed[3] ?? ""}`,
    };
  }
  const callable = CALLABLE.exec(member);
  if (callable !== null) {
    return { key: callable[1] === "new " ? "new (…)" : "(…)", optional: false, rest: member };
  }
  return { key: member, optional: false, rest: member };
}

function groupMembers(members: readonly string[]): Map<string, Member[]> {
  const grouped = new Map<string, Member[]>();
  for (const member of members) {
    const parsed = parseMember(member);
    const bucket = grouped.get(parsed.key);
    if (bucket === undefined) grouped.set(parsed.key, [parsed]);
    else bucket.push(parsed);
  }
  return grouped;
}

/** 簽章沒有必填／選填之分，只有具名屬性要標出來 —— 那正是最容易看漏的一格。 */
function describe(members: readonly Member[]): string {
  return members
    .map((member) =>
      member.key === "(…)" || member.key === "new (…)"
        ? member.rest
        : `${member.optional ? "選填 " : "必填 "}${member.rest}`,
    )
    .join(" ／ ");
}

function compareMembers(
  module: string,
  symbol: string,
  before: readonly string[],
  after: readonly string[],
): Finding[] {
  const findings: Finding[] = [];
  const oldMembers = groupMembers(before);
  const newMembers = groupMembers(after);

  for (const [key, olds] of oldMembers) {
    const news = newMembers.get(key);
    if (news === undefined) {
      findings.push({
        module,
        symbol,
        kind: "shape",
        severity: "breaking",
        detail: `移除了成員 \`${key}\`（原本 ${describe(olds)}）`,
      });
      continue;
    }
    if (describe(olds) === describe(news)) continue;

    /**
     * ⚠️ **必填 → 選填也是破壞性的**，這條看起來反直覺，寫下理由：
     *
     * 對「產生這個物件的人」而言變寬鬆了沒錯，但對「讀這個屬性的人」
     * 而言，型別從 `T` 變成 `T | undefined` —— 在 strict 之下，
     * 每一處 `feature.permissions.length` 都當場編不過。
     *
     * 這道閘門的判準只有一條：**下游會不會編不過**。會，就是破壞性。
     */
    findings.push({
      module,
      symbol,
      kind: "shape",
      severity: "breaking",
      detail: `成員 \`${key}\` 變了：${describe(olds)} → ${describe(news)}`,
    });
  }

  for (const [key, news] of newMembers) {
    if (oldMembers.has(key)) continue;
    const optional = news.every((member) => member.optional);
    findings.push({
      module,
      symbol,
      kind: "shape",
      severity: optional ? "compatible" : "breaking",
      detail: optional
        ? `新增選填成員 \`${key}\``
        : `新增**必填**成員 \`${key}\`：${describe(news)}`,
    });
  }

  return findings;
}

function compareShape(
  module: string,
  symbol: string,
  before: ExportShape,
  after: ExportShape,
): Finding[] {
  if (before.kind !== after.kind) {
    return [
      {
        module,
        symbol,
        kind: "shape",
        severity: "breaking",
        detail: `種類從 \`${before.kind}\` 變成 \`${after.kind}\``,
      },
    ];
  }

  if (before.members !== undefined && after.members !== undefined) {
    return compareMembers(module, symbol, before.members, after.members);
  }
  // 一邊有成員一邊沒有：同一個 kind 下這代表型別從有結構變成沒有（或反過來）。
  if (before.members !== undefined || after.members !== undefined) {
    return [{ module, symbol, kind: "shape", severity: "breaking", detail: "型別結構整個換掉了" }];
  }

  if (before.type === after.type) return [];
  return [
    {
      module,
      symbol,
      kind: "shape",
      // `value` 是純資料（沒有任何呼叫簽章）。它的字面型別跟著內容跑，
      // 判成破壞性會讓每次改一條設定常數都要寫 codemod —— 理由見 shape.ts
      // 的 carriesSignatures。
      severity: before.kind === "value" ? "compatible" : "breaking",
      detail: `型別變了：\`${before.type}\` → \`${after.type}\``,
    },
  ];
}

export function compareSurface(
  before: Record<string, EntrySurface>,
  after: Record<string, EntrySurface>,
): Finding[] {
  const findings: Finding[] = [];

  for (const [module, oldShapes] of Object.entries(before)) {
    const newShapes = after[module];
    for (const [symbol, oldShape] of Object.entries(oldShapes)) {
      const newShape = newShapes?.[symbol];
      if (newShape === undefined) {
        findings.push({
          module,
          symbol,
          kind: "removal",
          severity: "breaking",
          detail: "export 不見了",
        });
        continue;
      }
      findings.push(...compareShape(module, symbol, oldShape, newShape));
    }
  }

  for (const [module, newShapes] of Object.entries(after)) {
    const oldShapes = before[module];
    for (const symbol of Object.keys(newShapes)) {
      if (oldShapes?.[symbol] !== undefined) continue;
      findings.push({
        module,
        symbol,
        kind: "shape",
        severity: "compatible",
        detail: "新增的 export",
      });
    }
  }

  return findings.sort(
    (a, b) => referenceOf(a).localeCompare(referenceOf(b)) || a.detail.localeCompare(b.detail),
  );
}

/** 已經在 codemods 登記過、因此獲准通過的破壞性變更 —— 移除與形狀變更分開算。 */
export function isRegistered(codemods: readonly CodemodRecord[], finding: Finding): boolean {
  const reference = referenceOf(finding);
  return codemods.some((record) =>
    (finding.kind === "removal" ? record.removes : (record.changes ?? [])).includes(reference),
  );
}
