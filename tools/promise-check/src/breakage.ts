import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * 規格裡那句「假設」→ 真的把樹弄壞的那段動作。**接線，不是規格。**
 *
 * ── 為什麼這一份是 `.ts` 而規格不是 ────────────────────────────────
 *
 * C117 §四 判的是「規格必須是唯一來源」，不是「不准有程式碼」。
 * 分工與 `slice-gen` 產出的接線檔（`tests/specs/*.spec.ts`）完全一樣：
 * **人讀的是 `.feature`**，這一支只負責把那句中文接到一個動作上，
 * 越薄越好，而且它**不得包含任何承諾**。
 *
 * 判別方法很直接：把這個檔案整份刪掉，`specs/` 底下仍然說得出 v1 承諾了
 * 什麼；反過來把 `.feature` 刪掉，這裡剩下的是一堆沒有人知道為什麼存在的
 * 破壞手法。
 *
 * ── ⚠️ 兩個方向都會紅，而第二個方向才是這份設計的核心 ───────────────
 *
 * 規格有、這裡沒有 → 紅（接不上）。**這裡有、規格沒有 → 也紅**（孤兒）。
 * 少了第二個方向，刪掉一個場景就是「規格悄悄不再要求某件事」，
 * 而閘門全綠 —— `tools/doc-facts` 的 `unguarded`（C97）與
 * `tools/spec-report` 的第四態（C115）記的是同一課。
 *
 * ── ⚠️ 素材是**樹上實際有的切片**，不是寫死的兩個名字 ───────────────
 *
 * 這道閘門會在 fork 的樹上跑（`vpr gate` 裡），而**採用團隊第一件事就是
 * 把示範切片換成自己的**。寫死 `order`／`shipment` 的話，這道閘門會在
 * 他們的樹上噴一個 ENOENT —— 一個關於他們沒做錯的事的錯誤訊息。
 * 同一條教訓在 C95／C97 記過兩次（閘門的紅燈會被拉 v1 的團隊讀到）。
 */

/** 沙盒裡放幾片。⚠️ **兩片，不是一片**：理由見 `makeSandbox`。 */
export const SLICES_NEEDED = 2;

/** 沙盒裡的一片切片：目錄名，以及它在 `package.json` 裡的名字。 */
export interface SliceInfo {
  readonly dir: string;
  readonly pkg: string;
}

export interface Sandbox {
  readonly dir: string;
  readonly slices: readonly SliceInfo[];
}

/**
 * 樹上有哪些切片。
 *
 * ⚠️ 事實來源是 `git ls-files`，不是 `readdirSync` —— 與這條線上其他閘門
 * 同一條規矩（C73／C98）：讀磁碟會把切分支留下的殘骸算進來。
 */
export function trackedSlices(root: string): SliceInfo[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "features/*/package.json"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`[promise-check] git ls-files 失敗：${result.stderr}`);
  }

  const slices: SliceInfo[] = [];
  for (const path of result.stdout.split("\0")) {
    if (path.length === 0) continue;
    const dir = path.split("/")[1];
    if (dir === undefined) continue;
    const pkg = JSON.parse(readFileSync(join(root, path), "utf8")) as { name?: string };
    if (pkg.name === undefined) continue;
    slices.push({ dir, pkg: pkg.name });
  }

  // 排序後取固定的前幾片：換一台機器、換一個檔案系統，素材要是同一批，
  // 否則「上次綠這次紅」會變成一件沒有人能重現的事。
  return slices.sort((a, b) => a.dir.localeCompare(b.dir)).slice(0, SLICES_NEEDED);
}

/**
 * 沙盒契約：切片以外，副本裡還有哪幾層。
 *
 * ⚠️ **這一份是契約，不是最佳化。** 少一層的症狀不是「那一層沒被檢查」，
 * 是被指名的閘門在那一層上**噴 ENOENT 或安靜地掃到 0 個檔** —— 而 0 個檔
 * 在每一條「必須紅」上都長成〈承諾沒有牙齒〉，在對照組上長成綠燈。
 *
 * 逐層的理由：
 *
 * | 層         | 誰在副本上讀它                                              |
 * | ---------- | ----------------------------------------------------------- |
 * | `platform` | `theme-verify` 的元件與代幣；`conformance` 的 CSP 與幽靈依賴 |
 * | `apps`     | 同上（`theme-verify` 的消費端那一半也掃它）                  |
 * | `.github`  | `conformance` 的 `checkActionPinning`                        |
 *
 * ⚠️ **`.github` 是 C127 §二 補的第三層，而它補的是一個沒有人看見的洞**：
 * `checkActionPinning` **無條件執行**，而它開頭是 `if (!existsSync(dir)) return;`
 * —— 副本裡沒有 `.github` 的時候它掃 0 個檔、什麼都不說、然後那道閘門全綠。
 * 那正是這一則其他地方在擋的形狀，只是它藏在一個 early return 裡。
 *
 * ⚠️ **`tools/` 刻意不在裡面。** 閘門自己的素材（`theme-verify` 的
 * `fixtures/`）不隨 `--root` 走 —— 那是 C127 §一 判的：`--root` 指的是
 * **被驗的對象**，不是「這支工具跑在哪」。素材跟著副本走的話，副本裡沒有
 * `node_modules`，而那條路徑上一次量到的是「25 毫秒就爆」。
 *
 * ⚠️ **一層在版控裡是空的，這裡刻意不報錯。** 複製走 `git ls-files`，
 * 所以「複製到 0 個檔」的意思就是「這棵樹上本來就沒有那一層」—— 副本仍然
 * 忠實地反映了真樹，而閘門在真樹上看到的也是同一個「沒有」。
 * 對一個把 `apps/` 換掉的 fork 丟錯，是拿一則關於他們沒做錯的事的錯誤訊息
 * 去換一個這裡本來就守不住的東西（C95／C97 記過這條）。
 * **守這份契約的是 `tests/sandbox.test.ts`**：它逐層比對副本與真樹的檔數 ——
 * 打錯一個層名（`platfrom`）在那裡是紅的。
 */
export const SANDBOX_LAYERS = ["platform", "apps", ".github"] as const;

/**
 * 副本裡還要有哪幾個**根層檔案**。
 *
 * ⚠️ 與 `SANDBOX_LAYERS` 分開，不是為了整齊：`tests/sandbox.test.ts` 對層做的是
 * 「遞迴數檔案」，對一個檔案做那件事會 ENOTDIR。兩種素材的驗法本來就不同。
 *
 * `vite.config.ts` 是 C163 補的 —— `tools/threshold-check` 被驗的對象就是這個
 * 檔案裡那幾格門檻的數字，副本裡沒有它，那道閘門在副本上只會說「這裡沒有設定檔」。
 */
export const SANDBOX_FILES = ["vite.config.ts"] as const;

/**
 * 把版控裡 `dir` 底下的檔案複製過去。
 *
 * ⚠️ **事實來源是 `git ls-files`，不是 `cpSync` 遞迴**（C73／C98 那條規矩，
 * `trackedSlices` 已經照著做）。差別在切分支留下的殘骸：磁碟上多一個
 * `platform/ui/src/components/Foo.vue`，`theme-verify` 在副本上就會數到
 * 一個真樹沒有的元件 —— 而那個數字正是承諾要比對的東西。
 * 順帶把 `node_modules`／`dist` 濾掉了：它們本來就不在版控裡。
 */
function copyTracked(root: string, dir: string, dest: string): void {
  const result = spawnSync("git", ["ls-files", "-z", "--", dir], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`[promise-check] git ls-files ${dir} 失敗：${result.stderr}`);
  }

  for (const path of result.stdout.split("\0")) {
    if (path.length === 0) continue;
    const from = join(root, path);
    // 版控裡有、磁碟上沒有：切到一半的 rebase、或者有人手動刪了檔還沒 commit。
    // 副本少一個檔，而 `tests/sandbox.test.ts` 的逐層檔數比對會說話。
    if (!existsSync(from)) continue;
    const to = join(dest, path);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
}

/**
 * 建一份副本。
 *
 * ⚠️ **改副本，不改 repo** —— repo 的原始碼一個位元組都不會被動到。
 * 這一條是這道閘門敢在 `vpr gate` 裡跑的全部理由：它會在**別人的樹上**跑。
 *
 * ⚠️ **一定要兩片。** D4 第 1 層不用正則猜「什麼是切片」，它讀 `features/`
 * 的實際內容建立事實名單。沙盒裡只放一片的話，另一片的套件名就不在名單上，
 * 「跨切片依賴」那條**永遠測不出來** —— 而閘門會顯示綠燈。
 * （`tools/conformance/tests/negative.test.ts` 的第一版就是這樣，那次的
 * 註解裡寫著這個理由、然後照樣斷言它會紅。）
 *
 * ⚠️ **`SANDBOX_LAYERS` 是 C127 §二 補進來的，而它補的不是「更完整」。**
 * 在此之前副本裡只有切片：`theme-verify` 指過去會在 `platform/ui/src/components`
 * 上 ENOENT，`conformance` 的 CSP 那條、幽靈依賴那條與 action 釘版本那條
 * 在副本上掃 0 個目錄 —— 三者都不是「那裡沒有違規」，是**沒有人看**。
 */
export function makeSandbox(root: string, slices: readonly SliceInfo[]): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), "promise-check-"));

  for (const slice of slices) copyTracked(root, `features/${slice.dir}`, dir);
  for (const layer of SANDBOX_LAYERS) copyTracked(root, layer, dir);
  for (const file of SANDBOX_FILES) copyTracked(root, file, dir);

  writeFileSync(
    join(dir, "CODEOWNERS"),
    slices.map((slice) => `/features/${slice.dir}/ @org/team-${slice.dir}\n`).join(""),
  );

  return { dir, slices };
}

function slicePath(sandbox: Sandbox, index: number, relative: string): string {
  const slice = sandbox.slices[index];
  if (slice === undefined) throw new Error(`[promise-check] 沙盒裡沒有第 ${index + 1} 片切片`);
  return join(sandbox.dir, "features", slice.dir, relative);
}

/**
 * 在一個檔案的某個錨點後面插一行。
 *
 * ⚠️ 找不到錨點就**丟錯**，不是安靜跳過：那代表這條承諾其實什麼都沒破壞，
 * 而它會「通過」。前身（conformance 的反向測試）就是用字串比對換程式碼，
 * 切片一改寫法那條就靜靜失效了。
 */
function insertAfter(path: string, anchor: string, line: string): void {
  const lines = readFileSync(path, "utf8").split("\n");
  // ⚠️ 以**行**為單位插入，不是字串取代：`<script setup lang="ts">` 這種錨點
  // 只比對前半段，取代會把那一行從中間切開，插出一個語法錯誤的檔案 ——
  // 而那時閘門確實會紅，只是紅的原因與承諾無關。
  const index = lines.findIndex((text) => text.includes(anchor));
  if (index < 0) {
    throw new Error(
      `[promise-check] 在 ${path} 找不到錨點：${anchor}\n` +
        "  切片的寫法變了。改這裡的錨點，不要改規格 —— 承諾沒有變。",
    );
  }
  lines.splice(index + 1, 0, line);
  writeFileSync(path, lines.join("\n"));
}

/**
 * 設定裡第一格複雜度門檻的數字。
 *
 * ⚠️ 只認 `["error"|"warn", { <選項>: <數字> }]` 這個形狀，與
 * `tools/threshold-check/src/config.ts` 的 `RULE_LINE` 同一種寫法 ——
 * 兩邊各自寫死是刻意的：這裡是**接線**，去 import 那支工具的內部樣式
 * 等於讓被驗的對象自己決定要被怎麼弄壞。
 */
const THRESHOLD = /(:\s*\[\s*"(?:error|warn)"\s*,\s*\{\s*\w+\s*:\s*)(\d+)(\s*\}\s*\])/u;

/**
 * 把副本裡第一格門檻抬到沒有人碰得到的高度。
 *
 * ⚠️ **抬，不是降。** 降下去只會讓那道閘門報「被超過」，而那條紅燈說的是
 * 另一件事（去看 `vp check`）。承諾要問的是**過期**：門檻留在舊高度，
 * 而實測最大值早就掉下來了。
 *
 * ⚠️ 找不到就丟錯，不是安靜跳過 —— 那代表這條承諾其實什麼都沒破壞，而它會「通過」。
 */
function raiseFirstThreshold(sandbox: Sandbox): void {
  const path = join(sandbox.dir, "vite.config.ts");
  const source = readFileSync(path, "utf8");
  const match = THRESHOLD.exec(source);
  if (match === null) {
    throw new Error(
      `[promise-check] 在 ${path} 找不到任何一格複雜度門檻。\n` +
        "  設定的寫法變了。改這裡的樣式，不要改規格 —— 承諾沒有變。",
    );
  }
  const raised = Number(match[2]) + 900;
  writeFileSync(path, source.replace(THRESHOLD, `$1${String(raised)}$3`));
}

/** 這一片的第一個 view。⚠️ 檔名各案不同，所以用掃的，不寫死。 */
function firstView(sandbox: Sandbox): string {
  const dir = slicePath(sandbox, 0, "src/views");
  const view = readdirSync(dir)
    .filter((name) => name.endsWith(".vue"))
    .sort()[0];
  if (view === undefined) throw new Error(`[promise-check] ${dir} 底下沒有 .vue`);
  return join(dir, view);
}

/**
 * 「假設」那一句 → 動作。**鍵要與 `.feature` 裡的句子逐字相同。**
 *
 * ⚠️ 加一條的順序是**先寫規格**（人話），再補這裡。反過來做的話，
 * 這張表會長出沒有承諾支撐的破壞手法 —— 而那是紅燈（孤兒）。
 */
export const BREAKAGES: ReadonlyMap<string, (sandbox: Sandbox) => void> = new Map([
  [
    "一片切片的 package.json 宣告了對另一片切片的相依",
    (sandbox: Sandbox) => {
      const other = sandbox.slices[1];
      if (other === undefined) throw new Error("[promise-check] 需要第二片切片當相依對象");

      const path = slicePath(sandbox, 0, "package.json");
      const pkg = JSON.parse(readFileSync(path, "utf8")) as {
        dependencies: Record<string, string>;
      };
      pkg.dependencies[other.pkg] = "workspace:*";
      writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
    },
  ],
  [
    "一片切片的 view 直接 import 了自己的資料層",
    (sandbox: Sandbox) => {
      // `<script setup>` 那一行是 SFC 的定義，比任何一句 import 都穩。
      insertAfter(firstView(sandbox), "<script setup", 'import { fetchAll } from "../api.ts";');
    },
  ],
  [
    "一片切片 import 了自己 package.json 沒有宣告的套件",
    (sandbox: Sandbox) => {
      const path = slicePath(sandbox, 0, "src/index.ts");
      writeFileSync(path, `import { cloneDeep } from "lodash-es";\n${readFileSync(path, "utf8")}`);
    },
  ],
  ["有人把一格複雜度門檻調高到沒有人碰得到", raiseFirstThreshold],
  [
    // ⚠️ 這一條與上面那個空的破壞手法**不能共用**：鍵要與規格的句子逐字相同，
    // 而兩份規格各有自己的對照組句子。合成一條的話，刪掉其中一份規格的對照組
    // 不會變成孤兒 —— 另一份還在用它，於是「規格悄悄少了對照組」全綠。
    "一份沒有被動過的門檻設定",
    () => {},
  ],
  [
    // ⚠️ 什麼都不做，而這一條**必須存在**：它是「沒有違規時不得紅」那條承諾的接線。
    // 沙盒本身壞掉（少複製一個檔、CODEOWNERS 沒寫）的話，上面每一條都會
    // 「成功變紅」—— 而原因是環境壞了，不是閘門有牙齒。
    "一份沒有被動過的切片副本",
    () => {},
  ],
]);
