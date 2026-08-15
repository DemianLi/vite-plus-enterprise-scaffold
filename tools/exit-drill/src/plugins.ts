/**
 * 退出演練的 plugin 帳目：演練「重現了什麼」與「刻意丟掉什麼」。
 *
 * ── 這裡防的是哪一種失敗 ────────────────────────────────────────────
 *
 * `--full` 不是拿 `apps/console/vite.config.ts` 去跑 —— 那份設定 import 了
 * vite-plus，而整場演練的重點就是不要它。演練改成**重新產生**一份設定，
 * 於是 plugin 清單變成寫死在這個 repo 裡的東西。
 *
 * 由此長出一個安靜的失敗模式，而且它比看起來嚴重：
 *
 *   有人在 apps/console/vite.config.ts 加了一個會改變**建置產物**的 plugin
 *   （CSS 框架、圖片處理、i18n 訊息編譯、SVG 元件化⋯⋯），演練不知道它存在，
 *   於是產生一份沒有它的設定、建置成功、exit 0、寫下 result: "pass"。
 *
 *   產物是錯的，演練說它是對的。而這件事只有在**真的要退出 vite-plus 那天**
 *   才會被發現 —— 也就是最不能出錯的那一天。
 *
 * 這正是 C33／C34 的同一條教訓：閘門的顏色只證明它跑完了，不證明它看到了東西。
 *
 * 因此每一個出現在退出面設定檔裡的 plugin 都必須在下面兩張表之一登記：
 * 要嘛演練重現它（`DRILL_PLUGINS`），要嘛明確寫下丟掉它為什麼不會讓演練說謊
 *（`DROPPED_PLUGINS`）。沒登記的一律紅燈。
 *
 * 判準只有一條：**這個 plugin 會不會改變建置產物？** 會，就必須被重現。
 *
 * ── 為什麼獨立成一個模組 ────────────────────────────────────────────
 *
 * `cli.ts` 的最後一行是 top-level 的 `process.exit(...)`，測試一旦 import 它
 * 就會把 vitest 整個殺掉。純邏輯放這裡、副作用留在 cli.ts —— 與
 * `tools/supply-chain` 的切法一致。
 */

export interface DrillPlugin {
  /** 設定檔裡呼叫的識別字，例如 `vue()` 的 `vue`。 */
  readonly name: string;
  /** npm 套件名，會進合成的 package.json。 */
  readonly module: string;
  readonly importLine: string;
}

/** 演練重新產生的設定裡實際註冊的 plugin。加一筆就等於把它納入退出保證。 */
export const DRILL_PLUGINS: readonly DrillPlugin[] = [
  {
    name: "vue",
    module: "@vitejs/plugin-vue",
    importLine: 'import vue from "@vitejs/plugin-vue";',
  },
  {
    // D15。**必須重現**：它把 @org/ui 的 Tailwind class 編譯成實際的 CSS。
    // 不重現的話演練會產出一個沒有樣式的應用然後回報 pass —— 正是 C36 的形狀。
    name: "tailwindcss",
    module: "@tailwindcss/vite",
    importLine: 'import tailwindcss from "@tailwindcss/vite";',
  },
];

/** 演練刻意不重現的 plugin。理由必須說明「丟掉它為什麼不影響產物」。 */
export const DROPPED_PLUGINS: readonly { readonly name: string; readonly reason: string }[] = [
  {
    name: "securityHeaders",
    reason:
      "只在 dev server 掛中介層送回應標頭，不參與 transform。production 的標頭由 " +
      "gateway／BFF 下發，本來就不在建置產物裡。",
  },
  {
    name: "assertStaticCspCompatible",
    reason:
      "是一道檢查而不是轉換：它讀產物、在出現 inline script 時中止，自己不產生任何輸出。" +
      "丟掉它只是少跑一次檢查，產物一個位元組都不會變。",
  },
];

/**
 * 抓出設定檔 `plugins: [...]` 陣列裡註冊了哪些 plugin。
 *
 * 手寫掃描器而不是正則，因為兩件事會讓正則出錯，而且是安靜地出錯：
 *   1. 設定檔裡有 `"http://localhost:8080"` 這種字串 —— 天真的去註解會從 `//`
 *      把後半行吃掉，於是那一段的括號配對全亂、陣列尾巴不見。
 *   2. `securityHeaders({ reportUri: "/api/csp-report" })` 帶物件參數 ——
 *      不配對括號就分不出哪些識別字是陣列成員、哪些只是參數裡的鍵。
 *
 * 已知限制：陣列裡若出現含括號的**正則字面值**（`/a(b)/`），括號計數會失準。
 * 目前的設定檔沒有，真出現了寧可誤報也不漏報 —— 漏報的代價見本檔開頭。
 */
export function parseConfiguredPlugins(source: string): readonly string[] {
  const found = new Set<string>();
  // 掃**每一個** `plugins: [`，不是只掃第一個。根目錄的 vite.config.ts 裡
  // `lint: { plugins: ["import", …] }` 排在前面 —— 只取第一個命中的話，
  // 之後有人在同一份檔案加上真正的 vite plugins 陣列，這道檢查會完全看不到。
  //（oxlint 那個陣列裝的是字串、後面不接 `(`，因此本身不會產生誤報。）
  for (const start of source.matchAll(/plugins\s*:\s*\[/g)) {
    if (start.index === undefined) continue;
    scanPluginArray(source, start.index + start[0].length - 1, found);
  }
  return [...found];
}

function scanPluginArray(source: string, from: number, found: Set<string>): void {
  let bracket = 0;
  let paren = 0;
  let brace = 0;

  for (let i = from; i < source.length; i++) {
    const char = source[i] as string;
    const next = source[i + 1];

    if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      i++;
      while (i < source.length && source[i] !== char) {
        if (source[i] === "\\") i++;
        i++;
      }
      continue;
    }

    if (char === "[") {
      bracket++;
      continue;
    }
    if (char === "]") {
      bracket--;
      if (bracket === 0) break;
      continue;
    }
    if (char === "(") {
      paren++;
      continue;
    }
    if (char === ")") {
      paren--;
      continue;
    }
    if (char === "{") {
      brace++;
      continue;
    }
    if (char === "}") {
      brace--;
      continue;
    }

    // 括號或大括號裡的識別字是**參數**，不是 plugin，跳過。
    // 但方括號只要求「在陣列裡」而不是「恰好第一層」：Vite 允許
    // `plugins: [[a(), b()], vue()]` 這種巢狀寫法，卡死在第一層會讓
    // 巢狀陣列裡的 plugin 整批隱形 —— 那正是這道檢查要防的漏報。
    if (bracket < 1 || paren !== 0 || brace !== 0) continue;
    if (!/[A-Za-z_$]/.test(char)) continue;

    let end = i;
    while (end < source.length && /[A-Za-z0-9_$]/.test(source[end] as string)) end++;
    let after = end;
    while (after < source.length && /\s/.test(source[after] as string)) after++;
    // 只有後面接 `(` 的才是 plugin 呼叫；`plugins: [...base]` 這種展開不算。
    if (source[after] === "(") found.add(source.slice(i, end));
    i = end - 1;
  }
}

export interface ConfigSource {
  /** 相對於 repo 根目錄的路徑，只用在錯誤訊息上。 */
  readonly path: string;
  readonly source: string;
}

/**
 * 核對帳目。回傳錯誤訊息，空陣列＝通過。
 *
 * 刻意收檔案**內容**而不是路徑：讀檔留在 cli.ts，這裡保持純函式，
 * 才有辦法用人造字串把每一種違規都測過一次。
 */
export function accountPlugins(configs: readonly ConfigSource[]): readonly string[] {
  const errors: string[] = [];
  const carried = new Set(DRILL_PLUGINS.map((plugin) => plugin.name));
  const dropped = new Set(DROPPED_PLUGINS.map((plugin) => plugin.name));

  // 同一個名字同時登記在兩張表 ＝ 帳目自相矛盾，而且會讓上面的判準失去意義。
  for (const name of carried) {
    if (dropped.has(name)) errors.push(`plugin "${name}" 同時登記為「重現」與「丟棄」`);
  }

  for (const config of configs) {
    for (const name of parseConfiguredPlugins(config.source)) {
      if (carried.has(name) || dropped.has(name)) continue;
      errors.push(`${config.path} 註冊了未登記的 plugin：${name}()`);
    }
  }

  return errors;
}
