/**
 * 公開設定的**唯一**出口（D8）。
 *
 * 要解決的問題：`import.meta.env.VITE_*` 的值會被編譯進 production bundle 的明文。
 * 很多團隊把 API key 塞進 VITE_API_KEY，以為 .env 沒進 git 就安全 ——
 * 實際上它躺在線上的 JS 檔裡，gitleaks 掃 build artifact 或按 F12 就撿得到。
 *
 * 這裡的機制不是「提醒大家別這樣做」，是**讓做不到**：
 *
 *   1. 只有下面白名單裡的 key 可以被讀取，型別擋住其餘存取
 *   2. 建置期若偵測到未宣告的 VITE_ 變數，直接讓建置失敗（見 assertNoUndeclaredEnv）
 *
 * 機密一律不進前端。需要機密的呼叫走 BFF（D8），由伺服器端持有。
 */

/**
 * 允許進入 bundle 的公開設定。
 *
 * 新增一筆等於公開宣告「這個值可以被任何人看到」——
 * 這是 code review 上看得見的一行 diff，正是我們要的摩擦。
 */
const PUBLIC_ENV_KEYS = ["VITE_APP_TITLE", "VITE_API_BASE_PATH", "VITE_BUILD_SHA"] as const;

type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];

/** 一望即知是機密的命名。命中就讓建置失敗，訊息直接說明該怎麼改。 */
const SECRET_LOOKING = /(SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|PRIVATE|APIKEY)/i;

/**
 * 建置期閘門。在 apps 的 vite.config.ts 裡呼叫。
 *
 * 白名單本身只能擋住「讀」；這個函式擋住「寫」——
 * 有人在 .env 加了 VITE_API_SECRET 卻沒改這個檔案時，建置直接失敗。
 */
export function assertNoUndeclaredEnv(env: Record<string, string>): void {
  const declared = new Set<string>(PUBLIC_ENV_KEYS);
  const problems: string[] = [];

  for (const key of Object.keys(env)) {
    if (!key.startsWith("VITE_")) continue;

    if (SECRET_LOOKING.test(key)) {
      problems.push(
        `  ✗ ${key}\n` +
          `      命名顯示這是機密。VITE_ 前綴的值會被編譯進 bundle 明文，任何人都看得到。\n` +
          `      機密不得進入前端 —— 請改由 BFF 持有，前端透過 /api 呼叫（D8）。`,
      );
      continue;
    }

    if (!declared.has(key)) {
      problems.push(
        `  ✗ ${key}\n` +
          `      未在 platform/config 的 PUBLIC_ENV_KEYS 宣告。\n` +
          `      若此值確實可公開，請加入白名單（該 diff 需經 review）；否則移到 BFF。`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`\n[platform/config] 環境變數未通過公開性檢查：\n\n${problems.join("\n\n")}\n`);
  }
}

function read(key: PublicEnvKey): string {
  const value = import.meta.env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`[platform/config] 缺少必要的公開設定 "${key}"。請檢查 .env 或部署環境。`);
  }
  return value;
}

/**
 * 刻意使用 getter 而非模組載入時就求值。
 *
 * 模組層級直接讀取會讓「import 這個模組」等同「要求環境完整」——
 * 任何只想用到其中一個欄位的測試、或只是為了取型別的 import，都會被迫準備全套
 * 環境變數。改成 getter 後，缺值仍會在**實際使用**的那一刻失敗，
 * 錯誤訊息也更能指出是誰要這個值。
 */
export const config = {
  get appTitle(): string {
    return read("VITE_APP_TITLE");
  },
  /** BFF 的同源路徑前綴。必須同源，否則 SameSite cookie 形同虛設（D8）。 */
  get apiBasePath(): string {
    return read("VITE_API_BASE_PATH");
  },
  get buildSha(): string {
    return read("VITE_BUILD_SHA");
  },
} as const;

export type AppConfig = typeof config;
