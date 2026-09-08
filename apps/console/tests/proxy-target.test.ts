import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertNoUndeclaredEnv } from "@org/config";

/**
 * dev proxy 的 BFF 目標是怎麼決定的（#95 的阻斷級 ②b）。
 *
 * ── 修的是什麼 ──────────────────────────────────────────────────────
 *
 * `.env.example` 教人用 `BFF_ORIGIN` 指定 dev proxy 的目標，而 proxy 設定
 * 讀的是 `process.env` —— `.env` 的值只進到 `loadEnv` 回傳的區域變數 `env`，
 * 從來沒有人讀它。症狀是：照文件在 `.env` 寫了 `BFF_ORIGIN`，**什麼都沒發生**，
 * 而且沒有任何錯誤訊息。採用演練就在這裡多繞了一圈。
 *
 * 只改文件的話，等於把一個 bug 寫成規格。所以修的是實作。
 *
 * ── 這支測試為什麼要 chdir ──────────────────────────────────────────
 *
 * 因為 `loadEnv(mode, process.cwd(), "")` 的 envDir 就是工作目錄，
 * 而 `.env` 是被 `.gitignore` 排掉的（`!.env.example` 是唯一的例外）——
 * 放不進版控就代表 CI 上量到的會是另一件事。所以 `.env` 由測試自己
 * 在暫存目錄裡寫出來，值取一個**不可能是預設值**的字串。
 *
 * ── 為什麼 D8 的機密閘門也在這支檔裡 ────────────────────────────────
 *
 * `vite.config.ts:13` 的 `assertNoUndeclaredEnv(env)` 是 D8 唯一的編譯期防線，
 * 而它在全樹**只有這一個呼叫端**。`platform/config` 那五條測試手工餵物件給
 * 那支純函式，證明的是「訊息說得對」；把 `vite.config.ts:13` 整行刪掉，
 * 那五條全綠、底下三條 proxy 也全綠（它們只讀 `proxy["/api"].target`，
 * 而暫存 cwd 的 `.env` 只有 `BFF_ORIGIN=`，那道閘門在那條路上永遠不會開火）。
 * 絆線要掛在被守的對象上 —— 對象是**呼叫端**，所以測試在這裡。
 *
 * 兩組共用的是同一件事：**在一個受控的暫存 cwd 底下跑一次那個 factory**。
 * 拆成第三支檔的話，`mkdtempSync` ＋ `chdir` ＋ `afterEach` 還原這一套要再抄一份
 * （`apps/*` 不依賴 `tools/*`，收不進 `@org/gate-kit/testing`）。
 */

const DEFAULT_TARGET = "http://localhost:8080";

const originalCwd = process.cwd();
const originalOrigin = process.env["BFF_ORIGIN"];

afterEach(() => {
  process.chdir(originalCwd);
  if (originalOrigin === undefined) delete process.env["BFF_ORIGIN"];
  else process.env["BFF_ORIGIN"] = originalOrigin;
});

interface ConsoleConfig {
  readonly server: { readonly proxy: Record<string, { readonly target: string }> };
}

/**
 * 在一個只寫了指定 `.env` 內容的暫存工作目錄裡，跑一次 `vite.config.ts` 的 factory。
 * 例外原樣往外傳 —— D8 那組要的正是它。
 */
async function runConfigFactory(dotEnv?: string): Promise<ConsoleConfig> {
  const dir = mkdtempSync(join(tmpdir(), "console-vite-config-"));
  if (dotEnv !== undefined) writeFileSync(join(dir, ".env"), dotEnv);

  process.chdir(dir);

  const factory = (await import("../vite.config.ts")).default as (context: {
    mode: string;
    command: string;
  }) => ConsoleConfig;

  return factory({ mode: "development", command: "serve" });
}

/** 在一個只有指定內容的暫存工作目錄裡，問 vite.config.ts 算出來的 proxy target。 */
async function proxyTarget(given: {
  readonly dotEnv?: string;
  readonly processEnv?: string;
}): Promise<string> {
  if (given.processEnv === undefined) delete process.env["BFF_ORIGIN"];
  else process.env["BFF_ORIGIN"] = given.processEnv;

  const config = await runConfigFactory(
    given.dotEnv === undefined ? undefined : `BFF_ORIGIN=${given.dotEnv}\n`,
  );
  return config.server.proxy["/api"]?.target ?? "";
}

describe("dev proxy 的 /api 目標", () => {
  it("★ `.env` 裡的 BFF_ORIGIN 會生效", async () => {
    // 這正是演練撞到的那一格：`.env.example` 教的用法，實際上沒有作用。
    expect(await proxyTarget({ dotEnv: "http://from-dot-env:9001" })).toBe(
      "http://from-dot-env:9001",
    );
  });

  it("★ 真的環境變數仍然覆寫 `.env`", async () => {
    // 順序不能反：CI 與「臨時指去別的 gateway」用的都是真的環境變數，
    // 而 `.env` 是躺在磁碟上的預設值。
    expect(
      await proxyTarget({ dotEnv: "http://from-dot-env:9001", processEnv: "http://real-env:9002" }),
    ).toBe("http://real-env:9002");
  });

  it("兩邊都沒有時，退回 @org/bff-mock 的預設埠", async () => {
    expect(await proxyTarget({})).toBe(DEFAULT_TARGET);
  });
});

/**
 * D8 的編譯期機密閘門，在**它真正會壞的那一格**上。
 *
 * 會壞的樣子有三種，三種在這裡都會紅：`vite.config.ts:13` 那行被刪掉、
 * 被一個 early return 繞過、或者 `loadEnv` 的 prefix 從 `""` 改成 `"VITE_"`
 * （改了之後 `.env` 裡的非 VITE_ 值就不進 `env`，而那會順手改掉 proxy 那組的答案）。
 */
describe("D8：未宣告的 VITE_ 變數讓建置失敗", () => {
  it("🔴 `.env` 裡有未宣告的 VITE_ 變數 → factory 丟例外，訊息點名它與 PUBLIC_ENV_KEYS", async () => {
    // 不用「有沒有丟」判 —— 同一格可以被別的東西弄紅。要的是訊息說得出是誰。
    await expect(runConfigFactory("VITE_NOT_DECLARED=x\n")).rejects.toThrow(
      /VITE_NOT_DECLARED[\s\S]*PUBLIC_ENV_KEYS/,
    );
  });

  it("★ 對照：已宣告的那一個不丟 —— 否則上面那條紅得跟這道閘門無關", async () => {
    const config = await runConfigFactory("VITE_APP_TITLE=Console\n");
    expect(config.server.proxy["/api"]?.target).toBe(DEFAULT_TARGET);
  });

  /**
   * ⚠️ `.env.example:8-9` 寫「這裡新增任何一筆，都必須同步加進 PUBLIC_ENV_KEYS，
   * 否則建置會失敗」。那句話在此之前**沒有任何東西在守**：`loadEnv` 讀的是
   * `.env`，在 `.env.example` 加一個 `VITE_FOO` 建置不會失敗，而 `doc-facts`
   * 看不到 `.env.example`。這一條讓那句散文變成真的。
   */
  it("★ `.env.example` 裡每一個 VITE_ key 都已經宣告", () => {
    const example = readFileSync(join(import.meta.dirname, "../.env.example"), "utf8");
    const keys = example
      .split("\n")
      .filter((line) => line.startsWith("VITE_"))
      .map((line) => line.slice(0, line.indexOf("=")));

    expect(
      keys.length,
      "一個 VITE_ key 都沒解析到 —— 解析式失效了，不是檔案裡沒有",
    ).toBeGreaterThan(0);
    expect(() =>
      assertNoUndeclaredEnv(Object.fromEntries(keys.map((key) => [key, "x"]))),
    ).not.toThrow();
  });
});
