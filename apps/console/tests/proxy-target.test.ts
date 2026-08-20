import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
 */

const DEFAULT_TARGET = "http://localhost:8080";

const originalCwd = process.cwd();
const originalOrigin = process.env["BFF_ORIGIN"];

afterEach(() => {
  process.chdir(originalCwd);
  if (originalOrigin === undefined) delete process.env["BFF_ORIGIN"];
  else process.env["BFF_ORIGIN"] = originalOrigin;
});

/** 在一個只有指定內容的暫存工作目錄裡，問 vite.config.ts 算出來的 proxy target。 */
async function proxyTarget(given: {
  readonly dotEnv?: string;
  readonly processEnv?: string;
}): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "console-bff-origin-"));
  if (given.dotEnv !== undefined) writeFileSync(join(dir, ".env"), `BFF_ORIGIN=${given.dotEnv}\n`);

  process.chdir(dir);
  if (given.processEnv === undefined) delete process.env["BFF_ORIGIN"];
  else process.env["BFF_ORIGIN"] = given.processEnv;

  const factory = (await import("../vite.config.ts")).default as (context: {
    mode: string;
    command: string;
  }) => { server: { proxy: Record<string, { target: string }> } };

  const config = factory({ mode: "development", command: "serve" });
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
