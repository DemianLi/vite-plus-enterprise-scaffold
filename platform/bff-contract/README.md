# @org/bff-contract

同源中間層（BFF）的契約：前端與中間層共用的名稱，以及那一層必須做到的條目。

## 為什麼是契約，不是實作

前端的認證走 BFF + httpOnly cookie，但那一層不在本 repo —— 它是組織既有的
gateway。這就帶出一個**組織問題**：

> 你們到底有沒有一個能設 cookie 的同源中間層？

程式碼回答不了這個問題。但它能回答另一個：**那一層必須做到什麼，才算合格。**

| 情況         | 做法                           | 結果                             |
| ------------ | ------------------------------ | -------------------------------- |
| 已有 gateway | 逐條對照下面的條目             | 全部做得到 ＝ **不需要新程式碼** |
| 沒有 gateway | 這些條目就是要蓋的那一層的要求 | 知道要蓋什麼                     |

## 契約條目

| id                        | 要求                                                      |
| ------------------------- | --------------------------------------------------------- |
| `same-origin`             | 所有端點在與 SPA 同源的 `/api` 前綴下                     |
| `401-unauthenticated`     | 未帶有效 session 回 **401**，不是 302、不是 200 空內容    |
| `403-forbidden`           | 已登入但權限不足回 **403**，與 401 明確分開               |
| `session-cookie-httponly` | session cookie 具備 `HttpOnly` ＋ `Secure`                |
| `session-cookie-samesite` | `SameSite` 為 `Lax` 或 `Strict`（`None` 判不合格）        |
| `session-cookie-path`     | `Path=/`（限縮 Path 會讓登出漏掉其他路徑下的同名 cookie） |
| `csrf-cookie-readable`    | `XSRF-TOKEN` **不得** `HttpOnly`                          |
| `csrf-required`           | 非安全方法缺少 `X-XSRF-TOKEN` 回 403                      |
| `csrf-mismatch`           | `X-XSRF-TOKEN` 與 cookie 不符回 403                       |
| `csrf-accepted`           | 相符時放行                                                |
| `logout-server-side`      | 登出後舊 session cookie **重放無效**（伺服器端已刪除）    |
| `security-headers`        | 回應帶 `@org/security-headers` 定義的標頭                 |
| `csp-on-document`         | HTML 文件回應帶 CSP，涵蓋全部基礎指令                     |

三條最容易被實作漏掉的：

**`csrf-cookie-readable`** —— 有人出於直覺給 `XSRF-TOKEN` 加上 `HttpOnly`，
前端就再也讀不到值，所有寫入請求全部失敗。這一條存在的唯一理由就是攔下這個直覺。
double-submit 的原理是「前端讀得到、跨站的攻擊者讀不到」，可讀是設計的一部分。

**`logout-server-side`** —— 拿**登出後的舊 cookie 再打一次**，必須失敗。
只清 cookie 的實作在這裡過不了：瀏覽器會乖乖忘記，攻擊者不會。

**`401-unauthenticated`** —— fetch 預設會跟隨轉址，所以「回了 302 登入頁」
會被偽裝成 200。對照這一條時要關掉轉址跟隨（`redirect: "manual"`）才看得到真正的狀態碼。

## 哪些能換、哪些不能

**不能換**：`XSRF-TOKEN` / `X-XSRF-TOKEN` 這兩個名字。
`@org/http-client` 直接從本 package 匯入它們 —— 前端與中間層對不上，
每個非 GET 請求都會 403，而且是上線當天才發現。名字由雙方 import 同一份定義，
是唯一不會漂移的做法（同一個道理見 `@org/security-headers` 之於 CSP）。

**能換**：session cookie 的**名字**（各家 gateway 有自己的慣例）、以及各端點路徑。
不能換的是 session cookie 的**屬性**與 CSRF 的語意。
