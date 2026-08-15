#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareStrings, parseLockfile, splitDocuments, type LockPackage } from "./lockfile.ts";
import {
  TARGETS,
  buildInventory,
  findCoverageGaps,
  isNative,
  matchesTarget,
  type FamilyTier,
  type Inventory,
} from "./inventory.ts";
import {
  attestationUrl,
  decodeProvenance,
  integrityToHex,
  packumentUrl,
  verifyBinding,
  type EvidenceLevel,
  type ProvenanceFile,
  type ProvenanceRecord,
} from "./provenance.ts";

/**
 * 供應鏈盤點 —— R2／R3／R4／R5／R8 的技術處置。
 *
 * 這五條風險看起來各自獨立，其實是同一個問題的五個面向：
 * **沒有人手上有一份「這個 repo 到底拉了什麼進來」的準確清單。**
 * 於是每一條都被迫用人腦估計，而估計會錯 —— R2 的「8 個」實際是 121 個。
 *
 * 所以這裡不逐條處理，而是把那份清單算出來，讓五條各自去取自己要的那一段：
 *
 *   R2  SCA 例外 —— 原生二進位的完整清單 ＋ 分級後的佐證（`--dossier`）
 *   R3  內部 mirror —— 全平台的套件清單 ＋ integrity（`--manifest`）
 *   R4  來源證明 —— 在公網擷取、在封閉網路離線驗證（`--capture` / 預設）
 *   R5  pnpm 自動下載 —— lockfile 第一份文件就是它，一併進 mirror 清單
 *   R8  bingo 的掃描範圍 —— 相依閉包 ＋ 「不進 runtime」這件事的實際斷言
 *
 * ── 模式 ────────────────────────────────────────────────────────────────
 *
 *   （預設）    不連網。跑在 gate 裡：基線比對、平台覆蓋、來源綁定、建置腳本
 *   --update    不連網。重算 inventory.json（等同 api-surface 的 --update）
 *   --capture   **要連公網**。重新擷取 provenance.json
 *   --manifest  不連網。印出給平台團隊的 mirror 清單
 *   --dossier   不連網。印出給資安的 SCA 例外申請書
 *   --airgap    不連網。印出封閉網路的前置條件（含 registry 設定的實測結果）
 *
 *   CI 專用：--split-lockfile <dir>（拆出掃描器讀得懂的 lockfile）、
 *            --verify-sbom <path>（驗掃描器真的看到了東西）
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const LOCKFILE = join(ROOT, "pnpm-lock.yaml");
const INVENTORY_PATH = join(ROOT, "tools/supply-chain/inventory.json");
const PROVENANCE_PATH = join(ROOT, "tools/supply-chain/provenance.json");

/**
 * 原生家族的分級。**新家族出現時閘門會擋下來，逼一次人工分類。**
 *
 * 這份表刻意寫在原始碼而不是 JSON 裡：改它要走 PR，而 `CODEOWNERS` 把
 * `tools/supply-chain/` 交給 `@org/security` 共同持有（那一列必須留著 ——
 * 沒有它，「分類是一次被資安看過的變更」這個設計理由就不成立）。
 * 一個新的原生工具鏈悄悄進到建置環境，是這五條風險裡最該被人看見的一件事，
 * 它不該只是一行 JSON diff。
 *
 * 分級的意義見 `inventory.ts` 的 FamilyTier。
 */
const FAMILY_TIERS: Readonly<Record<string, FamilyTier>> = {
  // ── 工具鏈：少一個平台，那個平台就建不起來 ──────────────────────────
  /** vite-plus 的核心引擎。voidzero-dev/vite-plus（現屬 Cloudflare）。 */
  "@voidzero-dev": "toolchain",
  /** oxlint 的 napi binding。oxc-project/oxc。 */
  "@oxlint": "toolchain",
  /** oxfmt 的 napi binding。oxc-project/oxc。 */
  "@oxfmt": "toolchain",
  /** 型別感知 lint。oxc-project/tsgolint。 */
  "@oxlint-tsgolint": "toolchain",
  /** TypeScript 7 的原生編譯器。microsoft/TypeScript，Apache-2.0。 */
  "@typescript": "toolchain",
  /** vite-plus-core 用的 JS/TS parser（Zig）。yuku-toolchain/yuku。 */
  "@yuku-parser": "toolchain",
  /** 同上，codegen 那一半。 */
  "@yuku-codegen": "toolchain",
  /** CSS transform／minify。parcel-bundler/lightningcss，**MPL-2.0**。 */
  lightningcss: "toolchain",

  // ── 選用：缺了只是少一點便利 ────────────────────────────────────────
  /** macOS 的檔案系統事件。缺了 watch 會退回輪詢，不影響建置產物。 */
  fsevents: "optional",

  // ── 套件管理器自身（lockfile 第一份文件）＝ R5 ──────────────────────
  /** pnpm 的可執行檔本體與各平台變體。 */
  "@pnpm": "package-manager",
  /** pnpm 用來做 copy-on-write 硬連結的原生模組。 */
  "@reflink": "package-manager",
};

/** R8：這些東西只准出現在 tools/*，不得被 apps / features / platform 依賴。 */
const BUILD_ONLY = ["bingo", "@org/slice-gen"];
const RUNTIME_LAYERS = ["apps", "features", "platform"];

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function readInventory(): Inventory {
  const lock = parseLockfile(readFileSync(LOCKFILE, "utf8"));
  return buildInventory(lock, { tiers: FAMILY_TIERS, digest: sha256 });
}

function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 預設模式：離線閘門
// ─────────────────────────────────────────────────────────────────────────────

interface Failure {
  readonly title: string;
  readonly detail: string;
  readonly fix: string;
}

function checkBaseline(inventory: Inventory): Failure[] {
  if (!existsSync(INVENTORY_PATH)) {
    return [
      {
        title: "沒有 inventory.json",
        detail: "供應鏈基線不存在，任何漂移都偵測不到。",
        fix: "node tools/supply-chain/src/cli.ts --update",
      },
    ];
  }

  // 比對的是**內容**不是位元組。`inventory.json` 也在 oxfmt 的範圍裡，
  // 而它排版 JSON 的方式與 `JSON.stringify(…, null, 2)` 不同 —— 若比對位元組，
  // 任何人跑一次 `vp check --fix` 就會讓這道閘門變紅，而紅的原因是「換行位置」。
  // 那種閘門會在兩週內被關掉。
  const before = JSON.parse(readFileSync(INVENTORY_PATH, "utf8")) as Inventory;
  if (JSON.stringify(before) === JSON.stringify(inventory)) return [];

  const beforeIds = new Set(before.natives.map((n) => n.id));
  const afterIds = new Set(inventory.natives.map((n) => n.id));
  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  const beforeFamilies = new Set(before.families.map((f) => f.family));
  const newFamilies = inventory.families.map((f) => f.family).filter((f) => !beforeFamilies.has(f));

  const lines = [
    `原生套件 ${before.totals.native} → ${inventory.totals.native}，家族 ${before.totals.families} → ${inventory.totals.families}`,
  ];
  if (newFamilies.length > 0)
    lines.push(`新家族：${newFamilies.join(", ")}  ← 這是最該被看見的一列`);
  if (added.length > 0)
    lines.push(
      `新增 ${added.length} 筆：${added.slice(0, 6).join(", ")}${added.length > 6 ? " …" : ""}`,
    );
  if (removed.length > 0)
    lines.push(
      `移除 ${removed.length} 筆：${removed.slice(0, 6).join(", ")}${removed.length > 6 ? " …" : ""}`,
    );
  if (added.length === 0 && removed.length === 0 && newFamilies.length === 0)
    lines.push(
      "清單相同但 integrity 或摘要有變 —— 同一個版本號拿到了不同的內容物，這比新增套件更該查。",
    );

  return [
    {
      title: "供應鏈基線漂移",
      detail: lines.join("\n    "),
      fix: "確認上列變動符合預期後：node tools/supply-chain/src/cli.ts --update",
    },
  ];
}

function checkUnclassified(inventory: Inventory): Failure[] {
  const unknown = inventory.families.filter((f) => FAMILY_TIERS[f.family] === undefined);
  if (unknown.length === 0) return [];
  return unknown.map((f) => ({
    title: `未分類的原生家族：${f.family}`,
    detail: `${f.count} 個平台變體進入建置環境，但沒有人說過它是什麼。\n    成員：${f.members.slice(0, 4).join(", ")}${f.members.length > 4 ? " …" : ""}`,
    fix: "在 tools/supply-chain/src/cli.ts 的 FAMILY_TIERS 加一列並寫明它是什麼、誰發佈的",
  }));
}

function checkCoverage(inventory: Inventory): Failure[] {
  const lock = parseLockfile(readFileSync(LOCKFILE, "utf8"));
  const gaps = findCoverageGaps(lock, inventory);
  if (gaps.length === 0) return [];
  return [
    {
      title: "工具鏈家族缺少目標平台",
      detail: gaps.map((g) => `${g.family} 沒有 ${g.target} 的變體（${g.why}）`).join("\n    "),
      fix: "確認該平台是否仍需支援；若否，從 inventory.ts 的 TARGETS 移除並知會平台團隊",
    },
  ];
}

/**
 * 「怎麼修」的訊息必須在**失敗的當下**把限制講完。
 *
 * 原本這裡只寫「跑 `--capture`（需連得到 registry.npmjs.org）」。
 * 在封閉網路裡看到這行的人，會去跑一個**在那裡永遠不可能成功**的指令，
 * 然後開始懷疑是網路設定壞了。真正的答案是「這件事不能在這裡做」，
 * 而那句話原本只寫在 `--airgap` 的輸出與 HANDOFF 裡 —— 兩份都不是
 * 紅燈亮起時會有人去讀的東西。
 *
 * 這是把「發版流程要寫進去的一條規定」變成「工具自己會講的一句話」。
 * 規定會被忘記，錯誤訊息不會。
 */
const CAPTURE_FIX =
  "node tools/supply-chain/src/cli.ts --capture\n" +
  "         ⚠️ 這一步需要連得到 registry.npmjs.org。**封閉網路裡做不到，也不該在那裡做**：\n" +
  "         請在還連得到公網的那一側改完 lockfile 並跑 --capture，兩份檔案一起隨變更進來。\n" +
  "         （閘門刻意不自己連公網補資料 —— 那會讓它在最需要它的環境裡失效。見 vpr airgap 第 5 節）";

function checkProvenance(): Failure[] {
  if (!existsSync(PROVENANCE_PATH)) {
    return [
      {
        title: "沒有 provenance.json",
        detail: "來源證明從未擷取。封閉網路裡再也擷取不到 —— 這件事只能在還連得到公網時做。",
        fix: CAPTURE_FIX,
      },
    ];
  }

  const captured = JSON.parse(readFileSync(PROVENANCE_PATH, "utf8")) as ProvenanceFile;
  const lock = parseLockfile(readFileSync(LOCKFILE, "utf8"));
  const natives = lock.packages.filter(isNative);
  const problems = verifyBinding(natives, captured);
  if (problems.length === 0) return [];

  const changed = problems.filter((p) => p.kind === "integrity-changed");
  const failures: Failure[] = [];

  if (changed.length > 0) {
    failures.push({
      title: "tarball digest 與擷取當下不符",
      detail: changed
        .map((p) =>
          p.kind === "integrity-changed"
            ? `${p.id}\n      lock     ${p.lock}\n      captured ${p.captured}`
            : "",
        )
        .join("\n    "),
      fix:
        "**先當成事故處理**。同一個 name@version 換了內容物，正常升版不會這樣。\n" +
        "         確認無誤後才重新擷取，而且同樣要在公網側做：\n         " +
        CAPTURE_FIX,
    });
  }

  const others = problems.filter((p) => p.kind !== "integrity-changed");
  if (others.length > 0) {
    failures.push({
      title: "來源證明與 lockfile 不同步",
      detail: others
        .map((p) => `${p.kind === "missing-record" ? "缺少紀錄" : "多餘紀錄"}：${p.id}`)
        .join("\n    "),
      fix: CAPTURE_FIX,
    });
  }
  return failures;
}

/**
 * 補償控制的實際斷言，而不是宣稱。
 *
 * SCA 例外申請書會寫「這 121 個二進位在安裝時不執行任何腳本」。那句話的依據是
 * pnpm 11 預設拒絕 build script、`allowBuilds` 是唯一開孔。所以這裡驗的是：
 * **那個開孔裡沒有任何一個原生套件**。宣稱與斷言的差別就在這一段程式碼。
 */
function checkBuildScripts(inventory: Inventory): Failure[] {
  const workspace = readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8");
  const section = workspace.split("allowBuilds:")[1];
  if (section === undefined) return [];

  const allowed = new Set<string>();
  for (const line of section.split("\n")) {
    const match = /^ {2}([^\s#:][^:]*):/.exec(line);
    if (match?.[1] !== undefined) allowed.add(match[1].trim());
  }

  const names = new Set(inventory.natives.map((n) => n.id.slice(0, n.id.lastIndexOf("@"))));
  const offenders = [...allowed].filter((name) => names.has(name));
  if (offenders.length === 0) return [];

  return [
    {
      title: "原生套件被列入 allowBuilds",
      detail: `${offenders.join(", ")}\n    SCA 例外申請書寫的是「這些二進位在安裝時不執行任何腳本」。這一列讓那句話變成假的。`,
      fix: "從 pnpm-workspace.yaml 的 allowBuilds 移除，或改寫申請書並重新送審",
    },
  ];
}

/**
 * 申請書第一條補償控制寫的是「CI 以 `--frozen-lockfile` 安裝」。這裡驗它。
 *
 * `.npmrc` 的 `prefer-frozen-lockfile=true` **不夠**：那是「偏好」，
 * lockfile 與 package.json 對不上時它會安靜地改用解析模式，於是那次安裝
 * 拿到的東西不再是這份 lockfile 鎖的東西 —— 而整份申請書都建立在
 * 「裝進去的就是 lockfile 裡的那些 digest」之上。所以要的是明確的旗標。
 */
function checkFrozenLockfile(): Failure[] {
  const dir = join(ROOT, ".github/workflows");
  if (!existsSync(dir)) return [];
  const offenders: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
    const installs = readFileSync(join(dir, file), "utf8")
      .split("\n")
      .filter((line) => line.includes("vp ") && line.includes(" install"));
    if (installs.length === 0) continue;
    if (!installs.every((line) => line.includes("--frozen-lockfile"))) offenders.push(file);
  }
  if (offenders.length === 0) return [];
  return [
    {
      title: "CI 的安裝步驟沒有 --frozen-lockfile",
      detail: `${offenders.join(", ")}\n    SCA 例外申請書的第一條補償控制就是這個旗標。少了它，裝進去的不保證是 lockfile 鎖的那些。`,
      fix: "在該 workflow 的 vp install 加上 --frozen-lockfile",
    },
  ];
}

/** R8：bingo 只准留在 tools/*。 */
function checkBuildOnlyScope(): Failure[] {
  const offenders: string[] = [];
  for (const layer of RUNTIME_LAYERS) {
    const dir = join(ROOT, layer);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(dir, entry.name, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const declared = { ...manifest.dependencies, ...manifest.devDependencies };
      for (const name of BUILD_ONLY) {
        if (name in declared) offenders.push(`${layer}/${entry.name} → ${name}`);
      }
    }
  }
  if (offenders.length === 0) return [];
  return [
    {
      title: "產生器相依外洩到執行期分層",
      detail: `${offenders.join("\n    ")}\n    R8 的處置是「bingo 只在 tools/* 出現，不進交付產物」。這一列讓那個分類失效。`,
      fix: "把該相依移回 tools/*，或重新向資安申報 bingo 的掃描範圍",
    },
  ];
}

/**
 * SBOM 完整性檢查 —— `--verify-sbom <path>`，跑在 CI 產出 SBOM 之後。
 *
 * ── 為什麼需要這一條 ────────────────────────────────────────────────────
 *
 * 首次在 GitHub Actions 上實跑時，Tier 2 全綠、SBOM 上傳成功、SARIF 上傳成功，
 * 而那份 SBOM 裡有 **0 個 component**。原因在 Trivy 的第二行 log：
 *
 *     INFO  Suppressing dependencies for development and testing.
 *     INFO  Number of language-specific files  num=1
 *
 * 它讀到了 lockfile，然後把套件**全部當成 devDependency 抑制掉**。
 * 對一般應用專案那是合理預設；對**腳手架**則是災難性的 —— 這個 repo 的
 * 工具鏈本來就全是 dev 相依，而 R2／R3／R8 講的 121 個原生二進位正是它們。
 *
 * 後果不是「掃描漏了一些東西」，是 **D13 的修補 SLA 由一個掃描 0 個套件的
 * 閘門把關，結構上永遠不可能變紅**。而且沒有任何一處會告訴你 ——
 * 綠燈、成功上傳、稽核收到一份看起來很正常的空 SBOM。
 *
 * 修法有兩層：`--include-dev-deps` 修掉今天這個症狀；這支檢查修掉那**一整類**
 * 問題 —— 任何讓掃描器看不到套件的原因（parser 不支援新版 lockfile 格式、
 * 掃描路徑寫錯、工具換版改了預設值）都會在這裡變紅。
 *
 * 判準是「兩個獨立來源對同一份 lockfile 的計數不得差太多」：
 * 本工具直接數 `pnpm-lock.yaml`，SBOM 由掃描器產生，兩邊差距過大就是有一邊瞎了。
 */
const SBOM_MIN_RATIO = 0.5;

function checkSbom(sbomPath: string, inventory: Inventory): Failure[] {
  if (!existsSync(sbomPath)) {
    return [
      {
        title: `找不到 SBOM：${sbomPath}`,
        detail: "掃描步驟沒有產出檔案。綠燈但沒有 SBOM，比紅燈更糟。",
        fix: "檢查產出 SBOM 的步驟是否被跳過（前面的步驟失敗會讓它靜默跳過）",
      },
    ];
  }

  const sbom = JSON.parse(readFileSync(sbomPath, "utf8")) as {
    components?: readonly unknown[];
  };
  const counted = sbom.components?.length ?? 0;
  const expected = inventory.totals.packages;
  const floor = Math.floor(expected * SBOM_MIN_RATIO);

  if (counted === 0) {
    return [
      {
        title: "SBOM 是空的 —— 掃描器一個套件都沒看到",
        detail:
          `lockfile 有 ${expected} 個套件，SBOM 有 0 個。\n` +
          "    最常見的原因：掃描器把整個相依樹當成 devDependency 抑制掉了\n" +
          "    （腳手架的工具鏈本來就全是 dev 相依）。實際發生過，見 C33。\n" +
          "    **這代表漏洞掃描結果毫無意義，而它會回綠燈。**",
        fix: "Trivy 加 --include-dev-deps（或 TRIVY_INCLUDE_DEV_DEPS=true）；其他工具找對應選項",
      },
    ];
  }

  if (counted < floor) {
    return [
      {
        title: "SBOM 的套件數明顯少於 lockfile",
        detail:
          `lockfile ${expected} 個，SBOM 只有 ${counted} 個（低於 ${Math.round(SBOM_MIN_RATIO * 100)}% 門檻）。\n` +
          "    兩個獨立來源數同一份 lockfile 不該差這麼多 —— 有一邊看不到東西。",
        fix: "確認掃描器支援本專案的 lockfile 版本與格式，以及有沒有抑制某類相依",
      },
    ];
  }

  console.log(`✓ SBOM：${counted} 個 component（lockfile ${expected} 個，門檻 ${floor}）`);
  return [];
}

function runGate(): number {
  const inventory = readInventory();
  const failures = [
    ...checkUnclassified(inventory),
    ...checkBaseline(inventory),
    ...checkCoverage(inventory),
    ...checkProvenance(),
    ...checkBuildScripts(inventory),
    ...checkFrozenLockfile(),
    ...checkBuildOnlyScope(),
  ];

  if (failures.length === 0) {
    const tiers = new Map<FamilyTier, number>();
    for (const family of inventory.families)
      tiers.set(family.tier, (tiers.get(family.tier) ?? 0) + 1);
    console.log(
      `✓ 供應鏈：${inventory.totals.packages} 個套件、${inventory.totals.native} 個原生二進位、` +
        `${inventory.totals.families} 個家族（工具鏈 ${tiers.get("toolchain") ?? 0}／選用 ${tiers.get("optional") ?? 0}／套件管理器 ${tiers.get("package-manager") ?? 0}），` +
        `${TARGETS.length} 個目標平台皆有變體，來源綁定一致`,
    );
    return 0;
  }

  console.error("\n供應鏈檢查未通過：\n");
  for (const failure of failures) {
    console.error(`  ✗ ${failure.title}`);
    console.error(`    ${failure.detail}`);
    console.error(`    修法：${failure.fix}\n`);
  }
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// --capture：連公網擷取來源證明
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return (await response.json()) as unknown;
}

async function captureOne(pkg: LockPackage): Promise<ProvenanceRecord> {
  const packument = (await fetchJson(packumentUrl(pkg.name, pkg.version))) as {
    license?: string;
    repository?: { url?: string };
    dist?: { tarball?: string; unpackedSize?: number; signatures?: { keyid?: string }[] };
  } | null;

  // registry 的 metadata 沒有 tarball 大小，只有解壓後的。mirror 要存的是前者。
  //
  // ⚠️ **不能用 HEAD**：npm 的 tarball 走 Cloudflare，而它在 HEAD 回應裡
  // 不帶 `content-length`（GET 才帶）。第一版就是這樣，121 筆全部記成 0，
  // 然後申請書印出「mirror 要準備 0.0 MB」—— 一個看起來很權威的錯數字。
  // 改用 range 請求取一個位元組，從 `content-range: bytes 0-0/<total>` 讀總長。
  let contentRange = "";
  if (packument?.dist?.tarball !== undefined) {
    const probe = await fetch(packument.dist.tarball, { headers: { Range: "bytes=0-0" } });
    contentRange = probe.headers.get("content-range") ?? "";
  }
  const tarballBytes = Number(contentRange.split("/")[1] ?? 0);

  // 取不到就中止。記成 0 會安靜地污染 mirror 容量估計 —— 而「一個沒有人再推導
  // 一次的數字」正是這支工具存在的理由。寧可擷取失敗，也不要輸出權威的 0。
  if (!Number.isFinite(tarballBytes) || tarballBytes <= 0) {
    throw new Error(
      `${pkg.id} 取不到 tarball 大小（content-range：${contentRange || "（無）"}）。\n` +
        `  registry 是否改了回應標頭、或不再支援 range 請求？`,
    );
  }

  const attestations = await fetchJson(attestationUrl(pkg.name, pkg.version));
  const decoded = attestations === null ? null : decodeProvenance(attestations);

  const expected = integrityToHex(pkg.integrity);
  if (decoded !== null && decoded.subjectDigest !== expected) {
    // 這是唯一會讓擷取直接中止的情況：attestation 說的 tarball 不是 lockfile 鎖的那顆。
    // 記下一個對不上的來源證明，比沒有來源證明更危險 —— 它會讓後續的離線驗證
    // 每次都通過，卻證明不了任何事。
    throw new Error(
      `${pkg.id} 的 attestation subject digest 與 lockfile integrity 不符\n` +
        `  lockfile    ${expected}\n  attestation ${decoded.subjectDigest}`,
    );
  }

  const evidence: EvidenceLevel =
    decoded !== null
      ? "slsa-provenance"
      : (packument?.dist?.signatures?.length ?? 0) > 0
        ? "registry-signature"
        : "none";

  return {
    id: pkg.id,
    integrity: pkg.integrity,
    evidence,
    // 缺授權欄位就記 UNKNOWN。從上層套件推斷來補這一格很誘人，但那是替發佈者
    // 代填法律聲明 —— 22 個 @yuku-* 就是這種情況，該由法務去確認，不是由這支腳本。
    license: packument?.license ?? "UNKNOWN",
    unpackedBytes: packument?.dist?.unpackedSize ?? 0,
    tarballBytes,
    ...(packument?.repository?.url === undefined ? {} : { declaredRepo: packument.repository.url }),
    ...(decoded?.sourceRepo === undefined ? {} : { sourceRepo: decoded.sourceRepo }),
    ...(decoded?.gitCommit === undefined ? {} : { gitCommit: decoded.gitCommit }),
    ...(decoded?.workflow === undefined ? {} : { workflow: decoded.workflow }),
    ...(decoded?.builder === undefined ? {} : { builder: decoded.builder }),
    ...(packument?.dist?.signatures?.[0]?.keyid === undefined
      ? {}
      : { signatureKeyId: packument.dist.signatures[0].keyid }),
  };
}

async function runCapture(): Promise<number> {
  const lock = parseLockfile(readFileSync(LOCKFILE, "utf8"));
  const natives = lock.packages.filter(isNative);
  // 每個套件兩次往返：packument 取授權／大小／簽章，attestations 取來源證明。
  console.log(
    `擷取 ${natives.length} 個原生套件的來源證明（${natives.length * 2} 次 registry 往返）…`,
  );

  const records: ProvenanceRecord[] = [];
  for (const pkg of natives) {
    records.push(await captureOne(pkg));
    if (records.length % 20 === 0) console.log(`  … ${records.length}/${natives.length}`);
  }

  const totals: Record<EvidenceLevel, number> = {
    "slsa-provenance": 0,
    "registry-signature": 0,
    none: 0,
  };
  for (const record of records) totals[record.evidence] += 1;

  const file: ProvenanceFile = {
    capturedAt: new Date().toISOString().slice(0, 10),
    registry: "https://registry.npmjs.org",
    totals,
    records: records.sort((a, b) => compareStrings(a.id, b.id)),
  };
  writeFileSync(PROVENANCE_PATH, serialise(file));

  console.log(
    `✓ 已寫入 provenance.json：SLSA provenance ${totals["slsa-provenance"]}、` +
      `僅發佈簽章 ${totals["registry-signature"]}、無證據 ${totals.none}`,
  );
  if (totals.none > 0) console.log("  ⚠ 有套件連發佈簽章都沒有，SCA 例外申請書必須單獨列出它們");
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// --manifest：給平台團隊的 mirror 清單
// ─────────────────────────────────────────────────────────────────────────────

function runManifest(): number {
  const lock = parseLockfile(readFileSync(LOCKFILE, "utf8"));
  const rows = lock.packages.map((pkg) => ({
    name: pkg.name,
    version: pkg.version,
    integrity: pkg.integrity,
    platform: isNative(pkg) ? `${pkg.os?.join("|") ?? "any"}/${pkg.cpu?.join("|") ?? "any"}` : null,
    // both ＝ pnpm 自己與專案都要用。分批鏡像時這一類**兩批都要進**。
    scope:
      pkg.documents.length > 1 ? "both" : pkg.documents[0] === 1 ? "package-manager" : "project",
  }));

  console.log(
    serialise({
      generatedFrom: "pnpm-lock.yaml",
      note:
        "此清單取自 lockfile 的 packages: 區（全平台中繼資料），不是安裝結果。" +
        "照 node_modules 或 snapshots: 列清單，必然只涵蓋產生清單那台機器的平台 —— 那正是 R3 的失敗模式。",
      counts: {
        total: rows.length,
        project: rows.filter((r) => r.scope !== "package-manager").length,
        packageManager: rows.filter((r) => r.scope !== "project").length,
        both: rows.filter((r) => r.scope === "both").length,
      },
      packages: rows,
    }).trimEnd(),
  );
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// --dossier：給資安的 SCA 例外申請書
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// --airgap：封閉網路的前置條件（R5 / R3）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * R5 的處置。**風險登記簿原本寫的兩條緩解措施，實測後有一條是無效的。**
 *
 * 登記簿寫：「須改 `onFail` 或讓內部 mirror 供應 pnpm」。實際跑過四種設法
 *（每次開一個乾淨的 HOME、指定一個尚未被快取的 pnpm 版本，再看 pnpm 的
 * metadata 快取目錄以哪個 host 命名 —— 那個目錄名就是它真的連到的地方）：
 *
 *   專案 .npmrc 的 registry=      → **無效**。照樣連 registry.npmjs.org
 *   全域 ~/.npmrc 的 registry=    → 有效。停在 GET <內部位址>/pnpm
 *   npm_config_registry 環境變數  → 有效。連 tarball URL 都走該 host
 *   onFail: "error"               → **無效**。照樣下載，exit 0
 *
 * 第一條最危險：團隊照著「在專案裡設 registry」做完，專案相依確實會走內部
 * mirror（實測會），於是所有人都以為封閉網路沒問題 —— 但 `vp` 的**第一步**
 * 仍然往公網連。要到真的斷網那天才會發現，而那天通常是上線日。
 *
 * 第四條則是登記簿的處置本身寫錯了：`onFail` 不是「要不要下載」的開關。
 */
const AIRGAP_FINDINGS: readonly {
  readonly method: string;
  readonly works: boolean;
  readonly detail: string;
}[] = [
  {
    method: "專案 `.npmrc` 的 `registry=`",
    works: false,
    detail: "專案相依會走內部位址，但套件管理器下載仍連 registry.npmjs.org",
  },
  {
    method: "全域 `~/.npmrc` 的 `registry=`",
    works: true,
    detail: "停在 `GET <內部位址>/pnpm`，證明有被讀到",
  },
  {
    method: "`npm_config_registry` 環境變數",
    works: true,
    detail: "連 tarball URL 都走該 host。CI 最好用的一條",
  },
  {
    method: '`devEngines.packageManager.onFail: "error"`',
    works: false,
    detail: "照樣下載且 exit 0 —— 這不是下載的開關",
  },
];

function runAirgap(): number {
  const lock = parseLockfile(readFileSync(LOCKFILE, "utf8"));
  const packageManager = lock.packages.filter((pkg) => pkg.documents.includes(1));
  const project = lock.packages.filter((pkg) => pkg.documents.includes(2));

  const out: string[] = [];
  out.push("# 封閉網路前置條件（R3 / R5）");
  out.push("");
  out.push("> 由 `node tools/supply-chain/src/cli.ts --airgap` 產生。");
  out.push("");
  out.push("## 1. 內部 mirror 要承載的量");
  out.push("");
  out.push("| 批次 | 套件數 | 說明 |");
  out.push("| --- | --- | --- |");
  out.push(`| 專案相依 | ${project.length} | \`pnpm-lock.yaml\` 第二份文件 |`);
  out.push(
    `| **套件管理器自身** | ${packageManager.length} | 第一份文件。\`pnpm\`、\`@pnpm/exe\` 與其平台變體、\`@reflink\` |`,
  );
  out.push(`| 合計（去重） | ${lock.packages.length} | |`);
  out.push("");
  out.push(
    "第二列是 R3 最容易漏掉的一批：它不在專案的相依樹裡，是 `vp` 為了**啟動自己**而取得的。",
  );
  out.push("漏掉它的症狀不是「某個套件裝不起來」，而是 `vp` 連跑都跑不起來。");
  out.push("");
  out.push("完整清單（含 sha512）：`node tools/supply-chain/src/cli.ts --manifest`");
  out.push("容量估計見 `--dossier`（原生二進位那部分，tarball 與解壓後分開列）。");
  out.push("");
  out.push("### 要鏡像到哪些平台");
  out.push("");
  // 每個平台各自要多存多少 —— 讓「要不要支援 Intel Mac」變成一個帶價目的決定，
  // 而不是一個憑印象回答的問題。沒有數字的話，這種項目通常就一直懸著。
  const captured = existsSync(PROVENANCE_PATH)
    ? (JSON.parse(readFileSync(PROVENANCE_PATH, "utf8")) as ProvenanceFile)
    : null;
  const sizeOf = new Map(captured?.records.map((r) => [r.id, r.tarballBytes]) ?? []);
  const natives = lock.packages.filter(isNative);

  out.push("| 平台 | 依據 | 該平台的原生二進位 | tarball 合計 |");
  out.push("| --- | --- | --- | --- |");
  for (const target of TARGETS) {
    const matching = natives.filter((pkg) => matchesTarget(pkg, target));
    const bytes = matching.reduce((sum, pkg) => sum + (sizeOf.get(pkg.id) ?? 0), 0);
    out.push(
      `| \`${target.label}\` | ${target.why} | ${matching.length} 個 | ${captured === null ? "（尚未擷取）" : mb(bytes)} |`,
    );
  }
  out.push("");
  out.push("後兩列標成「假設」是刻意的：**這份文件不假裝知道團隊用什麼機器。**");
  out.push("上表的最後兩欄就是那個決定的價目 —— 確認不需要的話，拿掉就省下那些容量。");
  out.push("");
  out.push("平台團隊確認之後，請一併改 `tools/supply-chain/src/inventory.ts` 的 `TARGETS` ——");
  out.push(
    "拿掉一列會少存那個平台的變體，加一列則是對每個工具鏈家族提出新的覆蓋要求，兩者閘門都會驗。",
  );
  out.push("");
  out.push("## 2. registry 設定要設在哪裡（實測）");
  out.push("");
  out.push("| 設法 | 是否涵蓋套件管理器下載 | 實測結果 |");
  out.push("| --- | --- | --- |");
  for (const finding of AIRGAP_FINDINGS) {
    out.push(
      `| ${finding.method} | ${finding.works ? "✅ 是" : "❌ **否**"} | ${finding.detail} |`,
    );
  }
  out.push("");
  out.push("**只設專案 `.npmrc` 會製造一種很難察覺的假象**：專案相依確實走了內部 mirror，");
  out.push("所以整個團隊都會相信封閉網路沒問題 —— 但 `vp` 的第一步仍在往公網連，");
  out.push("要到真的斷網那天才會發現。請在**映像檔／機器層級**設定，不要只設在專案裡。");
  out.push("");
  out.push("## 3. 套件管理器批次的完整清單");
  out.push("");
  out.push("| 套件 | integrity |");
  out.push("| --- | --- |");
  for (const pkg of packageManager)
    out.push(`| \`${pkg.id}\` | \`${pkg.integrity.slice(0, 24)}…\` |`);
  out.push("");
  out.push("## 4. 驗收方式");
  out.push("");
  out.push("在**真的連不到公網**的機器上，用乾淨的 HOME 跑一次：");
  out.push("");
  out.push("```");
  out.push(
    "HOME=$(mktemp -d) npm_config_registry=https://<內部位址>/ vp install --frozen-lockfile",
  );
  out.push("```");
  out.push("");
  out.push("乾淨的 HOME 是重點 —— 開發機上的 pnpm 快取會讓這個測試假性通過。");
  out.push("");
  out.push("## 5. 對發版流程的一項硬性限制");
  out.push("");
  out.push("供應鏈閘門會在 `provenance.json` 與 lockfile 對不上時**直接失敗**，而重新擷取");
  out.push("（`--capture`）需要連得到 `registry.npmjs.org`。也就是說在封閉環境裡，");
  out.push("**升相依這件事無法就地完成**：");
  out.push("");
  out.push("> 改 lockfile 與跑 `--capture` 必須在**還連得到公網的那一側**做完，");
  out.push("> 兩份檔案一起隨變更進到封閉環境。");
  out.push("");
  out.push("這是設計的結果不是缺陷 —— 讓閘門在封閉網路裡也跑得動，代價就是擷取要在外面做。");
  out.push("反過來（讓閘門自己連公網補資料）會讓它在最需要它的環境裡失效。");
  out.push("請把這一條寫進發版流程，不要讓人在封閉環境裡對著紅燈找原因。");
  out.push("");

  console.log(out.join("\n"));
  return 0;
}

function mb(bytes: number): string {
  const value = bytes / 1024 / 1024;
  // 小於 10 MB 的保留一位小數：fsevents 是 0.17 MB，四捨五入成「0 MB」會讓人以為抓錯了。
  return `${value < 10 ? value.toFixed(1) : value.toFixed(0)} MB`;
}

function shortRepo(url: string): string {
  return url.replace("git+", "").replace("https://github.com/", "").replace(".git", "");
}

function runDossier(): number {
  const inventory = readInventory();
  if (!existsSync(PROVENANCE_PATH)) {
    console.error("缺少 provenance.json，申請書會少掉佐證那一半。先跑 --capture。");
    return 1;
  }
  const captured = JSON.parse(readFileSync(PROVENANCE_PATH, "utf8")) as ProvenanceFile;
  const byId = new Map(captured.records.map((r) => [r.id, r]));

  const out: string[] = [];
  out.push("# 原生二進位的 SCA 例外申請（R2 / R8）");
  out.push("");
  out.push(`> 由 \`node tools/supply-chain/src/cli.ts --dossier\` 產生，來源是 \`pnpm-lock.yaml\``);
  out.push(`> 與 \`provenance.json\`（擷取於 ${captured.capturedAt}）。**不要手改這份文件** ——`);
  out.push(
    "> 手抄的數字正是這件事最初出錯的原因（原本寫「8 個」，實際是 " +
      inventory.totals.native +
      " 個）。",
  );
  out.push("");
  out.push("## 申請範圍");
  out.push("");
  out.push(`| 項目 | 數量 |`);
  out.push(`| --- | --- |`);
  out.push(`| lockfile 收錄的套件總數 | ${inventory.totals.packages} |`);
  out.push(`| 其中平台限定的原生套件 | **${inventory.totals.native}** |`);
  out.push(`| 分屬家族 | ${inventory.totals.families} |`);
  out.push(`| 缺少 sha512 integrity 的套件 | ${inventory.totals.withoutIntegrity} |`);
  out.push("");

  out.push("## 為什麼需要例外");
  out.push("");
  out.push(
    "這些套件的內容物是**編譯後的原生執行檔**，不含原始碼。以原始碼掃描器處理會有兩種結果：",
  );
  out.push("解不出相依而判 fail，或掃出大量二進位樣式的偽陽性。兩者都不產生資安價值。");
  out.push("");
  out.push("替代的佐證分兩級，**必須分開看**：");
  out.push("");
  out.push("| 佐證等級 | 數量 | 內容 |");
  out.push("| --- | --- | --- |");
  out.push(
    `| SLSA provenance | ${captured.totals["slsa-provenance"]} | Sigstore 簽署，可回推到來源 repo 的**確切 commit** 與建置 workflow |`,
  );
  out.push(
    `| 僅 npm 發佈簽章 | ${captured.totals["registry-signature"]} | registry 簽章可驗發佈者，但**無法回推建置來源** |`,
  );
  out.push(`| 無任何佐證 | ${captured.totals.none} | 需單獨說明 |`);
  out.push("");
  if (captured.totals["registry-signature"] > 0) {
    out.push(
      "⚠️ 第二列是這次盤點最該被注意的一項。風險登記簿原本寫「證據：npm 上的 SLSA provenance」，",
    );
    out.push("但那句話只對第一列成立。第二列（含 TypeScript 7 自己的原生編譯器）沒有 provenance。");
    out.push("");
  }

  out.push("## 逐家族明細");
  out.push("");
  out.push("「單平台」是**一台機器解壓後**的佔用，「全平台」是同一家族所有變體的解壓合計。");
  out.push(
    "來源欄的 **attested** 由 Sigstore 簽署，**自述** 只是發佈者在 `package.json` 裡寫的字串。",
  );
  out.push("");
  out.push("| 家族 | 分級 | 變體 | 授權 | 佐證 | 單平台 | 全平台 | 來源 |");
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const family of inventory.families) {
    const members = family.members.map((id) => byId.get(id)).filter((r) => r !== undefined);
    const licenses = [...new Set(members.map((r) => r.license))].join(", ") || "—";
    const evidence = [...new Set(members.map((r) => r.evidence))].join(", ") || "—";
    const attested = [
      ...new Set(members.map((r) => r.sourceRepo).filter((r) => r !== undefined)),
    ][0];
    const declared = [
      ...new Set(members.map((r) => r.declaredRepo).filter((r) => r !== undefined)),
    ][0];
    const source =
      attested !== undefined
        ? `${shortRepo(attested)}（attested）`
        : declared !== undefined
          ? `${shortRepo(declared)}（自述）`
          : "—";
    const total = members.reduce((sum, r) => sum + r.unpackedBytes, 0);
    const largest = members.reduce((max, r) => Math.max(max, r.unpackedBytes), 0);
    out.push(
      `| \`${family.family}\` | ${family.tier} | ${family.count} | ${licenses} | ${evidence} | ${mb(largest)} | ${mb(total)} | ${source} |`,
    );
  }
  const unpackedAll = captured.records.reduce((sum, r) => sum + r.unpackedBytes, 0);
  const tarballAll = captured.records.reduce((sum, r) => sum + r.tarballBytes, 0);
  out.push("");
  out.push(
    `全部原生二進位：解壓後合計 **${mb(unpackedAll)}**，tarball 合計 **${mb(tarballAll)}**。`,
  );
  out.push("");
  out.push(
    "兩個數字用途不同，別互換：**mirror 存的是 tarball**，開發機與 CI 的 `node_modules` 佔的是解壓後的量。",
  );
  out.push("");

  const licenses = new Map<string, number>();
  for (const record of captured.records)
    licenses.set(record.license, (licenses.get(record.license) ?? 0) + 1);
  out.push("## 授權分佈");
  out.push("");
  for (const [license, count] of [...licenses].sort((a, b) => b[1] - a[1])) {
    out.push(`- \`${license}\` — ${count} 個`);
  }
  out.push("");
  out.push("需要法務確認的兩項，**不是**這支工具能代答的：");
  out.push("");
  if (licenses.has("MPL-2.0")) {
    out.push("- `MPL-2.0`（lightningcss）是檔案層級的弱著作權。這裡的用途是**建置期工具**、");
    out.push(
      "  產物不含其原始碼，但多數企業的授權政策會把 MPL 標記出來 —— 先說明，別等它被掃出來。",
    );
  }
  const unknown = captured.records.filter((r) => r.license === "UNKNOWN");
  if (unknown.length > 0) {
    const fams = [...new Set(unknown.map((r) => r.id.split("/")[0]))].join("、");
    out.push(`- **${unknown.length} 個套件在 registry 上沒有 license 欄位**（${fams}）。`);
    out.push(
      "  上層套件宣告 MIT、同一個 repo，但這支工具刻意**不**替它們填上 —— 從別的套件推斷授權",
    );
    out.push("  等於代發佈者做法律聲明。要嘛請上游補，要嘛由法務書面認可，不要讓它悄悄變成 MIT。");
  }
  out.push("");

  out.push("## 補償控制（已由閘門實際斷言，非宣稱）");
  out.push("");
  out.push(
    `- **完整性鎖定**：${inventory.totals.packages} 個套件全數帶 sha512 integrity，CI 以 \`--frozen-lockfile\` 安裝`,
  );
  out.push(
    "- **不執行安裝腳本**：pnpm 11 預設拒絕 build script；唯一開孔 `allowBuilds` 內沒有任何原生套件",
  );
  out.push(
    "- **來源綁定**：lockfile 的 integrity 與 attestation 的 subject digest 是同一個 sha512，每次 gate 比對",
  );
  out.push("- **漂移偵測**：家族清單進版控，新家族出現時閘門擋下並要求人工分類");
  out.push("");

  if (inventory.deprecated.length > 0) {
    out.push("## lockfile 內被標記 deprecated 的套件");
    out.push("");
    for (const item of inventory.deprecated) out.push(`- \`${item.id}\` — ${item.reason}`);
    out.push("");
  }

  out.push("## R8：產生器相依（bingo）");
  out.push("");
  out.push("`bingo` 由 `tools/slice-gen` 使用，屬**建置期／開發期**相依，不進入任何交付產物。");
  out.push(
    `此分類由閘門斷言：\`${RUNTIME_LAYERS.join("`／`")}\` 之下沒有任何 package 宣告 \`${BUILD_ONLY.join("` 或 `")}\`。`,
  );
  out.push("納入 SCA 掃描範圍時建議標記為 dev-only，與 runtime 相依分開計算嚴重度。");
  out.push("");

  console.log(out.join("\n"));
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--update")) {
    writeFileSync(INVENTORY_PATH, serialise(readInventory()));
    const inventory = readInventory();
    console.log(
      `✓ inventory.json 已更新：${inventory.totals.packages} 個套件、${inventory.totals.native} 個原生二進位、${inventory.totals.families} 個家族`,
    );
    return 0;
  }
  // --split-lockfile <dir>：把 lockfile 的每一份 YAML 文件寫成獨立的 pnpm-lock.yaml，
  // 各放一個子目錄。掃描器掃這個父目錄就會看到全部，不會只看到第一份（C34）。
  const splitFlag = args.indexOf("--split-lockfile");
  if (splitFlag >= 0) {
    const outDir = args[splitFlag + 1];
    if (outDir === undefined) {
      console.error("--split-lockfile 需要一個輸出目錄");
      return 1;
    }
    const documents = splitDocuments(readFileSync(LOCKFILE, "utf8"));
    for (const [index, document] of documents.entries()) {
      const dir = join(resolve(outDir), `doc${index + 1}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "pnpm-lock.yaml"), document);
      // 有些掃描器要看到 package.json 才認定這是個 JS 專案。
      writeFileSync(
        join(dir, "package.json"),
        `{"name":"lockfile-doc${index + 1}","private":true}\n`,
      );
    }
    console.log(`✓ 已拆出 ${documents.length} 份文件到 ${outDir}/doc1…doc${documents.length}`);
    return 0;
  }

  const sbomFlag = args.indexOf("--verify-sbom");
  if (sbomFlag >= 0) {
    const path = args[sbomFlag + 1];
    if (path === undefined) {
      console.error("--verify-sbom 需要一個檔案路徑");
      return 1;
    }
    const failures = checkSbom(resolve(path), readInventory());
    if (failures.length === 0) return 0;
    console.error("\nSBOM 檢查未通過：\n");
    for (const failure of failures) {
      console.error(`  ✗ ${failure.title}`);
      console.error(`    ${failure.detail}`);
      console.error(`    修法：${failure.fix}\n`);
    }
    return 1;
  }
  if (args.includes("--capture")) return runCapture();
  if (args.includes("--manifest")) return runManifest();
  if (args.includes("--dossier")) return runDossier();
  if (args.includes("--airgap")) return runAirgap();
  return runGate();
}

process.exitCode = await main();
