import type { Manifest } from "./workspace.ts";

/**
 * 測試檔不出門（C231 §四.3）。`specs/` 在白名單外本來就不會被走到。
 * `vitest.config.*` 是與建置設定分開放的測試設定（C250，`apps/console` 那一支）。
 */
export const TEST_FILE =
  /(^|\/)(tests|fixtures)\/|\.(test|spec)\.[^/]+$|\.feature$|(^|\/)vitest\.config\.[^/]+$/;

/**
 * 不經 import、只在設定裡以名字出現的測試工具：vitest 以字串選 `happy-dom` 當環境、
 * 以預設 provider 載入 `@vitest/coverage-v8`。其餘的測試相依由 `testOnlyDependencies`
 * 從 import 推 —— 這兩筆是推不到的那一種。
 */
export const CONFIG_REFERENCED_TEST_TOOLS: ReadonlySet<string> = new Set([
  "happy-dom",
  "@vitest/coverage-v8",
]);

const QUOTES = ['"', "'", "`"] as const;

/** 以引號包住的模組名，或它的子路徑（`"vitest"`、`'vitest/config'`）。 */
export function references(source: string, dependency: string): boolean {
  return QUOTES.some(
    (quote) =>
      source.includes(`${quote}${dependency}${quote}`) || source.includes(`${quote}${dependency}/`),
  );
}

/** 以相對路徑 import 了這支檔（`"./contract.ts"`、`'../src/contract'`）。 */
export function importsRelatively(source: string, file: string): boolean {
  const name = file.slice(file.lastIndexOf("/") + 1);
  const stem = name.replace(/\.[^.]+$/, "");
  return QUOTES.some(
    (quote) => source.includes(`/${name}${quote}`) || source.includes(`/${stem}${quote}`),
  );
}

/**
 * 成員自己建置得起來，才需要它的 `vite.config.*`。沒有 `build`／`dev` 的成員（切片以原始碼被
 * 應用引用），那支設定只剩測試在讀 —— 不出門（C250 §三：拿掉之後產物逐位元組相同）。
 */
export const BUILD_SCRIPTS = ["build", "dev"] as const;
export const VITE_CONFIG = /^vite\.config\.[cm]?[jt]s$/;

export function buildsItself(manifest: Manifest): boolean {
  return BUILD_SCRIPTS.some((script) => manifest.scripts?.[script] !== undefined);
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

/**
 * 交出去的樹不用 vite-plus 建置（C253）：它硬相依 vitest 與九個 `@vitest/*`，只要它在，
 * lockfile 與機關端裝出來的 `node_modules` 就看得到測試套件。建置改用上游 Vite ——
 * 版本取自 catalog 的 `vite-upstream`，它在 repo 的 lockfile 裡，所以 SCA 看得到、CI 開機時
 * 它就在 store 裡。
 */
export const DRIVER = "vite-plus";

/**
 * 出門的 script 裡 `vp` 的寫法 → 上游 Vite 與 pnpm 的寫法。鍵是上游那一行的全文：
 * 表外的 `vp …` 丟例外，不猜 —— 猜錯的樣子是機關端一跑就 `command not found`。
 */
export const DELIVERED_SCRIPTS: Readonly<Record<string, string>> = {
  "vp dev": "vite",
  "vp build": "vite build",
  "vp preview": "vite preview",
  "vp run -r build": "pnpm -r build",
  "vp run console#dev": "pnpm --filter @org/console dev",
};

/** 開發者才跑的：測試，以及 `vp check`（格式、lint、型別）—— 機關端沒有 `vp`，不出門。 */
export const DEVELOPER_SCRIPTS: ReadonlySet<string> = new Set(["test", "check"]);

const USES_DRIVER = /(^|[\s;&|])vp(\s|$)/;

export function deliveredScript(name: string, command: string): string {
  if (!USES_DRIVER.test(command)) return command;
  const rewritten = DELIVERED_SCRIPTS[command];
  if (rewritten === undefined) {
    throw new Error(`script「${name}」是 \`${command}\`，改寫表沒有它 —— 機關端沒有 vp`);
  }
  return rewritten;
}

function deliveredScripts(scripts: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scripts)
      .filter(([name]) => !DEVELOPER_SCRIPTS.has(name))
      .map(([name, command]) => [name, deliveredScript(name, command)]),
  );
}

/** `vite.config.*` 從 vite-plus 拿的 `defineConfig`／`loadEnv`，上游 Vite 同名同形。 */
export function withUpstreamVite(source: string): string {
  const rewritten = QUOTES.reduce(
    (text, quote) => text.replaceAll(`from ${quote}${DRIVER}${quote}`, `from ${quote}vite${quote}`),
    source,
  );
  if (references(rewritten, DRIVER)) {
    throw new Error(`vite.config 還引用 ${DRIVER}（子路徑或別的寫法）—— 上游 Vite 沒有它`);
  }
  return rewritten;
}

/**
 * `tsconfig.json` 的 `include` 裡，指到匯出樹不存在的路徑拿掉（C251，Q121）：上游要型別檢查涵蓋
 * `tests/`，匯出樹沒有它，那一格只剩「這裡原本有測試」的意思。`exists` 由匯出結果推 ——
 * `apps/console` 的 `vite.config.ts` 出門，照樣留著。
 * ⚠️ 只改那個陣列、不經 `JSON.parse`：有幾支帶註解（JSONC），重新序列化會把它們吃掉。
 */
export function rewriteTsconfigInclude(source: string, exists: (entry: string) => boolean): string {
  return source.replace(/("include"\s*:\s*)\[([^\]]*)\]/, (whole, head: string, body: string) => {
    const entries = [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
    const kept = entries.filter(exists);
    if (kept.length === entries.length) return whole;
    if (kept.length === 0) throw new Error(`tsconfig 的 include 全部指到匯出樹沒有的路徑：${body}`);
    return `${head}[${kept.map((entry) => JSON.stringify(entry)).join(", ")}]`;
  });
}

const SOURCE_NOT = /^@source\s+not\s+["']([^"']+)["'];\s*$/;

/**
 * 樣式檔裡把測試檔排除在 Tailwind 掃描之外的 `@source not`，連同緊貼在上面的那段註解，不出門
 *（C251，Q122）。「指向測試檔」沿用 `TEST_FILE`。匯出樹沒有測試檔，拿掉它們產物不變。
 * 註解只在那一串 `@source not` 全數指向測試檔時一起拿 —— 混了別的排除，那段註解就不只在講測試。
 */
export function withoutTestSourceExclusions(css: string): string {
  const lines = css.split("\n");
  const drop = new Set<number>();
  for (let index = 0; index < lines.length; index++) {
    if (!SOURCE_NOT.test(lines[index] as string)) continue;
    let end = index;
    while (end + 1 < lines.length && SOURCE_NOT.test(lines[end + 1] as string)) end++;
    const run = lines.slice(index, end + 1);
    for (let at = index; at <= end; at++) {
      if (TEST_FILE.test(SOURCE_NOT.exec(lines[at] as string)?.[1] ?? "")) drop.add(at);
    }
    const whole = run.every((line) => TEST_FILE.test(SOURCE_NOT.exec(line)?.[1] ?? ""));
    if (whole && lines[index - 1]?.trim() === "*/") {
      let start = index - 1;
      while (start > 0 && !(lines[start] as string).trimStart().startsWith("/*")) start--;
      for (let at = start; at < index; at++) drop.add(at);
      if (lines[start - 1]?.trim() === "" && lines[end + 1]?.trim() === "") drop.add(start - 1);
    }
    index = end;
  }
  return lines.filter((_, index) => !drop.has(index)).join("\n");
}

/**
 * `dropped` 是拿掉的 devDependencies，`withheldExports` 是不出門的子路徑（`./contract`）。
 * `vite-plus` 與開發者才跑的 script 一律不出門（C253）。
 */
export function rewriteManifest(
  manifest: Manifest,
  dropped: readonly string[],
  withheldExports: readonly string[] = [],
): Manifest {
  const scripts = deliveredScripts(manifest.scripts ?? {});
  const devDependencies = Object.fromEntries(
    Object.entries(manifest.devDependencies ?? {}).filter(
      ([name]) => !dropped.includes(name) && name !== DRIVER,
    ),
  );
  const rewritten: Record<string, unknown> = { ...manifest, scripts, devDependencies };
  if (withheldExports.length > 0 && typeof manifest["exports"] === "object") {
    rewritten["exports"] = Object.fromEntries(
      Object.entries(manifest["exports"] as Record<string, unknown>).filter(
        ([subpath]) => !withheldExports.includes(subpath),
      ),
    );
  }
  if (Object.keys(scripts).length === 0) delete rewritten["scripts"];
  if (Object.keys(devDependencies).length === 0) delete rewritten["devDependencies"];
  return rewritten as Manifest;
}

/**
 * 根層 `package.json` 用白名單重寫，不是從原檔刪欄位：原檔的每一筆 script 與大半 devDep
 * 都是腳手架的（閘門鏈、stryker、eslint），而黑名單會把下一個新加的欄位預設帶出門。
 *
 * - `build`／`dev` 改寫成 pnpm（`DELIVERED_SCRIPTS`）；`vite` 是上游那一份（C253）。
 * - `typescript` 留著：`tsconfig` 出門，機關端的編輯器與 `tsc` 做型別檢查靠它。
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
export const ROOT_DEV_DEPENDENCIES = ["typescript", "vite"] as const;

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
    scripts: deliveredScripts(pick(manifest.scripts, ROOT_SCRIPTS) as Record<string, string>),
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

function yamlValue(line: string): string {
  return line
    .slice(line.indexOf(":") + 1)
    .trim()
    .replaceAll('"', "")
    .replaceAll("'", "");
}

/**
 * catalog 的 `vite-upstream`（`npm:vite@<版本>`）→ 交出去的樹的 `vite` 版本（C253）。
 * 沒有這一行、或形狀不是 `npm:vite@<版本>`，丟例外：交出去的樹會沒有建置引擎可用。
 */
export function upstreamViteVersion(yaml: string): string {
  for (const raw of yaml.split("\n")) {
    const line = stripInlineComment(raw);
    if (!/^\s/.test(line) || yamlKey(line) !== "vite-upstream") continue;
    const version = /^npm:vite@(\d\S*)$/.exec(yamlValue(line))?.[1];
    if (version === undefined) {
      throw new Error(`catalog 的 vite-upstream 不是 npm:vite@<版本>：${yamlValue(line)}`);
    }
    return version;
  }
  throw new Error("catalog 沒有 vite-upstream —— 交出去的樹沒有建置引擎可用");
}

/**
 * `pnpm-workspace.yaml` 逐行改寫，不引入 YAML parser（D2：多一個相依就是多一筆 SCA 範圍）。
 *
 * - 註解全拿掉：原檔的註解是這棵樹的決策脈絡，大半帶裁決編號與工具名。
 * - `packages:` 只留有成員出門的那幾層。
 * - `catalog:` 只留匯出的 manifest 還引用的條目 —— 沒被引用的那幾筆（stryker、eslint…）
 *   本身就是痕跡，而且 lockfile 剪完之後也不再需要它們。`pins` 裡的條目換成指定的值
 *  （`vite` 換成上游那一版，C253）。
 * - ⚠️ `overrides` 一筆都不動：lockfile 記著它們，改了 `--frozen-lockfile` 就裝不起來。
 */
export function rewriteWorkspaceYaml(
  yaml: string,
  keep: {
    readonly globs: ReadonlySet<string>;
    readonly catalog: ReadonlySet<string>;
    readonly pins?: ReadonlyMap<string, string>;
  },
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
    if (section === "catalog") {
      const key = yamlKey(line);
      if (!keep.catalog.has(key)) continue;
      const pinned = keep.pins?.get(key);
      if (pinned !== undefined) {
        sections.at(-1)?.push(`${/^\s*/.exec(line)?.[0] ?? "  "}${key}: ${pinned}`);
        continue;
      }
    }
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
    if (yamlValue(line).startsWith("catalog:")) names.add(yamlKey(line));
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
