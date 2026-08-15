import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLockfile, type LockPackage } from "../src/lockfile.ts";
import { isNative } from "../src/inventory.ts";
import {
  decodeProvenance,
  integrityToHex,
  isSafeToRecapture,
  verifyBinding,
  type BindingProblem,
  type ProvenanceFile,
} from "../src/provenance.ts";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/**
 * R4 的整套論證只靠一個等式撐著：
 *
 *   lockfile 的 integrity（base64） ≡ attestation subject 的 digest（hex）
 *
 * 如果這個等式不成立，「digest 沒變 ⇒ tarball 就是被簽署的那一顆」也就不成立，
 * 而那正是「不必把 attestation 搬過 proxy」的唯一理由。所以這裡驗的不是
 * 函式跑不跑得動，是那個等式。
 */
describe("integrityToHex", () => {
  it("base64 與 hex 是同一個 sha512 的兩種編碼", () => {
    const digest = Buffer.from("0123456789abcdef".repeat(8), "hex");
    const integrity = `sha512-${digest.toString("base64")}`;
    expect(integrityToHex(integrity)).toBe(digest.toString("hex"));
  });

  it("認得實際的 vite-plus 值", () => {
    const integrity =
      "sha512-2Iy8x4PCPMNzXeu3pREevlggoeK8PwtdUiCpoSybAZBtR/aqMxsJREyt/eKv45F8lsiNlA8PbIWEvPxLSgzFLQ==";
    // 這串 hex 抄自 registry 上該版本 attestation 的 subject[0].digest.sha512。
    expect(integrityToHex(integrity)).toBe(
      "d88cbcc783c23cc3735debb7a5111ebe5820a1e2bc3f0b5d5220a9a12c9b01906d47f6aa331b09444cadfde2afe3917c96c88d940f0f6c8584bcfc4b4a0cc52d",
    );
  });

  it("不是 sha512 就回空字串，不硬解", () => {
    expect(integrityToHex("sha1-abc")).toBe("");
    expect(integrityToHex("")).toBe("");
  });
});

function dsse(payload: unknown): unknown {
  return {
    attestations: [
      {
        predicateType: "https://slsa.dev/provenance/v1",
        bundle: {
          dsseEnvelope: { payload: Buffer.from(JSON.stringify(payload)).toString("base64") },
        },
      },
    ],
  };
}

describe("decodeProvenance", () => {
  const payload = {
    subject: [{ name: "pkg:npm/x@1.0.0", digest: { sha512: "deadbeef" } }],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: "https://github.com/acme/tool",
            path: ".github/workflows/release.yml",
          },
        },
        resolvedDependencies: [{ digest: { gitCommit: "abc123" } }],
      },
      runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" } },
    },
  };

  it("解出 digest、來源 repo 與 commit", () => {
    const decoded = decodeProvenance(dsse(payload));
    expect(decoded?.subjectDigest).toBe("deadbeef");
    expect(decoded?.sourceRepo).toBe("https://github.com/acme/tool");
    expect(decoded?.gitCommit).toBe("abc123");
    expect(decoded?.workflow).toBe(".github/workflows/release.yml");
  });

  it("沒有 SLSA predicate 就回 null（不能把發佈簽章誤當成來源證明）", () => {
    // npm 對每個套件都會附一份 publish attestation。若把它也算成 provenance，
    // 「89 個有來源證明」會變成「121 個」—— 申請書就成了假的。
    const publishOnly = {
      attestations: [
        {
          predicateType: "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
          bundle: { dsseEnvelope: { payload: Buffer.from("{}").toString("base64") } },
        },
      ],
    };
    expect(decodeProvenance(publishOnly)).toBeNull();
  });

  it("格式壞掉時回 null，不丟例外", () => {
    expect(decodeProvenance(null)).toBeNull();
    expect(decodeProvenance({})).toBeNull();
    expect(decodeProvenance({ attestations: "nope" })).toBeNull();
    expect(
      decodeProvenance({
        attestations: [
          {
            predicateType: "https://slsa.dev/provenance/v1",
            bundle: { dsseEnvelope: { payload: "not-base64-json" } },
          },
        ],
      }),
    ).toBeNull();
  });
});

function lockPkg(id: string, integrity: string): LockPackage {
  const at = id.lastIndexOf("@");
  return {
    id,
    name: id.slice(0, at),
    version: id.slice(at + 1),
    integrity,
    documents: [2],
    cpu: ["x64"],
  };
}

describe("verifyBinding", () => {
  const captured: ProvenanceFile = {
    capturedAt: "2026-08-15",
    registry: "https://registry.npmjs.org",
    totals: { "slsa-provenance": 1, "registry-signature": 0, none: 0 },
    records: [
      {
        id: "@acme/tool-linux-x64@1.0.0",
        integrity: "sha512-A==",
        evidence: "slsa-provenance",
        license: "MIT",
        unpackedBytes: 1,
        tarballBytes: 1,
      },
    ],
  };

  it("digest 一致時沒有問題", () => {
    expect(verifyBinding([lockPkg("@acme/tool-linux-x64@1.0.0", "sha512-A==")], captured)).toEqual(
      [],
    );
  });

  it("同一個版本換了內容物 —— 這是最該紅的一條", () => {
    const problems = verifyBinding(
      [lockPkg("@acme/tool-linux-x64@1.0.0", "sha512-TAMPERED==")],
      captured,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe("integrity-changed");
  });

  it("lockfile 多出沒擷取過的原生套件", () => {
    const problems = verifyBinding(
      [
        lockPkg("@acme/tool-linux-x64@1.0.0", "sha512-A=="),
        lockPkg("@acme/tool-win32-x64@1.0.0", "sha512-B=="),
      ],
      captured,
    );
    expect(problems.map((p) => p.kind)).toEqual(["missing-record"]);
  });

  it("擷取檔多出 lockfile 已經沒有的套件", () => {
    expect(verifyBinding([], captured).map((p) => p.kind)).toEqual(["stale-record"]);
  });
});

/**
 * `isSafeToRecapture` 決定的是升級 PR 上「bot 能不能自己重擷」。
 *
 * 判錯的方向只有一個是危險的：**把事故當成升級**。所以每一條會回 true 的
 * 案例都要有一個對應的 false 案例把它圍起來 —— 尤其是混合的情況，
 * 那才是真實會發生的樣子（一次升級同時帶來 missing／stale，
 * 而其中夾了一個被掉包的）。
 */
describe("isSafeToRecapture", () => {
  const missing: BindingProblem = { kind: "missing-record", id: "a@1" };
  const stale: BindingProblem = { kind: "stale-record", id: "b@1" };
  const tampered: BindingProblem = {
    kind: "integrity-changed",
    id: "c@1",
    lock: "sha512-X==",
    captured: "sha512-Y==",
  };

  it("沒有任何問題 → 安全", () => {
    expect(isSafeToRecapture([])).toBe(true);
  });

  it("只有版本換了（missing ＋ stale）→ 安全，那就是每個升級 PR 的樣子", () => {
    expect(isSafeToRecapture([missing, stale])).toBe(true);
  });

  it("內容物被換掉 → 不安全", () => {
    expect(isSafeToRecapture([tampered])).toBe(false);
  });

  it("★ 混在一堆正常升級裡的一個掉包 → 仍然不安全", () => {
    // 這是最可能被寫錯的一條：用「多數是升級」或「第一筆是什麼」來判定，
    // 都會在這裡放行 —— 而這正是掉包會長的樣子。
    expect(isSafeToRecapture([missing, stale, tampered, missing])).toBe(false);
  });

  it("★ 順序不影響判定", () => {
    expect(isSafeToRecapture([tampered, missing])).toBe(false);
    expect(isSafeToRecapture([missing, tampered])).toBe(false);
  });
});

describe("對實際擷取到的 provenance.json", () => {
  const lock = parseLockfile(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));
  const captured = JSON.parse(
    readFileSync(join(ROOT, "tools/supply-chain/provenance.json"), "utf8"),
  ) as ProvenanceFile;

  it("每一個原生套件都有紀錄，且 digest 與 lockfile 一致", () => {
    expect(verifyBinding(lock.packages.filter(isNative), captured)).toEqual([]);
  });

  it("有 SLSA provenance 的那些，來源 repo 與 commit 都在", () => {
    const attested = captured.records.filter((r) => r.evidence === "slsa-provenance");
    expect(attested.length).toBeGreaterThan(0);
    for (const record of attested) {
      expect(record.sourceRepo, record.id).toBeTruthy();
      expect(record.gitCommit, record.id).toBeTruthy();
    }
  });

  it("每一筆都有非零的大小 —— 給平台團隊的容量估計不能是 0", () => {
    // 第一版用 HEAD 取 content-length，但 npm 的 tarball 走 Cloudflare，
    // 而它**只在 GET 回應帶 content-length**。結果 121 筆全記成 0，
    // 申請書印出「mirror 要準備 0.0 MB」—— 一個看起來很權威的錯數字。
    // 擷取端已改成 range 請求並在取不到時中止；這一條是它的迴歸測試。
    const zeroTarball = captured.records.filter((r) => r.tarballBytes <= 0);
    expect(zeroTarball.map((r) => r.id)).toEqual([]);
    const zeroUnpacked = captured.records.filter((r) => r.unpackedBytes <= 0);
    expect(zeroUnpacked.map((r) => r.id)).toEqual([]);
  });

  it("tarball 一定比解壓後小 —— 兩欄若被寫反，容量估計就整個顛倒", () => {
    const total = (pick: (r: ProvenanceFile["records"][number]) => number): number =>
      captured.records.reduce((sum, r) => sum + pick(r), 0);
    expect(total((r) => r.tarballBytes)).toBeLessThan(total((r) => r.unpackedBytes));
  });

  it("沒有 provenance 的那些，至少留下發佈簽章的 keyid", () => {
    // 「這 32 個什麼都沒有」與「這 32 個有簽章但無法回推建置來源」是兩件事，
    // 對資安的意義差很多。分級之後就不能再含糊。
    for (const record of captured.records.filter((r) => r.evidence === "registry-signature")) {
      expect(record.signatureKeyId, record.id).toBeTruthy();
      expect(record.sourceRepo, record.id).toBeUndefined();
    }
  });
});
