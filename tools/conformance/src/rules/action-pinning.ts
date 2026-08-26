import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { collect, type Finding } from "../finding.ts";

/**
 * CI 的 action 必須以 **commit SHA** 釘住，不能用標籤。
 *
 * ── 為什麼這一條住在一致性檢查裡 ────────────────────────────────────
 *
 * 這個 repo 對 npm 相依做到：每一個套件都帶 sha512、`--frozen-lockfile` 安裝、
 * tarball digest 進版控且每次 gate 比對、原生二進位逐一分佐證等級。
 *（這裡刻意不寫數量 —— `doc-facts` 只守 `.md`，寫在原始碼註解裡的數字
 * 沒有任何東西會在它過期時說話，而它一定會過期。）
 *
 * 而在這條規則存在之前，**執行那整套論證的 CI 自己是用標籤釘的**。
 * `actions/checkout@v7` 的 `v7` 是一個可以被發佈者移動的指標：重指之後
 * 下一次 CI 就執行新的內容 —— **沒有 commit、沒有 PR、沒有 diff**。
 * 而這些 action 跑在產出 SBOM 與證據檔的那個 job 裡，拿得到 repo 與 secrets。
 *
 * 也就是說：供應鏈的論證停在 npm 邊界，而它的執行環境是唯一沒有被論證的一層。
 *
 * ── 為什麼是閘門，不是「改完 16 行就結束」──────────────────────────
 *
 * 把現有的 16 行改成 SHA 是一個**快照**。讓它保持為真的是這道檢查 ——
 * 否則下一個人加一行 `uses: foo@v1`，而沒有任何東西會說話。
 * 判準是那條一路在用的：**沒有強制機制的狀態不叫控制**。
 *
 * ⚠️ **已知範圍限制，刻意不假裝守得住**：這條只看 `uses:`。
 * `run:` 裡的容器映像（例如 SAST 那兩步的 `semgrep/semgrep@sha256:...`）
 * **不在檢查範圍內** —— 那需要在 shell 腳本裡認出映像參考，而任何做得到
 * 那件事的正則都會對路徑與網址誤報。映像目前是手動用 digest 釘的，
 * 而「手動釘的東西」正是這道檢查存在的理由，所以這個缺口寫在 HANDOFF 第 23 項。
 */
const WORKFLOWS_DIR = ".github/workflows";
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const USES_LINE = /^\s*-?\s*uses:\s*(\S+)/;

export function checkActionPinning(root: string): Finding[] {
  return collect((fail) => {
    const dir = join(root, WORKFLOWS_DIR);
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
      const file = join(dir, entry);
      const label = `${WORKFLOWS_DIR}/${entry}`;

      for (const line of readFileSync(file, "utf8").split("\n")) {
        const match = USES_LINE.exec(line);
        if (match === null) continue;
        const reference = match[1] ?? "";

        // 同一個 repo 內的 action 走相對路徑，沒有版本的概念。
        if (reference.startsWith("./") || reference.startsWith(".\\")) continue;
        // docker://image@sha256:... 已經是 digest，放行；標籤形式會落到下面。
        if (reference.startsWith("docker://") && reference.includes("@sha256:")) continue;

        const at = reference.lastIndexOf("@");
        const pinned = at !== -1 && COMMIT_SHA.test(reference.slice(at + 1));
        if (pinned) continue;

        fail(
          label,
          "action 未以 SHA 釘住",
          `${reference} 用的是可移動的參考`,
          "改成 40 位 commit SHA 並在後面用註解寫版本" +
            "（`uses: actions/checkout@<sha> # v7`）。" +
            "標籤可以被發佈者重指，重指之後 CI 執行的內容會變，而沒有任何 diff 會顯示這件事 —— " +
            "而這些 action 拿得到 repo 與 secrets",
        );
      }
    }
  });
}
