import { describe, it, expect } from "vitest";

import { assertNoUndeclaredEnv } from "../src/index.ts";

/**
 * D8 的核心防線：機密不得被編譯進 bundle。
 *
 * 這組測試存在的理由很直接 —— 如果這個閘門壞了，沒有人會發現，
 * 直到有人在 production 的 JS 檔裡撿到 API key。
 */

describe("VITE_ 環境變數的公開性閘門", () => {
  it("放行已宣告的公開設定", () => {
    expect(() =>
      assertNoUndeclaredEnv({
        VITE_APP_TITLE: "Console",
        VITE_API_BASE_PATH: "/api",
        VITE_BUILD_SHA: "abc123",
      }),
    ).not.toThrow();
  });

  it("忽略沒有 VITE_ 前綴的變數（那些不會進 bundle）", () => {
    expect(() =>
      assertNoUndeclaredEnv({ BFF_ORIGIN: "http://localhost:8080", NODE_ENV: "production" }),
    ).not.toThrow();
  });

  it.each([
    "VITE_API_SECRET",
    "VITE_AUTH_TOKEN",
    "VITE_PRIVATE_KEY",
    "VITE_DB_PASSWORD",
    "VITE_STRIPE_APIKEY",
    "VITE_SERVICE_CREDENTIAL",
  ])("擋下一望即知是機密的命名：%s", (key) => {
    expect(() => assertNoUndeclaredEnv({ [key]: "x" })).toThrow(/機密/);
  });

  it("機密的錯誤訊息要指出正確做法（改走 BFF），而不只是說不行", () => {
    expect(() => assertNoUndeclaredEnv({ VITE_API_SECRET: "x" })).toThrow(/BFF/);
  });

  it("擋下未宣告的 VITE_ 變數，即使看起來人畜無害", () => {
    expect(() => assertNoUndeclaredEnv({ VITE_FEATURE_FLAG_X: "1" })).toThrow(
      /未在 platform\/config/,
    );
  });

  it("一次回報全部問題，而不是修一個才發現下一個", () => {
    let message = "";
    try {
      assertNoUndeclaredEnv({ VITE_API_SECRET: "x", VITE_UNDECLARED: "y", VITE_TOKEN: "z" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("VITE_API_SECRET");
    expect(message).toContain("VITE_UNDECLARED");
    expect(message).toContain("VITE_TOKEN");
  });
});
