import { describe, it, expect } from "vitest";

import { startBffMock, type BffMockRoute, type RunningBffMock } from "../src/index.ts";
import { CSRF_COOKIE, CSRF_HEADER, DEFAULT_SESSION_COOKIE } from "@org/bff-contract";

/**
 * 資料端點的注入接縫（v1 採用演練的阻斷級發現 ②a，#95）。
 *
 * ── 這組測試守的是什麼 ──────────────────────────────────────────────
 *
 * 演練撞到的是：新切片沒有資料端點，而補的位置在 `platform/` ——
 * 一個採用團隊不准改的地方。接縫本身好寫，難的是它**不可以順便**
 * 開出第二條路：
 *
 *   注入的路由若落在 `session === undefined → 401` 之前，這個 mock
 *   就變成「不用登入也拿得到資料」，而它存在的全部理由正是證明
 *   D8 那條路徑（登入 → 帶 cookie → 被 CSRF 擋 → 補標頭 → 通過）走得通。
 *
 * 所以底下標 ★ 的那幾條不是覆蓋率，它們是這道接縫的驗收條件本身。
 */

/** 起一個只有這支測試在用的 mock（port 0 讓 OS 配，避免撞 8080 上的東西）。 */
async function withMock(
  options: Parameters<typeof startBffMock>[1],
  body: (mock: RunningBffMock) => Promise<void>,
): Promise<void> {
  const mock = await startBffMock(0, options);
  try {
    await body(mock);
  } finally {
    await mock.close();
  }
}

/** 登入一次，回傳之後每個請求要帶的 cookie 標頭與 CSRF token。 */
async function signIn(origin: string): Promise<{ cookie: string; csrfToken: string }> {
  const response = await fetch(`${origin}/api/session`, { method: "POST" });
  const jar = new Map<string, string>();
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return {
    cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    csrfToken: jar.get(CSRF_COOKIE) ?? "",
  };
}

const customers: BffMockRoute[] = [
  {
    path: "/api/customer",
    handle: ({ query }) => {
      const keyword = query.get("q") ?? "";
      return { body: { items: [{ id: "C-1", keyword }], total: 1 } };
    },
  },
  {
    method: "POST",
    path: "/api/customer",
    handle: ({ body }) => ({ status: 201, body: { created: body } }),
  },
  {
    method: "PUT",
    path: "/api/customer/:id",
    handle: ({ params, permissions }) => ({ body: { id: params.id, permissions } }),
  },
];

describe("注入的資料端點", () => {
  it("命中之後回傳自己宣告的內容，query 拿得到", async () => {
    await withMock({ routes: customers }, async (mock) => {
      const { cookie } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/customer?q=%E6%9E%97`, {
        headers: { cookie },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ items: [{ id: "C-1", keyword: "林" }], total: 1 });
    });
  });

  it("★ 沒有 session 時回 401，而不是命中路由", async () => {
    // 這一條是整道接縫的重點。放行的話，這個 mock 就同時是一條
    // 「不用登入就拿得到資料」的路 —— 而 D8 的整條路徑就再也沒有被走過。
    await withMock({ routes: customers }, async (mock) => {
      const response = await fetch(`${mock.origin}/api/customer`);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthenticated" });
    });
  });

  it("★ 契約端點蓋不掉", async () => {
    // 注入的路由可以覆寫示範資料，但 session／CSRF／401／403 那幾條是
    // `@org/bff-contract` 在驗的東西。蓋得掉的話，一份「通過契約」的
    // 參考實作可以被一行設定改成不通過，而契約測試不會知道。
    const hijack: BffMockRoute[] = [
      { path: "/api/session", handle: () => ({ body: { hijacked: true } }) },
    ];

    await withMock({ routes: hijack }, async (mock) => {
      const { cookie } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/session`, { headers: { cookie } });

      expect(await response.json()).toMatchObject({ authenticated: true });
    });
  });

  it("★ 非安全方法一樣要過 CSRF", async () => {
    await withMock({ routes: customers }, async (mock) => {
      const { cookie } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/customer`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "林佳蓉" }),
      });

      expect(response.status).toBe(403);
    });
  });

  it("帶了 CSRF 標頭之後，POST 的 JSON body 解析得到", async () => {
    await withMock({ routes: customers }, async (mock) => {
      const { cookie, csrfToken } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/customer`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json", [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ name: "林佳蓉" }),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ created: { name: "林佳蓉" } });
    });
  });

  it("路徑參數取得到，處理器也看得到這個 session 的權限碼", async () => {
    await withMock({ routes: customers, extraPermissions: ["customer:write"] }, async (mock) => {
      const { cookie, csrfToken } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/customer/C-1001`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json", [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({}),
      });

      const payload = (await response.json()) as { id: string; permissions: string[] };
      expect(payload.id).toBe("C-1001");
      expect(payload.permissions).toContain("customer:write");
    });
  });

  it("沒有命中任何注入路由時，示範資料仍在", async () => {
    await withMock({ routes: customers }, async (mock) => {
      const { cookie } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/orders`, { headers: { cookie } });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ total: 4 });
    });
  });

  it("處理器丟例外時回 500，而且訊息說得出是哪一條路由", async () => {
    // 安靜地變成 404 的話，寫路由的人會去查路徑對不對 —— 而路徑是對的。
    const broken: BffMockRoute[] = [
      {
        path: "/api/broken",
        handle: () => {
          throw new Error("處理器自己炸了");
        },
      },
    ];

    await withMock({ routes: broken }, async (mock) => {
      const { cookie } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/broken`, { headers: { cookie } });

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).toContain("/api/broken");
    });
  });
});

describe("權限碼的注入", () => {
  it("★ 預設值不含 admin —— 契約要驗 401 與 403 確實分開", async () => {
    // 這一條釘住的是**預設值**，不是合併語意。契約測試呼叫的是無參數的
    // startBffMock()，admin 一旦進了預設清單，403 那條就永遠驗不到。
    await withMock(undefined, async (mock) => {
      const { cookie } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/admin/ping`, { headers: { cookie } });

      expect(response.status).toBe(403);
    });
  });

  it("★ 是追加，不是取代", async () => {
    // 取代的話，採用團隊加一片切片就得把示範切片的權限碼重列一次 ——
    // 而漏列的症狀是示範切片安靜地壞掉，沒有東西會說話。
    await withMock({ extraPermissions: ["customer:read"] }, async (mock) => {
      const response = await fetch(`${mock.origin}/api/session`, { method: "POST" });
      const payload = (await response.json()) as { permissions: string[] };

      expect(payload.permissions).toContain("customer:read");
      expect(payload.permissions).toContain("order:read");
      expect(payload.permissions).toContain("shipment:read");
    });
  });

  it("追加的權限碼在 session 查詢裡也看得到", async () => {
    await withMock({ extraPermissions: ["customer:read"] }, async (mock) => {
      const { cookie } = await signIn(mock.origin);
      const response = await fetch(`${mock.origin}/api/session`, { headers: { cookie } });
      const payload = (await response.json()) as { permissions: string[] };

      expect(payload.permissions).toContain("customer:read");
    });
  });

  it("session cookie 的名字仍由 sessionCookie 決定（注入沒有動到它）", async () => {
    await withMock({ routes: customers }, async (mock) => {
      const response = await fetch(`${mock.origin}/api/session`, { method: "POST" });
      const cookies = response.headers.getSetCookie().join("; ");

      expect(cookies).toContain(`${DEFAULT_SESSION_COOKIE}=`);
    });
  });
});
