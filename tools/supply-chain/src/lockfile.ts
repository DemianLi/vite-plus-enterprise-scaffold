/**
 * `pnpm-lock.yaml` 的最小解析器 —— 只取供應鏈盤點需要的欄位。
 *
 * ── 為什麼不用 YAML 函式庫 ──────────────────────────────────────────────
 *
 * 因為這支工具存在的目的，就是**列出這個 repo 到底拉了什麼進來**。
 * 為了盤點供應鏈而先新增一個第三方相依，是自己打自己的臉。
 * 需要的欄位只有五個（resolution.integrity / cpu / os / libc / deprecated），
 * 而且格式由 pnpm 的序列化器產生、極度規律，值得手寫。
 *
 * ── 唯一真正的陷阱：這個檔案是**兩份 YAML 文件** ────────────────────────
 *
 * `pnpm-lock.yaml` 用 `---` 分隔成兩份文件，各自有完整的
 * `importers:` / `packages:` / `snapshots:`：
 *
 *   文件 1 —— **套件管理器自身**的鎖（`packageManagerDependencies`）。
 *             `pnpm` 與 `@pnpm/exe` 及其平台二進位、`@reflink/*` 住在這裡。
 *             這一份就是 R5 的實體證據。
 *   文件 2 —— 專案的鎖。其餘一切住在這裡。
 *
 * 天真的 `lines.indexOf("packages:")` 會讀到**文件 1**，然後回報
 * 「本專案有 19 個套件」而不是 468 個 —— 少了 96%，而且看起來完全正常。
 * 寫這支工具的第一版就是這樣錯的（見 DECISIONS.md 的 C26）。
 * 所以這裡一律掃出**所有**同名區段再合併，`parseLockfile` 也把文件序號留在
 * 每一筆資料上：mirror 清單需要知道哪些是套件管理器自己的。
 */

/** 區段標題：頂格、後面直接接冒號。`importers:` / `packages:` / `snapshots:` / `catalogs:` … */
const SECTION_HEAD = /^([a-zA-Z][a-zA-Z0-9]*):/;

/** 條目鍵：兩格縮排、整行以冒號結尾（帶值的行不算，那是欄位不是條目）。 */
const ENTRY_KEY = /^ {2}(?:'([^']+)'|([^\s:][^:]*)):$/;

/** 欄位：四格縮排。 */
const ENTRY_FIELD = /^ {4}([a-zA-Z]+):[ ]?(.*)$/;

const INTEGRITY = /integrity: (sha512-[^},\s]+)/;

/** `[x64, arm64]` → `["x64", "arm64"]`。刻意用 split 而非正則，理由同 `@org/bff-contract`。 */
function parseList(raw: string): readonly string[] {
  return raw
    .replace("[", "")
    .replace("]", "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export interface LockPackage {
  /** lockfile 裡的鍵，例如 `@voidzero-dev/vite-plus-linux-x64-gnu@0.2.9`。 */
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** `sha512-…`。這是整套供應鏈論證的錨點，見 `provenance.ts`。 */
  readonly integrity: string;
  readonly cpu?: readonly string[];
  readonly os?: readonly string[];
  readonly libc?: readonly string[];
  readonly deprecated?: string;
  /**
   * 這個套件出現在哪幾份文件裡。1 ＝ 套件管理器自身的鎖（R5）、2 ＝ 專案的鎖。
   *
   * 是陣列而不是單一數字，因為**真的會同時出現在兩份**：`detect-libc@2.1.2`
   * 就是這樣（pnpm 自己要用，vite-plus 的相依也要用）。若只記一個數字，
   * 它會被標成「套件管理器的相依」，而平台團隊照那個標記去分批鏡像時，
   * 專案那一批就會少掉它。
   */
  readonly documents: readonly number[];
}

export interface ParsedLockfile {
  readonly lockfileVersions: readonly string[];
  readonly documents: number;
  readonly packages: readonly LockPackage[];
}

interface RawEntry {
  readonly fields: Map<string, string>;
  readonly documents: Set<number>;
}

/** YAML 文件分隔符。pnpm 用它把兩份 lockfile 併在同一個檔案裡。 */
const DOCUMENT_SEPARATOR = "\n---\n";

/**
 * 把 lockfile 拆成一份一份的獨立 YAML 文件（**位元組層級切割，不做任何轉換**）。
 *
 * 用途是餵給只讀第一份文件的掃描器。實測（見 C34）：Trivy 0.70.0 對這個檔案
 * 回報 20 個 component（＝第一份文件的內容），只留第二份文件時回報 **450 個**。
 * 把兩份分別放進不同目錄再一起掃，兩份都看得到。
 *
 * **刻意不合併成單一文件**：合併要動 `packages:` / `snapshots:` / `importers:`
 * 三個區段，而一個寫錯的合併會安靜地產出一份錯的 SBOM —— 那正是這整套機制
 * 要防的東西。切割是無損的，合併不是。
 */
export function splitDocuments(text: string): readonly string[] {
  return text
    .split(DOCUMENT_SEPARATOR)
    .map((part) => part.replace(/^---\n/, ""))
    .filter((part) => part.trim().length > 0);
}

/**
 * 字串排序 —— **刻意不用 `localeCompare`**。
 *
 * `inventory.json` 的陣列順序會進版控，`nonNativeDigest` 更是直接算在排好序的
 * 字串上。`localeCompare` 不帶 locale 參數時吃執行環境的預設語系與 ICU 版本，
 * 於是同一份 lockfile 在開發機與 CI 上可能算出不同的順序、不同的摘要 ——
 * 閘門會報「基線漂移」，而實際上什麼都沒變。這種紅燈最傷：它教人忽略這道閘門。
 *
 * 這裡用 UTF-16 碼元順序，跟平台與語系都無關。
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 把 id 拆成 name / version。`packages:` 區的鍵不帶 peer 後綴，但仍防禦性地砍掉 `(`。 */
export function splitId(id: string): { name: string; version: string } {
  const withoutPeers = id.split("(")[0] ?? id;
  const at = withoutPeers.lastIndexOf("@");
  if (at <= 0) return { name: withoutPeers, version: "" };
  return { name: withoutPeers.slice(0, at), version: withoutPeers.slice(at + 1) };
}

export function parseLockfile(text: string): ParsedLockfile {
  const lines = text.split("\n");

  // 先掃出所有頂層標題，順便數出這個檔案有幾份 YAML 文件。
  const heads: { key: string; line: number }[] = [];
  const lockfileVersions: string[] = [];
  lines.forEach((line, index) => {
    const match = SECTION_HEAD.exec(line);
    if (!match) return;
    heads.push({ key: match[1] as string, line: index });
    if (match[1] === "lockfileVersion") lockfileVersions.push(line.split(":")[1]?.trim() ?? "");
  });

  const raw = new Map<string, RawEntry>();
  let document = 0;

  for (let i = 0; i < heads.length; i++) {
    const head = heads[i] as { key: string; line: number };
    // 每遇到一次 lockfileVersion 就是進入下一份文件。
    if (head.key === "lockfileVersion") document += 1;
    if (head.key !== "packages") continue;

    const end = heads[i + 1]?.line ?? lines.length;
    let key: string | null = null;

    for (let j = head.line + 1; j < end; j++) {
      const line = lines[j] as string;
      const entry = ENTRY_KEY.exec(line);
      if (entry) {
        key = entry[1] ?? entry[2] ?? null;
        if (key === null) continue;
        const existing = raw.get(key);
        if (existing) existing.documents.add(document);
        else raw.set(key, { fields: new Map(), documents: new Set([document]) });
        continue;
      }
      const field = ENTRY_FIELD.exec(line);
      if (field && key !== null) raw.get(key)?.fields.set(field[1] as string, field[2] ?? "");
    }
  }

  const packages: LockPackage[] = [];
  for (const [id, entry] of raw) {
    const resolution = entry.fields.get("resolution") ?? "";
    const integrity = INTEGRITY.exec(resolution)?.[1];
    // 沒有 sha512 的條目（例如 git/tarball 直連）不該悄悄消失 —— 它們正是
    // 「無法用 digest 綁定來源」的那一類，必須讓上層看得到並自行處置。
    const { name, version } = splitId(id);
    const cpu = entry.fields.get("cpu");
    const os = entry.fields.get("os");
    const libc = entry.fields.get("libc");
    const deprecated = entry.fields.get("deprecated");

    packages.push({
      id,
      name,
      version,
      integrity: integrity ?? "",
      ...(cpu === undefined ? {} : { cpu: parseList(cpu) }),
      ...(os === undefined ? {} : { os: parseList(os) }),
      ...(libc === undefined ? {} : { libc: parseList(libc) }),
      ...(deprecated === undefined ? {} : { deprecated }),
      documents: [...entry.documents].sort((a, b) => a - b),
    });
  }

  packages.sort((a, b) => compareStrings(a.id, b.id));

  return {
    lockfileVersions,
    documents: lockfileVersions.length,
    packages,
  };
}
