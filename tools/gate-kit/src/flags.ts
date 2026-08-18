interface BooleanFlag {
  readonly kind: "boolean";
}

interface ValueFlag {
  readonly kind: "value";
  /** 沒給這個旗標時的值。省略＝呼叫端會拿到 `undefined`。 */
  readonly fallback?: string;
  /** 出現在「後面要接一個…」訊息裡的名詞，例如「目錄」。 */
  readonly noun?: string;
}

/**
 * 鍵是**去掉 `--` 的旗標名，逐字**：`--require-fresh` 的鍵就是 `"require-fresh"`。
 *
 * 刻意不做 camelCase 轉換。轉換等於同一個旗標有兩種拼法，而這個 repo 一再栽在
 * 「同一件事有兩份寫法然後它們漂開」上（C45 的授權清單、卡片 C 的閘門名冊）。
 */
export type FlagSpec = Readonly<Record<string, BooleanFlag | ValueFlag>>;

type FlagValue<F> = F extends BooleanFlag
  ? boolean
  : F extends { kind: "value"; fallback: string }
    ? string
    : string | undefined;

export type Flags<S extends FlagSpec> = { readonly [K in keyof S]: FlagValue<S[K]> };

export type ParseResult<S extends FlagSpec> =
  | { readonly ok: true; readonly flags: Flags<S> }
  | { readonly ok: false; readonly message: string };

/**
 * 解析旗標。**不認得的旗標一律失敗**，這是這個 module 存在的主要理由。
 *
 * ── 為什麼不在這裡 `process.exit` ──────────────────────────────────
 *
 * 被取代的實作是在函式裡直接 `process.exit(1)`，於是那道防線只能靠起行程來測
 * （`pii-check` 有四條 `spawnSync` 測試，其中一條還在斷言訊息的措辭）。那段措辭
 * 一旦共用就必須測得起，所以判定回傳、列印與離開留給 adapter。
 *
 * 呼叫端漏掉 `ok: false` 不會靜靜放行 —— 沒先收窄 `.ok` 就碰 `.flags` 是型別錯誤。
 *
 * ── 為什麼不認得就要紅 ────────────────────────────────────────────
 *
 * C52 把 `--masking` 從 `pii-check` 拿掉之後，`tier2-security.yml` 裡那個步驟被
 * 留了下來。當時那支 CLI 只找 `--root`、其餘無視，於是那一步安靜地把 §11 II ⑥
 * 又掃了一次、回傳 0 —— CI 上是一個叫「個資：畫面上必須隱碼」的綠燈，而 ⑨ 早就
 * 沒有任何東西在守。**一個檢查不存在，比一個檢查失敗糟得多。**
 */
export function parseFlags<S extends FlagSpec>(argv: readonly string[], spec: S): ParseResult<S> {
  const known = Object.keys(spec);
  const values: Record<string, boolean | string | undefined> = {};
  for (const [name, definition] of Object.entries(spec)) {
    values[name] = definition.kind === "boolean" ? false : definition.fallback;
  }

  for (let at = 0; at < argv.length; at += 1) {
    const argument = argv[at];
    if (argument === undefined || !argument.startsWith("--")) continue;

    const name = argument.slice(2);
    const definition = spec[name];
    if (definition === undefined) return { ok: false, message: unknownFlag(argument, known) };

    if (definition.kind === "boolean") {
      values[name] = true;
      continue;
    }

    const value = argv[at + 1];
    if (value === undefined || value.startsWith("--")) {
      return { ok: false, message: `✗ ${argument} 後面要接一個${definition.noun ?? "值"}` };
    }
    values[name] = value;
    at += 1;
  }

  return { ok: true, flags: values as Flags<S> };
}

function unknownFlag(argument: string, known: readonly string[]): string {
  const accepted =
    known.length === 0
      ? "  這支不吃任何旗標。"
      : `  這支只吃 ${known.map((name) => `--${name}`).join("、")}。`;
  return (
    `✗ 不認得的旗標：${argument}\n${accepted}\n` +
    "  會紅是刻意的：被拿掉的旗標留在 CI 裡而被靜靜忽略時，\n" +
    "  那一步會頂著它原本的名字回傳綠燈 —— 而那個名字說的是謊。"
  );
}
