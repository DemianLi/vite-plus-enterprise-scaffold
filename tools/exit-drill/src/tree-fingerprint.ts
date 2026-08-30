/**
 * 演練證據的**樹指紋**：這份證據是不是關於今天這棵樹（C148 §七、C149）。
 *
 * ── 這裡防的是哪一種失敗 ────────────────────────────────────────────
 *
 * 舊的新鮮度檢查只問「幾天前」。於是 2026-08-26 那次併線讓樹變成兩倍大之後，
 * 閘門連續 10 天印的是：
 *
 *     ✓ 退出演練證據有效（2026-08-16，14 天前）
 *
 * 那句話是**肯定句**，而它當時是假的：08-16 那次演練量的是 `release/v1`
 * 那棵樹，是今天這棵的**子集**。一個 120 天的效期讓它還有 106 天可以繼續說。
 *
 * ⚠️ 這是這棵樹反覆記錄的「門檻在子集上校準」的同一個形狀，只是這次量的不是
 * 門檻而是**證據**。日期答不出「同一棵樹嗎」，只有內容答得出來。
 *
 * ── 涵蓋哪些路徑，為什麼不是整棵樹 ──────────────────────────────────
 *
 * 拿 `git rev-parse HEAD` 當指紋會讓**任何一次 commit** 作廢證據 ——
 * 改一個錯字就紅。一道會亂叫的閘門三個月後會被加上 skip，然後永遠不會拿掉
 *（`counts.ts` 檔頭記過同一件事）。
 *
 * 所以涵蓋的是**演練真的會讀到的東西**，兩類：
 *
 *   被量的  `apps/console`、可達的 workspace 套件、`platform/tsconfig`
 *   量法    `tools/exit-drill/src`、`pnpm-workspace.yaml`（catalog 版本）
 *
 * ⚠️ **「量法」那一類刻意在內**：有人改了演練產生設定的方式（例如某一份設定
 * 不再吃 `DRILL_PLUGINS` —— C148 §二 的 B 類就是這個），舊的證據描述的是
 * 另一支演練了。`tools/exit-drill/tests` 不在內：測試不改變演練怎麼跑。
 *
 * ── 讀版控還是讀磁碟：兩邊各取一半 ──────────────────────────────────
 *
 * ⚠️ **檔案清單取自版控（`git ls-files`），內容取自磁碟。** 兩者刻意不同源：
 *
 *   清單走版控 —— 不然本機的一個暫存檔就會讓指紋變動（演練會複製它，
 *                 但它不該讓別人的閘門叫）
 *   內容走磁碟 —— 演練複製的是**磁碟上的內容**。只讀 index 的話，
 *                 一個沒有 `git add` 的改動會讓檢查說「同一棵樹」而其實不是
 *
 * **已知限制，寫在這裡而不是留給下一個人發現**：沒有進版控、而演練會複製的
 * 檔案（未追蹤的新檔）不在指紋裡。它們會被演練量到，卻不會讓指紋變動。
 */

import { createHash } from "node:crypto";

export interface FileDigest {
  /** 相對於 repo 根目錄。指紋要跨機器一致，所以不能用絕對路徑。 */
  readonly path: string;
  readonly sha256: string;
}

export interface Fingerprint {
  readonly hash: string;
  /**
   * 進到指紋裡的檔案數。
   *
   * ⚠️ **這一欄是對照組，不是說明文字。** 少了它，一個「什麼都沒列到」的
   * 列舉會在兩邊各算出**同一個空雜湊**，然後比對相符 —— 一個保證成立的假綠。
   * 這棵樹在「量測台回報假的零」上已經栽了六次。
   */
  readonly files: number;
}

export function fingerprintOf(digests: readonly FileDigest[]): Fingerprint {
  const sorted = [...digests].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash("sha256");
  for (const digest of sorted) hash.update(`${digest.path} ${digest.sha256}\n`);
  return { hash: hash.digest("hex"), files: sorted.length };
}

export type FingerprintVerdict =
  | { readonly kind: "match"; readonly message: string }
  | { readonly kind: "drift"; readonly message: string }
  | { readonly kind: "unrecorded"; readonly message: string }
  | { readonly kind: "empty"; readonly message: string };

/**
 * 比對證據裡記的指紋與今天算出來的。
 *
 * 四種結果分開，因為它們**該被處置的方式不同**：`drift` 是「證據描述的是另一
 * 棵樹」，`unrecorded` 是「這份證據是舊格式的，還不知道」—— 把後者講成前者，
 * 會讓第一次升級的人以為自己弄壞了什麼。
 */
export function compareFingerprint(
  recorded: { readonly treeHash?: string; readonly treeFiles?: number },
  current: Fingerprint,
): FingerprintVerdict {
  if (current.files === 0) {
    return {
      kind: "empty",
      message:
        "算出來的樹指紋涵蓋 0 個檔案 —— 列舉本身壞了。\n" +
        "  （0 個檔案在兩邊會算出同一個空雜湊，然後「相符」—— 所以這裡當成錯誤，不是相符。）",
    };
  }

  if (typeof recorded.treeHash !== "string" || recorded.treeHash === "") {
    return {
      kind: "unrecorded",
      message:
        "這份證據沒有記樹的指紋（C149 之前產生的），所以答不出「它是不是關於今天這棵樹」。\n" +
        "  下一次 --full 會補上。",
    };
  }

  if (recorded.treeHash === current.hash) {
    return {
      kind: "match",
      message: `樹指紋相符（${current.files} 個檔案，${current.hash.slice(0, 12)}）`,
    };
  }

  const before = recorded.treeFiles;
  const delta =
    typeof before === "number" && before !== current.files
      ? `，涵蓋的檔案數從 ${before} 變成 ${current.files}`
      : `，涵蓋 ${current.files} 個檔案（數量沒變，內容變了）`;

  return {
    kind: "drift",
    message:
      `⚠️ 這份證據描述的是**另一棵樹**${delta}。\n` +
      `  證據：${recorded.treeHash.slice(0, 12)}　今天：${current.hash.slice(0, 12)}\n` +
      "  演練量過的東西（apps/console、可達套件）或量法（tools/exit-drill/src）之後被改過。\n" +
      "  ⚠️ 這不表示退出路徑壞了，表示**沒有人量過現在這一棵**。重跑：vpr exit-drill",
  };
}
