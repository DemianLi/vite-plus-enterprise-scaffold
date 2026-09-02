# 最少套件、最完整邊界 —— 五角色表第二次對照：#230 說 Browser Mode 買的兩個盲點，一個今天就在守、另一個 0 個新套件買得到

> ⚠️ **量測基準 `55b7655`**（2026-09-02，C159 合併的那一支）。這份稿子是**凍結的**，
> 沒有任何機制在守它過不過期（`SCOPE.md` 的 `reports/` 那一列）。
>
> ⚠️ **這是觀察，不是判準。** 不得拿來論證任何閘門或門檻的增減（C137 §一）。
> §二 那張讀數表的產生器在 [`rigs/accname-probe.sh`](rigs/accname-probe.sh)，可以再問一次；
> 其餘數字都是單行查詢，命令逐處附在段落裡。
>
> ⚠️ **本稿在論證裡的角色（C159 §四）**：§二 是**用法丙** —— 事實從樹上量來，出處寫的是
> 樹上的位置，不是本稿。§三–§五 引用的外部來源，**在這個環境裡有一半打不開**
> （x.com、vitest.dev、playwright.dev、webdriver.io、mswjs.io、medium、dev.to 都被 egress 擋住，
> 清單在 §八）；能開的走 GitHub 上的原始檔與**磁碟上的 README**（C158 §二 的做法），
> 開不了的只有搜尋引擎的摘錄 —— **引用之前要人再核一次**。

---

## 一、問的是什麼，以及它與 #228 差在哪

問的是：這棵樹照 `TESTING.md` 的「五層兩類」在做，另一組同樣借 Uncle Bob 座標、
只是換了套件的「五角色 × 工具」表（Playwright＋playwright-bdd／`vi.mock`＋MSW／CRAP／
Stryker／Vitest Browser Mode），**怎麼搭配才能用最少的測試套件達到最完整的測試邊界，
而不讓腳手架變成屎山**。

`test-model-selection-2026-09-01.md`（#228）昨天答過同一題：一項都不該移除、MSW／
playwright-bdd／CRAP 都不必加、混合方案只有 Browser Mode 一格站得住，而那一格移交給
C157／C158／#230。**本稿是第二次，差在三件事：**

1. **把 #228 與 C157 沒量的兩格量了。** #230「它買什麼」那張表列了 Browser Mode 要補的
   兩個盲點（Teleport 裡的內容、可及名稱），兩格都寫「今天壞掉會怎樣：全綠」。
   **回樹上量，兩格都不是那個讀數**（§二）。
2. **拿一手來源重看那張表。** #228 §七 自己列了四項「無一手來源」；這次拿到的原文
   包括 Uncle Bob 2026 年的十則貼文摘錄（§三）—— 其中一則說明了**那張五角色表是從哪裡來的**。
3. **每一格都附代價的單位**：新增幾個 lockfile 套件、幾個 runner、幾個不在 registry 上的二進位。
   「最少」沿用 #228 §三 的量法（失敗模式種類），本稿不另立尺。

---

## 二、回樹上重查抓到的兩件事（用法丙）

### 2.1 Teleport 那一格今天就在守 —— C157 §三 第一列引的那一行講的是 SSR，不是 happy-dom

C157 §三 與 #230「它買什麼」第一列的證據是 `platform/ui/tests/alert-dialog.test.ts:13`
的「一個字都驗不到」，結論是 Teleport 裡的內容壞掉那一天，今天的樹全綠。

**那一行的上下文是這樣寫的**（同檔 9–16 行）：「為什麼非得是 DOM，不能像 `UiField`
那樣用 SSR … 同一招在這裡一個字都驗不到：reka-ui 的 `Teleport.vue` 是 `isMounted || forceMount`
才渲染，而 `useMounted()` 在伺服器端是 false」。**它在解釋這支檔案為什麼不用 `renderToString`。**
同一支檔案的做法是 `mount(..., { attachTo: document.body })` 跑在 happy-dom 裡，然後對
被傳送到 `document.body` 的內容斷言：

| 出處                                     | 斷言的是什麼                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `alert-dialog.test.ts:121`               | `expect(content, "掛載後找不到對話框內容").not.toBeNull()` —— 每一條的前置 |
| `alert-dialog.test.ts:309`「★ 探針本身」 | 選擇器恰好抓到 1 個元素、裡面恰好 2 顆按鈕                                 |
| `dropdown-menu.test.ts:104`              | `expect(element, "選單沒有展開").not.toBeNull()`                           |
| `dropdown-menu.test.ts:157`              | `aria-labelledby` **解到底**，指向不存在的 id 也算無名                     |

**量一次，不只讀**（基準 `55b7655`）：

| 操作                                                                                                      | 結果                                                         |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 對照組 `vp -C platform/ui test`                                                                           | **7 支檔、399 條全綠，exit 0**                               |
| 變異 T1：`UiAlertDialog.vue:169` 的 `<AlertDialogContent>` 加上 `v-if="false"`（Teleport 裡的內容不渲染） | **12 條紅／387 綠，exit 1**，紅的全在 `alert-dialog.test.ts` |
| 還原                                                                                                      | `cmp` 與 `git show HEAD:` 逐位元組相同                       |

**所以 C142 §一 的 ② 在這一格是「吵」，不是「安靜」。** 樹上一共有 **3** 支測試檔跑在
happy-dom 裡（`grep -rl '@vitest-environment happy-dom'`：`alert-dialog`、`dropdown-menu`、
`features/order/tests/masking`），前兩支守的正是 reka-ui 的 portal 內容。

⚠️ **這不表示 happy-dom 那一格沒有洞** —— 洞在別的地方，而且兩支測試檔頭自己列了
（「綠燈的意思是什麼、不是什麼」）：**沒有版面與可見性計算**（`display: none` 的取消鈕
照樣「聚焦得到」）、**面板的座標驗不到**（floating-ui 要版面）、`padding-right` 是 1024px
（真瀏覽器約 15px）。**那才是 Browser Mode 獨有的一格**，而它與 #230 寫的「Teleport 裡的
內容」不是同一格。

⚠️ **形狀要記下來**：「Teleport 裡的內容」在 `renderToString` 下與在 `mount` 下**不是一個
東西**，C157 把前者的讀數貼到了後者身上。這是 C158 §三 那條沒立的規則（「先確認被判的是
不是一個東西」）的**第三個案例**（C158 §三 是第一個、C159 §七 是第二個）—— C159 §七 寫
「把升格留給第三個」，**升不升格是裁決的事，本稿只登記它出現了。**

⚠️ 同時它也是 C159 §四「用法丙要回樹上重查」那條規則**第三次**抓到東西（`reports/` 內
2/2 → 3/3；把 C131 §七 那個 `reports/` 外的鄰例算進來是 4/4）。

### 2.2 可及名稱那一格：0 個新的 lockfile 套件、0 個 runner、0 個瀏覽器二進位

樹上三處寫著「**規格來源，本 repo 量不到**：page JS 沒有算可及名稱的 API，`computedName`
只存在於 DevTools protocol」（`UiDropdownMenu.vue:69`、`dropdown-menu.test.ts:181`、
`alert-dialog.test.ts:150`）。前半句對**瀏覽器原生 DOM API** 是真的；後半句漏了一件事：
**算可及名稱的 JS 實作早就在這棵樹的 lockfile 裡了。**

**它從哪裡來**（`git log -S'dom-accessibility-api' -- pnpm-lock.yaml`：`1be0c88`，2026-08-18，
早於 C89 兩天）：

```
vite-plus@0.2.9 (dependencies)
└─ @vitest/browser-preview@4.1.10
   └─ @testing-library/dom@10.4.1
      └─ dom-accessibility-api@0.5.16   ← 實作 https://w3c.github.io/accname/
```

用樹自己的解析器數（`tools/supply-chain/src/lockfile.ts` 的 `parseLockfile`）：**712 個套件裡
有它**，同一批裡也有 `@testing-library/dom@10.4.1`、`aria-query@5.3.0`、`@vitest/browser@4.1.10`，
而 `playwright`、`msw` 一個都沒有。磁碟上 `node_modules/.pnpm/dom-accessibility-api@0.5.16` 實體存在。

⚠️ 它不是冷門的旁支：jest-dom 的 `toHaveAccessibleName` 就是
`import { computeAccessibleName } from 'dom-accessibility-api'`（testing-library/jest-dom
`src/to-have-accessible-name.js`，一手），而 Vitest Browser Mode 的斷言庫是 jest-dom 的 fork
（Vitest 文件原文：「Vitest forks the `@testing-library/jest-dom` library」）。**Browser Mode
拿來斷言可及名稱的，是同一個函式。**

**探針**（[`rigs/accname-probe.sh`](rigs/accname-probe.sh)：把一支 `.test.ts` 寫進
`platform/ui/tests/`、在 happy-dom 裡掛載真元件、直接指到 `.pnpm` 存放區那份
`dom-accessibility-api`、跑完刪掉；5 條全綠、exit 0）：

| 列          | 變異（在掛載後的 DOM 上做，不動原始碼）      | 樹上 ⭐ 走的代理（`aria-labelledby` → `textContent`） | `computeAccessibleName(role="menu")`            |
| ----------- | -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| 對照組      | 現行形狀                                     | `訂單 #1024 的操作`                                   | `訂單 #1024 的操作`（觸發器同）                 |
| **M2b**     | 拿掉 `span.sr-only` ＋ 觸發器加 `aria-label` | **`""`** → 紅                                         | **`訂單 #1024 的操作`** → 綠                    |
| **M1**      | 拿掉 `span.sr-only`                          | `""` → 紅                                             | `""` → 紅                                       |
| **M11**     | `span.sr-only` 設 `style="display:none"`     | **`訂單 #1024 的操作`** → 綠                          | **`""`** → 紅                                   |
| alertdialog | 現行形狀                                     | —                                                     | 名字 `刪除訂單`／描述 `訂單 #1024 會被永久刪除` |

**讀這張表要對著 C89 讀，而 C89 兩節各自有一半站著：**

- **C89 §一 的構造論證不受影響。** 它裁的是「`sr-only` vs `aria-label` 這條慣例做不成行為層
  的閘門，因為任何忠實實作 accname 的東西對兩者都會綠」—— 表上 M2b 那格的綠**正是它說的
  那件事**。這一格本稿一個字不推翻。
- **C89 §三 記的那個洞，現在有東西分得開了。** 那一節寫：M1（名字整個消失，真缺陷）與
  M2b（名字搬到 `aria-label`，真瀏覽器裡完全正常）「紅的是同一組四條」、「現有的紅燈根本
  分不出這兩件事是哪一件」。表上：**代理對 M1／M2b 讀出逐字相同的 `""`，accname 讀出
  `""` 與 `訂單 #1024 的操作`。**
- **M11 那一列是反方向的。** C89 §四 說 `display: none` 的變異「在真瀏覽器裡是真的把名字
  弄掉了」，而它是被金絲雀順便咬到的、紅的理由與名字無關。表上：**代理讀到名字（綠），
  accname 讀到空字串（紅）** —— 缺陷方向的紅第一次由「名字」本身發出。
- **三處「規格來源，本 repo 量不到」裡的兩句，量到了。** C89 §二／`UiDropdownMenu.vue:69`
  的規格宣稱（「由 `aria-labelledby` 觸發的遞迴會忽略被指元素自己的 `aria-labelledby`，
  但 `aria-label` 照用」）就是 M2b 那一列 —— **實測成立**。`alert-dialog.test.ts:150` 那條
  代理也有了非代理的讀數（最後一列）。⚠️ `UiDropdownMenu.vue:125`（「各家瀏覽器對這一段
  的處理並不一致」）**不在此列** —— 一個 JS 實作量不到瀏覽器之間的差異。

⚠️ **M11 是用 inline style 模擬的，不是樹上那個「`sr-only` 改成 `hidden`」的 class 換法** ——
探針裡沒有載入任何樣式表，class 換法要靠 happy-dom 對樣式表的 `getComputedStyle`，
**沒有量**。

⚠️ **「量得到」不等於「與瀏覽器一致」。** `dom-accessibility-api` 的 README 只列 jsdom
（web-platform-tests 138/159）與各瀏覽器，**對 happy-dom 一個字都沒承諾**；它靠
`getComputedStyle` 判 hidden。而 happy-dom 的 role 計算有登記在案的缺口
（testing-library/dom-testing-library#1137：`<input type="text">` 被算成 searchbox；
capricorn86/happy-dom#1122）—— 那些 issue 上的版本很舊，**在 20.11.2 上沒有重驗**。

**代價量了一次**（拋棄式 `git worktree`，`pnpm add -D dom-accessibility-api@0.5.16 --filter @org/ui`，
量完 `git worktree remove`）：

| 量到的                             | 值                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 動到的檔                           | **3 個、8 行**：`platform/ui/package.json` +1、`pnpm-workspace.yaml` catalog +1（`catalogMode: prefer` 自動加）、`pnpm-lock.yaml` +6／−0                                 |
| lockfile 的 `packages:` 區段       | **0 個新條目** —— 6 行全在 `importers:` 底下                                                                                                                             |
| `supply-chain --update` 的四個數字 | **712／144／12 不變**，`inventory.json` 只有排版差異（`"documents": [2]` 展開成多行）                                                                                    |
| `supply-chain` 預設模式（閘門）    | **紅**：「有相依從來沒被擷取過：dom-accessibility-api」—— `dependency-health.json` 追的是**直接宣告**的 33 個套件的健康度，要在連得到公網那一側跑一次 `--capture-health` |
| `conformance`                      | 綠（2 個切片、398 個版控檔案）                                                                                                                                           |

所以這一格的誠實代價是：**0 個新套件、0 個 runner、0 個二進位，＋1 次公網側的
`--capture-health`、＋1 筆 `dependency-health.json`、3 個檔案 8 行。**

⚠️ **而樹上那半句「只存在於 DevTools protocol」還有第二個反例：Playwright 自己也不走 CDP。**
`microsoft/playwright` 的 `packages/injected/src/roleUtils.ts`（一手，GitHub raw）匯出
`getElementAccessibleName`、`getElementAccessibleDescription`，檔內逐條引
`https://w3c.github.io/accname/#computation-steps` —— **它是注入頁面的 JS**。Vitest Browser Mode
的 `page.getByRole` 用的 `ivya` 是它的 fork（vitest-dev/ivya README）。所以「可及名稱」在
Browser Mode 裡其實是**兩套 JS 算法**（locator 走 ivya、斷言走 dom-accessibility-api），
沒有一套是 DevTools protocol。

⚠️ **本稿不裁 `dom-accessibility-api` 進不進 `platform/ui` 的 `devDependencies`。** 那是一支
新的機械檢查，要走 D16 兩軸（C154 §四）；本稿只把兩軸的證據擺出來：① 對象在外（reka-ui
與 accname 規格都是上游的）、② 壞法安靜（M11 那一列：代理綠、名字沒了）。

---

## 三、Uncle Bob 2026 年原文能拿到什麼（一手與二手分開）

⚠️ **x.com 與所有鏡像（nitter／xcancel／threadreader）在這個環境全部打不開**。下面的貼文
文字來自三種地方：搜尋引擎對該則貼文的摘錄、第三方 README 的逐字轉錄、或整理文的引文。
**日期是搜尋代理由 snowflake ID 解出來的，不是我核過的。** 每一則都附 status URL，
要引用先去開它。

| 日期       | status                | 說了什麼（摘錄）                                                                                                                                                                                                                                 | 取得方式                                                 |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 2026-03-07 | `2030287900709978600` | Gherkin 是主要的行為規格工具；「The Gherkin must remain in natural language, no code level artifacts」；parser 把 Gherkin 轉成**直接打應用程式**的測試，中間隔一層 testing API                                                                   | 搜尋摘錄                                                 |
| 2026-04-14 | `2044114698451476492` | 「I don't review code written by agents. I measure things like test coverage, dependency structure, cyclomatic complexity, module sizes, mutation testing, etc.」                                                                                | 搜尋摘錄                                                 |
| 2026-04-22 | `2046759028588724443` | **唯一查到的數字**：「Reduce all functions below a CC of 4 or so」，再介紹 CRAP（CC 混覆蓋率，「you get punished for complicated functions that are not well covered」）                                                                         | 搜尋摘錄                                                 |
| 2026-05-13 | `2054614775397568761` | Gherkin → JSON → 產生可執行測試；「A gherkin mutator inserts itself into that path and alters the IR then generates the test and expects it to fail」                                                                                            | 搜尋摘錄                                                 |
| 2026-06-01 | `2061482997610610863` | 人手寫非正式規格 → agent 硬化＋切任務 → **人審** → specifier agent 產 Gherkin                                                                                                                                                                    | 搜尋摘錄                                                 |
| 2026-06-04 | `2062557016086786435` | 六個 agent：**Specifier, coder, cleaner, architect, hardener, QA**。「The specifier writes both Gherkin and user oriented QA procedures … Hardener run mutation tests. QA runs the specifiers QA procedures」                                    | 搜尋摘錄                                                 |
| 2026-07-02 | `2072736888478175413` | **自我修正**：「just because we can do them doesn't mean we actually should. Lots of times I just use unit tests and crap evaluation.」大專案才想像得到 Gherkin 與 QA 有用                                                                       | 搜尋摘錄                                                 |
| 2026-07-23 | `2080257779395154409` | 「My current strategy is to not read any of the code written by my agents … surround the agents with extreme constraints. Unit tests, gherkin tests, QA procedures, quality metrics, mutation testing, test coverage, and a plethora of others」 | `AmazingAng/old-coder` README 逐字轉錄（GitHub，開得了） |
| 2026-07-24 | `2080617848821469551` | 「The big manual expenditure is in initial specification, and final testing. Everything between those two events is significantly faster.」—— 人的工作在兩端                                                                                     | 搜尋摘錄                                                 |
| 2026-07-26 | `2081332683582427641` | agent 寫得快，省下的時間拿去寫 unit／acceptance／property tests、torture、mutate、QA test                                                                                                                                                        | 搜尋摘錄                                                 |

**對這棵樹有後果的五件：**

1. **「五層」不是他的詞。** 07-23 那串裡被引成五層的那句（「My agents write the unit tests.
   I don't review those. They also write the gherkin acceptance tests and the QA procedures.
   I review those … I also, periodically, do a final manual test」）**只在 explainx.ai 的整理文
   裡出現**，獨立的 status ID 沒查到。「constraints／unit／acceptance／QA／periodic manual」
   這個分層是二手歸納。`TESTING.md` 借的座標是那個歸納，不是原文 —— 借得對不對，
   本稿不裁，只把來源層級標出來。
2. **那張五角色表的出處找到了：06-04 的六個 agent。** 規格員＝specifier、撰寫員＝coder、
   清理員＝cleaner、強化員＝hardener、QA 員＝QA，少的是 architect。**它是 swarm-forge 的
   分工表，不是「哪一層在守什麼」的座標。** 這解釋了 C156 §二 量到的「少掉兩類那一軸」——
   一張 agent 分工表本來就沒有「為誰而守」這一維。
3. **他的 acceptance test 打的是「application directly」經一層 testing API**（03-07），
   不是瀏覽器；他自己的 Acceptance-Pipeline-Specification 的 parser-spec 也**不支援** tags、
   doc strings、data tables、`# language`（搜尋代理讀的 GitHub 原始檔）。這棵樹的層 3
   （`vitest-cucumber` 打 `src/usecases/`，C114）與他同型，而且 Gherkin 功能是超集。
4. **他 2026 年的 Gherkin 是 agent 產、人審**（06-01、06-04），這棵樹規則四是「`.feature`
   由人寫、agent 不得改」。**是有意識的差異**，引用他時要並列，不能拿他背書規則四。
5. **門檻數字只有一個：CC < 4「or so」。** 他的工具 `unclebob/crap4java` README（GitHub，
   開得了）：`CRAP = CC^2 * (1 - coverage)^3 + CC`、**超過 8.0 就 exit 2**，覆蓋率讀 JaCoCo；
   README 說它「modeled after crap4clj」，**沒有引 Savoia／Evans 2007**。mutation score 與
   coverage 的百分比門檻，十則貼文裡一個都沒有 —— `TESTING.md` 那句「那些數值出自他自己
   幾十年的判斷力」在這批摘錄裡找不到對應的原句，也找不到反證。

---

## 四、逐列重看五角色表 —— 這次拿一手來源，而 C156 的四個否決一個都沒翻

| 列       | C156 的裁決                                | 這次多知道的                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 對「最少」的淨效果                                                                                                   |
| -------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1 規格員 | 前提打錯對象（§四）                        | `playwright-bdd` 9.2.0（2026-06-18）README：「converts .feature files into native Playwright tests」—— **必然是第二個 runner ＋ 瀏覽器二進位**。「前端 Gherkin 投報率低」最接近一手的是 Cucumber 原作者 Hellesøy、Tooke、Adzic 的質性論述（2010–2015；本環境打不開），**沒有數字**，而它們的主張正是「打業務規則層、不打 UI」—— 即這棵樹的層 3。同 runner 內的替代品：`quickpickle` 1.11.2（官方 gherkin parser，**做不到負向 tag 過濾**）、`@lotun/vitest-cucumber` 0.5.3（0 star）。`@amiceli/vitest-cucumber` 7.0.0（2026-06-24，peer `vitest ^4.0.4`）README 列 `# language`、Outline、Background、tags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **＋0**                                                                                                              |
| 2 撰寫員 | 樹上零 test double（§五）                  | 普查在 `55b7655` 重跑，數字與 C156 相同：`vi.mock(`／`vi.stubGlobal(`／`vi.spyOn(`／`globalThis.fetch` **全 0**，對照組 `startBffMock(` 6、`describe(` 287（⚠️ 第一次用 `grep -E` 連對照組都是 0，見 §七）。MSW 官方 recipe「keeping mocks in sync」：靠**重產** handler（`@mswjs/source` 0.5.0 從 OpenAPI 產），**沒有 runtime 驗證**。MSW 那條路最便宜的飄移偵測是 `openapi-msw`＋`openapi-typescript`＋`msw`（3 套件、編譯期）；驗證式 fake 的業界名字是 validation proxy／contract testing（Prism、Specmatic、Pact、`express-openapi-validator`）。**它們全部預設一份 OpenAPI 文件，而這棵樹的契約是 `bff-contract` 的 TS 常數＋參考實作＋`bff-check`。**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **＋0**（換路要 ≥3 套件，還要先寫一份 OpenAPI）                                                                      |
| 3 清理員 | 兩個半盲相乘（§六）                        | Uncle Bob 自己的數字：CC < 4「or so」、`crap4java` > 8.0。**公式的一手是 Savoia 2007 年 7 月在 Artima 的連載**（thread 210434／210575，門檻 30；crap4j 用的是 path coverage）—— 兩個網址加 Google Testing Blog 的轉載**都打不開**，公式只由二手交叉。oxlint **1.77.0**（磁碟上，`vp toolchain oxlint`；npm 最新 1.81.0）用 C119 的方法重量：`cognitive-complexity`／`sonarjs/…`／`oxc/…` 三種寫法 `--print-config` **全 0**；`oxc-project/oxc` main 的 `rules.rs` 只有 eslint 組的 `complexity`，維護者在 discussion #4863 以授權風險拒絕移植 sonarjs。**能拿到認知複雜度的兩條路都是 oxlint 的 JS plugin（官方文件：alpha）**：`eslint-plugin-sonarjs`（conformance 快照 S3776 39/39 過，13 個相依）或 `oxlint-plugin-complexity` 2.1.8（1 個相依、單人維護）—— 而 JS plugin 官方明寫**不支援 Vue 這類自訂 parser**，所以 `<script setup>` 那一格照樣看不見。CRAP 的 JS 工具有（`@barney-media/crap-typescript-vitest` 0.5.1 附 Vitest 4 adapter，預設門檻 6.0、超標 exit 2；`crap4ts`；`js-crap-score`），**全部讀層 2 的 Istanbul 覆蓋率** —— 「層 1 ＝ CRAP」不是靜態閘門。三個門檻（30／8.0／6.0）三個數字，正是 `TESTING.md` 說的「別人的門檻值」                                                                                                                                                                                                                                            | **≥＋1**（CRAP 要 1 套件＋層 2 的覆蓋率；認知複雜度要 alpha 的 plugin 機制）—— 維持出局                              |
| 4 強化員 | 已在樹上（§七）                            | Stryker × Vitest 時間線（changelog，GitHub）：v9.4.0 支援 vitest 4、**v9.6.1 修 4.1 的 hitcount／coverage**、10.0.0（2026-08-14，要 Node ≥ 22）—— 樹上釘的 10.0.0 落在修好之後。**Browser Mode 一格文件與程式碼互相矛盾**：官方 docs「Currently, Browser Mode is not supported」（那一段自 2023-11 未改）；changelog v8.0.0「support browser mode」、v9.0.0「support vitest 3 browser mode」、v9.0.1「copy stryker setup locally」；issue #6097 的輸出顯示 9.6.1 在 browser mode 下跑了 `RUN v4.1.9`；磁碟上 `@stryker-mutator/vitest-runner@10.0.0/dist/src` 有三行提到 browser（一行註解「could be loaded into the browser (when using vitest with browser mode)」、兩行關掉 `config.browser.screenshotFailures`）。⚠️ **Vue 專案的已知未解**：issue #5458（Vue ＋ browser mode ＋ Stryker 9.0.1，`ErrorOverlayConstructor is not a constructor`）仍 open。**本稿沒實跑。** 另兩件與這棵樹有關：`vitest.related`（9.1.0 起預設 true）只跑「與被突變檔相關」的測試，官方說「測試不是直接 import 原始碼（例如打 server 的整合測試）就要關掉」—— 這棵樹起 `bff-mock` 走 HTTP 的那些測試對 `bff-mock` 的突變是不是看不見，**具名待驗**；`--incremental` 存在，對 Vitest 只做到「逐檔、不知位置」，官方限制寫明「不偵測 (dev) dependencies、環境變數、`.snap` 的變更」                                                                                                                                | **±0**；⚠️ 若導入 Browser Mode，元層在那些檔上還在不在是**具名待驗**（#5458 是反證的候選）                           |
| 5 QA 員  | 層 2／3 換執行基底（§八）；C158 再分成兩列 | Vitest 一手（`docs/config/browser/preview.md`）：preview「open a new browser window using your default browser」、「does not support headless mode」—— **它不下載任何二進位，用的是機器上的預設瀏覽器**，所以它是三條裡唯一天生 air-gap 安全、也唯一進不了 CI 的。Playwright 一手（`docs/src/browsers.md`）：「By default, Playwright downloads browsers from Microsoft's CDN」（原始碼 `PLAYWRIGHT_CDN_MIRRORS` 三個 host）；內部倉走 `PLAYWRIGHT_DOWNLOAD_HOST`、目錄走 `PLAYWRIGHT_BROWSERS_PATH`、`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` 跳過；**`channel: 'chrome'` 用機器上已裝的 Chrome，「Playwright doesn't install them by default」** —— 不下載，但相依落到機器層，lockfile 與 `supply-chain` 都看不見（R5 那個形狀）；`channel: 'chromium'` 的新 headless 模式「removes the need to install a separate headless Chromium build」；`connectOptions.wsEndpoint` 可以接一台**別處起的** Playwright server（官方例子是 Docker 映像）—— 對封閉網路，這把「鏡像涵不涵蓋 CDN」換成「內部映像倉有沒有那個 image」。WebdriverIO 一手（`DriverBinaries.md`）：driver **一律**自動下載除非指定 `binary`，瀏覽器用 `@puppeteer/browsers`（先 `locate-app` 找系統的）；Chrome for Testing 那條路**沒有 mirror 環境變數**，離線預熱要釘死完整版本號否則 `resolveBuildId` 還是要網路。**而 #230 說它買的兩格：一格今天就在守（§2.1），一格 0 個新套件買得到（§2.2）。它獨有的只剩版面／可見性／真焦點。** | **＋provider 套件 ＋ playwright ＋ 一個不在 registry 的二進位**（或一個機器層／映像層的相依）；#230 兩個驗收條件不變 |

---

## 五、失敗模式 → 最便宜的守法（基準 `55b7655`）

沿用 #228 §三 的單位（一個失敗模式＝一個檢查單位）。前九列是 #228 那張表，本稿**不重抄
它的第三欄**，只補「代價」；後五列是這次新量到或第一次列出來的。

| 失敗模式                         | 今天誰在守                                                  | 最便宜的補法（若有洞）                                                                                                    | 新增：套件／runner／registry 外二進位              |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 格式、lint、型別、複雜度（四維） | `vp check` ＋ `vue-typecheck`（#228）                       | —                                                                                                                         | 0／0／0                                            |
| 邏輯錯誤                         | Vitest（#228）                                              | —                                                                                                                         | 0／0／0                                            |
| 規格場景                         | `vitest-cucumber` 打 usecase（#228）                        | —（⚠️ 0 份切片規格時恆綠，#188）                                                                                          | 0／0／0                                            |
| 分層邊界、幽靈依賴               | `conformance`（#228）                                       | —                                                                                                                         | 0／0／0                                            |
| 相容性                           | `api-surface`（#228）                                       | —                                                                                                                         | 0／0／0                                            |
| 測試空心                         | Stryker 清單（#228）                                        | —                                                                                                                         | 0／0／0                                            |
| **Teleport 裡的內容**            | **`alert-dialog`／`dropdown-menu` 在 happy-dom 裡（§2.1）** | —（今天壞掉是 12 條紅）                                                                                                   | 0／0／0                                            |
| **可及名稱（缺陷 vs 非缺陷）**   | 沒人 —— 代理對 M1／M2b 同判、對 M11 綠（C89 §三）           | `dom-accessibility-api`，已在 lockfile（§2.2）                                                                            | **0 新套件**／0／0（＋1 次 `--capture-health`）    |
| **版面、可見性、真焦點**         | 沒人，且 happy-dom 結構性沒有                               | Browser Mode 的 headless provider                                                                                         | ≥2／0（同 runner）／**1**                          |
| API 契約飄移                     | `bff-mock` 參考實作 ＋ `bff-check`                          | —（MSW 那條路 ≥3 套件，還得先有 OpenAPI）                                                                                 | 0／0／0                                            |
| 認知複雜度                       | 沒人（C119：循環複雜度是替代不是填滿）                      | oxlint 1.77.0 內建沒有；只有 alpha 的 JS plugin 路（sonarjs 或 `oxlint-plugin-complexity`），**而 JS plugin 不看 `.vue`** | 1（＋alpha 機制）／0／0，`<script setup>` 仍看不見 |
| 元層對 Browser Mode 檔的可見度   | —（沒導入所以沒問題）                                       | 具名待驗（§四 第 4 列）                                                                                                   | ？                                                 |

**讀法**：十二列裡新增套件為 0 的有十列；剩下兩列，一列是 happy-dom 結構性買不到的
（版面），一列是工具生態根本沒有的（認知複雜度）。**「最少套件」在這棵樹上的答案不是
一份候選清單，是那兩列要不要付錢** —— 而付不付是人的決定（#230、C119 §那一格）。

---

## 六、「屎山」與「最少」怎麼量 —— 本稿不拿前者論證任何事

「不讓腳手架變成屎山」是過度設計論證，C137 §一 明文兩個方向都不准拿它增減閘門；
C156 §九 已經把它的合法落點指到閘門 CLI 的整併。本稿沿用，一個字不加。

「最少」的尺沿用 #228 §三（失敗模式種類，不是 runner 數、工具數、相依層數、記憶體）。
本稿在那把尺上加的只有一句：**同一個失敗模式的守法，要連「新增幾個 lockfile 套件」
一起報** —— §2.2 那一格如果只報「多裝一個套件」會被判成 ＋1，報「lockfile 的 `packages:`
區段 ＋0」才是它的形狀。兩種報法在 #230 那種決定上會給出相反的答案。

---

## 七、本稿自己錯了四次，四次都是對照組擋下來的

| #   | 我做的                                         | 對照組怎麼說                                                                                                                |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | 探針第一版用 `console.log` 印讀數              | `vp test` 的預設 reporter **不印它**：5 條全綠、讀數一行都沒有。**一個沒有讀數的綠燈跟一個完整的綠燈長得一樣。** 改成寫檔   |
| 2   | 普查用 `grep -E 'describe('`                   | 對照組 `describe(` 也是 **0** —— ERE 把 `(` 當群組、錯誤被 `2>/dev/null` 吃掉。改 `grep -F` 之後 287                        |
| 3   | 代價量測用 `pnpm add --offline`                | `ERR_PNPM_NO_OFFLINE_META`（optional 相依的 metadata 不在快取）。改走 registry（noProxy 允許）                              |
| 4   | worktree 裡 `pnpm add --filter` 之後直接跑閘門 | `ERR_MODULE_NOT_FOUND` —— `--filter` 只裝了那一個 package。先 `pnpm install --frozen-lockfile` 再跑，閘門才給出 §2.2 那個紅 |

第 1 條與 C155 §二／C157 §六 是同一個形狀的近親：**一句話（一次執行）宣稱完成，而它要
交付的東西沒有發生。**

---

## 八、打不開的、沒量的、等著的

**egress 擋住（本稿所有引文都不是從這些網址直接讀的）**：x.com 與其鏡像、vitest.dev、
playwright.dev、webdriver.io、mswjs.io、stryker-mutator.io、cucumber.io、gojko.net、
test-utils.vuejs.org、medium.com、dev.to、explainx.ai、artima.com、testing.googleblog.com、
web.archive.org。**替代路徑**：GitHub raw 上的文件原始檔（vitest／playwright／webdriverio／
stryker-js／jest-dom／mswjs）與磁碟上的 README（`@vitest/browser-preview`、`@vitest/browser`、
`@amiceli/vitest-cucumber`、`dom-accessibility-api`）。

**沒量**：Stryker × Browser Mode（文件與程式碼互相矛盾，§四 第 4 列）；happy-dom 對樣式表
class 的 `display:none`（§2.2 只量了 inline）；happy-dom 20.11.2 的 role 計算缺口（那兩個
issue 上的版本是 3.x／13.x）；playwright provider 那條路實際會進 lockfile 幾個套件；
webdriverio 在封閉網路裡的行為；`channel: 'chrome'` 在這棵樹的 CI runner 上有沒有 Chrome。

**等著**：CRAP 公式的 Savoia 2007 原文（Artima thread 210434／210575，2007-07-17／19；連同 Google
Testing Blog 2011 的轉載三個網址都打不開，目前只有 `crap4java`、`cargo-crap` 的 README 與搜尋摘錄這些二手）；
07-23 那串「spot check」那句的獨立 status ID；Stryker × Vue × Browser Mode（issue #5458）有沒有人修。

---

## 九、留給人裁的（不帶預設）

1. **C157 §三 第一列與 #230「它買什麼」第一列的更正**（§2.1）—— 一則 C 的事，本稿不改
   已合併的裁決。順帶：C158 §三 那條規則的第三個案例在這裡。
2. **`dom-accessibility-api` 進不進 `platform/ui` 的 `devDependencies`**（§2.2）—— 走 D16 兩軸；
   進了，`dropdown-menu`／`alert-dialog` 那幾條 ⭐★ 從代理換成 accname，三處「規格來源，
   本 repo 量不到」要改成量過的講法，`dependency-health.json` 要在公網側重擷取一次。
   ⚠️ C89 §一 對慣例那一格的裁決**不因此翻面**。
3. **#230 的題目變窄了**：Browser Mode 剩下獨有的是版面／可見性／真焦點；兩個驗收條件
   （鏡像涵不涵蓋 CDN、四個數字）不變，可能要加第三個：`channel: 'chrome'` 那條路的
   機器層相依要不要登記（R5 的形狀）。
4. **`TESTING.md`「座標來源」那一段要不要補一行指標**：五層是二手歸納；原作者 2026 年的
   立場同時包含「Gherkin 由 agent 產、人審」與「很多時候只用 unit tests＋CRAP」（§三）。
5. **Stryker 對 Browser Mode 檔的可見度**（§四 第 4 列）—— 若 #230 裁導入，這一條變成
   它的驗收條件。

---

## 參考出處

**樹內**（本稿的事實從這裡來，不從本稿來）：

- `platform/ui/tests/alert-dialog.test.ts`：13（SSR 那句）、117–121（`attachTo` 與前置斷言）、
  150（代理註記）、309（★ 探針本身）
- `platform/ui/tests/dropdown-menu.test.ts`：104、157、181
- `platform/ui/src/components/UiDropdownMenu.vue`：69、125；`UiAlertDialog.vue`：169（變異點）
- `pnpm-lock.yaml`：`dom-accessibility-api@0.5.16`（`packages:` 區段）；`tools/supply-chain/src/lockfile.ts`
- `tools/supply-chain/dependency-health.json`（33 筆直接相依）
- `TESTING.md` §一–§三、§五；`DECISIONS.md` C89、C114、C119、C121、C137；
  `DECISIONS-2.md` C142、C154、C156、C157、C158、C159；#228、#230、#231
- `reports/research/test-model-selection-2026-09-01.md`（§三 的量法、§七 的四項無一手來源）

**外部一手（GitHub 原始檔或磁碟上的 README；本稿或 deep-research 的擷取代理親自開過、逐字引用）**：

- `microsoft/playwright` `docs/src/browsers.md`；`packages/injected/src/roleUtils.ts`
- `vitest-dev/vitest` `docs/guide/browser/index.md`、`docs/config/browser/{preview,playwright,webdriverio}.md`；磁碟 `@vitest/browser-preview@4.1.10/README.md`、`@vitest/browser@4.1.10/README.md`
- `webdriverio/webdriverio` `website/docs/DriverBinaries.md`
- `stryker-mutator/stryker-js` `docs/vitest-runner.md`、`docs/incremental.md`、`packages/vitest-runner/CHANGELOG.md`、`packages/vitest-runner/src/vitest-test-runner.ts`；磁碟 `@stryker-mutator/vitest-runner@10.0.0/dist/src`
- `testing-library/jest-dom` `src/to-have-accessible-name.js`
- `eps1lon/dom-accessibility-api` README；磁碟 `dom-accessibility-api@0.5.16`
- `mswjs/source` README；`unclebob/crap4java` README；`AmazingAng/old-coder` README（07-23 貼文的逐字轉錄）
- `oxc-project/oxc` `crates/oxc_linter/src/rules.rs`、`apps/oxlint/conformance/snapshots/sonarjs.md`；`oxc-project.github.io` `js-plugins.md`；磁碟 oxlint 1.77.0 `vp lint --print-config`
- `itaymendel/oxlint-plugin-complexity`、`fabian-barney/crap-typescript` 的 README
- `webdriverio/webdriverio` `packages/wdio-utils/src/node/utils.ts`（cacheDir 與 `resolveBuildId` 的順序）

**外部二手（搜尋引擎摘錄，或 deep-research 代理讀的頁面，本稿沒有親自開）**：

- Uncle Bob 九則貼文（§三 表，逐則附 status）；explainx.ai 2026-07 整理文；
  `unclebob/Acceptance-Pipeline-Specification` parser-spec；`unclebob/swarm-forge`
- `vitalets/playwright-bdd`、`dnotes/quickpickle`、`lotun-io/vitest-cucumber`、
  `amiceli/vitest-cucumber` 的 npm 版本與日期
- MSW recipe「keeping mocks in sync」、`openapi-msw`、Stoplight Prism validation proxy、Pact、
  `express-openapi-validator`
- Stryker issue #6097、#5458、PR #5735（browser-mode 夾具用 `executablePath` 環境變數）
- `vitest-dev/ivya` README；testing-library/dom-testing-library#1137；capricorn86/happy-dom#1122
- Hellesøy、Tooke、Adzic 關於 UI 層 Gherkin 的論述
