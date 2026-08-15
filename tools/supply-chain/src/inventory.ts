import { compareStrings, type LockPackage, type ParsedLockfile } from "./lockfile.ts";

/**
 * 原生二進位盤點 —— R2／R3／R5／R8 共用的事實來源。
 *
 * ── 為什麼這份清單必須是「算出來的」而不是「寫下來的」──────────────────
 *
 * 風險登記簿原本寫「8 個平台原生二進位」。實際數字是 **121**，分屬 **11 個家族**。
 * 差了 15 倍，而且錯的方向最糟：拿一份少算 15 倍的清單去申請 SCA 例外，
 * 例外會照著那份清單核准，然後 CI 在沒被核准的那 113 個上面掛掉。
 *
 * 「8」不是筆誤，是**人抄下來的數字沒有人再推導一次**。這個 repo 已經在
 * C17／C24／C25 上碰過三次同一件事。修法一直是同一個：讓數字由 lockfile 推導，
 * 基線進版控，變動就擋下來。
 *
 * ── native 的判定 ───────────────────────────────────────────────────────
 *
 * `cpu` **或** `os` **或** `libc` —— 三者取聯集，不是只看 `cpu`。
 * 只看 `cpu` 會漏掉 `fsevents`（只宣告 `os: [darwin]`）。這一筆不是湊數：
 * 它示範了「平台限定」與「有 CPU 架構」是兩件事，而 SCA 的例外範圍要的是前者。
 */

/** 平台限定的判定條件。缺欄位一律視為「不限」—— 這是 pnpm 自己的語意。 */
export function isNative(pkg: LockPackage): boolean {
  return pkg.cpu !== undefined || pkg.os !== undefined || pkg.libc !== undefined;
}

const PLATFORM_SUFFIX =
  /-(darwin|linux|linuxstatic|win32|win|macos|android|freebsd|openharmony|netbsd|openbsd|sunos|aix)$/;

/**
 * 家族名。有 scope 的取 scope（`@oxlint/binding-darwin-arm64` → `@oxlint`），
 * 無 scope 的砍掉平台後綴（`lightningcss-darwin-arm64` → `lightningcss`）。
 *
 * 家族是**申請例外的單位**：資安不會逐一核准 121 個套件，會核准
 * 「oxc 專案發佈的原生 linter 二進位」這種東西。
 */
export function familyOf(pkg: LockPackage): string {
  if (pkg.name.startsWith("@")) return pkg.name.split("/")[0] as string;
  // 逐段砍：lightningcss-linux-x64-gnu → …-linux-x64 → …-linux → 命中 → lightningcss
  let base = pkg.name;
  for (let i = 0; i < 4; i++) {
    const next = base.replace(PLATFORM_SUFFIX, "");
    if (next !== base) return next;
    const dash = base.lastIndexOf("-");
    if (dash <= 0) break;
    base = base.slice(0, dash);
  }
  // 砍到底都沒命中平台代號 —— 那就不是平台變體，維持原名。
  // 若在這裡回傳砍過的 base，`foo-bar` 與 `foo-baz` 會被併成同一個家族，
  // 而家族是申請例外的單位：併錯了，例外的範圍就寫錯了。
  return pkg.name;
}

/**
 * 目標平台。這份清單就是「mirror 必須供應到什麼程度」的定義。
 *
 * ⚠️ 加一列 = 對 mirror 提出新要求，也是對每個工具鏈家族提出新的覆蓋要求。
 * 改這裡之前先確認平台團隊知道。
 *
 * 前兩列有依據：CI 跑在 `ubuntu-latest`（見三份 workflow 的 `runs-on`），
 * 開發機至少有 Apple Silicon（本 repo 就是在上面建起來的）。
 * **後兩列是假設**：沒有任何既有紀錄說團隊用 Intel Mac 或 Windows。
 * 留著它們的代價是 mirror 多存兩份變體；拿掉的代價是那兩種機器上的人裝不起來，
 * 而且要到他們報修才知道。先留著，並在 `--airgap` 的輸出裡標明待確認 ——
 * 由平台團隊回答，不是由這份清單假裝知道。
 */
export interface Target {
  readonly label: string;
  readonly os: string;
  readonly cpu: string;
  readonly libc?: string;
  readonly why: string;
}

export const TARGETS: readonly Target[] = [
  {
    label: "linux-x64-gnu",
    os: "linux",
    cpu: "x64",
    libc: "glibc",
    why: "CI（ubuntu-latest，三份 workflow 皆是）",
  },
  { label: "darwin-arm64", os: "darwin", cpu: "arm64", why: "開發機（Apple Silicon）" },
  {
    label: "darwin-x64",
    os: "darwin",
    cpu: "x64",
    why: "開發機（Intel Mac）— **假設，待平台團隊確認**",
  },
  {
    label: "win32-x64",
    os: "win32",
    cpu: "x64",
    why: "開發機（Windows）— **假設，待平台團隊確認**",
  },
];

/** pnpm 的 optional dependency 過濾語意：欄位沒宣告就是不限。 */
export function matchesTarget(pkg: LockPackage, target: Target): boolean {
  if (pkg.os !== undefined && !pkg.os.includes(target.os)) return false;
  if (pkg.cpu !== undefined && !pkg.cpu.includes(target.cpu)) return false;
  if (pkg.libc !== undefined && target.libc !== undefined && !pkg.libc.includes(target.libc))
    return false;
  if (pkg.libc !== undefined && target.libc === undefined) return false;
  return true;
}

/**
 * 家族分級。決定閘門對它的要求，也決定它在 SCA 例外申請書裡怎麼歸類。
 *
 *   toolchain       —— 少一個平台，那個平台的建置就直接失敗。**必須**涵蓋全部 TARGETS。
 *   optional        —— 缺了只是少一點效能／便利（例如 fsevents 的檔案監看）。不強制涵蓋。
 *   package-manager —— 住在 lockfile 的**第一份文件**裡，也就是 pnpm 自己。這是 R5。
 */
export type FamilyTier = "toolchain" | "optional" | "package-manager";

export interface FamilyRecord {
  readonly family: string;
  readonly tier: FamilyTier;
  readonly count: number;
  readonly documents: readonly number[];
  readonly members: readonly string[];
}

export interface NativeRecord {
  readonly id: string;
  readonly integrity: string;
  readonly family: string;
  readonly platform: string;
  readonly documents: readonly number[];
}

export interface Inventory {
  readonly lockfileDocuments: number;
  readonly totals: {
    readonly packages: number;
    readonly native: number;
    readonly families: number;
    readonly withoutIntegrity: number;
  };
  readonly families: readonly FamilyRecord[];
  readonly natives: readonly NativeRecord[];
  readonly deprecated: readonly { readonly id: string; readonly reason: string }[];
  /** 非原生套件不逐筆進基線（lockfile 的 diff 已經看得到），但要證明是同一份 lockfile 算出來的。 */
  readonly nonNativeDigest: string;
}

function platformLabel(pkg: LockPackage): string {
  const parts = [pkg.os?.join("|") ?? "any", pkg.cpu?.join("|") ?? "any"];
  if (pkg.libc !== undefined) parts.push(pkg.libc.join("|"));
  return parts.join("/");
}

export interface BuildOptions {
  /** 家族 → 分級。未列出的家族會被標成 `toolchain` 並在閘門上被當成未分類擋下。 */
  readonly tiers: Readonly<Record<string, FamilyTier>>;
  readonly digest: (input: string) => string;
}

export function buildInventory(lock: ParsedLockfile, options: BuildOptions): Inventory {
  const natives: NativeRecord[] = [];
  const families = new Map<
    string,
    { tier: FamilyTier; documents: Set<number>; members: string[] }
  >();
  const nonNative: string[] = [];
  const deprecated: { id: string; reason: string }[] = [];
  let withoutIntegrity = 0;

  for (const pkg of lock.packages) {
    if (pkg.integrity === "") withoutIntegrity += 1;
    if (pkg.deprecated !== undefined) deprecated.push({ id: pkg.id, reason: pkg.deprecated });

    if (!isNative(pkg)) {
      nonNative.push(`${pkg.id} ${pkg.integrity}`);
      continue;
    }

    const family = familyOf(pkg);
    natives.push({
      id: pkg.id,
      integrity: pkg.integrity,
      family,
      platform: platformLabel(pkg),
      documents: pkg.documents,
    });

    const existing = families.get(family);
    if (existing) {
      existing.members.push(pkg.id);
      for (const doc of pkg.documents) existing.documents.add(doc);
    } else {
      families.set(family, {
        tier: options.tiers[family] ?? "toolchain",
        documents: new Set(pkg.documents),
        members: [pkg.id],
      });
    }
  }

  natives.sort((a, b) => compareStrings(a.id, b.id));
  nonNative.sort(compareStrings);

  const familyRecords: FamilyRecord[] = [...families]
    .map(([family, value]) => ({
      family,
      tier: value.tier,
      count: value.members.length,
      documents: [...value.documents].sort((a, b) => a - b),
      members: [...value.members].sort(compareStrings),
    }))
    .sort((a, b) => compareStrings(a.family, b.family));

  return {
    lockfileDocuments: lock.documents,
    totals: {
      packages: lock.packages.length,
      native: natives.length,
      families: familyRecords.length,
      withoutIntegrity,
    },
    families: familyRecords,
    natives,
    deprecated: deprecated.sort((a, b) => compareStrings(a.id, b.id)),
    nonNativeDigest: options.digest(nonNative.join("\n")),
  };
}

export interface CoverageGap {
  readonly family: string;
  readonly target: string;
  readonly why: string;
}

/**
 * R3 的實際失敗模式：mac 上裝得起來、CI 的 linux-x64-gnu 直接爆。
 *
 * 那不是「mirror 漏了某個套件」，而是**在 mac 上觀察到的安裝結果本來就不含
 * linux 的變體** —— pnpm 只會裝上符合當下平台的 optional dependency。
 * 照著 `node_modules` 或 lockfile 的 `snapshots:` 區去列 mirror 清單，
 * 必然漏掉其他平台。所以這裡一律看 `packages:` 區（全平台的中繼資料都在那）。
 */
export function findCoverageGaps(lock: ParsedLockfile, inventory: Inventory): CoverageGap[] {
  const byFamily = new Map<string, LockPackage[]>();
  for (const pkg of lock.packages) {
    if (!isNative(pkg)) continue;
    const family = familyOf(pkg);
    const list = byFamily.get(family) ?? [];
    list.push(pkg);
    byFamily.set(family, list);
  }

  const gaps: CoverageGap[] = [];
  for (const record of inventory.families) {
    if (record.tier !== "toolchain") continue;
    const members = byFamily.get(record.family) ?? [];
    for (const target of TARGETS) {
      if (members.some((pkg) => matchesTarget(pkg, target))) continue;
      gaps.push({ family: record.family, target: target.label, why: target.why });
    }
  }
  return gaps;
}
