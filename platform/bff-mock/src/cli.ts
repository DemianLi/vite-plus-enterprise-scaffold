#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describeContract } from "@org/bff-contract";
import { startBffMock, type BffMockOptions, type BffMockRoute } from "./server.ts";

/**
 * 開發用 BFF mock 的獨立執行入口。
 *
 *     node platform/bff-mock/src/cli.ts        # 監聽 8080，對上 dev proxy 的預設 target
 *     BFF_MOCK_PORT=9000 node ...              # 換埠
 *     BFF_MOCK_ROUTES=apps/console/bff-routes.ts node ...   # 掛上應用自己的資料端點
 *
 * 刻意**不**做成 vite plugin 塞進 dev server：D8 要求 dev 的來源配置鏡像
 * production。production 是「SPA 與 BFF 同源、由 proxy 前綴分流」，
 * 那就必須真的有一個獨立行程在 proxy 的另一端，否則本機驗證的是一個
 * production 不存在的拓撲 —— 而認證是最不能靠「上線再說」的東西。
 *
 * ── 為什麼路徑走環境變數，而不是約定的位置 ──────────────────────────
 *
 * 約定成 `apps/<app>/bff-routes.ts` 會讓 `platform/` 知道 `apps/` 的長相，
 * 而 `SCOPE.md` 說各案會把 `apps/` **整個換掉** —— platform 依賴一個
 * 承諾會被換掉的東西，方向是反的。`BFF_MOCK_PORT` 已經立下同一個慣例。
 * 這個 repo 自己的接法寫在根 `package.json` 的 `bff` script 裡。
 */

const port = Number(process.env["BFF_MOCK_PORT"] ?? 8080);

/**
 * 載入應用端宣告的路由。
 *
 * ⚠️ **失敗一律丟例外，不退回「就當作沒有路由」。** 退回去的話，
 * 打錯一個檔名的症狀是伺服器正常啟動、畫面全部 404 —— 而人會去查
 * 前端的 URL 對不對。這與 `tools/scope-check` 找不到 git 時的選擇同一條理由：
 * 一個「出事就安靜換個比較寬鬆的行為」的東西，會在最需要它的時候閉嘴。
 */
async function loadRoutes(specifier: string): Promise<BffMockOptions> {
  const absolute = resolve(process.cwd(), specifier);

  if (!existsSync(absolute)) {
    throw new Error(
      `\n[@org/bff-mock] BFF_MOCK_ROUTES 指向 ${absolute}，但那裡沒有檔案。\n\n` +
        "  路徑是相對於執行時的工作目錄解析的（這個 repo 從根目錄跑 `vpr bff`）。\n",
    );
  }

  let loaded: Record<string, unknown>;
  try {
    // Tier 2 的 no-unsanitized/method 會標記動態 import，而它是對的 ——
    // 一般情況下動態 import 是任意程式碼執行的入口。
    //
    // 此處的豁免理由：路徑來自開發者自己設定的環境變數（與 BFF_MOCK_PORT
    // 同一條慣例）、上面已用 existsSync 確認存在，而這支 CLI 是 dev-only、
    // 永不進入瀏覽器 bundle，且它啟動的伺服器預設拒絕在 NODE_ENV=production 執行。
    //
    // 註：disable 指令必須**單獨成行且緊貼**目標程式碼（見 tools/codemods/run.ts）。
    // eslint-disable-next-line no-unsanitized/method
    loaded = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `\n[@org/bff-mock] BFF_MOCK_ROUTES 指向 ${absolute}，但載入失敗：\n\n  ${reason}\n\n` +
        "  路徑是相對於執行時的工作目錄解析的（這個 repo 從根目錄跑 `vpr bff`）。\n",
    );
  }

  const routes = loaded["routes"];
  if (!Array.isArray(routes)) {
    throw new Error(
      `\n[@org/bff-mock] ${absolute} 沒有具名匯出 \`routes\`。\n\n` +
        "  預期的形狀：\n\n" +
        "    export const routes = [\n" +
        '      { path: "/api/customer", handle: () => ({ body: { items: [] } }) },\n' +
        "    ] satisfies readonly BffMockRoute[];\n\n" +
        "  另可具名匯出 `extraPermissions`（追加到 mock session 的權限碼）。\n",
    );
  }

  // 形狀在這裡驗，因為宣告路由的那個檔案通常不 import 這個套件的型別
  // （理由見 apps/console/bff-routes.ts 的檔頭）。少了這一段，寫錯的症狀
  // 是啟動成功、那條路由安靜地不存在 —— 而人會去查前端的 URL。
  for (const [index, route] of routes.entries()) {
    const shape = route as Partial<BffMockRoute>;
    const problem =
      typeof shape.path !== "string"
        ? "缺少 `path`（字串）"
        : typeof shape.handle !== "function"
          ? "缺少 `handle`（函式）"
          : undefined;
    if (problem !== undefined) {
      throw new Error(
        `\n[@org/bff-mock] ${absolute} 的第 ${index + 1} 條路由${problem}。\n\n` +
          '  一條路由長這樣：{ method?: "POST", path: "/api/customer/:id", handle: (request) => ({ body }) }\n',
      );
    }
  }

  const extraPermissions = loaded["extraPermissions"];
  return {
    routes: routes as readonly BffMockRoute[],
    ...(Array.isArray(extraPermissions)
      ? { extraPermissions: extraPermissions as readonly string[] }
      : {}),
  };
}

const routesSpecifier = process.env["BFF_MOCK_ROUTES"];
const injected = routesSpecifier === undefined ? {} : await loadRoutes(routesSpecifier);

const mock = await startBffMock(port, injected);

console.log(`[bff-mock] ${mock.origin}\n`);

// 印出來的目的是給人一個**對照物**：載入的路由與預期不符時，這裡是唯一
// 看得出來的地方（症狀否則是畫面 404，而人會去查前端的 URL）。
if (routesSpecifier === undefined) {
  console.log("應用端路由：無（設 BFF_MOCK_ROUTES 掛上，例如 apps/console/bff-routes.ts）\n");
} else {
  const injectedRoutes = injected.routes ?? [];
  console.log(`應用端路由（${routesSpecifier}）：`);
  for (const route of injectedRoutes) {
    console.log(`  ${(route.method ?? "GET").toUpperCase()} ${route.path}`);
  }
  const extra = injected.extraPermissions ?? [];
  if (extra.length > 0) console.log(`  追加的權限碼：${extra.join("、")}`);
  console.log("");
}

console.log("實作的契約條目（@org/bff-contract）：");
console.log(describeContract());
console.log(
  "\n⚠️ 這不是認證伺服器：沒有 OIDC、沒有使用者目錄、session 存在記憶體裡。\n" +
    "   production 請用組織的 gateway，並用契約測試驗收它：\n" +
    "     BFF_ORIGIN=https://gateway.internal vp run -F @org/bff-contract test\n",
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void mock.close().then(() => process.exit(0));
  });
}
