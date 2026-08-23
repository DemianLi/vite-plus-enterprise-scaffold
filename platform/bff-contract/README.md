# @org/bff-contract

D8 那一層同源中間層的**可執行契約**。這個 package 是 R6 的答案。

## R6 原本卡在哪

D8 選了 BFF + httpOnly cookie，但腳手架裡沒有 BFF —— 那一層是組織既有的
gateway。R6 因此一直卡在一個**組織問題**上：

> 你們到底有沒有一個能設 cookie 的同源中間層？

程式碼回答不了這個問題。但它能回答另一個：**那一層必須做到什麼，才算滿足 D8。**

所以這裡不寫實作，寫規格 —— 而且是跑得起來的規格。兩條路徑共用同一套斷言：

| 情況         | 做法                                                       | 結果                                |
| ------------ | ---------------------------------------------------------- | ----------------------------------- |
| 已有 gateway | 把測試指向它                                               | 全綠 ＝ R6 關閉，**不需要新程式碼** |
| 沒有 gateway | 這份規格就是驗收條件，`@org/bff-mock` 是已通過它的參考實作 | 知道要蓋什麼，以及蓋完怎麼證明      |

## 跑法

> ⚠️ **這一版沒有驗收器。** 交付的是契約本身與 `@org/bff-mock` 這個已通過它的
> 參考實作 —— 把下面這些條目跑成一套測試，是要驗收真實 gateway 的案子自己要做的事。
> 下面那組 env 就是為了讓那套測試指得過去。

可覆寫的 env：`BFF_ORIGIN`、`BFF_SESSION_COOKIE`、`BFF_LOGIN_PATH`、`BFF_LOGOUT_PATH`、
`BFF_SESSION_PATH`、`BFF_PROBE_PATH`、`BFF_ADMIN_PROBE_PATH`、`BFF_SESSION_VALUE`、
`BFF_CSRF_VALUE`、`BFF_SET_COOKIE_FILE`。

**驗收既有 gateway 時改的是 env，不是測試程式碼。** 一旦要改測試才能過，
那份測試就不再是契約，而是實作的鏡子。

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
前端就再也讀不到值，所有寫入請求全部失敗。這條斷言存在的唯一理由就是攔下這個直覺。
double-submit 的原理是「前端讀得到、跨站的攻擊者讀不到」，可讀是設計的一部分。

**`logout-server-side`** —— 測試會拿**登出後的舊 cookie 再打一次**。
只清 cookie 的實作在這裡會被抓到：瀏覽器會乖乖忘記，攻擊者不會。

**`401-unauthenticated`** —— fetch 預設會跟隨轉址，所以「回了 302 登入頁」
會被偽裝成 200。契約用 `redirect: "manual"` 打破這個偽裝。

## 哪些能換、哪些不能

**不能換**：`XSRF-TOKEN` / `X-XSRF-TOKEN` 這兩個名字。
`@org/http-client` 直接從本 package 匯入它們 —— 前端與中間層對不上，
每個非 GET 請求都會 403，而且是上線當天才發現。名字由雙方 import 同一份定義，
是唯一不會漂移的做法（同一個道理見 `@org/security-headers` 之於 CSP）。

**能換**：session cookie 的**名字**（各家 gateway 有自己的慣例）、以及各端點路徑。
不能換的是 session cookie 的**屬性**與 CSRF 的語意。

## 對真實 gateway 的誠實限制

`POST /api/session` 在真實環境是 OIDC 授權碼流程的終點，**無法**用一支測試自動走完。
所以驗收既有 gateway 時分兩半：

- **行為面**（401／403／CSRF／登出失效）：用 `BFF_SESSION_VALUE` 帶一組真實 session 跑
- **屬性面**（HttpOnly／Secure／SameSite）：用 `BFF_SET_COOKIE_FILE` 指向一個文字檔，
  貼上 gateway 登入時實際回的 `Set-Cookie` 標頭（每行一條）

把限制寫成兩個 env，比假裝測試能自動化整條 OIDC 流程要誠實得多 ——
後者的結果是那份測試永遠是紅的，然後被人加上 skip。

## 這份契約有牙齒嗎

有實測過。逐一破壞 `@org/bff-mock` 的七個地方，**每一個都讓對應條目變紅**：

拿掉 session 的 `HttpOnly` ／ `SameSite` 改成 `None` ／ 給 CSRF cookie 加上 `HttpOnly` ／
不檢查 CSRF 標頭 ／ 登出只清 cookie 不刪伺服器端 session ／ 權限不足回 401 而非 403 ／
不送安全標頭。

綠燈不證明機制有效，只有「該紅的時候會紅」才證明。
