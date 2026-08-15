#!/usr/bin/env node
import { createServer, request as httpRequest } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSecurityHeaders } from "@org/security-headers";

import {
  checkEvidence,
  currentFingerprint,
  evaluate,
  type EvidenceFile,
  type RawCapture,
} from "./evidence.ts";
import { buildProbeScript } from "./probe.ts";

/**
 * 用**正式的 CSP（enforce，非 report-only）**服務**正式的建置產物**。
 *
 * ── 為什麼不能用 `vp dev` 驗 CSP ────────────────────────────────────
 *
 * dev 模式下 Vue 的 SFC 樣式是由 JS **在執行期注入 `<style>` 元素**的
 *（HMR 需要它）。也就是說 dev 一定會踩 `style-src 'self'` ——
 * 那些 violation **在 production 完全不存在**。
 *
 * 拿 dev 驗 CSP 只會得到一堆假警報，然後第一件事就是有人把 securityHeaders
 * 外掛關掉。`securityHeaders()` 預設 report-only 正是為了這個。
 *
 * 所以真正的驗證只有一種形狀：**production 產物 ＋ production 政策 ＋ enforce**。
 *
 * ── 為什麼是 enforce 而不是 report-only ─────────────────────────────
 *
 * report-only 只會在 console 印訊息，畫面照常運作 —— 於是「有沒有壞掉」
 * 要靠人去讀 console。enforce 會**真的擋掉**，壞掉的東西看得見。
 * 這是驗收工具，不是開發時的提示。
 *
 * ── 這支工具驗得到什麼、驗不到什麼 ──────────────────────────────────
 *
 * 驗得到：載入、渲染、以及你在瀏覽器裡實際點過的互動路徑。
 * **驗不到沒被點到的元件** —— UiDialog 的 violation 只有在對話框真的打開時
 * 才會出現。`tools/ui-survey --csp` 的靜態探測與這支是互補的，不是重複的。
 *
 * ⚠️ 需要先建置：`vp run -F @org/console build`。
 *
 * ── 四種模式 ────────────────────────────────────────────────────────
 *
 *   （無參數）        起驗證伺服器，人在瀏覽器裡驗
 *   --print-probe    印出探針腳本，貼進瀏覽器 console
 *   --record <json>  把探針的原始輸出寫成證據檔（通過與否由工具推導）
 *   --verify         CI 跑的：上一次驗證的前提有沒有變（見 src/evidence.ts）
 *
 * 前三個要人，最後一個不用。這個分工就是 D16 迭代軸的答案：
 * 人跑一次，機器守它的有效期。
 */

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const DIST = join(ROOT, "apps/console/dist");
const PORT = Number(process.env["CSP_VERIFY_PORT"] ?? 4173);
/**
 * BFF 的位置。D8 要求 BFF **與 SPA 同源**（走 /api 前綴），
 * 否則 SameSite cookie 形同虛設 —— 所以這裡代理而不是讓瀏覽器跨源打過去。
 * 跨源的話 connect-src 'self' 也會擋，而那是個假的 violation：
 * 正式環境根本不會跨源。
 */
const BFF_ORIGIN = process.env["BFF_ORIGIN"] ?? "http://localhost:8080";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// enforce，不是 report-only。理由見上面。
const HEADERS = buildSecurityHeaders({ reportOnly: false });

function resolveFile(urlPath: string): string | null {
  // 路徑穿越防護：正規化之後必須仍在 dist 內。
  // 這支工具只在本機跑，但一個「只在本機跑」的伺服器仍然是伺服器。
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(DIST, relative);
  if (!candidate.startsWith(DIST)) return null;

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  // SPA 後備：任何未命中的路徑都回 index.html，路由才走得起來。
  const fallback = join(DIST, "index.html");
  return existsSync(fallback) ? fallback : null;
}

const ARGV = process.argv.slice(2);
const LOCKFILE = join(ROOT, "pnpm-lock.yaml");

function flagValue(name: string, fallback: string): string {
  const at = ARGV.indexOf(name);
  if (at === -1) return fallback;
  const value = ARGV[at + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`${name} 後面要接一個檔案路徑`);
    process.exit(1);
  }
  return resolve(value);
}

const EVIDENCE_PATH = flagValue("--evidence", join(ROOT, "tools/csp-verify/evidence.json"));

/**
 * CI 跑的那一個：實測結果還算不算數。
 *
 * **它不驗 CSP** —— 驗 CSP 需要瀏覽器。它驗的是「上一次瀏覽器驗證的前提有沒有變」，
 * 也就是 D16 迭代軸要求的那件事：升級 reka-ui 或改 CSP 政策時，這道閘門會說話。
 */
function runVerify(): number {
  const expected = currentFingerprint(readFileSync(LOCKFILE, "utf8"));

  let file: EvidenceFile | null = null;
  if (existsSync(EVIDENCE_PATH)) {
    file = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8")) as EvidenceFile;
  }

  const problems = checkEvidence(file, expected);
  if (problems.length === 0) {
    console.log(
      `✓ CSP 實測證據有效（${file?.verifiedAt} 於 ${browserLabel(file?.browser ?? "")}）\n` +
        `  ${file?.probes.length} 個探針全數通過，政策與 ${
          Object.keys(expected.packages).length
        } 個受監控相依皆未變動。`,
    );
    return 0;
  }

  console.error(`✗ CSP 實測證據失效：${problems.length} 項\n`);
  for (const problem of problems) {
    console.error(`  [${problem.kind}] ${problem.detail}`);
  }
  console.error(
    "\n  重驗步驟（需要人開瀏覽器 —— 理由見 src/probe.ts）：\n" +
      "    1. ./node_modules/.bin/vp run -F @org/console build\n" +
      "    2. ./node_modules/.bin/vpr bff\n" +
      "    3. node tools/csp-verify/src/cli.ts            # 起驗證伺服器\n" +
      "    4. node tools/csp-verify/src/cli.ts --print-probe > /tmp/probe.js\n" +
      "       開 http://localhost:4173、登入，把 probe.js 貼進 console\n" +
      "    5. 把印出來的 JSON 存成 capture.json，然後：\n" +
      "       node tools/csp-verify/src/cli.ts --record capture.json",
  );
  return 1;
}

/** UA 字串太長，摘出瀏覽器與版本就夠人判斷了。 */
function browserLabel(userAgent: string): string {
  const match = /(Chrome|Firefox|Safari|Edg)\/(\d+)/.exec(userAgent);
  return match ? `${match[1]} ${match[2]}` : userAgent.slice(0, 40) || "未知瀏覽器";
}

/**
 * 把瀏覽器吐出來的原始觀測寫成證據檔。
 *
 * **通過與否由 `evaluate()` 從觀測推導，不接受人手寫。**
 * 少了這一層，證據檔就只是一份主張 —— 而主張不用開瀏覽器就寫得出來。
 */
function runRecord(capturePath: string): number {
  const capture = JSON.parse(readFileSync(capturePath, "utf8")) as RawCapture;
  const probes = evaluate(capture);
  const file: EvidenceFile = {
    verifiedAt: new Date().toISOString().slice(0, 10),
    browser: capture.userAgent,
    fingerprint: currentFingerprint(readFileSync(LOCKFILE, "utf8")),
    probes,
    capture,
  };

  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(file, null, 2)}\n`);

  for (const probe of probes) {
    console.log(`${probe.passed ? "✓" : "✗"} ${probe.id} —— ${probe.observed}`);
  }

  const failed = probes.filter((probe) => !probe.passed);
  console.log(`\n寫入 ${EVIDENCE_PATH}`);
  if (failed.length > 0) {
    // 刻意**還是把檔案寫出來**：一份記錄著失敗的證據檔，比沒有檔案更有用 ——
    // 它讓下一個人看得到失敗長什麼樣，而 --verify 依然會紅。
    console.error(`\n✗ ${failed.length} 個探針失敗 —— 證據已寫入，但 --verify 會擋下。`);
    return 1;
  }
  return 0;
}

function main(): number | null {
  if (ARGV.includes("--verify")) return runVerify();

  if (ARGV.includes("--print-probe")) {
    process.stdout.write(`${buildProbeScript()}\n`);
    return 0;
  }

  const recordAt = ARGV.indexOf("--record");
  if (recordAt !== -1) {
    const path = ARGV[recordAt + 1];
    if (path === undefined || path.startsWith("--")) {
      console.error("--record 後面要接探針輸出的 JSON 檔");
      return 1;
    }
    return runRecord(resolve(path));
  }

  if (!existsSync(DIST)) {
    console.error(
      `✗ 找不到建置產物：${DIST}\n` +
        "  先執行：./node_modules/.bin/vp run -F @org/console build\n" +
        "  這支工具刻意不自己觸發建置 —— 驗的必須是「將要部署的那一份」，\n" +
        "  而不是它順手產生的一份。",
    );
    return 1;
  }

  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url.startsWith("/api/")) {
      const target = new URL(url, BFF_ORIGIN);
      const proxied = httpRequest(
        {
          hostname: target.hostname,
          port: target.port,
          path: target.pathname + target.search,
          method: req.method,
          headers: req.headers,
        },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxied.on("error", () => {
        res.writeHead(502).end("BFF 沒有在聽。先啟動：./node_modules/.bin/vpr bff");
      });
      req.pipe(proxied);
      return;
    }

    const file = resolveFile(url.split("?")[0] ?? "/");
    if (file === null) {
      res.writeHead(404).end("not found");
      return;
    }

    for (const [name, value] of Object.entries(HEADERS)) {
      // 本機是 http，HSTS 會讓瀏覽器把這個 localhost port 記成強制 https，很難清。
      if (name === "Strict-Transport-Security") continue;
      res.setHeader(name, value);
    }
    res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });

  server.listen(PORT, () => {
    console.log(`CSP 驗證伺服器：http://localhost:${PORT}`);
    console.log("  產物：apps/console/dist");
    console.log("  政策：enforce（非 report-only），來自 @org/security-headers");
    console.log("\n  在瀏覽器 console 看 violation。**要實際點開對話框** ——");
    console.log("  沒被點到的元件不會產生 violation，而那正是最需要驗的那一個。\n");
  });

  // **不要 process.exit(0)。** 伺服器啟動成功之後這支程式要繼續活著 ——
  // 第一版寫成 process.exit(main())，於是 listen 才剛回呼就把自己殺掉，
  // 而 curl 只會得到「連線被拒」，看起來像埠沒開。
  return null;
}

const failure = main();
if (failure !== null) process.exit(failure);
