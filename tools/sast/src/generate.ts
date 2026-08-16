import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 從切片契約的 `personalData` 產生 SAST 規則。
 *
 * ── 為什麼這一條非得用產生的不可 ────────────────────────────────────
 *
 * 廠商的源碼檢測掃得到「有東西被寫進 localStorage」「有東西被 console.log」，
 * 但它**不知道哪些欄位是個資** —— 那個知識只存在於這個 repo 的
 * `Feature.personalData` 裡。
 *
 * 手寫規則的話，加一個個資欄位就要記得回來改 YAML，而沒有人會記得。
 * 產生出來、進版控、閘門比對 —— 與 `COMPLIANCE.md` 完全同一個形狀。
 *
 * ── 為什麼是 log／storage／URL 這三個 sink ──────────────────────────
 *
 * 它們的共同點是**個資會離開畫面而且留下來**：
 *
 *   console／logger → 進前端錯誤追蹤系統，而那通常是第三方（跨境傳輸）
 *   localStorage    → 留在使用者裝置上，登出也不會消失
 *   URL query       → 進瀏覽器歷史、Referer 標頭、以及所有中間的 access log
 *
 * 第三個最常被忽略，而它是唯一會把個資送給**第三方伺服器**的那一個。
 */

export interface SliceFields {
  readonly slice: string;
  readonly fields: readonly string[];
}

/** 只認字面陣列 —— 與 `tools/pii-check` 同一條理由：宣告要能被人一眼看完。 */
export function parsePersonalData(source: string): readonly string[] | null {
  const match = /personalData\s*:\s*\[([^\]]*)\]/.exec(source);
  if (match === null) return null;
  const body = (match[1] ?? "").trim();
  if (body === "") return [];
  const fields: string[] = [];
  for (const piece of body.split(",")) {
    const value = piece.trim();
    if (value === "") continue;
    const quoted = /^"([\w.$]+)"$/.exec(value) ?? /^'([\w.$]+)'$/.exec(value);
    if (quoted === null) return null;
    fields.push(quoted[1] as string);
  }
  return fields;
}

export function collectFields(root: string): readonly SliceFields[] {
  const featuresDir = join(root, "features");
  const found: SliceFields[] = [];
  for (const slice of readdirSync(featuresDir)) {
    // macOS 會在目錄裡塞 .DS_Store，而它不是切片。
    if (!statSync(join(featuresDir, slice)).isDirectory()) continue;
    const index = join(featuresDir, slice, "src/index.ts");
    const fields = parsePersonalData(readFileSync(index, "utf8"));
    if (fields === null || fields.length === 0) continue;
    found.push({ slice, fields });
  }
  return found;
}

/**
 * 產生的 YAML。**排序是刻意的**：這份檔案進版控，順序隨檔案系統走的話，
 * 同一份原始碼在不同機器上會產出不同的檔案，閘門會報「不同步」而其實沒變。
 * 這與 `inventory.json` 不用 `localeCompare` 是同一條理由。
 */
export function renderRules(slices: readonly SliceFields[]): string {
  const all = [...new Set(slices.flatMap((entry) => entry.fields))].sort();
  const owners = slices
    .map((entry) => `#   ${entry.slice}: ${[...entry.fields].sort().join("、")}`)
    .sort();

  if (all.length === 0) {
    return [
      "# 產生的檔案，不要手改。事實來源：features/*/src/index.ts 的 personalData。",
      "# 目前沒有任何切片宣告個資欄位 —— 所以這裡沒有規則。",
      "#",
      "# ⚠️ 這不代表通過。它代表「沒有東西需要守」，而那是一個會變的狀態：",
      "#    第一個宣告個資欄位的切片進來時，重跑 vpr sast-rules 就會長出規則。",
      "rules: []",
      "",
    ].join("\n");
  }

  const patterns = all.flatMap((field) => [
    `      - pattern: console.$METHOD($$$A, $X.${field}, $$$B)`,
    `      - pattern: console.$METHOD($X.${field})`,
    `      - pattern: localStorage.setItem($$$K, $X.${field})`,
    `      - pattern: sessionStorage.setItem($$$K, $X.${field})`,
    `      - pattern: $PARAMS.set($$$K, $X.${field})`,
    `      - pattern: $PARAMS.append($$$K, $X.${field})`,
  ]);

  return [
    "# 產生的檔案，不要手改。",
    "# 事實來源：features/*/src/index.ts 的 personalData（§11 II ⑨）。",
    "# 重新產生：node tools/sast/src/cli.ts --update",
    "#",
    "# 目前宣告為個資的欄位：",
    ...owners,
    "rules:",
    "  - id: personal-data-leaves-the-screen",
    "    languages: [typescript, javascript]",
    "    severity: ERROR",
    "    message: >-",
    "      宣告為個資的欄位被送進 log／localStorage／URL query。",
    "      三者的共同點是個資會離開畫面而且留下來：log 通常進第三方錯誤追蹤",
    "      （跨境傳輸）、localStorage 登出也不會消失、URL query 會進瀏覽器歷史、",
    "      Referer 標頭與沿途每一個 access log。",
    "      要記錄的話請先用 @org/pii 的 maskXxx() 處理。",
    "    pattern-either:",
    ...patterns,
    "    paths:",
    "      exclude:",
    "        - '**/tests/**'",
    "",
  ].join("\n");
}
