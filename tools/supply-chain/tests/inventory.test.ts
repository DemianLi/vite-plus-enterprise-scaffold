import { describe, expect, it } from "vitest";

import { parseLockfile, type LockPackage } from "../src/lockfile.ts";
import {
  TARGETS,
  buildInventory,
  familyOf,
  findCoverageGaps,
  isNative,
  matchesTarget,
} from "../src/inventory.ts";

function pkg(id: string, extra: Partial<LockPackage> = {}): LockPackage {
  const at = id.lastIndexOf("@");
  return {
    id,
    name: id.slice(0, at),
    version: id.slice(at + 1),
    integrity: "sha512-X==",
    documents: [2],
    ...extra,
  };
}

describe("isNative", () => {
  it("cpu、os、libc 三者取聯集", () => {
    expect(isNative(pkg("a@1", { cpu: ["x64"] }))).toBe(true);
    expect(isNative(pkg("b@1", { os: ["darwin"] }))).toBe(true);
    expect(isNative(pkg("c@1", { libc: ["musl"] }))).toBe(true);
    expect(isNative(pkg("d@1"))).toBe(false);
  });

  it("只看 cpu 會漏掉 fsevents —— 這一條就是為了釘住那個漏洞", () => {
    const fsevents = pkg("fsevents@2.3.3", { os: ["darwin"] });
    expect(fsevents.cpu).toBeUndefined();
    expect(isNative(fsevents)).toBe(true);
  });
});

describe("familyOf", () => {
  it("有 scope 的取 scope", () => {
    expect(familyOf(pkg("@oxlint/binding-darwin-arm64@1.77.0"))).toBe("@oxlint");
    expect(familyOf(pkg("@oxlint-tsgolint/darwin-arm64@7.0.2001"))).toBe("@oxlint-tsgolint");
  });

  it("無 scope 的逐段砍到平台代號", () => {
    expect(familyOf(pkg("lightningcss-linux-x64-gnu@1.33.0"))).toBe("lightningcss");
    expect(familyOf(pkg("lightningcss-win32-arm64-msvc@1.33.0"))).toBe("lightningcss");
    expect(familyOf(pkg("lightningcss-linux-arm-gnueabihf@1.33.0"))).toBe("lightningcss");
  });

  it("砍不到平台代號時維持原名，不亂併家族", () => {
    // 併錯家族 = 例外申請的範圍寫錯。寧可多列一個家族，不要少列一個。
    expect(familyOf(pkg("fsevents@2.3.3"))).toBe("fsevents");
    expect(familyOf(pkg("some-random-package@1.0.0"))).toBe("some-random-package");
  });
});

describe("matchesTarget", () => {
  const linux = TARGETS.find((t) => t.label === "linux-x64-gnu");
  const darwin = TARGETS.find((t) => t.label === "darwin-arm64");

  it("欄位沒宣告就是不限（pnpm 自己的語意）", () => {
    expect(matchesTarget(pkg("any@1"), linux!)).toBe(true);
  });

  it("libc 要對得上", () => {
    const gnu = pkg("x@1", { os: ["linux"], cpu: ["x64"], libc: ["glibc"] });
    const musl = pkg("y@1", { os: ["linux"], cpu: ["x64"], libc: ["musl"] });
    expect(matchesTarget(gnu, linux!)).toBe(true);
    expect(matchesTarget(musl, linux!)).toBe(false);
  });

  it("宣告 libc 的套件不會被算進沒有 libc 的目標平台", () => {
    const gnu = pkg("x@1", { os: ["linux"], cpu: ["x64"], libc: ["glibc"] });
    expect(matchesTarget(gnu, darwin!)).toBe(false);
  });

  it("fsevents 只符合 darwin —— 這不是缺口，是它本來就只有 darwin", () => {
    const fsevents = pkg("fsevents@2.3.3", { os: ["darwin"] });
    expect(matchesTarget(fsevents, darwin!)).toBe(true);
    expect(matchesTarget(fsevents, linux!)).toBe(false);
  });
});

const FIXTURE = `---
lockfileVersion: '9.0'

packages:

  '@acme/tool-darwin-arm64@1.0.0':
    resolution: {integrity: sha512-A==}
    cpu: [arm64]
    os: [darwin]

  '@acme/tool-darwin-x64@1.0.0':
    resolution: {integrity: sha512-B==}
    cpu: [x64]
    os: [darwin]

  '@acme/tool-linux-x64-gnu@1.0.0':
    resolution: {integrity: sha512-C==}
    cpu: [x64]
    os: [linux]
    libc: [glibc]

  '@acme/tool-win32-x64@1.0.0':
    resolution: {integrity: sha512-D==}
    cpu: [x64]
    os: [win32]

  ordinary-package@2.0.0:
    resolution: {integrity: sha512-E==}
`;

const OPTIONS = {
  tiers: { "@acme": "toolchain" as const },
  digest: (input: string) => `len:${input.length}`,
};

describe("buildInventory", () => {
  const lock = parseLockfile(FIXTURE);
  const inventory = buildInventory(lock, OPTIONS);

  it("分開數總量與原生量", () => {
    expect(inventory.totals.packages).toBe(5);
    expect(inventory.totals.native).toBe(4);
    expect(inventory.totals.families).toBe(1);
  });

  it("非原生套件不逐筆入基線，但有摘要證明來自同一份 lockfile", () => {
    expect(inventory.natives.map((n) => n.id)).not.toContain("ordinary-package@2.0.0");
    expect(inventory.nonNativeDigest).not.toBe("");
  });

  it("未列在 tiers 的家族預設落在 toolchain，好讓閘門有東西可以擋", () => {
    const withoutTiers = buildInventory(lock, { ...OPTIONS, tiers: {} });
    expect(withoutTiers.families[0]?.tier).toBe("toolchain");
  });
});

describe("findCoverageGaps —— R3 的實際失敗模式", () => {
  const lock = parseLockfile(FIXTURE);

  it("四個目標平台都有變體時沒有缺口", () => {
    expect(findCoverageGaps(lock, buildInventory(lock, OPTIONS))).toEqual([]);
  });

  it("少掉 linux-x64-gnu 就是缺口 —— 這正是「mac 裝得起來、CI 爆掉」", () => {
    const broken = FIXTURE.replace(
      `  '@acme/tool-linux-x64-gnu@1.0.0':
    resolution: {integrity: sha512-C==}
    cpu: [x64]
    os: [linux]
    libc: [glibc]
`,
      "",
    );
    const brokenLock = parseLockfile(broken);
    const gaps = findCoverageGaps(brokenLock, buildInventory(brokenLock, OPTIONS));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.target).toBe("linux-x64-gnu");
    expect(gaps[0]?.family).toBe("@acme");
  });

  it("optional 家族缺平台不算缺口", () => {
    const brokenLock = parseLockfile(
      FIXTURE.replace("cpu: [x64]\n    os: [linux]\n    libc: [glibc]", "os: [linux]"),
    );
    const optional = buildInventory(brokenLock, { ...OPTIONS, tiers: { "@acme": "optional" } });
    expect(findCoverageGaps(brokenLock, optional)).toEqual([]);
  });
});
