import type { Manifest } from "./workspace.ts";

/** 測試檔不出門（C231 §四.3）。`specs/` 在白名單外本來就不會被走到。 */
export const TEST_FILE = /(^|\/)(tests|fixtures)\/|\.(test|spec)\.[^/]+$|\.feature$/;

/**
 * 不經 import、只在設定裡以名字出現的測試工具：vitest 以字串選 `happy-dom` 當環境、
 * 以預設 provider 載入 `@vitest/coverage-v8`。其餘的測試相依由 `testOnlyDependencies`
 * 從 import 推 —— 這兩筆是推不到的那一種。
 */
export const CONFIG_REFERENCED_TEST_TOOLS: ReadonlySet<string> = new Set([
  "happy-dom",
  "@vitest/coverage-v8",
]);

/** 以引號包住的模組名，或它的子路徑（`"vitest"`、`'vitest/config'`）。 */
function references(source: string, dependency: string): boolean {
  return ['"', "'", "`"].some(
    (quote) =>
      source.includes(`${quote}${dependency}${quote}`) || source.includes(`${quote}${dependency}/`),
  );
}

/**
 * 只有測試用到的 devDependencies：匯出的非測試檔一處都沒引用，而且測試檔引用了它
 * （或它是 `CONFIG_REFERENCED_TEST_TOOLS` 的一筆）。
 *
 * ⚠️ 「非測試檔沒引用」是必要條件而不是充分條件 —— `typescript`、`@types/*`、`@org/tsconfig`
 * 也一處都沒被 import，它們是型別檢查用的；所以另一半要求**測試那一側引用了它**。
 */
export function testOnlyDependencies(
  manifest: Manifest,
  exportedSource: string,
  testSource: string,
): string[] {
  return Object.keys(manifest.devDependencies ?? {}).filter(
    (dependency) =>
      !references(exportedSource, dependency) &&
      (references(testSource, dependency) || CONFIG_REFERENCED_TEST_TOOLS.has(dependency)),
  );
}

export function rewriteManifest(manifest: Manifest, dropped: readonly string[]): Manifest {
  const { test: _test, ...scripts } = manifest.scripts ?? {};
  const devDependencies = Object.fromEntries(
    Object.entries(manifest.devDependencies ?? {}).filter(([name]) => !dropped.includes(name)),
  );
  const rewritten: Record<string, unknown> = { ...manifest, scripts, devDependencies };
  if (Object.keys(scripts).length === 0) delete rewritten["scripts"];
  if (Object.keys(devDependencies).length === 0) delete rewritten["devDependencies"];
  return rewritten as Manifest;
}

/**
 * 根層 `package.json` 用白名單重寫，不是從原檔刪欄位：原檔的每一筆 script 與大半 devDep
 * 都是腳手架的（閘門鏈、stryker、eslint），而黑名單會把下一個新加的欄位預設帶出門。
 *
 * - `vite-plus` 提供 `vp`，`build`／`dev` 兩條 script 靠它；`vite` 是它 alias 的那一份；
 *   `typescript` 讓機關端 `vp check` 做得了型別檢查。
 * - ⚠️ `license` 不帶：交付物的授權看契約，交付時由人放（C231 §八）。`version` 是腳手架的版號，不帶。
 */
export const ROOT_FIELDS = [
  "name",
  "private",
  "type",
  "devEngines",
  "engines",
  "packageManager",
] as const;
export const ROOT_SCRIPTS = ["build", "dev"] as const;
export const ROOT_DEV_DEPENDENCIES = ["typescript", "vite", "vite-plus"] as const;

export function rewriteRootManifest(manifest: Manifest): Manifest {
  const pick = <K extends string>(
    from: Readonly<Record<string, unknown>> | undefined,
    keys: readonly K[],
  ) =>
    Object.fromEntries(
      keys.filter((key) => from?.[key] !== undefined).map((key) => [key, from?.[key]]),
    );
  const missing = ROOT_SCRIPTS.filter((script) => manifest.scripts?.[script] === undefined);
  if (missing.length > 0)
    throw new Error(`根層 package.json 沒有 ${missing.join("、")} —— 機關端建不起來`);
  return {
    ...pick(manifest, ROOT_FIELDS),
    scripts: pick(manifest.scripts, ROOT_SCRIPTS),
    devDependencies: pick(manifest.devDependencies, ROOT_DEV_DEPENDENCIES),
  } as Manifest;
}

function stripInlineComment(line: string): string {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index++) {
    const char = line[index] as string;
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (index === 0 || /\s/.test(line[index - 1] as string))) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
}

function yamlKey(line: string): string {
  return line.trim().split(":")[0]?.replaceAll('"', "").replaceAll("'", "") ?? "";
}

/**
 * `pnpm-workspace.yaml` 逐行改寫，不引入 YAML parser（D2：多一個相依就是多一筆 SCA 範圍）。
 *
 * - 註解全拿掉：原檔的註解是這棵樹的決策脈絡，大半帶裁決編號與工具名。
 * - `packages:` 只留有成員出門的那幾層。
 * - `catalog:` 只留匯出的 manifest 還引用的條目 —— 沒被引用的那幾筆（stryker、eslint…）
 *   本身就是痕跡，而且 lockfile 剪完之後也不再需要它們。
 * - ⚠️ `overrides` 一筆都不動：lockfile 記著它們，改了 `--frozen-lockfile` 就裝不起來。
 */
export function rewriteWorkspaceYaml(
  yaml: string,
  keep: { readonly globs: ReadonlySet<string>; readonly catalog: ReadonlySet<string> },
): string {
  const sections: string[][] = [];
  let section = "";
  for (const raw of yaml.split("\n")) {
    if (raw.trimStart().startsWith("#")) continue;
    const line = stripInlineComment(raw);
    if (line.trim().length === 0) continue;
    if (/^\S/.test(line)) {
      section = yamlKey(line);
      sections.push([line]);
      continue;
    }
    if (section === "packages") {
      const glob = /^\s+-\s+["']?([^"'\s]+)/.exec(line)?.[1];
      if (glob !== undefined && !keep.globs.has(glob)) continue;
    }
    if (section === "catalog" && !keep.catalog.has(yamlKey(line))) continue;
    sections.at(-1)?.push(line);
  }
  return `${sections.map((lines) => lines.join("\n")).join("\n\n")}\n`;
}

/** 匯出的 manifest 與 `overrides` 裡寫成 `catalog:` 的名字 —— catalog 要留的就是這些。 */
export function catalogReferences(manifests: readonly Manifest[], yaml: string): Set<string> {
  const names = new Set<string>();
  for (const manifest of manifests) {
    for (const deps of [manifest.dependencies, manifest.devDependencies]) {
      for (const [name, spec] of Object.entries(deps ?? {}))
        if (spec.startsWith("catalog:")) names.add(name);
    }
  }
  for (const raw of yaml.split("\n")) {
    if (!/^\s+[^\s#]/.test(raw)) continue;
    const line = stripInlineComment(raw);
    const value = line
      .slice(line.indexOf(":") + 1)
      .trim()
      .replaceAll('"', "")
      .replaceAll("'", "");
    if (value.startsWith("catalog:")) names.add(yamlKey(line));
  }
  return names;
}

const NEUTRAL_REGISTRY_NOTE =
  "# 內部 registry：部署到受管制環境前，解除下一行的註解並填入實際位址。";

/**
 * `.npmrc` 只留設定行（Q110）：`node-linker=isolated`／`hoist=false` 決定 `node_modules` 的形狀，
 * 不帶的話機關端裝出來的是 pnpm 預設的那一棵，不是演練驗過的這一棵。
 * 原檔那一句被註解掉的 `registry=` 換一行中性的說明保留 —— 那是機關端真的要做的一步。
 */
export function rewriteNpmrc(npmrc: string): string {
  const lines = npmrc.split("\n");
  const settings = lines.filter((line) => /^[\w@/:.-]+\s*=/.test(line));
  const registry = lines.find((line) => /^#\s*registry\s*=/.test(line));
  const head = registry === undefined ? [] : [NEUTRAL_REGISTRY_NOTE, registry, ""];
  return `${[...head, ...settings].join("\n")}\n`;
}

/**
 * 根層 `.gitignore` 另寫一份，不複製（C231 §四.4）：原檔大半是 stryker、`tools/` 與覆蓋率的條目
 * 和說明。這裡只收建置與開發會產生的東西。
 */
export const GITIGNORE = [
  "node_modules",
  "dist",
  "dist-ssr",
  "*.local",
  "*.log",
  ".env",
  ".env.*",
  "!.env.example",
  ".DS_Store",
  "",
].join("\n");
