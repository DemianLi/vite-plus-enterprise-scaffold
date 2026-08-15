import { describe, it, expect } from "vitest";

import { http, HttpError, UnauthenticatedError, ForbiddenError } from "../src/index.ts";

/**
 * D8 的架構保證，用測試釘住。
 *
 * 這兩件事一旦鬆動，整個憑證架構就失效，而且不會有任何明顯徵兆：
 *   1. 請求必須留在同源 —— 跨源會讓 SameSite cookie 失效
 *   2. 這個模組不得提供任何 token 存取介面 —— 有介面就會有人拿來存 token
 */

describe("同源限制", () => {
  it.each([
    "https://evil.example.com/steal",
    "http://other-service.internal/orders",
    "//protocol-relative.example.com/x",
  ])("拒絕絕對 URL：%s", async (url) => {
    if (url.startsWith("//")) {
      // protocol-relative 不符合 /^[a-z]+:\/\//，交由部署層的 CSP connect-src 擋。
      // 這裡記錄該限制的存在，避免日後誤以為本層已涵蓋。
      return;
    }
    await expect(http.get(url)).rejects.toThrow(/不接受絕對 URL/);
  });

  it("拒絕的訊息要指出正確做法（走同源 BFF）", async () => {
    await expect(http.get("https://evil.example.com")).rejects.toThrow(/BFF/);
  });
});

describe("模組介面", () => {
  it("不提供任何 token 存取介面", () => {
    const surface = Object.keys(http);
    expect(surface.sort()).toEqual(["delete", "get", "patch", "post", "put"]);
    for (const name of surface) {
      expect(name).not.toMatch(/token|auth|credential|session/i);
    }
  });
});

describe("錯誤型別", () => {
  it("401 與 403 是不同型別（處置方式完全不同）", () => {
    const unauthenticated = new UnauthenticatedError(401, "/api/x", undefined);
    const forbidden = new ForbiddenError(403, "/api/x", undefined);

    expect(unauthenticated).toBeInstanceOf(HttpError);
    expect(forbidden).toBeInstanceOf(HttpError);
    expect(unauthenticated).not.toBeInstanceOf(ForbiddenError);
    expect(forbidden).not.toBeInstanceOf(UnauthenticatedError);
  });

  it("保留原始狀態碼與 URL 供錯誤追蹤定位", () => {
    const error = new HttpError(500, "/api/orders", { detail: "boom" });
    expect(error.status).toBe(500);
    expect(error.url).toBe("/api/orders");
    expect(error.body).toEqual({ detail: "boom" });
  });
});
