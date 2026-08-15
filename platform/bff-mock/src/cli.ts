#!/usr/bin/env node
import { describeContract } from "@org/bff-contract";
import { startBffMock } from "./server.ts";

/**
 * 開發用 BFF mock 的獨立執行入口。
 *
 *     node platform/bff-mock/src/cli.ts        # 監聽 8080，對上 dev proxy 的預設 target
 *     BFF_MOCK_PORT=9000 node ...              # 換埠
 *
 * 刻意**不**做成 vite plugin 塞進 dev server：D8 要求 dev 的來源配置鏡像
 * production。production 是「SPA 與 BFF 同源、由 proxy 前綴分流」，
 * 那就必須真的有一個獨立行程在 proxy 的另一端，否則本機驗證的是一個
 * production 不存在的拓撲 —— 而認證是最不能靠「上線再說」的東西。
 */

const port = Number(process.env["BFF_MOCK_PORT"] ?? 8080);
const mock = await startBffMock(port);

console.log(`[bff-mock] ${mock.origin}\n`);
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
