# 採用指南 —— v1.0.0

> 這份文件給**要用這個腳手架開案子的團隊**。
> 它回答三件事：開工前要做什麼、v1.0.0 承諾什麼、以及**它刻意不承諾什麼**。

---

## 開工前唯一必做的一件事

### 把 `CODEOWNERS` 的 `@org/*` 換成真的團隊

```bash
grep -n "@org/" CODEOWNERS
```

⚠️ **在換掉之前，D12 的擁有權治理是一份文字檔，完全沒有生效。**

`CODEOWNERS` 裡的 16 條條目全部是佔位符（`@org/team-fulfillment`、
`@org/platform-maintainers` 之類）。GitHub 對不存在的團隊**不會報錯** ——
它只是不指派任何審查者。症狀是：`platform/` 的破壞性變更 PR 開下去，
沒有人被通知，而分支保護那一格顯示「已滿足」。

**每 fork 一次做一次。** 這不是一次性的專案設定，是每個案子的第一步。

> ⚠️ 換完之後還有兩層落差（分支保護要求幾人核准、同一列多個 owner 是
> 「任一核准」而不是共簽）。那兩層是 GitHub repo 設定，不在程式碼裡 ——
> 改完 `CODEOWNERS` 不代表它們也跟著生效。

---

## 從這裡到第一個能操作的畫面

上面那一步做完之後，下一步**不是**跑全套檢查。中間有四段，順序如下。

前兩段與最後一段的答案在別處，這裡**只給指標，不抄內容** —— 抄過來就會
長出第二份會漂的清單，而這個 repo 在「同一件事寫在多處、卻沒有東西斷言
它們一致」上已經栽過好幾次（`tools/doc-facts` 存在的全部理由就是這個）。

1. **裝相依** → README〈安裝指南〉。三種環境各一條路，包含「機器上既沒有
   pnpm 也沒有 corepack」的那條。
2. **開一片切片** → README〈1 分鐘：新增一個切片並掛上系統〉。
   產生器跑完會把接下來要改的檔案印在終端機上。
3. **接資料** → 下面那一節。這一段以前哪份文件裡都沒有。
4. **用元件** → `platform/ui/src/components/` 底下每一個 `.vue` 檔的檔頭。
   每個元件的用途、取捨與踩過的坑都寫在它自己的原始碼裡；
   ⚠️ **沒有一份獨立的元件使用說明**，這是 v1 的現況。

四段走完，才是〈一次跑完所有檢查〉。

### 把畫面接上資料

dev 的拓撲刻意鏡像 production：**SPA 與 BFF 同源，由 `/api` 路徑前綴分流**，
proxy 的另一端是一個獨立行程。所以要看到資料，得有東西在那一端聽。

**一、起 BFF。** 另開一個終端機：

```bash
./node_modules/.bin/vpr bff
```

它會印出自己的位址、**載入了哪些應用端路由**、以及實作的契約條目。
那份路由清單是唯一看得出「有沒有真的載到」的地方 —— 對不上就往下看第三步。

**二、起應用，然後建立一次本機 session。**

```bash
./node_modules/.bin/vpr dev
```

畫面最上面有一條 **只在 dev 存在** 的橫幅。第一次進來時它會說「尚未建立
本機 session」—— 那不是壞掉：`@org/bff-mock` 的資料端點全部要 session，
沒有 session 的話每一片切片都停在錯誤分支。按下「建立本機 session」，
D8 的那條路徑（登入 → 帶 cookie → 被 CSRF 擋 → 補標頭 → 通過）就真的被
走了一次。

> ⚠️ **這條橫幅不是登入畫面，production 也不會有它。** 正式環境的登入由
> 組織的 gateway 處理；橫幅本身在 production 建置裡整個被搖掉
> （`apps/console/tests/dev-session-stripped.test.ts` 會真的建置一次，再去產物裡找它）。
> 腳手架裡一個「看起來很完整」的認證服務，最後都會被複製到 production ——
> 所以這裡刻意只有一顆按鈕。

**三、新切片要自己的資料端點時，補在應用這一側。**

`@org/bff-mock` 只帶示範切片的資料，**新切片的端點不要去改 `platform/`** ——
那是各案不該動的地方。改的是應用自己的路由檔，這個 repo 的是
`apps/console/bff-routes.ts`：

```ts
// ⚠️ 這個介面不能省。`@org/bff-mock` 確實匯出了 `BffMockRequest`，但這個檔案
// **刻意不 import 它** —— 正式環境的 app 不該相依一支開發用的 mock（理由寫在
// apps/console/bff-routes.ts 的檔頭）。少了標註，`vp check` 會紅 TS7031。
interface RouteRequest {
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: unknown;
  readonly permissions: readonly string[];
}

export const routes = [
  {
    path: "/api/customer",
    handle: ({ query }: RouteRequest) => ({ body: { items: [], keyword: query.get("q") } }),
  },
  {
    method: "POST",
    path: "/api/customer",
    handle: ({ body }: RouteRequest) => ({ status: 201, body }),
  },
  {
    method: "PUT",
    path: "/api/customer/:id",
    handle: ({ params, body }: RouteRequest) => ({ body: { id: params.id, ...(body as object) } }),
  },
];

// 追加到 mock session 的權限碼（追加，不是取代）
export const extraPermissions = ["customer:read"];
```

處理器回傳 `{ status?, body? }`，省略 `body` 就是只回狀態碼（預設 204）。
路徑的 `:id` 是參數段；非安全方法一樣要通過 CSRF —— 這道接縫不繞過 D8，
注入的路由排在 401 閘門**之後**。

> 上面那段是**逐字驗過**的：存成一個 `.ts` 檔跑 `vp check`，零錯誤零告警。
> 現成的一份在 `apps/console/bff-routes.ts`，照著它的形狀寫最省事。

換一個 app 名字的話，把根 `package.json` 的 `bff` script 裡那個
`BFF_MOCK_ROUTES=` 改成新的路徑。檔案找不到或形狀不對，它會**拒絕啟動**
並指出是第幾條，不會安靜地當作沒有路由。

**四、已經有真的 gateway 的話，把 proxy 指過去。**

```bash
BFF_ORIGIN=https://gateway.internal ./node_modules/.bin/vpr dev
```

也可以寫在 `apps/<你的 app>/.env`（`.env.example` 有一份）。兩邊都設的話，
**真的環境變數優先**。

---

## v1.0.0 承諾什麼

五條，每一條都有會失敗的檢查在守。**能守的與不能守的，各條自己會講。**

> ⚠️ 上面那句話在 2026-08-17 之前是假的：需求二當時沒有任何檢查，
> 它引用的證據（`slice-gen` 與一致性檢查讀同一份契約）其實是需求一的。
> 同一份證據掛在兩條承諾上，而空著的那一條沒有人發現。
>
> ⚠️ **這句話本身現在守到了一條，還差四條**（`v1.8.0` 起）。
> `specs/promise-1-architecture.feature` 用中文寫下承諾一具體指什麼，
> 而 `tools/promise-check` 會照著那份規格**把一份切片副本真的弄壞、
> 跑規格指名的那道閘門、比對結果** —— 承諾說謊、規格被改壞、
> 或者承諾綁到一道根本沒接在 `vpr gate` 上的閘門，三種都會當場紅。
>
> ⚠️ **另外四條仍然只有人讀得出來。** `tools/doc-facts` 守的是**數字**
> （export 數、切片數、CODEOWNERS 條目數），不是主張 —— 那道閘門不會
> 因為某一條承諾空了而說話。哪四條、為什麼是這個順序，見 `DECISIONS.md`
> 的 **C118**，這裡不重述。

### 一、分工開發不受影響的系統架構

一片功能 ＝ 一個 package，自帶 API／composables／views／store／測試。
依賴方向單向（`apps → features → platform`），**切片之間一律禁止互相依賴**。

| 守它的                | 守什麼                                                                    |
| --------------------- | ------------------------------------------------------------------------- |
| `tools/conformance`   | 切片契約、分層邊界、相對路徑逃逸、幽靈依賴（含 CSS 的 `@import`）         |
| `tools/api-surface`   | `platform/*` 的**型別形狀**，改名或改形狀就失敗，破壞性變更必須附 codemod |
| `tools/vue-typecheck` | `.vue` 的型別（`vp check` 的 tsgolint 不看 SFC）                          |
| `tools/slice-gen`     | 產生器與檢查器**讀同一份契約**，不會各說各話                              |
| `tools/codemods`      | 破壞性變更的遷移腳本；`api-surface` 擋下的就是**沒附 codemod** 的那些     |
| `tools/promise-check` | **這一條承諾本身** —— 照 `specs/` 的規格弄壞一份副本，跑閘門，比對結果    |

> **這一條承諾的原文在 [`specs/promise-1-architecture.feature`](specs/promise-1-architecture.feature)。**
> 那份規格是給人逐字讀的：打開它就知道「分工開發不受影響」在這個腳手架裡
> 具體指哪幾件事，不必去讀任何一支閘門的原始碼。
>
> ⚠️ **上面那張表不是那份規格的摘要。** 表回答「誰在守」，規格回答
> 「守住了什麼、破壞它會怎樣」，而**只有規格會被執行**。兩者說法分岔的時候，
> 規格是對的那一份 —— 因為閘門讀的是它。

### 二、從設計模板到前端工程的開發方式

設計稿上的一塊樣式要變成程式裡可以各案替換的東西，中間有三段。
**每一段都有檢查**，而且檢查是**掃目錄**的 —— 第三個元件加進來時它一樣會說話。

| 那一段           | 沒有檢查會怎樣                                                      |
| ---------------- | ------------------------------------------------------------------- |
| 槽被宣告         | 元件沒有接縫，各案只能去改 `platform/ui` 的原始碼                   |
| 元件真的讀到它   | 宣告與預設表都在、就是沒 `inject` —— 型別全對，覆寫一個字都不會生效 |
| 宣告與預設表一致 | 新加的槽沒有對應的表，**靜靜地什麼都不做**                          |
| 各案覆寫得到     | 覆寫字串搬出 `.ts` 之後 Tailwind 掃不到，CSS 少掉那些類別而建置全綠 |

| 模板真的綁到解析後的表 | `:class="parts.overlay"` 打成 `DEFAULT_PARTS.overlay` —— 接縫還在、只是沒接上 |

前四段由 `platform/ui/tests/component-contract.test.ts` 守，
最後一段由 `tools/theme-verify` **真的建置兩次**比對產物。

⚠️ **這一組檢查刻意不守「接縫夠不夠」。** 一個元件該開幾個槽、哪幾塊該讓各案
換掉，是設計判斷，由 `CODEOWNERS` 與 PR 審查回答。做成靜態規則的話它會長成
「每一塊 class 都要有槽」，然後排版用的 `<div>` 會被逼出沒有人會覆寫的槽名，
然後有人加例外 —— 而例外永遠不會拿掉。

### 三、設計模板對應 vue component 的方式

元件的公開面分三格，各對應設計稿上的一種東西：

| 設計稿上的                     | 程式裡的                      | 各案怎麼換            |
| ------------------------------ | ----------------------------- | --------------------- |
| **值**（顏色、圓角、字重）     | `@theme` 代幣                 | 在自己的 app 覆寫代幣 |
| **形狀**（哪一塊長什麼樣）     | **具名槽** ＋ `createUiTheme` | 換整條 class 字串     |
| **結構**（哪一塊可以整組換掉） | `<slot>`                      | 在使用端填 slot       |

```ts
createUiTheme({
  UiButton: { secondary: "border-control border-accent bg-surface text-fg" },
  UiDialog: { content: "inset-x-0 bottom-0 top-auto translate-0 rounded-b-none" },
});
```

**槽名不是我們取的。** `UiDialog` 的 `overlay`／`content`／`title`／`description`
就是 reka-ui 的基元名，也是 shadcn-vue 的 part 名、以及 shadcn Figma kit 的圖層名。
設計師說「overlay 要更淡」，前端要改的那一格就叫 `overlay` —— 這條對應不需要翻譯表。

⚠️ **這一條的接縫從第一天就完整，內容補到 14 個元件。**
表單那一排（`UiInput`、`UiTextarea`、`UiSelect`、`UiCheckbox`、
`UiRadioGroup`／`UiRadioItem`、`UiSwitch`、`UiLabel`）已經齊了，
而且**27 個元件都被檢查過**，一個 CRUD 畫面拼得出來了。

⚠️ **shadcn 沒有安裝。** 這個 repo 用的是它的三個原料
（reka-ui ＋ clsx ＋ tailwind-merge）與它的模型（原始碼在自己手上）。

**不採用它的樣式層，理由只有一句：CSS preset 沒有任何閘門在守。**
現行 shadcn-vue 的樣式住在 `style-*.css`（`.cn-button-variant-default` 之類），
各案換 preset 就換掉整套外觀，元件原始碼不動 —— 設計很好，但
`.cn-button-variant-defualt` 打錯一個字會產生一個永遠不匹配的 class，
畫面安靜地少一塊樣式。具名槽打錯字是**編譯失敗**。

兩邊都對，只是對不同的命題：它的下游是任意專案、沒有共用閘門；
這個 repo 的命題是**把架構決策寫成閘門**。

### 四、快速換配色與元件樣式

代幣分兩層（色票層 → 語意層），兩層之間的間接是**活的**：

```css
/* apps/<你的案子>/src/styles.css */
@import "@org/ui/styles.css";

@theme {
  --color-brand-600: oklch(0.55 0.18 173); /* 色票層：語意代幣跟著走 */
  --color-line: oklch(0.85 0.02 173); /* 語意層：只換這一個用途 */
  --radius-control: 0.5rem; /* 形狀 */
}
```

`tools/theme-verify` **真的建置兩次**去比對產物，證明覆寫會生效 ——
一支只 grep `@theme` 有沒有寫的測試量的是「有沒有寫」，不是「有沒有生效」。
它同時擋住元件、切片與應用裡出現原始顏色（`bg-white`、`text-gray-900`）。

### 五、基礎資安在撰寫時就被發現

**定位講清楚：這是前置過濾器，不是交付的那份掃描報告。**
源碼掃描與弱點掃描由專業公司做，這裡只負責讓基礎問題在寫的時候就紅。

| 守它的                       | 守什麼                                                     |
| ---------------------------- | ---------------------------------------------------------- |
| `eslint.config.js`（Tier 2） | 安全與邊界規則，與 oxlint **零重疊**；全量、不快取、不過濾 |
| `.semgrep/`（自寫規則）      | 汙點傳遞：`route.query` → `innerHTML`、`new Function`      |
| gitleaks                     | 進版控的機密                                               |
| `platform/config`            | `VITE_*` 白名單；**看起來像機密的環境變數讓建置失敗**      |
| `platform/security-headers`  | CSP 以**資料**定義，由 BFF／dev 中介層／測試三方共用       |
| `platform/http-client`       | 唯一合法的 HTTP 出口；**沒有、也不會有 token 存取介面**    |

---

## v1.0.0 **不**涵蓋什麼

⚠️ **這一節比上面那一節重要。** 下面每一項**都是刻意不放進 v1.0.0 的，
不是還沒做** —— 那是一個判斷過的決定，理由記在 `DECISIONS.md` 對應的條目。
**這句是這一節唯一擔保的東西。**

⚠️ **這份文件不替「別的地方有」做任何擔保。** 下面每一項要的案子，
自己去確認它現在在哪、長什麼樣 —— **不要照這張表假設**。

| 不涵蓋                                                     | 什麼案子會需要                           |
| ---------------------------------------------------------- | ---------------------------------------- |
| **無障礙**（靜態檢查與驗收分工表）                         | ⚠️ **政府採購案**（AA 是立法院決議要求） |
| **個資法對照表、§16 證據保存清單**                         | 有法遵稽核的案子                         |
| **測試環境不得用真個資的檢查**                             | 同上                                     |
| **供應鏈盤點、SCA 例外申請書、鏡像清單、封閉網路前置條件** | 原始碼交付／機關端重建／封閉網路         |
| **SBOM 與相依漏洞掃描**                                    | 需要交付 SBOM 的案子                     |
| **D2 退出演練**（驅動層可替換的證據）                      | 採購要求評估供應商鎖定風險               |
| **BFF 契約驗收器**                                         | 要驗收真實 gateway 的案子                |
| **CSP 瀏覽器實測探針**                                     | 有滲透測試的案子                         |
| **UI 技術選型的三方比較**                                  | 要回答「為什麼選 reka-ui」的場合         |

⚠️ **政府採購案請特別注意第一列。** v1.0.0 **沒有任何無障礙檢查**。
機關端的驗收是 Freego ＋ 人工檢測，那一段本來就不在 CI 裡 ——
但 v1 連開發期的前置過濾都沒有。

---

## v1.0.0 已知的誠實缺口

不是 bug，是**已經知道、而且刻意留著**的東西。寫在這裡，是因為
發現它們的最糟時機是驗收前。

### 一、`platform/ui` 有 27 個元件，範圍是被定義過的

接縫（代幣／具名槽／slot）都通了、**27 個元件都被檢查器驗過**，
一個 CRUD 畫面拼得出來：表單十支、表格家族六支＋分頁、版型與回饋十支。

範圍由 **C78** 定，判準是「一個典型的 CRUD 案子，第一天要不要自己寫這個
元件」—— 而**連刻意不進來的那幾個也寫下來了**（Accordion／Tooltip／Popover／
Combobox／Avatar／Progress／Toast）。那是一個可以被反駁的決定，不是一份
被當成既定事實的記憶。

### ⚠️ 使用端把 prop 名字打錯，不會有任何東西說話

`UiButton` 的是 `variant`，`UiAlert` 與 `UiBadge` 的是 **`tone`**。
照 `UiButton` 的習慣寫 `<UiAlert variant="danger">` —— **全套閘門綠**，
而那塊錯誤提示會安靜地渲染成 info 色（灰底），`<div variant="danger">`
留在 DOM 裡看起來像有設。

成因是 Vue 的 fallthrough attrs：不存在的 prop 變成 DOM 屬性，不是型別錯。

**兩次量測（不要再量第三次）：**

| 開什麼                                    | 結果                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strictTemplates`（C55 量的）             | 多 2 條，都是 `<UiButton @click>`；而加 `defineEmits` 會**關掉 fallthrough**，是真的行為迴歸                                                                      |
| **只開 `checkUnknownProps`**（C101 量的） | **28 條，全部是 `data-slot`**；把 `data-slot` 正名之後變成 `aria-invalid`／`aria-describedby` 那一批 —— 也就是 `UiField` 的 `control` 靠 fallthrough 傳下去的東西 |

⚠️ **這個元件庫的設計整體建立在 fallthrough attrs 上**，而
`checkUnknownProps` 與那個設計衝突 —— 不是設定沒調對。**留著這個缺口是決定，
不是疏忽。**

⚠️ 已經好一點的一半：`platform/*` 每個 export 的形狀現在列在根層
[`API.md`](API.md) 裡（產生的，由 `api-surface` 守著）—— 寫之前查一下，
比事後發現快。

⚠️ 這個數字由 `tools/doc-facts` 從 **`git ls-files`** 數出來（不是掃磁碟，
理由見 C73），文件裡三處引用它的地方對不上就會紅。

⚠️ 補元件的最快路徑是用 shadcn-vue 的 CLI 把原始碼**抄進來**（不是相依它），
抄進來之後接上具名槽 —— 檢查器會告訴你哪一個沒接上。那是 v1.x 的工作。

### 二、`bff-mock` 不是認證伺服器

沒有 OIDC、沒有使用者目錄、session 存在記憶體裡。它的用途是讓 D8 那條
路徑（登入、CSRF、401／403）從第一天就跑得通，以及證明
`@org/bff-contract` 是可實現的。**正式環境請用組織的 gateway。**

### 三、`vue-typecheck` 用的是第二個 TypeScript

catalog 主線的 `typescript` 是原生 Go 版（TS 7），已經沒有 `vue-tsc` 需要的
compiler API，所以 `tools/vue-typecheck` 用具名 catalog 拉一份 JS 版的 5.x。

⚠️ 這道閘門紅、而 `vp check` 綠的時候，**多半是真陽性**不是工具吵架：
`.ts` 檔消費 `.vue` 時 `vp check` 看的是 `declare module "*.vue"` 的萬用宣告
（任何 prop 都合法），vue-tsc 解析真的 SFC。紅燈訊息自己會講這句。

### 四、四份閘門清單是手抄的，沒有東西在斷言它們一致

同一份「跑哪些閘門」的清單，在這個 repo 裡各寫一份：`package.json` 的
`gate` 與各別名、兩個 workflow、以及 `README`〈兩層檢查〉那張表。
**加一道閘門而漏掉其中一處，不會有任何東西說話。**

⚠️ 這不是假想的。已經發作過兩次：v1.0.1 修的是第一次（`doc-facts` 只在 CI 跑、
不在 `scripts.gate` 裡，於是本機 `vpr ready` 全綠而推上去 CI 紅）；第二次是
README 那張表的 Tier 2 那格漏了兩道閘門，**不知道漏了多久** —— 而那一格正是
讀者判斷「PR 會被什麼擋下來」的地方。兩處都已修好，但**成因還在**。

⚠️ **這一條會絆到你**，不只絆到維護者：`SCOPE.md` 明說你在 `tools/` 底下
加目錄時也會走到這條路。加閘門的人就要一起改那四處。

**實務上要怎麼辦：** 加一道閘門時，四處要一起改。用這個指令找齊：

```bash
grep -rn "vpr gate\|node tools/" package.json .github/workflows README.md
```

---

## 一次跑完所有檢查

```bash
./node_modules/.bin/vpr ready
```

= `vp check` ＋ 全套測試 ＋ 建置 ＋ `vpr gate`。

決策的完整理由與踩過的坑留在 [DECISIONS.md](DECISIONS.md) ——
那是一份有日期的決策日誌，涵蓋的範圍**大於 v1.0.0**。

> 上面〈v1.0.0 **不**涵蓋什麼〉講的是**能力**：你的案子需要什麼，該用哪條分支。
> 另有一份 [SCOPE.md](SCOPE.md) 講的是**目錄**：什麼准許出現在 `release/v1` 的
> 樹上，以及判準（**看它守的東西給誰看**）。那份主要是給**維護這條線的人**的
> —— ⚠️ **但你加東西進 `platform/` 或 `tools/` 的時候也會用到**：`vpr ready`
> 裡的 `scope-check` 會要求新目錄在那份文件登記一列，那幾欄寫你們自己的理由就好。
> 兩份刻意不重述對方的內容。
