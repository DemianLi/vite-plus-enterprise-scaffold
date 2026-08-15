import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLockfile, splitDocuments, splitId } from "../src/lockfile.ts";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/**
 * 這組測試釘住的是**解析器有沒有看到整個 lockfile**。
 *
 * 這不是抽象的顧慮：本工具的第一版用 `indexOf("packages:")` 找區段，
 * 於是只讀到第一份 YAML 文件，回報「本專案有 19 個套件」——
 * 少算 96%，而且輸出看起來完全正常。一份少算 96% 的供應鏈清單，
 * 比沒有清單更危險：它會被當成完整的拿去申請例外。
 */

const TWO_DOCUMENTS = `---
lockfileVersion: '9.0'

importers:

  .:
    packageManagerDependencies:
      pnpm:
        specifier: 11.21.0
        version: 11.21.0

packages:

  '@pnpm/macos-arm64@11.21.0':
    resolution: {integrity: sha512-AAAA==}
    cpu: [arm64]
    os: [darwin]

  detect-libc@2.1.2:
    resolution: {integrity: sha512-SHARED==}

snapshots:

  '@pnpm/macos-arm64@11.21.0':
    optional: true
---
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:

  .:
    devDependencies:
      vite-plus:
        specifier: 'catalog:'
        version: 0.2.9

packages:

  '@voidzero-dev/vite-plus-linux-x64-gnu@0.2.9':
    resolution: {integrity: sha512-BBBB==}
    engines: {node: '>=20.0.0'}
    cpu: [x64]
    os: [linux]
    libc: [glibc]

  detect-libc@2.1.2:
    resolution: {integrity: sha512-SHARED==}

  '@types/parse-path@7.1.0':
    resolution: {integrity: sha512-CCCC==}
    deprecated: This is a stub types definition.

snapshots:

  '@voidzero-dev/vite-plus-linux-x64-gnu@0.2.9':
    optional: true
`;

describe("parseLockfile", () => {
  it("讀到兩份文件的 packages: 區，不是只讀第一份", () => {
    const lock = parseLockfile(TWO_DOCUMENTS);
    expect(lock.documents).toBe(2);
    const ids = lock.packages.map((pkg) => pkg.id);
    expect(ids).toContain("@pnpm/macos-arm64@11.21.0");
    expect(ids).toContain("@voidzero-dev/vite-plus-linux-x64-gnu@0.2.9");
  });

  it("同時出現在兩份文件的套件，兩份都記下來", () => {
    const lock = parseLockfile(TWO_DOCUMENTS);
    const shared = lock.packages.find((pkg) => pkg.id === "detect-libc@2.1.2");
    // 只記一個文件序號，平台團隊分批鏡像時就會有一批漏掉它。
    expect(shared?.documents).toEqual([1, 2]);
  });

  it("平台欄位解析成陣列，缺欄位就是 undefined（＝不限）", () => {
    const lock = parseLockfile(TWO_DOCUMENTS);
    const native = lock.packages.find((pkg) => pkg.id.startsWith("@voidzero-dev/"));
    expect(native?.cpu).toEqual(["x64"]);
    expect(native?.os).toEqual(["linux"]);
    expect(native?.libc).toEqual(["glibc"]);

    const plain = lock.packages.find((pkg) => pkg.id === "detect-libc@2.1.2");
    expect(plain?.cpu).toBeUndefined();
    expect(plain?.os).toBeUndefined();
  });

  it("撈得到 integrity 與 deprecated", () => {
    const lock = parseLockfile(TWO_DOCUMENTS);
    expect(lock.packages.find((pkg) => pkg.id === "detect-libc@2.1.2")?.integrity).toBe(
      "sha512-SHARED==",
    );
    expect(lock.packages.find((pkg) => pkg.id === "@types/parse-path@7.1.0")?.deprecated).toContain(
      "stub",
    );
  });

  it("不把 snapshots: 區的內容當成套件", () => {
    const lock = parseLockfile(TWO_DOCUMENTS);
    // snapshots 裡有同名的鍵。若解析器把兩區混在一起，這裡會出現重複或 integrity 為空的條目。
    expect(lock.packages.filter((pkg) => pkg.id === "@pnpm/macos-arm64@11.21.0")).toHaveLength(1);
    expect(lock.packages.every((pkg) => pkg.integrity !== "")).toBe(true);
  });
});

/**
 * 這組測試守的是 C34 的修法：把兩份 YAML 文件拆成兩個獨立、**位元組無損**的
 * lockfile，好餵給只讀第一份的掃描器（Trivy 0.70.0 就是這樣，實測 20 vs 450）。
 *
 * 「無損」是重點。合併成單一文件會需要動 packages: / snapshots: / importers:，
 * 而一個寫錯的合併會安靜地產出一份錯的 SBOM —— 正是整套機制要防的東西。
 */
describe("splitDocuments", () => {
  it("拆出的每一份都是獨立可解析的 lockfile", () => {
    const parts = splitDocuments(TWO_DOCUMENTS);
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(parseLockfile(part).documents).toBe(1);
    }
  });

  it("套件總數守恆（拆開之後不多不少）", () => {
    const whole = parseLockfile(TWO_DOCUMENTS);
    const parts = splitDocuments(TWO_DOCUMENTS).map((p) => parseLockfile(p));
    const sum = parts.reduce((n, p) => n + p.packages.length, 0);
    // 原檔會去重（detect-libc 在兩份文件裡都有），拆開後各自保留 —— 差值就是重複數。
    const ids = new Set(parts.flatMap((p) => p.packages.map((pkg) => pkg.id)));
    expect(ids.size).toBe(whole.packages.length);
    expect(sum).toBeGreaterThanOrEqual(whole.packages.length);
  });

  it("內容位元組無損（只脫掉開頭的文件分隔符）", () => {
    const parts = splitDocuments(TWO_DOCUMENTS);
    for (const part of parts) {
      expect(TWO_DOCUMENTS).toContain(part);
    }
  });

  it("單一文件的 lockfile 原樣回傳一份", () => {
    const single =
      "lockfileVersion: '9.0'\n\npackages:\n\n  a@1.0.0:\n    resolution: {integrity: sha512-A==}\n";
    expect(splitDocuments(single)).toEqual([single]);
  });

  it("對真實的 pnpm-lock.yaml 拆出 19 + 449", () => {
    const parts = splitDocuments(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));
    const counts = parts.map((p) => parseLockfile(p).packages.length);
    // 這兩個數字是 C34 的核心證據：Trivy 只看到前者，看不到後者。
    expect(counts).toEqual([19, 449]);
  });
});

describe("splitId", () => {
  it("處理有 scope 的名字", () => {
    expect(splitId("@voidzero-dev/vite-plus-darwin-arm64@0.2.9")).toEqual({
      name: "@voidzero-dev/vite-plus-darwin-arm64",
      version: "0.2.9",
    });
  });

  it("處理無 scope 的名字", () => {
    expect(splitId("lightningcss-linux-x64-gnu@1.33.0")).toEqual({
      name: "lightningcss-linux-x64-gnu",
      version: "1.33.0",
    });
  });

  it("砍掉 peer 後綴（snapshots: 區的鍵才有，但別讓它漏過來）", () => {
    expect(splitId("vitest@4.1.10(@types/node@24.13.3)").name).toBe("vitest");
    expect(splitId("vitest@4.1.10(@types/node@24.13.3)").version).toBe("4.1.10");
  });
});

describe("對真實的 pnpm-lock.yaml", () => {
  const lock = parseLockfile(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));

  it("是兩份文件", () => {
    expect(lock.documents).toBe(2);
  });

  it("每一筆都有 sha512 integrity", () => {
    // 沒有 integrity 的條目（git 直連、tarball URL）就是「無法用 digest 綁定來源」的那一類。
    // 它們出現時 R4 的整套論證對它們不成立，必須看得見。
    const missing = lock.packages.filter((pkg) => pkg.integrity === "");
    expect(missing.map((pkg) => pkg.id)).toEqual([]);
  });

  it("套件數遠大於單一文件的量（防止只讀到第一份文件的迴歸）", () => {
    expect(lock.packages.length).toBeGreaterThan(400);
  });
});
