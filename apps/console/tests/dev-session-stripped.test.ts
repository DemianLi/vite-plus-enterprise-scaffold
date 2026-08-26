import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 從 `vite-plus` 取，不是從 `vite`：這個 repo 的 `vp build` 用的是前者，
// 而搖樹是建置器的行為 —— 用另一支建置器量到的不保證是同一件事。
import { build } from "vite-plus";

/**
 * 本機 session 入口不得進 production 產物（#95 的阻斷級 ②c）。
 *
 * ── 為什麼要真的建置 ────────────────────────────────────────────────
 *
 * 因為要問的問題是「它有沒有被搖掉」，而一支去 grep `App.vue` 有沒有寫
 * `import.meta.env.DEV` 的測試量的是「有沒有寫」，不是「有沒有生效」——
 * `tools/theme-verify` 的檔頭把這個區別講得很清楚，這個 repo 也已經
 * 在 `sr-only` 上踩過一次那個形狀。
 *
 * ── 為什麼建兩次 ────────────────────────────────────────────────────
 *
 * 只建 production 的話，「產物裡找不到那串字」有一個很無聊的解釋：
 * 那串字根本不存在（改了元件、拼錯了探針）。dev 那一次是對照組 ——
 * 它必須**找得到**，否則這支測試證明的是它自己的探針壞了。
 */

/** 探針取自元件自己的原始碼；下面第一條斷言先確認它們真的在裡面。 */
const PROBES = ["dev-session", "建立本機 session"] as const;

const PACKAGE_ROOT = join(import.meta.dirname, "..");

function bundledText(outDir: string): string {
  const assets = join(outDir, "assets");
  return readdirSync(assets)
    .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
    .map((name) => readFileSync(join(assets, name), "utf8"))
    .join("\n");
}

/**
 * ⚠️ `NODE_ENV` 要跟著 mode 一起設，否則量到的是另一件事。
 *
 * Vite 判定 `isProduction` 看的是 `NODE_ENV || mode`，而 vitest 會把
 * `NODE_ENV` 設成 `"test"` —— 於是只傳 `mode: "production"` 的建置，
 * `import.meta.env.DEV` 仍然是 `true`，元件照樣留在產物裡。
 *
 * 這一格踩過：第一版沒設，測試紅了，而**產物是對的**（`vp build` 從
 * 命令列跑出來的 dist 裡一個字都沒有）。也就是說壞的是儀器不是東西 ——
 * 而如果當初斷言的方向反過來，這支測試會安靜地通過。
 */
async function buildInto(mode: string): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), `console-${mode}-`));
  const previousNodeEnv = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = mode;
  try {
    await build({
      root: PACKAGE_ROOT,
      mode,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true, sourcemap: false },
    });
  } finally {
    process.env["NODE_ENV"] = previousNodeEnv;
  }
  return bundledText(outDir);
}

let production = "";
let development = "";

beforeAll(async () => {
  production = await buildInto("production");
  development = await buildInto("development");
}, 120_000);

describe("dev-only 的本機 session 入口", () => {
  it("探針字串確實住在元件裡（不然下面兩條都是空的）", () => {
    const source = readFileSync(join(PACKAGE_ROOT, "src/DevSession.vue"), "utf8");
    for (const probe of PROBES) expect(source).toContain(probe);
  });

  it("★ production 產物裡一個字都沒有", () => {
    // 一個「看起來很完整」的登入畫面躺在 production 的 JS 裡，
    // 就是 platform/bff-mock 檔頭點名的那個失敗模式。
    for (const probe of PROBES) expect(production).not.toContain(probe);
  });

  it("★ dev 產物裡找得到（對照組）", () => {
    for (const probe of PROBES) expect(development).toContain(probe);
  });
});
