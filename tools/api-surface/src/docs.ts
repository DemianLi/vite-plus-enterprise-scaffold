import type { EntrySurface } from "./shape.ts";

/**
 * 把 `surface.json` 的形狀渲染成人讀得懂的參考（C100）。
 *
 * ── 為什麼需要這一支 ──────────────────────────────────────────────────
 *
 * 採用演練（`#95`）：**27 個元件，零份使用說明** —— 要知道 `UiField` 收哪些
 * prop，唯一的路是打開 `.vue` 原始碼。那一步花掉的時間比前面所有步驟加起來還多。
 *
 * ⚠️ **修法刻意不是手寫。** 手抄 27 個元件的 prop 名字，正是這個 repo
 * 一再栽跟頭的那件事（`facts.ts` 檔頭列了六次）—— 而這一次連抄的必要都沒有：
 * `surface.json` 已經逐個 export 記著形狀，而且**由 `api-surface` 閘門守著**。
 * 鏈條是 `platform/` 原始碼 → `surface.json`（閘門守）→ 這份參考（閘門守）。
 *
 * ── ⚠️ 這是形狀，不是用法 ────────────────────────────────────────────
 *
 * 它回答「有哪些 export、prop 叫什麼、型別是什麼」。
 * **不回答**「為什麼這樣設計、怎麼接線」—— 那些寫在元件原始碼的檔頭註解裡，
 * 而且寫得比這裡詳細（演練的人自己說「原始碼的註解品質很高」）。
 * 產出的檔案第一段就講明這件事：宣稱得比做到的多，是這個 repo 這一輪
 * 反覆在修的病。
 *
 * ── ⚠️ 區塊**不標語言**，因為那些字串不是合法的 TypeScript ───────────
 *
 * 第一版標了 ```ts，而 formatter 當場把它們當程式格式化：`"/api"` 變成
 * `"/api";`、成員清單被加上分號。那不是 formatter 壞掉 —— 是**標籤在說謊**：
 * `[slot default]: (): VNode[]` 不是任何 TS 語句，這些是**形狀字串**不是程式。
 *
 * 修法不是去 `vp fmt` 收尾（`--update` 對 `surface.json` 是那樣做的），
 * 而是不要宣稱它是 TS。⚠️ 若改回標 `ts`，`vpr ready` 會在
 * 「`API.md` 與基準對不上」那裡紅 —— 因為 formatter 會改寫產物。
 *
 * ── 為什麼是程式碼區塊，不是表格 ──────────────────────────────────────
 *
 * 表格好掃，但要把 `tone?: "info" | "success"` 拆成「名字」與「形狀」兩欄，
 * 就得去找「第一個不在方括號裡的冒號」—— 而成員裡真的有
 * `[emit update:open]: void` 這種東西。**一個為了排版而存在的解析器，
 * 是一個會安靜出錯的解析器。** 原樣印出去，錯不了。
 * （順帶：最長的五個成員是函式簽章，表格欄位會把它們折得更難讀。）
 */

const HEADER = `# platform/ API 形狀參考

> ⚠️ **這份檔案是產生出來的，不要手改。**
> 來源是 \`tools/api-surface/surface.json\`，而那份基準由 \`platform/\` 的原始碼
> 推導、由 \`api-surface\` 閘門守著。改法：
>
> \`\`\`bash
> node tools/api-surface/src/cli.ts --update
> \`\`\`
>
> ⚠️ **這是形狀參考，不是使用說明。**
> 它回答「有哪些 export、prop 叫什麼、型別是什麼」。
> 它**不**回答「為什麼這樣設計、怎麼接線」—— 那些寫在原始碼的檔頭註解裡
> （元件在 \`platform/ui/src/components/*.vue\`），而且比這裡詳細得多。
> 要動手做一個畫面，先讀 \`HANDOFF.md\`〈從這裡到第一個能操作的畫面〉。
`;

/** 一個進入點底下所有 export 的形狀。 */
export type Surface = Record<string, EntrySurface>;

function renderExport(name: string, entry: EntrySurface[string]): string {
  const body = entry.members !== undefined ? [...entry.members].join("\n") : (entry.type ?? "");
  return `### \`${name}\` — ${entry.kind}\n\n\`\`\`\n${body}\n\`\`\`\n`;
}

/**
 * ⚠️ **排序不靠 `surface.json` 的鍵順序。** 那份檔案由 `--update` 寫出、
 * 再交給 `vp fmt` —— 順序是那條路徑的產物，不是這份文件的契約。
 * 這裡自己排一次，產出才不會因為上游換個寫法就整份洗牌。
 */
export function renderReference(surface: Surface): string {
  const sections = Object.keys(surface)
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => {
      const members = surface[entry] ?? {};
      const exports = Object.keys(members)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => renderExport(name, members[name]!))
        .join("\n");
      return `## \`${entry}\`\n\n${exports}`;
    });

  return `${HEADER}\n${sections.join("\n---\n\n")}`;
}
