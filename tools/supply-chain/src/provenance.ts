import type { LockPackage } from "./lockfile.ts";

/**
 * 來源證明的擷取與離線驗證 —— R4 的答案。
 *
 * ── R4 原本的說法為什麼是錯的問題 ───────────────────────────────────────
 *
 * R4 寫的是「provenance attestation 過 proxy 會遺失，須另存來源證明」。
 * 前半句是對的：內部 registry／proxy 幾乎都只轉發 tarball 與 metadata，
 * `/-/npm/v1/attestations/…` 這條 npm 專屬端點不會被鏡像。
 *
 * 但後半句把問題想得比實際難。**不需要**把 attestation 本身搬進來，
 * 因為 attestation 綁定來源的方式是 digest：
 *
 *   attestation.subject[0].digest.sha512   ← tarball 的 sha512（hex）
 *   pnpm-lock.yaml 的 resolution.integrity ← 同一個 sha512（base64）
 *
 * 這兩個是**同一個數字的兩種編碼**。也就是說：只要 lockfile 裡的 integrity
 * 沒變，proxy 送來的那顆 tarball 就是當初被 Sigstore 簽署的那一顆 ——
 * 不管 proxy 有沒有保留 attestation。
 *
 * ⚠️ **兩個斷言的覆蓋範圍不同，別合併著講**（它們剛好都跟 121 有關，很容易混）：
 *
 *   **121 個** —— lockfile integrity ＝ 擷取當下記下的 integrity。
 *       每次 gate 都跑，抓的是「同一個版本號換了內容物」。涵蓋全部原生套件。
 *   **89 個**  —— 擷取當下記下的 integrity ＝ attestation subject digest。
 *       只在 `--capture` 時比對，而且**只有有 attestation 的那 89 個能比**。
 *       這一條才是「不必搬 attestation」的論證本體，它的覆蓋率是 74%。
 *
 * 另外 32 個（`@typescript/*` 20、`lightningcss-*` 11、`fsevents`）沒有
 * attestation，對它們的補償控制是 npm 發佈簽章 ＋ lockfile 的 digest 釘選。
 * 申請書已照這個分級寫。把 89 說成 121 會在資安抽驗 `@typescript` 時當場破功。
 *
 * 所以處置拆成兩半，跟 `tools/exit-drill` 同一個形狀：
 *
 *   擷取（`--capture`）—— 要連公網。在**還連得到 registry.npmjs.org 的環境**
 *       跑一次，把 {digest, 來源 repo, commit, workflow, builder} 抄進版控。
 *   驗證（預設，跑在 gate）—— 不連網。只比對 lockfile 的 integrity 是否仍等於
 *       擷取當下記錄的值。封閉網路裡跑得動，這是重點：一個需要連公網的閘門，
 *       在這整件事所針對的環境裡等於沒有。
 *
 * ── 擷取時發現的事，會改寫 R2 的申請書 ──────────────────────────────────
 *
 * 121 個原生套件裡只有 **89 個**有 SLSA provenance。另外 32 個
 *（`@typescript/typescript-*` 20 個、`lightningcss-*` 11 個、`fsevents` 1 個）
 * **沒有** attestation，只有 npm registry 的發佈簽章。
 *
 * 原本的 R2 寫「證據：npm 上的 SLSA provenance attestation」—— 對 89 個成立，
 * 對其餘 32 個不成立。拿這句話去申請例外，會在資安覆核時當場破功。
 * 所以擷取結果一律分兩級記錄，申請書照著分兩段寫。
 */

const SLSA_PREDICATE = "https://slsa.dev/provenance/v1";

export const REGISTRY = "https://registry.npmjs.org";

export function attestationUrl(name: string, version: string): string {
  return `${REGISTRY}/-/npm/v1/attestations/${encodeURIComponent(name)}@${version}`;
}

export function packumentUrl(name: string, version: string): string {
  return `${REGISTRY}/${encodeURIComponent(name)}/${version}`;
}

/** `sha512-<base64>` → hex。attestation 的 subject digest 用 hex，lockfile 用 base64。 */
export function integrityToHex(integrity: string): string {
  const prefix = "sha512-";
  if (!integrity.startsWith(prefix)) return "";
  return Buffer.from(integrity.slice(prefix.length), "base64").toString("hex");
}

export type EvidenceLevel = "slsa-provenance" | "registry-signature" | "none";

export interface ProvenanceRecord {
  readonly id: string;
  /** 擷取當下 lockfile 裡的值。離線驗證比對的就是這一欄。 */
  readonly integrity: string;
  readonly evidence: EvidenceLevel;
  /** registry 上宣告的授權。缺欄位時記 `UNKNOWN` —— **不要**從上層套件推斷後填進來。 */
  readonly license: string;
  /** 解壓後的大小 ＝ 開發機／CI 的 `node_modules` 佔用。 */
  readonly unpackedBytes: number;
  /**
   * tarball 本身的大小 ＝ **內部 mirror 實際要存的量**。
   *
   * 這兩個數字差很多（原生二進位壓縮比很高），而它們的用途不同。
   * 拿解壓後的數字去跟平台團隊說「mirror 至少要準備這麼多」，是把一個
   * 偏高的估計標成「下限」—— 跟 R2 原本寫「8 個」是同一類的錯。
   */
  readonly tarballBytes: number;
  /**
   * 套件自己 `package.json` 裡寫的 repository。**這是發佈者的自述**，
   * 與下面 attested 的 `sourceRepo` 不同級：後者由 Sigstore 簽署、可回推 commit，
   * 前者任何人都寫得出來。申請書把兩者分欄列出，就是為了不讓它們被混為一談。
   */
  readonly declaredRepo?: string;
  /** SLSA attestation 裡的來源 repo。有這一欄才算「可回推來源」。 */
  readonly sourceRepo?: string;
  readonly gitCommit?: string;
  readonly workflow?: string;
  readonly builder?: string;
  readonly signatureKeyId?: string;
}

export interface ProvenanceFile {
  readonly capturedAt: string;
  readonly registry: string;
  readonly totals: Record<EvidenceLevel, number>;
  readonly records: readonly ProvenanceRecord[];
}

interface DsseAttestation {
  readonly predicateType?: string;
  readonly bundle?: { readonly dsseEnvelope?: { readonly payload?: string } };
}

export interface DecodedProvenance {
  readonly subjectDigest: string;
  readonly sourceRepo?: string;
  readonly gitCommit?: string;
  readonly workflow?: string;
  readonly builder?: string;
}

/** 從 attestations 回應裡挑出 SLSA predicate 並解出來源資訊。找不到就回 null。 */
export function decodeProvenance(body: unknown): DecodedProvenance | null {
  const list = (body as { attestations?: readonly DsseAttestation[] } | null)?.attestations;
  if (!Array.isArray(list)) return null;
  const slsa = list.find((item) => item.predicateType === SLSA_PREDICATE);
  const payloadB64 = slsa?.bundle?.dsseEnvelope?.payload;
  if (payloadB64 === undefined) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64").toString()) as Record<string, unknown>;
  } catch {
    return null;
  }

  const subject = (payload["subject"] as { digest?: { sha512?: string } }[] | undefined)?.[0];
  const predicate = payload["predicate"] as
    | {
        buildDefinition?: {
          externalParameters?: { workflow?: { repository?: string; path?: string } };
          resolvedDependencies?: { digest?: { gitCommit?: string } }[];
        };
        runDetails?: { builder?: { id?: string } };
      }
    | undefined;

  const workflow = predicate?.buildDefinition?.externalParameters?.workflow;
  const decoded: DecodedProvenance = {
    subjectDigest: subject?.digest?.sha512 ?? "",
    ...(workflow?.repository === undefined ? {} : { sourceRepo: workflow.repository }),
    ...(workflow?.path === undefined ? {} : { workflow: workflow.path }),
    ...(predicate?.buildDefinition?.resolvedDependencies?.[0]?.digest?.gitCommit === undefined
      ? {}
      : { gitCommit: predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit }),
    ...(predicate?.runDetails?.builder?.id === undefined
      ? {}
      : { builder: predicate.runDetails.builder.id }),
  };
  return decoded;
}

export type BindingProblem =
  | { readonly kind: "missing-record"; readonly id: string }
  | { readonly kind: "stale-record"; readonly id: string }
  | {
      readonly kind: "integrity-changed";
      readonly id: string;
      readonly lock: string;
      readonly captured: string;
    };

/**
 * 離線驗證。不連網、不解密、不驗簽章 —— 只做一件事：
 * lockfile 現在的 integrity，是否仍等於擷取當下記下的那個。
 *
 * 只做這一件事是刻意的。簽章驗證需要 Sigstore 的信任根與 transparency log，
 * 兩者都在公網上；把它們搬進閘門，閘門就在封閉網路裡死了 —— 而封閉網路
 * 正是這整套機制存在的理由。信任鏈在**擷取**那一刻建立，之後只需要證明沒被換掉。
 */
export function verifyBinding(
  natives: readonly LockPackage[],
  captured: ProvenanceFile,
): BindingProblem[] {
  const byId = new Map(captured.records.map((record) => [record.id, record]));
  const problems: BindingProblem[] = [];

  for (const pkg of natives) {
    const record = byId.get(pkg.id);
    if (record === undefined) {
      problems.push({ kind: "missing-record", id: pkg.id });
      continue;
    }
    if (record.integrity !== pkg.integrity) {
      problems.push({
        kind: "integrity-changed",
        id: pkg.id,
        lock: pkg.integrity,
        captured: record.integrity,
      });
    }
  }

  const lockIds = new Set(natives.map((pkg) => pkg.id));
  for (const record of captured.records) {
    if (!lockIds.has(record.id)) problems.push({ kind: "stale-record", id: record.id });
  }

  return problems;
}

/**
 * 自動重新擷取是否安全（`--recapture-safe`，供升級 PR 使用）。
 *
 * ── 為什麼不是「有不同步就重擷一次」 ────────────────────────────────
 *
 * 三種不同步裡有兩種是例行的：升一個版本，舊的 id 消失（stale）、
 * 新的 id 出現（missing）。那正是每一個 Renovate PR 都會發生的事。
 *
 * 但 `integrity-changed` **完全不同**：它的意思是「同一個 name@version，
 * tarball 的內容物換了」。正常升版不會這樣 —— 那是重新發佈或被掉包。
 * 對它自動重擷，等於把一件該當成事故處理的事，用一個 bot commit 蓋掉。
 *
 * ⚠️ 而且 `captureOne` 的既有防線在這裡**不夠**：它只在 attestation 的
 * subject digest 與 lockfile 對不上時中止，而 121 個原生二進位裡有 32 個
 * **只有發佈簽章、沒有 SLSA provenance**（見 C27）。那 32 個沒有 subject
 * digest 可比，於是自動重擷會安靜地把新的 digest 記下來當成事實。
 *
 * 所以這道判定必須在**重擷之前**做，而不是靠擷取過程自己擋。
 */
export function isSafeToRecapture(problems: readonly BindingProblem[]): boolean {
  return !problems.some((problem) => problem.kind === "integrity-changed");
}
